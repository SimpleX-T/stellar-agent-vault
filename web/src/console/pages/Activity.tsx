import { useEffect, useState } from "react";
import { Activity as ActivityIcon, ShieldCheck, KeyRound, ListChecks, RefreshCw, ExternalLink } from "lucide-react";
import { useFleet } from "../useFleet";
import { fetchWalletEvents, type WalletEvent } from "../../lib/agentWallet";
import { shortenAddr, EXPLORER_TX } from "../../lib/config";
import { PageHeader, Panel, Eyebrow, Empty, Stamp } from "../ui";

type Row = WalletEvent & { walletId: string };

const META: Record<string, { icon: typeof ShieldCheck; label: string; ink: "gilt" | "sage" | "muted" }> = {
  policy_updated: { icon: ShieldCheck, label: "Policy set", ink: "gilt" },
  signer_updated: { icon: KeyRound, label: "Signer changed", ink: "muted" },
  allowlist_toggled: { icon: ListChecks, label: "Allowlist", ink: "sage" },
  recipient_updated: { icon: ListChecks, label: "Recipient", ink: "muted" },
};

export function Activity() {
  const { wallets, loading: fleetLoading } = useFleet();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (wallets.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const all = await Promise.all(
        wallets.map(async (w) => (await fetchWalletEvents(w.id)).map((e): Row => ({ ...e, walletId: w.id }))),
      );
      if (cancelled) return;
      setRows(all.flat().sort((a, b) => b.ledger - a.ledger));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [wallets, tick]);

  return (
    <>
      <PageHeader
        eyebrow="Ledger truth"
        title="The ledger"
        subtitle="Every governance action on your fleet, bound in order and read straight from Stellar. This is settlement truth — not an app-side log that can drift."
        action={
          <button onClick={() => setTick((t) => t + 1)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] text-muted-foreground hover:text-foreground">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      <Panel className="overflow-hidden">
        {/* Ledger header band */}
        <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3 border-b border-border bg-foreground/[0.02] px-4 py-2.5">
          <Eyebrow>Folio</Eyebrow>
          <Eyebrow>Entry</Eyebrow>
          <Eyebrow>Ledger</Eyebrow>
        </div>

        {rows.length === 0 ? (
          <Empty
            icon={<ActivityIcon className="size-7" />}
            title={fleetLoading || loading ? "Reading the ledger…" : "No entries yet"}
            sub="Policy changes, signer updates and allowlist edits are inscribed here as you configure your wallets."
          />
        ) : (
          <div className="ledger-rule">
            {rows.map((r, i) => {
              const m = META[r.kind] ?? { icon: ActivityIcon, label: r.kind, ink: "muted" as const };
              const Icon = m.icon;
              const folio = String(rows.length - i).padStart(3, "0");
              return (
                <div key={r.id} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-4" style={{ height: 44 }}>
                  <span className="data text-[12px] text-muted-foreground/70">{folio}</span>
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className={`size-4 shrink-0 ${m.ink === "gilt" ? "text-primary" : m.ink === "sage" ? "text-success" : "text-muted-foreground"}`} />
                    <span className="shrink-0 text-[13px] font-medium">{m.label}</span>
                    <span className="data truncate text-[11.5px] text-muted-foreground">{describe(r)}</span>
                    <span className="data hidden shrink-0 text-[11px] text-muted-foreground/60 sm:inline">· {shortenAddr(r.walletId)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.kind === "allowlist_toggled" && r.data ? <Stamp verdict="approved" label="Sealed" /> : null}
                    <a href={r.txHash ? EXPLORER_TX(r.txHash) : "#"} target="_blank" rel="noreferrer" className="data inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-primary">
                      {r.ledger} <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      <p className="mt-3 px-1 text-[11.5px] text-muted-foreground">Spend itself isn't replayed here — it's read live as each wallet's balance and epoch counter, on the Overview and Agents pages.</p>
    </>
  );
}

function describe(r: Row): string {
  const d = r.data as Record<string, unknown> | number | boolean | null;
  if (r.kind === "policy_updated" && d && typeof d === "object") {
    const max = Number((d.max_per_transfer as bigint) ?? 0) / 1e7;
    const cap = Number((d.epoch_cap as bigint) ?? 0) / 1e7;
    return `max/transfer ${max} XLM · epoch cap ${cap || "∞"} XLM`;
  }
  if (r.kind === "signer_updated") return r.topic ? `${r.topic.slice(0, 12)}…` : "signer";
  if (r.kind === "allowlist_toggled") return d ? "enforcement enabled" : "enforcement disabled";
  if (r.kind === "recipient_updated") return r.topic ? `${shortenAddr(r.topic)} ${d ? "allowed" : "removed"}` : "recipient";
  return "";
}
