import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { deposit, pay, getVaultState, type VaultState } from "../lib/contract";
import { friendlyError } from "../lib/errors";
import {
  CONTRACT_ID,
  EXPLORER_TX,
  EXPLORER_CONTRACT,
  shortenAddr,
  stroopsToXlm,
  xlmToStroops,
} from "../lib/config";

export function VaultCard({
  refreshKey,
  onChange,
}: {
  refreshKey: number;
  onChange: () => void;
}) {
  const { address, refreshBalance } = useWallet();
  const { notify, update } = useToasts();
  const [state, setState] = useState<VaultState | null>(null);
  const [depositAmt, setDepositAmt] = useState("");
  const [provider, setProvider] = useState("");
  const [payAmt, setPayAmt] = useState("");
  const [busy, setBusy] = useState<"deposit" | "pay" | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getVaultState());
    } catch {
      /* leave previous state */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  const isAgent = !!address && !!state && address === state.agent;

  const runDeposit = async () => {
    if (!address || !(Number(depositAmt) > 0)) return;
    setBusy("deposit");
    const id = notify({ kind: "pending", title: "Funding vault…", message: "Awaiting signature" });
    try {
      const hash = await deposit(address, xlmToStroops(depositAmt));
      update(id, {
        kind: "success",
        title: "Vault funded",
        message: `${depositAmt} XLM deposited`,
        href: EXPLORER_TX(hash),
        hrefLabel: "View transaction",
      });
      setDepositAmt("");
      await Promise.all([load(), refreshBalance()]);
      onChange();
    } catch (e) {
      update(id, { kind: "error", title: "Deposit failed", message: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  };

  const runPay = async () => {
    if (!address || !(Number(payAmt) > 0)) return;
    setBusy("pay");
    const id = notify({ kind: "pending", title: "Agent paying provider…", message: "Awaiting signature" });
    try {
      const hash = await pay(address, provider.trim(), xlmToStroops(payAmt));
      update(id, {
        kind: "success",
        title: "Provider paid",
        message: `${payAmt} XLM released within budget`,
        href: EXPLORER_TX(hash),
        hrefLabel: "View transaction",
      });
      setPayAmt("");
      await load();
      onChange();
    } catch (e) {
      update(id, { kind: "error", title: "Payment blocked", message: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  };

  const cap = state ? Number(stroopsToXlm(state.cap)) : 0;
  const spent = state ? Number(stroopsToXlm(state.spent)) : 0;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;

  return (
    <section className="card vaultcard">
      <header className="card__head">
        <h3 className="card__title">Agent Spend Vault</h3>
        <span className="tag">Level 2 · on-chain budget</span>
      </header>
      <a className="vaultcard__id" href={EXPLORER_CONTRACT(CONTRACT_ID)} target="_blank" rel="noreferrer">
        {shortenAddr(CONTRACT_ID)} ↗
      </a>

      <div className="stats">
        <Stat label="Vault balance" value={state ? stroopsToXlm(state.balance) : "—"} unit="XLM" />
        <Stat label="Spent this epoch" value={state ? stroopsToXlm(state.spent) : "—"} unit="XLM" />
        <Stat label="Remaining budget" value={state ? stroopsToXlm(state.remaining) : "—"} unit="XLM" accent />
      </div>

      <div className="meter">
        <div className="meter__head">
          <span>Epoch budget</span>
          <span>
            {spent.toLocaleString(undefined, { maximumFractionDigits: 2 })} /{" "}
            {cap.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM
          </span>
        </div>
        <div className="meter__track">
          <div className={`meter__fill ${pct > 85 ? "meter__fill--hot" : ""}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="vaultcard__roles">
        <RoleChip label="Owner" addr={state?.owner} you={address === state?.owner} />
        <RoleChip label="Agent" addr={state?.agent} you={isAgent} />
      </div>

      <div className="vaultcard__actions">
        <div className="action">
          <div className="action__title">Fund vault <span className="muted">· anyone</span></div>
          <div className="action__row">
            <input
              className="input"
              type="number"
              min="0"
              placeholder="Amount XLM"
              value={depositAmt}
              onChange={(e) => setDepositAmt(e.target.value)}
            />
            <button
              className="btn btn--primary"
              disabled={!address || !(Number(depositAmt) > 0) || busy !== null}
              onClick={runDeposit}
            >
              {busy === "deposit" ? "Funding…" : "Fund"}
            </button>
          </div>
        </div>

        <div className="action">
          <div className="action__title">
            Agent pays provider <span className="muted">· agent only</span>
          </div>
          <div className="action__col">
            <input
              className="input"
              placeholder="Provider address G…"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              spellCheck={false}
            />
            <div className="action__row">
              <input
                className="input"
                type="number"
                min="0"
                placeholder="Amount XLM"
                value={payAmt}
                onChange={(e) => setPayAmt(e.target.value)}
              />
              <button
                className="btn btn--accent"
                disabled={
                  !address ||
                  !(Number(payAmt) > 0) ||
                  provider.trim().length !== 56 ||
                  busy !== null
                }
                onClick={runPay}
              >
                {busy === "pay" ? "Paying…" : "Pay"}
              </button>
            </div>
            {address && state && !isAgent && (
              <p className="action__note">
                Connected wallet isn't the agent — a <code>pay</code> call will be rejected
                with <code>NotAuthorized</code> (try it to see enforcement live).
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? "stat--accent" : ""}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">
        {value} <span className="stat__unit">{unit}</span>
      </div>
    </div>
  );
}

function RoleChip({ label, addr, you }: { label: string; addr?: string; you?: boolean }) {
  return (
    <div className="rolechip">
      <span className="rolechip__label">{label}</span>
      <span className="rolechip__addr">{addr ? shortenAddr(addr) : "—"}</span>
      {you && <span className="rolechip__you">you</span>}
    </div>
  );
}
