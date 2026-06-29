#!/usr/bin/env bash
# Build, deploy, and initialize SpendVault + VaultFactory on Stellar testnet,
# then demonstrate a budget-bound agent payment. Idempotent-ish: re-running
# generates fresh keys/contracts.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
NATIVE_TOKEN="$(stellar contract id asset --asset native --network "$NETWORK")"
CAP="${CAP:-1000000000}"        # 100 XLM (stroops)
EPOCH="${EPOCH:-86400}"         # 1 day

echo "▸ Building contracts…"
stellar contract build

echo "▸ Ensuring funded identities (deployer, agent, provider)…"
for k in deployer agent provider; do
  stellar keys generate "$k" --network "$NETWORK" --fund --overwrite >/dev/null 2>&1 || \
    stellar keys generate "$k" --network "$NETWORK" --fund >/dev/null 2>&1 || true
done
DEP="$(stellar keys address deployer)"
AG="$(stellar keys address agent)"
PROV="$(stellar keys address provider)"

WASM=target/wasm32v1-none/release/spend_vault.wasm
FACTORY_WASM=target/wasm32v1-none/release/vault_factory.wasm

echo "▸ Deploying SpendVault…"
VAULT="$(stellar contract deploy --wasm "$WASM" --source deployer --network "$NETWORK" | tail -1)"
stellar contract invoke --id "$VAULT" --source deployer --network "$NETWORK" -- \
  init --owner "$DEP" --agent "$AG" --token "$NATIVE_TOKEN" --cap_per_epoch "$CAP" --epoch_len "$EPOCH"

echo "▸ Funding the vault with 50 XLM and paying a provider 5 XLM as the agent…"
stellar contract invoke --id "$VAULT" --source deployer --network "$NETWORK" -- \
  deposit --from "$DEP" --amount 500000000
stellar contract invoke --id "$VAULT" --source agent --network "$NETWORK" -- \
  pay --provider "$PROV" --amount 50000000

echo "▸ Deploying VaultFactory and creating a child vault…"
HASH="$(stellar contract upload --wasm "$WASM" --source deployer --network "$NETWORK" | tail -1)"
FACTORY="$(stellar contract deploy --wasm "$FACTORY_WASM" --source deployer --network "$NETWORK" | tail -1)"
stellar contract invoke --id "$FACTORY" --source deployer --network "$NETWORK" -- \
  init --admin "$DEP" --spend_vault_wasm "$HASH"
stellar contract invoke --id "$FACTORY" --source deployer --network "$NETWORK" -- \
  create_vault --owner "$DEP" --agent "$AG" --token "$NATIVE_TOKEN" --cap_per_epoch "$CAP" --epoch_len "$EPOCH"

echo
echo "✅ Done."
echo "   SpendVault:   $VAULT"
echo "   VaultFactory: $FACTORY"
echo "   Token:        $NATIVE_TOKEN"
echo "Set web/.env -> VITE_CONTRACT_ID=$VAULT, VITE_FACTORY_ID=$FACTORY"
