#![cfg(test)]
//! Deploys a real AgentWallet through the factory and checks the on-chain
//! registry. Requires the agent-wallet wasm to be built first
//! (`stellar contract build`), which the workspace CI does before tests.

use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

// The compiled child contract, embedded so the factory can upload + clone it.
mod wallet {
    use soroban_sdk::auth::Context;
    soroban_sdk::contractimport!(
        file = "../../target/wasm32v1-none/release/agent_wallet.wasm"
    );
}

#[test]
fn create_wallet_deploys_and_registers() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(wallet::WASM);

    let factory_id = env.register(WalletFactory, ());
    let factory = WalletFactoryClient::new(&env, &factory_id);
    factory.init(&admin, &wasm_hash);

    let operator = Address::generate(&env);
    let owner_pubkey = BytesN::from_array(&env, &[3u8; 32]);

    let wallet_addr = factory.create_wallet(&operator, &owner_pubkey);

    // Registry reflects the new wallet.
    assert_eq!(factory.total(), 1);
    assert_eq!(factory.all_wallets().len(), 1);
    assert_eq!(factory.wallets_of(&operator).get(0), Some(wallet_addr.clone()));
    assert_eq!(factory.admin(), admin);

    // The deployed child really is an AgentWallet: the operator key is its Admin.
    let w = wallet::Client::new(&env, &wallet_addr);
    assert_eq!(w.signer_role(&owner_pubkey), Some(wallet::Role::Admin));

    // A second wallet for the same operator lands in both registries.
    let wallet2 = factory.create_wallet(&operator, &owner_pubkey);
    assert_eq!(factory.total(), 2);
    assert_eq!(factory.wallets_of(&operator).len(), 2);
    assert_ne!(wallet_addr, wallet2);
}
