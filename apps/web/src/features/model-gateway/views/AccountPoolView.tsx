import * as React from "react";
import {
  ExternalLink,
  LogIn,
  Power,
  RefreshCw,
  SnowflakeIcon,
  Users,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design/ui/table";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";
import { toast } from "@/design/ui/sonner";

import {
  usePollCodexAccountLoginMutation,
  useRefreshModelGatewayProviderAccountMutation,
  useStartCodexAccountLoginMutation,
  useModelGatewayProvidersQuery,
  useUpdateModelGatewayProviderAccountMutation,
} from "@/lib/query/model-gateway";
import type {
  ModelGatewayAccountEntry,
  ModelGatewayAccountState,
  ModelGatewayCodexAccountLoginStartResponse,
  ModelGatewayProviderView,
} from "../types";
import type { ModelGatewayViewProps } from "./types";
import {
  GatewayMark,
  GatewayMetricCard,
  providerIdentityFromText,
  type GatewayComparison,
} from "./GatewayUi";

const ACCOUNT_STATE_BADGE: Record<
  ModelGatewayAccountState,
  { variant: "ok" | "warn" | "bad" | "mute" | "info"; label: string }
> = {
  ready: { variant: "ok", label: "正常" },
  "needs-login": { variant: "warn", label: "需登录" },
  refreshing: { variant: "info", label: "刷新中" },
  cooldown: { variant: "warn", label: "冷却" },
  disabled: { variant: "mute", label: "停用" },
  error: { variant: "bad", label: "异常" },
};

const LIVE_COMPARISON: GatewayComparison = {
  label: "实时",
  tone: "primary",
  direction: "flat",
};

function accountStateRank(account: ModelGatewayAccountEntry): number {
  if (!account.enabled || account.state === "disabled") return 3;
  if (account.state === "error" || account.state === "needs-login") return 0;
  if (account.state === "cooldown" || account.state === "refreshing") return 1;
  return 2;
}

/** Format an ISO timestamp into a short local string, or a dash. */
function fmtTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/** Relative "in N min/hr" hint for a future cooldown deadline. */
function cooldownHint(value: string | null): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `约 ${mins} 分钟后`;
  const hrs = Math.round(mins / 60);
  return `约 ${hrs} 小时后`;
}

/** Short HH:MM clock time of a cooldown deadline, or null when absent/past. */
function cooldownClock(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * In-page Codex device-login panel. Starts a login (device code + official
 * authorization URL) and polls for completion. Per the locked rule, it shows
 * the code and an explicit "open authorization page" link — it never opens a
 * popup automatically.
 */
function CodexLoginPanel({ providerId }: { providerId: string }) {
  const startMutation = useStartCodexAccountLoginMutation();
  const pollMutation = usePollCodexAccountLoginMutation();
  const [session, setSession] =
    React.useState<ModelGatewayCodexAccountLoginStartResponse | null>(null);
  const [status, setStatus] = React.useState<
    "idle" | "pending" | "completed" | "expired" | "failed"
  >("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  const pollMutate = pollMutation.mutate;

  // Poll on the server-provided interval while a login session is pending.
  React.useEffect(() => {
    if (!session || status !== "pending") return;
    const intervalMs = Math.max(2, session.pollIntervalSeconds || 5) * 1000;
    const timer = window.setInterval(() => {
      pollMutate(
        { loginId: session.loginId },
        {
          onSuccess: (result) => {
            setStatus(result.status);
            setMessage(result.message);
            if (result.status === "completed") {
              toast.success("Codex 账户登录完成");
            } else if (result.status === "expired") {
              toast.error("登录已过期", { description: "请重新发起登录。" });
            } else if (result.status === "failed") {
              toast.error("登录失败", { description: result.message ?? undefined });
            }
          },
          onError: (error) => {
            setStatus("failed");
            setMessage(error.message);
          },
        },
      );
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [session, status, pollMutate]);

  const handleStart = () => {
    setMessage(null);
    startMutation.mutate(
      { providerId },
      {
        onSuccess: (result) => {
          setSession(result);
          setStatus("pending");
        },
        onError: (error) =>
          toast.error("无法发起 Codex 登录", { description: error.message }),
      },
    );
  };

  return (
    <section className="grid gap-3 rounded-md border border-line bg-panel-2 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <strong className="text-base text-ink-strong">登录新账号（Codex 设备授权）</strong>
          <p className="text-sm text-muted">
            在本页内完成设备授权：发起后复制下方代码，打开官方授权页粘贴。完成后账号自动入池。
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleStart}
          disabled={startMutation.isPending || status === "pending"}
        >
          <LogIn />
          {startMutation.isPending
            ? "发起中…"
            : status === "pending"
              ? "等待授权…"
              : "发起登录"}
        </Button>
      </div>

      {session && (
        <div className="grid gap-2 rounded-md border border-line bg-panel p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-subtle">设备代码</span>
            <code className="select-all rounded-sm bg-panel-3 px-2 py-1 font-mono text-base text-ink-strong">
              {session.userCode}
            </code>
            <Button variant="outline" size="sm" asChild>
              {/* Explicit link — no auto popup. */}
              <a href={session.verificationUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink />
                打开官方授权页
              </a>
            </Button>
            <Badge
              variant={
                status === "completed"
                  ? "ok"
                  : status === "pending"
                    ? "info"
                    : "bad"
              }
            >
              {status === "completed"
                ? "已完成"
                : status === "pending"
                  ? "等待授权"
                  : status === "expired"
                    ? "已过期"
                    : "失败"}
            </Badge>
          </div>
          <p className="break-all text-xs text-subtle">
            授权地址：{session.verificationUrl} · 有效期至 {fmtTime(session.expiresAt)}
          </p>
          {message && <p className="text-xs text-muted">{message}</p>}
        </div>
      )}
    </section>
  );
}

function AccountRow({
  provider,
  account,
}: {
  provider: ModelGatewayProviderView;
  account: ModelGatewayAccountEntry;
}) {
  const updateMutation = useUpdateModelGatewayProviderAccountMutation();
  const refreshMutation = useRefreshModelGatewayProviderAccountMutation();

  const badge = ACCOUNT_STATE_BADGE[account.state] ?? {
    variant: "mute" as const,
    label: account.state,
  };
  const cooldown = cooldownHint(account.cooldownUntil);
  const cooldownAt = cooldownClock(account.cooldownUntil);
  const busy = updateMutation.isPending || refreshMutation.isPending;

  const runUpdate = (
    payload: Parameters<typeof updateMutation.mutate>[0]["payload"],
    successText: string,
  ) => {
    updateMutation.mutate(
      { providerId: provider.id, accountId: account.id, payload },
      {
        onSuccess: () => toast.success(successText),
        onError: (error) => toast.error("操作失败", { description: error.message }),
      },
    );
  };

  const handleRefresh = () => {
    refreshMutation.mutate(
      { providerId: provider.id, accountId: account.id },
      {
        onSuccess: () => toast.success("已刷新 token"),
        onError: (error) => toast.error("刷新失败", { description: error.message }),
      },
    );
  };

  return (
    <TableRow>
      <TableCell>
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          <GatewayMark identity={providerIdentityFromText(account.emailMasked ?? account.accountHash ?? account.id)} size="md" />
          <div className="grid min-w-0 gap-0.5">
            <strong className="truncate text-base text-ink-strong">
              {account.emailMasked ?? account.accountHash ?? account.id}
            </strong>
            <span className="truncate text-sm text-muted">
              {[account.plan, account.kind].filter(Boolean).join(" · ") || "—"}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="mr-1.5 text-xs text-subtle sm:hidden">状态</span>
        <div className="flex flex-col gap-0.5">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {account.state === "cooldown" && (cooldownAt || cooldown) && (
            <span className="text-xs text-subtle" title={fmtTime(account.cooldownUntil)}>
              {cooldownAt ? `冷却至 ${cooldownAt}` : "冷却中"}
              {cooldown && `（${cooldown}）`}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span className="mr-1.5 text-xs text-subtle sm:hidden">到期</span>
        <span className="text-sm text-muted">{fmtTime(account.expiresAt)}</span>
      </TableCell>
      <TableCell>
        <div className="grid gap-0.5 text-sm">
          <span className="text-muted">成功：{fmtTime(account.lastSuccessAt)}</span>
          {account.lastError && (
            <span className="truncate text-danger" title={account.lastError}>
              错误：{account.lastError}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={busy}>
            <RefreshCw />
            {refreshMutation.isPending ? "刷新中…" : "刷新 token"}
          </Button>
          {account.state === "cooldown" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => runUpdate({ clearCooldown: true }, "已清除冷却")}
              disabled={busy}
            >
              <SnowflakeIcon />
              清除冷却
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              runUpdate(
                { enabled: !account.enabled },
                account.enabled ? "已停用账号" : "已启用账号",
              )
            }
            disabled={busy}
          >
            <Power />
            {account.enabled ? "停用" : "启用"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Account-pool child page. Account-Provider-only by contract: a non-account
 * provider (or no selection) renders an explicit boundary EmptyState instead of
 * a fabricated table. Accounts come from the live providers query
 * (`provider.accountProvider.accounts`); enable/disable/clear-cooldown flow
 * through the single update-account mutation, refresh through its own mutation.
 */
export function AccountPoolView({ selectedProvider, goToView }: ModelGatewayViewProps) {
  const providersQuery = useModelGatewayProvidersQuery();

  if (providersQuery.isLoading) {
    return (
      <div className="grid gap-4" role="status" aria-busy="true">
        <div className="grid gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="rounded-md border border-line bg-panel">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (providersQuery.error) {
    return (
      <ErrorState
        title="无法加载账号池"
        description={providersQuery.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void providersQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  const providers = providersQuery.data?.providers ?? [];
  const provider = selectedProvider
    ? providers.find((p) => p.id === selectedProvider) ?? null
    : null;

  // Boundary: account pool is account-Provider-only.
  if (!provider || !provider.accountProvider) {
    return (
      <div className="grid gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-strong">账号池</h2>
          <p className="text-sm text-muted">仅账号制 Provider 提供账号池。</p>
        </div>
        <EmptyState
          icon={<Users />}
          title="仅账号制 Provider 提供账号池"
          description={
            provider
              ? `「${provider.name}」是 API Key / 中继类 Provider，没有可轮换的账号池。账号池仅适用于账号制 Provider（如 Codex / ChatGPT 登录账号）。`
              : "请从 Provider 列表中选择一个账号制 Provider，再进入其账号池。"
          }
          action={
            <Button variant="outline" size="sm" onClick={() => goToView("providers")}>
              返回 Provider 列表
            </Button>
          }
        />
      </div>
    );
  }

  const accounts = provider.accountProvider.accounts;
  const routing = provider.accountProvider.routing;
  const sortedAccounts = [...accounts].sort((left, right) => (
    accountStateRank(left) - accountStateRank(right)
    || (right.updatedAt || "").localeCompare(left.updatedAt || "")
    || left.id.localeCompare(right.id)
  ));
  const readyAccounts = accounts.filter((account) => account.enabled && account.state === "ready").length;
  const enabledAccounts = accounts.filter((account) => account.enabled).length;
  const attentionAccounts = accounts.filter((account) => (
    !account.enabled
    || account.state === "needs-login"
    || account.state === "error"
    || account.state === "cooldown"
  )).length;
  const cooldownAccounts = accounts.filter((account) => account.state === "cooldown").length;
  const lastSuccessAt = accounts
    .map((account) => account.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-md border border-primary-line/40 bg-panel shadow-sm">
        <div className="grid gap-4 border-b border-line bg-[color-mix(in_srgb,var(--violet)_4%,var(--panel))] p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start">
          <GatewayMark identity={providerIdentityFromText(provider.name)} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={readyAccounts > 0 ? "ok" : "warn"}>{readyAccounts > 0 ? "可路由" : "无 ready 账号"}</Badge>
              <Badge variant="outline">{routing.strategy}</Badge>
              {routing.sessionAffinity && <Badge variant="outline">会话粘性</Badge>}
            </div>
            <h2 className="mt-2 truncate text-2xl font-semibold text-ink-strong" title={provider.name}>
              账号池 · {provider.name}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              账号制 Provider 的多账号轮换、登录、冷却和 token 刷新。这里展示的是实时账号池状态，不替代客户端 active-route smoke。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button variant="ghost" size="sm" onClick={() => goToView("providers")}>
              返回 Provider 列表
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 min-[620px]:grid-cols-2 xl:grid-cols-4">
          <GatewayMetricCard
            icon={<Users />}
            tone="violet"
            label="Ready 账号"
            value={`${readyAccounts}/${accounts.length}`}
            sub={`${enabledAccounts} 启用 · ${attentionAccounts} 需处理`}
            accent="accounts"
            meter={accounts.length > 0 ? readyAccounts / accounts.length : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<LogIn />}
            tone="primary"
            label="轮换策略"
            value={routing.strategy}
            sub={routing.sessionAffinity ? "会话粘性已启用" : "无会话粘性"}
            accent={routing.maxConcurrentPerAccount ? `${routing.maxConcurrentPerAccount}/acct` : "auto"}
            meter={readyAccounts > 0 ? 1 : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<SnowflakeIcon />}
            tone="teal"
            label="冷却账号"
            value={`${cooldownAccounts}`}
            sub={cooldownAccounts > 0 ? "冷却结束后可重新参与路由" : "当前无冷却账号"}
            accent={cooldownAccounts > 0 ? "cooldown" : "clear"}
            meter={accounts.length > 0 ? 1 - cooldownAccounts / accounts.length : 1}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<RefreshCw />}
            tone="primary"
            label="最近成功"
            value={lastSuccessAt ? "已记录" : "—"}
            sub={fmtTime(lastSuccessAt)}
            accent="token"
            meter={lastSuccessAt ? 1 : 0}
            comparison={LIVE_COMPARISON}
          />
        </div>
      </section>

      <CodexLoginPanel providerId={provider.id} />

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="账号池为空"
          description="使用上方「登录新账号」入口登录一个账号后即可入池。"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>账号 / 套餐</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>到期</TableHead>
              <TableHead>最近</TableHead>
              <TableHead className="text-right">动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedAccounts.map((account) => (
              <AccountRow key={account.id} provider={provider} account={account} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
