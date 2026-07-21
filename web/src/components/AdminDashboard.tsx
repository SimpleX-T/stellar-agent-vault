import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Vault,
  Coins,
  TrendingDown,
  Users,
  BarChart3,
  Bug,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { WalletButton } from "./WalletButton";
import { ThemeToggle } from "./ThemeToggle";
import { fetchAllVaultSummaries, factoryAdmin, type VaultSummary } from "../lib/contract";
import { captureError } from "../lib/monitoring";
import {
  ADMIN_ALLOWLIST,
  POSTHOG_PROJECT_URL,
  SENTRY_PROJECT_URL,
  EXPLORER_CONTRACT,
  EXPLORER_ACCOUNT,
  FACTORY_ID,
  shortenAddr,
  stroopsToXlm,
} from "../lib/config";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const fmt = (stroops: bigint) =>
  Number(stroopsToXlm(stroops)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function AdminDashboard() {
  const { address } = useWallet();
  const [admin, setAdmin] = useState<string | null>(null);
  const [vaults, setVaults] = useState<VaultSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    factoryAdmin()
      .then(setAdmin)
      .catch(() => setAdmin(null));
  }, []);

  const isAdmin =
    !!address && (address === admin || ADMIN_ALLOWLIST.includes(address));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVaults(await fetchAllVaultSummaries());
    } catch (e) {
      captureError(e, { action: "admin_load" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const totals = useMemo(() => {
    const ok = (vaults ?? []).filter((v) => !v.error);
    return {
      count: vaults?.length ?? 0,
      tvl: ok.reduce((s, v) => s + v.balance, 0n),
      spent: ok.reduce((s, v) => s + v.spent, 0n),
      owners: new Set(ok.map((v) => v.owner)).size,
    };
  }, [vaults]);

  return (
    <>
      <div className="app-backdrop" />
      <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-8">
        <header className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="neon-ring glow grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-purple/30 to-lavender/20 text-lavender">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <div className="font-display text-[19px] font-bold tracking-tight">
                SpendVault · Admin
              </div>
              <a
                href={EXPLORER_CONTRACT(FACTORY_ID)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-purple"
              >
                factory {shortenAddr(FACTORY_ID)} <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="#/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-4" /> App
              </Button>
            </a>
            <ThemeToggle />
            <WalletButton />
          </div>
        </header>

        {!address ? (
          <Gate icon={<Lock className="size-6 text-neon-cyan" />} title="Connect to continue">
            Connect the operator wallet to view the vault registry.
          </Gate>
        ) : !isAdmin ? (
          <Gate icon={<Lock className="size-6 text-warning" />} title="Not authorized">
            <span className="data">{shortenAddr(address)}</span> isn't an admin wallet. Add it to{" "}
            <code className="text-warning">VITE_ADMIN_ADDRESS</code>, or connect the factory admin.
          </Gate>
        ) : (
          <>
            {/* KPI row */}
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={<Vault className="size-4" />} label="Vaults created" value={String(totals.count)} />
              <Kpi icon={<Coins className="size-4" />} label="Total value locked" value={`${fmt(totals.tvl)} XLM`} accent />
              <Kpi icon={<TrendingDown className="size-4" />} label="Spent (this epoch)" value={`${fmt(totals.spent)} XLM`} />
              <Kpi icon={<Users className="size-4" />} label="Unique owners" value={String(totals.owners)} />
            </div>

            {/* Off-chain dashboards */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Off-chain:</span>
              <a href={POSTHOG_PROJECT_URL} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <BarChart3 className="size-4" /> PostHog analytics <ExternalLink className="size-3" />
                </Button>
              </a>
              <a href={SENTRY_PROJECT_URL} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <Bug className="size-4" /> Sentry errors <ExternalLink className="size-3" />
                </Button>
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>

            {/* Registry table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="p-3 font-medium">Vault</th>
                        <th className="p-3 font-medium">Owner</th>
                        <th className="p-3 font-medium">Agent</th>
                        <th className="p-3 text-right font-medium">Balance</th>
                        <th className="p-3 text-right font-medium">Spent</th>
                        <th className="p-3 font-medium">Epoch budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vaults === null ? (
                        <SkeletonRows />
                      ) : vaults.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
                            No vaults created yet.
                          </td>
                        </tr>
                      ) : (
                        vaults.map((v) => <Row key={v.id} v={v} />)
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <p className="mt-4 text-xs text-muted-foreground">
              Enumerated on-chain from the factory's <code>all_vaults()</code> registry — complete
              regardless of RPC event retention. State is read live per vault.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Row({ v }: { v: VaultSummary }) {
  const cap = Number(stroopsToXlm(v.cap));
  const spent = Number(stroopsToXlm(v.spent));
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-secondary/30">
      <td className="p-3">
        <a
          href={EXPLORER_CONTRACT(v.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 data hover:text-purple"
        >
          {shortenAddr(v.id)} <ExternalLink className="size-3" />
        </a>
      </td>
      {v.error ? (
        <td colSpan={5} className="p-3 text-xs text-warning">
          failed to load state
        </td>
      ) : (
        <>
          <td className="p-3">
            <a href={EXPLORER_ACCOUNT(v.owner)} target="_blank" rel="noreferrer" className="data hover:text-purple">
              {shortenAddr(v.owner)}
            </a>
          </td>
          <td className="p-3 data text-muted-foreground">{shortenAddr(v.agent)}</td>
          <td className="p-3 text-right data">{fmt(v.balance)}</td>
          <td className="p-3 text-right data">{fmt(v.spent)}</td>
          <td className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary/70">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background:
                      pct > 85
                        ? "linear-gradient(90deg,var(--warning),var(--destructive))"
                        : "linear-gradient(90deg,var(--neon-cyan),var(--neon-violet))",
                  }}
                />
              </div>
              <span className="data text-xs text-muted-foreground">
                {fmt(v.spent)}/{fmt(v.cap)}
              </span>
            </div>
          </td>
        </>
      )}
    </tr>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "neon-ring" : ""}>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-neon-cyan">{icon}</span>
          {label}
        </div>
        <div className="text-xl font-semibold tracking-tight data">{value}</div>
      </CardContent>
    </Card>
  );
}

function Gate({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-md text-center">
      <CardContent className="space-y-3 p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary/60">
          {icon}
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{children}</p>
        <div className="pt-1">
          <Badge>admin · read-only</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <tr key={i} className="border-b border-border/60">
          {Array.from({ length: 6 }).map((_, j) => (
            <td key={j} className="p-3">
              <div className="h-4 w-full max-w-[120px] animate-pulse rounded bg-secondary/60" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
