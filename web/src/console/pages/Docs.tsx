import { BookText } from "lucide-react";
import { WALLET_FACTORY_ID, TOKEN_ID, RELAYER_PUBKEY, shortenAddr, EXPLORER_CONTRACT } from "../../lib/config";
import { PageHeader, Panel, Eyebrow, Copyable, Pill } from "../ui";

const TOC = [
  ["what", "What SpendVault is"],
  ["model", "Trust model"],
  ["policy", "Policy engine"],
  ["contract", "Contract reference"],
  ["gasless", "Gasless spending"],
  ["quickstart", "Quickstart"],
  ["addresses", "Deployed addresses"],
] as const;

export function Docs() {
  return (
    <>
      <PageHeader eyebrow="Developers" title="Documentation" subtitle="Everything needed to give an agent a wallet it can't misuse — the smart account, its policy engine, and how to integrate." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1">
            <Eyebrow>On this page</Eyebrow>
            <div className="mt-2 space-y-0.5">
              {TOC.map(([id, label]) => (
                <a key={id} href={`#/docs#${id}`} onClick={(e) => jump(e, id)} className="block rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground">
                  {label}
                </a>
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-w-0 max-w-2xl space-y-8">
          <Section id="what" title="What SpendVault is">
            <p>
              x402 lets an agent pay per request — but a raw agent key is a blank cheque. SpendVault is the missing
              allowance layer: each agent gets a <b>Soroban custom account</b> (a smart wallet) that holds funds and
              authorizes its own spending. Because policy is enforced in the account's authorization path
              (<code>__check_auth</code>) over standard <code>token.transfer</code> calls, the agent uses ordinary
              Stellar tooling and still cannot exceed its budget.
            </p>
          </Section>

          <Section id="model" title="Trust model">
            <p>Three roles, each with the least authority that works:</p>
            <ul>
              <li><b className="text-primary">Admin</b> — your own connected wallet. Sets policy, adds agents, manages the allowlist. Signed non-custodially; no server ever holds it.</li>
              <li><b className="text-info">Spender</b> — the agent's key. May only move funds, only within policy. Leak it and the wallet still can't be drained.</li>
              <li><b>Relayer</b> — pays fees so the agent needs no XLM. It is <b>not</b> a signer and can never move funds.</li>
            </ul>
          </Section>

          <Section id="policy" title="Policy engine">
            <p>Three independent constraints, all enforced on-chain per transfer:</p>
            <ul>
              <li><b>Per-transfer cap</b> — a single transfer may not exceed <code>max_per_transfer</code>. A token with no policy is disabled.</li>
              <li><b>Rolling epoch cap</b> — total spend within the current <code>epoch_len</code>-second window may not exceed <code>epoch_cap</code>. The counter resets automatically when the window rolls over — no keeper, no cron.</li>
              <li><b>Recipient allowlist</b> — when enforced, funds may only go to allowlisted addresses.</li>
            </ul>
            <Callout>The rolling counter is written from inside <code>__check_auth</code> — the authorization path both checks and records spend atomically with the transfer it approves. A failed check reverts the whole transaction, counter included.</Callout>
          </Section>

          <Section id="contract" title="Contract reference">
            <RefTable
              rows={[
                ["set_policy(token, max_per_transfer, epoch_cap, epoch_len)", "Admin", "Set the spending policy for a token."],
                ["add_signer(pubkey, role)", "Admin", "Register an Admin or Spender signer."],
                ["remove_signer(pubkey)", "Admin", "Revoke a signer."],
                ["set_allowlist_enforced(bool)", "Admin", "Toggle recipient-allowlist enforcement."],
                ["set_recipient(addr, allowed)", "Admin", "Add / remove an allowlisted recipient."],
                ["policy(token) · spent(token) · remaining(token)", "view", "Read policy + rolling counters."],
                ["signer_role(pubkey) · allowlist_enforced()", "view", "Read signer + allowlist state."],
              ]}
            />
            <p className="mt-3 text-[12.5px] text-muted-foreground">Rejections surface as contract errors: <code>#6 PerTransferExceeded</code>, <code>#7 EpochCapExceeded</code>, <code>#8 RecipientNotAllowed</code>.</p>
          </Section>

          <Section id="gasless" title="Gasless spending">
            <p>
              An agent spend is a standard <code>token.transfer(from = wallet, …)</code>. The token calls the wallet's
              <code>require_auth()</code>; the host runs <code>__check_auth</code>, which verifies the Spender's ed25519
              signature and enforces policy. A relayer signs the envelope and pays the fee, so the agent holds no XLM.
              The signing uses the SDK's <code>authorizeEntry</code>, whose <code>{`{ public_key, signature }`}</code>{" "}
              output matches the account's <code>Vec&lt;SignerSig&gt;</code> — no custom XDR.
            </p>
          </Section>

          <Section id="quickstart" title="Quickstart">
            <ol>
              <li>Connect your wallet — you become the Admin.</li>
              <li>Create an agent wallet under <b>Agents</b>.</li>
              <li>Set its policy under <b>Policies</b> (per-transfer + epoch cap + optional allowlist).</li>
              <li>Provision a Spender key and hand its secret to your agent.</li>
              <li>The agent spends via the relayer — approved only within policy.</li>
            </ol>
          </Section>

          <Section id="addresses" title="Deployed addresses">
            <div className="space-y-2">
              <AddrRow label="WalletFactory" value={WALLET_FACTORY_ID} />
              <AddrRow label="Native token (SAC)" value={TOKEN_ID} />
              <AddrRow label="Relayer (gas-only)" value={RELAYER_PUBKEY} noLink />
              <div className="flex items-center gap-2 pt-1">
                <Pill tone="flow" dot>Stellar testnet</Pill>
                <span className="text-[12px] text-muted-foreground">live · verifiable on stellar.expert</span>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function jump(e: React.MouseEvent, id: string) {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-center gap-2">
        <BookText className="size-4 text-primary" />
        <h2 className="font-display text-[19px] font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="doc-prose space-y-3 text-[13.5px] leading-relaxed text-muted-foreground [&_b]:text-foreground [&_code]:data [&_code]:rounded [&_code]:bg-foreground/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_ul]:space-y-1.5 [&_ol]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3.5 text-[12.5px] leading-relaxed text-foreground/90">{children}</div>;
}

function RefTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {rows.map(([sig, role, desc], i) => (
        <div key={i} className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3.5 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
          <code className="data text-[11.5px] text-foreground">{sig}</code>
          <Pill tone={role === "view" ? "muted" : "flow"}>{role}</Pill>
          <span className="col-span-2 text-[12px] text-muted-foreground">{desc}</span>
        </div>
      ))}
    </div>
  );
}

function AddrRow({ label, value, noLink }: { label: string; value: string; noLink?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-foreground/[0.02] px-3.5 py-2.5">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      {value ? (
        noLink ? (
          <Copyable value={value} display={shortenAddr(value)} />
        ) : (
          <a href={EXPLORER_CONTRACT(value)} target="_blank" rel="noreferrer" className="data text-[12.5px] text-muted-foreground hover:text-primary">
            {shortenAddr(value)}
          </a>
        )
      ) : (
        <span className="text-[12px] text-muted-foreground/60">not configured</span>
      )}
    </div>
  );
}
