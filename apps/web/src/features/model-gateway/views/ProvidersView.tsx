import * as React from "react";
import { Activity, Bot, Check, Copy, ExternalLink, FlaskConical, KeyRound, Loader2, Plus, Settings2, Users } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/design/ui/tooltip";
import { toast } from "@/design/ui/sonner";

import {
  useModelGatewayProvidersQuery,
  usePollCodexAccountLoginMutation,
  useSmokeModelGatewayActiveRouteMutation,
  useStartCodexAccountLoginMutation,
  useTestModelGatewayProviderMutation,
} from "@/lib/query/model-gateway";
import {
  MODEL_GATEWAY_API_FORMATS,
  type ModelGatewayApiFormat,
  type ModelGatewayActiveRouteStatus,
  type ModelGatewayCodexAccountLoginStartResponse,
  type ModelGatewayProviderSourceType,
  type ModelGatewayProviderView,
} from "../types";
import type { ModelGatewayViewProps } from "./types";

const API_FORMAT_LABEL: Record<ModelGatewayApiFormat, string> = {
  openai_chat: "openai",
  openai_responses: "responses",
  anthropic_messages: "messages",
  gemini_native: "gemini",
};

const SOURCE_TYPE_LABEL: Record<ModelGatewayProviderSourceType, string> = {
  "api-key": "API Key",
  "account-backed": "账号制",
  "external-relay": "中继",
};

/** Status pill built only from live provider health + enabled state. */
function healthIsDegraded(health: ModelGatewayProviderView["health"]): boolean {
  return Boolean(
    health.circuitState !== "closed"
    || health.retryAfterUntil
    || health.consecutiveFailures > 0
    || health.lastError,
  );
}

function endpointProfileRisk(provider: ModelGatewayProviderView): {
  enabled: number;
  open: number;
  degraded: number;
} {
  const profiles = provider.endpointProfiles?.filter((profile) => profile.enabled) ?? [];
  return {
    enabled: profiles.length,
    open: profiles.filter((profile) => profile.health.circuitState === "open").length,
    degraded: profiles.filter((profile) => healthIsDegraded(profile.health)).length,
  };
}

function accountProviderRisk(provider: ModelGatewayProviderView): {
  total: number;
  ready: number;
  needsLogin: number;
} {
  const accounts = provider.accountProvider?.accounts ?? [];
  return {
    total: accounts.length,
    ready: accounts.filter((account) => account.enabled && account.state === "ready").length,
    needsLogin: accounts.filter((account) => account.state === "needs-login").length,
  };
}

function providerStatus(provider: ModelGatewayProviderView): {
  variant: "ok" | "warn" | "bad" | "mute";
  label: string;
} {
  if (!provider.enabled) return { variant: "mute", label: "停用" };
  const accountRisk = accountProviderRisk(provider);
  if (accountRisk.total > 0 && accountRisk.ready === 0) {
    return { variant: "bad", label: accountRisk.needsLogin > 0 ? "需重登" : "账号不可用" };
  }
  if (provider.health.circuitState === "open") return { variant: "bad", label: "熔断" };
  const endpointRisk = endpointProfileRisk(provider);
  if (endpointRisk.open > 0) return { variant: "bad", label: "部分熔断" };
  if (provider.health.circuitState === "half-open") return { variant: "warn", label: "观察" };
  if (endpointRisk.degraded > 0 || healthIsDegraded(provider.health)) {
    return { variant: "warn", label: "部分异常" };
  }
  return { variant: "ok", label: "在线" };
}

function providerStatusDetail(provider: ModelGatewayProviderView): string {
  const accountRisk = accountProviderRisk(provider);
  if (accountRisk.total > 0) {
    return `账号 ${accountRisk.ready}/${accountRisk.total} 可用${accountRisk.needsLogin ? ` · ${accountRisk.needsLogin} 需重登` : ""}`;
  }
  const endpointRisk = endpointProfileRisk(provider);
  if (endpointRisk.enabled === 0) {
    return `provider circuit ${provider.health.circuitState}`;
  }
  return `${endpointRisk.enabled} endpoint · ${endpointRisk.open} 熔断 · ${endpointRisk.degraded} 异常`;
}

/** Short identity sub-line: model count / default + endpoint count. No raw dumps. */
function providerIdentitySub(provider: ModelGatewayProviderView): string {
  const parts: string[] = [];
  const models = provider.models?.models ?? [];
  if (provider.models?.defaultModel) {
    parts.push(provider.models.defaultModel);
  } else if (models.length > 0) {
    parts.push(models[0].id);
  }
  if (models.length > 1) parts.push(`${models.length} 模型`);
  const endpointCount = provider.endpointProfiles?.length ?? 0;
  if (endpointCount > 0) parts.push(`${endpointCount} endpoint`);
  if (provider.accountProvider) {
    parts.push(`账号 ×${provider.accountProvider.accounts.length}`);
  }
  return parts.join(" · ") || "未配置模型";
}

/**
 * Media/vision/image/audio capability labels derived from the provider's own
 * declared model features (real catalog data). The provider-test response does
 * NOT carry capability flags, so this is the truthful source for them.
 */
function providerCapabilityLabels(provider: ModelGatewayProviderView): string[] {
  const models = provider.models?.models ?? [];
  const any = (pick: (f: NonNullable<(typeof models)[number]["features"]>) => boolean | undefined) =>
    models.some((m) => (m.features ? pick(m.features) : false));
  const labels: string[] = [];
  if (any((f) => f.vision)) labels.push("视觉");
  if (any((f) => f.imageGeneration)) labels.push("图像");
  if (any((f) => f.audioInput || f.audioOutput)) labels.push("音频");
  return labels;
}

function activeRoutesForProvider(
  provider: ModelGatewayProviderView,
  activeRoutes: ModelGatewayActiveRouteStatus[],
): ModelGatewayActiveRouteStatus[] {
  return activeRoutes
    .filter((route) => (
      route.resolvedProviderId === provider.id
      || (route.selectedProviderId === provider.id && !route.resolvedProviderId)
    ));
}

function ProviderTypeBadge({ provider }: { provider: ModelGatewayProviderView }) {
  const format = (MODEL_GATEWAY_API_FORMATS as readonly string[]).includes(provider.apiFormat)
    ? API_FORMAT_LABEL[provider.apiFormat]
    : provider.apiFormat;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline">{format}</Badge>
      <Badge variant="mute">{SOURCE_TYPE_LABEL[provider.sourceType] ?? provider.sourceType}</Badge>
    </span>
  );
}

/** Icon-only row action with an accessible tooltip + label. */
function IconAction({
  icon,
  label,
  onClick,
  disabled,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          {busy ? <Loader2 className="animate-spin" /> : icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{busy ? "进行中…" : label}</TooltipContent>
    </Tooltip>
  );
}

export function ProvidersView({ goToView }: ModelGatewayViewProps) {
  const providersQuery = useModelGatewayProvidersQuery();
  const smokeMutation = useSmokeModelGatewayActiveRouteMutation();
  const testMutation = useTestModelGatewayProviderMutation();
  const codexLoginMutation = useStartCodexAccountLoginMutation();
  const codexPollMutation = usePollCodexAccountLoginMutation();

  const [smokingKey, setSmokingKey] = React.useState<string | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [codexLogin, setCodexLogin] = React.useState<ModelGatewayCodexAccountLoginStartResponse | null>(null);
  const [codexLoginDialogOpen, setCodexLoginDialogOpen] = React.useState(false);
  const [codexLoginStatus, setCodexLoginStatus] = React.useState<"pending" | "completed" | "expired" | "failed">("pending");
  const [codexLoginMessage, setCodexLoginMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!codexLoginDialogOpen || !codexLogin || codexLoginStatus !== "pending") return;
    if (codexPollMutation.isPending) return;
    const intervalMs = Math.max(1, codexLogin.pollIntervalSeconds || 3) * 1000;
    const timer = window.setTimeout(() => {
      codexPollMutation.mutate(
        { loginId: codexLogin.loginId },
        {
          onSuccess: (result) => {
            setCodexLoginStatus(result.status);
            setCodexLoginMessage(result.message);
            if (result.status === "completed") {
              toast.success("Codex 账户已添加", {
                description: result.provider
                  ? `${result.provider.name} · ${result.provider.accountProvider?.accounts.length ?? 0} 个账号`
                  : result.message ?? undefined,
              });
              setCodexLoginDialogOpen(false);
              setCodexLogin(null);
              void providersQuery.refetch();
              goToView("accounts", result.provider ? { provider: result.provider.id } : undefined);
            } else if (result.status === "expired" || result.status === "failed") {
              toast.error("Codex 登录未完成", { description: result.message ?? "请重新发起登录" });
            }
          },
          onError: (error) => {
            setCodexLoginStatus("failed");
            setCodexLoginMessage(error.message);
            toast.error("Codex 登录轮询失败", { description: error.message });
          },
        },
      );
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [codexLogin, codexLoginDialogOpen, codexLoginStatus, codexPollMutation, codexPollMutation.isPending, goToView, providersQuery]);

  const handleActiveRouteSmoke = (provider: ModelGatewayProviderView, route: ModelGatewayActiveRouteStatus) => {
    const { scope } = route;
    const key = `${provider.id}:${scope}`;
    setSmokingKey(key);
    smokeMutation.mutate({ scope, model: route.resolvedModel ?? undefined }, {
      onSuccess: (result) => {
        const expectedModel = route.resolvedModel ?? undefined;
        const actualModel = result.route.model?.resolved ?? result.route.model?.requested ?? undefined;
        if (result.ok) {
          toast.success(`${scope} 活跃路由正常 · ${result.latencyMs}ms`, {
            description:
              [
                result.providerId !== provider.id ? `实际 Provider：${result.providerId}` : undefined,
                expectedModel ? `选定模型：${expectedModel}` : undefined,
                actualModel && expectedModel && actualModel !== expectedModel ? `实际模型：${actualModel}` : undefined,
                result.route.failoverReason ?? route.warning ?? undefined,
                result.responsePreview ?? undefined,
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
          });
        } else {
          toast.error(`${scope} 活跃路由失败`, {
            description: result.error?.message ?? "未知错误",
          });
        }
      },
      onError: (error) => toast.error(`${scope} 活跃路由检查失败`, { description: error.message }),
      onSettled: () => setSmokingKey(null),
    });
  };

  const handleTest = (provider: ModelGatewayProviderView) => {
    setTestingId(provider.id);
    // Provider-targeted protocol smoke (distinct from the active-route 连通检查).
    testMutation.mutate(
      { providerId: provider.id, payload: { kind: "protocol" } },
      {
        onSuccess: (result) => {
          // The test response carries pass/fail + latency + route; media/vision
          // capability flags are NOT on this response, so we surface the
          // provider's declared model features (real catalog data) instead.
          const caps = providerCapabilityLabels(provider);
          const capLine = caps.length > 0 ? `能力：${caps.join(" / ")}` : undefined;
          if (result.ok) {
            toast.success(`Smoke 通过 · ${result.latencyMs}ms`, {
              description:
                [result.route.model?.resolved ?? undefined, capLine, result.responsePreview ?? undefined]
                  .filter(Boolean)
                  .join(" · ") || undefined,
            });
          } else {
            toast.error("Smoke 失败", {
              description: [result.error?.message ?? "未知错误", capLine].filter(Boolean).join(" · "),
            });
          }
        },
        onError: (error) => toast.error("Smoke 测试失败", { description: error.message }),
        onSettled: () => setTestingId(null),
      },
    );
  };

  const handleCodexLogin = () => {
    codexLoginMutation.mutate(undefined, {
      onSuccess: (result) => {
        setCodexLogin(result);
        setCodexLoginStatus("pending");
        setCodexLoginMessage("请在浏览器完成授权；Tracevane 会自动轮询并创建 Provider。");
        setCodexLoginDialogOpen(true);
      },
      onError: (error) => toast.error("无法发起 Codex 登录", { description: error.message }),
    });
  };

  const copyCodexUserCode = async () => {
    if (!codexLogin) return;
    try {
      await navigator.clipboard.writeText(codexLogin.userCode);
      toast.success("已复制 Codex 登录码");
    } catch {
      toast.error("复制失败", { description: codexLogin.userCode });
    }
  };

  const pollCodexLoginNow = () => {
    if (!codexLogin || codexPollMutation.isPending) return;
    codexPollMutation.mutate(
      { loginId: codexLogin.loginId },
      {
        onSuccess: (result) => {
          setCodexLoginStatus(result.status);
          setCodexLoginMessage(result.message);
          if (result.status === "completed") {
            toast.success("Codex 账户已添加", { description: result.provider?.name ?? result.message ?? undefined });
            setCodexLoginDialogOpen(false);
            setCodexLogin(null);
            void providersQuery.refetch();
            goToView("accounts", result.provider ? { provider: result.provider.id } : undefined);
          }
        },
        onError: (error) => {
          setCodexLoginStatus("failed");
          setCodexLoginMessage(error.message);
        },
      },
    );
  };

  if (providersQuery.isLoading) {
    return (
      <div className="grid gap-4" role="status" aria-busy="true">
        <div className="grid gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="rounded-md border border-line bg-panel">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (providersQuery.error) {
    return (
      <ErrorState
        title="无法加载 Provider 列表"
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
  const activeRoutes = providersQuery.data?.activeRoutes ?? [];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-4">
      {/* Page head + the two SEPARATE create entry points (IA contract). */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-strong">Provider</h2>
          <p className="text-sm text-muted">
            列表优先：身份 / 类型 / 状态与常用动作。深度配置进子页面，删除在配置页危险区。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => goToView("providercfg", { create: true })}
          >
            <KeyRound />
            API Provider 新建
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCodexLogin}
            disabled={codexLoginMutation.isPending}
          >
            <Bot />
            {codexLoginMutation.isPending ? "发起中…" : "Codex 账户登录"}
          </Button>
        </div>
      </div>

      {providers.length === 0 ? (
        <EmptyState
          title="尚无 Provider"
          description="使用上方入口新建 API Provider，或登录一个 Codex 账户。"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider / 模型</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => {
              const status = providerStatus(provider);
              const isAccountProvider = Boolean(provider.accountProvider);
              const providerActiveRoutes = activeRoutesForProvider(provider, activeRoutes);
              return (
                <TableRow key={provider.id}>
                  <TableCell>
                    <div className="grid min-w-0 gap-0.5">
                      <strong className="truncate text-base text-ink-strong">
                        {provider.name}
                      </strong>
                      <span className="truncate text-sm text-muted">
                        {providerIdentitySub(provider)}
                      </span>
                      {providerActiveRoutes.length > 0 && (
                        <span className="flex flex-wrap gap-1 pt-1">
                          {providerActiveRoutes.map((route) => (
                            <Badge
                              key={route.scope}
                              variant={route.state === "fallback" ? "warn" : "outline"}
                              title={[
                                route.message,
                                route.resolvedModel ? `model=${route.resolvedModel}` : null,
                              ].filter(Boolean).join(" · ")}
                            >
                              {route.scope}
                              {route.resolvedModel ? ` · ${route.resolvedModel}` : ""}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Mobile keeps a label so the cell is never placeholder-only. */}
                    <span className="mr-1.5 text-xs text-subtle sm:hidden">类型</span>
                    <ProviderTypeBadge provider={provider} />
                  </TableCell>
                  <TableCell>
                    <span className="mr-1.5 text-xs text-subtle sm:hidden">状态</span>
                    <div className="grid gap-1">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className="text-xs text-muted">{providerStatusDetail(provider)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <IconAction
                        icon={<Settings2 />}
                        label="配置"
                        onClick={() => goToView("providercfg", { provider: provider.id })}
                      />
                      {providerActiveRoutes.length === 0 ? (
                        <IconAction
                          icon={<Activity />}
                          label="未被当前路由使用"
                          onClick={() => undefined}
                          disabled
                        />
                      ) : (
                        providerActiveRoutes.map((route) => {
                          const scope = route.scope;
                          const activeSmokeKey = `${provider.id}:${scope}`;
                          return (
                            <Button
                              key={scope}
                              variant="ghost"
                              size="sm"
                              onClick={() => handleActiveRouteSmoke(provider, route)}
                              disabled={smokeMutation.isPending && smokingKey === activeSmokeKey}
                              title={`检查 ${scope} 活跃路由${route.resolvedModel ? ` · ${route.resolvedModel}` : ""}`}
                              aria-label={`检查 ${scope} 活跃路由${route.resolvedModel ? ` · ${route.resolvedModel}` : ""}`}
                            >
                              {smokeMutation.isPending && smokingKey === activeSmokeKey ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Activity className="size-3.5" />
                              )}
                              {scope}
                            </Button>
                          );
                        })
                      )}
                      <IconAction
                        icon={<FlaskConical />}
                        label="测试 / smoke"
                        onClick={() => handleTest(provider)}
                        disabled={testMutation.isPending && testingId === provider.id}
                        busy={testMutation.isPending && testingId === provider.id}
                      />
                      {isAccountProvider && (
                        <IconAction
                          icon={<Users />}
                          label="账号池"
                          onClick={() => goToView("accounts", { provider: provider.id })}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <p className="text-xs text-subtle">
        <Plus className="mr-1 inline size-3" />
        删除 Provider 在「配置 → 危险操作」中执行，需确认。
      </p>

      <Dialog open={codexLoginDialogOpen} onOpenChange={setCodexLoginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
              <Bot />
            </span>
            <DialogTitle>Codex 账户登录</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {codexLogin ? (
              <div className="grid gap-4">
                <p className="text-sm text-muted">
                  Tracevane 已创建 Codex 设备登录会话。请打开官方授权页输入验证码；授权完成后这里会自动创建账号制 Provider。
                </p>
                <div className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3">
                  <span className="text-xs text-subtle">验证码</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-sm bg-panel-3 px-3 py-2 font-mono text-lg font-semibold text-ink-strong">
                      {codexLogin.userCode}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => void copyCodexUserCode()}>
                      <Copy />
                      复制
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3">
                  <span className="text-xs text-subtle">授权页</span>
                  <a
                    href={codexLogin.verificationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    {codexLogin.verificationUrl}
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={codexLoginStatus === "completed" ? "ok" : codexLoginStatus === "pending" ? "warn" : "bad"}>
                    {codexLoginStatus === "pending" ? "等待授权" : codexLoginStatus === "completed" ? "已完成" : codexLoginStatus === "expired" ? "已过期" : "失败"}
                  </Badge>
                  <span className="text-sm text-muted">{codexLoginMessage ?? "正在等待授权结果…"}</span>
                </div>
                <p className="text-xs text-subtle">
                  到期时间：{new Date(codexLogin.expiresAt).toLocaleString()} · 轮询间隔 {codexLogin.pollIntervalSeconds}s
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">尚未创建登录会话。</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCodexLoginDialogOpen(false)}>
              稍后处理
            </Button>
            {codexLogin && (
              <Button
                variant="outline"
                size="sm"
                onClick={pollCodexLoginNow}
                disabled={codexPollMutation.isPending || codexLoginStatus !== "pending"}
              >
                {codexPollMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                我已完成授权，立即检查
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}
