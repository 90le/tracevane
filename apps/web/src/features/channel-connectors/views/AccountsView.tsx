import * as React from "react";
import { AlertTriangle, Pencil, Plus, RadioTower, Trash2, Zap } from "lucide-react";

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
import { toast } from "@/design/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/design/ui/table";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useChannelConnectorsConfigQuery,
  useRunFeishuTransportSmokeMutation,
  useRunOctoTransportSmokeMutation,
  useSaveChannelConnectorsConfigMutation,
} from "@/lib/query/channel-connectors";
import type { ChannelConnectorPlatformBinding } from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { AccountEditor } from "./BindingEditor";

function smokeLabel(binding: ChannelConnectorPlatformBinding): string {
  if (binding.platform === "feishu") return "tenant-token";
  if (binding.platform === "octo") return "register";
  return "未验证";
}

function credentialState(binding: ChannelConnectorPlatformBinding): { label: string; variant: "ok" | "warn" | "mute" } {
  const metadataKeys = Object.keys(binding.metadata ?? {});
  if (metadataKeys.some((key) => /secret|token|key/i.test(key))) return { label: "已脱敏保存", variant: "ok" };
  if (metadataKeys.length > 0) return { label: "metadata", variant: "warn" };
  return { label: "未填写", variant: "mute" };
}

export function AccountsView({ selectedBinding }: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsConfigQuery();
  const saveMutation = useSaveChannelConnectorsConfigMutation();
  const feishuSmoke = useRunFeishuTransportSmokeMutation();
  const octoSmoke = useRunOctoTransportSmokeMutation();

  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<ChannelConnectorPlatformBinding | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ChannelConnectorPlatformBinding | null>(null);

  const configResponse = configQuery.data;
  const config = configResponse?.config ?? null;
  const bindings = config?.platformBindings ?? [];
  const defaultAgentProfileId = config?.defaultAgentProfileId || config?.agentProfiles[0]?.id || "default";
  const supportedPlatforms = configResponse?.supportedPlatforms ?? [];

  React.useEffect(() => {
    if (!selectedBinding || !bindings.length) return;
    const match = bindings.find((binding) => binding.id === selectedBinding);
    if (match) setEditing(match);
  }, [bindings, selectedBinding]);

  if (configQuery.isLoading) {
    return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-12 w-full" /><SkeletonRow /><SkeletonRow /></div>;
  }
  if (configQuery.error) {
    return <ErrorState title="无法加载平台账号" description={configQuery.error.message} action={<Button variant="outline" size="sm" onClick={() => void configQuery.refetch()}>重试</Button>} />;
  }

  const filtered = bindings.filter((binding) => {
    const haystack = `${binding.displayName} ${binding.id} ${binding.platform} ${binding.accountId} ${binding.botId ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const runSmoke = (binding: ChannelConnectorPlatformBinding) => {
    if (binding.platform === "feishu") {
      feishuSmoke.mutate(
        { bindingId: binding.id, action: "tenant-token" },
        {
          onSuccess: (result) => toast.success("飞书账号测试完成", { description: result.transport.error || `HTTP ${result.transport.statusCode ?? "ok"}` }),
          onError: (error) => toast.error("飞书账号测试失败", { description: error.message }),
        },
      );
      return;
    }
    if (binding.platform === "octo") {
      octoSmoke.mutate(
        { bindingId: binding.id, action: "register" },
        {
          onSuccess: (result) => toast.success("Octo 账号测试完成", { description: result.transport.error || `HTTP ${result.transport.statusCode ?? "ok"}` }),
          onError: (error) => toast.error("Octo 账号测试失败", { description: error.message }),
        },
      );
      return;
    }
    toast.info("该平台暂无 verified smoke", { description: binding.platform });
  };

  const deleteAccount = () => {
    if (!config || !deleteTarget) return;
    saveMutation.mutate(
      { config: { ...config, updatedAt: new Date().toISOString(), platformBindings: config.platformBindings.filter((item) => item.id !== deleteTarget.id) } },
      {
        onSuccess: () => {
          toast.success("已删除平台账号", { description: deleteTarget.id });
          setDeleteTarget(null);
          void configQuery.refetch();
        },
        onError: (error) => toast.error("删除失败", { description: error.message }),
      },
    );
  };

  const smokePending = feishuSmoke.isPending || octoSmoke.isPending;

  return (
    <div className="grid gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-strong">平台账号</h2>
          <p className="text-sm text-muted">平台凭据、bot/account 身份与平台级 smoke；路由策略在“绑定路由”。</p>
        </div>
        <Input className="w-full sm:w-72" placeholder="搜索平台 / 账号 / bot" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus />新建平台账号</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="暂无平台账号" description="创建平台账号后，再在“绑定路由”选择它触发 Agent。" action={<Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus />新建平台账号</Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>平台账号</TableHead><TableHead>凭据</TableHead><TableHead>测试</TableHead><TableHead>状态</TableHead><TableHead className="text-right">动作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((binding) => {
              const cred = credentialState(binding);
              const canSmoke = binding.platform === "feishu" || binding.platform === "octo";
              return (
                <TableRow key={binding.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-[9px] bg-panel-3 text-muted"><RadioTower className="size-4" /></span>
                      <span className="grid min-w-0"><strong className="truncate text-ink-strong">{binding.displayName || binding.id}</strong><span className="truncate text-sm text-muted">{binding.platform} · acct {binding.accountId || "—"}{binding.botId ? ` · bot ${binding.botId}` : ""}</span></span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={cred.variant}>{cred.label}</Badge></TableCell>
                  <TableCell><Badge variant={canSmoke ? "info" : "mute"}>{smokeLabel(binding)}</Badge></TableCell>
                  <TableCell><Badge variant={binding.enabled ? "ok" : "mute"}>{binding.enabled ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => runSmoke(binding)} disabled={!canSmoke || smokePending}><Zap />测试</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(binding)}><Pencil />编辑</Button>
                      <Button variant="ghost" size="sm" className="text-red hover:bg-red-soft" onClick={() => setDeleteTarget(binding)}><Trash2 />删除</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <AccountEditor
        open={creating || editing != null}
        onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }}
        binding={editing}
        config={config}
        supportedPlatforms={supportedPlatforms}
        defaultAgentProfileId={defaultAgentProfileId}
        onSaved={() => void configQuery.refetch()}
      />

      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red"><AlertTriangle className="size-4" /></span><DialogTitle>删除平台账号</DialogTitle></DialogHeader>
          <DialogBody>删除 <strong className="text-ink-strong">{deleteTarget?.displayName || deleteTarget?.id}</strong> 会同时移除该账号对应的当前路由记录，不删除历史日志。</DialogBody>
          <DialogFooter><Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)} disabled={saveMutation.isPending}>取消</Button><Button variant="danger" size="sm" onClick={deleteAccount} disabled={saveMutation.isPending}>{saveMutation.isPending ? "删除中…" : "确认删除"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
