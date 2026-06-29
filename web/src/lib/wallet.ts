// Thin wrapper over StellarWalletsKit (multi-wallet). Satisfies L1 (Freighter)
// and L2 (StellarWalletsKit, multiple wallet options) with one implementation.

import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { RabetModule } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { NETWORK_PASSPHRASE } from "./config";

let initialized = false;

export function initWallet() {
  if (initialized) return;
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new AlbedoModule(),
      new LobstrModule(),
      new RabetModule(),
    ],
  });
  initialized = true;
}

const ADDR_KEY = "sv:address";

/** Opens the wallet-selection modal and returns the chosen address. */
export async function connect(): Promise<string> {
  initWallet();
  const { address } = await StellarWalletsKit.authModal();
  localStorage.setItem(ADDR_KEY, address);
  return address;
}

export async function disconnect(): Promise<void> {
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    /* ignore */
  }
  localStorage.removeItem(ADDR_KEY);
}

/** Best-effort restore of a previously connected address on page load. */
export async function restore(): Promise<string | null> {
  initWallet();
  try {
    const { address } = await StellarWalletsKit.getAddress();
    if (address) return address;
  } catch {
    /* not connected */
  }
  return localStorage.getItem(ADDR_KEY);
}

/** Signs a transaction XDR with the active wallet. */
export async function signTx(xdr: string, address: string): Promise<string> {
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    address,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  return signedTxXdr;
}
