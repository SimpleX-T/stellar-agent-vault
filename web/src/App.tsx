import { useState } from "react";
import { WalletProvider } from "./hooks/useWallet";
import { ToastProvider } from "./hooks/useToasts";
import { WalletButton } from "./components/WalletButton";
import { BalanceCard } from "./components/BalanceCard";
import { SendXlmCard } from "./components/SendXlmCard";
import { VaultCard } from "./components/VaultCard";
import { ActivityFeed } from "./components/ActivityFeed";
import { Toasts } from "./components/Toasts";
import "./App.css";

function Shell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="app">
      <div className="bg-orb bg-orb--1" />
      <div className="bg-orb bg-orb--2" />

      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">◈</span>
          <div>
            <div className="brand__name">SpendVault</div>
            <div className="brand__tag">budget-bound payments for AI agents · Stellar testnet</div>
          </div>
        </div>
        <WalletButton />
      </header>

      <main className="layout">
        <section className="hero">
          <h1 className="hero__title">
            Give an agent a wallet it <em>can't</em> drain.
          </h1>
          <p className="hero__sub">
            x402 lets agents pay per request — but with no budget, an agent key is a blank
            cheque. SpendVault is an on-chain allowance: fund it, set a cap, and the agent
            spends only within policy. Every payout is enforced on Stellar and streamed live.
          </p>
        </section>

        <div className="grid">
          <div className="grid__col">
            <BalanceCard />
            <SendXlmCard />
          </div>
          <div className="grid__col grid__col--wide">
            <VaultCard refreshKey={refreshKey} onChange={bump} />
          </div>
          <div className="grid__col">
            <ActivityFeed refreshKey={refreshKey} />
          </div>
        </div>
      </main>

      <footer className="footer">
        <span>Stellar Journey to Mastery · White → Orange belt</span>
        <a href="https://developers.stellar.org/docs/build/agentic-payments/x402" target="_blank" rel="noreferrer">
          Built around x402 ↗
        </a>
      </footer>

      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <WalletProvider>
        <Shell />
      </WalletProvider>
    </ToastProvider>
  );
}
