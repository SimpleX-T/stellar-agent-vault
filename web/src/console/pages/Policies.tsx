import { useEffect, useState } from "react";
import { ShieldCheck, Save, Plus, Trash2, ListChecks } from "lucide-react";
import { useWallet } from "../../hooks/useWallet";
import { useToasts } from "../../hooks/useToasts";
import { useFleet } from "../useFleet";
import { setPolicy, setAllowlistEnforced, setRecipient, type WalletState } from "../../lib/agentWallet";
import { isStellarAddress } from "../../lib/stellar";
import { friendlyError } from "../../lib/errors";
import { track } from "../../lib/analytics";
import { stroopsToXlm, xlmToStroops, shortenAddr, EXPLORER_TX } from "../../lib/config";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PageHeader, Panel, Eyebrow, Pill, Empty, Field, Divider } from "../ui";

const WINDOWS: { label: string; secs: bigint }[] = [
  { label: "1 hour", secs: 3600n },
  { label: "1 day", secs: 86_400n },
  { label: "1 week", secs: 604_800n },
];

export function Policies() {
  const { wallets, loading, refresh } = useFleet();
  const [selected, setSelected] = useState<string>("");
  const active = wallets.find((w) => w.id === selected) ?? wallets[0];

  useEffect(() => {
    if (!selected && wallets[0]) setSelected(wallets[0].id);
  }, [wallets, selected]);

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Policies"
        subtitle="Set the on-chain spending rules a wallet's agent must obey. Nothing here is advisory — the contract enforces every value in __check_auth."
      />

      {wallets.length === 0 ? (
        <Empty icon={<ShieldCheck className="size-7" />} title={loading ? "Loading…" : "No wallets to configure"} sub="Create an agent wallet first, then set its policy here." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelected(w.id)}
                className={`data rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors ${
                  active?.id === w.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {shortenAddr(w.id)}
              </button>
            ))}
          </div>
          {active && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <PolicyEditor key={active.id + "p"} w={active} onChanged={refresh} />
              <AllowlistEditor key={active.id + "a"} w={active} onChanged={refresh} />
            </div>
          )}
        </>
      )}
    </>
  );
}

function PolicyEditor({ w, onChanged }: { w: WalletState; onChanged: () => void }) {
  const { address } = useWallet();
  const { notify, update } = useToasts();
  const [maxPer, setMaxPer] = useState(w.policy.maxPerTransfer > 0n ? stroopsToXlm(w.policy.maxPerTransfer) : "");
  const [cap, setCap] = useState(w.policy.epochCap > 0n ? stroopsToXlm(w.policy.epochCap) : "");
  const [win, setWin] = useState<bigint>(w.policy.epochLen > 0n ? w.policy.epochLen : 86_400n);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!address || !maxPer) return;
    setBusy(true);
    const id = notify({ kind: "pending", title: "Setting policy…", message: "Sign the authorization" });
    try {
      const hash = await setPolicy(w.id, address, xlmToStroops(maxPer), cap ? xlmToStroops(cap) : 0n, win);
      update(id, { kind: "success", title: "Policy updated", message: "Enforced on-chain from now on.", href: EXPLORER_TX(hash), hrefLabel: "View transaction" });
      track("policy_set", { walletId: w.id });
      onChanged();
    } catch (e) {
      update(id, { kind: "error", title: "Couldn't set policy", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" />
        <Eyebrow>Spending policy · XLM</Eyebrow>
      </div>
      <div className="space-y-4">
        <Field label="Max per transfer" hint="single transfer ceiling">
          <Input value={maxPer} onChange={(e) => setMaxPer(e.target.value)} placeholder="250" inputMode="decimal" />
        </Field>
        <Field label="Rolling epoch cap" hint="0 = per-transfer only">
          <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="500" inputMode="decimal" />
        </Field>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium">Epoch window</div>
          <div className="flex gap-2">
            {WINDOWS.map((o) => (
              <button
                key={o.label}
                onClick={() => setWin(o.secs)}
                className={`flex-1 rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
                  win === o.secs ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <Divider />
        <div className="relative overflow-hidden rounded-lg border border-border bg-foreground/[0.02] p-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="ledger-rule pointer-events-none absolute inset-0 opacity-40" />
          <span className="relative">
            <Eyebrow>Statement</Eyebrow>
            <p className="mt-1.5">
              The agent may spend at most <span className="data gilt">{maxPer || "—"}</span> XLM per transfer, and no more than{" "}
              <span className="data gilt">{cap || "∞"}</span> XLM per <span className="text-foreground">{WINDOWS.find((x) => x.secs === win)?.label}</span>. The
              window resets automatically on-chain — no keeper.
            </p>
          </span>
        </div>
        <Button onClick={save} disabled={busy || !maxPer} className="w-full">
          <Save className="size-4" /> {busy ? "Signing…" : "Save policy"}
        </Button>
      </div>
    </Panel>
  );
}

function AllowlistEditor({ w, onChanged }: { w: WalletState; onChanged: () => void }) {
  const { address } = useWallet();
  const { notify, update } = useToasts();
  const [recipient, setRecip] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = async (enforced: boolean) => {
    if (!address) return;
    setBusy(true);
    const id = notify({ kind: "pending", title: enforced ? "Enabling allowlist…" : "Disabling allowlist…", message: "Sign the authorization" });
    try {
      const hash = await setAllowlistEnforced(w.id, address, enforced);
      update(id, { kind: "success", title: enforced ? "Allowlist enforced" : "Allowlist off", message: enforced ? "Only allowlisted recipients can be paid." : "Any recipient allowed.", href: EXPLORER_TX(hash), hrefLabel: "View transaction" });
      onChanged();
    } catch (e) {
      update(id, { kind: "error", title: "Couldn't update", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!address || !isStellarAddress(recipient)) return;
    setBusy(true);
    const id = notify({ kind: "pending", title: "Adding recipient…", message: "Sign the authorization" });
    try {
      const hash = await setRecipient(w.id, address, recipient.trim(), true);
      update(id, { kind: "success", title: "Recipient allowed", message: `${shortenAddr(recipient)} can now receive funds.`, href: EXPLORER_TX(hash), hrefLabel: "View transaction" });
      setRecip("");
      onChanged();
    } catch (e) {
      update(id, { kind: "error", title: "Couldn't add recipient", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-primary" />
          <Eyebrow>Recipient allowlist</Eyebrow>
        </div>
        {w.allowlistEnforced ? <Pill tone="flow" dot>enforced</Pill> : <Pill tone="muted">off</Pill>}
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        When enforced, the agent can only pay recipients you've added — even within budget. A leaked key still can't send funds anywhere new.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant={w.allowlistEnforced ? "outline" : "neon"} size="sm" disabled={busy} onClick={() => toggle(true)}>
          Enforce
        </Button>
        <Button variant={w.allowlistEnforced ? "neon" : "outline"} size="sm" disabled={busy} onClick={() => toggle(false)}>
          Turn off
        </Button>
      </div>
      <Divider className="my-4" />
      <Field label="Add recipient" hint="G… address">
        <div className="flex gap-2">
          <Input value={recipient} onChange={(e) => setRecip(e.target.value)} placeholder="G…" spellCheck={false} className={recipient.trim().length > 0 && !isStellarAddress(recipient) ? "border-coral/60" : ""} />
          <Button variant="outline" onClick={add} disabled={busy || !isStellarAddress(recipient)}>
            <Plus className="size-4" />
          </Button>
        </div>
      </Field>
    </Panel>
  );
}
