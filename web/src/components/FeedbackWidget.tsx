import { useState } from "react";
import { MessageSquarePlus, Star, X } from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import { track } from "../lib/analytics";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

// Floating in-app feedback capture (L4 requirement). A rating + optional note
// are sent to PostHog as `feedback_submitted`, tied to the connected wallet, so
// responses land in the same dashboard as product analytics and are per-user
// attributable. No backend of our own to run.
export function FeedbackWidget() {
  const { address } = useWallet();
  const { notify } = useToasts();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  const submit = () => {
    if (!rating) return;
    track("feedback_submitted", { rating, comment: comment.trim(), wallet: address ?? null });
    setSent(true);
    notify({ kind: "success", title: "Thanks for the feedback", message: "It helps shape what ships next." });
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      setRating(0);
      setComment("");
    }, 900);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="btn-neon fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-[0_10px_30px_-8px_var(--glow-1)]"
          aria-label="Give feedback"
        >
          <MessageSquarePlus className="size-4" />
          Feedback
        </button>
      )}

      {open && (
        <div className="glass neon-ring fixed bottom-5 right-5 z-40 w-[min(92vw,340px)] rounded-xl p-4 shadow-[0_24px_60px_-24px_var(--glow-1)]">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-display text-sm font-semibold tracking-tight">How's SpendVault?</h4>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close feedback"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mb-3 flex items-center gap-1.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                aria-label={`Rate ${n} of 5`}
              >
                <Star
                  className={cn(
                    "size-6 transition-colors",
                    (hover || rating) >= n
                      ? "fill-[var(--neon-cyan)] text-[var(--neon-cyan)]"
                      : "text-muted-foreground/40",
                  )}
                />
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What worked, what didn't? (optional)"
            rows={3}
            className="mb-3 w-full resize-none rounded-lg border border-border bg-background/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-[color-mix(in_oklch,var(--neon-cyan)_45%,var(--border))]"
          />

          <Button className="w-full" disabled={!rating || sent} onClick={submit}>
            {sent ? "Sent ✓" : "Send feedback"}
          </Button>
        </div>
      )}
    </>
  );
}
