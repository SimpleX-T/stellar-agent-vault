import { useState } from "react";
import { Bot, Plus, Droplet, KeyRound, ShieldCheck, ExternalLink } from "lucide-react";
import { useWallet } from "../../hooks/useWallet";
import { useToasts } from "../../hooks/useToasts";
import { useFleet } from "../useFleet";
import { depositXlm, type WalletState } from "../../lib/agentWallet";
import { getAgentMeta } from "../../lib/agentMeta";
import { friendlyError } from "../../lib/errors";
import { track } from "../../lib/analytics";
import { stroopsToXlm, shortenAddr, xlmToStroops, EXPLORER_TX, EXPLORER_CONTRACT } from "../../lib/config";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PageHeader, Panel, Eyebrow, Pill, Empty, Copyable, Field, Divider, Meter } from "../ui";
import { AgentKeyDialog } from "../AgentKeyDialog";
import { ProvisionDialog } from "../ProvisionDialog";

export function Agents() {
  const { address } = useWallet();
  const { wallets, loading, refresh } = useFleet();
  const [provisioning, setProvisioning] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Fleet"
        title="Agents"
        subtitle="Each agent is a Soroban smart account you own. Fund it, set its policy, and hand its Spender key to the agent — nothing else can move the money."
        action={
          <Button onClick={() => setProvisioning(true)} disabled={!address}>
            <Plus className="size-4" /> New agent wallet
          </Button>
        }
      />
      {provisioning && <ProvisionDialog onClose={() => setProvisioning(false)} onCreated={refresh} />}

      {wallets.length === 0 ? (
        <Empty
          icon={<Bot className="size-7" />}
          title={loading ? "Loading fleet…" : "No agent wallets yet"}
          sub="Create your first budget-bound smart account. You'll be its Admin signer; the agent gets a separate, least-privilege key."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {wallets.map((w) => (
            <WalletCard key={w.id} w={w} onChanged={refresh} />
          ))}
        </div>
      )}
    </>
  );
}

function WalletCard({ w, onChanged }: { w: WalletState; onChanged: () => void }) {
  const { address } = useWallet();
  const { notify, update } = useToasts();
  const [amount, setAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const pct = w.policy.epochCap > 0n ? Number((w.spent * 100n) / w.policy.epochCap) : 0;
  const configured = w.policy.maxPerTransfer > 0n;
  const meta = getAgentMeta(w.id);

  const onFund = async () => {
    if (!address || !amount) return;
    setFunding(true);
    const id = notify({ kind: "pending", title: "Funding wallet…", message: "Sign the transfer" });
    try {
      const hash = await depositXlm(address, w.id, xlmToStroops(amount));
      update(id, { kind: "success", title: "Wallet funded", message: `${amount} XLM deposited.`, href: EXPLORER_TX(hash), hrefLabel: "View transaction" });
      track("wallet_funded", { walletId: w.id, amount });
      setAmount("");
      onChanged();
    } catch (e) {
      update(id, { kind: "error", title: "Funding failed", message: friendlyError(e) });
    } finally {
      setFunding(false);
    }
  };

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
            <Bot className="size-4.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              {meta.name && <span className="font-display text-[14px] font-semibold tracking-tight">{meta.name}</span>}
              <Copyable value={w.id} display={shortenAddr(w.id)} className="text-[12.5px]" />
            </div>
            {meta.model && <div className="data mt-0.5 text-[10.5px] text-muted-foreground/70">{meta.model}</div>}
            <div className="mt-0.5 flex items-center gap-1.5">
              {!configured ? (
                <Pill tone="warning">no policy</Pill>
              ) : pct >= 100 ? (
                <Pill tone="stop" dot>at cap</Pill>
              ) : (
                <Pill tone="flow">policy set</Pill>
              )}
              {w.allowlistEnforced && <Pill tone="info">allowlist</Pill>}
            </div>
          </div>
        </div>
        <a href={EXPLORER_CONTRACT(w.id)} target="_blank" rel="noreferrer" className="text-muted-foreground/60 hover:text-primary">
          <ExternalLink className="size-4" />
        </a>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border">
        <Metric label="Balance" value={stroopsToXlm(w.balance)} unit="XLM" tone="flow" />
        <Metric label="Spent · epoch" value={stroopsToXlm(w.spent)} unit="XLM" />
        <Metric label="Remaining" value={configured ? stroopsToXlm(w.remaining) : "—"} unit={configured ? "XLM" : ""} />
      </div>

      {configured && w.policy.epochCap > 0n && (
        <div className="px-4 pt-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <Eyebrow>Budget · this epoch</Eyebrow>
            <span className="data text-[11px] text-muted-foreground">
              {stroopsToXlm(w.spent)} / {stroopsToXlm(w.policy.epochCap)} XLM
            </span>
          </div>
          <Meter spent={w.spent} cap={w.policy.epochCap} />
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Fund with XLM" hint="from your wallet">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" inputMode="decimal" />
            </Field>
          </div>
          <Button variant="outline" onClick={onFund} disabled={funding || !amount}>
            <Droplet className="size-4" /> {funding ? "Funding…" : "Fund"}
          </Button>
        </div>
        <Divider />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setKeyOpen(true)}>
            <KeyRound className="size-3.5" /> Provision agent key
          </Button>
          <a href="#/policies">
            <Button variant="ghost" size="sm">
              <ShieldCheck className="size-3.5" /> Edit policy
            </Button>
          </a>
        </div>
      </div>

      {keyOpen && <AgentKeyDialog walletId={w.id} onClose={() => setKeyOpen(false)} onChanged={onChanged} />}
    </Panel>
  );
}

function Metric({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: "flow" }) {
  return (
    <div className="bg-card p-3.5">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`data text-[17px] font-semibold ${tone === "flow" ? "text-primary" : ""}`}>{value}</span>
        {unit && <span className="data text-[11px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
