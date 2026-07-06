import * as React from "react";
import { ExternalLink, RefreshCw, Terminal as TerminalIcon, Trash2, X } from "lucide-react";

import type { TerminalSessionDescriptor } from "@/features/cli-agents/types";
import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { getTerminalSessions } from "@/lib/api/terminal";
import { endWorkbenchTerminalSession, flushPendingTerminalKillRetries, getPendingTerminalKillIds, schedulePendingTerminalKillFlush } from "./terminalClient";

export function TerminalManagerDialog({
  open,
  onOpenChange,
  currentRootId,
  currentRootLabel,
  activeTerminalIds,
  visibleTerminalId,
  terminalTitlesById,
  onAttachSession,
  onClosedSessions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRootId: string;
  currentRootLabel?: string | null;
  activeTerminalIds: string[];
  visibleTerminalId?: string | null;
  terminalTitlesById?: Record<string, string>;
  onAttachSession: (session: TerminalSessionDescriptor) => void;
  onClosedSessions?: (sessionIds: string[]) => void;
}) {
  const [sessions, setSessions] = React.useState<TerminalSessionDescriptor[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [closingIds, setClosingIds] = React.useState<Set<string>>(() => new Set());
  const [closeProgress, setCloseProgress] = React.useState<{ done: number; total: number } | null>(null);
  const suppressedSessionIdsRef = React.useRef<Set<string>>(new Set());
  const closingIdsRef = React.useRef<Set<string>>(new Set());
  const activeIdSet = React.useMemo(() => new Set(activeTerminalIds), [activeTerminalIds]);

  const refresh = React.useCallback(async (options: { silent?: boolean } = {}) => {
    const silent = Boolean(options.silent);
    if (!silent) setLoading(true);
    try {
      if (silent) {
        schedulePendingTerminalKillFlush(1_000);
      } else {
        await flushPendingTerminalKillRetries();
      }
      const payload = await getTerminalSessions({ manageableOnly: true });
      const pendingKillIds = getPendingTerminalKillIds();
      setSessions((payload.sessions ?? []).filter((session) => (
        isManageableSession(session) &&
        !suppressedSessionIdsRef.current.has(session.sessionId) &&
        !pendingKillIds.has(session.sessionId)
      )));
    } catch (error) {
      if (!silent) {
        toast.error("读取终端列表失败", { description: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onOpenChange, open]);

  const closeSessions = React.useCallback(async (targetSessions: TerminalSessionDescriptor[], label: string) => {
    const targets = uniqueSessions(targetSessions.filter((session) => (
      isManageableSession(session) && !closingIdsRef.current.has(session.sessionId)
    )));
    if (!targets.length) return;
    const targetIds = targets.map((session) => session.sessionId);
    const targetIdSet = new Set(targetIds);
    for (const sessionId of targetIds) {
      suppressedSessionIdsRef.current.add(sessionId);
      closingIdsRef.current.add(sessionId);
    }
    setClosingIds((current) => new Set([...current, ...targetIds]));
    setCloseProgress({ done: 0, total: targets.length });
    // Optimistically hide sessions as soon as close is requested. The backend
    // still performs real kill/retry; a silent refresh later reconciles anything
    // that genuinely survived. This avoids the misleading "closed but still in
    // list" feeling on slow PTY/tmux teardown.
    setSessions((current) => current.filter((session) => !targetIdSet.has(session.sessionId)));
    // Apply the same forced-close intent to the visible Panel layout immediately.
    // Waiting for PTY/tmux teardown makes an attached terminal look alive even
    // though the user already requested a force close from the manager.
    onClosedSessions?.(targetIds);

    const results = await runWithConcurrency(targets, 6, async (session) => {
      try {
        await endWorkbenchTerminalSession(session.sessionId, { attempts: 2, retryDelayMs: 250, queueOnFailure: true });
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error };
      } finally {
        setCloseProgress((current) => current ? { ...current, done: Math.min(current.total, current.done + 1) } : current);
      }
    });

    const failed = results.filter((result) => !result.ok).length;
    if (failed) {
      toast.warning(`${label}：已从列表隐藏，后台继续清理`, {
        description: `${failed}/${targets.length} 个终端会话未即时确认关闭，已加入持久重试队列。`,
      });
    } else {
      toast.success(`${label}已关闭`, { description: `${targets.length} 个终端会话` });
    }
    setClosingIds((current) => {
      const next = new Set(current);
      for (const session of targets) {
        closingIdsRef.current.delete(session.sessionId);
        next.delete(session.sessionId);
      }
      return next;
    });
    setCloseProgress(null);
    window.setTimeout(() => {
      void refresh({ silent: true });
    }, 750);
    window.setTimeout(() => {
      for (const sessionId of targetIds) {
        suppressedSessionIdsRef.current.delete(sessionId);
      }
      void refresh({ silent: true });
    }, 15_000);
  }, [onClosedSessions, refresh]);

  const groups = React.useMemo(() => groupSessions(sessions, currentRootId), [currentRootId, sessions]);
  const detachedSessions = sessions.filter((session) => session.status === "detached" && !activeIdSet.has(session.sessionId));
  const otherWorkspaceSessions = sessions.filter((session) => normalizeRootId(session) !== currentRootId);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(8,12,22,.5)] p-3 backdrop-blur-[3px]"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      data-ide-terminal-manager-overlay
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ide-terminal-manager-title"
        className="relative grid max-h-[92vh] w-[min(920px,96vw)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-line-2 bg-panel shadow-lg"
        data-ide-terminal-manager-dialog
      >
        <button
          type="button"
          className="absolute right-4 top-4 grid size-7 place-items-center rounded-sm text-subtle outline-none transition-colors hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)]"
          onClick={() => onOpenChange(false)}
          aria-label="关闭终端管理器"
        >
          <X className="size-4" />
        </button>
        <header className="flex items-start gap-[11px] px-5 pb-0 pt-[18px] pr-12">
          <div className="grid size-9 place-items-center rounded-md bg-primary-soft text-primary">
            <TerminalIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 id="ide-terminal-manager-title" className="text-lg font-semibold text-ink-strong">终端管理器</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              管理所有仍在运行、已分离且可恢复的终端。当前工作区可恢复到面板；其它工作区只允许跳转或关闭，避免破坏工作区目录隔离。
            </p>
          </div>
        </header>
        <div className="min-h-0 space-y-3 overflow-hidden px-5 pb-1 pt-3 text-sm text-muted">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel-2 p-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || closingIds.size > 0} data-ide-terminal-manager-refresh>
              <RefreshCw className={cn(loading && "animate-spin")} />
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!detachedSessions.length || closingIds.size > 0}
              onClick={() => void closeSessions(detachedSessions, "已分离终端")}
              data-ide-terminal-manager-close-detached
            >
              <Trash2 />
              关闭已分离
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!otherWorkspaceSessions.length || closingIds.size > 0}
              onClick={() => void closeSessions(otherWorkspaceSessions, "其它工作区终端")}
              data-ide-terminal-manager-close-other-workspaces
            >
              <Trash2 />
              关闭其它工作区
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!sessions.length || closingIds.size > 0}
              onClick={() => void closeSessions(sessions, "全部终端")}
              data-ide-terminal-manager-close-all
            >
              <Trash2 />
              关闭全部终端
            </Button>
            <span className="ml-auto text-xs text-muted" data-ide-terminal-manager-count>
              {closeProgress
                ? `正在关闭 ${closeProgress.done}/${closeProgress.total} · 已先从列表隐藏`
                : `${sessions.length} 个活跃/可恢复终端 · 当前：${currentRootLabel || currentRootId || "未选择"}`}
            </span>
          </div>

          <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            {loading && !sessions.length ? (
              <div className="rounded-md border border-line bg-panel-2 p-4 text-center text-muted">正在加载终端列表…</div>
            ) : null}
            {!loading && !sessions.length ? (
              <div className="rounded-md border border-dashed border-line bg-canvas p-6 text-center text-muted" data-ide-terminal-manager-empty>
                <div>没有仍在运行或可恢复的终端。终端管理器不会自动创建终端；需要新终端时请回到面板点击“新建终端”。</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => onOpenChange(false)}
                  data-ide-terminal-manager-empty-back
                >
                  返回面板新建
                </Button>
              </div>
            ) : null}
            {groups.map((group) => (
              <section key={group.key} className="rounded-md border border-line bg-panel" data-ide-terminal-manager-group={group.key}>
                <header className="flex min-h-9 items-center gap-2 border-b border-line bg-panel-2 px-3">
                  <div className="font-medium text-ink-strong">{group.title}</div>
                  <span className="rounded bg-panel px-1.5 py-0.5 font-mono text-2xs text-muted">{group.sessions.length}</span>
                </header>
                <div className="divide-y divide-line">
                  {group.sessions.map((session) => {
                    const sameWorkspace = normalizeRootId(session) === currentRootId;
                    const attached = activeIdSet.has(session.sessionId);
                    const visible = visibleTerminalId === session.sessionId;
                    const closing = closingIds.has(session.sessionId);
                    const displayTitle = terminalTitlesById?.[session.sessionId] || session.title || session.sessionId;
                    return (
                      <article key={session.sessionId} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]" data-ide-terminal-manager-session={session.sessionId}>
                        <div className="min-w-0 space-y-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-ink-strong">{displayTitle}</span>
                            <StatusBadge status={session.status} />
                            {visible ? (
                              <span className="rounded bg-primary-soft px-1.5 py-0.5 text-2xs text-primary">当前显示</span>
                            ) : attached ? (
                              <span className="rounded bg-panel-3 px-1.5 py-0.5 text-2xs text-muted">在当前布局</span>
                            ) : null}
                            {session.durableBackend ? <span className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-2xs text-muted">{session.durableBackend}</span> : null}
                          </div>
                          <div className="grid gap-1 font-mono text-2xs text-muted md:grid-cols-2">
                            <span className="truncate" title={session.sessionId}>会话 ID：{session.sessionId}</span>
                            <span className="truncate" title={formatWorkspaceTitle(session)}>工作区：{formatWorkspaceLabel(session)}</span>
                            <span className="truncate" title={formatCwdTitle(session.cwd)}>目录：{formatCwd(session.cwd)}</span>
                            <span className="truncate">终端配置：{session.shell || "bash"} · 更新：{formatTime(session.updatedAt)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {sameWorkspace ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!session.canResume || attached}
                              onClick={() => onAttachSession(session)}
                              data-ide-terminal-manager-attach={session.sessionId}
                            >
                              恢复到面板
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigateToWorkspace(normalizeRootId(session))}
                              data-ide-terminal-manager-open-workspace={normalizeRootId(session)}
                            >
                              <ExternalLink />
                              跳转工作区
                            </Button>
                          )}
                          <Button
                            variant={attached ? "outline" : "ghost"}
                            size="sm"
                            disabled={closing}
                            title={attached ? "关闭会结束当前面板布局中的终端会话" : "关闭终端会话"}
                            onClick={() => void closeSessions([session], attached ? "当前布局终端" : "终端")}
                            data-ide-terminal-manager-close={session.sessionId}
                          >
                            {closing ? <RefreshCw className="animate-spin" /> : <X />}
                            {attached ? "强制关闭" : "关闭"}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
        <footer className="flex justify-end gap-[10px] px-5 pb-5 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>完成</Button>
        </footer>
      </section>
    </div>
  );
}

function isManageableSession(session: TerminalSessionDescriptor): boolean {
  return Boolean(session.sessionId && session.canResume && (session.status === "running" || session.status === "detached"));
}

function normalizeRootId(session: TerminalSessionDescriptor): string {
  const value = (session as TerminalSessionDescriptor & { rootId?: string | null; workspaceId?: string | null }).rootId
    || (session as TerminalSessionDescriptor & { rootId?: string | null; workspaceId?: string | null }).workspaceId
    || "";
  return String(value || "").trim();
}

function formatWorkspaceLabel(session: TerminalSessionDescriptor): string {
  return normalizeRootId(session) || "未知工作区";
}

function formatWorkspaceTitle(session: TerminalSessionDescriptor): string {
  return normalizeRootId(session) || "终端会话缺少工作区标记";
}

function uniqueSessions(sessions: TerminalSessionDescriptor[]): TerminalSessionDescriptor[] {
  const byId = new Map<string, TerminalSessionDescriptor>();
  for (const session of sessions) byId.set(session.sessionId, session);
  return Array.from(byId.values());
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

function groupSessions(sessions: TerminalSessionDescriptor[], currentRootId: string): Array<{ key: string; title: string; sessions: TerminalSessionDescriptor[] }> {
  const current = sessions.filter((session) => normalizeRootId(session) === currentRootId);
  const other = sessions.filter((session) => normalizeRootId(session) !== currentRootId);
  const otherByRoot = new Map<string, TerminalSessionDescriptor[]>();
  for (const session of other) {
    const key = normalizeRootId(session) || "unknown";
    otherByRoot.set(key, [...(otherByRoot.get(key) ?? []), session]);
  }
  return [
    ...(current.length ? [{ key: "current", title: "当前工作区", sessions: current }] : []),
    ...Array.from(otherByRoot.entries()).map(([rootId, group]) => ({
      key: `workspace:${rootId}`,
      title: rootId === "unknown" ? "未标记工作区" : `其它工作区 · ${rootId}`,
      sessions: group,
    })),
  ];
}

function StatusBadge({ status }: { status: TerminalSessionDescriptor["status"] }) {
  const tone = status === "running" ? "bg-green-soft text-green" : "bg-amber-soft text-amber";
  return <span className={cn("rounded px-1.5 py-0.5 text-2xs", tone)}>{formatStatus(status)}</span>;
}

function formatStatus(status: TerminalSessionDescriptor["status"]): string {
  if (status === "running") return "运行中";
  if (status === "detached") return "已分离";
  return status || "未知";
}

function formatCwd(value: string | null | undefined): string {
  const cwd = normalizeCwd(value);
  if (!cwd || cwd === "." || cwd === "/") return "工作区根目录";
  return cwd;
}

function formatCwdTitle(value: string | null | undefined): string {
  const cwd = normalizeCwd(value);
  if (!cwd || cwd === "." || cwd === "/") return "终端会从当前工作区根目录恢复";
  return cwd;
}

function normalizeCwd(value: string | null | undefined): string {
  return String(value || "").trim().replace(/\\/g, "/");
}

function formatTime(value: string | null | undefined): string {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "未知时间";
  return new Date(timestamp).toLocaleString();
}

function navigateToWorkspace(rootId: string): void {
  if (!rootId) return;
  window.location.hash = `#/ide/${encodeURIComponent(rootId)}`;
}
