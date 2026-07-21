#![cfg(test)]
//! Unit tests for the AgentWallet custom account.
//!
//! Admin-op and view coverage uses the generated client under `mock_all_auths`.
//! The policy engine, though, lives in `__check_auth`, so those tests drive it
//! directly via `env.try_invoke_contract_check_auth` — signing real ed25519
//! signatures with `ed25519-dalek` exactly as on-chain tooling would, and
//! asserting the concrete `Error` each rejected context produces.

use super::*;
use ed25519_dalek::{Signer as _, SigningKey};
use soroban_sdk::{
    auth::{Context, ContractContext},
    symbol_short,
    testutils::{Address as _, Ledger as _},
    vec, Address, BytesN, Env, IntoVal, Symbol, Val, Vec,
};

// ---- helpers ----

fn signing_key(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

fn pubkey(env: &Env, sk: &SigningKey) -> BytesN<32> {
    BytesN::from_array(env, &sk.verifying_key().to_bytes())
}

/// One-signature `Vec<SignerSig>` over `payload`, as `__check_auth` expects.
fn sig_over(env: &Env, sk: &SigningKey, payload: &BytesN<32>) -> Vec<SignerSig> {
    let signature = sk.sign(&payload.to_array());
    vec![
        env,
        SignerSig {
            public_key: pubkey(env, sk),
            signature: BytesN::from_array(env, &signature.to_bytes()),
        },
    ]
}

/// A single `token.transfer(from = wallet, to, amount)` auth context.
fn transfer_ctx(env: &Env, token: &Address, wallet: &Address, to: &Address, amount: i128) -> Vec<Context> {
    let args: Vec<Val> = vec![
        env,
        wallet.into_val(env),
        to.into_val(env),
        amount.into_val(env),
    ];
    vec![
        env,
        Context::Contract(ContractContext {
            contract: token.clone(),
            fn_name: symbol_short!("transfer"),
            args,
        }),
    ]
}

/// A single admin op on the wallet itself (`fn_name` on the wallet contract).
fn self_ctx(env: &Env, wallet: &Address, fn_name: Symbol) -> Vec<Context> {
    vec![
        env,
        Context::Contract(ContractContext {
            contract: wallet.clone(),
            fn_name,
            args: vec![env],
        }),
    ]
}

fn check(
    env: &Env,
    wallet: &Address,
    payload: &BytesN<32>,
    sigs: Vec<SignerSig>,
    ctx: &Vec<Context>,
) -> Result<(), Result<Error, soroban_sdk::InvokeError>> {
    env.try_invoke_contract_check_auth::<Error>(wallet, payload, sigs.into_val(env), ctx)
}

fn payload(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[42u8; 32])
}

// ---- setup ----

struct Fixture {
    env: Env,
    wallet: Address,
    token: Address,
    admin: SigningKey,
    spender: SigningKey,
}

/// A wallet with an admin (constructor) + a registered spender, and a policy on
/// `token`: 250 max per transfer, 300 rolling cap over a 100s epoch.
fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(50);

    let admin = signing_key(1);
    let spender = signing_key(2);
    let admin_pk = pubkey(&env, &admin);

    let wallet = env.register(AgentWallet, (admin_pk,));
    let client = AgentWalletClient::new(&env, &wallet);

    client.add_signer(&pubkey(&env, &spender), &Role::Spender);

    let token = Address::generate(&env);
    client.set_policy(&token, &250, &300, &100);

    Fixture { env, wallet, token, admin, spender }
}

// ---- admin / view coverage ----

#[test]
fn constructor_registers_owner_as_admin() {
    let f = setup();
    let client = AgentWalletClient::new(&f.env, &f.wallet);
    assert_eq!(client.signer_role(&pubkey(&f.env, &f.admin)), Some(Role::Admin));
    assert_eq!(client.signer_role(&pubkey(&f.env, &f.spender)), Some(Role::Spender));
}

#[test]
fn views_reflect_policy_and_allowlist() {
    let f = setup();
    let client = AgentWalletClient::new(&f.env, &f.wallet);
    let p = client.policy(&f.token);
    assert_eq!(p.max_per_transfer, 250);
    assert_eq!(p.epoch_cap, 300);
    assert_eq!(p.epoch_len, 100);
    assert_eq!(client.remaining(&f.token), 300);
    assert!(!client.allowlist_enforced());

    client.set_allowlist_enforced(&true);
    assert!(client.allowlist_enforced());
    let r = Address::generate(&f.env);
    client.set_recipient(&r, &true);
    assert!(client.recipient_allowed(&r));
}

// ---- __check_auth: happy path + spend accounting ----

#[test]
fn spender_within_policy_is_approved_and_recorded() {
    let f = setup();
    let client = AgentWalletClient::new(&f.env, &f.wallet);
    let to = Address::generate(&f.env);
    let pl = payload(&f.env);

    let ctx = transfer_ctx(&f.env, &f.token, &f.wallet, &to, 200);
    assert!(check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &ctx).is_ok());

    // The rolling counter advanced by the approved amount.
    assert_eq!(client.spent(&f.token), 200);
    assert_eq!(client.remaining(&f.token), 100);
}

#[test]
fn admin_signature_also_authorizes_a_transfer() {
    let f = setup();
    let to = Address::generate(&f.env);
    let pl = payload(&f.env);
    let ctx = transfer_ctx(&f.env, &f.token, &f.wallet, &to, 100);
    assert!(check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.admin, &pl), &ctx).is_ok());
}

// ---- __check_auth: rejection paths ----

#[test]
fn per_transfer_cap_is_enforced() {
    let f = setup();
    let to = Address::generate(&f.env);
    let pl = payload(&f.env);
    let ctx = transfer_ctx(&f.env, &f.token, &f.wallet, &to, 251);
    assert_eq!(
        check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &ctx),
        Err(Ok(Error::PerTransferExceeded)),
    );
}

#[test]
fn rolling_epoch_cap_blocks_then_resets_next_window() {
    let f = setup();
    let client = AgentWalletClient::new(&f.env, &f.wallet);
    let to = Address::generate(&f.env);
    let pl = payload(&f.env);

    // Spend 200 (ok), then 200 more would hit 400 > 300 cap → blocked.
    let ctx = transfer_ctx(&f.env, &f.token, &f.wallet, &to, 200);
    assert!(check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &ctx).is_ok());
    assert_eq!(
        check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &ctx),
        Err(Ok(Error::EpochCapExceeded)),
    );

    // A 100 transfer fits the remaining budget (200 + 100 = 300).
    let ctx100 = transfer_ctx(&f.env, &f.token, &f.wallet, &to, 100);
    assert!(check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &ctx100).is_ok());
    assert_eq!(client.spent(&f.token), 300);

    // Roll into the next epoch window — the counter resets with no keeper.
    f.env.ledger().set_timestamp(160); // 160/100 = epoch 1, was 50/100 = epoch 0
    assert_eq!(client.spent(&f.token), 0);
    let ctx250 = transfer_ctx(&f.env, &f.token, &f.wallet, &to, 250);
    assert!(check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &ctx250).is_ok());
    assert_eq!(client.spent(&f.token), 250);
}

#[test]
fn allowlist_blocks_unlisted_recipient() {
    let f = setup();
    let client = AgentWalletClient::new(&f.env, &f.wallet);
    client.set_allowlist_enforced(&true);

    let good = Address::generate(&f.env);
    let bad = Address::generate(&f.env);
    client.set_recipient(&good, &true);
    let pl = payload(&f.env);

    let bad_ctx = transfer_ctx(&f.env, &f.token, &f.wallet, &bad, 100);
    assert_eq!(
        check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &bad_ctx),
        Err(Ok(Error::RecipientNotAllowed)),
    );

    let good_ctx = transfer_ctx(&f.env, &f.token, &f.wallet, &good, 100);
    assert!(check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &good_ctx).is_ok());
}

#[test]
fn unknown_signer_is_rejected() {
    let f = setup();
    let stranger = signing_key(99);
    let to = Address::generate(&f.env);
    let pl = payload(&f.env);
    let ctx = transfer_ctx(&f.env, &f.token, &f.wallet, &to, 100);
    assert_eq!(
        check(&f.env, &f.wallet, &pl, sig_over(&f.env, &stranger, &pl), &ctx),
        Err(Ok(Error::UnknownSigner)),
    );
}

#[test]
fn disabled_token_is_rejected() {
    let f = setup();
    let other_token = Address::generate(&f.env); // never given a policy
    let to = Address::generate(&f.env);
    let pl = payload(&f.env);
    let ctx = transfer_ctx(&f.env, &other_token, &f.wallet, &to, 10);
    assert_eq!(
        check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &ctx),
        Err(Ok(Error::TokenDisabled)),
    );
}

// ---- role separation on admin ops ----

#[test]
fn spender_cannot_perform_admin_op() {
    let f = setup();
    let pl = payload(&f.env);
    let ctx = self_ctx(&f.env, &f.wallet, symbol_short!("set_agent"));
    assert_eq!(
        check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.spender, &pl), &ctx),
        Err(Ok(Error::AdminRequired)),
    );
}

#[test]
fn admin_can_perform_admin_op() {
    let f = setup();
    let pl = payload(&f.env);
    let ctx = self_ctx(&f.env, &f.wallet, Symbol::new(&f.env, "set_policy"));
    assert!(check(&f.env, &f.wallet, &pl, sig_over(&f.env, &f.admin, &pl), &ctx).is_ok());
}
