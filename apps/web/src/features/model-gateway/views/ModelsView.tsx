import * as React from "react";
import {
  Box,
  Brain,
  Check,
  Layers3,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { PageHeader } from "@/design/ui/page-header";
import { cn } from "@/design/lib/utils";
import { Input } from "@/design/ui/input";
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
  useModelGatewayProvidersQuery,
  useUpdateModelGatewayProviderMutation,
} from "@/lib/query/model-gateway";
import type {
  ModelGatewayModelFeatures,
  ModelGatewayProviderModel,
  ModelGatewayProviderView,
} from "../types";
import type { ModelGatewayViewProps } from "./types";
import { formatModelTokenBudget } from "../budget-format";
import {
  GatewayMark,
  GatewayMetricCard,
  GatewayStatusDot,
  ModelLogo,
  providerIdentityFromText,
  type GatewayComparison,
} from "./GatewayUi";

/** A model entry flattened with its owning provider so writes target the right PUT. */
interface AggregatedModel {
  key: string;
  providerId: string;
  providerName: string;
  model: ModelGatewayProviderModel;
  isDefault: boolean;
}

const FEATURE_LABEL: Partial<Record<keyof ModelGatewayModelFeatures, string>> = {
  reasoning: "reasoning",
  vision: "vision",
  tools: "tools",
  streaming: "streaming",
  responses: "responses",
  imageGeneration: "image",
};

const LIVE_COMPARISON: GatewayComparison = {
  label: "实时",
  tone: "primary",
  direction: "flat",
};

function featureBadges(features?: ModelGatewayModelFeatures): string[] {
  if (!features) return [];
  return (Object.keys(FEATURE_LABEL) as Array<keyof ModelGatewayModelFeatures>)
    .filter((k) => features[k])
    .map((k) => FEATURE_LABEL[k] as string);
}

function aggregateModels(providers: ModelGatewayProviderView[]): AggregatedModel[] {
  const rows: AggregatedModel[] = [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    const catalog = provider.models;
    if (!catalog) continue;
    for (const model of catalog.models ?? []) {
      rows.push({
        key: `${provider.id}::${model.id}`,
        providerId: provider.id,
        providerName: provider.name,
        model,
        isDefault: catalog.defaultModel === model.id,
      });
    }
  }
  return rows;
}

/**
 * Build the `provider` upsert payload that mutates a single model's catalog,
 * preserving every other model untouched. Used by both alias edit and
 * set-default so writes never drop sibling catalog entries.
 */
function buildCatalogUpdate(
  provider: ModelGatewayProviderView,
  modelId: string,
  patch: { alias?: string; setDefault?: boolean },
) {
  const catalog = provider.models;
  const models = (catalog?.models ?? []).map((m) => {
    if (m.id !== modelId) return m;
    if (patch.alias === undefined) return m;
    const aliases = patch.alias.trim() ? [patch.alias.trim()] : [];
    return { ...m, aliases };
  });

  // Recompute the alias map from per-model aliases so it stays consistent.
  const aliases: Record<string, string> = {};
  for (const m of models) {
    for (const a of m.aliases ?? []) aliases[a] = m.id;
  }

  return {
    provider: {
      id: provider.id,
      models: {
        defaultModel: patch.setDefault ? modelId : (catalog?.defaultModel ?? null),
        models,
        aliases,
      },
    },
  };
}

export function ModelsView({ goToView }: ModelGatewayViewProps) {
  const providersQuery = useModelGatewayProvidersQuery();
  const updateMutation = useUpdateModelGatewayProviderMutation();

  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = React.useState("");
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const providers = providersQuery.data?.providers ?? [];
  const allRows = React.useMemo(() => aggregateModels(providers), [providers]);
  const q = search.trim().toLowerCase();
  const rows = React.useMemo(() => {
    const filtered = !q ? allRows : allRows.filter(
      (r) =>
        r.model.id.toLowerCase().includes(q) ||
        (r.model.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
        r.providerName.toLowerCase().includes(q),
    );
    return [...filtered].sort((left, right) => (
      left.providerName.localeCompare(right.providerName)
      || Number(right.isDefault) - Number(left.isDefault)
      || left.model.id.localeCompare(right.model.id)
    ));
  }, [allRows, q]);
  const enabledProviderCount = providers.filter((provider) => provider.enabled).length;
  const defaultModelCount = allRows.filter((row) => row.isDefault).length;
  const capabilityRows = allRows.filter((row) => featureBadges(row.model.features).length > 0).length;
  const maxContextWindow = allRows.reduce<number | null>((max, row) => (
    row.model.contextWindow == null ? max : Math.max(max ?? 0, row.model.contextWindow)
  ), null);

  const findProvider = (providerId: string) =>
    providers.find((p) => p.id === providerId) ?? null;

  const beginEdit = (row: AggregatedModel) => {
    setEditingKey(row.key);
    setAliasDraft(row.model.aliases?.[0] ?? "");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setAliasDraft("");
  };

  const saveAlias = (row: AggregatedModel) => {
    const provider = findProvider(row.providerId);
    if (!provider) return;
    setPendingKey(row.key);
    updateMutation.mutate(
      {
        providerId: provider.id,
        payload: buildCatalogUpdate(provider, row.model.id, { alias: aliasDraft }),
      },
      {
        onSuccess: () => {
          toast.success("alias 已保存");
          cancelEdit();
        },
        onError: (error) => toast.error("保存 alias 失败", { description: error.message }),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  const setDefault = (row: AggregatedModel) => {
    const provider = findProvider(row.providerId);
    if (!provider) return;
    setPendingKey(row.key);
    updateMutation.mutate(
      {
        providerId: provider.id,
        payload: buildCatalogUpdate(provider, row.model.id, { setDefault: true }),
      },
      {
        onSuccess: () => toast.success(`已将 ${row.model.id} 设为 ${row.providerName} 默认模型`),
        onError: (error) => toast.error("设置默认失败", { description: error.message }),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  if (providersQuery.isLoading) {
    return (
      <div className="grid gap-4" role="status" aria-busy="true">
        <div className="grid gap-2">
          <Skeleton className="h-6 w-24" />
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
        title="无法加载模型目录"
        description={providersQuery.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void providersQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        className="px-0"
        title="模型目录"
        description="已启用 Provider 暴露的模型、alias、上下文预算和能力声明。这里维护的是路由目录，不做虚构模型能力。"
        meta={
          <>
            <Badge variant="ok">{enabledProviderCount} 个 Provider 启用</Badge>
            <Badge variant="outline">{defaultModelCount} 个默认模型</Badge>
          </>
        }
        actions={
          allRows.length > 0 ? (
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索模型 id / alias / Provider"
                className="pl-8 sm:w-72"
                aria-label="搜索模型"
              />
            </div>
          ) : undefined
        }
      />

      <section className="rounded-md border border-line bg-panel shadow-sm">
        <div className="grid grid-cols-1 gap-3 p-4 min-[620px]:grid-cols-2 xl:grid-cols-4">
          <GatewayMetricCard
            icon={<Box />}
            tone="primary"
            label="模型总数"
            value={`${allRows.length}`}
            sub={q ? `当前匹配 ${rows.length} 个` : "已启用 Provider 的模型目录"}
            accent={q ? "filtered" : "all"}
            meter={allRows.length > 0 ? 1 : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<Layers3 />}
            tone="teal"
            label="Provider 覆盖"
            value={`${enabledProviderCount}`}
            sub={`${providers.length} 个 Provider，${enabledProviderCount} 个启用`}
            accent="providers"
            meter={providers.length > 0 ? enabledProviderCount / providers.length : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<Sparkles />}
            tone="violet"
            label="默认模型"
            value={`${defaultModelCount}`}
            sub="每个 Provider 的默认路由候选"
            accent="default"
            meter={enabledProviderCount > 0 ? defaultModelCount / enabledProviderCount : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<Brain />}
            tone="primary"
            label="能力声明"
            value={`${capabilityRows}`}
            sub={`最大上下文 ${formatModelTokenBudget(maxContextWindow) ?? "未声明"}`}
            accent="features"
            meter={allRows.length > 0 ? capabilityRows / allRows.length : 0}
            comparison={LIVE_COMPARISON}
          />
        </div>
      </section>

      {allRows.length === 0 ? (
        <EmptyState
          title="尚无模型"
          description="启用的 Provider 还没有配置任何模型，前往 Provider 配置补充模型目录。"
          action={
            <Button variant="outline" size="sm" onClick={() => goToView("providers")}>
              前往 Provider 配置
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="没有匹配的模型"
          description={`没有匹配「${search}」的模型，试试其它关键词。`}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型 / alias</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>上下文 / 输出</TableHead>
              <TableHead>能力</TableHead>
              <TableHead className="text-right">默认</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const editing = editingKey === row.key;
              const busy = pendingKey === row.key && updateMutation.isPending;
              const features = featureBadges(row.model.features);
              const contextBudget = formatModelTokenBudget(row.model.contextWindow);
              const outputBudget = formatModelTokenBudget(row.model.maxOutputTokens);
              return (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className="flex min-w-0 items-start gap-2.5">
                      <ModelLogo model={row.model.id} size="md" />
                      <div className="grid min-w-0 gap-1">
                        <strong className="truncate text-base text-ink-strong">
                          {row.model.label || row.model.id}
                        </strong>
                        {editing ? (
                          <div className={cn("flex items-center gap-1.5", busy && "opacity-60")}>
                            <Input
                              autoFocus
                              value={aliasDraft}
                              onChange={(e) => setAliasDraft(e.target.value)}
                              placeholder="alias（留空清除）"
                              className="h-7 w-40"
                              disabled={busy}
                              onKeyDown={(e) => {
                                if (busy) return;
                                if (e.key === "Enter") saveAlias(row);
                                if (e.key === "Escape") cancelEdit();
                              }}
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveAlias(row)}
                              disabled={busy}
                            >
                              {busy ? <Loader2 className="animate-spin" /> : <Check />}
                              保存
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEdit}
                              disabled={busy}
                              aria-label="取消编辑"
                              title="取消编辑"
                            >
                              <X />
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => beginEdit(row)}
                            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted outline-none hover:text-ink focus-visible:shadow-[var(--ring)] [&_svg]:size-3"
                          >
                            <span>
                              alias {row.model.aliases?.[0] ?? "—"}
                            </span>
                            <Pencil />
                          </button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="mr-1.5 text-xs text-subtle sm:hidden">Provider</span>
                    <span className="inline-grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                      <GatewayMark
                        identity={providerIdentityFromText(row.providerName)}
                        size="sm"
                      />
                      <span className="truncate text-sm text-muted">{row.providerName}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="mr-1.5 text-xs text-subtle sm:hidden">上下文 / 输出</span>
                    {contextBudget || outputBudget ? (
                      <span className="flex flex-wrap gap-1">
                        {contextBudget && <Badge variant="info">ctx {contextBudget}</Badge>}
                        {outputBudget && <Badge variant="mute">out {outputBudget}</Badge>}
                      </span>
                    ) : (
                      <span className="text-sm text-subtle">未声明</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="mr-1.5 text-xs text-subtle sm:hidden">能力</span>
                    {features.length === 0 ? (
                      <span className="text-sm text-subtle">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {features.map((f) => (
                          <Badge key={f} variant="info">
                            {f}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {row.isDefault ? (
                        <span className="inline-flex items-center gap-1.5">
                          <GatewayStatusDot tone="ok" />
                          <Badge variant="ok">默认</Badge>
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefault(row)}
                          disabled={busy}
                        >
                          设为默认
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
    </div>
  );
}
