#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

struct Setup<'a> {
    env: Env,
    owner: Address,
    agent: Address,
    provider: Address,
    token_admin: token::StellarAssetClient<'a>,
    token: token::TokenClient<'a>,
    vault: SpendVaultClient<'a>,
    vault_id: Address,
}

fn setup(cap: i128, epoch_len: u64) -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let provider = Address::generate(&env);

    // Register a Stellar Asset Contract to act as the payment token.
    let sac = env.register_stellar_asset_contract_v2(owner.clone());
    let token_addr = sac.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_addr);
    let token = token::TokenClient::new(&env, &token_addr);

    let vault_id = env.register(SpendVault, ());
    let vault = SpendVaultClient::new(&env, &vault_id);
    vault.init(&owner, &agent, &token_addr, &cap, &epoch_len);

    Setup {
        env,
        owner,
        agent,
        provider,
        token_admin,
        token,
        vault,
        vault_id,
    }
}

#[test]
fn fund_and_pay_within_budget() {
    let s = setup(1_000, 100);
    // Owner mints to themselves, then deposits into the vault.
    s.token_admin.mint(&s.owner, &10_000);
    s.vault.deposit(&s.owner, &5_000);
    assert_eq!(s.token.balance(&s.vault_id), 5_000);
    assert_eq!(s.vault.get_balance(), 5_000);

    let remaining = s.vault.pay(&s.provider, &400);
    assert_eq!(remaining, 600); // cap 1000 - 400
    assert_eq!(s.token.balance(&s.provider), 400);
    assert_eq!(s.vault.get_spent(), 400);
    assert_eq!(s.vault.get_remaining(), 600);
}

#[test]
fn budget_exceeded_is_rejected() {
    let s = setup(1_000, 100);
    s.token_admin.mint(&s.owner, &10_000);
    s.vault.deposit(&s.owner, &5_000);

    s.vault.pay(&s.provider, &800);
    // 800 + 300 > cap(1000) -> rejected, no funds move.
    let err = s.vault.try_pay(&s.provider, &300);
    assert_eq!(err, Err(Ok(Error::BudgetExceeded)));
    assert_eq!(s.vault.get_spent(), 800);
    assert_eq!(s.token.balance(&s.provider), 800);
}

#[test]
fn provider_limit_is_enforced() {
    let s = setup(10_000, 100);
    s.token_admin.mint(&s.owner, &50_000);
    s.vault.deposit(&s.owner, &20_000);

    // Global cap is generous, but this provider is capped at 500.
    s.vault.set_provider_limit(&s.provider, &500);
    s.vault.pay(&s.provider, &500);
    let err = s.vault.try_pay(&s.provider, &1);
    assert_eq!(err, Err(Ok(Error::ProviderLimitExceeded)));
    assert_eq!(s.token.balance(&s.provider), 500);
}

#[test]
fn budget_resets_next_epoch() {
    let s = setup(1_000, 100);
    s.token_admin.mint(&s.owner, &10_000);
    s.vault.deposit(&s.owner, &5_000);

    s.vault.pay(&s.provider, &1_000); // exhaust epoch budget
    assert_eq!(s.vault.get_remaining(), 0);

    // Advance time past one epoch window -> budget windows roll over.
    s.env.ledger().with_mut(|l| l.timestamp += 150);
    assert_eq!(s.vault.get_spent(), 0);
    let remaining = s.vault.pay(&s.provider, &200);
    assert_eq!(remaining, 800);
}

#[test]
fn insufficient_balance_is_rejected() {
    let s = setup(10_000, 100);
    s.token_admin.mint(&s.owner, &10_000);
    s.vault.deposit(&s.owner, &100); // only 100 in the vault
    let err = s.vault.try_pay(&s.provider, &500);
    assert_eq!(err, Err(Ok(Error::InsufficientBalance)));
}

#[test]
fn only_owner_can_withdraw() {
    let s = setup(10_000, 100);
    s.token_admin.mint(&s.owner, &10_000);
    s.vault.deposit(&s.owner, &5_000);

    s.vault.withdraw(&s.owner, &2_000);
    assert_eq!(s.token.balance(&s.owner), 7_000); // 10000 - 5000 deposit + 2000 back
    assert_eq!(s.vault.get_balance(), 3_000);
}

#[test]
fn double_init_is_rejected() {
    let s = setup(1_000, 100);
    let err = s.vault.try_init(&s.owner, &s.agent, &s.vault_id, &1_000, &100);
    assert_eq!(err, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn invalid_amounts_rejected() {
    let s = setup(1_000, 100);
    s.token_admin.mint(&s.owner, &10_000);
    s.vault.deposit(&s.owner, &5_000);
    assert_eq!(s.vault.try_pay(&s.provider, &0), Err(Ok(Error::InvalidAmount)));
    assert_eq!(
        s.vault.try_pay(&s.provider, &-5),
        Err(Ok(Error::InvalidAmount))
    );
}
