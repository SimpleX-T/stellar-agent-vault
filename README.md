# SpendVault — a budget-enforced spending account for AI agents on Stellar

> Give an autonomous agent a wallet it **can't** drain. SpendVault is an on-chain
> allowance account: the owner funds it and sets a policy (cap per epoch + per-provider
> limits); the agent may only spend **within** that policy. Every payout is an
> inter-contract token transfer that emits an event, streamed live in the UI.

Built for the **Stellar Journey to Mastery** monthly builder challenge (White → Orange belt).

---

## Why this exists

[x402](https://developers.stellar.org/docs/build/agentic-payments/x402) — the agentic
payment protocol now live on Stellar — lets an agent pay per HTTP request via Soroban
authorization. It's stateless: there is no concept of a **budget**, an **allowance**, or a
**spending limit**. Hand an agent a raw key and it can spend everything.

SpendVault adds the missing primitive: **bounded autonomy**.

| Role | Can do |
|------|--------|
| `owner` | fund the vault, set the per-epoch cap, set per-provider limits, rotate the agent key, withdraw |
| `agent` | call `pay(provider, amount)` — and only within policy |

When the agent tries to overspend, the contract rejects it (`BudgetExceeded` /
`ProviderLimitExceeded`). The owner's funds are safe by construction.

---

## Architecture

```
┌────────────┐   fund / set policy    ┌─────────────────┐   transfer (inter-contract)   ┌──────────────┐
│   Owner    │ ─────────────────────▶ │                 │ ────────────────────────────▶ │  Provider    │
│  (wallet)  │                        │   SpendVault    │                               │  (payee)     │
└────────────┘                        │  (Soroban)      │                               └──────────────┘
┌────────────┐   pay(provider,amt)    │                 │        emits Paid event
│   Agent    │ ─────────────────────▶ │  budget checks  │ ──────────────┐
│  (key)     │                        └─────────────────┘               ▼
└────────────┘                                                    ┌──────────────┐
                                                                  │  Live feed   │
                                                                  │  (frontend)  │
                                                                  └──────────────┘
```

- **Contract:** `contracts/spend-vault` (Rust / Soroban). Epoch-windowed budgeting,
  per-provider limits, events on every state change.
- **Frontend:** `web` (Vite + React + TypeScript). Freighter + StellarWalletsKit,
  balance display, plain XLM send, vault funding, agent payments, and a live event feed.

### Contract interface

| fn | who | effect |
|----|-----|--------|
| `init(owner, agent, token, cap_per_epoch, epoch_len)` | owner | one-time setup |
| `deposit(from, amount)` | anyone | top up the vault |
| `set_policy(cap_per_epoch, epoch_len)` | owner | update budget |
| `set_provider_limit(provider, limit)` | owner | per-provider cap |
| `set_agent(agent)` | owner | rotate spender key |
| `pay(provider, amount) -> remaining` | agent | spend within policy |
| `withdraw(to, amount)` | owner | reclaim funds |
| views | — | `get_owner/agent/cap/epoch_len/spent/remaining/balance` |

Errors: `NotInitialized`, `AlreadyInitialized`, `NotAuthorized`, `BudgetExceeded`,
`ProviderLimitExceeded`, `InsufficientBalance`, `InvalidAmount`.

---

## Deployed (Stellar Testnet)

- **Contract address:** [`CDDIK44X6QKACSGXJ37LKNLTOA3FAFYWMNICUP6MGVWRWHU7ZC4FMQ5L`](https://stellar.expert/explorer/testnet/contract/CDDIK44X6QKACSGXJ37LKNLTOA3FAFYWMNICUP6MGVWRWHU7ZC4FMQ5L)
- **Token (native XLM SAC):** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- **Deploy tx:** [`e8f89957…668930`](https://stellar.expert/explorer/testnet/tx/e8f89957a31d469c11062ec0161dbff50c49bcff8ecd48e4ae52ad55ef668930)
- **Init tx:** [`d5e96591…5da98c`](https://stellar.expert/explorer/testnet/tx/d5e96591efc00472cda8556e2ea89cf7f5dec72dddf25c88ce445ae0375da98c)
- **Deposit tx:** [`c553d777…691df`](https://stellar.expert/explorer/testnet/tx/c553d777cb50dc887164daad70577798d618d405c2dcc7a46d8c66e7a6f691df)
- **Agent `pay` tx (contract call):** [`a861ea73…ec7ad`](https://stellar.expert/explorer/testnet/tx/a861ea73a93c59ec3e634794cf1a6cb9258fa2fe1bdf12abb4088b7aef5ec7ad)

> The `pay` tx emits a `transfer` event (vault → provider, inter-contract SAC call) and a
> `paid` event `[amount, remaining_budget, epoch]` — streamed live in the UI.

---

## Run locally

### Prerequisites
- Rust + `wasm32v1-none` target, [`stellar-cli`](https://developers.stellar.org/docs/tools/cli)
- Node 20+ and `pnpm`
- [Freighter](https://www.freighter.app/) browser extension, set to **Testnet**

### Contract
```bash
cd contracts/spend-vault
stellar contract build
cargo test
```

### Deploy to testnet
```bash
stellar keys generate --global deployer --network testnet --fund
stellar contract deploy --wasm target/wasm32v1-none/release/spend_vault.wasm \
  --source deployer --network testnet
```

### Frontend
```bash
cd web
cp .env.example .env   # set VITE_CONTRACT_ID etc.
pnpm install
pnpm dev
```

---

## Screenshots

<!-- added before submission -->
- Wallet connected state — `TBD`
- Balance displayed — `TBD`
- Successful testnet transaction + result shown to user — `TBD`

## Demo video

<!-- Level 3 -->
`TBD`

---

## Belt coverage

- **White (L1):** Freighter connect/disconnect · XLM balance · send XLM on testnet · tx feedback.
- **Yellow (L2):** StellarWalletsKit multi-wallet · deployed contract called from frontend ·
  live events · tx status · 3+ error types handled.
- **Orange (L3):** factory + policy (inter-contract) · CI/CD · tests · mobile responsive ·
  x402 facilitator flow · demo video.

## License
MIT
