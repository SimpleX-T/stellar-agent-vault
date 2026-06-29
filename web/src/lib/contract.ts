// Soroban contract layer: read-only views (simulate), state-changing calls
// (prepare → sign → submit → confirm), and the live event feed.

import {
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  type Transaction,
  type FeeBumpTransaction,
  type xdr,
} from "@stellar/stellar-sdk";
import {
  RPC_URL,
  NETWORK_PASSPHRASE,
  CONTRACT_ID,
  READ_SOURCE,
} from "./config";
import { signTx } from "./wallet";

const server = new rpc.Server(RPC_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- argument helpers ----
const addr = (a: string) => nativeToScVal(a, { type: "address" });
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });

// ---- read-only views ----

/** Simulate a contract call and decode the return value (no signing, no fees). */
async function readView(method: string, args: xdr.ScVal[] = []): Promise<unknown> {
  const account = await server.getAccount(READ_SOURCE);
  const contract = new Contract(CONTRACT_ID);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`view ${method} failed: ${sim.error}`);
  }
  const retval = sim.result?.retval;
  return retval ? scValToNative(retval) : null;
}

export interface VaultState {
  owner: string;
  agent: string;
  cap: bigint;
  epochLen: bigint;
  spent: bigint;
  remaining: bigint;
  balance: bigint;
}

export async function getVaultState(): Promise<VaultState> {
  const [owner, agent, cap, epochLen, spent, remaining, balance] =
    await Promise.all([
      readView("get_owner"),
      readView("get_agent"),
      readView("get_cap"),
      readView("get_epoch_len"),
      readView("get_spent"),
      readView("get_remaining"),
      readView("get_balance"),
    ]);
  return {
    owner: owner as string,
    agent: agent as string,
    cap: BigInt(cap as bigint),
    epochLen: BigInt(epochLen as bigint),
    spent: BigInt(spent as bigint),
    remaining: BigInt(remaining as bigint),
    balance: BigInt(balance as bigint),
  };
}

// ---- submit helpers (shared with classic payments) ----

/** Submit a signed transaction and poll until it confirms. Returns the tx hash. */
export async function submitAndConfirm(
  signed: Transaction | FeeBumpTransaction,
): Promise<string> {
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new Error(`submit failed: ${JSON.stringify(sent.errorResult)}`);
  }
  const hash = sent.hash;
  for (let i = 0; i < 30; i++) {
    const res = await server.getTransaction(hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return hash;
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`transaction failed on-chain (${hash})`);
    }
    await sleep(1000);
  }
  throw new Error(`transaction not confirmed in time (${hash})`);
}

/** Prepare (simulate+assemble), sign with the wallet, submit, and confirm. */
async function invoke(
  method: string,
  args: xdr.ScVal[],
  caller: string,
): Promise<string> {
  const account = await server.getAccount(caller);
  const contract = new Contract(CONTRACT_ID);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(built);
  const signedXdr = await signTx(prepared.toXDR(), caller);
  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  return submitAndConfirm(signed);
}

// ---- state-changing calls ----

/** Fund the vault (permissionless — any wallet may deposit). */
export const deposit = (from: string, amountStroops: bigint) =>
  invoke("deposit", [addr(from), i128(amountStroops)], from);

/** Owner-only: pay a provider within policy (agent key authorizes). */
export const pay = (agent: string, provider: string, amountStroops: bigint) =>
  invoke("pay", [addr(provider), i128(amountStroops)], agent);

/** Owner-only: update the per-epoch cap. */
export const setPolicy = (owner: string, capStroops: bigint, epochLen: bigint) =>
  invoke(
    "set_policy",
    [i128(capStroops), nativeToScVal(epochLen, { type: "u64" })],
    owner,
  );

/** Owner-only: reclaim funds. */
export const withdraw = (owner: string, to: string, amountStroops: bigint) =>
  invoke("withdraw", [addr(to), i128(amountStroops)], owner);

// ---- live event feed ----

export interface VaultEvent {
  kind: string; // funded | paid | policy | withdraw
  who?: string;
  amount?: bigint;
  remaining?: bigint;
  epoch?: bigint;
  ledger: number;
  txHash: string;
  id: string;
}

function parseEvent(e: rpc.Api.EventResponse): VaultEvent {
  const topics = e.topic.map((t) => scValToNative(t));
  const kind = String(topics[0]);
  const who = topics[1] ? String(topics[1]) : undefined;
  const value = scValToNative(e.value);

  const ev: VaultEvent = {
    kind,
    who,
    ledger: e.ledger,
    txHash: e.txHash ?? "",
    id: e.id,
  };
  if (kind === "paid" && Array.isArray(value)) {
    ev.amount = BigInt(value[0]);
    ev.remaining = BigInt(value[1]);
    ev.epoch = BigInt(value[2]);
  } else if (typeof value === "bigint" || typeof value === "number") {
    ev.amount = BigInt(value);
  }
  return ev;
}

/**
 * Fetch recent contract events.
 *
 * `getEvents` scans *ascending* from `startLedger` with a per-request scan
 * limit, so a wide window returns an empty first page (our events sit near the
 * tip). We page forward with the cursor to drain the window, then return events
 * newest-first.
 */
export async function fetchEvents(windowLedgers = 2000): Promise<{
  events: VaultEvent[];
  latestLedger: number;
}> {
  const latest = await server.getLatestLedger();
  const start = Math.max(latest.sequence - windowLedgers, 1);
  const filters = [{ type: "contract" as const, contractIds: [CONTRACT_ID] }];

  // A window this size fits in a single scan page, so events near the tip come
  // back on the first call. We still follow the cursor a few times defensively.
  const collected: rpc.Api.EventResponse[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 4; page++) {
    const res = await server.getEvents(
      cursor
        ? { cursor, filters, limit: 200 }
        : { startLedger: start, filters, limit: 200 },
    );
    collected.push(...res.events);
    cursor = res.cursor;
    if (!cursor || res.events.length === 0) break;
  }

  const events = collected.map(parseEvent).reverse();
  return { events, latestLedger: latest.sequence };
}
