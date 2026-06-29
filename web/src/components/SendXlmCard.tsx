import { useState } from "react";
import { Send } from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { sendXlm } from "../lib/stellar";
import { friendlyError } from "../lib/errors";
import { EXPLORER_TX } from "../lib/config";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

export function SendXlmCard() {
  const { address, refreshBalance } = useWallet();
  const { notify, update } = useToasts();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const valid =
    !!address && to.trim().startsWith("G") && to.trim().length === 56 && Number(amount) > 0;

  const onSend = async () => {
    if (!address || !valid) return;
    setBusy(true);
    const id = notify({ kind: "pending", title: "Sending XLM…", message: "Awaiting signature" });
    try {
      const hash = await sendXlm(address, to.trim(), amount.trim());
      update(id, {
        kind: "success",
        title: "Payment sent",
        message: `${amount} XLM delivered`,
        href: EXPLORER_TX(hash),
        hrefLabel: "View transaction",
      });
      setTo("");
      setAmount("");
      refreshBalance();
    } catch (e) {
      update(id, { kind: "error", title: "Payment failed", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold tracking-tight">Send XLM</h3>
          <Badge>Level 1 · direct pay</Badge>
        </div>
        <p className="text-[13px] text-muted-foreground">
          A plain testnet payment — the agent's instant-pay fallback.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Destination address</label>
          <Input placeholder="G…" value={to} spellCheck={false} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Amount (XLM)</label>
          <Input
            type="number"
            min="0"
            step="0.0000001"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <Button className="w-full" disabled={!valid || busy} onClick={onSend}>
          <Send className="size-4" />
          {busy ? "Sending…" : address ? "Send payment" : "Connect wallet to send"}
        </Button>
      </CardContent>
    </Card>
  );
}
