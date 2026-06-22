import * as React from "react";
import { Activity, Bot, KeyRound, Plus, Settings2, Users } from "lucide-react";

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
import { LoadingState } from "@/shared/states/LoadingState";
import { toast } from "@/design/ui/sonner";

import {
  useModelGatewayProvidersQuery,
  useSmokeModelGatewayActiveRouteMutation,
  useStartCodexAccountLoginMutation,
} from "@/lib/query/model-gateway";
import {
  MODEL_GATEWAY_API_FORMATS,
  type ModelGatewayApiFormat,
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

export function ProvidersView({ goToView }: ModelGatewayViewProps) {
  const providersQuery = useModelGatewayProvidersQuery();
  const smokeMutation = useSmokeModelGatewayActiveRouteMutation();
  const codexLoginMutation = useStartCodexAccountLoginMutation();

  const [smokingId, setSmokingId] = React.useState<string | null>(null);

  const handleSmoke = (provider: ModelGatewayProviderView) => {
    setSmokingId(provider.id);
    smokeMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(`连通正常 · ${result.latencyMs}ms`, {
            description: result.responsePreview ?? undefined,
          });
        } else {
          toast.error("连通失败", {
            description: result.error?.message ?? "未知错误",
          });
        }
      },
      onError: (error) => toast.error("连通检查失败", { description: error.message }),
      onSettled: () => setSmokingId(null),
    });
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
    return <LoadingState title="加载 Provider…" />;
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

  return (
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
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => goToView("providercfg", { provider: provider.id })}
                      >
                        <Settings2 />
                        配置
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSmoke(provider)}
                        disabled={smokeMutation.isPending && smokingId === provider.id}
                      >
                        <Activity />
                        {smokeMutation.isPending && smokingId === provider.id
                          ? "检查中…"
                          : "连通检查"}
                      </Button>
                      {isAccountProvider && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => goToView("accounts", { provider: provider.id })}
                        >
                          <Users />
                          账号池
                        </Button>
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
  );
}
