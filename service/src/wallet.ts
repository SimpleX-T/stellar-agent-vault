/**
 * AgentWallet operations via the Soroban custom-account signing flow.
 *
 * The wallet is a custom account: an outgoing `token.transfer(from = wallet, …)`
 * makes the token call `wallet.require_auth()`, and the host runs the wallet's
 * `__check_auth`, which verifies an ed25519 signature from a registered signer
 * and enforces spending policy. The wallet's `Signature` type is
 * `Vec<SignerSig>` with fields `{ public_key, signature }` — exactly the ScVal
 * the SDK's `authorizeEntry(entry, keypair, …)` produces, so no custom XDR.
 *
 * Every wallet-authorized call therefore needs two simulations:
 *   1. simulate (relayer as source) to discover the required auth entries;
 *   2. sign each wallet-address entry with the signer key (authorizeEntry);
 *   3. re-simulate carrying the signed auth so `__check_auth` actually runs and
 *      its storage reads/writes land in the transaction footprint;
 *   4. assemble, the relayer signs the envelope and pays the fee, then submit.
 *
 * The relayer only ever pays fees — it is not a wallet signer, so it can never
 * move funds. That is the whole point of "gasless": the agent holds no XLM.
 */
import {
  rpc,
  Contract,
  TransactionBuilder,
  Operation,
  Keypair,
  Address,
  Asset,
  Networks,
  BASE_FEE,
  authorizeEntry,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

export const RPC_URL = process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const NETWORK = Networks.TESTNET;
export const server = new rpc.Server(RPC_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The native-XLM Stellar Asset Contract id on this network. */
export const nativeSac = () => Asset.native().contractId(NETWORK);

// ---- argument + role helpers ----
export const addr = (a: string) => Address.fromString(a).toScVal();
export const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
export const u64 = (n: bigint) => nativeToScVal(n, { type: "u64" });
export const bytes32 = (b: Buffer) => xdr.ScVal.scvBytes(b);
/** Role is an integer enum on-chain: Spender = 0, Admin = 1. */
export const role = (r: "spender" | "admin") => xdr.ScVal.scvU32(r === "admin" ? 1 : 0);

/** Raw 32-byte ed25519 public key for a keypair (the wallet's signer id). */
export const rawPubkey = (kp: Keypair): Buffer => kp.rawPublicKey();

// ---- friendbot ----
export async function friendbot(pubkey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${pubkey}`);
  if (!res.ok && res.status !== 400) {
    throw new Error(`friendbot failed for ${pubkey}: ${res.status}`);
  }
}

// ---- generic submit (classic source-account auth) ----
async function confirm(hash: string): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  for (let i = 0; i < 40; i++) {
    const got = await server.getTransaction(hash);
    if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) return got;
    if (got.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`tx failed on-chain (${hash})`);
    }
    await sleep(1000);
  }
  throw new Error(`tx not confirmed in time (${hash})`);
}

/** Build → prepare (simulate) → sign with `source` → submit → confirm. */
export async function submit(
  source: Keypair,
  op: xdr.Operation,
  feeMult = 100,
): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  const account = await server.getAccount(source.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: (Number(BASE_FEE) * feeMult).toString(),
    networkPassphrase: NETWORK,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(source);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error(`submit failed: ${JSON.stringify(sent.errorResult)}`);
  }
  return confirm(sent.hash);
}

// ---- deploy primitives ----

/** Upload a contract wasm (idempotent — the network caches it by hash). */
export async function uploadWasm(relayer: Keypair, wasm: Buffer): Promise<Buffer> {
  const res = await submit(relayer, Operation.uploadContractWasm({ wasm }));
  return res.returnValue!.bytes();
}

/** Deploy a contract from an uploaded wasm hash, running its constructor. */
export async function deployContract(
  relayer: Keypair,
  wasmHash: Buffer,
  constructorArgs: xdr.ScVal[],
  salt: Buffer,
): Promise<string> {
  const res = await submit(
    relayer,
    Operation.createCustomContract({
      address: Address.fromString(relayer.publicKey()),
      wasmHash,
      salt,
      constructorArgs,
    }),
  );
  return Address.fromScVal(res.returnValue!).toString();
}

// ---- read-only views ----

// Any funded account works as the source for a read-only simulation. Set once
// (e.g. to the relayer) after it's funded; reads never touch a secret.
let simSource = "";
export const setSimSource = (pubkey: string) => (simSource = pubkey);

export async function readView(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<unknown> {
  if (!simSource) throw new Error("simSource not set — call setSimSource(pubkey) first");
  const source = await server.getAccount(simSource);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) {
    throw new Error(`view ${method} failed: ${(sim as rpc.Api.SimulateTransactionErrorResponse).error ?? "no result"}`);
  }
  return scValToNative(sim.result.retval);
}

// ---- the two-pass custom-account signing flow ----

/**
 * Invoke `method(...args)` on `contractId`, authorized by the custom-account
 * `signer` (its ed25519 key) and paid by `relayer`. Returns the tx hash.
 *
 * Throws if the wallet's `__check_auth` rejects — which is exactly how a
 * policy-violating transfer is refused: on-chain, in the authorization path.
 */
export async function signedInvoke(opts: {
  relayer: Keypair;
  signer: Keypair;
  contractId: string;
  method: string;
  args?: xdr.ScVal[];
}): Promise<string> {
  const { relayer, signer, contractId, method, args = [] } = opts;

  const hostOp = new Contract(contractId).call(method, ...args);
  const hostFn = hostOp.body().invokeHostFunctionOp().hostFunction();

  // 1) discover auth entries
  const simSource = await server.getAccount(relayer.publicKey());
  const simTx = new TransactionBuilder(simSource, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(hostOp)
    .setTimeout(60)
    .build();
  const sim1 = await server.simulateTransaction(simTx);
  if (rpc.Api.isSimulationError(sim1)) throw new Error(sim1.error);

  // 2) sign each address-credential entry with the signer key
  const validUntil = (await server.getLatestLedger()).sequence + 60;
  const signedAuth: xdr.SorobanAuthorizationEntry[] = [];
  for (const entry of sim1.result?.auth ?? []) {
    const isAddr =
      entry.credentials().switch().value ===
      xdr.SorobanCredentialsType.sorobanCredentialsAddress().value;
    signedAuth.push(isAddr ? await authorizeEntry(entry, signer, validUntil, NETWORK) : entry);
  }

  // 3) re-simulate WITH the signed auth so __check_auth runs and its storage
  //    footprint (including the rolling-spend write) is captured
  const source = await server.getAccount(relayer.publicKey());
  const raw = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(Operation.invokeHostFunction({ func: hostFn, auth: signedAuth }))
    .setTimeout(60)
    .build();
  const sim2 = await server.simulateTransaction(raw);
  if (rpc.Api.isSimulationError(sim2)) throw new Error(sim2.error);

  // 4) assemble, relayer signs the envelope + pays, submit
  const prepared = rpc.assembleTransaction(raw, sim2).build();
  prepared.sign(relayer);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`);
  }
  await confirm(sent.hash);
  return sent.hash;
}

/** A classic (relayer-authorized) SAC transfer, used to fund a wallet. */
export async function fundWallet(relayer: Keypair, wallet: string, amount: bigint): Promise<string> {
  const op = new Contract(nativeSac()).call(
    "transfer",
    addr(relayer.publicKey()),
    addr(wallet),
    i128(amount),
  );
  const res = await submit(relayer, op);
  return res.txHash;
}

/** Read a token balance (in stroops) for any address. */
export async function balanceOf(token: string, who: string): Promise<bigint> {
  const v = await readView(token, "balance", [addr(who)]);
  return BigInt((v as bigint) ?? 0n);
}
