import * as React from "react";
import {
  Archive,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
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
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import {
  ToneBadge,
  formatTime,
  toneIconClass,
} from "@/features/cli-agents/views/_shared";

import {
  useCreateChatSessionMutation,
  useDeleteChatSessionMutation,
  usePatchChatSessionMutation,
} from "@/lib/query/chat";
import type { ApiError } from "@/lib/api/errors";
import type { ChatSessionOrganizerState, ChatSessionRow } from "../types";
import { runStateTone, sessionTitle, shouldShowRunState } from "../_shared";

type SessionDialogState =
  | { kind: "create" }
  | { kind: "rename"; session: ChatSessionRow }
  | { kind: "archive"; session: ChatSessionRow }
  | { kind: "restore"; session: ChatSessionRow }
  | { kind: "delete"; session: ChatSessionRow }
  | null;

type SessionFilter = "active" | "all" | "managed" | "readonly" | "archived";
type FolderFilter = "all" | "unfiled" | `folder:${string}`;

type ContextMenuState = {
  session: ChatSessionRow;
  x: number;
  y: number;
} | null;

function canManage(session: ChatSessionRow): boolean {
  return (
    session.kind === "tracevane_managed" &&
    session.permissions?.writable === true
  );
}

/** Compact conversation switcher and session management surface. */
export function SessionListView({
  sessions,
  selectedKey,
  isLoading,
  isFetching,
  error,
  organizer,
  onSelect,
  onRefresh,
}: {
  sessions: ChatSessionRow[];
  selectedKey: string | null;
  isLoading: boolean;
  isFetching: boolean;
  error: ApiError | null;
  organizer?: ChatSessionOrganizerState | null;
  onSelect: (key: string) => void;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = React.useState("");
  const [sessionFilter, setSessionFilter] =
    React.useState<SessionFilter>("active");
  const [folderFilter, setFolderFilter] = React.useState<FolderFilter>("all");
  const [dialog, setDialog] = React.useState<SessionDialogState>(null);
  const [labelDraft, setLabelDraft] = React.useState("");
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);

  const createSession = useCreateChatSessionMutation();
  const patchSession = usePatchChatSessionMutation();
  const deleteSession = useDeleteChatSessionMutation();

  React.useEffect(() => {
    if (dialog?.kind === "rename") setLabelDraft(sessionTitle(dialog.session));
    if (dialog?.kind === "create") setLabelDraft("");
  }, [dialog]);

  React.useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const folderOptions = React.useMemo(() => {
    if (!organizer?.folders?.length) return [];
    const byId = new Map(organizer.folders.map((folder) => [folder.id, folder]));
    const pathFor = (folderId: string): string => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let current = byId.get(folderId) ?? null;
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        parts.unshift(current.title);
        current = current.parentId ? byId.get(current.parentId) ?? null : null;
      }
      return parts.join(" / ");
    };
    return organizer.folders
      .map((folder) => ({
        id: folder.id,
        label: pathFor(folder.id) || folder.title,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
  }, [organizer]);

  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const scoped = sessions.filter((s) => {
      if (sessionFilter === "active") return !s.presentation?.archived;
      if (sessionFilter === "managed")
        return canManage(s) && !s.presentation?.archived;
      if (sessionFilter === "readonly")
        return !canManage(s) && !s.presentation?.archived;
      if (sessionFilter === "archived")
        return Boolean(s.presentation?.archived);
      return true;
    });
    const folderScoped = scoped.filter((s) => {
      if (folderFilter === "all") return true;
      const assigned = organizer?.sessionFolderMap?.[s.key] ?? null;
      if (folderFilter === "unfiled") return !assigned;
      return assigned === folderFilter.slice("folder:".length);
    });
    const ordered = [...folderScoped].sort((a, b) => {
      const aArchived = a.presentation?.archived ? 1 : 0;
      const bArchived = b.presentation?.archived ? 1 : 0;
      const aUnknown = a.runtime?.state === "unknown" ? 1 : 0;
      const bUnknown = b.runtime?.state === "unknown" ? 1 : 0;
      const aWritable = a.permissions?.canSend ? 0 : 1;
      const bWritable = b.permissions?.canSend ? 0 : 1;
      return (
        aArchived - bArchived || aUnknown - bUnknown || aWritable - bWritable
      );
    });
    if (!q) return ordered;
    return ordered.filter((s) => {
      const hay = [
        sessionTitle(s),
        s.agentId,
        s.source?.originLabel ?? "",
        s.source?.surface ?? "",
        s.source?.channel ?? "",
        s.lastMessagePreview ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, filter, sessionFilter, folderFilter, organizer]);

  const runCreate = () => {
    createSession.mutate(
      { agentId: "main", payload: { label: labelDraft.trim() || undefined } },
      {
        onSuccess: (res) => {
          toast.success("已新建 Agent 会话");
          setDialog(null);
          onSelect(res.session.key);
        },
        onError: (e) => toast.error("新建会话失败", { description: e.message }),
      },
    );
  };

  const runPatch = (
    session: ChatSessionRow,
    payload: { label?: string; archived?: boolean },
  ) => {
    patchSession.mutate(
      { sessionKey: session.key, payload },
      {
        onSuccess: (res) => {
          toast.success("会话已更新");
          setDialog(null);
          onSelect(res.session.key);
        },
        onError: (e) => toast.error("更新会话失败", { description: e.message }),
      },
    );
  };

  const runDelete = (session: ChatSessionRow) => {
    deleteSession.mutate(session.key, {
      onSuccess: () => {
        toast.success("会话已删除");
        setDialog(null);
        if (selectedKey === session.key) onRefresh();
      },
      onError: (e) => toast.error("删除会话失败", { description: e.message }),
    });
  };

  const busy =
    createSession.isPending ||
    patchSession.isPending ||
    deleteSession.isPending;

  const closeContextMenu = () => setContextMenu(null);

  const openMenuAt = (session: ChatSessionRow, x: number, y: number) => {
    const viewportWidth =
      typeof window === "undefined" ? x + 188 : window.innerWidth;
    const viewportHeight =
      typeof window === "undefined" ? y + 220 : window.innerHeight;
    setContextMenu({
      session,
      x: Math.max(8, Math.min(x, viewportWidth - 188)),
      y: Math.max(8, Math.min(y, viewportHeight - 220)),
    });
  };

  const openMenuFromButton = (
    element: HTMLElement,
    session: ChatSessionRow,
  ) => {
    const rect = element.getBoundingClientRect();
    openMenuAt(session, rect.right - 176, rect.bottom + 6);
  };

  const triggerSessionAction = (
    action: "rename" | "archive" | "restore" | "delete",
    session: ChatSessionRow,
  ) => {
    closeContextMenu();
    setDialog({ kind: action, session });
  };

  const renderMenuItem = ({
    children,
    danger,
    disabled,
    icon,
    onSelect: onItemSelect,
  }: {
    children: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
    icon?: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onItemSelect?.();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-xs px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:shadow-[var(--ring)]",
        danger
          ? "text-red hover:bg-red-soft"
          : "text-ink hover:bg-panel-2 hover:text-ink-strong",
        disabled && "cursor-not-allowed text-subtle hover:bg-transparent",
      )}
    >
      <span className="grid size-4 place-items-center text-current [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <div className="grid gap-2 border-b border-line p-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-md font-semibold text-ink-strong">
              Agent 会话
            </h3>
            <span className="block truncate text-xs text-subtle">
              {sessions.length} 个会话
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog({ kind: "create" })}
          >
            <Plus />
            新建
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            title="刷新会话"
          >
            <RefreshCw className={cn(isFetching && "animate-spin")} />
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索会话 / Agent / 来源"
            className="pl-8"
            aria-label="筛选会话"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["active", "活跃"],
              ["managed", "自管"],
              ["readonly", "只读"],
              ["archived", "归档"],
              ["all", "全部"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSessionFilter(id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs outline-none transition-colors focus-visible:shadow-[var(--ring)]",
                sessionFilter === id
                  ? "bg-primary-soft text-primary"
                  : "bg-panel-2 text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {folderOptions.length > 0 && (
          <label className="grid gap-1 text-2xs text-subtle">
            文件夹筛选
            <select
              value={folderFilter}
              onChange={(event) =>
                setFolderFilter(event.target.value as FolderFilter)
              }
              className="h-8 rounded-sm border border-line bg-panel-2 px-2 text-xs text-ink outline-none transition-[border-color,box-shadow] focus:border-primary-line focus:shadow-[var(--ring)]"
            >
              <option value="all">全部文件夹</option>
              <option value="unfiled">未分组</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={`folder:${folder.id}`}>
                  {folder.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <ErrorState
            title="无法加载会话"
            description={error.message}
            action={
              <Button variant="outline" size="sm" onClick={onRefresh}>
                重试
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<MessageSquare />}
            title={sessions.length === 0 ? "暂无会话" : "无匹配会话"}
            description={
              sessions.length === 0
                ? "点击新建创建一个 Tracevane 自管 Agent 会话。"
                : "调整筛选条件以查看更多会话。"
            }
          />
        ) : (
          <div className="grid gap-px p-1">
            {visible.map((s) => {
              const st = runStateTone(s.runtime?.state);
              const source =
                s.source?.originLabel ||
                s.source?.surface ||
                s.source?.channel ||
                "本地";
              const preview =
                s.lastMessagePreview?.trim() ||
                (s.kind === "observed_external"
                  ? "外部观察会话"
                  : "暂无最近消息");
              const showState = shouldShowRunState(s.runtime?.state);
              const manageable = canManage(s);
              return (
                <div
                  key={s.key}
                  className={cn(
                    "group grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-sm transition-colors hover:bg-panel-2",
                    s.key === selectedKey && "bg-primary-soft",
                  )}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openMenuAt(s, event.clientX, event.clientY);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(s.key)}
                    className="flex min-w-0 items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:shadow-[var(--ring)]"
                  >
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-md [&_svg]:size-4",
                        toneIconClass(showState ? st.tone : "info"),
                      )}
                    >
                      <MessageSquare />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <strong className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-strong">
                          {sessionTitle(s)}
                        </strong>
                        <span className="shrink-0 text-xs text-subtle">
                          {formatTime(s.updatedAt)}
                        </span>
                      </span>
                      <span className="truncate text-xs text-muted">
                        {preview}
                      </span>
                      <span className="truncate text-2xs text-subtle">
                        {s.agentId} · {source}
                        {s.presentation?.archived ? " · 已归档" : ""}
                        {!manageable ? " · 只读" : ""}
                      </span>
                    </span>
                    {showState && (
                      <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={
                      contextMenu?.session.key === s.key ? true : undefined
                    }
                    aria-label={`管理会话 ${sessionTitle(s)}`}
                    title="更多操作"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openMenuFromButton(event.currentTarget, s);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " " ||
                        event.key === "ArrowDown"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        openMenuFromButton(event.currentTarget, s);
                      }
                    }}
                    className="mr-1 grid w-9 place-items-center self-center rounded-sm text-subtle opacity-0 outline-none transition hover:bg-panel hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 focus-visible:shadow-[var(--ring)]"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          role="menu"
          aria-label={`会话操作：${sessionTitle(contextMenu.session)}`}
          className="fixed z-50 grid w-44 gap-0.5 rounded-md border border-line-2 bg-panel p-1 shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {renderMenuItem({
            icon: <MessageSquare />,
            onSelect: () => {
              onSelect(contextMenu.session.key);
              closeContextMenu();
            },
            children: "打开会话",
          })}
          <div className="my-1 h-px bg-line" role="separator" />
          {canManage(contextMenu.session) ? (
            <>
              {renderMenuItem({
                icon: <Pencil />,
                onSelect: () =>
                  triggerSessionAction("rename", contextMenu.session),
                children: "重命名…",
              })}
              {renderMenuItem({
                icon: contextMenu.session.presentation?.archived ? (
                  <Undo2 />
                ) : (
                  <Archive />
                ),
                onSelect: () =>
                  triggerSessionAction(
                    contextMenu.session.presentation?.archived
                      ? "restore"
                      : "archive",
                    contextMenu.session,
                  ),
                children: contextMenu.session.presentation?.archived
                  ? "恢复到活跃"
                  : "归档会话",
              })}
              {renderMenuItem({
                icon: <Trash2 />,
                danger: true,
                onSelect: () =>
                  triggerSessionAction("delete", contextMenu.session),
                children: "删除会话…",
              })}
            </>
          ) : (
            <>
              {renderMenuItem({
                disabled: true,
                icon: <Archive />,
                children: "外部观察会话只读",
              })}
            </>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          {dialog?.kind === "create" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
                  <Plus />
                </span>
                <DialogTitle>新建 Agent 会话</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <label className="grid gap-2 text-sm text-muted">
                  会话名称
                  <Input
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    placeholder="例如：修复网关路由"
                    autoFocus
                  />
                </label>
                <p className="mt-2 text-xs text-subtle">
                  当前使用 main Agent；后续可接入 Agent/模型/目录选择器。
                </p>
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog(null)}
                  disabled={busy}
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={runCreate}
                  disabled={busy}
                >
                  {busy ? "创建中…" : "创建"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "rename" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
                  <Pencil />
                </span>
                <DialogTitle>重命名会话</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <label className="grid gap-2 text-sm text-muted">
                  新名称
                  <Input
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    autoFocus
                  />
                </label>
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog(null)}
                  disabled={busy}
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    runPatch(dialog.session, { label: labelDraft.trim() })
                  }
                  disabled={busy || !labelDraft.trim()}
                >
                  {busy ? "保存中…" : "保存"}
                </Button>
              </DialogFooter>
            </>
          )}

          {(dialog?.kind === "archive" || dialog?.kind === "restore") && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
                  {dialog.kind === "archive" ? <Archive /> : <Undo2 />}
                </span>
                <DialogTitle>
                  {dialog.kind === "archive" ? "归档会话" : "恢复会话"}
                </DialogTitle>
              </DialogHeader>
              <DialogBody>
                {dialog.kind === "archive"
                  ? "归档后会话仍保留，可搜索和恢复，但不会优先显示。"
                  : "恢复后会话会重新进入常规列表。"}
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog(null)}
                  disabled={busy}
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    runPatch(dialog.session, {
                      archived: dialog.kind === "archive",
                    })
                  }
                  disabled={busy}
                >
                  {busy ? "处理中…" : "确认"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "delete" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
                  <Trash2 />
                </span>
                <DialogTitle>删除会话</DialogTitle>
              </DialogHeader>
              <DialogBody>
                删除会移除该 Tracevane
                自管会话及其本地记录，无法恢复。确认删除「
                {sessionTitle(dialog.session)}」？
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog(null)}
                  disabled={busy}
                >
                  取消
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => runDelete(dialog.session)}
                  disabled={busy}
                >
                  {busy ? "删除中…" : "确认删除"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default SessionListView;
