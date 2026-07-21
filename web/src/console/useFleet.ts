// Loads the connected operator's wallet fleet + each wallet's on-chain state.
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { walletsOf, getWalletState, type WalletState } from "../lib/agentWallet";

export interface Fleet {
  wallets: WalletState[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  totals: { count: number; tvl: bigint; spent: bigint; remaining: bigint };
}

export function useFleet(): Fleet {
  const { address } = useWallet();
  const [wallets, setWallets] = useState<WalletState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!address) {
      setWallets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ids = await walletsOf(address);
        const states = await Promise.all(
          ids.map((id) => getWalletState(id).catch(() => null)),
        );
        if (!cancelled) setWallets(states.filter((s): s is WalletState => s !== null));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, tick]);

  const totals = wallets.reduce(
    (a, w) => ({
      count: a.count + 1,
      tvl: a.tvl + w.balance,
      spent: a.spent + w.spent,
      remaining: a.remaining + w.remaining,
    }),
    { count: 0, tvl: 0n, spent: 0n, remaining: 0n },
  );

  return { wallets, loading, error, refresh, totals };
}
