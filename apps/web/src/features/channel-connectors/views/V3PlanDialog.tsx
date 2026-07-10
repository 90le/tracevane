import { AlertTriangle, CheckCircle2, MessageSquare, RefreshCw, Route, Server } from "lucide-react";

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

import type { ChannelConnectorsV3ConfigPlanResponse } from "../types";

function count(values: string[]): number {
  return values.length;
}

export function V3PlanDialog({
  plan,
  open,
  applying,
  onOpenChange,
  onConfirm,
}: {
  plan: ChannelConnectorsV3ConfigPlanResponse | null;
  open: boolean;
  applying: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const reconnects = plan ? count(plan.diff.accountsReconnected) : 0;
  const resolverChanges = plan ? count(plan.diff.resolverAccountsChanged) : 0;
  const targetChanges = plan
    ? count(plan.diff.targetsAdded) + count(plan.diff.targetsRemoved) + count(plan.diff.targetsChanged)
    : 0;
  const affectedSessions = plan?.diff.existingSessionsAffected ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,94vw)]">
        <DialogHeader>
          <DialogTitle>确认配置影响</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {!plan ? (
            <p>正在计算账号连接、分发规则与 Agent 工作区的变更范围…</p>
          ) : plan.validationIssues.length > 0 ? (
            <div className="rounded-sm border border-red/30 bg-red-soft p-3">
              <div className="flex items-center gap-2 font-medium text-red">
                <AlertTriangle className="size-4" />
                配置未通过校验
              </div>
              <ul className="mt-2 grid gap-1 text-sm text-ink">
                {plan.validationIssues.map((issue) => (
                  <li key={`${issue.path}:${issue.code}`}>{issue.path}：{issue.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-ink-strong">
                <CheckCircle2 className="size-4 text-green" />
                校验通过，应用后由消息守护热加载
              </div>
              <dl className="grid overflow-hidden rounded-sm border border-line sm:grid-cols-4">
                <div className="border-b border-line p-3 sm:border-b-0 sm:border-r">
                  <dt className="flex items-center gap-1.5 text-xs text-subtle"><RefreshCw className="size-3.5" />账号重连</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-strong">{reconnects}</dd>
                  <dd className="text-xs text-muted">仅连接参数变化的账号</dd>
                </div>
                <div className="border-b border-line p-3 sm:border-b-0 sm:border-r">
                  <dt className="flex items-center gap-1.5 text-xs text-subtle"><Route className="size-3.5" />分发更新</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-strong">{resolverChanges}</dd>
                  <dd className="text-xs text-muted">进行中回合保持原快照</dd>
                </div>
                <div className="p-3">
                  <dt className="flex items-center gap-1.5 text-xs text-subtle"><Server className="size-3.5" />工作区变更</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-strong">{targetChanges}</dd>
                  <dd className="text-xs text-muted">新消息使用新配置</dd>
                </div>
                <div className="border-t border-line p-3 sm:border-l sm:border-t-0">
                  <dt className="flex items-center gap-1.5 text-xs text-subtle"><MessageSquare className="size-3.5" />已有会话</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-strong">{affectedSessions}</dd>
                  <dd className="text-xs text-muted">默认保留，不静默清空</dd>
                </div>
              </dl>
              {affectedSessions > 0 && <p className="text-sm text-muted">现有会话继续使用稳定身份；需要重新开始时，可在“会话”页对指定来源执行重置。</p>}
              <div className="flex flex-wrap gap-1.5">
                {plan.diff.accountsAdded.map((id) => <Badge key={`add:${id}`} variant="ok">新增账号 {id}</Badge>)}
                {plan.diff.accountsRemoved.map((id) => <Badge key={`remove:${id}`} variant="warn">删除账号 {id}</Badge>)}
                {plan.diff.accountsReconnected.map((id) => <Badge key={`reconnect:${id}`} variant="warn">重连 {id}</Badge>)}
                {plan.diff.resolverAccountsChanged.map((id) => <Badge key={`route:${id}`} variant="info">更新分发 {id}</Badge>)}
                {plan.diff.targetsChanged.map((id) => <Badge key={`target:${id}`} variant="outline">更新工作区 {id}</Badge>)}
                {!reconnects && !resolverChanges && !targetChanges
                  && !plan.diff.accountsAdded.length && !plan.diff.accountsRemoved.length
                  && <Badge variant="mute">无运行时差异</Badge>}
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>取消</Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={!plan?.ok || !plan.planId || applying}
          >
            {applying ? <RefreshCw className="animate-spin" /> : <CheckCircle2 />}
            应用变更
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
