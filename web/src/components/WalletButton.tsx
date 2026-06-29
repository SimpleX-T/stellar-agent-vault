import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { friendlyError } from "../lib/errors";
import { shortenAddr, EXPLORER_ACCOUNT } from "../lib/config";

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
      <button className="btn btn--primary" onClick={onConnect} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div className="walletchip">
      <span className="walletchip__dot" />
      <a
        className="walletchip__addr"
        href={EXPLORER_ACCOUNT(address)}
        target="_blank"
        rel="noreferrer"
        title={address}
      >
        {shortenAddr(address)}
      </a>
      <button className="walletchip__disc" onClick={disconnect} title="Disconnect">
        Disconnect
      </button>
    </div>
  );
}
