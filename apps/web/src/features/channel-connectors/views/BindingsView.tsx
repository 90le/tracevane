import * as React from "react";
import { Bot, Pencil, PlugZap, RadioTower } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useChannelConnectorsConfigQuery,
  useChannelConnectorsDaemonConfigQuery,
} from "@/lib/query/channel-connectors";
import type { ChannelConnectorPlatformBinding } from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { Panel, PanelHead } from "./_shared";
import { BindingBadges, BindingEditor } from "./BindingEditor";

export function BindingsView({ selectedBinding }: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsConfigQuery();
  const daemonConfigQuery = useChannelConnectorsDaemonConfigQuery();

  const [editing, setEditing] = React.useState<ChannelConnectorPlatformBinding | null>(null);

  const config = configQuery.data?.config;
  const bindings = config?.platformBindings ?? [];
  const agentProfiles = config?.agentProfiles ?? [];
  const agentProfileIds = agentProfiles.map((p) => p.id);

  // Open the editor for a deep-linked binding once data is present.
  const deepLinkHandled = React.useRef(false);
  React.useEffect(() => {
    if (deepLinkHandled.current || !selectedBinding || bindings.length === 0) return;
    const match = bindings.find((b) => b.id === selectedBinding);
    if (match) {
      setEditing(match);
      deepLinkHandled.current = true;
    }
  }, [selectedBinding, bindings]);

  if (configQuery.isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <section className="rounded-md border border-line bg-panel shadow-sm">
          <Skeleton className="h-12 w-full rounded-b-none" />
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </section>
      </div>
    );
  }

  if (configQuery.error) {
    return (
      <ErrorState
        title="无法加载绑定配置"
        description={configQuery.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void configQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  // Native runtime bindings (from daemon config projects) — read-only reference.
  const nativeBindings = (daemonConfigQuery.data?.config.projects ?? []).flatMap((project) =>
    project.platformBindings.map((binding) => ({ project, binding })),
  );

  return (
    <div className="grid gap-[18px]">
      {/* Agent profiles summary */}
      <Panel>
        <PanelHead title="Agent 配置" sub="绑定可指向的本地 Agent profile（只读）。" />
        {agentProfiles.length === 0 ? (
          <EmptyState title="暂无 Agent 配置" description="原生配置中尚未定义 Agent profile。" />
        ) : (
          <div className="py-1.5">
            {agentProfiles.map((profile) => (
              <div key={profile.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                  <Bot />
                </span>
                <span className="grid min-w-0 flex-1">
                  <strong className="truncate text-base text-ink-strong">{profile.name}</strong>
                  <span className="truncate text-sm text-muted">
                    {profile.agent}
                    {profile.model ? ` · ${profile.model}` : ""} · {profile.permissionMode}
                  </span>
                </span>
                <Badge variant="outline">{profile.id}</Badge>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Editable platform bindings */}
      <Panel>
        <PanelHead
          title="平台绑定"
          sub="账号/bot 到 Agent 的绑定，可编辑身份、传输与访问控制。"
          action={
            <Badge variant="outline">
              {bindings.filter((b) => b.enabled).length}/{bindings.length} 启用
            </Badge>
          }
        />
        {bindings.length === 0 ? (
          <EmptyState
            title="暂无平台绑定"
            description="原生配置中尚未定义任何平台账号绑定。"
          />
        ) : (
          <div className="grid gap-2 p-3">
            {bindings.map((binding) => (
              <div
                key={binding.id}
                className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                    <PlugZap />
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <strong className="truncate text-base text-ink-strong">
                      {binding.displayName || binding.id}
                    </strong>
                    <span className="truncate text-sm text-muted">
                      {binding.platform} · {binding.agentProfileId}
                    </span>
                  </span>
                  <Badge variant={binding.enabled ? "ok" : "mute"}>
                    {binding.enabled ? "启用" : "停用"}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => setEditing(binding)}>
                    <Pencil />
                    编辑
                  </Button>
                </div>
                <BindingBadges binding={binding} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Native runtime bindings (daemon config) — read-only reference */}
      <Panel>
        <PanelHead
          title="Daemon 原生绑定"
          sub="平台账号/bot 到 Agent profile 的 native runtime 映射（只读）。"
          action={
            daemonConfigQuery.isLoading ? undefined : (
              <Badge variant="outline">{nativeBindings.length} native</Badge>
            )
          }
        />
        {daemonConfigQuery.isLoading ? (
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : daemonConfigQuery.error ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-red">{daemonConfigQuery.error.message}</span>
            <Button variant="outline" size="sm" onClick={() => void daemonConfigQuery.refetch()}>
              重试
            </Button>
          </div>
        ) : nativeBindings.length === 0 ? (
          <EmptyState
            title="暂无原生绑定"
            description="守护配置尚未生成 project / binding 映射。"
          />
        ) : (
          <div className="py-1.5">
            {nativeBindings.map(({ project, binding }) => (
              <div
                key={`${project.id}-${binding.id}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                  <RadioTower />
                </span>
                <span className="grid min-w-0 flex-1">
                  <strong className="truncate text-base text-ink-strong">
                    {binding.displayName || binding.id}
                  </strong>
                  <span className="truncate text-sm text-muted">
                    {binding.platform} · {project.name || project.id} · {binding.agent}
                  </span>
                </span>
                <Badge variant={binding.enabled ? "ok" : "mute"}>
                  {binding.enabled ? "启用" : "停用"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <BindingEditor
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        binding={editing}
        config={config ?? null}
        agentProfileIds={agentProfileIds}
        onSaved={() => {
          void configQuery.refetch();
          void daemonConfigQuery.refetch();
        }}
      />
    </div>
  );
}
