import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { connect as wConnect, disconnect as wDisconnect, restore } from "../lib/wallet";
import { fetchXlmBalance } from "../lib/stellar";

interface WalletCtx {
  address: string | null;
  balance: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    setBalance(await fetchXlmBalance(address));
  }, [address]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const addr = await wConnect();
      setAddress(addr);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await wDisconnect();
    setAddress(null);
    setBalance(null);
  }, []);

  useEffect(() => {
    restore().then((a) => a && setAddress(a));
  }, []);

  useEffect(() => {
    if (!address) return;
    refreshBalance();
    const t = setInterval(refreshBalance, 10000);
    return () => clearInterval(t);
  }, [address, refreshBalance]);

  return (
    <Ctx.Provider
      value={{ address, balance, connecting, connect, disconnect, refreshBalance }}
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
