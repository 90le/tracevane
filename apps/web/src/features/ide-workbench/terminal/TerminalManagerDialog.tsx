import * as React from "react";
import { ExternalLink, RefreshCw, Terminal as TerminalIcon, Trash2, X } from "lucide-react";

import type { TerminalSessionDescriptor } from "@/features/cli-agents/types";
import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { getTerminalSessions } from "@/lib/api/terminal";
import { endWorkbenchTerminalSession } from "./terminalClient";

export function TerminalManagerDialog({
  open,
  onOpenChange,
  currentRootId,
  currentRootLabel,
  activeTerminalIds,
  onAttachSession,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRootId: string;
  currentRootLabel?: string | null;
  activeTerminalIds: string[];
  onAttachSession: (session: TerminalSessionDescriptor) => void;
}) {
  const [sessions, setSessions] = React.useState<TerminalSessionDescriptor[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [closingIds, setClosingIds] = React.useState<Set<string>>(() => new Set());
  const [closeProgress, setCloseProgress] = React.useState<{ done: number; total: number } | null>(null);
  const suppressedSessionIdsRef = React.useRef<Set<string>>(new Set());
  const activeIdSet = React.useMemo(() => new Set(activeTerminalIds), [activeTerminalIds]);

  const refresh = React.useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const payload = await getTerminalSessions();
      setSessions((payload.sessions ?? []).filter((session) => (
        isManageableSession(session) &&
        !suppressedSessionIdsRef.current.has(session.sessionId)
      )));
    } catch (error) {
      if (!options.silent) {
        toast.error("读取终端列表失败", { description: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const closeSessions = React.useCallback(async (targetSessions: TerminalSessionDescriptor[], label: string) => {
    const targets = uniqueSessions(targetSessions.filter(isManageableSession));
    if (!targets.length) return;
    const targetIds = targets.map((session) => session.sessionId);
    for (const sessionId of targetIds) {
      suppressedSessionIdsRef.current.add(sessionId);
    }
    setClosingIds((current) => new Set([...current, ...targetIds]));
    setCloseProgress({ done: 0, total: targets.length });
    // Optimistically hide sessions as soon as close is requested. The backend
    // still performs real kill/retry; a silent refresh later reconciles anything
    // that genuinely survived. This avoids the misleading "closed but still in
    // list" feeling on slow PTY/tmux teardown.
    setSessions((current) => current.filter((session) => !targetIds.includes(session.sessionId)));

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
        description: `${failed}/${targets.length} 个 session 未即时确认 kill，已加入持久重试队列。`,
      });
    } else {
      toast.success(`${label}已关闭`, { description: `${targets.length} 个终端 session` });
    }
    setClosingIds((current) => {
      const next = new Set(current);
      for (const session of targets) next.delete(session.sessionId);
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
  }, [refresh]);

  const groups = React.useMemo(() => groupSessions(sessions, currentRootId), [currentRootId, sessions]);
  const detachedSessions = sessions.filter((session) => session.status === "detached");
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
              管理所有仍 running/detached/canResume 的终端。当前工作区可恢复到 Panel；其它工作区只允许跳转或关闭，避免破坏 root/cwd 隔离。
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
              onClick={() => void closeSessions(detachedSessions, "Detached 终端")}
              data-ide-terminal-manager-close-detached
            >
              <Trash2 />
              关闭 detached
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
                没有仍在运行或可恢复的终端。
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
                    const closing = closingIds.has(session.sessionId);
                    return (
                      <article key={session.sessionId} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]" data-ide-terminal-manager-session={session.sessionId}>
                        <div className="min-w-0 space-y-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-ink-strong">{session.title || session.sessionId}</span>
                            <StatusBadge status={session.status} />
                            {attached ? <span className="rounded bg-primary-soft px-1.5 py-0.5 text-2xs text-primary">已在当前 Panel</span> : null}
                            {session.durableBackend ? <span className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-2xs text-muted">{session.durableBackend}</span> : null}
                          </div>
                          <div className="grid gap-1 font-mono text-2xs text-muted md:grid-cols-2">
                            <span className="truncate" title={session.sessionId}>id: {session.sessionId}</span>
                            <span className="truncate" title={normalizeRootId(session) || "unknown"}>workspace: {normalizeRootId(session) || "unknown"}</span>
                            <span className="truncate" title={session.cwd || ""}>cwd: {formatCwd(session.cwd)}</span>
                            <span className="truncate">shell: {session.shell || "bash"} · updated: {formatTime(session.updatedAt)}</span>
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
                              恢复到 Panel
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
                            variant="ghost"
                            size="sm"
                            disabled={closing}
                            onClick={() => void closeSessions([session], "终端")}
                            data-ide-terminal-manager-close={session.sessionId}
                          >
                            {closing ? <RefreshCw className="animate-spin" /> : <X />}
                            关闭
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
  return <span className={cn("rounded px-1.5 py-0.5 text-2xs", tone)}>{status}</span>;
}

function formatCwd(value: string | null | undefined): string {
  return String(value || "/");
}

function formatTime(value: string | null | undefined): string {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "unknown";
  return new Date(timestamp).toLocaleString();
}

function navigateToWorkspace(rootId: string): void {
  if (!rootId) return;
  window.location.hash = `#/ide/${encodeURIComponent(rootId)}`;
}
