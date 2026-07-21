import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { connect as wConnect, disconnect as wDisconnect, restore } from "../lib/wallet";
import { loadXlm, fundWithFriendbot } from "../lib/stellar";
import { identifyWallet, resetIdentity, track } from "../lib/analytics";
import { setUserWallet } from "../lib/monitoring";

interface WalletCtx {
  address: string | null;
  balance: string | null;
  /** null = unknown/loading, false = account not on-chain yet, true = funded. */
  funded: boolean | null;
  connecting: boolean;
  funding: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  fund: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [funded, setFunded] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [funding, setFunding] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    const { funded: f, balance: b } = await loadXlm(address);
    setFunded(f);
    setBalance(b);
  }, [address]);

  const fund = useCallback(async () => {
    if (!address) return;
    setFunding(true);
    try {
      await fundWithFriendbot(address);
      await refreshBalance();
      track("account_funded", { address });
    } finally {
      setFunding(false);
    }
  }, [address, refreshBalance]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const addr = await wConnect();
      setAddress(addr);
      identifyWallet(addr);
      setUserWallet(addr);
      track("wallet_connected", { address: addr });
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await wDisconnect();
    track("wallet_disconnected");
    resetIdentity();
    setUserWallet(null);
    setAddress(null);
    setBalance(null);
    setFunded(null);
  }, []);

  useEffect(() => {
    // Restore a prior session: attribute activity to the wallet, but don't fire
    // wallet_connected (that would double-count returning users in analytics).
    restore().then((a) => {
      if (!a) return;
      setAddress(a);
      identifyWallet(a);
      setUserWallet(a);
    });
  }, []);

  useEffect(() => {
    if (!address) return;
    refreshBalance();
    const t = setInterval(refreshBalance, 10000);
    return () => clearInterval(t);
  }, [address, refreshBalance]);

  return (
    <Ctx.Provider
      value={{
        address,
        balance,
        funded,
        connecting,
        funding,
        connect,
        disconnect,
        refreshBalance,
        fund,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
