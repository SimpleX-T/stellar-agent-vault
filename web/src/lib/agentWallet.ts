// Contract layer for the AgentWallet smart-account model.
//
// Two kinds of writes live here, and the difference is the whole security story:
//
//   • Operator admin ops (create wallet, set policy, add/rotate agent, allowlist)
//     are signed *non-custodially* by the operator's own connected wallet. The
//     operator is the wallet's Admin signer, so their `signAuthEntry` satisfies
//     `__check_auth`, and they also sign the envelope (paying their own small
//     gas). No server ever holds the admin key.
//
//   • Agent spending is NOT done here — an autonomous agent uses the least-priv
//     Spender key through the relayer service (gasless). The console never sees
//     the agent's secret.
//
// Reads are plain simulations against a funded READ_SOURCE and touch no secret.

import {
  rpc,
  Contract,
  Address,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  StrKey,
  authorizeEntry,
  nativeToScVal,
  scValToNative,
  type xdr,
} from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { RPC_URL, NETWORK_PASSPHRASE, WALLET_FACTORY_ID, TOKEN_ID, READ_SOURCE } from "./config";
import { signTx } from "./wallet";

const server = new rpc.Server(RPC_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- ScVal helpers ----
const addr = (a: string) => Address.fromString(a).toScVal();
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const u64 = (n: bigint) => nativeToScVal(n, { type: "u64" });
const bool = (b: boolean) => nativeToScVal(b, { type: "bool" });
const roleScVal = (r: "admin" | "spender") => nativeToScVal(r === "admin" ? 1 : 0, { type: "u32" });
/** A G… account address as its raw 32-byte ed25519 key — the wallet's signer id. */
const pubkeyBytes = (g: string) =>
  nativeToScVal(StrKey.decodeEd25519PublicKey(g), { type: "bytes" });

// ---- reads ----
async function readView(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<unknown> {
  const source = await server.getAccount(READ_SOURCE);
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) {
    throw new Error(`view ${method} failed: ${(sim as rpc.Api.SimulateTransactionErrorResponse).error ?? "no result"}`);
  }
  return scValToNative(sim.result.retval);
}

export interface TokenPolicy {
  maxPerTransfer: bigint;
  epochCap: bigint;
  epochLen: bigint;
}

export interface WalletState {
  id: string;
  policy: TokenPolicy;
  spent: bigint;
  remaining: bigint;
  allowlistEnforced: boolean;
  balance: bigint;
}

/** Every wallet an operator has created, from the on-chain registry. */
export const walletsOf = async (operator: string): Promise<string[]> =>
  ((await readView(WALLET_FACTORY_ID, "wallets_of", [addr(operator)])) as string[] | null) ?? [];

export const allWallets = async (): Promise<string[]> =>
  ((await readView(WALLET_FACTORY_ID, "all_wallets")) as string[] | null) ?? [];

export const factoryAdmin = async (): Promise<string> =>
  (await readView(WALLET_FACTORY_ID, "admin")) as string;

export const factoryTotal = async (): Promise<number> =>
  Number((await readView(WALLET_FACTORY_ID, "total")) as number);

export async function balanceOf(token: string, who: string): Promise<bigint> {
  return BigInt(((await readView(token, "balance", [addr(who)])) as bigint) ?? 0n);
}

/** The role of a G… address as a signer on a wallet (or null if not a signer). */
export async function signerRole(walletId: string, g: string): Promise<"admin" | "spender" | null> {
  const r = (await readView(walletId, "signer_role", [pubkeyBytes(g)])) as number | null;
  return r === 1 ? "admin" : r === 0 ? "spender" : null;
}

/** Full state of a wallet for the native token (policy + counters + balance). */
export async function getWalletState(walletId: string, token = TOKEN_ID): Promise<WalletState> {
  const [p, spent, remaining, enforced, balance] = await Promise.all([
    readView(walletId, "policy", [addr(token)]) as Promise<{ max_per_transfer: bigint; epoch_cap: bigint; epoch_len: bigint }>,
    readView(walletId, "spent", [addr(token)]) as Promise<bigint>,
    readView(walletId, "remaining", [addr(token)]) as Promise<bigint>,
    readView(walletId, "allowlist_enforced") as Promise<boolean>,
    balanceOf(token, walletId),
  ]);
  return {
    id: walletId,
    policy: {
      maxPerTransfer: BigInt(p.max_per_transfer),
      epochCap: BigInt(p.epoch_cap),
      epochLen: BigInt(p.epoch_len),
    },
    spent: BigInt(spent),
    remaining: BigInt(remaining),
    allowlistEnforced: Boolean(enforced),
    balance,
  };
}

// ---- shared submit ----
async function confirm(hash: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const got = await server.getTransaction(hash);
    if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) return hash;
    if (got.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`transaction failed on-chain (${hash})`);
    await sleep(1000);
  }
  throw new Error(`transaction not confirmed in time (${hash})`);
}

/**
 * Create a new AgentWallet through the factory. The operator is the transaction
 * source (so `operator.require_auth()` is met by the envelope signature) and
 * becomes the wallet's Admin signer via its own ed25519 key. Operator pays gas.
 */
export async function createWallet(operator: string): Promise<{ walletId: string; hash: string }> {
  const source = await server.getAccount(operator);
  const built = new TransactionBuilder(source, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(WALLET_FACTORY_ID).call("create_wallet", addr(operator), pubkeyBytes(operator)))
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(built);
  const signed = await signTx(prepared.toXDR(), operator);
  const tx = TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`create failed: ${JSON.stringify(sent.errorResult)}`);
  await confirm(sent.hash);
  const got = await server.getTransaction(sent.hash);
  const walletId =
    got.status === rpc.Api.GetTransactionStatus.SUCCESS && got.returnValue
      ? (scValToNative(got.returnValue) as string)
      : "";
  return { walletId, hash: sent.hash };
}

/**
 * Invoke an Admin op on a wallet, signed non-custodially by the operator.
 *
 * Two-pass simulation, because `__check_auth` reads (and, for spends, writes)
 * storage that must land in the footprint:
 *   1. simulate to discover the wallet's auth entry;
 *   2. the operator signs that entry with `signAuthEntry` (their key is Admin);
 *   3. re-simulate carrying the signed auth so `__check_auth` runs;
 *   4. the operator signs the envelope and pays gas; submit.
 */
async function adminInvoke(walletId: string, operator: string, method: string, args: xdr.ScVal[]): Promise<string> {
  const hostOp = new Contract(walletId).call(method, ...args);
  const hostFn = hostOp.body().invokeHostFunctionOp().hostFunction();

  const simSource = await server.getAccount(operator);
  const simTx = new TransactionBuilder(simSource, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(hostOp)
    .setTimeout(60)
    .build();
  const sim1 = await server.simulateTransaction(simTx);
  if (rpc.Api.isSimulationError(sim1)) throw new Error(sim1.error);

  const validUntil = (await server.getLatestLedger()).sequence + 60;
  const signedAuth: xdr.SorobanAuthorizationEntry[] = [];
  for (const entry of sim1.result?.auth ?? []) {
    const isAddr =
      entry.credentials().switch().value === 1; // sorobanCredentialsAddress
    if (!isAddr) {
      signedAuth.push(entry);
      continue;
    }
    const signed = await authorizeEntry(
      entry,
      // Non-custodial: the operator's wallet signs the entry preimage.
      async (preimage: xdr.HashIdPreimage) => {
        const { signedAuthEntry } = await StellarWalletsKit.signAuthEntry(preimage.toXDR("base64"), {
          address: operator,
          networkPassphrase: NETWORK_PASSPHRASE,
        });
        return { signature: Buffer.from(signedAuthEntry, "base64"), publicKey: operator };
      },
      validUntil,
      NETWORK_PASSPHRASE,
    );
    signedAuth.push(signed);
  }

  const source = await server.getAccount(operator);
  const raw = new TransactionBuilder(source, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.invokeHostFunction({ func: hostFn, auth: signedAuth }))
    .setTimeout(60)
    .build();
  const sim2 = await server.simulateTransaction(raw);
  if (rpc.Api.isSimulationError(sim2)) throw new Error(sim2.error);
  const assembled = rpc.assembleTransaction(raw, sim2).build();

  const signedXdr = await signTx(assembled.toXDR(), operator);
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`);
  return confirm(sent.hash);
}

/**
 * Fund a wallet with XLM — a plain SAC transfer from the operator to the wallet
 * contract, authorized by the operator (classic source auth). Operator pays gas.
 */
export async function depositXlm(operator: string, walletId: string, amountStroops: bigint): Promise<string> {
  const source = await server.getAccount(operator);
  const built = new TransactionBuilder(source, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(TOKEN_ID).call("transfer", addr(operator), addr(walletId), i128(amountStroops)))
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(built);
  const signed = await signTx(prepared.toXDR(), operator);
  const tx = TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`deposit failed: ${JSON.stringify(sent.errorResult)}`);
  return confirm(sent.hash);
}

// ---- event feed ----

export interface WalletEvent {
  kind: string; // signer_updated | policy_updated | allowlist_toggled | recipient_updated
  topic?: string; // the topic'd subject (signer key hex / token / recipient)
  data: unknown;
  ledger: number;
  txHash: string;
  id: string;
}

/**
 * Recent governance events emitted by a wallet contract (policy/signer/allowlist
 * changes). Spend itself is read from the live balance + `spent` counter, not
 * replayed here. Newest first.
 */
export async function fetchWalletEvents(walletId: string, windowLedgers = 17_000): Promise<WalletEvent[]> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(latest.sequence - windowLedgers, 1);
  const filters = [{ type: "contract" as const, contractIds: [walletId] }];
  const collected: rpc.Api.EventResponse[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await server.getEvents(
      cursor ? { cursor, filters, limit: 100 } : { startLedger, filters, limit: 100 },
    );
    collected.push(...res.events);
    cursor = res.cursor;
    if (!cursor || res.events.length === 0) break;
  }
  return collected
    .map((e): WalletEvent => {
      const topics = e.topic.map((t) => {
        try {
          return scValToNative(t);
        } catch {
          return null;
        }
      });
      const name = String(topics[0] ?? "event");
      const subject = topics[1];
      return {
        kind: name,
        topic: subject != null ? String(subject) : undefined,
        data: (() => {
          try {
            return scValToNative(e.value);
          } catch {
            return null;
          }
        })(),
        ledger: e.ledger,
        txHash: e.txHash ?? "",
        id: e.id,
      };
    })
    .reverse();
}

// ---- operator admin ops ----
export const setPolicy = (walletId: string, operator: string, maxPerTransfer: bigint, epochCap: bigint, epochLen: bigint, token: string = TOKEN_ID) =>
  adminInvoke(walletId, operator, "set_policy", [addr(token), i128(maxPerTransfer), i128(epochCap), u64(epochLen)]);

export const addSigner = (walletId: string, operator: string, signerG: string, role: "admin" | "spender") =>
  adminInvoke(walletId, operator, "add_signer", [pubkeyBytes(signerG), roleScVal(role)]);

export const removeSigner = (walletId: string, operator: string, signerG: string) =>
  adminInvoke(walletId, operator, "remove_signer", [pubkeyBytes(signerG)]);

export const setAllowlistEnforced = (walletId: string, operator: string, enforced: boolean) =>
  adminInvoke(walletId, operator, "set_allowlist_enforced", [bool(enforced)]);

export const setRecipient = (walletId: string, operator: string, recipient: string, allowed: boolean) =>
  adminInvoke(walletId, operator, "set_recipient", [addr(recipient), bool(allowed)]);
