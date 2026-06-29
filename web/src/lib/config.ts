// Network + contract configuration, driven by Vite env vars (see .env.example).

export const RPC_URL = import.meta.env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const HORIZON_URL =
  import.meta.env.VITE_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
export const NETWORK_PASSPHRASE =
  import.meta.env.VITE_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID as string;
export const FACTORY_ID = import.meta.env.VITE_FACTORY_ID as string;
export const TOKEN_ID = import.meta.env.VITE_TOKEN_ID as string;

// A funded account used purely as the source for read-only simulation of view calls.
export const READ_SOURCE = import.meta.env.VITE_READ_SOURCE as string;

// XLM has 7 decimals. 1 XLM = 10^7 stroops.
export const STROOPS_PER_XLM = 10_000_000n;

export function xlmToStroops(xlm: string | number): bigint {
  const [whole, frac = ""] = String(xlm).split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * STROOPS_PER_XLM + BigInt(fracPadded || "0");
}

export function stroopsToXlm(stroops: bigint | string | number): string {
  const v = BigInt(stroops);
  const whole = v / STROOPS_PER_XLM;
  const frac = (v % STROOPS_PER_XLM).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export const EXPLORER_TX = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const EXPLORER_CONTRACT = (id: string) =>
  `https://stellar.expert/explorer/testnet/contract/${id}`;
export const EXPLORER_ACCOUNT = (addr: string) =>
  `https://stellar.expert/explorer/testnet/account/${addr}`;

export const shortenAddr = (a?: string | null) =>
  a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "";
