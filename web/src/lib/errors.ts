// Maps raw Soroban / wallet errors into messages a user can act on.
// The contract error codes mirror the `Error` enum in contracts/spend-vault/src/lib.rs.

const CONTRACT_ERRORS: Record<number, string> = {
  1: "Vault is not initialized.",
  2: "Vault is already initialized.",
  3: "You are not authorized for this action.",
  4: "Budget exceeded — this would go over the per-epoch cap.",
  5: "Provider limit exceeded for this epoch.",
  6: "Insufficient vault balance for this amount.",
  7: "Invalid amount.",
};

export function friendlyError(e: unknown): string {
  const raw =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Something went wrong.";

  // Wallet rejections (Freighter / xBull / etc.)
  if (/reject|denied|declined|cancel|user closed/i.test(raw)) {
    return "Request rejected in your wallet.";
  }
  if (/No wallet has been connected|set the wallet first/i.test(raw)) {
    return "Connect a wallet first.";
  }

  // Contract error codes: "Error(Contract, #4)"
  const m = raw.match(/Error\(Contract,\s*#(\d+)\)/);
  if (m) {
    const code = Number(m[1]);
    return CONTRACT_ERRORS[code] ?? `Contract rejected the call (code ${code}).`;
  }

  if (/insufficient/i.test(raw)) return "Insufficient balance.";
  if (/op_no_destination|destination/i.test(raw))
    return "Destination account does not exist on testnet.";
  if (/tx_bad_seq|sequence/i.test(raw)) return "Network out of sync — try again.";

  // Trim noisy host-function dumps.
  return raw.length > 160 ? raw.slice(0, 157) + "…" : raw;
}
