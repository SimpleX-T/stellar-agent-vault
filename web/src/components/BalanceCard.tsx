import { Wallet, Droplet } from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { friendlyError } from "../lib/errors";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

export function BalanceCard() {
  const { address, balance, funded, funding, fund } = useWallet();
  const { notify } = useToasts();
  const display =
    address && balance
      ? Number(balance).toLocaleString(undefined, { maximumFractionDigits: 4 })
      : "—";

  const onFund = async () => {
    try {
      await fund();
      notify({ kind: "success", title: "Account funded", message: "10,000 testnet XLM added — you're ready to go." });
    } catch (e) {
      notify({ kind: "error", title: "Funding failed", message: friendlyError(e) });
    }
  };

  const needsFunding = !!address && funded === false;

  return (
    <Card className="group relative overflow-hidden">
      <span className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-purple/15 blur-2xl" />
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Your wallet balance
          </span>
          <Wallet className="size-4 text-muted-foreground transition-colors group-hover:text-purple" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="data text-[34px] font-semibold leading-none">{display}</span>
          <span className="text-sm font-semibold text-purple">XLM</span>
        </div>
        {needsFunding ? (
          <div className="mt-4 rounded-xl border border-coral/30 bg-coral/[0.07] p-3">
            <div className="text-xs text-coral">
              This account isn't on testnet yet. Fund it with free XLM to create vaults and pay.
            </div>
            <Button size="sm" className="mt-2.5 w-full" disabled={funding} onClick={onFund}>
              <Droplet className="size-3.5" />
              {funding ? "Funding…" : "Fund testnet account"}
            </Button>
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">
            {address ? "Testnet · auto-refreshes" : "Connect a wallet to see your balance"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
