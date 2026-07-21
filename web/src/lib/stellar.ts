// Server instances + classic-account helpers (balance, plain XLM payment for L1).

import {
  Horizon,
  rpc,
  Keypair,
  StrKey,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { HORIZON_URL, RPC_URL, NETWORK_PASSPHRASE } from "./config";
import { signTx } from "./wallet";
import { submitAndConfirm } from "./contract";

export const horizon = new Horizon.Server(HORIZON_URL);
export const server = new rpc.Server(RPC_URL);

/**
 * True only for a valid Stellar ed25519 public key (G…, checksum-verified).
 * Rejects EVM `0x…` addresses, malformed G-strings, contract (C…) and muxed
 * (M…) addresses — none of which are valid payment/role destinations here.
 */
export function isStellarAddress(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value.trim());
}

/**
 * Mint a fresh Stellar keypair for an agent. This is the agent's *own* identity,
 * separate from the owner's wallet: its public key becomes the vault's `agent`,
 * and its secret goes into the agent runtime so it can sign `pay` calls — while
 * the contract still caps what it can ever spend. Generated client-side; the
 * secret never leaves the browser.
 */
export function generateAgentKeypair(): { publicKey: string; secret: string } {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secret: kp.secret() };
}

/** Funded state + native XLM balance for a classic account. */
export async function loadXlm(
  address: string,
): Promise<{ funded: boolean; balance: string }> {
  try {
    const acct = await horizon.loadAccount(address);
    const native = acct.balances.find((b) => b.asset_type === "native");
    return { funded: true, balance: native?.balance ?? "0" };
  } catch (e: unknown) {
    // Horizon 404 => account doesn't exist on-chain (not funded yet).
    if (e && typeof e === "object" && "response" in e) return { funded: false, balance: "0" };
    throw e;
  }
}

/** Native XLM balance of a classic account. Returns "0" if the account is unfunded. */
export async function fetchXlmBalance(address: string): Promise<string> {
  return (await loadXlm(address)).balance;
}

/**
 * Fund a testnet account via Friendbot (the standard faucet). Resolves once the
 * account exists; treats "already funded" as success so it's safe to retry.
 */
export async function fundWithFriendbot(address: string): Promise<void> {
  if (!isStellarAddress(address)) throw new Error("Invalid Stellar address.");
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  if (/already.?funded|op_already_exists|createAccountAlreadyExist/i.test(body)) return;
  throw new Error("Friendbot couldn't fund this account right now — try again in a moment.");
}

/**
 * L1: send a plain XLM payment on testnet.
 * Returns the confirmed transaction hash.
 */
export async function sendXlm(
  from: string,
  destination: string,
  amount: string,
): Promise<string> {
  const account = await server.getAccount(from);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({ destination, asset: Asset.native(), amount }),
    )
    .setTimeout(60)
    .build();

  const signedXdr = await signTx(tx.toXDR(), from);
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  return (await submitAndConfirm(signed)).hash;
}
