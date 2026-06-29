import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, Send, SlidersHorizontal, ArrowUpFromLine, ExternalLink } from "lucide-react";
import { fetchEvents, type VaultEvent } from "../lib/contract";
import { EXPLORER_TX, shortenAddr, stroopsToXlm } from "../lib/config";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";

const META: Record<string, { label: string; icon: React.ReactNode; dot: string }> = {
  funded: { label: "Vault funded", icon: <ArrowDownToLine className="size-3.5" />, dot: "bg-neon-violet" },
  paid: { label: "Agent paid provider", icon: <Send className="size-3.5" />, dot: "bg-neon-cyan" },
  policy: { label: "Policy updated", icon: <SlidersHorizontal className="size-3.5" />, dot: "bg-warning" },
  withdraw: { label: "Owner withdrawal", icon: <ArrowUpFromLine className="size-3.5" />, dot: "bg-destructive" },
};

export function ActivityFeed({ vaultId, refreshKey }: { vaultId: string; refreshKey: number }) {
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEvents([]);
    seen.current = new Set();
    const poll = async () => {
      try {
        const { events: evs } = await fetchEvents(vaultId);
        if (!alive) return;
        evs.forEach((e) => seen.current.add(e.id));
        setEvents(evs.slice(0, 25));
      } catch {
        /* keep prior */
      } finally {
        if (alive) setLoading(false);
      }
    };
    poll();
    const t = setInterval(poll, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [vaultId, refreshKey]);

  return (
    <Card className="overflow-hidden">
      <CardContent>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            Live activity
            <span className="size-2 rounded-full bg-neon-cyan pulse-dot" />
          </h3>
          <Badge>contract events</Badge>
        </div>

        {loading && events.length === 0 && (
          <div className="py-8 text-center text-[13px] text-muted-foreground">Listening for events…</div>
        )}
        {!loading && events.length === 0 && (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            No events yet. Fund the vault to see it stream.
          </div>
        )}

        <ul className="mt-3 flex max-h-[520px] flex-col gap-1 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const m = META[e.kind] ?? { label: e.kind, icon: null, dot: "bg-muted-foreground" };
              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/40"
                >
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-background ${m.dot}`}>
                    {m.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{m.label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground tnum">
                      {e.who && <span>{shortenAddr(e.who)}</span>}
                      {e.amount !== undefined && (
                        <span className="font-semibold text-neon-cyan">{stroopsToXlm(e.amount)} XLM</span>
                      )}
                      {e.remaining !== undefined && <span>· {stroopsToXlm(e.remaining)} left</span>}
                    </div>
                  </div>
                  {e.txHash && (
                    <a
                      href={EXPLORER_TX(e.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground/60 transition-colors hover:text-neon-cyan"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </CardContent>
    </Card>
  );
}
