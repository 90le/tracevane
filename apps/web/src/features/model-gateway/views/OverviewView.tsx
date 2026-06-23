import * as React from "react";
import { Activity, Check, Globe, KeyRound, Loader2, RouteOff, Terminal, ZapOff } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useModelGatewayAppConnectionsQuery,
  useModelGatewayProvidersQuery,
  useSmokeModelGatewayActiveRouteMutation,
  useModelGatewayStatusQuery,
} from "@/lib/query/model-gateway";
import type {
  ModelGatewayActiveRouteStatus,
  ModelGatewayAppConnection,
  ModelGatewayProviderView,
} from "../types";
import type { ModelGatewayViewProps } from "./types";
import { formatModelBudgetPair } from "../budget-format";
import { GatewayKeyDialog } from "./GatewayKeyDialog";
import { RuntimeDiagnosticsPanel } from "./RuntimeDiagnosticsPanel";
import { DaemonServicePanel } from "./DaemonServicePanel";

/** Panel shell matching the prototype `.panel` block. */
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-md border border-line bg-panel shadow-sm", className)}>
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
        {sub && <span className="text-sm text-subtle">{sub}</span>}
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
        {subtitle && <span className="truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  );
}

const ROUTE_STATE_BADGE: Record<
  ModelGatewayActiveRouteStatus["state"],
  { variant: "ok" | "warn" | "bad" | "mute"; label: string }
> = {
  fixed: { variant: "ok", label: "正常" },
  auto: { variant: "ok", label: "自动" },
  fallback: { variant: "warn", label: "降级" },
  missing: { variant: "bad", label: "未配置" },
};

/** Map a provider's circuit/health to a status badge built only from live data. */
function providerHealthBadge(provider: ModelGatewayProviderView): {
  variant: "ok" | "warn" | "bad";
  label: string;
} {
  if (provider.health.circuitState === "open") return { variant: "bad", label: "熔断" };
  if (provider.health.circuitState === "half-open") return { variant: "warn", label: "观察" };
  if (!provider.enabled) return { variant: "warn", label: "停用" };
  return { variant: "ok", label: "在线" };
}

function appConnectionBadge(connection: ModelGatewayAppConnection): {
  variant: "ok" | "warn" | "mute";
  label: string;
} {
  if (connection.configured) return { variant: "ok", label: "已应用" };
  if (connection.issues.length > 0) return { variant: "warn", label: "待处理" };
  return { variant: "mute", label: "未应用" };
}

type RouteSmokeResult = {
  ok: boolean;
  checkedAt: string;
  latencyMs: number | null;
  providerId: string | null;
  message: string;
};

function routeBudgetLabel(
  route: ModelGatewayActiveRouteStatus,
  providers: ModelGatewayProviderView[],
): string | null {
  if (!route.resolvedProviderId || !route.resolvedModel) return null;
  const resolvedModel = route.resolvedModel;
  const provider = providers.find((item) => item.id === route.resolvedProviderId);
  const model = provider?.models?.models.find(
    (item) => item.id === resolvedModel || item.aliases?.includes(resolvedModel),
  );
  return formatModelBudgetPair({
    contextWindow: model?.contextWindow,
    maxOutputTokens: model?.maxOutputTokens,
  });
}

export function OverviewView({ goToView }: ModelGatewayViewProps) {
  const statusQuery = useModelGatewayStatusQuery();
  const providersQuery = useModelGatewayProvidersQuery();
  const connectionsQuery = useModelGatewayAppConnectionsQuery();
  const smokeMutation = useSmokeModelGatewayActiveRouteMutation();

  const [keyDialogOpen, setKeyDialogOpen] = React.useState(false);
  const [smokingScope, setSmokingScope] = React.useState<string | null>(null);
  const [batchSmoking, setBatchSmoking] = React.useState(false);
  const [routeSmokeResults, setRouteSmokeResults] = React.useState<Record<string, RouteSmokeResult>>({});

  const isLoading =
    statusQuery.isLoading || providersQuery.isLoading || connectionsQuery.isLoading;
  const error = statusQuery.error ?? providersQuery.error ?? connectionsQuery.error;

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[132px] w-full" />
        <section className="rounded-md border border-line bg-panel shadow-sm">
          <Skeleton className="h-12 w-full rounded-b-none" />
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </section>
      </div>
    );
  }

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
  const appConnections = connections?.connections ?? [];
  const checkableRoutes = activeRoutes.filter((route) => Boolean(route.resolvedProviderId));

  const health = status?.healthSummary;
  const listener = status?.listener;
  const clientAuthConfigured = status?.registry.clientAuth.enabled ?? false;

  // Attention items are built ONLY from live provider health — no fabrication.
  const attentionProviders = providerList.filter(
    (p) => p.health.circuitState !== "closed" || !p.enabled,
  );
  const healthyProviders = providerList.filter(
    (p) => p.health.circuitState === "closed" && p.enabled,
  );

  const degraded = (health?.degradedProviders ?? 0) + (health?.openCircuits ?? 0);

  const smokeActiveRoute = async (route: ModelGatewayActiveRouteStatus) => {
    setSmokingScope(route.scope);
    try {
      const result = await smokeMutation.mutateAsync({
        scope: route.scope,
        model: route.resolvedModel ?? undefined,
      });
      const providerDrift =
        route.resolvedProviderId && result.providerId !== route.resolvedProviderId
          ? `实际 Provider：${result.providerId}`
          : undefined;
      const description = [providerDrift, result.responsePreview ?? undefined]
        .filter(Boolean)
        .join(" · ");
      setRouteSmokeResults((prev) => ({
        ...prev,
        [route.scope]: {
          ok: result.ok,
          checkedAt: result.checkedAt,
          latencyMs: result.latencyMs,
          providerId: result.providerId || null,
          message: result.ok
            ? providerDrift || "路由 smoke 通过"
            : result.error?.message ?? providerDrift ?? "路由 smoke 失败",
        },
      }));
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
      const message = error instanceof Error ? error.message : "路由检查请求失败";
      setRouteSmokeResults((prev) => ({
        ...prev,
        [route.scope]: {
          ok: false,
          checkedAt: new Date().toISOString(),
          latencyMs: null,
          providerId: route.resolvedProviderId,
          message,
        },
      }));
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
    <div className="grid gap-[18px]">
      {/* Hero: live listener + route-alert summary */}
      <section className="rounded-md border border-line bg-panel-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {routeAlerts.length > 0 ? (
            <Badge variant="warn" className="gap-1.5">
              <RouteOff className="size-3.5" />
              {routeAlerts.length} 条路由告警
            </Badge>
          ) : (
            <Badge variant="ok" className="gap-1.5">
              <Check className="size-3.5" />
              路由正常
            </Badge>
          )}
          <span className="text-sm text-muted">
            {listener ? `Gateway ${listener.host}:${listener.port}` : "Gateway 监听信息不可用"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setKeyDialogOpen(true)}
          >
            <KeyRound />
            网关密钥
            <Badge variant={clientAuthConfigured ? "ok" : "mute"} className="ml-0.5">
              {clientAuthConfigured ? "已配置" : "未配置"}
            </Badge>
          </Button>
        </div>
        {/* At-a-glance health anchor — derived only from live status. */}
        <p className="mt-3 text-base text-ink-strong">
          {listener ? "网关在线" : "网关状态未知"}
          <span className="text-muted"> · </span>
          {activeRoutes.length} 个路由
          <span className="text-muted"> · </span>
          {health?.okProviders ?? healthyProviders.length} 个 Provider 健康
          {degraded > 0 && (
            <>
              <span className="text-muted"> / </span>
              <span className="text-amber">{degraded} 降级</span>
            </>
          )}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">健康 Provider</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {health?.okProviders ?? 0}
              <small className="ml-0.5 text-sm font-normal text-muted">
                /{status?.registry.providerCount ?? providerList.length}
              </small>
            </div>
            <span className="text-xs text-muted">
              {health?.degradedProviders ?? 0} 降级 · {health?.openCircuits ?? 0} 熔断
            </span>
          </div>
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">当前路由</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">
              {activeRoutes.length}
            </div>
            <span className="text-xs text-muted">{routeAlerts.length} 条告警</span>
          </div>
          <div className="rounded-sm border border-line bg-panel p-3">
            <span className="text-xs text-subtle">需关注</span>
            <div className="mt-1 text-xl font-semibold text-ink-strong">{degraded}</div>
            <span className="text-xs text-muted">降级 / 熔断 Provider</span>
          </div>
        </div>
      </section>

      {/* Current routes — built from live activeRoutes */}
      <Panel>
        <PanelHead
          title="当前路由"
          sub="每个客户端解析到的 Provider / endpoint / 模型"
          action={
            <span className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void smokeAllActiveRoutes()}
                disabled={checkableRoutes.length === 0 || smokeMutation.isPending || batchSmoking}
                aria-label="检查全部当前路由"
                title="按每个客户端 scope 逐条检查当前真实路由"
              >
                {batchSmoking ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
                检查全部
              </Button>
              <Button variant="ghost" size="sm" onClick={() => goToView("providers")}>
                <Activity className="size-3.5" />
                查看 Provider
              </Button>
            </span>
          }
        />
        {activeRoutes.length === 0 ? (
          <EmptyState
            title="暂无解析路由"
            description="尚未配置任何客户端路由，前往 Provider 设置默认路由。"
          />
        ) : (
          <div className="py-1.5">
            {activeRoutes.map((route) => {
              const badge = ROUTE_STATE_BADGE[route.state];
              const lastSmoke = routeSmokeResults[route.scope];
              const detail = [
                route.resolvedApiFormat,
                route.resolvedProviderName,
                route.resolvedModel,
                routeBudgetLabel(route, providerList),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <Row
                  key={route.scope}
                  icon={route.resolvedProviderId ? <Terminal /> : <Globe />}
                  title={route.scope}
                  subtitle={
                    <span className="truncate">
                      <span>{detail || route.message}</span>
                      {lastSmoke && (
                        <>
                          <span> · </span>
                          <span className={lastSmoke.ok ? "text-green" : "text-red"}>
                            {lastSmoke.ok ? "最近通过" : "最近失败"}
                            {lastSmoke.latencyMs != null ? ` ${lastSmoke.latencyMs}ms` : ""}
                          </span>
                          {lastSmoke.message && lastSmoke.message !== "路由 smoke 通过" && (
                            <>
                              <span> · </span>
                              <span title={lastSmoke.message}>{lastSmoke.message}</span>
                            </>
                          )}
                        </>
                      )}
                    </span>
                  }
                  trailing={
                    <span className="flex items-center gap-2">
                      {lastSmoke && (
                        <Badge variant={lastSmoke.ok ? "ok" : "bad"}>
                          {lastSmoke.ok ? "已验" : "失败"}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void smokeActiveRoute(route)}
                        disabled={!route.resolvedProviderId || smokeMutation.isPending}
                        aria-label={`检查 ${route.scope} 当前路由`}
                        title={`按 ${route.scope} scope 检查当前真实路由`}
                      >
                        {smokeMutation.isPending && smokingScope === route.scope ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Activity className="size-3.5" />
                        )}
                        检查
                      </Button>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* Health overview — only live provider health */}
        <Panel>
          <PanelHead
            title="健康概览"
            sub="熔断器状态"
            action={
              <Button variant="ghost" size="sm" onClick={() => goToView("providers")}>
                查看 Provider
              </Button>
            }
          />
          {providerList.length === 0 ? (
            <EmptyState title="暂无 Provider" description="尚未配置任何 Provider。" />
          ) : (
            <div className="py-1.5">
              {attentionProviders.map((provider) => {
                const badge = providerHealthBadge(provider);
                const isOpen = provider.health.circuitState === "open";
                return (
                  <Row
                    key={provider.id}
                    icon={isOpen ? <ZapOff /> : <RouteOff />}
                    iconClass={isOpen ? "bg-red-soft text-red" : "bg-amber-soft text-amber"}
                    title={provider.name}
                    subtitle={
                      provider.health.lastError
                        ? `${provider.health.lastError} · 连续失败 ${provider.health.consecutiveFailures}`
                        : `circuit ${provider.health.circuitState} · 连续失败 ${provider.health.consecutiveFailures}`
                    }
                    trailing={<Badge variant={badge.variant}>{badge.label}</Badge>}
                  />
                );
              })}
              {healthyProviders.length > 0 && (
                <Row
                  icon={<Check />}
                  iconClass="bg-green-soft text-green"
                  title={`${healthyProviders.length} 个 Provider 正常`}
                  subtitle={healthyProviders.map((p) => p.name).join(" · ")}
                  trailing={<Badge variant="ok">在线</Badge>}
                />
              )}
            </div>
          )}
        </Panel>

        {/* App connections — click navigates to apps sub-view */}
        <Panel>
          <PanelHead
            title="客户端接入"
            sub="App Connection"
            action={
              <Button variant="ghost" size="sm" onClick={() => goToView("apps")}>
                管理
              </Button>
            }
          />
          {appConnections.length === 0 ? (
            <EmptyState title="暂无客户端" description="尚无可接入的本地客户端。" />
          ) : (
            <div className="py-1.5">
              {appConnections.map((connection) => {
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
                        {connection.configured ? "已应用" : connection.issues[0] ?? "未应用"}
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
      <RuntimeDiagnosticsPanel />
      <DaemonServicePanel
        onMutated={() => {
          void statusQuery.refetch();
        }}
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
