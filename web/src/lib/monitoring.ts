// Error tracking via Sentry. Env-gated on VITE_SENTRY_DSN: with no DSN this is a
// no-op and Sentry.ErrorBoundary still renders its fallback, it just doesn't
// report. Free "Developer" tier is plenty for an MVP.

import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export const monitoringEnabled = Boolean(DSN);

export function initMonitoring() {
  if (!monitoringEnabled) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Keep volume inside the free tier while still catching regressions.
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    // Wallet rejections / expected contract errors are not bugs — drop them.
    ignoreErrors: [/reject/i, /denied/i, /declined/i, /user closed/i],
  });
}

/**
 * Report a genuinely unexpected error. Call this at catch sites for failures
 * that aren't user-facing "handled" cases (those go through friendlyError()).
 */
export function captureError(e: unknown, context?: Record<string, unknown>) {
  if (!monitoringEnabled) return;
  Sentry.captureException(e, context ? { extra: context } : undefined);
}

/** Attach the connected wallet to the Sentry scope so errors are attributable. */
export function setUserWallet(address: string | null) {
  if (!monitoringEnabled) return;
  Sentry.setUser(address ? { id: address } : null);
}

export const ErrorBoundary = Sentry.ErrorBoundary;
