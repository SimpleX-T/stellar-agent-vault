import { useWallet } from "../hooks/useWallet";

export function BalanceCard() {
  const { address, balance } = useWallet();
  const display = balance ? Number(balance).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  }) : "—";

  return (
    <section className="card balancecard">
      <div className="card__label">Your wallet balance</div>
      <div className="balancecard__amount">
        <span className="balancecard__num">{address ? display : "—"}</span>
        <span className="balancecard__unit">XLM</span>
      </div>
      <div className="balancecard__hint">
        {address ? "Testnet · auto-refreshes" : "Connect a wallet to see your balance"}
      </div>
    </section>
  );
}
