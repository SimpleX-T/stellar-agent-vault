#![no_std]
//! AgentWallet — a Soroban custom-account smart wallet for autonomous AI agents.
//!
//! Each agent gets one instance of this contract, and the instance *is* the
//! wallet: it holds the funds and authorizes its own outgoing transfers. Because
//! it implements [`CustomAccountInterface`], the spending policy is enforced in
//! the authorization path (`__check_auth`) over *standard* `token.transfer`
//! calls — not behind a bespoke `pay()` entrypoint. An agent can therefore use
//! ordinary Stellar tooling to move funds, and still be unable to exceed policy.
//! A relayer submits and pays the fee, so the wallet never has to hold XLM for
//! gas ("gasless").
//!
//! ## What policy this enforces (all on-chain, all inside `__check_auth`)
//!   - **Signer roles.** `Admin` signers have full control (manage signers,
//!     policy, allowlist, arbitrary calls). `Spender` signers may only move
//!     funds, and only within policy.
//!   - **Per-token, per-transfer cap.** A single transfer may not exceed
//!     `max_per_transfer` for that token. A token with no policy is disabled.
//!   - **Rolling per-epoch cap.** Total spend of a token inside the current
//!     time window (`epoch_len` seconds) may not exceed `epoch_cap`. The counter
//!     resets automatically when the window rolls over — no cron, no keeper.
//!     This is the piece plain per-transfer wallets lack.
//!   - **Recipient allowlist.** When enforced, funds may only go to allowlisted
//!     recipients.
//!
//! The rolling counter is *written from within `__check_auth`*, which is the
//! canonical Soroban pattern for a spending-limit account: the authorization
//! path both checks and records spend atomically with the transfer it approves.
//! If any check fails, `__check_auth` returns `Err` and the whole transaction —
//! including the counter write — is rolled back.

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::Hash,
    symbol_short, Address, Bytes, BytesN, Env, TryIntoVal, Vec,
};

#[contract]
pub struct AgentWallet;

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Role {
    Spender = 0,
    Admin = 1,
}

/// Per-token spending policy. A token with no `Policy` entry is disabled: its
/// `max_per_transfer` reads as 0 and every transfer is rejected.
#[contracttype]
#[derive(Clone)]
pub struct TokenPolicy {
    /// Max amount a single `transfer` may move (0 disables the token).
    pub max_per_transfer: i128,
    /// Max total spend within one epoch window (0 = no rolling cap).
    pub epoch_cap: i128,
    /// Epoch window length in seconds (0 = no rolling cap).
    pub epoch_len: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// ed25519 public key -> Role.
    Signer(BytesN<32>),
    /// token contract -> TokenPolicy.
    Policy(Address),
    /// token contract -> (epoch_id, amount) spent so far this epoch.
    Spent(Address),
    /// when true, transfer recipients must be present in the allowlist.
    EnforceAllowlist,
    /// recipient address -> allowed.
    Recipient(Address),
}

/// A signature over the authorization payload. The field names match the ScVal
/// the Stellar SDK's `authorizeEntry` helper produces (`{ public_key, signature
/// }`), so standard tooling — Freighter's `signAuthEntry`, the SDK, our relayer
/// service — can sign for this wallet with no custom encoding.
#[contracttype]
#[derive(Clone)]
pub struct SignerSig {
    pub public_key: BytesN<32>,
    pub signature: BytesN<64>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotAuthorized = 1,
    UnknownSigner = 2,
    InvalidArgs = 3,
    InvalidAmount = 4,
    TokenDisabled = 5,
    PerTransferExceeded = 6,
    EpochCapExceeded = 7,
    RecipientNotAllowed = 8,
    AdminRequired = 9,
}

// Admin-op events (published from the ordinary entrypoints, never from
// __check_auth). Spend itself is observed off the token's own `transfer` event.

/// A signer was added, updated, or removed. `role`: 1 = Admin, 0 = Spender,
/// -1 = removed.
#[contractevent]
#[derive(Clone)]
pub struct SignerUpdated {
    #[topic]
    pub signer: BytesN<32>,
    pub role: i32,
}

/// A token's spending policy changed.
#[contractevent]
#[derive(Clone)]
pub struct PolicyUpdated {
    #[topic]
    pub token: Address,
    pub max_per_transfer: i128,
    pub epoch_cap: i128,
    pub epoch_len: u64,
}

/// Recipient-allowlist enforcement was toggled.
#[contractevent]
#[derive(Clone)]
pub struct AllowlistToggled {
    pub enforced: bool,
}

/// A recipient was added to or removed from the allowlist.
#[contractevent]
#[derive(Clone)]
pub struct RecipientUpdated {
    #[topic]
    pub recipient: Address,
    pub allowed: bool,
}

#[contractimpl]
impl AgentWallet {
    /// Deploy-time constructor: registers the first owner key as an Admin signer.
    /// `owner` is a raw ed25519 public key (32 bytes) — e.g. the operator's own
    /// Stellar account key, decoded from its `G…` StrKey.
    pub fn __constructor(env: Env, owner: BytesN<32>) {
        env.storage()
            .persistent()
            .set(&DataKey::Signer(owner.clone()), &Role::Admin);
        SignerUpdated { signer: owner, role: Role::Admin as i32 }.publish(&env);
    }

    // ---- Admin operations. Each requires this wallet's own auth, which routes
    //      through __check_auth and there demands a valid Admin signature. ----

    /// Add or update a signer with the given role.
    pub fn add_signer(env: Env, signer: BytesN<32>, role: Role) {
        env.current_contract_address().require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Signer(signer.clone()), &role);
        SignerUpdated { signer, role: role as i32 }.publish(&env);
    }

    /// Remove a signer.
    pub fn remove_signer(env: Env, signer: BytesN<32>) {
        env.current_contract_address().require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::Signer(signer.clone()));
        SignerUpdated { signer, role: -1 }.publish(&env);
    }

    /// Set the full spending policy for a token: per-transfer cap, rolling epoch
    /// cap, and epoch length. `max_per_transfer = 0` disables the token.
    pub fn set_policy(
        env: Env,
        token: Address,
        max_per_transfer: i128,
        epoch_cap: i128,
        epoch_len: u64,
    ) -> Result<(), Error> {
        env.current_contract_address().require_auth();
        if max_per_transfer < 0 || epoch_cap < 0 {
            return Err(Error::InvalidAmount);
        }
        let policy = TokenPolicy {
            max_per_transfer,
            epoch_cap,
            epoch_len,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Policy(token.clone()), &policy);
        PolicyUpdated { token, max_per_transfer, epoch_cap, epoch_len }.publish(&env);
        Ok(())
    }

    /// Toggle recipient-allowlist enforcement.
    pub fn set_allowlist_enforced(env: Env, enforced: bool) {
        env.current_contract_address().require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::EnforceAllowlist, &enforced);
        AllowlistToggled { enforced }.publish(&env);
    }

    /// Add or remove a recipient from the allowlist.
    pub fn set_recipient(env: Env, recipient: Address, allowed: bool) {
        env.current_contract_address().require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Recipient(recipient.clone()), &allowed);
        RecipientUpdated { recipient, allowed }.publish(&env);
    }

    // ---- Views (read-only, no auth) ----

    pub fn signer_role(env: Env, signer: BytesN<32>) -> Option<Role> {
        env.storage().persistent().get(&DataKey::Signer(signer))
    }

    pub fn policy(env: Env, token: Address) -> TokenPolicy {
        env.storage()
            .persistent()
            .get(&DataKey::Policy(token))
            .unwrap_or(TokenPolicy {
                max_per_transfer: 0,
                epoch_cap: 0,
                epoch_len: 0,
            })
    }

    /// Amount of `token` spent so far in the current epoch (0 if the window has
    /// rolled over since the last spend).
    pub fn spent(env: Env, token: Address) -> i128 {
        let policy = Self::policy(env.clone(), token.clone());
        let epoch = current_epoch(&env, policy.epoch_len);
        spent_in_epoch(&env, &token, epoch)
    }

    /// Remaining rolling budget for `token` this epoch (0 if no epoch cap set).
    pub fn remaining(env: Env, token: Address) -> i128 {
        let policy = Self::policy(env.clone(), token.clone());
        if policy.epoch_cap == 0 {
            return 0;
        }
        let epoch = current_epoch(&env, policy.epoch_len);
        policy.epoch_cap - spent_in_epoch(&env, &token, epoch)
    }

    pub fn allowlist_enforced(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::EnforceAllowlist)
            .unwrap_or(false)
    }

    pub fn recipient_allowed(env: Env, recipient: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Recipient(recipient))
            .unwrap_or(false)
    }
}

#[contractimpl]
impl CustomAccountInterface for AgentWallet {
    type Signature = Vec<SignerSig>;
    type Error = Error;

    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signatures: Vec<SignerSig>,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        // 1) Every provided signature must come from a registered signer and be
        //    valid over the payload. Track the highest role we hold a valid
        //    signature for.
        let msg = Bytes::from_array(&env, &signature_payload.to_array());
        let mut is_admin = false;
        let mut any_valid = false;

        for sig in signatures.iter() {
            let role: Role = env
                .storage()
                .persistent()
                .get(&DataKey::Signer(sig.public_key.clone()))
                .ok_or(Error::UnknownSigner)?;
            // Panics if the signature is invalid — a forged signature can never
            // reach the policy checks below.
            env.crypto()
                .ed25519_verify(&sig.public_key, &msg, &sig.signature);
            any_valid = true;
            if role == Role::Admin {
                is_admin = true;
            }
        }
        if !any_valid {
            return Err(Error::NotAuthorized);
        }

        // 2) Enforce policy on each authorized context.
        let me = env.current_contract_address();
        let transfer_fn = symbol_short!("transfer");

        for ctx in auth_contexts.iter() {
            match ctx {
                Context::Contract(c) => {
                    if c.contract == me {
                        // An admin operation on the wallet itself.
                        if !is_admin {
                            return Err(Error::AdminRequired);
                        }
                    } else if c.fn_name == transfer_fn {
                        // token.transfer(from, to, amount)
                        let from: Address = c
                            .args
                            .get(0)
                            .ok_or(Error::InvalidArgs)?
                            .try_into_val(&env)
                            .map_err(|_| Error::InvalidArgs)?;
                        if from == me {
                            let to: Address = c
                                .args
                                .get(1)
                                .ok_or(Error::InvalidArgs)?
                                .try_into_val(&env)
                                .map_err(|_| Error::InvalidArgs)?;
                            let amount: i128 = c
                                .args
                                .get(2)
                                .ok_or(Error::InvalidArgs)?
                                .try_into_val(&env)
                                .map_err(|_| Error::InvalidArgs)?;
                            // Spending our own funds is allowed for any valid
                            // signer, but only within policy.
                            enforce_spend(&env, &c.contract, &to, amount)?;
                        } else if !is_admin {
                            // Authorizing a transfer of funds we are not the
                            // source of is an admin-only action.
                            return Err(Error::AdminRequired);
                        }
                    } else if !is_admin {
                        // Any other external contract call requires admin.
                        return Err(Error::AdminRequired);
                    }
                }
                // Contract creation (or any non-contract context) requires admin.
                _ => {
                    if !is_admin {
                        return Err(Error::AdminRequired);
                    }
                }
            }
        }

        Ok(())
    }
}

/// The current epoch id for a window length. `len == 0` means "no rolling
/// window"; we return 0 and callers skip the epoch cap entirely.
fn current_epoch(env: &Env, len: u64) -> u64 {
    if len == 0 {
        0
    } else {
        env.ledger().timestamp() / len
    }
}

/// Read the `(epoch_id, amount)` spend counter for a token, treating a stale
/// epoch as zero spend so the window resets without any keeper.
fn spent_in_epoch(env: &Env, token: &Address, epoch: u64) -> i128 {
    let stored: Option<(u64, i128)> = env.storage().persistent().get(&DataKey::Spent(token.clone()));
    match stored {
        Some((e, amt)) if e == epoch => amt,
        _ => 0,
    }
}

/// Enforce per-transfer cap, rolling epoch cap, and (if enforced) the recipient
/// allowlist for a single `transfer`. On success, records the new epoch spend.
///
/// Called only from `__check_auth`; a returned `Err` aborts the whole
/// transaction, so the counter write below is never observed for a rejected
/// transfer.
fn enforce_spend(env: &Env, token: &Address, to: &Address, amount: i128) -> Result<(), Error> {
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    let policy: TokenPolicy = env
        .storage()
        .persistent()
        .get(&DataKey::Policy(token.clone()))
        .ok_or(Error::TokenDisabled)?;
    if policy.max_per_transfer <= 0 {
        return Err(Error::TokenDisabled);
    }
    if amount > policy.max_per_transfer {
        return Err(Error::PerTransferExceeded);
    }

    // Rolling epoch cap (only when both a cap and a window are configured).
    let track_epoch = policy.epoch_cap > 0 && policy.epoch_len > 0;
    let epoch = current_epoch(env, policy.epoch_len);
    let spent = if track_epoch {
        let spent = spent_in_epoch(env, token, epoch);
        if spent + amount > policy.epoch_cap {
            return Err(Error::EpochCapExceeded);
        }
        spent
    } else {
        0
    };

    // Recipient allowlist.
    let enforced: bool = env
        .storage()
        .persistent()
        .get(&DataKey::EnforceAllowlist)
        .unwrap_or(false);
    if enforced {
        let allowed: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Recipient(to.clone()))
            .unwrap_or(false);
        if !allowed {
            return Err(Error::RecipientNotAllowed);
        }
    }

    // Record spend last, so a rejected transfer never advances the counter.
    if track_epoch {
        env.storage()
            .persistent()
            .set(&DataKey::Spent(token.clone()), &(epoch, spent + amount));
    }

    Ok(())
}

mod test;
