#![no_std]
//! WalletFactory — deploys AgentWallet smart accounts and keeps an on-chain
//! registry of every wallet an operator has created.
//!
//! `create_wallet` deploys a fresh [`AgentWallet`] instance from a stored wasm
//! hash, passing the operator's ed25519 public key as the constructor's initial
//! Admin signer. The registry (`wallets_of`, `all_wallets`) is stored on-chain
//! rather than in an off-chain database, so the operator console can enumerate
//! its fleet directly from ledger state — RPC event history is only retained for
//! a few days, so events alone can't reliably list older wallets.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, vec, Address, BytesN, Env,
    Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    WasmHash,
    Count,
    Operator(Address), // operator -> Vec<Address> of the wallets they created
    AllWallets,        // global registry: every wallet ever created
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
}

/// A new AgentWallet was deployed for `operator`.
#[contractevent]
#[derive(Clone)]
pub struct WalletCreated {
    #[topic]
    pub operator: Address,
    pub wallet: Address,
}

#[contract]
pub struct WalletFactory;

#[contractimpl]
impl WalletFactory {
    /// One-time setup: store the admin and the AgentWallet wasm hash to clone.
    pub fn init(env: Env, admin: Address, agent_wallet_wasm: BytesN<32>) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::WasmHash, &agent_wallet_wasm);
        s.set(&DataKey::Count, &0u32);
        Ok(())
    }

    /// Deploy a new AgentWallet whose initial Admin signer is `owner_pubkey`
    /// (the operator's raw ed25519 key, decoded from its `G…` StrKey off-chain).
    /// Returns the deployed wallet's contract address.
    pub fn create_wallet(
        env: Env,
        operator: Address,
        owner_pubkey: BytesN<32>,
    ) -> Result<Address, Error> {
        if !env.storage().instance().has(&DataKey::WasmHash) {
            return Err(Error::NotInitialized);
        }
        operator.require_auth();

        let wasm: BytesN<32> = env.storage().instance().get(&DataKey::WasmHash).unwrap();
        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);

        // Deterministic, unique salt -> deterministic child address.
        let mut salt_bytes = [0u8; 32];
        salt_bytes[0..4].copy_from_slice(&count.to_be_bytes());
        let salt = BytesN::from_array(&env, &salt_bytes);

        // Deploy the child and run its __constructor(owner_pubkey) atomically.
        let deployed = env
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm, (owner_pubkey,));

        // Per-operator registry.
        let mut mine: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Operator(operator.clone()))
            .unwrap_or(vec![&env]);
        mine.push_back(deployed.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Operator(operator.clone()), &mine);

        // Global registry.
        let mut all: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::AllWallets)
            .unwrap_or(vec![&env]);
        all.push_back(deployed.clone());
        env.storage().persistent().set(&DataKey::AllWallets, &all);

        env.storage().instance().set(&DataKey::Count, &(count + 1));

        WalletCreated {
            operator,
            wallet: deployed.clone(),
        }
        .publish(&env);
        Ok(deployed)
    }

    pub fn wallets_of(env: Env, operator: Address) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Operator(operator))
            .unwrap_or(vec![&env])
    }

    /// Every wallet ever created through this factory. Backs the admin dashboard.
    pub fn all_wallets(env: Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::AllWallets)
            .unwrap_or(vec![&env])
    }

    /// The factory admin (operator). Used to gate the admin dashboard on-chain.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn total(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}

mod test;
