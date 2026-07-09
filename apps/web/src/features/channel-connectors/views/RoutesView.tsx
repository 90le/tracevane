import * as React from "react";
import {
  AlertTriangle,
  Copy,
  Pencil,
  PlugZap,
  Route,
  Trash2,
} from "lucide-react";

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

import {
  useChannelConnectorsConfigQuery,
  useManageChannelConnectorsDaemonServiceMutation,
  useSaveChannelConnectorsConfigMutation,
} from "@/lib/query/channel-connectors";
import { toast } from "@/design/ui/sonner";
import type { ChannelConnectorPlatformBinding } from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { RouteEditor } from "./BindingEditor";

function metaString(
  binding: ChannelConnectorPlatformBinding,
  key: string,
  fallback = "—",
) {
  const value = binding.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function isCopiedRoute(binding: ChannelConnectorPlatformBinding): boolean {
  return /-route-[a-z0-9]+$/i.test(binding.id);
}

export function RoutesView({
  selectedBinding,
  goToView,
}: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsConfigQuery();
  const saveMutation = useSaveChannelConnectorsConfigMutation();
  const applyMutation = useManageChannelConnectorsDaemonServiceMutation();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] =
    React.useState<ChannelConnectorPlatformBinding | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<ChannelConnectorPlatformBinding | null>(null);

  const config = configQuery.data?.config ?? null;
  const bindings = config?.platformBindings ?? [];
  const agentProfiles = config?.agentProfiles ?? [];

  React.useEffect(() => {
    if (!selectedBinding || !bindings.length) return;
    const match = bindings.find((binding) => binding.id === selectedBinding);
    if (match) setEditing(match);
  }, [bindings, selectedBinding]);

  if (configQuery.isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }
  if (configQuery.error) {
    return (
      <ErrorState
        title="无法加载绑定路由"
        description={configQuery.error.message}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void configQuery.refetch()}
          >
            重试
          </Button>
        }
      />
    );
  }

  const enabledCount = bindings.filter((binding) => binding.enabled).length;
  const overrideCount = bindings.filter((binding) =>
    ["routeAgent", "routeModel", "routeWorkDir", "routePermissionMode"].some(
      (key) => Boolean(metaString(binding, key, "")),
    ),
  ).length;
  const wildcardCount = bindings.filter(
    (binding) => metaString(binding, "peerId", "*") === "*",
  ).length;

  const filtered = bindings.filter((binding) => {
    const profile = agentProfiles.find(
      (item) => item.id === binding.agentProfileId,
    );
    const haystack =
      `${binding.displayName} ${binding.id} ${binding.platform} ${binding.agentProfileId} ${binding.accountId} ${metaString(binding, "peerKind", "")} ${metaString(binding, "peerId", "")} ${metaString(binding, "routeAgent", profile?.agent ?? "")} ${metaString(binding, "routeModel", profile?.model ?? "")}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const deleteRoute = () => {
    if (!config || !deleteTarget) return;
    if (!isCopiedRoute(deleteTarget)) {
      toast.warning("默认路由受保护", {
        description: "请复制出新路由后调整，默认路由不允许在路由页删除。",
      });
      setDeleteTarget(null);
      return;
    }
    saveMutation.mutate(
      {
        config: {
          ...config,
          updatedAt: new Date().toISOString(),
          platformBindings: config.platformBindings.filter(
            (item) => item.id !== deleteTarget.id,
          ),
        },
      },
      {
        onSuccess: () => {
          applyMutation.mutate(
            { action: "reload", apply: true, reloadMode: "when-idle" },
            {
              onSuccess: (result) => {
                const reload = result.reload;
                if (reload?.status === "applied") {
                  toast.success("已删除副本路由并应用", { description: deleteTarget.id });
                } else if (reload?.status === "pending") {
                  toast.info("已删除副本路由，等待任务结束后应用", {
                    description: `当前运行中 ${reload.activeRuns + reload.activeTurns} 个任务/turn。`,
                  });
                } else {
                  toast.error("已删除副本路由，但尚未应用到 IM 守护", {
                    description: reload?.error || reload?.restartRequiredReason || deleteTarget.id,
                  });
                }
                setDeleteTarget(null);
                void configQuery.refetch();
              },
              onError: (error) => {
                toast.error("已删除副本路由，但应用失败", { description: error.message });
                setDeleteTarget(null);
                void configQuery.refetch();
              },
            },
          );
        },
        onError: (error) =>
          toast.error("删除路由失败", { description: error.message }),
      },
    );
  };

  const duplicateRoute = (binding: ChannelConnectorPlatformBinding) => {
    if (!config) return;
    const suffix = Date.now().toString(36);
    const nextBinding: ChannelConnectorPlatformBinding = {
      ...binding,
      id: `${binding.id}-route-${suffix}`,
      displayName: `${binding.displayName || binding.id} / 新路由`,
      enabled: false,
      metadata: {
        ...(binding.metadata ?? {}),
        peerId: "*",
      },
    };
    saveMutation.mutate(
      {
        config: {
          ...config,
          updatedAt: new Date().toISOString(),
          platformBindings: [...config.platformBindings, nextBinding],
        },
      },
      {
        onSuccess: async () => {
          toast.success("已复制为停用路由", {
            description:
              "已打开编辑器；请设置来源 ID、Agent、模型、目录和权限后再启用。",
          });
          const refetched = await configQuery.refetch();
          const created = refetched.data?.config.platformBindings.find(
            (item) => item.id === nextBinding.id,
          );
          setEditing(created ?? nextBinding);
        },
        onError: (error) =>
          toast.error("复制路由失败", { description: error.message }),
      },
    );
  };

  return (
    <div className="grid gap-[18px]">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-strong">绑定路由</h2>
          <p className="text-sm text-muted">
            Agent Profile 可被多个渠道复用；绑定路由把平台账号、IM
            来源和可选覆盖策略连接起来。
          </p>
        </div>
        <Input
          className="w-full sm:w-72"
          placeholder="搜索路由 / Agent / 来源"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToView("accounts")}
        >
          <PlugZap />
          新建账号
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-sm border border-line bg-panel-2 p-3">
          <div className="text-xs text-subtle">路由总数</div>
          <div className="text-xl font-semibold text-ink-strong">
            {bindings.length}
          </div>
        </div>
        <div className="rounded-sm border border-line bg-panel-2 p-3">
          <div className="text-xs text-subtle">已启用</div>
          <div className="text-xl font-semibold text-ink-strong">
            {enabledCount}
          </div>
        </div>
        <div className="rounded-sm border border-line bg-panel-2 p-3">
          <div className="text-xs text-subtle">独立覆盖</div>
          <div className="text-xl font-semibold text-ink-strong">
            {overrideCount}
          </div>
        </div>
        <div className="rounded-sm border border-line bg-panel-2 p-3">
          <div className="text-xs text-subtle">通配来源</div>
          <div className="text-xl font-semibold text-ink-strong">
            {wildcardCount}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="暂无绑定路由"
          description="先创建平台账号；一个账号可复制出多条来源路由，同一个 Agent Profile 也可被多个渠道绑定。"
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => goToView("accounts")}
            >
              <PlugZap />
              前往平台账号
            </Button>
          }
        />
      ) : (
        <Table className="min-w-full">
          <TableHeader>
            <TableRow>
              <TableHead>绑定路由</TableHead>
              <TableHead className="hidden md:table-cell">来源</TableHead>
              <TableHead>实际 Agent / 模型</TableHead>
              <TableHead className="hidden lg:table-cell">权限</TableHead>
              <TableHead className="hidden md:table-cell">状态</TableHead>
              <TableHead className="text-right">动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((binding) => {
              const profile = agentProfiles.find(
                (item) => item.id === binding.agentProfileId,
              );
              const peerKind = metaString(binding, "peerKind", "未指定");
              const peerId = metaString(binding, "peerId", "*");
              const routeAgent = metaString(
                binding,
                "routeAgent",
                profile?.agent ?? "unknown",
              );
              const routeModel = metaString(
                binding,
                "routeModel",
                profile?.model ?? "网关默认路由",
              );
              const routeWorkDir = metaString(
                binding,
                "routeWorkDir",
                profile?.workDir ?? "—",
              );
              const hasRouteOverride = [
                "routeAgent",
                "routeModel",
                "routeWorkDir",
                "routePermissionMode",
              ].some((key) => Boolean(metaString(binding, key, "")));
              return (
                <TableRow key={binding.id}>
                  <TableCell className="max-w-[260px]">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="hidden size-8 place-items-center rounded-[9px] bg-panel-3 text-muted sm:grid">
                        <Route className="size-4" />
                      </span>
                      <span className="grid min-w-0">
                        <strong className="truncate text-ink-strong">
                          {binding.displayName || binding.id}
                        </strong>
                        <span className="truncate text-sm text-muted">
                          {binding.platform} · acct {binding.accountId || "—"}
                        </span>
                        <span className="mt-1 block break-all font-mono text-xs text-muted md:hidden">
                          {peerKind} · {peerId}
                        </span>
                        <span className="mt-1 md:hidden">
                          <Badge variant={binding.enabled ? "ok" : "mute"}>
                            {binding.enabled ? "启用" : "停用"}
                          </Badge>
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-[220px] md:table-cell">
                    <span className="block break-all font-mono text-sm text-muted">
                      {peerKind} · {peerId}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="grid min-w-0 max-w-[360px]">
                      <strong className="truncate text-sm text-ink-strong">
                        {routeAgent} · {routeModel}
                      </strong>
                      <span
                        className="truncate text-xs text-muted"
                        title={`${profile?.name ?? binding.agentProfileId} · ${routeWorkDir}`}
                      >
                        {profile?.name ?? binding.agentProfileId} ·{" "}
                        {routeWorkDir}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {hasRouteOverride && (
                          <Badge variant="info" className="w-fit">
                            独立覆盖
                          </Badge>
                        )}
                        <Badge
                          variant={isCopiedRoute(binding) ? "outline" : "warn"}
                          className="w-fit"
                        >
                          {isCopiedRoute(binding)
                            ? "副本路由"
                            : "默认路由·保护"}
                        </Badge>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        {binding.allowlist.length} 允许
                      </Badge>
                      <Badge variant="outline">
                        {binding.adminUsers.length} 管理员
                      </Badge>
                      <Badge variant="outline">
                        {binding.disabledCommands.length} 禁用
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={binding.enabled ? "ok" : "mute"}>
                      {binding.enabled ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateRoute(binding)}
                        disabled={saveMutation.isPending || applyMutation.isPending}
                      >
                        <Copy />
                        复制路由
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(binding)}
                      >
                        <Pencil />
                        编辑路由
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={
                          isCopiedRoute(binding)
                            ? "text-red hover:bg-red-soft"
                            : "text-muted"
                        }
                        onClick={() => setDeleteTarget(binding)}
                        disabled={
                          saveMutation.isPending || applyMutation.isPending || !isCopiedRoute(binding)
                        }
                        title={
                          isCopiedRoute(binding)
                            ? "删除副本路由"
                            : "默认路由受保护，不能删除"
                        }
                      >
                        <Trash2 />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <RouteEditor
        open={editing != null}
        onOpenChange={(open) => !open && setEditing(null)}
        binding={editing}
        config={config}
        agentProfiles={agentProfiles}
        onSaved={() => void configQuery.refetch()}
      />

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red">
              <AlertTriangle className="size-4" />
            </span>
            <DialogTitle>删除副本路由</DialogTitle>
          </DialogHeader>
          <DialogBody>
            删除{" "}
            <strong className="text-ink-strong">
              {deleteTarget?.displayName || deleteTarget?.id}
            </strong>{" "}
            只会移除这条副本路由，不影响同账号的默认路由、平台凭据和历史日志。默认路由在路由页受保护，不能删除。
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={saveMutation.isPending || applyMutation.isPending}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={deleteRoute}
              disabled={
                saveMutation.isPending ||
                applyMutation.isPending ||
                !deleteTarget ||
                !isCopiedRoute(deleteTarget)
              }
            >
              {saveMutation.isPending || applyMutation.isPending ? "删除中…" : "确认删除副本路由"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
