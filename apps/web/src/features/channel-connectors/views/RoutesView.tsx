import * as React from "react";
import { Copy, Pencil, PlugZap, Route, ShieldCheck } from "lucide-react";

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
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useChannelConnectorsConfigQuery,
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

export function RoutesView({
  selectedBinding,
  goToView,
}: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsConfigQuery();
  const saveMutation = useSaveChannelConnectorsConfigMutation();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] =
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
        onSuccess: () => {
          toast.success("已复制为停用路由", {
            description: "请在列表中编辑来源 ID、Agent 和权限后再启用。",
          });
          void configQuery.refetch();
        },
        onError: (error) =>
          toast.error("复制路由失败", { description: error.message }),
      },
    );
  };

  return (
    <div className="grid gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-strong">绑定路由</h2>
          <p className="text-sm text-muted">
            每条 IM 来源独立决定
            Agent、模型、启动目录、权限和会话策略；一个平台账号可以复制出多条路由。
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
          description="先创建平台账号；一个账号可复制出多条绑定路由，分别匹配不同群/私聊/目录/Agent。"
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>绑定路由</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>实际 Agent / 模型</TableHead>
              <TableHead>权限</TableHead>
              <TableHead>状态</TableHead>
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
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-[9px] bg-panel-3 text-muted">
                        <Route className="size-4" />
                      </span>
                      <span className="grid min-w-0">
                        <strong className="truncate text-ink-strong">
                          {binding.displayName || binding.id}
                        </strong>
                        <span className="truncate text-sm text-muted">
                          {binding.platform} · acct {binding.accountId || "—"}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm text-muted">
                      {peerKind} · {peerId}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="grid max-w-[360px]">
                      <strong className="truncate text-sm text-ink-strong">
                        {routeAgent} · {routeModel}
                      </strong>
                      <span className="truncate text-xs text-muted">
                        {profile?.name ?? binding.agentProfileId} ·{" "}
                        {routeWorkDir}
                      </span>
                      {hasRouteOverride && (
                        <Badge variant="info" className="mt-1 w-fit">
                          独立覆盖
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
                    <Badge variant={binding.enabled ? "ok" : "mute"}>
                      {binding.enabled ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateRoute(binding)}
                        disabled={saveMutation.isPending}
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
    </div>
  );
}
