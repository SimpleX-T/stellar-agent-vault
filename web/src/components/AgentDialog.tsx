import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  KeyRound,
  Wand2,
  ClipboardPaste,
  Copy,
  Check,
  Download,
  Eye,
  EyeOff,
  Droplet,
  ShieldAlert,
  ArrowLeft,
} from "lucide-react";
import { useToasts } from "../hooks/useToasts";
import { setAgent } from "../lib/contract";
import { generateAgentKeypair, fundWithFriendbot, isStellarAddress } from "../lib/stellar";
import { friendlyError } from "../lib/errors";
import { track } from "../lib/analytics";
import { EXPLORER_TX, shortenAddr } from "../lib/config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Mode = "choose" | "generated" | "byok";

export function AgentDialog({
  vaultId,
  owner,
  currentAgent,
  onClose,
  onChanged,
}: {
  vaultId: string;
  owner: string;
  currentAgent?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify, update } = useToasts();
  const [mode, setMode] = useState<Mode>("choose");
  const [kp, setKp] = useState<{ publicKey: string; secret: string } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [byok, setByok] = useState("");
  const [busy, setBusy] = useState(false);
  const [funding, setFunding] = useState(false);

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
      `SpendVault — agent key\n` +
      `Vault:  ${vaultId}\n` +
      `Public: ${kp.publicKey}\n` +
      `Secret: ${kp.secret}\n\n` +
      `This key can spend only from the vault above, only up to its per-epoch cap.\n` +
      `Put the secret in your agent's environment. Never share it.\n`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `spendvault-agent-${kp.publicKey.slice(0, 6)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  const fundAgent = async () => {
    if (!kp) return;
    setFunding(true);
    try {
      await fundWithFriendbot(kp.publicKey);
      notify({ kind: "success", title: "Agent funded", message: "The agent can now pay its own transaction fees." });
    } catch (e) {
      notify({ kind: "error", title: "Funding failed", message: friendlyError(e) });
    } finally {
      setFunding(false);
    }
  };

  const apply = async (agentPk: string) => {
    setBusy(true);
    const id = notify({ kind: "pending", title: "Setting vault agent…", message: "Awaiting signature" });
    try {
      const { hash } = await setAgent(vaultId, owner, agentPk);
      update(id, {
        kind: "success",
        title: "Agent set",
        message: `${shortenAddr(agentPk)} is now the only key that can pay.`,
        href: EXPLORER_TX(hash),
        hrefLabel: "View transaction",
      });
      track("agent_set", { vaultId, agent: agentPk });
      onChanged();
      onClose();
    } catch (e) {
      update(id, { kind: "error", title: "Couldn't set agent", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  const agentIsOwner = !!currentAgent && currentAgent === owner;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Manage vault agent"
    >
      <div
        className="glass neon-ring w-full max-w-md overflow-hidden rounded-2xl shadow-[0_30px_80px_-30px_var(--glow-1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2.5">
            {mode !== "choose" && (
              <button
                onClick={() => setMode("choose")}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <KeyRound className="size-4 text-purple" />
            <h3 className="font-display text-[15px] font-semibold tracking-tight">Vault agent</h3>
          </div>
          <button
            onClick={() => !busy && onClose()}
            className="text-muted-foreground/70 hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {mode === "choose" && (
            <>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                The agent is a <span className="text-foreground">separate key</span> from your wallet.
                It can only call <code className="data text-purple">pay</code>, and only within the
                cap — so even if it leaks, the vault can't be drained.
              </p>
              <div className="rounded-xl border border-border bg-background/30 p-3 text-xs">
                <div className="text-muted-foreground">Current agent</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="data font-semibold">{currentAgent ? shortenAddr(currentAgent) : "—"}</span>
                  {agentIsOwner && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-coral/12 px-2 py-0.5 text-[10.5px] font-medium text-coral">
                      <ShieldAlert className="size-3" /> same as your wallet
                    </span>
                  )}
                </div>
                {agentIsOwner && (
                  <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
                    No separation yet — your wallet is doing the agent's job. Give the agent its own key.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Button onClick={generate}>
                  <Wand2 className="size-4" /> Generate an agent key
                </Button>
                <Button variant="outline" onClick={() => setMode("byok")}>
                  <ClipboardPaste className="size-4" /> Use an existing key
                </Button>
              </div>
            </>
          )}

          {mode === "generated" && kp && (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-coral/30 bg-coral/[0.07] p-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-coral" />
                <p className="text-[12px] leading-snug text-coral">
                  Save the secret now — it's shown once and never again. Anyone with it can spend up to
                  this vault's cap. It is <span className="font-semibold">not</span> your wallet key.
                </p>
              </div>

              <Field label="Public key (this becomes the agent)" value={kp.publicKey} />
              <Field label="Secret key (put in your agent's environment)" value={kp.secret} secret reveal={reveal} onToggle={() => setReveal((r) => !r)} />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={download}>
                  <Download className="size-3.5" /> Download key file
                </Button>
                <Button variant="outline" size="sm" disabled={funding} onClick={fundAgent}>
                  <Droplet className="size-3.5" /> {funding ? "Funding…" : "Fund agent for fees"}
                </Button>
              </div>

              <label className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--purple)]"
                />
                I've saved the secret key somewhere safe.
              </label>

              <Button className="w-full" disabled={!saved || busy} onClick={() => apply(kp.publicKey)}>
                {busy ? "Setting agent…" : "Set as vault agent"}
              </Button>
            </>
          )}

          {mode === "byok" && (
            <>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Paste the agent's <span className="text-foreground">public</span> key. Keep its secret
                in the agent's environment — never here.
              </p>
              <div className="space-y-1.5">
                <Input
                  placeholder="Agent public key G…"
                  value={byok}
                  spellCheck={false}
                  aria-invalid={byok.trim().length > 0 && !isStellarAddress(byok)}
                  className={
                    byok.trim().length > 0 && !isStellarAddress(byok)
                      ? "border-coral/60 focus:border-coral focus:ring-coral/25"
                      : ""
                  }
                  onChange={(e) => setByok(e.target.value)}
                />
                {byok.trim().length > 0 && !isStellarAddress(byok) && (
                  <p className="text-[11px] text-coral">Not a Stellar address (G…, 56 chars).</p>
                )}
              </div>
              <Button
                className="w-full"
                disabled={!isStellarAddress(byok) || busy}
                onClick={() => apply(byok.trim())}
              >
                {busy ? "Setting agent…" : "Set as vault agent"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  value,
  secret,
  reveal,
  onToggle,
}: {
  label: string;
  value: string;
  secret?: boolean;
  reveal?: boolean;
  onToggle?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const masked = secret && !reveal;
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/40 p-2 pl-3">
        <span className="data min-w-0 flex-1 truncate text-[12.5px]">
          {masked ? "•".repeat(24) : value}
        </span>
        {secret && (
          <button onClick={onToggle} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={reveal ? "Hide" : "Reveal"}>
            {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
        <button onClick={copy} className="shrink-0 text-muted-foreground hover:text-purple" aria-label="Copy">
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
