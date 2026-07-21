// Product analytics via PostHog. Fully env-gated: with no VITE_POSTHOG_KEY the
// whole module is a no-op, so local dev and CI never phone home and the build
// works without any account. It "lights up" the moment a key is present.
//
// Wallet-based identity: we identify users by their Stellar address (not email),
// which is the only stable id we have. That makes the L4/L5 "proof of N users +
// wallet interactions" reports fall straight out of the PostHog dashboard.

import posthog from "posthog-js";

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

export const analyticsEnabled = Boolean(KEY);

/** All product events flow through this union so names stay consistent. */
export type AppEvent =
  | "wallet_connected"
  | "wallet_disconnected"
  | "account_funded"
  | "vault_created"
  | "xlm_sent"
  | "policy_set"
  | "provider_limit_set"
  | "agent_set"
  | "agent_payment"
  | "deposit"
  | "withdraw"
  | "feedback_submitted"
  | "error_shown";

export function initAnalytics() {
  if (!analyticsEnabled) return;
  posthog.init(KEY!, {
    api_host: HOST,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage",
    // We call identify() ourselves on wallet connect.
    person_profiles: "identified_only",
  });
}

export function track(event: AppEvent, props?: Record<string, unknown>) {
  if (!analyticsEnabled) return;
  posthog.capture(event, props);
}

/** Tie the session to a wallet address so activity is attributable per user. */
export function identifyWallet(address: string) {
  if (!analyticsEnabled) return;
  posthog.identify(address, { wallet: address, chain: "stellar" });
}

export function resetIdentity() {
  if (!analyticsEnabled) return;
  posthog.reset();
}
