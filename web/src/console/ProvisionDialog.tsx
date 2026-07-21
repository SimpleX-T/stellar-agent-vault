import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Bot, Check, Loader2 } from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { createWallet, setPolicy, setAllowlistEnforced } from "../lib/agentWallet";
import { setAgentMeta, MODELS } from "../lib/agentMeta";
import { friendlyError } from "../lib/errors";
import { track } from "../lib/analytics";
import { xlmToStroops, shortenAddr, EXPLORER_TX } from "../lib/config";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Eyebrow, Field } from "./ui";

const WINDOWS: { label: string; secs: bigint }[] = [
  { label: "1 hour", secs: 3600n },
  { label: "1 day", secs: 86_400n },
  { label: "1 week", secs: 604_800n },
];

type Step = "idle" | "creating" | "policy" | "allowlist" | "done";

export function ProvisionDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { address } = useWallet();
  const { notify, update } = useToasts();
  const [name, setName] = useState("");
  const [model, setModel] = useState<string>(MODELS[0]);
  const [maxPer, setMaxPer] = useState("250");
  const [cap, setCap] = useState("500");
  const [win, setWin] = useState<bigint>(86_400n);
  const [allowlist, setAllowlist] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const busy = step !== "idle" && step !== "done";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const deploy = async () => {
    if (!address || !maxPer) return;
    const id = notify({ kind: "pending", title: "Deploying agent wallet…", message: "Sign to create" });
    try {
      setStep("creating");
      const { walletId, hash } = await createWallet(address);
      if (name || model) setAgentMeta(walletId, { name: name.trim() || undefined, model });

      update(id, { kind: "pending", title: "Setting policy…", message: "Sign the policy" });
      setStep("policy");
      await setPolicy(walletId, address, xlmToStroops(maxPer), cap ? xlmToStroops(cap) : 0n, win);

      if (allowlist) {
        update(id, { kind: "pending", title: "Enabling allowlist…", message: "Sign once more" });
        setStep("allowlist");
        await setAllowlistEnforced(walletId, address, true);
      }

      setStep("done");
      update(id, {
        kind: "success",
        title: `${name.trim() || "Agent"} provisioned`,
        message: `${shortenAddr(walletId)} — funded rules are live on-chain.`,
        href: EXPLORER_TX(hash),
        hrefLabel: "View transaction",
      });
      track("wallet_provisioned", { walletId, allowlist, model });
      onCreated();
      onClose();
    } catch (e) {
      update(id, { kind: "error", title: "Couldn't finish provisioning", message: friendlyError(e) });
      setStep("idle");
      onCreated(); // a partial wallet may still exist — refresh the fleet
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: "creating", label: "Deploy wallet" },
    { key: "policy", label: "Set policy" },
    ...(allowlist ? [{ key: "allowlist" as Step, label: "Enable allowlist" }] : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-background/70 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()} role="dialog" aria-modal="true">
      <div className="glass neon-ring w-full max-w-md overflow-hidden rounded-2xl glow" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <Eyebrow>Provision</Eyebrow>
            <h3 className="mt-1 font-display text-[19px] font-semibold tracking-tight">New agent wallet</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Deploys a Soroban smart account on testnet. The relayer covers fees — the wallet starts gasless, with zero XLM.
            </p>
          </div>
          <button onClick={() => !busy && onClose()} className="shrink-0 text-muted-foreground/70 hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {busy || step === "done" ? (
          <Progress steps={steps} current={step} />
        ) : (
          <div className="space-y-4 p-5">
            <Field label="Agent name" hint="local label">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vega" spellCheck={false} />
            </Field>

            <div className="space-y-1.5">
              <span className="text-[12.5px] font-medium text-foreground">Model</span>
              <div className="flex flex-wrap gap-1.5">
                {MODELS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={`data rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors ${
                      model === m ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Per-transfer limit" hint="XLM">
                <Input value={maxPer} onChange={(e) => setMaxPer(e.target.value)} placeholder="250" inputMode="decimal" />
              </Field>
              <Field label="Epoch cap" hint="0 = none">
                <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="500" inputMode="decimal" />
              </Field>
            </div>

            <div className="space-y-1.5">
              <span className="text-[12.5px] font-medium text-foreground">Epoch window</span>
              <div className="flex gap-2">
                {WINDOWS.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => setWin(o.secs)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-[12px] transition-colors ${
                      win === o.secs ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setAllowlist((a) => !a)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-foreground/[0.02] p-3 text-left"
            >
              <span>
                <span className="block text-[13px] font-medium">Enforce recipient allowlist</span>
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">Block transfers to any address you haven't allowed</span>
              </span>
              <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${allowlist ? "bg-primary" : "bg-foreground/15"}`}>
                <span className={`absolute top-0.5 grid size-5 place-items-center rounded-full bg-background transition-all ${allowlist ? "left-[22px]" : "left-0.5"}`}>
                  {allowlist && <Check className="size-3 text-primary" />}
                </span>
              </span>
            </button>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" disabled={!maxPer || !address} onClick={deploy}>
                Deploy wallet
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              {allowlist ? "3" : "2"} signatures · you pay a few stroops of gas
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Progress({ steps, current }: { steps: { key: Step; label: string }[]; current: Step }) {
  const order: Step[] = ["creating", "policy", "allowlist", "done"];
  const idx = order.indexOf(current);
  return (
    <div className="space-y-3 p-5">
      {steps.map((s) => {
        const sIdx = order.indexOf(s.key);
        const state = current === "done" || sIdx < idx ? "done" : sIdx === idx ? "active" : "pending";
        return (
          <div key={s.key} className="flex items-center gap-3">
            <span className={`grid size-7 place-items-center rounded-full border ${state === "done" ? "border-primary bg-primary/15 text-primary" : state === "active" ? "border-primary/50 text-primary" : "border-border text-muted-foreground/50"}`}>
              {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
            </span>
            <span className={`text-[13.5px] ${state === "pending" ? "text-muted-foreground/60" : "text-foreground"}`}>{s.label}</span>
          </div>
        );
      })}
      <p className="pt-1 text-[11.5px] text-muted-foreground">Approve each prompt in your wallet. Keep this open until it's done.</p>
    </div>
  );
}
