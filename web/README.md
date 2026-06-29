# SpendVault — web

React + TypeScript + Vite frontend for the SpendVault agent-payments dApp.
Design language: "neon-cyber" (Tailwind v4 + oklch tokens, glass + neon accents).

## Stack
- Vite + React 19 + TypeScript
- `@stellar/stellar-sdk` (RPC + Horizon), `@creit.tech/stellar-wallets-kit` (multi-wallet)
- Tailwind v4, lucide-react, framer-motion, Geist + Bricolage Grotesque

## Run locally
```bash
cp .env.example .env     # contract/network config (testnet)
pnpm install
pnpm dev                 # http://localhost:5173
```

Requires the [Freighter](https://www.freighter.app/) extension set to **Testnet**.

## Env
See `.env.example` — `VITE_CONTRACT_ID` (demo vault), `VITE_FACTORY_ID`, `VITE_TOKEN_ID`
(native XLM SAC), `VITE_RPC_URL`, `VITE_HORIZON_URL`, `VITE_NETWORK_PASSPHRASE`,
`VITE_READ_SOURCE` (funded account used only to simulate read-only views).

## Structure
- `src/lib/` — `config`, `wallet` (StellarWalletsKit), `stellar` (balance + XLM send),
  `contract` (vault calls, factory, event feed), `errors` (friendly mapping).
- `src/components/` — feature cards + `ui/` primitives.
- `src/hooks/` — wallet + toast contexts.

## Scripts
- `pnpm dev` · `pnpm build` (typecheck + bundle) · `pnpm preview`
