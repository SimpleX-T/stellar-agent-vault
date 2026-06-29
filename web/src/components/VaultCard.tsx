import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  ArrowDownToLine,
  Send,
  SlidersHorizontal,
  ArrowUpFromLine,
  Plus,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useWallet } from "../hooks/useWallet";
import { useToasts } from "../hooks/useToasts";
import {
  deposit,
  pay,
  setPolicy,
  withdraw,
  getVaultState,
  type VaultState,
} from "../lib/contract";
import { friendlyError } from "../lib/errors";
import {
  EXPLORER_TX,
  EXPLORER_CONTRACT,
  shortenAddr,
  stroopsToXlm,
  xlmToStroops,
} from "../lib/config";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

type Busy = "deposit" | "pay" | "policy" | "withdraw" | "create" | null;

export function VaultCard({
  vaultId,
  viewingDemo,
  creating,
  onCreateVault,
  refreshKey,
  onChange,
}: {
  vaultId: string;
  viewingDemo: boolean;
  creating: boolean;
  onCreateVault: (capXlm: string) => Promise<void>;
  refreshKey: number;
  onChange: () => void;
}) {
  const { address, refreshBalance } = useWallet();
  const { notify, update } = useToasts();
  const [state, setState] = useState<VaultState | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const [depositAmt, setDepositAmt] = useState("");
  const [provider, setProvider] = useState("");
  const [payAmt, setPayAmt] = useState("");
  const [capAmt, setCapAmt] = useState("");
  const [wdTo, setWdTo] = useState("");
  const [wdAmt, setWdAmt] = useState("");
  const [createCap, setCreateCap] = useState("100");

  const load = useCallback(async () => {
    try {
      setState(await getVaultState(vaultId));
    } catch {
      /* keep previous */
    }
  }, [vaultId]);

  useEffect(() => {
    setState(null);
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  const isAgent = !!address && state?.agent === address;
  const isOwner = !!address && state?.owner === address;

  const run = async (
    label: Busy,
    pending: string,
    okTitle: string,
    okMsg: string,
    fn: () => Promise<string>,
    reset?: () => void,
  ) => {
    setBusy(label);
    const id = notify({ kind: "pending", title: pending, message: "Awaiting signature" });
    try {
      const hash = await fn();
      update(id, {
        kind: "success",
        title: okTitle,
        message: okMsg,
        href: EXPLORER_TX(hash),
        hrefLabel: "View transaction",
      });
      reset?.();
      await Promise.all([load(), refreshBalance()]);
      onChange();
    } catch (e) {
      update(id, { kind: "error", title: "Action failed", message: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  };

  const cap = state ? Number(stroopsToXlm(state.cap)) : 0;
  const spent = state ? Number(stroopsToXlm(state.spent)) : 0;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;

  return (
    <Card className="neon-ring overflow-hidden">
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
              <ShieldCheck className="size-5 text-neon-cyan" />
              Agent Spend Vault
            </h3>
            <a
              href={EXPLORER_CONTRACT(vaultId)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground tnum hover:text-neon-cyan"
            >
              {shortenAddr(vaultId)} <ExternalLink className="size-3" />
            </a>
          </div>
          <Badge className="border-neon-cyan/30 text-foreground">Level 2 · on-chain budget</Badge>
        </div>

        {/* Create-your-own banner when viewing the shared demo vault */}
        {viewingDemo && (
          <div className="neon-ring rounded-lg bg-secondary/40 p-3.5">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <Sparkles className="size-4 text-neon-violet" />
              You're viewing the shared demo vault
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Spin up your own vault via the factory — you become owner + agent and can set policy,
              pay providers, and withdraw.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Input
                type="number"
                min="1"
                value={createCap}
                onChange={(e) => setCreateCap(e.target.value)}
                className="h-9 w-32"
                placeholder="Cap / day"
              />
              <span className="text-xs text-muted-foreground">XLM / day cap</span>
              <Button
                size="sm"
                className="ml-auto"
                disabled={!address || creating || !(Number(createCap) > 0)}
                onClick={() => onCreateVault(createCap)}
              >
                <Plus className="size-3.5" />
                {creating ? "Creating…" : "Create my vault"}
              </Button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Vault balance" value={state ? stroopsToXlm(state.balance) : "—"} />
          <Stat label="Spent this epoch" value={state ? stroopsToXlm(state.spent) : "—"} />
          <Stat label="Remaining" value={state ? stroopsToXlm(state.remaining) : "—"} accent />
        </div>

        {/* Budget meter */}
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground tnum">
            <span>Epoch budget</span>
            <span>
              {spent.toLocaleString(undefined, { maximumFractionDigits: 2 })} /{" "}
              {cap.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary/70">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${pct}%`,
                background:
                  pct > 85
                    ? "linear-gradient(90deg,var(--warning),var(--destructive))"
                    : "linear-gradient(90deg,var(--neon-cyan),var(--neon-violet))",
              }}
            />
          </div>
        </div>

        {/* Roles */}
        <div className="flex flex-wrap gap-2">
          <RoleChip label="Owner" addr={state?.owner} you={isOwner} />
          <RoleChip label="Agent" addr={state?.agent} you={isAgent} />
        </div>

        {/* Fund */}
        <Action title="Fund vault" hint="anyone" icon={<ArrowDownToLine className="size-3.5" />}>
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              placeholder="Amount XLM"
              value={depositAmt}
              onChange={(e) => setDepositAmt(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!address || !(Number(depositAmt) > 0) || busy !== null}
              onClick={() =>
                run(
                  "deposit",
                  "Funding vault…",
                  "Vault funded",
                  `${depositAmt} XLM deposited`,
                  async () => (await deposit(vaultId, address!, xlmToStroops(depositAmt))).hash,
                  () => setDepositAmt(""),
                )
              }
            >
              {busy === "deposit" ? "Funding…" : "Fund"}
            </Button>
          </div>
        </Action>

        {/* Agent pay */}
        <Action title="Agent pays provider" hint="agent only" icon={<Send className="size-3.5" />}>
          <div className="space-y-2">
            <Input
              placeholder="Provider address G…"
              value={provider}
              spellCheck={false}
              onChange={(e) => setProvider(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                placeholder="Amount XLM"
                value={payAmt}
                onChange={(e) => setPayAmt(e.target.value)}
              />
              <Button
                disabled={
                  !address || !(Number(payAmt) > 0) || provider.trim().length !== 56 || busy !== null
                }
                onClick={() =>
                  run(
                    "pay",
                    "Agent paying provider…",
                    "Provider paid",
                    `${payAmt} XLM released within budget`,
                    async () =>
                      (await pay(vaultId, address!, provider.trim(), xlmToStroops(payAmt))).hash,
                    () => setPayAmt(""),
                  )
                }
              >
                {busy === "pay" ? "Paying…" : "Pay"}
              </Button>
            </div>
            {address && state && !isAgent && (
              <p className="text-[11.5px] leading-snug text-muted-foreground/80">
                You aren't this vault's agent — a <code className="text-warning">pay</code> call is
                rejected with <code className="text-warning">NotAuthorized</code> (enforcement, live).
              </p>
            )}
          </div>
        </Action>

        {/* Owner controls */}
        {isOwner && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Action title="Set cap" hint="owner" icon={<SlidersHorizontal className="size-3.5" />}>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  placeholder="Cap XLM"
                  value={capAmt}
                  onChange={(e) => setCapAmt(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!(Number(capAmt) > 0) || busy !== null}
                  onClick={() =>
                    run(
                      "policy",
                      "Updating policy…",
                      "Policy updated",
                      `Cap set to ${capAmt} XLM`,
                      async () =>
                        (
                          await setPolicy(
                            vaultId,
                            address!,
                            xlmToStroops(capAmt),
                            state!.epochLen,
                          )
                        ).hash,
                      () => setCapAmt(""),
                    )
                  }
                >
                  {busy === "policy" ? "…" : "Set"}
                </Button>
              </div>
            </Action>

            <Action title="Withdraw" hint="owner" icon={<ArrowUpFromLine className="size-3.5" />}>
              <div className="space-y-2">
                <Input
                  placeholder="To address G…"
                  value={wdTo}
                  spellCheck={false}
                  onChange={(e) => setWdTo(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Amount"
                    value={wdAmt}
                    onChange={(e) => setWdAmt(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!(Number(wdAmt) > 0) || wdTo.trim().length !== 56 || busy !== null}
                    onClick={() =>
                      run(
                        "withdraw",
                        "Withdrawing…",
                        "Withdrawn",
                        `${wdAmt} XLM reclaimed`,
                        async () =>
                          (await withdraw(vaultId, address!, wdTo.trim(), xlmToStroops(wdAmt))).hash,
                        () => setWdAmt(""),
                      )
                    }
                  >
                    {busy === "withdraw" ? "…" : "Out"}
                  </Button>
                </div>
              </div>
            </Action>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent ? "border-neon-cyan/30 bg-neon-cyan/[0.06]" : "border-border bg-background/30"
      }`}
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-lg font-semibold tracking-tight tnum">
        {value} <span className="text-[11px] font-medium text-muted-foreground">XLM</span>
      </div>
    </div>
  );
}

function RoleChip({ label, addr, you }: { label: string; addr?: string; you?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-background/30 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tnum">{addr ? shortenAddr(addr) : "—"}</span>
      {you && (
        <span className="rounded-full bg-neon-cyan px-1.5 text-[10px] font-bold text-background">you</span>
      )}
    </div>
  );
}

function Action({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/20 p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-medium">
        <span className="text-neon-cyan">{icon}</span>
        {title}
        <span className="text-xs font-normal text-muted-foreground">· {hint}</span>
      </div>
      {children}
    </div>
  );
}
