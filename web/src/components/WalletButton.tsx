import { Wallet, LogOut, ExternalLink } from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { friendlyError } from "../lib/errors";
import { shortenAddr, EXPLORER_ACCOUNT } from "../lib/config";
import { Button } from "./ui/button";

export function WalletButton() {
  const { address, connecting, connect, disconnect } = useWallet();
  const { notify } = useToasts();

  const onConnect = async () => {
    try {
      await connect();
    } catch (e) {
      notify({ kind: "error", title: "Couldn't connect", message: friendlyError(e) });
    }
  };

  if (!address) {
    return (
      <Button onClick={onConnect} disabled={connecting}>
        <Wallet className="size-4" />
        {connecting ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }

  return (
    <div className="glass flex items-center gap-2 rounded-full py-1.5 pl-3.5 pr-1.5">
      <span className="size-2 rounded-full bg-neon-cyan pulse-dot" />
      <a
        href={EXPLORER_ACCOUNT(address)}
        target="_blank"
        rel="noreferrer"
        title={address}
        className="flex items-center gap-1 text-[13px] font-semibold tnum hover:text-neon-cyan"
      >
        {shortenAddr(address)}
        <ExternalLink className="size-3 opacity-60" />
      </a>
      <Button size="sm" variant="ghost" onClick={disconnect} className="rounded-full">
        <LogOut className="size-3.5" />
      </Button>
    </div>
  );
}
