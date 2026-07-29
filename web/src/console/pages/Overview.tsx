import { ArrowUpRight, Bot, Coins, ShieldCheck, Gauge } from "lucide-react";
import { useFleet } from "../useFleet";
import { stroopsToXlm, shortenAddr } from "../../lib/config";
import { PageHeader, StatTile, Panel, Eyebrow, Pill, Empty, Copyable, Meter } from "../ui";

export function Overview() {
  const { wallets, totals, loading } = useFleet();
  return (
    <>
      <PageHeader
        eyebrow="Operator"
        title="Overview"
        subtitle="Your fleet of budget-bound agent wallets. Every figure below is read live from Stellar — not a cached mirror."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Agent wallets" value={loading ? "—" : totals.count} sub={<span className="inline-flex items-center gap-1"><Bot className="size-3" /> smart accounts</span>} />
        <StatTile label="Total balance" value={loading ? "—" : stroopsToXlm(totals.tvl)} unit="XLM" tone="flow" sub={<span className="inline-flex items-center gap-1"><Coins className="size-3" /> held across the fleet</span>} />
        <StatTile label="Spent · epoch" value={loading ? "—" : stroopsToXlm(totals.spent)} unit="XLM" sub={<span className="inline-flex items-center gap-1"><Gauge className="size-3" /> current windows</span>} />
        <StatTile label="Remaining budget" value={loading ? "—" : stroopsToXlm(totals.remaining)} unit="XLM" sub={<span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" /> allowed before block</span>} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <Eyebrow>Fleet</Eyebrow>
            <a href="#/agents" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-primary">
              Manage <ArrowUpRight className="size-3.5" />
            </a>
          </div>
          {wallets.length === 0 ? (
            <Empty
              icon={<Bot className="size-6" />}
              title={loading ? "Loading fleet…" : "No agent wallets yet"}
              sub="Head to Agents to provision your first budget-bound smart account."
            />
          ) : (
            <div className="space-y-1.5">
              {wallets.map((w) => {
                return (
                  <a
                    key={w.id}
                    href="#/agents"
                    className="panel-hover flex items-center gap-4 rounded-lg border border-border bg-foreground/[0.02] px-3.5 py-3"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                      <Bot className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Copyable value={w.id} display={shortenAddr(w.id)} />
                      <Meter spent={w.spent} cap={w.policy.epochCap} className="mt-2" />
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="data text-[13.5px]">{stroopsToXlm(w.balance)} <span className="text-muted-foreground">XLM</span></div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{stroopsToXlm(w.spent)} / {stroopsToXlm(w.policy.epochCap)} used</div>
                    </div>
                    {w.allowlistEnforced && <Pill tone="info">allowlist</Pill>}
                  </a>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <Eyebrow>The model</Eyebrow>
          <ul className="mt-3 space-y-3 text-[13px] leading-relaxed">
            <Point tone="flow" title="Non-custodial admin">
              Your connected wallet is the only <span className="text-foreground">Admin</span> signer. Policy changes are signed by you — no server holds the key.
            </Point>
            <Point tone="flow" title="Least-privilege agent">
              Each agent gets a <span className="text-foreground">Spender</span> key that can only move funds within policy. Leak it and the vault still can't be drained.
            </Point>
            <Point tone="stop" title="Enforced in __check_auth">
              Per-transfer cap, rolling epoch cap and recipient allowlist are enforced on-chain, in the authorization path — not by this UI.
            </Point>
            <Point tone="flow" title="Gasless spending">
              A relayer pays the agent's fees, so the agent never holds XLM for gas.
            </Point>
          </ul>
        </Panel>
      </div>
    </>
  );
}

function Point({ tone, title, children }: { tone: "flow" | "stop"; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone === "flow" ? "bg-primary" : "bg-coral"}`} />
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">{title}. </span>
        {children}
      </span>
    </li>
  );
}
