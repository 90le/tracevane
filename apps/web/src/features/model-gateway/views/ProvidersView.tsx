import * as React from "react";
import { Activity, Bot, FlaskConical, KeyRound, Loader2, Plus, Settings2, Users } from "lucide-react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/design/ui/tooltip";
import { toast } from "@/design/ui/sonner";

import {
  useModelGatewayProvidersQuery,
  useSmokeModelGatewayActiveRouteMutation,
  useStartCodexAccountLoginMutation,
  useTestModelGatewayProviderMutation,
} from "@/lib/query/model-gateway";
import {
  MODEL_GATEWAY_API_FORMATS,
  type ModelGatewayApiFormat,
  type ModelGatewayAppScope,
  type ModelGatewayActiveRouteStatus,
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
function providerStatus(provider: ModelGatewayProviderView): {
  variant: "ok" | "warn" | "bad" | "mute";
  label: string;
} {
  if (!provider.enabled) return { variant: "mute", label: "停用" };
  if (provider.health.circuitState === "open") return { variant: "bad", label: "熔断" };
  if (provider.health.circuitState === "half-open") return { variant: "warn", label: "观察" };
  return { variant: "ok", label: "在线" };
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

function activeRouteScopesForProvider(
  provider: ModelGatewayProviderView,
  activeRoutes: ModelGatewayActiveRouteStatus[],
): ModelGatewayAppScope[] {
  return activeRoutes
    .filter((route) => route.resolvedProviderId === provider.id)
    .map((route) => route.scope);
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

  const [smokingKey, setSmokingKey] = React.useState<string | null>(null);
  const [testingId, setTestingId] = React.useState<string | null>(null);

  const handleActiveRouteSmoke = (provider: ModelGatewayProviderView, scope: ModelGatewayAppScope) => {
    const key = `${provider.id}:${scope}`;
    setSmokingKey(key);
    smokeMutation.mutate({ scope }, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(`${scope} 活跃路由正常 · ${result.latencyMs}ms`, {
            description:
              [
                result.providerId !== provider.id ? `实际 Provider：${result.providerId}` : undefined,
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
    // Codex login is a dedicated flow that lands in the account pool view.
    codexLoginMutation.mutate(undefined, {
      onSuccess: (result) => {
        toast("Codex 设备登录", {
          description: `打开 ${result.verificationUrl} 并输入 ${result.userCode}`,
        });
        goToView("accounts");
      },
      onError: (error) => toast.error("无法发起 Codex 登录", { description: error.message }),
    });
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
              const activeScopes = activeRouteScopesForProvider(provider, activeRoutes);
              const activeSmokeScope = activeScopes[0] ?? null;
              const activeSmokeKey = activeSmokeScope ? `${provider.id}:${activeSmokeScope}` : null;
              const activeSmokeLabel = activeSmokeScope
                ? `检查 ${activeSmokeScope} 活跃路由`
                : "未被当前路由使用";
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
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Mobile keeps a label so the cell is never placeholder-only. */}
                    <span className="mr-1.5 text-xs text-subtle sm:hidden">类型</span>
                    <ProviderTypeBadge provider={provider} />
                  </TableCell>
                  <TableCell>
                    <span className="mr-1.5 text-xs text-subtle sm:hidden">状态</span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <IconAction
                        icon={<Settings2 />}
                        label="配置"
                        onClick={() => goToView("providercfg", { provider: provider.id })}
                      />
                      <IconAction
                        icon={<Activity />}
                        label={activeSmokeLabel}
                        onClick={() => {
                          if (activeSmokeScope) handleActiveRouteSmoke(provider, activeSmokeScope);
                        }}
                        disabled={!activeSmokeScope || (smokeMutation.isPending && smokingKey === activeSmokeKey)}
                        busy={smokeMutation.isPending && smokingKey === activeSmokeKey}
                      />
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
      </div>
    </TooltipProvider>
  );
}
