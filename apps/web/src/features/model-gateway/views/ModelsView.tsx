import * as React from "react";
import { Box, Check, Loader2, Pencil, Search, X } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
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
  void goToView;
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
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        r.model.id.toLowerCase().includes(q) ||
        (r.model.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
        r.providerName.toLowerCase().includes(q),
    );
  }, [allRows, q]);

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
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink-strong">模型</h2>
        <p className="text-sm text-muted">
          已启用 Provider 暴露的模型与 alias。行内编辑 alias、设为该 Provider 默认。
        </p>
      </div>

      {allRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型 id / alias / Provider"
              className="pl-8"
              aria-label="搜索模型"
            />
          </div>
          <span className="text-xs text-subtle">
            {q ? `${rows.length} / ${allRows.length}` : `${allRows.length} 个模型`}
          </span>
        </div>
      )}

      {allRows.length === 0 ? (
        <EmptyState
          title="尚无模型"
          description="启用的 Provider 还没有配置任何模型，前往 Provider 配置补充模型目录。"
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
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-3.5">
                        <Box />
                      </span>
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
                    <span className="text-sm text-muted">{row.providerName}</span>
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
                        <Badge variant="ok">默认</Badge>
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
