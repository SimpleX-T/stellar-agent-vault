import { Wallet } from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { Card, CardContent } from "./ui/card";

export function BalanceCard() {
  const { address, balance } = useWallet();
  const display =
    address && balance
      ? Number(balance).toLocaleString(undefined, { maximumFractionDigits: 4 })
      : "—";

  return (
    <Card className="group relative overflow-hidden">
      <span className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-neon-cyan/10 blur-2xl" />
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Your wallet balance
          </span>
          <Wallet className="size-4 text-muted-foreground transition-colors group-hover:text-neon-cyan" />
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[34px] font-bold leading-none tracking-tight tnum">{display}</span>
          <span className="text-sm font-semibold text-neon-cyan">XLM</span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {address ? "Testnet · auto-refreshes" : "Connect a wallet to see your balance"}
        </div>
      </CardContent>
    </Card>
  );
}
