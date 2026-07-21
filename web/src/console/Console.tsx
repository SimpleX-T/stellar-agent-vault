// The Vault Terminal — operator console shell + hash router.
import { useEffect, useState, type ComponentType } from "react";
import {
  LayoutDashboard,
  Bot,
  Activity as ActivityIcon,
  ShieldCheck,
  KeyRound,
  BookText,
  LogOut,
  Copy,
  Check,
} from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { cn } from "../lib/utils";
import { shortenAddr } from "../lib/config";
import { Button } from "../components/ui/button";
import { Pill, Stamp, Meter, Logo } from "./ui";
import { Overview } from "./pages/Overview";
import { Agents } from "./pages/Agents";
import { Activity } from "./pages/Activity";
import { Policies } from "./pages/Policies";
import { Keys } from "./pages/Keys";
import { Docs } from "./pages/Docs";

type Route = { path: string; label: string; icon: ComponentType<{ className?: string }>; page: ComponentType };

const NAV: Route[] = [
  { path: "", label: "Overview", icon: LayoutDashboard, page: Overview },
  { path: "agents", label: "Agents", icon: Bot, page: Agents },
  { path: "activity", label: "Activity", icon: ActivityIcon, page: Activity },
  { path: "policies", label: "Policies", icon: ShieldCheck, page: Policies },
  { path: "keys", label: "Agent keys", icon: KeyRound, page: Keys },
];
const FOOTER_NAV: Route[] = [{ path: "docs", label: "Documentation", icon: BookText, page: Docs }];

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#\/?/, ""));
  useEffect(() => {
    const on = () => setHash(window.location.hash.replace(/^#\/?/, ""));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash.split("/")[0];
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="neon-ring grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
        <Logo className="size-5" />
      </span>
      <div className="leading-tight">
        <div className="font-display text-[15px] font-semibold tracking-tight">SpendVault</div>
        <div className="eyebrow">The Agent's Ledger</div>
      </div>
    </div>
  );
}

function NavLink({ route, active }: { route: Route; active: boolean }) {
  const Icon = route.icon;
  return (
    <a
      href={`#/${route.path}`}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />}
      <span
        className={cn(
          "absolute inset-0 rounded-lg border transition-colors",
          active ? "border-border bg-foreground/[0.04]" : "border-transparent group-hover:bg-foreground/[0.025]",
        )}
      />
      <Icon className={cn("relative size-[17px] transition-colors", active ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground")} />
      <span className="relative font-medium">{route.label}</span>
    </a>
  );
}

function WalletChip() {
  const { address, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-2 py-1.5">
      <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-[10px] font-semibold text-primary">
        {address.slice(0, 2)}
      </span>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="data flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        {shortenAddr(address)}
        {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3 opacity-50" />}
      </button>
      <button onClick={disconnect} title="Disconnect" className="text-muted-foreground/60 hover:text-coral">
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}

function ConnectGate() {
  const { connect, connecting } = useWallet();
  return (
    <div className="grid min-h-[74vh] items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
      {/* Editorial statement — left, confident, asymmetric. */}
      <div className="reveal max-w-xl">
        <div className="eyebrow mb-4">Ledger №1 · budget-bound agent money</div>
        <h1 className="font-display text-[clamp(36px,5.4vw,60px)] font-semibold leading-[1.02] tracking-[-0.02em]">
          Give an agent a wallet<br />it <span className="gilt">cannot drain.</span>
        </h1>
        <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
          x402 lets an agent pay per request — but a raw key is a blank cheque. SpendVault is the
          allowance layer: a smart account that spends only within a limit you set, enforced on-chain in
          the authorization path. You hold the admin key. No server ever holds a spending key.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={connect} disabled={connecting} size="lg">
            {connecting ? "Connecting…" : "Open your ledger"}
          </Button>
          <a href="#/docs" className="text-[13.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Read the docs →
          </a>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success pulse-dot" /> Enforced in __check_auth</span>
          <span>·</span><span>Non-custodial admin</span>
          <span>·</span><span>Gasless agents</span>
        </div>
      </div>

      {/* The verdict — a stamped ledger card. This is the product in one image. */}
      <div className="reveal" style={{ animationDelay: "90ms" }}>
        <div className="panel glow relative overflow-hidden p-6">
          <div className="ledger-rule pointer-events-none absolute inset-0 opacity-[0.5]" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="eyebrow">Vault · agent 01</div>
              <span className="data text-[11px] text-muted-foreground">epoch · 1d</span>
            </div>
            <div className="mt-5">
              <div className="eyebrow">Per-transfer request</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="data text-[22px]">120.00 <span className="text-[13px] text-muted-foreground">XLM</span></span>
                <Stamp verdict="approved" />
              </div>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <div className="mt-1 flex items-baseline justify-between">
                <span className="data text-[22px]">600.00 <span className="text-[13px] text-muted-foreground">XLM</span></span>
                <Stamp verdict="denied" label="Over cap" />
              </div>
              <div className="eyebrow mt-1">exceeds the 500 XLM epoch cap</div>
            </div>
            <div className="mt-6">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="eyebrow">Budget · this epoch</span>
                <span className="data">300 / 500 XLM</span>
              </div>
              <Meter spent={300n} cap={500n} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Console() {
  const route = useHashRoute();
  const { address } = useWallet();
  const active = [...NAV, ...FOOTER_NAV].find((r) => r.path === route) ?? NAV[0];
  const Page = active.page;
  // Docs is public; everything else needs a connected operator.
  const gated = active.path !== "docs" && !address;

  return (
    <>
      <div className="app-backdrop" />
      <div className="grain" />
      <div className="mx-auto flex min-h-screen max-w-[1400px] gap-0">
        <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-border px-3 py-5 lg:flex">
          <div className="px-1.5 pb-7">
            <Brand />
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((r) => (
              <NavLink key={r.path} route={r} active={active.path === r.path} />
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-0.5">
            {FOOTER_NAV.map((r) => (
              <NavLink key={r.path} route={r} active={active.path === r.path} />
            ))}
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
              <span className="size-1.5 rounded-full bg-primary pulse-dot" />
              <span className="eyebrow">Stellar testnet</span>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/70 px-5 py-3 backdrop-blur-xl sm:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <Brand />
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <Pill tone="flow" dot>
                Enforced on-chain
              </Pill>
              <span className="text-[12px] text-muted-foreground">the allowance layer x402 is missing</span>
            </div>
            <div className="flex items-center gap-2">
              {address ? <WalletChip /> : <ConnectButton />}
            </div>
          </header>

          <div key={active.path} className="reveal px-5 py-7 sm:px-8">
            {gated ? <ConnectGate /> : <Page />}
          </div>
        </main>
      </div>
    </>
  );
}

function ConnectButton() {
  const { connect, connecting } = useWallet();
  return (
    <Button onClick={connect} disabled={connecting} size="sm">
      {connecting ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}
