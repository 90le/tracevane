import * as React from "react";
import { Bot, FolderOpen, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";

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
import { MetricRail, MetricTile } from "@/design/ui/metric";

import {
  useApplyChannelConnectorsV3ConfigMutation,
  useChannelConnectorsV3ConfigQuery,
  usePlanChannelConnectorsV3ConfigMutation,
} from "@/lib/query/channel-connectors";
import {
  CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS,
  CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA,
  type ChannelConnectorDeliveryTarget,
  type ChannelConnectorPermissionMode,
  type ChannelConnectorReasoningEffort,
  type ChannelConnectorsV3Config,
  type ChannelConnectorsV3ConfigPlanResponse,
} from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { StatusDot } from "./_shared";
import { FormField, SelectInput, TextareaInput, ToggleField } from "./V3Fields";
import { V3PlanDialog } from "./V3PlanDialog";

const PERMISSION_MODES: ChannelConnectorPermissionMode[] = [
  "suggest",
  "read-only",
  "auto-edit",
  "full-auto",
  "plan",
  "yolo",
];

function targetTemplate(): ChannelConnectorDeliveryTarget {
  return {
    id: `workspace-${Date.now().toString(36)}`,
    name: "新 Agent 工作区",
    enabled: true,
    runtime: {
      agent: "codex",
      appProfileRef: "",
      gatewayEndpoint: "http://127.0.0.1:8000/v1",
      gatewayKeyRef: "tracevane-gateway-client-key",
    },
    workspace: { workDir: "" },
    execution: {
      model: null,
      reasoningEffort: null,
      permissionMode: "suggest",
      workspaceConcurrency: 1,
      queueLimit: 20,
    },
    governance: { disabledCommands: [] },
  };
}

function splitList(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function replaceTarget(
  config: ChannelConnectorsV3Config,
  target: ChannelConnectorDeliveryTarget,
): ChannelConnectorsV3Config {
  const targets = [...config.targets];
  const index = targets.findIndex((candidate) => candidate.id === target.id);
  if (index >= 0) targets[index] = target;
  else targets.push(target);
  return { ...config, targets };
}

function targetUsage(config: ChannelConnectorsV3Config, targetId: string): string[] {
  const accountNames = new Map(config.accounts.map((account) => [account.id, account.displayName]));
  const accountIds = new Set<string>();
  for (const policy of config.deliveryPolicies) {
    if (policy.defaultTargetRef === targetId || policy.rules.some((rule) => rule.targetRef === targetId)) {
      accountIds.add(policy.accountRef);
    }
  }
  return [...accountIds].map((id) => accountNames.get(id) || id);
}

function WorkspaceEditor({
  open,
  target,
  creating,
  planning,
  onOpenChange,
  onPlan,
}: {
  open: boolean;
  target: ChannelConnectorDeliveryTarget | null;
  creating: boolean;
  planning: boolean;
  onOpenChange: (open: boolean) => void;
  onPlan: (target: ChannelConnectorDeliveryTarget) => void;
}) {
  const [draft, setDraft] = React.useState<ChannelConnectorDeliveryTarget>(target ?? targetTemplate());
  const [disabledCommands, setDisabledCommands] = React.useState("");

  React.useEffect(() => {
    const next = target ? structuredClone(target) : targetTemplate();
    setDraft(next);
    setDisabledCommands(next.governance.disabledCommands.join("\n"));
  }, [open, target]);

  const patch = (value: Partial<ChannelConnectorDeliveryTarget>) => {
    setDraft((current) => ({ ...current, ...value }));
  };
  const valid = Boolean(draft.id.trim() && draft.name.trim() && draft.workspace.workDir.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(760px,96vw)] flex-col">
        <DialogHeader>
          <DialogTitle>{creating ? "新建 Agent 工作区" : `编辑工作区 · ${target?.name ?? ""}`}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid min-h-0 gap-5 overflow-y-auto">
          <section className="grid gap-3">
            <div>
              <h3 className="font-semibold text-ink-strong">基本信息</h3>
              <p className="text-sm text-subtle">一个工作区是一套可复用的 Agent 执行环境，不包含任何渠道凭据。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="工作区 ID" hint="创建后保持稳定，用于会话与分发引用。">
                <Input value={draft.id} disabled={!creating} onChange={(event) => patch({ id: event.target.value.trim() })} />
              </FormField>
              <FormField label="显示名称">
                <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
              </FormField>
            </div>
            <ToggleField
              checked={draft.enabled}
              onChange={(enabled) => patch({ enabled })}
              label="启用此工作区"
              description="停用后，引用它的账号配置会在服务端校验时被阻止。"
            />
          </section>

          <section className="grid gap-3 border-t border-line pt-4">
            <div>
              <h3 className="font-semibold text-ink-strong">Agent 与目录</h3>
              <p className="text-sm text-subtle">目录是并发隔离边界；同一目录默认只运行一个可写回合。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Agent CLI">
                <SelectInput
                  value={draft.runtime.agent}
                  onChange={(event) => patch({ runtime: { ...draft.runtime, agent: event.target.value as ChannelConnectorDeliveryTarget["runtime"]["agent"] } })}
                >
                  {CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS.map((agent) => (
                    <option key={agent} value={agent}>{CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA[agent].label} · {agent}</option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="App Profile" hint="可留空，使用该 CLI 的默认配置。">
                <Input value={draft.runtime.appProfileRef} onChange={(event) => patch({ runtime: { ...draft.runtime, appProfileRef: event.target.value } })} />
              </FormField>
            </div>
            <FormField label="启动目录" hint="必须是 Agent 可访问的绝对目录；多个账号可共同投递到这里。">
              <Input value={draft.workspace.workDir} placeholder="/home/user/project" onChange={(event) => patch({ workspace: { workDir: event.target.value } })} />
            </FormField>
            <FormField label="Gateway API 地址" hint="显式保存，不使用 placeholder，避免被浏览器密码管理器清空。">
              <Input
                type="url"
                autoComplete="off"
                value={draft.runtime.gatewayEndpoint}
                onChange={(event) => patch({ runtime: { ...draft.runtime, gatewayEndpoint: event.target.value } })}
              />
            </FormField>
          </section>

          <section className="grid gap-3 border-t border-line pt-4">
            <div>
              <h3 className="font-semibold text-ink-strong">执行策略</h3>
              <p className="text-sm text-subtle">规则只能选择工作区，不能在来源上隐藏覆盖这些字段。</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="模型" hint="留空使用 Gateway 默认路由。">
                <Input value={draft.execution.model ?? ""} placeholder="Gateway 默认" onChange={(event) => patch({ execution: { ...draft.execution, model: event.target.value.trim() || null } })} />
              </FormField>
              <FormField label="推理强度">
                <SelectInput value={draft.execution.reasoningEffort ?? ""} onChange={(event) => patch({ execution: { ...draft.execution, reasoningEffort: (event.target.value || null) as ChannelConnectorReasoningEffort | null } })}>
                  <option value="">Agent 默认</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="xhigh">xhigh</option>
                </SelectInput>
              </FormField>
              <FormField label="权限模式">
                <SelectInput value={draft.execution.permissionMode} onChange={(event) => patch({ execution: { ...draft.execution, permissionMode: event.target.value as ChannelConnectorPermissionMode } })}>
                  {PERMISSION_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </SelectInput>
              </FormField>
              <FormField label="队列上限" hint="达到上限后明确返回繁忙，不无限积压。">
                <Input type="number" min={1} max={500} value={draft.execution.queueLimit} onChange={(event) => patch({ execution: { ...draft.execution, queueLimit: Math.max(1, Number(event.target.value) || 1) } })} />
              </FormField>
            </div>
            <FormField label="禁用命令" hint="逗号或换行分隔，作为该工作区的基础治理限制。">
              <TextareaInput value={disabledCommands} onChange={(event) => setDisabledCommands(event.target.value)} placeholder="shell\nterminal" />
            </FormField>
          </section>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            variant="primary"
            disabled={!valid || planning}
            onClick={() => onPlan({ ...draft, governance: { disabledCommands: splitList(disabledCommands) }, execution: { ...draft.execution, workspaceConcurrency: 1 } })}
          >
            <ShieldCheck />
            检查并保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspacesView({ selectedTarget }: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsV3ConfigQuery();
  const planMutation = usePlanChannelConnectorsV3ConfigMutation();
  const applyMutation = useApplyChannelConnectorsV3ConfigMutation();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<ChannelConnectorDeliveryTarget | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ChannelConnectorDeliveryTarget | null>(null);
  const [plan, setPlan] = React.useState<ChannelConnectorsV3ConfigPlanResponse | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [pendingCandidate, setPendingCandidate] = React.useState<ChannelConnectorsV3Config | null>(null);

  const config = configQuery.data?.config ?? null;
  React.useEffect(() => {
    if (!selectedTarget || !config) return;
    const target = config.targets.find((candidate) => candidate.id === selectedTarget);
    if (target) setEditing(target);
  }, [config, selectedTarget]);

  if (configQuery.isLoading) {
    return <div className="grid gap-4" role="status" aria-busy="true"><Skeleton className="h-12 w-full" /><SkeletonRow /><SkeletonRow /></div>;
  }
  if (configQuery.error || !config) {
    return <ErrorState title="无法加载 Agent 工作区" description={configQuery.error?.message || "v3 配置不可用"} action={<Button variant="outline" size="sm" onClick={() => void configQuery.refetch()}>重试</Button>} />;
  }

  const filtered = config.targets.filter((target) => `${target.name} ${target.id} ${target.runtime.agent} ${target.workspace.workDir}`.toLowerCase().includes(query.trim().toLowerCase()));
  const referenced = config.targets.filter((target) => targetUsage(config, target.id).length > 0).length;

  const requestPlan = (candidate: ChannelConnectorsV3Config) => {
    setPendingCandidate(candidate);
    setPlan(null);
    setPlanOpen(true);
    planMutation.mutate({ config: candidate, expectedRevision: configQuery.data?.revision }, {
      onSuccess: setPlan,
      onError: (error) => {
        setPlanOpen(false);
        toast.error("无法生成变更计划", { description: error.message });
      },
    });
  };

  const applyPlan = () => {
    if (!plan?.planId || !pendingCandidate) return;
    applyMutation.mutate({ planId: plan.planId, config: pendingCandidate, reloadMode: "when-idle", rollbackOnFailure: true }, {
      onSuccess: (result) => {
        if (!result.accepted) {
          toast.error(result.rolledBack ? "应用失败，已自动回滚" : "应用失败", { description: result.error || result.reload.error || undefined });
          return;
        }
        toast.success(result.reload.status === "pending" ? "已保存，等待运行时应用" : "Agent 工作区已应用");
        setPlanOpen(false);
        setEditing(null);
        setCreating(false);
        setDeleteTarget(null);
        setPendingCandidate(null);
        void configQuery.refetch();
      },
      onError: (error) => toast.error("应用 Agent 工作区失败", { description: error.message }),
    });
  };

  const requestDelete = () => {
    if (!deleteTarget) return;
    const usage = targetUsage(config, deleteTarget.id);
    if (usage.length > 0) {
      toast.warning("工作区仍被渠道账号引用", { description: usage.join("、") });
      return;
    }
    requestPlan({ ...config, targets: config.targets.filter((target) => target.id !== deleteTarget.id) });
  };

  return (
    <div className="grid gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-strong">Agent 工作区</h2>
          <p className="text-sm text-muted">复用 Agent CLI、模型、权限和启动目录；渠道账号只负责选择默认工作区。</p>
        </div>
        <Input className="w-full sm:w-72" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称 / Agent / 目录" />
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus />新建工作区</Button>
      </div>

      <MetricRail>
        <MetricTile label="Agent 工作区" value={config.targets.length} hint={`${config.targets.filter((target) => target.enabled).length} 个已启用`} icon={<Bot />} />
        <MetricTile label="被账号使用" value={referenced} hint="被默认投递或来源例外引用" icon={<ShieldCheck />} />
        <MetricTile label="独立目录" value={new Set(config.targets.map((target) => target.workspace.workDir)).size} hint="目录是并发隔离边界" icon={<FolderOpen />} />
      </MetricRail>

      {config.targets.length === 0 ? (
        <EmptyState
          icon={<Bot />}
          title="尚未创建 Agent 工作区"
          description="工作区是可复用的 Agent 执行环境；先创建工作区，渠道账号才能把消息投递进来。"
          action={<Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus />新建工作区</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="没有匹配的工作区"
          description={`没有符合“${query.trim()}”的工作区；调整搜索条件再试。`}
          action={<Button variant="outline" size="sm" onClick={() => setQuery("")}>清除搜索</Button>}
        />
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>工作区</TableHead><TableHead>Agent / 模型</TableHead><TableHead>启动目录</TableHead><TableHead>账号引用</TableHead><TableHead>状态</TableHead><TableHead className="text-right">动作</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((target) => {
              const usage = targetUsage(config, target.id);
              return (
                <TableRow key={target.id}>
                  <TableCell data-label="Agent 工作区"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-sm bg-panel-3 text-muted"><Bot className="size-4" /></span><span className="grid min-w-0"><strong className="truncate text-ink-strong">{target.name}</strong><span className="truncate text-xs text-muted">{target.id}</span></span></div></TableCell>
                  <TableCell data-label="Agent / 模型"><span className="text-sm text-ink">{target.runtime.agent}</span><div className="text-xs text-muted">{target.execution.model || "Gateway 默认"} · {target.execution.permissionMode}</div></TableCell>
                  <TableCell data-label="启动目录"><span className="flex max-w-72 min-w-0 items-center gap-1.5 text-sm text-muted" title={target.workspace.workDir}><FolderOpen className="size-3.5 shrink-0" /><span className="min-w-0 truncate">{target.workspace.workDir}</span></span></TableCell>
                  <TableCell data-label="绑定账号"><Badge variant={usage.length ? "info" : "mute"}>{usage.length} 个账号</Badge></TableCell>
                  <TableCell data-label="状态"><span className="flex items-center gap-2"><StatusDot tone={target.enabled ? "ok" : "mute"} pulse={target.enabled} /><Badge variant={target.enabled ? "ok" : "mute"}>{target.enabled ? "启用" : "停用"}</Badge></span></TableCell>
                  <TableCell data-label="动作"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="编辑工作区" aria-label="编辑工作区" onClick={() => setEditing(target)}><Pencil /></Button><Button variant="ghost" size="icon" title={usage.length ? "仍被账号引用" : "删除工作区"} aria-label="删除工作区" disabled={usage.length > 0} className="text-danger" onClick={() => setDeleteTarget(target)}><Trash2 /></Button></div></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <WorkspaceEditor
        open={creating || editing != null}
        target={editing}
        creating={creating}
        planning={planMutation.isPending}
        onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }}
        onPlan={(target) => requestPlan(replaceTarget(config, target))}
      />

      <Dialog open={deleteTarget != null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent><DialogHeader><DialogTitle>删除 Agent 工作区</DialogTitle></DialogHeader><DialogBody>将删除 <strong className="text-ink-strong">{deleteTarget?.name}</strong>。只有未被任何账号引用时才允许继续。</DialogBody><DialogFooter><Button variant="ghost" onClick={() => setDeleteTarget(null)}>取消</Button><Button variant="danger" onClick={requestDelete}><Trash2 />检查并删除</Button></DialogFooter></DialogContent>
      </Dialog>

      <V3PlanDialog plan={plan} open={planOpen} applying={applyMutation.isPending} onOpenChange={setPlanOpen} onConfirm={applyPlan} />
    </div>
  );
}
