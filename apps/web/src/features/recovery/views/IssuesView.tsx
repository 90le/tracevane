import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCog,
  Lock,
  ScanSearch,
  Wrench,
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
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";
import { toast } from "@/design/ui/sonner";

import { useRecoveryStatusQuery, useRunRecoveryMutation } from "@/lib/query/recovery";
import type {
  OpenClawRecoveryLastRepair,
  OpenClawRecoveryRunAction,
  OpenClawRecoveryState,
} from "../types";
import { Panel, PanelHead, Row, formatTime } from "@/design/ui/panel";
import { CommandEvidence, reachabilityLabel } from "./shared";

interface DetectedIssue {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium";
}

/** Build the issue list ONLY from live recovery state — never fabricated. */
function detectIssues(status: OpenClawRecoveryState): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  if (status.probe.gatewayReachable === false) {
    issues.push({
      id: "gateway-unreachable",
      title: "网关探测失败",
      detail: `最近探测无法到达网关，故障窗口已持续 ${Math.round(status.probe.failureDurationMs / 1000)}s。`,
      severity: "high",
    });
  }
  if (status.status === "failed" || status.status === "degraded") {
    issues.push({
      id: `state-${status.status}`,
      title: status.status === "failed" ? "平台守护状态：失败" : "平台守护状态：降级",
      detail: status.notes[0] ?? "OpenClaw 平台守护标记了非健康状态。",
      severity: status.status === "failed" ? "high" : "medium",
    });
  }
  if (status.lastRepair && !status.lastRepair.ok) {
    issues.push({
      id: "last-repair-failed",
      title: "上次修复失败",
      detail: status.lastRepair.error || "上次修复未成功完成。",
      severity: "medium",
    });
  }
  if (status.service.installed && /fail|dead|error/.test((status.service.activeState || "").toLowerCase())) {
    issues.push({
      id: "service-unhealthy",
      title: "恢复服务异常",
      detail: `服务 ${status.service.serviceName} 当前状态：${status.service.activeState}。`,
      severity: "medium",
    });
  }
  return issues;
}

const GUARDED_ACTIONS: Record<
  "config-repair" | "repair",
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    blurb: string;
    confirmCopy: string;
  }
> = {
  "config-repair": {
    title: "配置修复",
    icon: FileCog,
    blurb: "校验并重写 OpenClaw 配置（doctor --fix），修复前会自动备份当前配置。",
    confirmCopy:
      "配置修复会重写 OpenClaw 配置文件。后端会在修复前自动备份当前配置，并返回实际执行的命令与变更项作为证据。该操作可能影响正在运行的会话凭据。确认执行？",
  },
  repair: {
    title: "完整修复",
    icon: Wrench,
    blurb: "执行完整修复，可能重写配置、修复网关服务或重装 CLI（依据策略）。",
    confirmCopy:
      "完整修复会重写配置 / 服务状态，依据策略可能重装 CLI 或修复网关服务，从而中断活跃的 Agent 会话。后端会在修复前备份配置并返回完整命令证据。确认执行？",
  },
};

/**
 * Issues + repair console.
 *
 * SAFETY POLICY (locked): `probe` is a read/diagnostic action and is directly
 * executable. `config-repair` and `repair` REWRITE config/service state and are
 * gated behind a strong confirmation dialog that names what they rewrite,
 * requires an explicit confirm, and renders the real run result (commands,
 * stdout/stderr, ok, changed keys, backup path) as evidence — never one-click,
 * never fake success.
 */
export function IssuesView() {
  const statusQuery = useRecoveryStatusQuery();
  const runMutation = useRunRecoveryMutation();

  const [confirm, setConfirm] = React.useState<null | "config-repair" | "repair">(null);
  const [activeAction, setActiveAction] = React.useState<OpenClawRecoveryRunAction | null>(null);
  const [lastRepairEvidence, setLastRepairEvidence] =
    React.useState<OpenClawRecoveryLastRepair | null>(null);

  if (statusQuery.isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-[120px] w-full" />
        <Panel>
          <Skeleton className="h-12 w-full rounded-b-none" />
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </Panel>
      </div>
    );
  }

  if (statusQuery.error) {
    return (
      <ErrorState
        title="无法加载问题列表"
        description={statusQuery.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void statusQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  const status = statusQuery.data!;
  const issues = detectIssues(status);
  const pending = runMutation.isPending;

  // Safe probe — directly executable (read/diagnostic only).
  const runProbe = () => {
    setActiveAction("probe");
    runMutation.mutate(
      { action: "probe", trigger: "manual", reason: "manual probe from System Guard" },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast.success("探测成功", { description: "网关可达。" });
          } else {
            toast.warning("探测失败", { description: "网关当前不可达，详见状态。" });
          }
        },
        onError: (error) => toast.error("探测失败", { description: error.message }),
        onSettled: () => setActiveAction(null),
      },
    );
  };

  // Guarded repair — only ever reached via confirmation dialog.
  const runGuarded = (action: "config-repair" | "repair") => {
    setActiveAction(action);
    runMutation.mutate(
      { action, trigger: "manual", reason: `manual ${action} from System Guard` },
      {
        onSuccess: (result) => {
          setLastRepairEvidence(result.repair);
          if (result.ok) {
            toast.success(`${GUARDED_ACTIONS[action].title}完成`, {
              description: `${result.repair?.changedKeys.length ?? 0} 项变更`,
            });
          } else {
            toast.error(`${GUARDED_ACTIONS[action].title}失败`, {
              description: result.repair?.error || "修复未成功完成，详见证据。",
            });
          }
        },
        onError: (error) =>
          toast.error(`${GUARDED_ACTIONS[action].title}失败`, { description: error.message }),
        onSettled: () => {
          setActiveAction(null);
          setConfirm(null);
        },
      },
    );
  };

  const dialog = confirm ? GUARDED_ACTIONS[confirm] : null;
  const DialogIcon = dialog?.icon ?? Wrench;

  return (
    <div className="grid gap-[18px]">
      {/* Detected issues — derived only from live state. */}
      <Panel>
        <PanelHead
          title="检测到的问题"
          sub="依据网关探测、平台守护状态与服务状态推导"
          action={
            <Badge variant={issues.length === 0 ? "ok" : "warn"}>
              {issues.length === 0 ? "无异常" : `${issues.length} 项`}
            </Badge>
          }
        />
        {issues.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 />}
            title="未检测到问题"
            description="网关可达、平台守护状态健康。仍可运行探测以刷新诊断证据。"
          />
        ) : (
          <div className="py-1.5">
            {issues.map((issue) => (
              <Row
                key={issue.id}
                icon={<AlertTriangle />}
                iconClass={
                  issue.severity === "high" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                }
                title={issue.title}
                subtitle={issue.detail}
                trailing={
                  <Badge variant={issue.severity === "high" ? "bad" : "warn"}>
                    {issue.severity === "high" ? "严重" : "关注"}
                  </Badge>
                }
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Repair flows. */}
      <Panel>
        <PanelHead title="修复流程" sub="探测可直接执行；配置修复 / 完整修复需确认" />
        <div className="grid gap-3 p-4">
          {/* Safe: probe — directly executable. */}
          <div className="flex flex-wrap items-center gap-3 rounded-sm border border-line bg-panel-2 p-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-success-soft text-success [&_svg]:size-4">
              <ScanSearch />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="text-base text-ink-strong">轻量探测</strong>
              <p className="text-sm text-muted">
                只读诊断：探测网关可达性并刷新状态，不写入任何配置。
              </p>
            </div>
            <Badge variant="ok">安全</Badge>
            <Button
              variant="primary"
              size="sm"
              onClick={runProbe}
              disabled={pending}
            >
              <ScanSearch />
              {pending && activeAction === "probe" ? "探测中…" : "运行探测"}
            </Button>
          </div>

          {/* Probe result — last reachability from live status. */}
          {activeAction === null && (
            <p className="px-1 text-sm text-muted">
              当前网关：
              <span className="text-ink-strong">{reachabilityLabel(status.probe.gatewayReachable)}</span>
              <span className="text-subtle"> · 最后探测 </span>
              {formatTime(status.probe.checkedAt)}
            </p>
          )}

          {/* Guarded: config-repair + repair. */}
          {(["config-repair", "repair"] as const).map((action) => {
            const meta = GUARDED_ACTIONS[action];
            const MetaIcon = meta.icon;
            return (
              <div
                key={action}
                className="flex flex-wrap items-center gap-3 rounded-sm border border-warning-line bg-warning-soft p-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel text-warning [&_svg]:size-4">
                  <MetaIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="text-base text-ink-strong">{meta.title}</strong>
                  <p className="text-sm text-muted">{meta.blurb}</p>
                </div>
                <Badge variant="warn" className="gap-1">
                  <Lock className="size-3" />
                  需确认
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirm(action)}
                  disabled={pending}
                >
                  {pending && activeAction === action ? "执行中…" : "确认后执行"}
                </Button>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Evidence from the most recent guarded run, or the last repair on record. */}
      <Panel>
        <PanelHead
          title="修复证据"
          sub="实际执行的命令、变更项与备份路径"
          action={
            (lastRepairEvidence ?? status.lastRepair) && (
              <Badge
                variant={(lastRepairEvidence ?? status.lastRepair)!.ok ? "ok" : "bad"}
              >
                {(lastRepairEvidence ?? status.lastRepair)!.ok ? "成功" : "失败"}
              </Badge>
            )
          }
        />
        <div className="p-4">
          {lastRepairEvidence ?? status.lastRepair ? (
            <div className="grid gap-2">
              <p className="text-sm text-muted">
                {(lastRepairEvidence ?? status.lastRepair)!.trigger} ·{" "}
                {formatTime((lastRepairEvidence ?? status.lastRepair)!.finishedAt)}
              </p>
              <CommandEvidence
                commands={(lastRepairEvidence ?? status.lastRepair)!.commands}
                changedKeys={(lastRepairEvidence ?? status.lastRepair)!.changedKeys}
                backupPath={(lastRepairEvidence ?? status.lastRepair)!.backupPath}
              />
            </div>
          ) : (
            <EmptyState
              title="尚无修复记录"
              description="运行探测或确认修复后，这里会展示实际执行的命令证据。"
            />
          )}
        </div>
      </Panel>

      {/* Strong confirmation for the config/service-rewriting actions. */}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-warning-soft text-warning [&_svg]:size-4">
              <DialogIcon />
            </span>
            <DialogTitle>{dialog?.title}</DialogTitle>
          </DialogHeader>
          <DialogBody>{dialog?.confirmCopy}</DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => confirm && runGuarded(confirm)}
              disabled={pending}
            >
              {pending ? "执行中…" : `确认执行${dialog?.title ?? ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
