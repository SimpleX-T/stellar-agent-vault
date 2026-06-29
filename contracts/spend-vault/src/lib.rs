#![no_std]
//! SpendVault — a budget-enforced spending account for autonomous agents on Stellar.
//!
//! The gap this fills: x402 (the agentic-payment protocol now live on Stellar) is
//! stateless per-request payment. It has no notion of a budget, an allowance, or a
//! spending limit. Hand an agent a raw key and it can drain the wallet.
//!
//! SpendVault separates two roles:
//!   - `owner`  : funds the vault and sets policy (cap per epoch, per-provider limits).
//!   - `agent`  : may only call `pay`, and only within the policy.
//!
//! Every payout transfers via the asset (token) contract — an inter-contract call —
//! and emits an event the frontend streams as a live spend feed.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Agent,
    Token,
    Cap,                    // i128: max spend per epoch (in token stroops)
    EpochLen,               // u64: epoch length in seconds
    Spent,                  // (u64 epoch_id, i128 amount): global spend this epoch
    ProviderLimit(Address), // i128: optional per-provider cap per epoch
    ProviderSpent(Address), // (u64 epoch_id, i128 amount): per-provider spend this epoch
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    BudgetExceeded = 4,
    ProviderLimitExceeded = 5,
    InsufficientBalance = 6,
    InvalidAmount = 7,
}

const PAID: Symbol = symbol_short!("paid");
const FUNDED: Symbol = symbol_short!("funded");
const POLICY: Symbol = symbol_short!("policy");
const WITHDRAW: Symbol = symbol_short!("withdraw");

#[contract]
pub struct SpendVault;

#[contractimpl]
impl SpendVault {
    /// One-time setup. The owner authorizes; agent is the key allowed to spend.
    pub fn init(
        env: Env,
        owner: Address,
        agent: Address,
        token: Address,
        cap_per_epoch: i128,
        epoch_len: u64,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Owner) {
            return Err(Error::AlreadyInitialized);
        }
        if cap_per_epoch <= 0 || epoch_len == 0 {
            return Err(Error::InvalidAmount);
        }
        // `init` is a one-time bootstrap that only sets the owner; in the factory
        // flow it runs atomically with deploy, and in a direct deploy the deployer
        // initializes immediately. Security-critical ops (pay/set_policy/withdraw)
        // still require auth, so no separate auth is needed here.
        let s = env.storage().instance();
        s.set(&DataKey::Owner, &owner);
        s.set(&DataKey::Agent, &agent);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Cap, &cap_per_epoch);
        s.set(&DataKey::EpochLen, &epoch_len);
        Ok(())
    }

    /// Anyone can top up the vault; funds move into the contract's token balance.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        Self::require_init(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        from.require_auth();
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::TokenClient::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
        env.events().publish((FUNDED, from), amount);
        Ok(())
    }

    /// Owner-only: update the per-epoch cap and epoch length.
    pub fn set_policy(env: Env, cap_per_epoch: i128, epoch_len: u64) -> Result<(), Error> {
        Self::require_owner(&env)?;
        if cap_per_epoch <= 0 || epoch_len == 0 {
            return Err(Error::InvalidAmount);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Cap, &cap_per_epoch);
        s.set(&DataKey::EpochLen, &epoch_len);
        env.events().publish((POLICY,), (cap_per_epoch, epoch_len));
        Ok(())
    }

    /// Owner-only: set (or raise/lower) a per-provider cap per epoch.
    pub fn set_provider_limit(env: Env, provider: Address, limit: i128) -> Result<(), Error> {
        Self::require_owner(&env)?;
        if limit < 0 {
            return Err(Error::InvalidAmount);
        }
        env.storage()
            .persistent()
            .set(&DataKey::ProviderLimit(provider), &limit);
        Ok(())
    }

    /// Owner-only: rotate the agent key.
    pub fn set_agent(env: Env, agent: Address) -> Result<(), Error> {
        Self::require_owner(&env)?;
        env.storage().instance().set(&DataKey::Agent, &agent);
        Ok(())
    }

    /// Agent-only: pay a provider, enforcing the global cap and any provider limit.
    /// Returns the remaining global budget for the current epoch.
    pub fn pay(env: Env, provider: Address, amount: i128) -> Result<i128, Error> {
        Self::require_init(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let agent: Address = env.storage().instance().get(&DataKey::Agent).unwrap();
        agent.require_auth();

        let epoch = Self::current_epoch(&env);
        let cap: i128 = env.storage().instance().get(&DataKey::Cap).unwrap();

        // Global budget check (epoch-windowed; stale epoch reads as zero spend).
        let spent = Self::spent_in(&env, &DataKey::Spent, epoch);
        if spent + amount > cap {
            return Err(Error::BudgetExceeded);
        }

        // Optional per-provider limit.
        let plimit: Option<i128> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderLimit(provider.clone()));
        let pspent = Self::spent_in(&env, &DataKey::ProviderSpent(provider.clone()), epoch);
        if let Some(limit) = plimit {
            if pspent + amount > limit {
                return Err(Error::ProviderLimitExceeded);
            }
        }

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let client = token::TokenClient::new(&env, &token);
        if client.balance(&env.current_contract_address()) < amount {
            return Err(Error::InsufficientBalance);
        }

        // Inter-contract call: move tokens out of the vault to the provider.
        client.transfer(&env.current_contract_address(), &provider, &amount);

        env.storage()
            .instance()
            .set(&DataKey::Spent, &(epoch, spent + amount));
        env.storage().persistent().set(
            &DataKey::ProviderSpent(provider.clone()),
            &(epoch, pspent + amount),
        );

        let remaining = cap - (spent + amount);
        env.events()
            .publish((PAID, provider), (amount, remaining, epoch));
        Ok(remaining)
    }

    /// Owner-only: reclaim funds from the vault.
    pub fn withdraw(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        Self::require_owner(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let client = token::TokenClient::new(&env, &token);
        if client.balance(&env.current_contract_address()) < amount {
            return Err(Error::InsufficientBalance);
        }
        client.transfer(&env.current_contract_address(), &to, &amount);
        env.events().publish((WITHDRAW, to), amount);
        Ok(())
    }

    // ---- views ----

    pub fn get_owner(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)
    }

    pub fn get_agent(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Agent)
            .ok_or(Error::NotInitialized)
    }

    pub fn get_cap(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Cap).unwrap_or(0)
    }

    pub fn get_epoch_len(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::EpochLen).unwrap_or(0)
    }

    /// Global amount spent in the current epoch.
    pub fn get_spent(env: Env) -> i128 {
        let epoch = Self::current_epoch(&env);
        Self::spent_in(&env, &DataKey::Spent, epoch)
    }

    /// Remaining global budget for the current epoch.
    pub fn get_remaining(env: Env) -> i128 {
        let cap = Self::get_cap(env.clone());
        cap - Self::get_spent(env)
    }

    pub fn get_balance(env: Env) -> i128 {
        match env
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Token)
        {
            Some(token) => {
                token::TokenClient::new(&env, &token).balance(&env.current_contract_address())
            }
            None => 0,
        }
    }

    // ---- internal helpers ----

    fn current_epoch(env: &Env) -> u64 {
        let len: u64 = env.storage().instance().get(&DataKey::EpochLen).unwrap_or(1);
        let len = if len == 0 { 1 } else { len };
        env.ledger().timestamp() / len
    }

    /// Read a `(epoch_id, amount)` counter; treat a different epoch as zero spend.
    fn spent_in(env: &Env, key: &DataKey, epoch: u64) -> i128 {
        let stored: Option<(u64, i128)> = match key {
            DataKey::Spent => env.storage().instance().get(key),
            _ => env.storage().persistent().get(key),
        };
        match stored {
            Some((e, amt)) if e == epoch => amt,
            _ => 0,
        }
    }

    fn require_init(env: &Env) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Owner) {
            Ok(())
        } else {
            Err(Error::NotInitialized)
        }
    }

    fn require_owner(env: &Env) -> Result<(), Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;
        owner.require_auth();
        Ok(())
    }
}

mod test;
