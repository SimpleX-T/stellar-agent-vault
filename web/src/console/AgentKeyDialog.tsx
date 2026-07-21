import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, KeyRound, Wand2, ClipboardPaste, Copy, Check, Download, Eye, EyeOff, ShieldAlert, ArrowLeft } from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { addSigner } from "../lib/agentWallet";
import { generateAgentKeypair, isStellarAddress } from "../lib/stellar";
import { friendlyError } from "../lib/errors";
import { track } from "../lib/analytics";
import { EXPLORER_TX, shortenAddr } from "../lib/config";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Field } from "./ui";

type Mode = "choose" | "generated" | "byok";

export function AgentKeyDialog({ walletId, onClose, onChanged }: { walletId: string; onClose: () => void; onChanged: () => void }) {
  const { address } = useWallet();
  const { notify, update } = useToasts();
  const [mode, setMode] = useState<Mode>("choose");
  const [kp, setKp] = useState<{ publicKey: string; secret: string } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [byok, setByok] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const generate = () => {
    setKp(generateAgentKeypair());
    setReveal(false);
    setSaved(false);
    setMode("generated");
  };

  const download = () => {
    if (!kp) return;
    const body =
      `SpendVault — agent (Spender) key\nWallet:  ${walletId}\nPublic:  ${kp.publicKey}\nSecret:  ${kp.secret}\n\n` +
      `This key can ONLY move funds from the wallet above, and only within its\non-chain policy. Put the secret in your agent's environment. Never share it.\n`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `spendvault-agent-${kp.publicKey.slice(0, 6)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  const apply = async (agentPk: string) => {
    if (!address) return;
    setBusy(true);
    const id = notify({ kind: "pending", title: "Registering agent…", message: "Sign the authorization" });
    try {
      const hash = await addSigner(walletId, address, agentPk, "spender");
      update(id, { kind: "success", title: "Agent registered", message: `${shortenAddr(agentPk)} can now spend within policy.`, href: EXPLORER_TX(hash), hrefLabel: "View transaction" });
      track("agent_registered", { walletId, agent: agentPk });
      onChanged();
      onClose();
    } catch (e) {
      update(id, { kind: "error", title: "Couldn't register agent", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()} role="dialog" aria-modal="true">
      <div className="glass neon-ring w-full max-w-md overflow-hidden rounded-2xl glow" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2.5">
            {mode !== "choose" && (
              <button onClick={() => setMode("choose")} className="text-muted-foreground hover:text-foreground" aria-label="Back">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <KeyRound className="size-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold tracking-tight">Provision agent key</h3>
          </div>
          <button onClick={() => !busy && onClose()} className="text-muted-foreground/70 hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {mode === "choose" && (
            <>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                The agent is a <span className="text-foreground">Spender</span> — a separate key from your wallet. It can only move funds within
                policy, so even if it leaks, the wallet can't be drained.
              </p>
              <div className="grid gap-2">
                <Button onClick={generate}>
                  <Wand2 className="size-4" /> Generate a key
                </Button>
                <Button variant="outline" onClick={() => setMode("byok")}>
                  <ClipboardPaste className="size-4" /> Use an existing public key
                </Button>
              </div>
            </>
          )}

          {mode === "generated" && kp && (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-coral/30 bg-coral/[0.07] p-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-coral" />
                <p className="text-[12px] leading-snug text-coral">
                  Save the secret now — it's shown once. Anyone with it can spend up to policy. It is <span className="font-semibold">not</span> your wallet key.
                </p>
              </div>
              <KeyField label="Public key (this becomes the agent)" value={kp.publicKey} />
              <KeyField label="Secret key (put in the agent's environment)" value={kp.secret} secret reveal={reveal} onToggle={() => setReveal((r) => !r)} />
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="size-3.5" /> Download key file
              </Button>
              <label className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                I've saved the secret somewhere safe.
              </label>
              <Button className="w-full" disabled={!saved || busy} onClick={() => apply(kp.publicKey)}>
                {busy ? "Registering…" : "Register as agent"}
              </Button>
            </>
          )}

          {mode === "byok" && (
            <>
              <Field label="Agent public key" hint="G… · 56 chars">
                <Input
                  placeholder="G…"
                  value={byok}
                  spellCheck={false}
                  aria-invalid={byok.trim().length > 0 && !isStellarAddress(byok)}
                  className={byok.trim().length > 0 && !isStellarAddress(byok) ? "border-coral/60" : ""}
                  onChange={(e) => setByok(e.target.value)}
                />
              </Field>
              {byok.trim().length > 0 && !isStellarAddress(byok) && <p className="text-[11px] text-coral">Not a Stellar address.</p>}
              <Button className="w-full" disabled={!isStellarAddress(byok) || busy} onClick={() => apply(byok.trim())}>
                {busy ? "Registering…" : "Register as agent"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function KeyField({ label, value, secret, reveal, onToggle }: { label: string; value: string; secret?: boolean; reveal?: boolean; onToggle?: () => void }) {
  const [copied, setCopied] = useState(false);
  const masked = secret && !reveal;
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/40 p-2 pl-3">
        <span className="data min-w-0 flex-1 truncate text-[12.5px]">{masked ? "•".repeat(24) : value}</span>
        {secret && (
          <button onClick={onToggle} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={reveal ? "Hide" : "Reveal"}>
            {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="shrink-0 text-muted-foreground hover:text-primary"
          aria-label="Copy"
        >
          {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
