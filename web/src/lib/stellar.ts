// Server instances + classic-account helpers (balance, plain XLM payment for L1).

import {
  Horizon,
  rpc,
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

/** Native XLM balance of a classic account. Returns "0" if the account is unfunded. */
export async function fetchXlmBalance(address: string): Promise<string> {
  try {
    const acct = await horizon.loadAccount(address);
    const native = acct.balances.find((b) => b.asset_type === "native");
    return native?.balance ?? "0";
  } catch (e: unknown) {
    // Horizon 404 => account not funded yet.
    if (e && typeof e === "object" && "response" in e) return "0";
    throw e;
  }
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
  return submitAndConfirm(signed);
}
