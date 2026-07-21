// Off-chain agent labels (name + model). The contract has no name field, and we
// run no backend — so these are cosmetic, stored locally per wallet address.
// On-chain state (policy, signers, balance) is always the source of truth; this
// is only a friendly label over it.

export interface AgentMeta {
  name?: string;
  model?: string;
}

const KEY = "sv:agentmeta";

function readAll(): Record<string, AgentMeta> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getAgentMeta(walletId: string): AgentMeta {
  return readAll()[walletId] ?? {};
}

export function setAgentMeta(walletId: string, meta: AgentMeta): void {
  const all = readAll();
  all[walletId] = { ...all[walletId], ...meta };
  localStorage.setItem(KEY, JSON.stringify(all));
}

export const MODELS = ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"] as const;
