/**
 * Drive a single agent spend — exactly as an autonomous agent would: the agent
 * signs with its Spender key, the relayer pays the fee (gasless), and the wallet
 * either APPROVES it (within policy) or the contract BLOCKS it in __check_auth.
 *
 * Usage (from service/):
 *   AGENT_SECRET=S... WALLET=C... TO=G... AMOUNT=100 npm run spend
 *
 *   AGENT_SECRET  the Spender secret you generated in the console (S…)
 *   WALLET        the agent wallet's contract address (C…)
 *   TO            recipient — any funded testnet account (a G… address)
 *   AMOUNT        XLM to send (e.g. 100)
 *
 * The relayer (gas-only) is read from .secrets.json, written by `npm run deploy`.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { signedInvoke, setSimSource, readView, balanceOf, nativeSac, addr, i128, server, friendbot } from "./wallet.js";

const XLM = 10_000_000n;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ERRORS: Record<number, string> = {
  5: "TokenDisabled — no policy set for this token yet (set one in the console first)",
  6: "PerTransferExceeded — over the single-transfer cap",
  7: "EpochCapExceeded — over the rolling epoch budget",
  8: "RecipientNotAllowed — recipient isn't on the allowlist",
};

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`\x1b[31m✘\x1b[0m missing ${name}. Usage: AGENT_SECRET=S… WALLET=C… TO=G… AMOUNT=100 npm run spend`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const secretsPath = join(root, ".secrets.json");
  if (!existsSync(secretsPath)) {
    console.error("\x1b[31m✘\x1b[0m no .secrets.json — run `npm run deploy` first to create the gas-only relayer.");
    process.exit(1);
  }
  const relayer = Keypair.fromSecret(JSON.parse(readFileSync(secretsPath, "utf8")).relayerSecret);

  // Prefer a downloaded key file (KEYFILE=path) so the secret is never passed on
  // the command line. Falls back to AGENT_SECRET / WALLET env vars.
  let agentSecret = process.env.AGENT_SECRET;
  let walletFromFile: string | undefined;
  if (process.env.KEYFILE) {
    const txt = readFileSync(process.env.KEYFILE.replace(/^~/, process.env.HOME ?? ""), "utf8");
    agentSecret = txt.match(/Secret:\s*(\S+)/)?.[1] ?? agentSecret;
    walletFromFile = txt.match(/Wallet:\s*(\S+)/)?.[1];
  }
  if (!agentSecret) {
    console.error("missing AGENT_SECRET (or KEYFILE=path).");
    process.exit(1);
  }
  const agent = Keypair.fromSecret(agentSecret);
  const wallet = process.env.WALLET ?? walletFromFile ?? need("WALLET");
  const to = need("TO");
  const amount = BigInt(Math.round(Number(need("AMOUNT")) * Number(XLM)));

  setSimSource(relayer.publicKey());
  try {
    await server.getAccount(relayer.publicKey());
  } catch {
    console.log("funding relayer via friendbot…");
    await friendbot(relayer.publicKey());
  }

  const token = nativeSac();
  const before = await balanceOf(token, wallet);
  const spent = Number((await readView(wallet, "spent", [addr(token)])) as bigint) / 1e7;
  const remaining = Number((await readView(wallet, "remaining", [addr(token)])) as bigint) / 1e7;

  console.log(`\n\x1b[1mAgent spend\x1b[0m`);
  console.log(`  wallet    ${wallet}`);
  console.log(`  agent     ${agent.publicKey()}  (gasless — relayer pays)`);
  console.log(`  send      ${Number(amount) / 1e7} XLM  →  ${to}`);
  console.log(`  balance   ${Number(before) / 1e7} XLM   ·   spent this epoch ${spent}   ·   remaining ${remaining}\n`);

  try {
    const hash = await signedInvoke({
      relayer,
      signer: agent,
      contractId: token,
      method: "transfer",
      args: [addr(wallet), addr(to), i128(amount)],
    });
    const after = await balanceOf(token, wallet);
    console.log(`  \x1b[32m✔ APPROVED\x1b[0m — enforced within policy on-chain`);
    console.log(`  tx        https://stellar.expert/explorer/testnet/tx/${hash}`);
    console.log(`  balance   ${Number(after) / 1e7} XLM (was ${Number(before) / 1e7})\n`);
  } catch (e) {
    const msg = (e as Error).message;
    const code = Number(msg.match(/Error\(Contract, #(\d+)\)/)?.[1] ?? 0);
    console.log(`  \x1b[31m⛔ BLOCKED\x1b[0m in __check_auth — the contract refused it`);
    console.log(`  reason    ${ERRORS[code] ?? msg.split("\n")[0]}\n`);
  }
}

main().catch((e) => {
  console.error("\n\x1b[31m✘\x1b[0m", e?.message ?? e);
  process.exit(1);
});
