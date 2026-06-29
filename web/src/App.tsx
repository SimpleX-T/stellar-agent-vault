import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { WalletProvider, useWallet } from "./hooks/useWallet";
import { ToastProvider, useToasts } from "./hooks/useToasts";
import { WalletButton } from "./components/WalletButton";
import { BalanceCard } from "./components/BalanceCard";
import { SendXlmCard } from "./components/SendXlmCard";
import { VaultCard } from "./components/VaultCard";
import { ActivityFeed } from "./components/ActivityFeed";
import { Toasts } from "./components/Toasts";
import { createVault, vaultsOf } from "./lib/contract";
import { friendlyError } from "./lib/errors";
import { CONTRACT_ID, EXPLORER_TX, xlmToStroops } from "./lib/config";

const EPOCH_LEN = 86400n; // 1 day

function Shell() {
  const { address } = useWallet();
  const { notify, update } = useToasts();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeVault, setActiveVault] = useState(CONTRACT_ID);
  const [creating, setCreating] = useState(false);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  // On connect, adopt the wallet's own vault if it has one.
  useEffect(() => {
    if (!address) {
      setActiveVault(CONTRACT_ID);
      return;
    }
    vaultsOf(address)
      .then((vs) => {
        if (vs.length > 0) setActiveVault(vs[vs.length - 1]);
      })
      .catch(() => {});
  }, [address]);

  const viewingDemo = !!address && activeVault === CONTRACT_ID;

  const onCreateVault = useCallback(
    async (capXlm: string) => {
      if (!address) return;
      setCreating(true);
      const id = notify({ kind: "pending", title: "Creating your vault…", message: "Deploying via factory" });
      try {
        const { vaultId, hash } = await createVault(
          address,
          address,
          xlmToStroops(capXlm),
          EPOCH_LEN,
        );
        update(id, {
          kind: "success",
          title: "Vault created",
          message: "You're owner + agent — fund it and start paying.",
          href: EXPLORER_TX(hash),
          hrefLabel: "View transaction",
        });
        if (vaultId) setActiveVault(vaultId);
        bump();
      } catch (e) {
        update(id, { kind: "error", title: "Couldn't create vault", message: friendlyError(e) });
      } finally {
        setCreating(false);
      }
    },
    [address, notify, update, bump],
  );

  return (
    <>
      <div className="app-backdrop" />
      <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-8">
        <header className="mb-9 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="neon-ring grid size-11 place-items-center rounded-xl bg-gradient-to-br from-neon-cyan/25 to-neon-violet/25 text-lg font-bold text-neon-cyan">
              ◈
            </span>
            <div>
              <div className="font-display text-[19px] font-bold tracking-tight">SpendVault</div>
              <div className="text-xs text-muted-foreground">
                budget-bound payments for AI agents · Stellar testnet
              </div>
            </div>
          </div>
          <WalletButton />
        </header>

        <section className="mb-9 max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-glass-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-neon-cyan pulse-dot" />
            x402 is live on Stellar — this is the allowance layer it's missing
          </div>
          <h1 className="font-display text-[clamp(32px,5.5vw,54px)] font-extrabold leading-[1.03] tracking-tight">
            Give an agent a wallet it <span className="text-gradient">can't drain</span>.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            x402 lets agents pay per request — but with no budget, an agent key is a blank cheque.
            SpendVault is an on-chain allowance: fund it, set a cap, and the agent spends only within
            policy. Every payout is enforced on Stellar and streamed live.
          </p>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.5fr_1fr]">
          <div className="flex flex-col gap-5 lg:order-1">
            <BalanceCard />
            <SendXlmCard />
          </div>
          <div className="lg:order-2">
            <VaultCard
              vaultId={activeVault}
              viewingDemo={viewingDemo}
              creating={creating}
              onCreateVault={onCreateVault}
              refreshKey={refreshKey}
              onChange={bump}
            />
          </div>
          <div className="lg:order-3">
            <ActivityFeed vaultId={activeVault} refreshKey={refreshKey} />
          </div>
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
          <span>Stellar Journey to Mastery · White → Orange belt</span>
          <a
            href="https://developers.stellar.org/docs/build/agentic-payments/x402"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-neon-cyan"
          >
            Built around x402 <ArrowUpRight className="size-3.5" />
          </a>
        </footer>
      </div>
      <Toasts />
    </>
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
