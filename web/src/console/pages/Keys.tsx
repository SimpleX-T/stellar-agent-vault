import { KeyRound, Fuel, ShieldCheck, Bot } from "lucide-react";
import { RELAYER_PUBKEY, shortenAddr } from "../../lib/config";
import { PageHeader, Panel, Eyebrow, Copyable, Pill } from "../ui";

const SNIPPET = `import { signedInvoke, addr, i128, nativeSac } from "spendvault";

// The agent holds ONLY its Spender secret — never your wallet key,
// never enough authority to exceed policy. The relayer pays the fee.
await signedInvoke({
  relayer,                    // gas-only key, never a signer
  signer: agentSpenderKey,    // least-privilege Spender
  contractId: nativeSac(),
  method: "transfer",
  args: [addr(WALLET), addr(provider), i128(amount)],
});
// → APPROVED only if within per-transfer + epoch cap + allowlist.
//   Otherwise the contract rejects it in __check_auth. On-chain. Final.`;

export function Keys() {
  return (
    <>
      <PageHeader
        eyebrow="Integration"
        title="Agent keys"
        subtitle="How an autonomous agent spends from a wallet — with the least authority that could possibly work."
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Role icon={ShieldCheck} tone="flow" title="Admin (you)" body="Your connected wallet. Sets policy, adds agents, manages the allowlist. Never leaves your control." />
        <Role icon={Bot} tone="info" title="Spender (agent)" body="A generated key given to the agent. Can only move funds within policy. Provision it per wallet under Agents." />
        <Role icon={Fuel} tone="muted" title="Relayer (gas)" body="Pays transaction fees so the agent needs no XLM. It is not a signer — it can never move funds." />
      </div>

      <Panel className="mt-3 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fuel className="size-4 text-primary" />
            <Eyebrow>Relayer · gas-only</Eyebrow>
          </div>
          <Pill tone="flow" dot>live</Pill>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-foreground/[0.02] px-3.5 py-3">
          <Copyable value={RELAYER_PUBKEY} display={RELAYER_PUBKEY ? shortenAddr(RELAYER_PUBKEY) : "not configured"} className="text-[13px]" />
          <span className="text-[12px] text-muted-foreground">testnet · pays fees, holds no authority</span>
        </div>
      </Panel>

      <Panel className="mt-3 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <KeyRound className="size-4 text-primary" />
          <Eyebrow>Agent integration</Eyebrow>
        </div>
        <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed">
          <code className="data text-muted-foreground">{SNIPPET}</code>
        </pre>
      </Panel>
    </>
  );
}

function Role({ icon: Icon, tone, title, body }: { icon: typeof KeyRound; tone: "flow" | "info" | "muted"; title: string; body: string }) {
  return (
    <Panel className="p-5">
      <span className={`grid size-9 place-items-center rounded-xl ${tone === "flow" ? "bg-primary/12 text-primary" : tone === "info" ? "bg-info/12 text-info" : "bg-foreground/[0.05] text-muted-foreground"}`}>
        <Icon className="size-4.5" />
      </span>
      <div className="mt-3 text-[14px] font-semibold">{title}</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
    </Panel>
  );
}
