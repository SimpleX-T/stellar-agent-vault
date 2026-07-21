/**
 * Locate the agent wallet a given Spender key belongs to, and report whether it
 * is ready to spend (policy set? funded?). Needs only the agent's PUBLIC key.
 *
 *   AGENT=G... npm run find
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { setSimSource, readView, balanceOf, nativeSac, addr, server, friendbot } from "./wallet.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const agent = process.env.AGENT;
  if (!agent) {
    console.error("missing AGENT. Usage: AGENT=G... npm run find");
    process.exit(1);
  }
  const { factoryId } = JSON.parse(readFileSync(join(root, "deployed.json"), "utf8"));
  const relayer = Keypair.fromSecret(JSON.parse(readFileSync(join(root, ".secrets.json"), "utf8")).relayerSecret);
  setSimSource(relayer.publicKey());
  try {
    await server.getAccount(relayer.publicKey());
  } catch {
    await friendbot(relayer.publicKey());
  }

  const agentBytes = xdr.ScVal.scvBytes(StrKey.decodeEd25519PublicKey(agent));
  const all = ((await readView(factoryId, "all_wallets")) as string[] | null) ?? [];
  console.log(`\nScanning ${all.length} wallet(s) for signer ${agent}…\n`);

  let found = 0;
  for (const w of all) {
    const role = (await readView(w, "signer_role", [agentBytes]).catch(() => null)) as number | null;
    if (role === null) continue;
    found++;
    const token = nativeSac();
    const p = (await readView(w, "policy", [addr(token)])) as { max_per_transfer: bigint; epoch_cap: bigint; epoch_len: bigint };
    const bal = Number(await balanceOf(token, w)) / 1e7;
    const spent = Number((await readView(w, "spent", [addr(token)])) as bigint) / 1e7;
    const remaining = Number((await readView(w, "remaining", [addr(token)])) as bigint) / 1e7;
    const maxPer = Number(p.max_per_transfer) / 1e7;
    const cap = Number(p.epoch_cap) / 1e7;
    const ready = maxPer > 0 && bal > 0;

    console.log(`\x1b[1mWALLET  ${w}\x1b[0m`);
    console.log(`  role of this agent : ${role === 1 ? "Admin" : "Spender"}`);
    console.log(`  balance            : ${bal} XLM`);
    console.log(`  policy             : ${maxPer > 0 ? `max/transfer ${maxPer} XLM · epoch cap ${cap || "∞"} XLM · window ${Number(p.epoch_len)}s` : "\x1b[33mNONE SET (token disabled)\x1b[0m"}`);
    console.log(`  spent / remaining  : ${spent} / ${remaining} XLM`);
    console.log(ready ? `  \x1b[32m→ READY to spend up to ${Math.min(maxPer, remaining || maxPer)} XLM\x1b[0m\n` : `  \x1b[33m→ NOT READY: ${maxPer === 0 ? "set a policy" : "fund the wallet"} first\x1b[0m\n`);
  }
  if (!found) console.log("No wallet found with this agent as a signer. Double-check the agent key, or that the agent was registered.");
}

main().catch((e) => {
  console.error("\x1b[31m✘\x1b[0m", e?.message ?? e);
  process.exit(1);
});
