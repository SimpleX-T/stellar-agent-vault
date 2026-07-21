/**
 * End-to-end proof on Stellar testnet that the AgentWallet enforces its policy
 * on-chain, inside `__check_auth`.
 *
 * Self-contained: it generates its own relayer/admin/spender/recipient keys and
 * funds the relayer via friendbot, so nothing depends on local CLI keys. The
 * agent (Spender) key is never funded — the relayer pays every fee ("gasless").
 *
 * It proves each policy dimension in isolation:
 *   per-transfer cap · rolling epoch cap · recipient allowlist
 * with an APPROVED transfer submitted to the ledger and each BLOCKED transfer
 * rejected by the contract's own authorization logic.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Keypair, Address, Contract, xdr } from "@stellar/stellar-sdk";
import {
  server,
  friendbot,
  submit,
  uploadWasm,
  deployContract,
  signedInvoke,
  fundWallet,
  balanceOf,
  readView,
  setSimSource,
  nativeSac,
  addr,
  i128,
  u64,
  bytes32,
  role,
} from "./wallet.js";
import { randomBytes } from "node:crypto";

const XLM = 10_000_000n; // 1 XLM in stroops
const here = dirname(fileURLToPath(import.meta.url));
const wasmDir = join(here, "..", "..", "target", "wasm32v1-none", "release");
const EXPLORER = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;

const log = (s = "") => console.log(s);
const ok = (s: string) => console.log(`  \x1b[32m✔\x1b[0m ${s}`);
const no = (s: string) => console.log(`  \x1b[31m✘\x1b[0m ${s}`);

/** Run a transfer we expect to SUCCEED; returns the tx hash. */
async function expectApproved(
  label: string,
  relayer: Keypair,
  spender: Keypair,
  wallet: string,
  to: string,
  amount: bigint,
): Promise<void> {
  try {
    const hash = await signedInvoke({
      relayer,
      signer: spender,
      contractId: nativeSac(),
      method: "transfer",
      args: [addr(wallet), addr(to), i128(amount)],
    });
    ok(`${label} — APPROVED  ${EXPLORER(hash)}`);
  } catch (e) {
    no(`${label} — expected APPROVED but was blocked: ${(e as Error).message}`);
    process.exitCode = 1;
    throw e;
  }
}

// AgentWallet contract error codes (see contracts/agent-wallet/src/lib.rs).
const ERR: Record<string, number> = {
  PerTransferExceeded: 6,
  EpochCapExceeded: 7,
  RecipientNotAllowed: 8,
};

/**
 * Run a transfer we expect the contract to REJECT in __check_auth. The host
 * surfaces a custom-account rejection as `Error(Auth, InvalidAction)` with the
 * originating `Error(Contract, #N)` in the diagnostic events — so we match on
 * the contract error code N for the specific policy that fired.
 */
async function expectBlocked(
  label: string,
  expectedErr: keyof typeof ERR,
  relayer: Keypair,
  spender: Keypair,
  wallet: string,
  to: string,
  amount: bigint,
): Promise<void> {
  try {
    await signedInvoke({
      relayer,
      signer: spender,
      contractId: nativeSac(),
      method: "transfer",
      args: [addr(wallet), addr(to), i128(amount)],
    });
    no(`${label} — expected BLOCKED but it went through!`);
    process.exitCode = 1;
  } catch (e) {
    const msg = (e as Error).message;
    const hit = msg.includes(`Error(Contract, #${ERR[expectedErr]})`);
    (hit ? ok : no)(
      `${label} — BLOCKED on-chain${hit ? ` (${expectedErr}, #${ERR[expectedErr]})` : ` but wrong error: ${msg.split("\n")[0]}`}`,
    );
    if (!hit) process.exitCode = 1;
  }
}

async function main() {
  log("\n\x1b[1mAgentWallet — on-chain policy proof (Stellar testnet)\x1b[0m");

  // Keys. Only the relayer is funded; admin + spender never hold XLM.
  const relayer = Keypair.random();
  const admin = Keypair.random();
  const spender = Keypair.random();
  const provider = Keypair.random();
  const stranger = Keypair.random();

  log("\n▸ Funding relayer via friendbot (agent stays gasless)…");
  await friendbot(relayer.publicKey());
  await Promise.all([friendbot(provider.publicKey()), friendbot(stranger.publicKey())]);
  setSimSource(relayer.publicKey());
  ok(`relayer ${relayer.publicKey()}`);
  log(`    admin (Admin signer)   ${admin.publicKey()}`);
  log(`    spender (Spender key)  ${spender.publicKey()}  — never funded`);

  // Upload wasms + deploy the factory.
  log("\n▸ Uploading wasm + deploying the factory…");
  const walletWasm = readFileSync(join(wasmDir, "agent_wallet.wasm"));
  const factoryWasm = readFileSync(join(wasmDir, "wallet_factory.wasm"));
  const walletWasmHash = await uploadWasm(relayer, walletWasm);
  const factoryWasmHash = await uploadWasm(relayer, factoryWasm);
  const factoryId = await deployContract(relayer, factoryWasmHash, [], randomBytes(32));
  await submit(
    relayer,
    new Contract(factoryId).call("init", addr(relayer.publicKey()), bytes32(walletWasmHash)),
  );
  ok(`factory ${factoryId}`);

  // Create a wallet through the factory; admin key becomes its Admin signer.
  log("\n▸ Creating an AgentWallet via the factory…");
  const created = await submit(
    relayer,
    new Contract(factoryId).call(
      "create_wallet",
      addr(relayer.publicKey()),
      bytes32(admin.rawPublicKey()),
    ),
  );
  const wallet = Address.fromScVal(created.returnValue!).toString();
  ok(`wallet  ${wallet}`);
  const registered = (await readView(factoryId, "wallets_of", [addr(relayer.publicKey())])) as string[];
  ok(`on-chain registry lists it: ${registered.includes(wallet)}`);

  // Admin sets policy: 250 per transfer, 500 rolling cap, 1-hour epoch.
  log("\n▸ Admin sets policy (250 per-transfer · 500 epoch cap · 1h window) + adds Spender…");
  await signedInvoke({
    relayer,
    signer: admin,
    contractId: wallet,
    method: "set_policy",
    args: [addr(nativeSac()), i128(250n * XLM), i128(500n * XLM), u64(3600n)],
  });
  await signedInvoke({
    relayer,
    signer: admin,
    contractId: wallet,
    method: "add_signer",
    args: [bytes32(spender.rawPublicKey()), role("spender")],
  });
  const pol = (await readView(wallet, "policy", [addr(nativeSac())])) as {
    max_per_transfer: bigint;
    epoch_cap: bigint;
    epoch_len: bigint;
  };
  ok(`policy on-chain: max/transfer=${Number(pol.max_per_transfer) / 1e7}  cap=${Number(pol.epoch_cap) / 1e7}  window=${pol.epoch_len}s`);

  // Fund the wallet.
  log("\n▸ Funding the wallet with 1000 XLM…");
  await fundWallet(relayer, wallet, 1000n * XLM);
  ok(`wallet balance: ${Number(await balanceOf(nativeSac(), wallet)) / 1e7} XLM`);

  // ---- policy proofs, each dimension isolated ----
  log("\n▸ Per-transfer cap");
  await expectApproved("transfer 100 (≤ 250)", relayer, spender, wallet, provider.publicKey(), 100n * XLM);
  await expectBlocked("transfer 260 (> 250)", "PerTransferExceeded", relayer, spender, wallet, provider.publicKey(), 260n * XLM);

  log("\n▸ Rolling epoch cap (100 already spent this window; cap 500)");
  await expectApproved("transfer 200 (100+200 ≤ 500)", relayer, spender, wallet, provider.publicKey(), 200n * XLM);
  await expectBlocked("transfer 250 (300+250 > 500)", "EpochCapExceeded", relayer, spender, wallet, provider.publicKey(), 250n * XLM);
  const spent = Number(await readView(wallet, "spent", [addr(nativeSac())]) as bigint) / 1e7;
  const remaining = Number(await readView(wallet, "remaining", [addr(nativeSac())]) as bigint) / 1e7;
  ok(`on-chain counters: spent=${spent} XLM  remaining=${remaining} XLM`);

  log("\n▸ Recipient allowlist");
  await signedInvoke({ relayer, signer: admin, contractId: wallet, method: "set_allowlist_enforced", args: [xdr.ScVal.scvBool(true)] });
  await expectBlocked("transfer 100 to non-allowlisted", "RecipientNotAllowed", relayer, spender, wallet, stranger.publicKey(), 100n * XLM);
  await signedInvoke({ relayer, signer: admin, contractId: wallet, method: "set_recipient", args: [addr(provider.publicKey()), xdr.ScVal.scvBool(true)] });
  await expectApproved("transfer 100 to allowlisted", relayer, spender, wallet, provider.publicKey(), 100n * XLM);

  log(`\n▸ Final wallet balance: ${Number(await balanceOf(nativeSac(), wallet)) / 1e7} XLM`);
  log("\n\x1b[1mArtifacts\x1b[0m");
  log(`  factory   ${factoryId}`);
  log(`  wallet    ${wallet}`);
  log(`  wasm hash ${walletWasmHash.toString("hex")}`);
  log(process.exitCode ? "\n\x1b[31mProof FAILED\x1b[0m\n" : "\n\x1b[32mProof complete — every dimension enforced on-chain.\x1b[0m\n");
}

main().catch((e) => {
  console.error("\n\x1b[31m✘\x1b[0m", e?.message ?? e);
  process.exit(1);
});
