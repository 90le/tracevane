import * as React from "react";
import { AlertTriangle, Bot, Pencil, PlugZap, Plus, RadioTower, Trash2, Zap } from "lucide-react";

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
import { toast } from "@/design/ui/sonner";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useChannelConnectorsConfigQuery,
  useChannelConnectorsDaemonConfigQuery,
  useRunFeishuTransportSmokeMutation,
  useRunOctoTransportSmokeMutation,
  useSaveChannelConnectorsConfigMutation,
} from "@/lib/query/channel-connectors";
import type { ChannelConnectorPlatformBinding } from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { Panel, PanelHead } from "./_shared";
import { BindingBadges, BindingEditor } from "./BindingEditor";

function transportSmokeLabel(binding: ChannelConnectorPlatformBinding): string {
  if (binding.platform === "feishu") return "tenant-token";
  if (binding.platform === "octo") return "register";
  return "暂不支持";
}

export function BindingsView({ selectedBinding }: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsConfigQuery();
  const daemonConfigQuery = useChannelConnectorsDaemonConfigQuery();
  const saveMutation = useSaveChannelConnectorsConfigMutation();
  const feishuSmoke = useRunFeishuTransportSmokeMutation();
  const octoSmoke = useRunOctoTransportSmokeMutation();

  const [editing, setEditing] = React.useState<ChannelConnectorPlatformBinding | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ChannelConnectorPlatformBinding | null>(null);

  const configResponse = configQuery.data;
  const config = configResponse?.config;
  const bindings = config?.platformBindings ?? [];
  const agentProfiles = config?.agentProfiles ?? [];
  const agentProfileIds = agentProfiles.map((p) => p.id);
  const supportedPlatforms = configResponse?.supportedPlatforms ?? [];

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

  const handleDelete = () => {
    if (!config || !deleteTarget) return;
    saveMutation.mutate(
      {
        config: {
          ...config,
          updatedAt: new Date().toISOString(),
          platformBindings: config.platformBindings.filter((binding) => binding.id !== deleteTarget.id),
        },
      },
      {
        onSuccess: () => {
          toast.success("已删除平台绑定", { description: deleteTarget.id });
          setDeleteTarget(null);
          void configQuery.refetch();
          void daemonConfigQuery.refetch();
        },
        onError: (error) => toast.error("删除失败", { description: error.message }),
      },
    );
  };

  const runTransportSmoke = (binding: ChannelConnectorPlatformBinding) => {
    if (binding.platform === "feishu") {
      feishuSmoke.mutate(
        { bindingId: binding.id, action: "tenant-token" },
        {
          onSuccess: (result) => {
            toast.success("飞书传输测试完成", {
              description: result.transport.error || `HTTP ${result.transport.statusCode ?? "ok"}`,
            });
          },
          onError: (error) => toast.error("飞书传输测试失败", { description: error.message }),
        },
      );
      return;
    }
    if (binding.platform === "octo") {
      octoSmoke.mutate(
        { bindingId: binding.id, action: "register" },
        {
          onSuccess: (result) => {
            toast.success("Octo 传输测试完成", {
              description: result.transport.error || `HTTP ${result.transport.statusCode ?? "ok"}`,
            });
          },
          onError: (error) => toast.error("Octo 传输测试失败", { description: error.message }),
        },
      );
      return;
    }
    toast.info("该平台暂无内置传输测试", { description: binding.platform });
  };

  const smokePending = feishuSmoke.isPending || octoSmoke.isPending;

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
          sub="账号/bot 到 Agent 的绑定，可新建、编辑、删除、测试传输；凭据读取会脱敏。"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {bindings.filter((b) => b.enabled).length}/{bindings.length} 启用
              </Badge>
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                <Plus />
                新建绑定
              </Button>
            </div>
          }
        />
        {bindings.length === 0 ? (
          <EmptyState
            title="暂无平台绑定"
            description="创建第一个平台账号/bot 绑定后，IM 消息才能路由到 Agent。"
            action={
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                <Plus />
                新建绑定
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2 p-3">
            {bindings.map((binding) => {
              const canSmoke = binding.platform === "feishu" || binding.platform === "octo";
              return (
                <div
                  key={binding.id}
                  className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                      <PlugZap />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <strong className="truncate text-base text-ink-strong">
                        {binding.displayName || binding.id}
                      </strong>
                      <span className="truncate text-sm text-muted">
                        {binding.platform} · {binding.agentProfileId} · 测试 {transportSmokeLabel(binding)}
                      </span>
                    </span>
                    <Badge variant={binding.enabled ? "ok" : "mute"}>
                      {binding.enabled ? "启用" : "停用"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runTransportSmoke(binding)}
                      disabled={!canSmoke || smokePending}
                      title={canSmoke ? `运行 ${transportSmokeLabel(binding)} 测试` : "该平台暂无内置传输测试"}
                    >
                      <Zap />
                      测试
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(binding)}>
                      <Pencil />
                      编辑
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(binding)}>
                      <Trash2 />
                      删除
                    </Button>
                  </div>
                  <BindingBadges binding={binding} />
                </div>
              );
            })}
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
        open={creating || editing != null}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreating(false);
          }
        }}
        binding={editing}
        config={config ?? null}
        agentProfileIds={agentProfileIds}
        supportedPlatforms={supportedPlatforms}
        onSaved={() => {
          void configQuery.refetch();
          void daemonConfigQuery.refetch();
        }}
      />

      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <AlertTriangle />
            </span>
            <DialogTitle>删除平台绑定</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-2 text-sm text-muted">
            <p>
              将删除绑定 <strong className="text-ink-strong">{deleteTarget?.displayName || deleteTarget?.id}</strong>。
              这不会删除历史日志，但新的 IM 消息不会再通过该绑定触发 Agent。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)} disabled={saveMutation.isPending}>
              取消
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
