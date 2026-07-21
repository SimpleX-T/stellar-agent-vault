/**
 * Deploy a persistent WalletFactory (and its AgentWallet wasm) to testnet, so
 * the console has stable addresses to read from.
 *
 * The relayer is a gas-only key — it pays fees but is never a wallet signer, so
 * it can't move anyone's funds. Its secret is cached in `.secrets.json`
 * (gitignored) and reused across runs; the factory address is written to
 * `deployed.json` and echoed as the `VITE_*` lines the web app needs.
 *
 * Idempotent: if `deployed.json` already has a factory, it just prints it.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { Keypair, Contract, Address } from "@stellar/stellar-sdk";
import {
  friendbot,
  submit,
  uploadWasm,
  deployContract,
  setSimSource,
  readView,
  server,
  nativeSac,
  addr,
  bytes32,
} from "./wallet.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const wasmDir = join(root, "..", "target", "wasm32v1-none", "release");
const secretsPath = join(root, ".secrets.json");
const deployedPath = join(root, "deployed.json");

async function relayerKey(): Promise<Keypair> {
  if (existsSync(secretsPath)) {
    const { relayerSecret } = JSON.parse(readFileSync(secretsPath, "utf8"));
    return Keypair.fromSecret(relayerSecret);
  }
  const kp = Keypair.random();
  writeFileSync(secretsPath, JSON.stringify({ relayerSecret: kp.secret() }, null, 2));
  return kp;
}

async function ensureFunded(pubkey: string) {
  try {
    await server.getAccount(pubkey);
  } catch {
    await friendbot(pubkey);
  }
}

async function main() {
  const relayer = await relayerKey();
  await ensureFunded(relayer.publicKey());
  setSimSource(relayer.publicKey());
  console.log("relayer (gas-only):", relayer.publicKey());

  if (existsSync(deployedPath)) {
    const d = JSON.parse(readFileSync(deployedPath, "utf8"));
    if (d.factoryId) {
      const total = await readView(d.factoryId, "total").catch(() => null);
      if (total !== null) {
        console.log("\nAlready deployed:");
        printEnv(d, relayer.publicKey());
        return;
      }
    }
  }

  console.log("\nUploading wasm + deploying factory…");
  const walletWasmHash = await uploadWasm(relayer, readFileSync(join(wasmDir, "agent_wallet.wasm")));
  const factoryWasmHash = await uploadWasm(relayer, readFileSync(join(wasmDir, "wallet_factory.wasm")));
  const factoryId = await deployContract(relayer, factoryWasmHash, [], randomBytes(32));
  await submit(
    relayer,
    new Contract(factoryId).call("init", addr(relayer.publicKey()), bytes32(walletWasmHash)),
  );

  const deployed = {
    factoryId,
    tokenId: nativeSac(),
    walletWasmHash: walletWasmHash.toString("hex"),
    relayerPublicKey: relayer.publicKey(),
    network: "TESTNET",
  };
  writeFileSync(deployedPath, JSON.stringify(deployed, null, 2));
  console.log("\nDeployed:");
  printEnv(deployed, relayer.publicKey());
  // sanity: read a view back
  console.log("\nfactory.total() =", await readView(factoryId, "total"));
  console.log("factory.admin() =", (await readView(factoryId, "admin")) as string);
}

function printEnv(d: any, relayerPub: string) {
  console.log(`  factory : ${d.factoryId}`);
  console.log(`  token   : ${d.tokenId}`);
  console.log("\n--- web/.env additions ---");
  console.log(`VITE_FACTORY_ID=${d.factoryId}`);
  console.log(`VITE_TOKEN_ID=${d.tokenId}`);
  console.log(`VITE_RELAYER_PUBKEY=${relayerPub}`);
  console.log(`VITE_READ_SOURCE=${relayerPub}`);
}

main().catch((e) => {
  console.error("✘", e?.message ?? e);
  process.exit(1);
});
