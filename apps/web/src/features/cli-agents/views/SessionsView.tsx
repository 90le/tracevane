import * as React from "react";
import {
  AlertTriangle,
  ClipboardCopy,
  Play,
  RefreshCw,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
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
import { SkeletonRow } from "@/shared/states/Skeleton";
import { toast } from "@/design/ui/sonner";

import { useTerminalStatusQuery } from "@/lib/query/dashboard";
import {
  useDeleteTerminalSessionMutation,
  useEndTerminalSessionMutation,
  useLaunchTerminalMutation,
  useTerminalSessionsQuery,
} from "@/lib/query/terminal";
import type {
  TerminalLaunchCli,
  TerminalLaunchResponse,
  TerminalSessionDescriptor,
} from "../types";

import type { CliAgentsViewProps } from "../types";
import {
  Panel,
  PanelHead,
  Row,
  ToneBadge,
  formatTime,
  terminalStatusTone,
  toneIconClass,
} from "./_shared";

const LAUNCHABLE_CLIS: ReadonlyArray<{ id: TerminalLaunchCli; label: string }> = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "opencode", label: "OpenCode" },
  { id: "bash", label: "Bash" },
];

/** Launch dialog — resolves a CLI launch command (write) and shows it as evidence. */
function LaunchDialog({
  open,
  onClose,
  installedClis,
}: {
  open: boolean;
  onClose: () => void;
  installedClis: Set<string>;
}) {
  const launch = useLaunchTerminalMutation();
  const [cli, setCli] = React.useState<TerminalLaunchCli>("claude");
  const [evidence, setEvidence] = React.useState<TerminalLaunchResponse | null>(null);

  React.useEffect(() => {
    if (!open) {
      setEvidence(null);
      launch.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = () => {
    launch.mutate(
      { cli },
      {
        onSuccess: (result) => {
          setEvidence(result);
          toast.success("已解析启动命令", { description: result.label });
        },
        onError: (error) => toast.error("启动命令解析失败", { description: error.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
            <Play />
          </span>
          <DialogTitle>启动终端会话</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted">
            解析所选 CLI 的启动命令。该命令将在持久终端中运行，请确认后执行。
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {LAUNCHABLE_CLIS.map(({ id, label }) => {
              const missing = id !== "bash" && !installedClis.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCli(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-sm outline-none transition-colors focus-visible:shadow-[var(--ring)]",
                    cli === id
                      ? "border-primary-line bg-primary-soft text-ink-strong"
                      : "border-line bg-panel-2 text-muted hover:bg-panel-3",
                  )}
                >
                  {label}
                  {missing && <span className="text-xs text-amber">(未安装)</span>}
                </button>
              );
            })}
          </div>

          {evidence && (
            <div className="mt-3 grid gap-1 rounded-sm border border-line bg-panel-2 p-3">
              <div className="flex items-center gap-2">
                <Badge variant="ok">已解析</Badge>
                <span className="truncate text-sm text-ink-strong">{evidence.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    void navigator.clipboard?.writeText(evidence.command);
                    toast.success("已复制命令");
                  }}
                >
                  <ClipboardCopy />
                  复制
                </Button>
              </div>
              <code className="block max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-panel-3 px-2 py-1 font-mono text-xs text-muted">
                {evidence.command}
              </code>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={launch.isPending}>
            关闭
          </Button>
          <Button variant="primary" size="sm" onClick={run} disabled={launch.isPending}>
            {launch.isPending ? "解析中…" : "解析启动命令"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ConfirmAction =
  | { kind: "end"; session: TerminalSessionDescriptor }
  | { kind: "delete"; session: TerminalSessionDescriptor };

/**
 * Persisted terminal sessions roster + the workbench write surface. Launching a
 * session (resolve command), ending a live session, and deleting a persisted
 * session are all dangerous writes guarded by confirmation, with evidence +
 * toast on completion. Mirrors the gateway daemon-panel write pattern.
 */
export function SessionsView(_props: CliAgentsViewProps) {
  const sessions = useTerminalSessionsQuery();
  const terminalStatus = useTerminalStatusQuery();
  const endMutation = useEndTerminalSessionMutation();
  const deleteMutation = useDeleteTerminalSessionMutation();

  const [launchOpen, setLaunchOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<ConfirmAction | null>(null);
  const [evidence, setEvidence] = React.useState<{
    tone: "ok" | "bad";
    title: string;
    detail: string;
  } | null>(null);

  const rows = sessions.data?.sessions ?? [];
  const installedClis = new Set(
    (terminalStatus.data?.binaries ?? []).filter((b) => b.installed).map((b) => b.id),
  );
  const pending = endMutation.isPending || deleteMutation.isPending;

  const runEnd = (session: TerminalSessionDescriptor) => {
    endMutation.mutate(
      { sid: session.sessionId },
      {
        onSuccess: (result) => {
          setEvidence({
            tone: result.ended ? "ok" : "bad",
            title: result.ended ? "会话已结束" : "会话未结束",
            detail: `sid ${result.sid} · ended=${result.ended}`,
          });
          if (result.ended) {
            toast.success("已结束终端会话", { description: result.sid });
          } else {
            toast.error("会话未结束", { description: result.sid });
          }
        },
        onError: (error) => toast.error("结束会话失败", { description: error.message }),
        onSettled: () => setConfirm(null),
      },
    );
  };

  const runDelete = (session: TerminalSessionDescriptor) => {
    deleteMutation.mutate(session.sessionId, {
      onSuccess: (result) => {
        setEvidence({
          tone: result.success ? "ok" : "bad",
          title: result.success ? "会话已删除" : "会话未删除",
          detail: result.success
            ? `已删除 ${session.sessionId}`
            : `原因：${result.reason ?? "未知"}`,
        });
        if (result.success) {
          toast.success("已删除终端会话", { description: session.sessionId });
        } else {
          toast.error("删除失败", { description: result.reason ?? "未知原因" });
        }
      },
      onError: (error) =>
        toast.error("删除会话失败", {
          description:
            error.status === 409
              ? "会话仍活跃，需先结束再删除。"
              : error.message,
        }),
      onSettled: () => setConfirm(null),
    });
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="终端会话"
          sub={`${rows.length} 个持久会话 · 启动 / 结束 / 删除需确认`}
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void sessions.refetch()}>
                <RefreshCw className={cn(sessions.isFetching && "animate-spin")} />
                刷新
              </Button>
              <Button variant="primary" size="sm" onClick={() => setLaunchOpen(true)}>
                <Play />
                启动会话
              </Button>
            </div>
          }
        />

        {/* Last action evidence */}
        {evidence && (
          <div className="grid gap-1 border-b border-line bg-panel-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge variant={evidence.tone}>{evidence.tone === "ok" ? "成功" : "失败"}</Badge>
              <span className="text-sm text-ink-strong">{evidence.title}</span>
            </div>
            <code className="block rounded-sm bg-panel-3 px-2 py-1 font-mono text-xs text-muted">
              {evidence.detail}
            </code>
          </div>
        )}

        <div className="grid gap-0.5 p-1">
          {sessions.isLoading ? (
            <div className="p-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : sessions.error ? (
            <ErrorState
              title="无法加载终端会话"
              description={sessions.error.message}
              action={
                <Button variant="outline" size="sm" onClick={() => void sessions.refetch()}>
                  重试
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="暂无终端会话"
              description="点击“启动会话”解析一个 CLI 启动命令。"
              action={
                <Button variant="primary" size="sm" onClick={() => setLaunchOpen(true)}>
                  <Play />
                  启动会话
                </Button>
              }
            />
          ) : (
            rows.map((s) => {
              const st = terminalStatusTone(s.status);
              const live = s.status === "running" || s.status === "detached";
              return (
                <Row
                  key={s.sessionId}
                  icon={<SquareTerminal />}
                  iconClass={toneIconClass(st.tone)}
                  title={s.title || s.sessionId}
                  subtitle={`${s.cwd ?? "—"} · ${s.source} · ${formatTime(s.lastActiveAt)}`}
                  trailing={
                    <>
                      <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                      {live ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red hover:bg-red-soft"
                          disabled={pending}
                          onClick={() => setConfirm({ kind: "end", session: s })}
                        >
                          <X />
                          结束
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red hover:bg-red-soft"
                          disabled={pending}
                          onClick={() => setConfirm({ kind: "delete", session: s })}
                        >
                          <Trash2 />
                          删除
                        </Button>
                      )}
                    </>
                  }
                />
              );
            })
          )}
        </div>
      </Panel>

      <LaunchDialog
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        installedClis={installedClis}
      />

      {/* End confirmation */}
      <Dialog
        open={confirm?.kind === "end"}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <AlertTriangle />
            </span>
            <DialogTitle>结束终端会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            结束会话会终止其底层 PTY 进程，未保存的运行状态将丢失。确认结束
            <code className="mx-1 rounded-sm bg-panel-3 px-1 py-0.5 font-mono text-xs">
              {confirm?.kind === "end" ? confirm.session.title || confirm.session.sessionId : ""}
            </code>
            ？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => confirm?.kind === "end" && runEnd(confirm.session)}
            >
              {endMutation.isPending ? "结束中…" : "确认结束"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={confirm?.kind === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <Trash2 />
            </span>
            <DialogTitle>删除终端会话</DialogTitle>
          </DialogHeader>
          <DialogBody>
            删除会移除该会话的持久记录与回放账本，不可恢复。确认删除
            <code className="mx-1 rounded-sm bg-panel-3 px-1 py-0.5 font-mono text-xs">
              {confirm?.kind === "delete"
                ? confirm.session.title || confirm.session.sessionId
                : ""}
            </code>
            ？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => confirm?.kind === "delete" && runDelete(confirm.session)}
            >
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SessionsView;
