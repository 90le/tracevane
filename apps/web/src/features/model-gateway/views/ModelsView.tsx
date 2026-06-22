import * as React from "react";
import { Box, Check, Pencil, X } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
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
import { LoadingState } from "@/shared/states/LoadingState";
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

  const providers = providersQuery.data?.providers ?? [];
  const rows = React.useMemo(() => aggregateModels(providers), [providers]);

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
    return <LoadingState title="加载模型目录…" />;
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

      {rows.length === 0 ? (
        <EmptyState
          title="尚无模型"
          description="启用的 Provider 还没有配置任何模型，前往 Provider 配置补充模型目录。"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型 / alias</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>能力</TableHead>
              <TableHead className="text-right">默认</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const editing = editingKey === row.key;
              const busy = pendingKey === row.key && updateMutation.isPending;
              const features = featureBadges(row.model.features);
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
                          <div className="flex items-center gap-1.5">
                            <Input
                              autoFocus
                              value={aliasDraft}
                              onChange={(e) => setAliasDraft(e.target.value)}
                              placeholder="alias（留空清除）"
                              className="h-7 w-40"
                              onKeyDown={(e) => {
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
                              <Check />
                              保存
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={busy}>
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
