import { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { sendXlm } from "../lib/stellar";
import { friendlyError } from "../lib/errors";
import { EXPLORER_TX } from "../lib/config";

export function SendXlmCard() {
  const { address, refreshBalance } = useWallet();
  const { notify, update } = useToasts();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = address && to.trim().startsWith("G") && to.trim().length === 56 && Number(amount) > 0;

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
    <section className="card">
      <header className="card__head">
        <h3 className="card__title">Send XLM</h3>
        <span className="tag">Level 1 · direct payment</span>
      </header>
      <p className="card__sub">A plain testnet payment — the agent's instant-pay fallback.</p>

      <label className="field">
        <span className="field__label">Destination address</span>
        <input
          className="input"
          placeholder="G…"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span className="field__label">Amount (XLM)</span>
        <input
          className="input"
          type="number"
          min="0"
          step="0.0000001"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <button className="btn btn--primary btn--block" disabled={!valid || busy} onClick={onSend}>
        {busy ? "Sending…" : address ? "Send payment" : "Connect wallet to send"}
      </button>
    </section>
  );
}
