import * as React from "react";
import {
  Activity,
  Check,
  CircleAlert,
  KeyRound,
  Loader2,
  Network,
  RouteOff,
  ServerCog,
  Terminal,
  Users,
  ZapOff,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { PageHeader } from "@/design/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design/ui/table";
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";

import {
  useModelGatewayAppConnectionsQuery,
  useModelGatewayProvidersQuery,
  useSmokeModelGatewayActiveRouteMutation,
  useModelGatewayStatusQuery,
} from "@/lib/query/model-gateway";
import { MODEL_GATEWAY_APP_SCOPES } from "../types";
import type {
  ModelGatewayActiveRouteStatus,
  ModelGatewayAppConnection,
  ModelGatewayAppScope,
  ModelGatewayProviderView,
} from "../types";
import type { ModelGatewayViewProps } from "./types";
import { formatModelBudgetPair } from "../budget-format";
import { GatewayKeyDialog } from "./GatewayKeyDialog";
import {
  GatewayMark,
  GatewayMetricCard,
  GatewayStatusDot,
  providerIdentityFromText,
  type GatewayComparison,
  type GatewayStatusTone,
} from "./GatewayUi";
import { RuntimeDiagnosticsPanel } from "./RuntimeDiagnosticsPanel";
import { DaemonServicePanel } from "./DaemonServicePanel";

/** Panel shell matching the prototype `.panel` block. */
function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-line bg-panel shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-md font-semibold text-ink-strong">{title}</h3>
        {sub && <span className="text-sm text-muted">{sub}</span>}
      </div>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/** A single icon + two-line copy + trailing slot row (prototype `.route-row`). */
function Row({
  icon,
  iconClass,
  title,
  subtitle,
  trailing,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4",
          iconClass,
        )}
      >
        {icon}
      </span>
      <span className="grid min-w-0 flex-1">
        <strong className="truncate text-base text-ink-strong">{title}</strong>
        {subtitle && (
          <span className="truncate text-sm text-muted">{subtitle}</span>
        )}
      </span>
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  );
}

const ROUTE_STATE_BADGE: Record<
  ModelGatewayActiveRouteStatus["state"],
  { variant: "ok" | "warn" | "bad" | "mute"; label: string }
> = {
  fixed: { variant: "ok", label: "已固定" },
  auto: { variant: "ok", label: "自动选择" },
  fallback: { variant: "warn", label: "已降级" },
  missing: { variant: "bad", label: "未解析" },
};

const ROUTE_SMOKE_BADGE: Record<
  ModelGatewayActiveRouteStatus["verification"]["state"],
  { variant: "ok" | "warn" | "bad" | "mute"; label: string }
> = {
  unverified: { variant: "mute", label: "未验证" },
  passed: { variant: "ok", label: "通过" },
  failed: { variant: "bad", label: "失败" },
  expired: { variant: "warn", label: "过期" },
};

/** Map a provider's circuit/health to a status badge built only from live data. */
function providerHealthBadge(provider: ModelGatewayProviderView): {
  variant: "ok" | "warn" | "bad";
  label: string;
} {
  const endpointProfiles =
    provider.endpointProfiles?.filter((profile) => profile.enabled) ?? [];
  const openEndpointCount = endpointProfiles.filter(
    (profile) => profile.health.circuitState === "open",
  ).length;
  const degradedEndpointCount = endpointProfiles.filter(
    (profile) =>
      profile.health.circuitState !== "closed" ||
      profile.health.retryAfterUntil ||
      profile.health.consecutiveFailures > 0 ||
      profile.health.lastError,
  ).length;
  if (provider.health.circuitState === "open")
    return { variant: "bad", label: "熔断" };
  if (openEndpointCount > 0) return { variant: "bad", label: "部分熔断" };
  if (provider.health.circuitState === "half-open")
    return { variant: "warn", label: "观察" };
  if (
    degradedEndpointCount > 0 ||
    provider.health.consecutiveFailures > 0 ||
    provider.health.lastError
  ) {
    return { variant: "warn", label: "部分异常" };
  }
  if (!provider.enabled) return { variant: "warn", label: "停用" };
  return { variant: "ok", label: "在线" };
}

function providerNeedsAttention(provider: ModelGatewayProviderView): boolean {
  return providerHealthBadge(provider).variant !== "ok";
}

function providerAttentionSummary(provider: ModelGatewayProviderView): string {
  const endpointProfiles =
    provider.endpointProfiles?.filter((profile) => profile.enabled) ?? [];
  const riskyEndpoint = endpointProfiles.find(
    (profile) =>
      profile.health.circuitState !== "closed" ||
      profile.health.retryAfterUntil ||
      profile.health.consecutiveFailures > 0 ||
      profile.health.lastError,
  );
  if (riskyEndpoint) {
    return `${riskyEndpoint.name} · ${riskyEndpoint.health.lastError || `circuit ${riskyEndpoint.health.circuitState}`} · 连续失败 ${riskyEndpoint.health.consecutiveFailures}`;
  }
  return provider.health.lastError
    ? `${provider.health.lastError} · 连续失败 ${provider.health.consecutiveFailures}`
    : `circuit ${provider.health.circuitState} · 连续失败 ${provider.health.consecutiveFailures}`;
}

function appConnectionBadge(connection: ModelGatewayAppConnection): {
  variant: "ok" | "warn" | "mute";
  label: string;
} {
  if (connection.configured) return { variant: "ok", label: "已应用" };
  if (connection.issues.length > 0) return { variant: "warn", label: "待处理" };
  return { variant: "mute", label: "未应用" };
}

const APP_SCOPE_LABEL: Record<ModelGatewayAppScope, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
};

function connectionForScope(
  scope: ModelGatewayAppScope,
  connections: ModelGatewayAppConnection[],
): ModelGatewayAppConnection | null {
  return (
    connections.find((connection) => connection.appScope === scope) ?? null
  );
}

function routeForScope(
  scope: ModelGatewayAppScope,
  routes: ModelGatewayActiveRouteStatus[],
): ModelGatewayActiveRouteStatus | null {
  return routes.find((route) => route.scope === scope) ?? null;
}

function formatRouteSmokeCheckedAt(checkedAt: string): string {
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedAtMs)) return "上次检查时间未知";
  const diffMs = Date.now() - checkedAtMs;
  if (diffMs >= 0 && diffMs < 60_000) return "刚刚检查";
  if (diffMs >= 0 && diffMs < 60 * 60_000) {
    return `${Math.max(1, Math.floor(diffMs / 60_000))} 分钟前`;
  }
  if (diffMs >= 0 && diffMs < 24 * 60 * 60_000) {
    return `${Math.max(1, Math.floor(diffMs / (60 * 60_000)))} 小时前`;
  }
  return `上次 ${new Date(checkedAt).toLocaleString()}`;
}

function routeBudgetLabel(
  route: ModelGatewayActiveRouteStatus,
  providers: ModelGatewayProviderView[],
): string | null {
  if (!route.resolvedProviderId || !route.resolvedModel) return null;
  const resolvedModel = route.resolvedModel;
  const provider = providers.find(
    (item) => item.id === route.resolvedProviderId,
  );
  const model = provider?.models?.models.find(
    (item) =>
      item.id === resolvedModel || item.aliases?.includes(resolvedModel),
  );
  return formatModelBudgetPair({
    contextWindow: model?.contextWindow,
    maxOutputTokens: model?.maxOutputTokens,
  });
}

const OVERVIEW_STALE_MS = 30_000;

const LIVE_COMPARISON: GatewayComparison = {
  label: "实时",
  tone: "primary",
  direction: "flat",
};

export function OverviewView({ goToView }: ModelGatewayViewProps) {
  const statusQuery = useModelGatewayStatusQuery({
    staleTime: OVERVIEW_STALE_MS,
    retry: false,
  });
  const providersQuery = useModelGatewayProvidersQuery({
    staleTime: OVERVIEW_STALE_MS,
    retry: false,
  });
  const connectionsQuery = useModelGatewayAppConnectionsQuery({
    staleTime: OVERVIEW_STALE_MS,
    retry: false,
  });
  const smokeMutation = useSmokeModelGatewayActiveRouteMutation();

  const [keyDialogOpen, setKeyDialogOpen] = React.useState(false);
  const [smokingScope, setSmokingScope] = React.useState<string | null>(null);
  const [batchSmoking, setBatchSmoking] = React.useState(false);
  const [diagnosticsEnabled, setDiagnosticsEnabled] = React.useState(false);
  const [serviceEnabled, setServiceEnabled] = React.useState(false);

  const error =
    statusQuery.error && providersQuery.error && connectionsQuery.error
      ? statusQuery.error
      : null;

  if (error) {
    return (
      <ErrorState
        title="无法加载网关概览"
        description={error.message}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void statusQuery.refetch();
              void providersQuery.refetch();
              void connectionsQuery.refetch();
            }}
          >
            重试
          </Button>
        }
      />
    );
  }

  const status = statusQuery.data;
  const providers = providersQuery.data;
  const connections = connectionsQuery.data;

  const activeRoutes = providers?.activeRoutes ?? [];
  const routeAlerts = providers?.activeRouteAlerts ?? [];
  const providerList = providers?.providers ?? [];
  const providerSummary = providers?.summary;
  const routeSummary = providerSummary?.routes;
  const accountSummary = providerSummary?.accounts;
  const providerCounts = providerSummary?.providers;
  const appConnections = connections?.connections ?? [];
  const checkableRoutes = activeRoutes.filter((route) =>
    Boolean(route.resolvedProviderId),
  );
  const configuredConnectionCount = appConnections.filter(
    (connection) => connection.configured,
  ).length;
  const appConnectionIssues = appConnections.filter(
    (connection) => !connection.configured || connection.issues.length > 0,
  );

  const health = status?.healthSummary;
  const listener = status?.listener;
  const clientAuthConfigured = status?.registry.clientAuth.enabled ?? false;
  // Attention items are built ONLY from live provider health — no fabrication.
  const attentionProviders = providerList.filter(providerNeedsAttention);
  const healthyProviders = providerList.filter(
    (provider) => !providerNeedsAttention(provider),
  );
  const routeReady = routeSummary?.ready ?? activeRoutes.filter((route) => route.state !== "missing").length;
  const routeTotal = routeSummary?.total ?? activeRoutes.length;
  const routeMissing = routeSummary?.missing ?? activeRoutes.filter((route) => route.state === "missing").length;
  const routeFallback = routeSummary?.fallback ?? activeRoutes.filter((route) => route.state === "fallback").length;
  const smokePassed = activeRoutes.filter((route) => route.verification.state === "passed").length;
  const smokeFailed = activeRoutes.filter((route) => route.verification.state === "failed").length;
  const smokeExpired = activeRoutes.filter((route) => route.verification.state === "expired").length;
  const smokeUnverified = activeRoutes.filter((route) => route.verification.state === "unverified").length;
  const providerHealthy = providerCounts?.healthy ?? health?.okProviders ?? healthyProviders.length;
  const providerTotal = providerCounts?.total ?? status?.registry.providerCount ?? providerList.length;
  const providerDegraded = providerCounts?.degraded ?? health?.degradedProviders ?? 0;
  const openCircuitCount = providerCounts?.openCircuits ?? health?.openCircuits ?? 0;
  const accountsReady = accountSummary?.ready ?? 0;
  const accountsTotal = accountSummary?.total ?? 0;
  const accountsAttention = accountSummary?.attention ?? 0;
  const clientConfigured = configuredConnectionCount;
  const clientTotal = appConnections.length;

  // Status banner tone: which path does traffic take, and is it healthy?
  const gatewayTone: GatewayStatusTone = !providers
    ? "mute"
    : smokeFailed > 0 || routeMissing > 0
      ? "bad"
      : routeFallback > 0 ||
          routeAlerts.length > 0 ||
          providerDegraded > 0 ||
          openCircuitCount > 0 ||
          routeTotal === 0
        ? "warn"
        : "ok";
  const bannerHeadline =
    gatewayTone === "mute"
      ? "正在检测网关路由与健康状态"
      : gatewayTone === "bad"
        ? smokeFailed > 0
          ? `${smokeFailed} 条路由验证失败，流量未按预期转发`
          : `${routeMissing} 条客户端路由未解析，流量未按预期转发`
        : gatewayTone === "warn"
          ? routeTotal === 0
            ? "尚未检测到客户端路由，先配置 Provider 并应用客户端接入"
            : "部分路由降级或存在配置告警，流量仍可转发"
          : "全部客户端路由健康，流量按预期转发";
  // Dominant egress: the provider that carries the most client scopes.
  const routeProviderCounts = new Map<string, number>();
  for (const route of activeRoutes) {
    if (route.resolvedProviderName) {
      routeProviderCounts.set(
        route.resolvedProviderName,
        (routeProviderCounts.get(route.resolvedProviderName) ?? 0) + 1,
      );
    }
  }
  let dominantProviderName: string | null = null;
  let dominantProviderCount = 0;
  for (const [name, count] of routeProviderCounts) {
    if (count > dominantProviderCount) {
      dominantProviderName = name;
      dominantProviderCount = count;
    }
  }

  const smokeActiveRoute = async (route: ModelGatewayActiveRouteStatus) => {
    setSmokingScope(route.scope);
    try {
      const result = await smokeMutation.mutateAsync({
        scope: route.scope,
        model: route.resolvedModel ?? undefined,
      });
      const providerDrift =
        route.resolvedProviderId &&
        result.providerId !== route.resolvedProviderId
          ? `实际 Provider：${result.providerId}`
          : undefined;
      const description = [providerDrift, result.responsePreview ?? undefined]
        .filter(Boolean)
        .join(" · ");
      await providersQuery.refetch();
      if (result.ok) {
        toast.success(`${route.scope} 路由正常 · ${result.latencyMs}ms`, {
          description: description || undefined,
        });
      } else {
        toast.error(`${route.scope} 路由失败`, {
          description: result.error?.message ?? (description || "未知错误"),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "路由检查请求失败";
      toast.error(`${route.scope} 路由检查失败`, { description: message });
    } finally {
      setSmokingScope(null);
    }
  };

  const smokeAllActiveRoutes = async () => {
    setBatchSmoking(true);
    try {
      for (const route of checkableRoutes) {
        await smokeActiveRoute(route);
      }
    } finally {
      setBatchSmoking(false);
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        className="px-0"
        title="模型网关"
        description="汇总真实 Provider 健康、客户端路由、账号池可用性和最近 smoke 结果；配置和运行态分离，避免用静态卡片误判网关状态。"
        meta={
          <>
            <Badge variant={routeAlerts.length > 0 || smokeFailed > 0 ? "warn" : "ok"} className="gap-1.5">
              {routeAlerts.length > 0 || smokeFailed > 0 ? <RouteOff className="size-3.5" /> : <Check className="size-3.5" />}
              {smokeFailed > 0
                ? `${smokeFailed} 条路由验证失败`
                : routeAlerts.length > 0
                  ? `${routeAlerts.length} 条配置告警`
                  : `已解析 ${routeReady}/${routeTotal}`}
            </Badge>
            <Badge variant={clientAuthConfigured ? "ok" : "mute"} className="gap-1.5">
              <KeyRound className="size-3.5" />
              {clientAuthConfigured ? "网关密钥已启用" : "网关密钥未启用"}
            </Badge>
          </>
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => setKeyDialogOpen(true)}>
            <KeyRound className="size-3.5" />
            网关密钥
          </Button>
        }
      />

      {/* Status banner — 流量走哪条路、健康吗？ */}
      <section
        className={cn(
          "rounded-md border bg-panel px-4 py-3.5 shadow-sm",
          gatewayTone === "bad"
            ? "border-danger-line"
            : gatewayTone === "warn"
              ? "border-warning-line"
              : "border-line",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <GatewayStatusDot tone={gatewayTone} halo className="size-2.5" />
          <h2 className="text-md font-semibold text-ink-strong">
            {bannerHeadline}
          </h2>
          {dominantProviderName && (
            <span className="text-sm text-muted">
              主要出口{" "}
              <strong className="font-medium text-ink">
                {dominantProviderName}
              </strong>
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-subtle tabular-nums">
            <Network className="size-3.5 text-primary" />
            {listener ? `${listener.host}:${listener.port}` : "监听信息不可用"}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {MODEL_GATEWAY_APP_SCOPES.map((scope) => {
            const route = routeForScope(scope, activeRoutes);
            const chipTone: GatewayStatusTone = !route
              ? providersQuery.isLoading
                ? "mute"
                : "bad"
              : route.state === "missing"
                ? "bad"
                : route.state === "fallback"
                  ? "warn"
                  : "ok";
            const chipTarget = route?.resolvedProviderName
              ? `${route.resolvedProviderName}${route.resolvedModel ? ` · ${route.resolvedModel}` : ""}`
              : providersQuery.isLoading
                ? "解析中"
                : "未解析";
            return (
              <span
                key={scope}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2.5 py-1 text-xs text-muted"
                title={chipTarget}
              >
                <GatewayStatusDot tone={chipTone} />
                <span className="truncate">
                  {APP_SCOPE_LABEL[scope]} → {chipTarget}
                </span>
              </span>
            );
          })}
        </div>
        {routeAlerts.length > 0 && (
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="flex flex-wrap items-start gap-2 text-sm text-warning">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <div className="grid gap-1">
                {routeAlerts.slice(0, 3).map((alert) => (
                  <span key={alert}>{alert}</span>
                ))}
                {routeAlerts.length > 3 && (
                  <span className="text-muted">另有 {routeAlerts.length - 3} 条路由告警</span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-md border border-line bg-panel shadow-sm">
        <div className="grid grid-cols-1 gap-3 p-4 min-[620px]:grid-cols-2 xl:grid-cols-4">
          <GatewayMetricCard
            icon={<RouteOff />}
            tone="primary"
            label="路由已解析"
            value={`${routeReady}/${routeTotal}`}
            sub={`${routeFallback} 降级 · ${routeMissing} 未解析`}
            accent={`${smokePassed} 通过 · ${smokeFailed} 失败 · ${smokeExpired} 过期 · ${smokeUnverified} 未验证`}
            meter={routeTotal > 0 ? routeReady / routeTotal : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<ServerCog />}
            tone="teal"
            label="Provider 健康"
            value={`${providerHealthy}/${providerTotal}`}
            sub={`${providerDegraded} 降级 · ${openCircuitCount} 熔断`}
            accent={`${providerCounts?.enabled ?? providerList.filter((item) => item.enabled).length} 启用`}
            meter={providerTotal > 0 ? providerHealthy / providerTotal : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<Users />}
            tone="violet"
            label="账号池可用"
            value={accountsTotal > 0 ? `${accountsReady}/${accountsTotal}` : "0"}
            sub={accountsTotal > 0 ? `${accountsAttention} 个账号需处理` : "未启用账号池 Provider"}
            accent={accountsTotal > 0 ? `${accountsReady} ready` : "API key"}
            meter={accountsTotal > 0 ? accountsReady / accountsTotal : 1}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<Terminal />}
            tone="primary"
            label="客户端接入"
            value={`${clientConfigured}/${clientTotal}`}
            sub={`${appConnectionIssues.length} 个配置项需关注`}
            accent={clientAuthConfigured ? "key on" : "key off"}
            meter={clientTotal > 0 ? clientConfigured / clientTotal : 0}
            comparison={LIVE_COMPARISON}
          />
        </div>
      </section>

      {/* Route cockpit — Gateway owns routing; CLI Agents owns runtime. The
          table itself is the surface: no nested panel chrome. */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3 px-1">
          <div className="min-w-0">
            <h3 className="text-md font-semibold text-ink-strong">模型路由总览</h3>
            <span className="text-sm text-muted">每个客户端入口的真实 Provider、模型预算、配置状态与最近检查</span>
          </div>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void smokeAllActiveRoutes()}
              disabled={
                checkableRoutes.length === 0 ||
                smokeMutation.isPending ||
                batchSmoking
              }
              aria-label="检查全部客户端入口当前模型路由"
              title="按 Codex / Claude Code / OpenCode / OpenClaw 逐条检查真实模型路由"
            >
              {batchSmoking ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Activity className="size-3.5" />
              )}
              检查全部
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToView("apps")}
            >
              <Terminal className="size-3.5" />
              客户端接入
            </Button>
          </div>
        </div>
        <Table className="table-fixed">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[45%]" />
              <col className="hidden lg:table-column lg:w-[18%]" />
              <col className="hidden xl:table-column xl:w-[12%]" />
              <col className="w-[23%] lg:w-[23%] xl:w-[11%]" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>客户端入口</TableHead>
                <TableHead>实际路由</TableHead>
                <TableHead className="hidden lg:table-cell">本地配置</TableHead>
                <TableHead className="hidden xl:table-cell">最近检查</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODEL_GATEWAY_APP_SCOPES.map((scope) => {
                const route = routeForScope(scope, activeRoutes);
                const connection = connectionForScope(scope, appConnections);
                const stateBadge = route
                  ? ROUTE_STATE_BADGE[route.state]
                  : providersQuery.isLoading
                    ? { variant: "mute" as const, label: "检测中" }
                    : { variant: "bad" as const, label: "未解析" };
                const configBadge = connection
                  ? appConnectionBadge(connection)
                  : connectionsQuery.isLoading
                    ? { variant: "mute" as const, label: "检测中" }
                    : { variant: "mute" as const, label: "无客户端" };
                const lastSmoke = route?.verification ?? null;
                const smokeBadge = lastSmoke
                  ? ROUTE_SMOKE_BADGE[lastSmoke.state]
                  : ROUTE_SMOKE_BADGE.unverified;
                const budget = route
                  ? routeBudgetLabel(route, providerList)
                  : null;
                const routeLine = route
                  ? [
                      route.resolvedProviderName,
                      route.resolvedModel,
                      route.resolvedEndpointProfileName ?? route.routeId,
                      budget,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : providersQuery.isLoading
                    ? "正在解析当前模型路由"
                    : "未解析到 active route";
                const canSmoke = Boolean(route?.resolvedProviderId);
                return (
                  <TableRow
                    key={scope}
                    className={cn(
                      route?.state === "missing" && "bg-danger-soft/20",
                      route?.state === "fallback" && "bg-warning-soft/20",
                    )}
                  >
                    <TableCell className="min-w-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-base text-ink-strong">
                            {APP_SCOPE_LABEL[scope]}
                          </strong>
                          <Badge variant={stateBadge.variant}>
                            {stateBadge.label}
                          </Badge>
                        </div>
                        <div className="truncate text-xs text-subtle">
                          {scope}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-start gap-2">
                          {route?.resolvedProviderName ? (
                            <GatewayMark identity={providerIdentityFromText(route.resolvedProviderName)} size="sm" />
                          ) : null}
                          <div
                            className="min-w-0 break-words text-sm font-medium leading-5 text-ink-strong"
                            title={routeLine}
                          >
                            {routeLine}
                          </div>
                        </div>
                        <div
                          className="break-all text-xs leading-5 text-muted"
                          title={
                            route?.upstreamUrl ??
                            route?.resolvedBaseUrl ??
                            undefined
                          }
                        >
                          {route?.resolvedApiFormat ?? "协议未知"}
                          {route?.upstreamUrl
                            ? ` · ${route.upstreamUrl}`
                            : route?.resolvedBaseUrl
                              ? ` · ${route.resolvedBaseUrl}`
                              : ""}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            goToView(
                              "apps",
                              connection ? { app: connection.id } : undefined,
                            )
                          }
                          className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-sm border border-line bg-panel-2 px-2 py-1 text-xs text-muted outline-none hover:bg-panel-3 focus-visible:shadow-[var(--ring)] lg:hidden"
                        >
                          <span className="truncate">
                            {connectionsQuery.isLoading
                              ? "正在检查本地客户端"
                              : (connection?.label ?? "未检测到本地客户端")}
                          </span>
                          <Badge variant={configBadge.variant}>
                            {configBadge.label}
                          </Badge>
                        </button>
                        {lastSmoke?.errorMessage && (
                            <div
                              className={cn(
                                "mt-1 truncate text-xs",
                                lastSmoke.state === "passed" ? "text-muted" : "text-danger",
                              )}
                              title={lastSmoke.errorMessage}
                            >
                              {lastSmoke.errorMessage}
                            </div>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <button
                        type="button"
                        onClick={() =>
                          goToView(
                            "apps",
                            connection ? { app: connection.id } : undefined,
                          )
                        }
                        className="flex min-w-0 items-center justify-between gap-2 rounded-sm border border-line bg-panel-2 px-2 py-1.5 text-left outline-none transition-colors hover:bg-panel-3 focus-visible:shadow-[var(--ring)]"
                      >
                        <span className="truncate text-sm text-muted">
                          {connectionsQuery.isLoading
                            ? "正在检查本地客户端"
                            : (connection?.label ?? "未检测到本地客户端")}
                        </span>
                        <Badge variant={configBadge.variant}>
                          {configBadge.label}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {lastSmoke ? (
                        <div className="grid justify-start gap-1">
                          <Badge variant={smokeBadge.variant}>
                            {lastSmoke.state === "passed"
                              ? `${smokeBadge.label} ${lastSmoke.latencyMs ?? "—"}ms`
                              : smokeBadge.label}
                          </Badge>
                          {lastSmoke.checkedAt ? (
                            <span
                              className="text-xs text-subtle"
                              title={new Date(lastSmoke.checkedAt).toLocaleString()}
                            >
                              {formatRouteSmokeCheckedAt(lastSmoke.checkedAt)}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-subtle">未检查</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-0">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => route && void smokeActiveRoute(route)}
                          disabled={!canSmoke || smokeMutation.isPending}
                          aria-label={`检查 ${scope} 当前路由`}
                          title={`按 ${scope} scope 检查当前真实路由`}
                          className="px-2"
                        >
                          {smokeMutation.isPending && smokingScope === scope ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Activity className="size-3.5" />
                          )}
                          检查路由
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => goToView("providers")}
                          className="px-2"
                        >
                          Provider
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* Health overview — only live provider health */}
        <Panel>
          <PanelHead
            title="健康概览"
            sub="熔断器状态"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToView("providers")}
              >
                查看 Provider
              </Button>
            }
          />
          {providerList.length === 0 ? (
            <EmptyState
              title="暂无 Provider"
              description="尚未配置任何 Provider。"
            />
          ) : (
            <div className="py-1.5">
              {attentionProviders.map((provider) => {
                const badge = providerHealthBadge(provider);
                const isOpen = provider.health.circuitState === "open";
                return (
                  <Row
                    key={provider.id}
                    icon={isOpen ? <ZapOff /> : <RouteOff />}
                    iconClass={
                      isOpen
                        ? "bg-danger-soft text-danger"
                        : "bg-warning-soft text-warning"
                    }
                    title={provider.name}
                    subtitle={providerAttentionSummary(provider)}
                    trailing={
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    }
                  />
                );
              })}
              {healthyProviders.length > 0 && (
                <Row
                  icon={<Check />}
                  iconClass="bg-success-soft text-success"
                  title={`${healthyProviders.length} 个 Provider 正常`}
                  subtitle={healthyProviders.map((p) => p.name).join(" · ")}
                  trailing={<Badge variant="ok">在线</Badge>}
                />
              )}
            </div>
          )}
        </Panel>

        {/* App connection risk summary — management lives in the Apps view; runtime readiness belongs to CLI Agents. */}
        <Panel>
          <PanelHead
            title="客户端接入风险"
            sub="配置写入 / 回滚入口；运行中状态看 CLI Agents"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToView("apps")}
              >
                管理
              </Button>
            }
          />
          {appConnections.length === 0 ? (
            <EmptyState
              title="暂无客户端"
              description="尚无可接入的本地客户端。"
            />
          ) : appConnectionIssues.length === 0 ? (
            <div className="grid gap-3 p-4">
              <div className="rounded-sm border border-line bg-panel-2 p-3">
                <span className="text-xs text-subtle">配置状态</span>
                <div className="mt-1 text-xl font-semibold text-ink-strong">
                  {configuredConnectionCount}/{appConnections.length}
                </div>
                <span className="text-xs text-muted">
                  本地客户端配置均已应用；实际路由以模型路由总览为准，进程运行态看
                  CLI Agents。
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToView("apps")}
              >
                <Terminal className="size-3.5" />
                打开配置写入 / 回滚
              </Button>
            </div>
          ) : (
            <div className="py-1.5">
              {appConnectionIssues.map((connection) => {
                const badge = appConnectionBadge(connection);
                return (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => goToView("apps", { app: connection.id })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                      <Terminal />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <strong className="truncate text-base text-ink-strong">
                        {connection.label}
                      </strong>
                      <span className="truncate text-sm text-muted">
                        {connection.issues[0] ??
                          "未应用，需要进入客户端接入页处理"}
                      </span>
                    </span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Secondary cockpit diagnostics — collapsed by default so the route /
          health summary above stays primary. */}
      <RuntimeDiagnosticsPanel
        enabled={diagnosticsEnabled}
        onEnable={() => setDiagnosticsEnabled(true)}
      />
      <DaemonServicePanel
        enabled={serviceEnabled}
        onEnable={() => setServiceEnabled(true)}
      />

      <GatewayKeyDialog
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
        onMutated={() => {
          void statusQuery.refetch();
        }}
      />
    </div>
  );
}
