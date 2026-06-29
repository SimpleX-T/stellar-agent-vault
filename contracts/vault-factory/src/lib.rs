#![no_std]
//! VaultFactory — deploys and initializes per-owner SpendVault instances.
//!
//! `create_vault` performs two inter-contract operations in one transaction:
//!   1. deploys a new SpendVault from a stored wasm hash, and
//!   2. invokes the child's `init` to configure owner/agent/token/policy.
//!
//! This gives every owner their own isolated, budget-bound vault from the UI.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, vec, Address, BytesN, Env,
    IntoVal, Symbol, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    WasmHash,
    Count,
    Owner(Address), // owner -> Vec<Address> of their vaults
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
}

const CREATED: Symbol = symbol_short!("created");

#[contract]
pub struct VaultFactory;

#[contractimpl]
impl VaultFactory {
    /// One-time setup: store the admin and the SpendVault wasm hash to clone.
    pub fn init(env: Env, admin: Address, spend_vault_wasm: BytesN<32>) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::WasmHash, &spend_vault_wasm);
        s.set(&DataKey::Count, &0u32);
        Ok(())
    }

    /// Deploy + initialize a new SpendVault owned by `owner`. Returns its address.
    pub fn create_vault(
        env: Env,
        owner: Address,
        agent: Address,
        token: Address,
        cap_per_epoch: i128,
        epoch_len: u64,
    ) -> Result<Address, Error> {
        if !env.storage().instance().has(&DataKey::WasmHash) {
            return Err(Error::NotInitialized);
        }
        if cap_per_epoch <= 0 || epoch_len == 0 {
            return Err(Error::InvalidAmount);
        }
        owner.require_auth();

        let wasm: BytesN<32> = env.storage().instance().get(&DataKey::WasmHash).unwrap();
        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);

        // Deterministic, unique salt -> deterministic child address.
        let mut salt_bytes = [0u8; 32];
        salt_bytes[0..4].copy_from_slice(&count.to_be_bytes());
        let salt = BytesN::from_array(&env, &salt_bytes);

        // Inter-contract op #1: deploy the child from the stored wasm hash.
        let deployed = env
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm, ());

        // Inter-contract op #2: initialize the freshly deployed vault.
        let _: () = env.invoke_contract(
            &deployed,
            &Symbol::new(&env, "init"),
            (
                owner.clone(),
                agent,
                token,
                cap_per_epoch,
                epoch_len,
            )
                .into_val(&env),
        );

        let mut list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(owner.clone()))
            .unwrap_or(vec![&env]);
        list.push_back(deployed.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Owner(owner.clone()), &list);
        env.storage().instance().set(&DataKey::Count, &(count + 1));

        env.events().publish((CREATED, owner), deployed.clone());
        Ok(deployed)
    }

    pub fn vaults_of(env: Env, owner: Address) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Owner(owner))
            .unwrap_or(vec![&env])
    }

    pub fn total(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}
