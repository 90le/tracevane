import * as React from "react";
import { Pencil, PlugZap, Route, ShieldCheck } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/design/ui/table";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import { useChannelConnectorsConfigQuery } from "@/lib/query/channel-connectors";
import type { ChannelConnectorPlatformBinding } from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { RouteEditor } from "./BindingEditor";

function metaString(binding: ChannelConnectorPlatformBinding, key: string, fallback = "—") {
  const value = binding.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function RoutesView({ selectedBinding, goToView }: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsConfigQuery();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<ChannelConnectorPlatformBinding | null>(null);

  const config = configQuery.data?.config ?? null;
  const bindings = config?.platformBindings ?? [];
  const agentProfiles = config?.agentProfiles ?? [];

  React.useEffect(() => {
    if (!selectedBinding || !bindings.length) return;
    const match = bindings.find((binding) => binding.id === selectedBinding);
    if (match) setEditing(match);
  }, [bindings, selectedBinding]);

  if (configQuery.isLoading) {
    return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-12 w-full" /><SkeletonRow /><SkeletonRow /></div>;
  }
  if (configQuery.error) {
    return <ErrorState title="无法加载绑定路由" description={configQuery.error.message} action={<Button variant="outline" size="sm" onClick={() => void configQuery.refetch()}>重试</Button>} />;
  }

  const filtered = bindings.filter((binding) => {
    const profile = agentProfiles.find((item) => item.id === binding.agentProfileId);
    const haystack = `${binding.displayName} ${binding.id} ${binding.platform} ${binding.agentProfileId} ${binding.accountId} ${metaString(binding, "peerKind", "")} ${metaString(binding, "peerId", "")} ${metaString(binding, "routeAgent", profile?.agent ?? "")} ${metaString(binding, "routeModel", profile?.model ?? "")}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="grid gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-strong">绑定路由</h2>
          <p className="text-sm text-muted">IM 来源匹配、Agent Profile、权限与会话策略；平台凭据在“平台账号”。</p>
        </div>
        <Input className="w-full sm:w-72" placeholder="搜索路由 / Agent / 来源" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => goToView("accounts")}><PlugZap />新建账号</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="暂无绑定路由" description="先创建平台账号，再编辑它对应的来源匹配和 Agent 目标。" action={<Button variant="primary" size="sm" onClick={() => goToView("accounts")}><PlugZap />前往平台账号</Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>绑定路由</TableHead><TableHead>来源</TableHead><TableHead>实际 Agent / 模型</TableHead><TableHead>权限</TableHead><TableHead>状态</TableHead><TableHead className="text-right">动作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((binding) => {
              const profile = agentProfiles.find((item) => item.id === binding.agentProfileId);
              const peerKind = metaString(binding, "peerKind", "未指定");
              const peerId = metaString(binding, "peerId", "*");
              const routeAgent = metaString(binding, "routeAgent", profile?.agent ?? "unknown");
              const routeModel = metaString(binding, "routeModel", profile?.model ?? "网关默认路由");
              const routeWorkDir = metaString(binding, "routeWorkDir", profile?.workDir ?? "—");
              const hasRouteOverride = ["routeAgent", "routeModel", "routeWorkDir", "routePermissionMode"].some((key) => Boolean(metaString(binding, key, "")));
              return (
                <TableRow key={binding.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-[9px] bg-panel-3 text-muted"><Route className="size-4" /></span>
                      <span className="grid min-w-0"><strong className="truncate text-ink-strong">{binding.displayName || binding.id}</strong><span className="truncate text-sm text-muted">{binding.platform} · acct {binding.accountId || "—"}</span></span>
                    </div>
                  </TableCell>
                  <TableCell><span className="font-mono text-sm text-muted">{peerKind} · {peerId}</span></TableCell>
                  <TableCell><span className="grid max-w-[360px]"><strong className="truncate text-sm text-ink-strong">{routeAgent} · {routeModel}</strong><span className="truncate text-xs text-muted">{profile?.name ?? binding.agentProfileId} · {routeWorkDir}</span>{hasRouteOverride && <Badge variant="info" className="mt-1 w-fit">独立覆盖</Badge>}</span></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1.5"><Badge variant="outline">{binding.allowlist.length} 允许</Badge><Badge variant="outline">{binding.adminUsers.length} 管理员</Badge><Badge variant="outline">{binding.disabledCommands.length} 禁用</Badge></div></TableCell>
                  <TableCell><Badge variant={binding.enabled ? "ok" : "mute"}>{binding.enabled ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell><div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setEditing(binding)}><Pencil />编辑路由</Button></div></TableCell>
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
