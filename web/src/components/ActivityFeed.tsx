import { useEffect, useRef, useState } from "react";
import { fetchEvents, type VaultEvent } from "../lib/contract";
import { EXPLORER_TX, shortenAddr, stroopsToXlm } from "../lib/config";

const LABEL: Record<string, string> = {
  funded: "Vault funded",
  paid: "Agent paid provider",
  policy: "Policy updated",
  withdraw: "Owner withdrawal",
};

export function ActivityFeed({ refreshKey }: { refreshKey: number }) {
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const { events: evs } = await fetchEvents();
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
  }, [refreshKey]);

  return (
    <section className="card feed">
      <header className="card__head">
        <h3 className="card__title">
          Live activity <span className="feed__pulse" />
        </h3>
        <span className="tag">streamed from contract events</span>
      </header>

      {loading && events.length === 0 && <div className="feed__empty">Listening for events…</div>}
      {!loading && events.length === 0 && (
        <div className="feed__empty">No events yet. Fund the vault to see it live.</div>
      )}

      <ul className="feed__list">
        {events.map((e) => (
          <li key={e.id} className={`feed__item feed__item--${e.kind}`}>
            <span className={`feed__dot feed__dot--${e.kind}`} />
            <div className="feed__main">
              <div className="feed__title">{LABEL[e.kind] ?? e.kind}</div>
              <div className="feed__meta">
                {e.who && <span>{shortenAddr(e.who)}</span>}
                {e.amount !== undefined && (
                  <span className="feed__amt">{stroopsToXlm(e.amount)} XLM</span>
                )}
                {e.remaining !== undefined && (
                  <span className="muted">· {stroopsToXlm(e.remaining)} XLM left</span>
                )}
              </div>
            </div>
            {e.txHash && (
              <a className="feed__link" href={EXPLORER_TX(e.txHash)} target="_blank" rel="noreferrer">
                ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
