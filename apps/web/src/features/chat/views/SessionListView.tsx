import * as React from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsUp,
  CornerUpLeft,
  Folder,
  FolderInput,
  FolderPlus,
  MessageSquare,
  MonitorCog,
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
  useAssignChatSessionsToFolderMutation,
  useCreateChatOrganizerFolderMutation,
  useCreateChatSessionMutation,
  useDeleteChatOrganizerFolderMutation,
  useDeleteChatSessionMutation,
  usePatchChatOrganizerFolderMutation,
  usePatchChatSessionMutation,
} from "@/lib/query/chat";
import { useModelGatewayModelsQuery } from "@/lib/query/model-gateway";
import { useTerminalStatusQuery } from "@/lib/query/dashboard";
import type { ApiError } from "@/lib/api/errors";
import type { TerminalBinaryStatus } from "../../cli-agents/types";
import type {
  ChatSessionFolder,
  ChatSessionFolderMove,
  ChatSessionOrganizerState,
  ChatRuntimeAdapterKind,
  ChatRuntimeAgentId,
  ChatRuntimePermissionMode,
  ChatSessionRow,
} from "../types";
import {
  runStateTone,
  runtimeAgentLabel,
  sessionSourceLabel,
  sessionTitle,
  shouldShowRunState,
} from "../_shared";

type SessionDialogState =
  | { kind: "create" }
  | { kind: "rename"; session: ChatSessionRow }
  | { kind: "archive"; session: ChatSessionRow }
  | { kind: "restore"; session: ChatSessionRow }
  | { kind: "delete"; session: ChatSessionRow }
  | { kind: "move-session"; session: ChatSessionRow }
  | { kind: "edit-runtime"; session: ChatSessionRow }
  | { kind: "create-folder"; parentId: string | null }
  | { kind: "rename-folder"; folder: ChatSessionFolder }
  | { kind: "delete-folder"; folder: ChatSessionFolder }
  | { kind: "move-folder"; folder: ChatSessionFolder }
  | null;

type SessionFilter = "all" | "managed" | "readonly" | "archived";
type FolderFilter = "all" | "unfiled" | `folder:${string}`;

type ContextMenuState =
  | { kind: "session"; session: ChatSessionRow; x: number; y: number }
  | { kind: "folder"; folder: ChatSessionFolder; x: number; y: number }
  | { kind: "blank"; x: number; y: number }
  | null;

type ChatRuntimeAgentOption = {
  adapterKind: ChatRuntimeAdapterKind;
  agent: ChatRuntimeAgentId;
  binaryId: TerminalBinaryStatus["id"] | null;
  label: string;
  description: string;
};

type FolderOption = {
  id: string;
  folder: ChatSessionFolder;
  label: string;
  depth: number;
  sessionCount: number;
  totalSessionCount: number;
  children: FolderOption[];
};


const DEFAULT_RUNTIME_AGENT: ChatRuntimeAgentId = "codex";

const CHAT_RUNTIME_AGENT_OPTIONS: ChatRuntimeAgentOption[] = [
  { adapterKind: "native-cli", agent: "codex", binaryId: "codex", label: "Codex CLI", description: "本地 Codex 会话，使用模型网关与当前工作区" },
  { adapterKind: "native-cli", agent: "claude-code", binaryId: "claude", label: "Claude Code", description: "本地 Claude Code 会话，适合代码库任务" },
  { adapterKind: "native-cli", agent: "opencode", binaryId: "opencode", label: "OpenCode", description: "本地 OpenCode 会话，适合开源 CLI 工作流" },
  { adapterKind: "openclaw-gateway", agent: "openclaw", binaryId: null, label: "OpenClaw 平台 Agent", description: "兼容 OpenClaw 平台原生 Agent 会话" },
];

const CHAT_RUNTIME_PERMISSION_OPTIONS: Array<{ value: ChatRuntimePermissionMode | ""; label: string }> = [
  { value: "", label: "使用运行器默认" },
  { value: "read-only", label: "只读" },
  { value: "auto-edit", label: "自动编辑" },
  { value: "yolo", label: "Yolo / 全自动" },
  { value: "plan", label: "计划模式" },
];

function canManage(session: ChatSessionRow): boolean {
  const permissions = session.permissions;
  return (
    session.kind === "tracevane_managed" &&
    permissions?.visibleInFrontend !== false &&
    (permissions?.writable === true ||
      permissions?.canSend === true ||
      permissions?.canDelete === true ||
      permissions?.canReset === true)
  );
}

function sessionScopeLabel(filter: FolderFilter, folderName: string): string {
  if (filter === "all") return "全部可管理会话";
  if (filter === "unfiled") return "未分组";
  return folderName;
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
    React.useState<SessionFilter>("managed");
  const [folderFilter, setFolderFilter] = React.useState<FolderFilter>("all");
  const [dialog, setDialog] = React.useState<SessionDialogState>(null);
  const [labelDraft, setLabelDraft] = React.useState("");
  const [runtimeAgent, setRuntimeAgent] = React.useState<ChatRuntimeAgentId>(DEFAULT_RUNTIME_AGENT);
  const [runtimeModel, setRuntimeModel] = React.useState("");
  const [runtimeWorkDir, setRuntimeWorkDir] = React.useState("");
  const [runtimePermissionMode, setRuntimePermissionMode] = React.useState<ChatRuntimePermissionMode | "">("");
  const [folderDraft, setFolderDraft] = React.useState("");
  const [folderTargetId, setFolderTargetId] = React.useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);

  const createSession = useCreateChatSessionMutation();
  const patchSession = usePatchChatSessionMutation();
  const deleteSession = useDeleteChatSessionMutation();
  const createFolder = useCreateChatOrganizerFolderMutation();
  const patchFolder = usePatchChatOrganizerFolderMutation();
  const deleteFolder = useDeleteChatOrganizerFolderMutation();
  const assignSessionToFolder = useAssignChatSessionsToFolderMutation();
  const modelCatalog = useModelGatewayModelsQuery({ staleTime: 30_000 });
  const terminalStatus = useTerminalStatusQuery({ staleTime: 30_000, retry: false });

  React.useEffect(() => {
    if (dialog?.kind === "rename") setLabelDraft(sessionTitle(dialog.session));
    if (dialog?.kind === "create") {
      setLabelDraft("");
      setRuntimeAgent(DEFAULT_RUNTIME_AGENT);
      setRuntimeModel("");
      setRuntimeWorkDir("");
      setRuntimePermissionMode("");
    }
    if (dialog?.kind === "edit-runtime") {
      setRuntimeAgent(dialog.session.runtimeTarget?.agent || DEFAULT_RUNTIME_AGENT);
      setRuntimeModel(dialog.session.runtimeTarget?.model || "");
      setRuntimeWorkDir(dialog.session.runtimeTarget?.workDir || "");
      setRuntimePermissionMode(dialog.session.runtimeTarget?.permissionMode || "");
    }
    if (dialog?.kind === "create-folder") {
      setFolderDraft("");
      setFolderTargetId(dialog.parentId);
    }
    if (dialog?.kind === "rename-folder") {
      setFolderDraft(dialog.folder.title);
      setFolderTargetId(dialog.folder.parentId);
    }
    if (dialog?.kind === "move-session") {
      setFolderTargetId(organizer?.sessionFolderMap?.[dialog.session.key] ?? null);
    }
    if (dialog?.kind === "move-folder") {
      setFolderTargetId(dialog.folder.parentId);
    }
  }, [dialog, organizer]);

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

  const folderOptions = React.useMemo<FolderOption[]>(() => {
    if (!organizer?.folders?.length) return [];
    const byId = new Map(organizer.folders.map((folder) => [folder.id, folder]));
    const directCounts = new Map<string, number>();
    for (const folderId of Object.values(organizer.sessionFolderMap || {})) {
      if (!folderId) continue;
      directCounts.set(folderId, (directCounts.get(folderId) ?? 0) + 1);
    }
    const childIdsByParent = new Map<string | null, string[]>();
    for (const folder of organizer.folders) {
      const parent = folder.parentId ?? null;
      childIdsByParent.set(parent, [
        ...(childIdsByParent.get(parent) ?? []),
        folder.id,
      ]);
    }
    const pathFor = (folderId: string): { label: string; depth: number } => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let current = byId.get(folderId) ?? null;
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        parts.unshift(current.title);
        current = current.parentId ? byId.get(current.parentId) ?? null : null;
      }
      return { label: parts.join(" / "), depth: Math.max(0, parts.length - 1) };
    };
    const optionById = new Map<string, FolderOption>();
    for (const folder of organizer.folders) {
      const path = pathFor(folder.id);
      optionById.set(folder.id, {
        id: folder.id,
        folder,
        label: path.label || folder.title,
        depth: path.depth,
        sessionCount: directCounts.get(folder.id) ?? 0,
        totalSessionCount: directCounts.get(folder.id) ?? 0,
        children: [],
      });
    }
    const computeTotal = (folderId: string): number => {
      const option = optionById.get(folderId);
      if (!option) return 0;
      const childIds = childIdsByParent.get(folderId) ?? [];
      option.children = childIds
        .map((id) => optionById.get(id))
        .filter((child): child is FolderOption => Boolean(child))
        .sort((a, b) => a.folder.title.localeCompare(b.folder.title, "zh-Hans-CN"));
      option.totalSessionCount =
        option.sessionCount +
        option.children.reduce((sum, child) => sum + computeTotal(child.id), 0);
      return option.totalSessionCount;
    };
    const roots = (childIdsByParent.get(null) ?? [])
      .map((id) => optionById.get(id))
      .filter((option): option is FolderOption => Boolean(option))
      .sort((a, b) => a.folder.title.localeCompare(b.folder.title, "zh-Hans-CN"));
    roots.forEach((root) => computeTotal(root.id));
    const flatten = (nodes: FolderOption[]): FolderOption[] =>
      nodes.flatMap((node) => [node, ...flatten(node.children)]);
    return flatten(roots);
  }, [organizer]);

  const folderTree = React.useMemo(
    () => folderOptions.filter((folder) => !folder.folder.parentId),
    [folderOptions],
  );

  React.useEffect(() => {
    if (!folderOptions.length) return;
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      for (const folder of folderOptions) {
        if (!folder.folder.parentId) next.add(folder.id);
      }
      return next;
    });
  }, [folderOptions]);

  const folderLabel = React.useCallback(
    (folderId: string | null | undefined) => {
      if (!folderId) return "未分组";
      return folderOptions.find((folder) => folder.id === folderId)?.label ?? "未知文件夹";
    },
    [folderOptions],
  );


  const folderMoveTargets = React.useCallback(
    (movingFolder: ChatSessionFolder | null) => {
      if (!movingFolder) return folderOptions;
      const parentById = new Map(
        (organizer?.folders ?? []).map((folder) => [folder.id, folder.parentId]),
      );
      const isDescendant = (folderId: string) => {
        let cursor = parentById.get(folderId) || null;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === movingFolder.id) return true;
          if (seen.has(cursor)) return false;
          seen.add(cursor);
          cursor = parentById.get(cursor) || null;
        }
        return false;
      };
      return folderOptions.filter(
        (folder) => folder.id !== movingFolder.id && !isDescendant(folder.id),
      );
    },
    [folderOptions, organizer],
  );

  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const scoped = sessions.filter((s) => {
      if (sessionFilter === "managed")
        return canManage(s) && !s.presentation?.archived;
      if (sessionFilter === "readonly")
        return !canManage(s) && !s.presentation?.archived;
      if (sessionFilter === "archived")
        return Boolean(s.presentation?.archived);
      return true;
    });
    const folderScoped = scoped.filter((s) => {
      const assigned = organizer?.sessionFolderMap?.[s.key] ?? null;
      if (folderFilter === "all") return true;
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
        sessionSourceLabel(s),
        folderLabel(organizer?.sessionFolderMap?.[s.key] ?? null),
        s.lastMessagePreview ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, filter, sessionFilter, folderFilter, organizer, folderLabel]);


  const binaryStatusById = React.useMemo(
    () => new Map((terminalStatus.data?.binaries ?? []).map((binary) => [binary.id, binary] as const)),
    [terminalStatus.data?.binaries],
  );

  const runtimeOptionReadiness = React.useCallback(
    (option: ChatRuntimeAgentOption): { label: string; tone: "ok" | "warn" | "info"; detail: string } => {
      if (option.adapterKind !== "native-cli" || !option.binaryId) {
        return { label: "平台", tone: "info", detail: "由 OpenClaw 平台管理可用性" };
      }
      const binary = binaryStatusById.get(option.binaryId);
      if (terminalStatus.isLoading) {
        return { label: "检测中", tone: "info", detail: "正在检测本地 CLI 是否可用" };
      }
      if (!binary) {
        return { label: "未知", tone: "warn", detail: "未返回该 CLI 的安装状态" };
      }
      if (binary.installed) {
        return { label: "可用", tone: "ok", detail: binary.version || binary.path || "已检测到本地 CLI" };
      }
      return { label: "未安装", tone: "warn", detail: binary.packageName ? `需要安装 ${binary.packageName}` : "请在 CLI 代理页面安装或配置" };
    },
    [binaryStatusById, terminalStatus.isLoading],
  );

  const selectedRuntimeOption = React.useMemo(
    () => CHAT_RUNTIME_AGENT_OPTIONS.find((item) => item.agent === runtimeAgent) ?? CHAT_RUNTIME_AGENT_OPTIONS[0],
    [runtimeAgent],
  );
  const selectableModels = React.useMemo(
    () => (modelCatalog.data?.models ?? modelCatalog.data?.data ?? [])
      .filter((model) => model.agentSelectable !== false && !model.endpointOnly)
      .slice()
      .sort((left, right) => {
        const leftHealthy = (left.healthyProviderIds?.length ?? 0) > 0 ? 0 : 1;
        const rightHealthy = (right.healthyProviderIds?.length ?? 0) > 0 ? 0 : 1;
        if (leftHealthy !== rightHealthy) return leftHealthy - rightHealthy;
        return (left.display_name || left.id).localeCompare(right.display_name || right.id);
      })
      .slice(0, 120),
    [modelCatalog.data],
  );

  const runCreate = () => {
    const option = selectedRuntimeOption;
    createSession.mutate(
      {
        agentId: "main",
        payload: {
          label: labelDraft.trim() || undefined,
          runtimeTarget: {
            adapterKind: option.adapterKind,
            agent: option.agent,
            model: runtimeModel.trim() || null,
            workDir: runtimeWorkDir.trim() || null,
            permissionMode: runtimePermissionMode || null,
          },
        },
      },
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
    payload: { label?: string; archived?: boolean; runtimeTarget?: ChatSessionRow["runtimeTarget"] },
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

  const runCreateFolder = (parentId: string | null) => {
    createFolder.mutate(
      { title: folderDraft.trim(), parentId },
      {
        onSuccess: (res) => {
          toast.success("文件夹已创建");
          setDialog(null);
          setFolderFilter(`folder:${res.folder.id}`);
        },
        onError: (e) =>
          toast.error("创建文件夹失败", { description: e.message }),
      },
    );
  };

  const runPatchFolder = (
    folder: ChatSessionFolder,
    payload: {
      title?: string | null;
      parentId?: string | null;
      move?: ChatSessionFolderMove;
    },
  ) => {
    patchFolder.mutate(
      { folderId: folder.id, payload },
      {
        onSuccess: (res) => {
          toast.success("文件夹已更新");
          setDialog(null);
          setFolderFilter(`folder:${res.folder.id}`);
        },
        onError: (e) =>
          toast.error("更新文件夹失败", { description: e.message }),
      },
    );
  };

  const runDeleteFolder = (folder: ChatSessionFolder) => {
    deleteFolder.mutate(folder.id, {
      onSuccess: () => {
        toast.success("文件夹已删除，会话已回到未分组");
        setDialog(null);
        if (folderFilter === `folder:${folder.id}`) setFolderFilter("all");
      },
      onError: (e) =>
        toast.error("删除文件夹失败", { description: e.message }),
    });
  };

  const runMoveSession = (session: ChatSessionRow, folderId: string | null) => {
    assignSessionToFolder.mutate(
      { sessionKeys: [session.key], folderId },
      {
        onSuccess: () => {
          toast.success(`会话已移动到${folderLabel(folderId)}`);
          setDialog(null);
        },
        onError: (e) =>
          toast.error("移动会话失败", { description: e.message }),
      },
    );
  };

  const busy =
    createSession.isPending ||
    patchSession.isPending ||
    deleteSession.isPending ||
    createFolder.isPending ||
    patchFolder.isPending ||
    deleteFolder.isPending ||
    assignSessionToFolder.isPending;

  const closeContextMenu = () => setContextMenu(null);

  const clampMenuPoint = (x: number, y: number) => {
    const viewportWidth =
      typeof window === "undefined" ? x + 240 : window.innerWidth;
    const viewportHeight =
      typeof window === "undefined" ? y + 320 : window.innerHeight;
    return {
      x: Math.max(8, Math.min(x, viewportWidth - 240)),
      y: Math.max(8, Math.min(y, viewportHeight - 320)),
    };
  };

  const openSessionMenuAt = (session: ChatSessionRow, x: number, y: number) => {
    const point = clampMenuPoint(x, y);
    setContextMenu({ kind: "session", session, ...point });
  };

  const openFolderMenuAt = (folder: ChatSessionFolder, x: number, y: number) => {
    const point = clampMenuPoint(x, y);
    setContextMenu({ kind: "folder", folder, ...point });
  };

  const openBlankMenuAt = (x: number, y: number) => {
    const point = clampMenuPoint(x, y);
    setContextMenu({ kind: "blank", ...point });
  };

  const openSessionMenuFromButton = (
    element: HTMLElement,
    session: ChatSessionRow,
  ) => {
    const rect = element.getBoundingClientRect();
    openSessionMenuAt(session, rect.right - 216, rect.bottom + 6);
  };

  const openFolderMenuFromButton = (
    element: HTMLElement,
    folder: ChatSessionFolder,
  ) => {
    const rect = element.getBoundingClientRect();
    openFolderMenuAt(folder, rect.right - 216, rect.bottom + 6);
  };

  const triggerSessionAction = (
    action: "rename" | "archive" | "restore" | "delete" | "move-session" | "edit-runtime",
    session: ChatSessionRow,
  ) => {
    closeContextMenu();
    setDialog({ kind: action, session });
  };

  const triggerFolderAction = (
    action: "create-folder" | "rename-folder" | "delete-folder" | "move-folder",
    folder: ChatSessionFolder | null,
  ) => {
    closeContextMenu();
    if (action === "create-folder") {
      setDialog({ kind: "create-folder", parentId: folder?.id ?? null });
      return;
    }
    if (!folder) return;
    setDialog({ kind: action, folder });
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

  const renderFolderNode = (folder: FolderOption): React.ReactNode => {
    const isExpanded = expandedFolderIds.has(folder.id);
    const isSelected = folderFilter === `folder:${folder.id}`;
    const hasChildren = folder.children.length > 0;
    return (
      <React.Fragment key={folder.id}>
        <div
          className={cn(
            "group/folder-row grid grid-cols-[auto_minmax(0,1fr)_auto] items-center rounded-sm transition-colors hover:bg-panel-2",
            isSelected && "bg-primary-soft",
          )}
          style={{ paddingLeft: `${Math.min(folder.depth, 5) * 14}px` }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openFolderMenuAt(folder.folder, event.clientX, event.clientY);
          }}
        >
          <button
            type="button"
            disabled={!hasChildren}
            aria-label={isExpanded ? "折叠文件夹" : "展开文件夹"}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!hasChildren) return;
              setExpandedFolderIds((current) => {
                const next = new Set(current);
                if (next.has(folder.id)) next.delete(folder.id);
                else next.add(folder.id);
                return next;
              });
            }}
            className="ml-1 grid size-7 place-items-center rounded-xs text-subtle outline-none hover:bg-panel focus-visible:shadow-[var(--ring)] disabled:pointer-events-none disabled:opacity-40"
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )
            ) : (
              <span className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setFolderFilter(`folder:${folder.id}`)}
            className="flex min-w-0 items-center gap-2 px-1 py-1.5 text-left outline-none focus-visible:shadow-[var(--ring)]"
          >
            <Folder className="size-4 shrink-0 text-subtle" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {folder.folder.title}
            </span>
            <span className="shrink-0 rounded-full bg-panel-3 px-1.5 py-0.5 text-2xs text-subtle">
              {folder.totalSessionCount}
            </span>
          </button>
          <button
            type="button"
            aria-label={`管理文件夹 ${folder.label}`}
            aria-haspopup="menu"
            aria-expanded={
              contextMenu?.kind === "folder" &&
              contextMenu.folder.id === folder.id
                ? true
                : undefined
            }
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openFolderMenuFromButton(event.currentTarget, folder.folder);
            }}
            className="mr-1 grid size-7 place-items-center rounded-sm text-subtle opacity-0 outline-none transition hover:bg-panel hover:text-ink group-hover/folder-row:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>
        {isExpanded && folder.children.map((child) => renderFolderNode(child))}
      </React.Fragment>
    );
  };

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
              ["managed", "可管理"],
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
        <div className="flex items-center justify-between gap-2 text-2xs text-subtle">
          <span>
            当前：{sessionScopeLabel(
              folderFilter,
              folderFilter.startsWith("folder:")
                ? folderLabel(folderFilter.slice("folder:".length))
                : "",
            )}
          </span>
          <span>右键空白处可新建会话或文件夹</span>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto"
        onContextMenu={(event) => {
          event.preventDefault();
          openBlankMenuAt(event.clientX, event.clientY);
        }}
      >
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
        ) : visible.length === 0 &&
          (sessionFilter === "readonly" || folderTree.length === 0) ? (
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
            {sessionFilter !== "readonly" && folderTree.length > 0 && (
              <div className="mb-1 grid gap-px border-b border-line pb-1">
                <button
                  type="button"
                  onClick={() => setFolderFilter("all")}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]",
                    folderFilter === "all" && "bg-primary-soft text-primary",
                  )}
                >
                  <MessageSquare className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">全部会话</span>
                  <span className="rounded-full bg-panel-3 px-1.5 py-0.5 text-2xs text-subtle">
                    {sessions.filter((s) => canManage(s) && !s.presentation?.archived).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFolderFilter("unfiled")}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]",
                    folderFilter === "unfiled" && "bg-primary-soft text-primary",
                  )}
                >
                  <Folder className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">未分组</span>
                  <span className="rounded-full bg-panel-3 px-1.5 py-0.5 text-2xs text-subtle">
                    {sessions.filter((s) => canManage(s) && !s.presentation?.archived && !organizer?.sessionFolderMap?.[s.key]).length}
                  </span>
                </button>
                {folderTree.map((folder) => renderFolderNode(folder))}
              </div>
            )}
            {visible.map((s) => {
              const st = runStateTone(s.runtime?.state);
              const agentLabel = runtimeAgentLabel(s);
              const source = sessionSourceLabel(s);
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
                    event.stopPropagation();
                    openSessionMenuAt(s, event.clientX, event.clientY);
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
                        {agentLabel} · {source} · {folderLabel(organizer?.sessionFolderMap?.[s.key] ?? null)}
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
                      contextMenu?.kind === "session" && contextMenu.session.key === s.key
                        ? true
                        : undefined
                    }
                    aria-label={`管理会话 ${sessionTitle(s)}`}
                    title="更多操作"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openSessionMenuFromButton(event.currentTarget, s);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " " ||
                        event.key === "ArrowDown"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        openSessionMenuFromButton(event.currentTarget, s);
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
          aria-label={
            contextMenu.kind === "session"
              ? `会话操作：${sessionTitle(contextMenu.session)}`
              : contextMenu.kind === "folder"
                ? `文件夹操作：${contextMenu.folder.title}`
                : "会话列表操作"
          }
          className="fixed z-50 grid max-h-[min(70vh,34rem)] w-56 gap-0.5 overflow-auto rounded-md border border-line-2 bg-panel p-1 shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === "blank" && (
            <>
              {renderMenuItem({
                icon: <Plus />,
                onSelect: () => {
                  closeContextMenu();
                  setDialog({ kind: "create" });
                },
                children: "新建会话…",
              })}
              {renderMenuItem({
                icon: <FolderPlus />,
                onSelect: () => triggerFolderAction("create-folder", null),
                children: "新建文件夹…",
              })}
              <div className="my-1 h-px bg-line" role="separator" />
              {renderMenuItem({
                icon: <RefreshCw />,
                onSelect: () => {
                  closeContextMenu();
                  onRefresh();
                },
                children: "刷新列表",
              })}
            </>
          )}

          {contextMenu.kind === "folder" && (
            <>
              {renderMenuItem({
                icon: <Folder />,
                onSelect: () => {
                  setFolderFilter(`folder:${contextMenu.folder.id}`);
                  closeContextMenu();
                },
                children: "筛选此文件夹",
              })}
              {renderMenuItem({
                icon: <FolderPlus />,
                onSelect: () =>
                  triggerFolderAction("create-folder", contextMenu.folder),
                children: "新建子文件夹…",
              })}
              <div className="my-1 h-px bg-line" role="separator" />
              {renderMenuItem({
                icon: <Pencil />,
                onSelect: () =>
                  triggerFolderAction("rename-folder", contextMenu.folder),
                children: "重命名文件夹…",
              })}
              {renderMenuItem({
                icon: <FolderInput />,
                onSelect: () =>
                  triggerFolderAction("move-folder", contextMenu.folder),
                children: "移动到文件夹…",
              })}
              {renderMenuItem({
                icon: <CornerUpLeft />,
                disabled: !contextMenu.folder.parentId,
                onSelect: () =>
                  runPatchFolder(contextMenu.folder, { parentId: null }),
                children: "移到顶层",
              })}
              <div className="my-1 h-px bg-line" role="separator" />
              {renderMenuItem({
                icon: <ChevronsUp />,
                onSelect: () =>
                  runPatchFolder(contextMenu.folder, { move: "top" }),
                children: "置顶",
              })}
              {renderMenuItem({
                icon: <ArrowUp />,
                onSelect: () =>
                  runPatchFolder(contextMenu.folder, { move: "up" }),
                children: "上移",
              })}
              {renderMenuItem({
                icon: <ArrowDown />,
                onSelect: () =>
                  runPatchFolder(contextMenu.folder, { move: "down" }),
                children: "下移",
              })}
              <div className="my-1 h-px bg-line" role="separator" />
              {renderMenuItem({
                icon: <Trash2 />,
                danger: true,
                onSelect: () =>
                  triggerFolderAction("delete-folder", contextMenu.folder),
                children: "删除文件夹…",
              })}
            </>
          )}

          {contextMenu.kind === "session" && (
            <>
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
                    icon: <MonitorCog />,
                    onSelect: () =>
                      triggerSessionAction("edit-runtime", contextMenu.session),
                    children: "编辑运行目标…",
                  })}
                  {renderMenuItem({
                    icon: <FolderInput />,
                    onSelect: () =>
                      triggerSessionAction("move-session", contextMenu.session),
                    children: "移动到文件夹…",
                  })}
                  {organizer?.sessionFolderMap?.[contextMenu.session.key] &&
                    renderMenuItem({
                      icon: <CornerUpLeft />,
                      onSelect: () => runMoveSession(contextMenu.session, null),
                      children: "移出文件夹",
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
                renderMenuItem({
                  disabled: true,
                  icon: <Archive />,
                  children: "外部观察会话只读",
                })
              )}
            </>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(dialog)}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className={dialog?.kind === "create" ? "w-[min(760px,94vw)]" : undefined}>
          {dialog?.kind === "create" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
                  <Plus />
                </span>
                <DialogTitle>新建 Agent 会话</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <div className="grid gap-4">
                  <label className="grid gap-2 text-sm text-muted">
                    会话名称
                    <Input
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      placeholder="例如：修复网关路由"
                      autoFocus
                    />
                  </label>

                  <div className="grid gap-2">
                    <span className="text-sm text-muted">运行器 / Agent</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CHAT_RUNTIME_AGENT_OPTIONS.map((option) => {
                        const active = option.agent === runtimeAgent;
                        const readiness = runtimeOptionReadiness(option);
                        return (
                          <button
                            key={`${option.adapterKind}:${option.agent}`}
                            type="button"
                            onClick={() => setRuntimeAgent(option.agent)}
                            className={cn(
                              "grid gap-1 rounded-sm border border-line bg-panel-2 p-3 text-left outline-none transition hover:border-primary-line focus-visible:shadow-[var(--ring)]",
                              active && "border-primary-line bg-primary-soft",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-strong">
                              <MonitorCog className="size-4 shrink-0 text-primary" />
                              <span className="min-w-0 flex-1 truncate">{option.label}</span>
                              <ToneBadge tone={readiness.tone}>{readiness.label}</ToneBadge>
                            </span>
                            <span className="text-xs text-subtle">{option.description}</span>
                            <span className="truncate text-2xs text-muted">{readiness.detail}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm text-muted">
                      默认模型
                      <select
                        value={runtimeModel}
                        onChange={(event) => setRuntimeModel(event.target.value)}
                        className="h-9 rounded-sm border border-line bg-panel-2 px-2 text-sm text-ink outline-none focus:border-primary-line focus:shadow-[var(--ring)]"
                      >
                        <option value="">使用模型网关默认路由</option>
                        {selectableModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {(model.display_name || model.id)}{model.healthyProviderIds?.length ? " · 可用" : ""}
                          </option>
                        ))}
                      </select>
                      {modelCatalog.isError ? (
                        <span className="text-2xs text-amber">模型列表加载失败，将使用模型网关默认路由。</span>
                      ) : null}
                    </label>
                    <label className="grid gap-2 text-sm text-muted">
                      权限模式
                      <select
                        value={runtimePermissionMode}
                        onChange={(event) => setRuntimePermissionMode(event.target.value as ChatRuntimePermissionMode | "")}
                        className="h-9 rounded-sm border border-line bg-panel-2 px-2 text-sm text-ink outline-none focus:border-primary-line focus:shadow-[var(--ring)]"
                      >
                        {CHAT_RUNTIME_PERMISSION_OPTIONS.map((item) => (
                          <option key={item.value || "default"} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm text-muted">
                    默认工作目录
                    <Input
                      value={runtimeWorkDir}
                      onChange={(e) => setRuntimeWorkDir(e.target.value)}
                      placeholder="留空使用默认工作区，例如 /home/binbin/project"
                    />
                  </label>

                  <p className="rounded-sm bg-panel-2 px-3 py-2 text-xs text-subtle">
                    当前保存运行目标：{selectedRuntimeOption.adapterKind} / {selectedRuntimeOption.agent}
                    {runtimeModel.trim() ? ` / ${runtimeModel.trim()}` : " / 默认模型"}
                    {runtimeWorkDir.trim() ? ` / ${runtimeWorkDir.trim()}` : " / 默认目录"}。
                    发送时会按这里的 Agent、模型、目录和权限启动或恢复对应运行时会话。
                  </p>
                </div>
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

          {dialog?.kind === "edit-runtime" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
                  <MonitorCog />
                </span>
                <DialogTitle>编辑运行目标</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <div className="grid gap-4">
                  <p className="text-sm text-muted">
                    会话：{sessionTitle(dialog.session)}。保存后从下一次发送开始使用新的 Agent、模型、目录和权限。
                  </p>

                  <div className="grid gap-2">
                    <span className="text-sm text-muted">运行器 / Agent</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CHAT_RUNTIME_AGENT_OPTIONS.map((option) => {
                        const active = option.agent === runtimeAgent;
                        const readiness = runtimeOptionReadiness(option);
                        return (
                          <button
                            key={`${option.adapterKind}:${option.agent}`}
                            type="button"
                            onClick={() => setRuntimeAgent(option.agent)}
                            className={cn(
                              "grid gap-1 rounded-sm border border-line bg-panel-2 p-3 text-left outline-none transition hover:border-primary-line focus-visible:shadow-[var(--ring)]",
                              active && "border-primary-line bg-primary-soft",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-strong">
                              <MonitorCog className="size-4 shrink-0 text-primary" />
                              <span className="min-w-0 flex-1 truncate">{option.label}</span>
                              <ToneBadge tone={readiness.tone}>{readiness.label}</ToneBadge>
                            </span>
                            <span className="text-xs text-subtle">{option.description}</span>
                            <span className="truncate text-2xs text-muted">{readiness.detail}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm text-muted">
                      默认模型
                      <select
                        value={runtimeModel}
                        onChange={(event) => setRuntimeModel(event.target.value)}
                        className="h-9 rounded-sm border border-line bg-panel-2 px-2 text-sm text-ink outline-none focus:border-primary-line focus:shadow-[var(--ring)]"
                      >
                        <option value="">使用模型网关默认路由</option>
                        {selectableModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {(model.display_name || model.id)}{model.healthyProviderIds?.length ? " · 可用" : ""}
                          </option>
                        ))}
                      </select>
                      {modelCatalog.isError ? (
                        <span className="text-2xs text-amber">模型列表加载失败，将使用模型网关默认路由。</span>
                      ) : null}
                    </label>
                    <label className="grid gap-2 text-sm text-muted">
                      权限模式
                      <select
                        value={runtimePermissionMode}
                        onChange={(event) => setRuntimePermissionMode(event.target.value as ChatRuntimePermissionMode | "")}
                        className="h-9 rounded-sm border border-line bg-panel-2 px-2 text-sm text-ink outline-none focus:border-primary-line focus:shadow-[var(--ring)]"
                      >
                        {CHAT_RUNTIME_PERMISSION_OPTIONS.map((item) => (
                          <option key={item.value || "default"} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm text-muted">
                    默认工作目录
                    <Input
                      value={runtimeWorkDir}
                      onChange={(e) => setRuntimeWorkDir(e.target.value)}
                      placeholder="留空使用默认工作区，例如 /home/binbin/project"
                    />
                  </label>
                </div>
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
                  onClick={() => {
                    const option = selectedRuntimeOption;
                    runPatch(dialog.session, {
                      runtimeTarget: {
                        adapterKind: option.adapterKind,
                        agent: option.agent,
                        model: runtimeModel.trim() || null,
                        workDir: runtimeWorkDir.trim() || null,
                        permissionMode: runtimePermissionMode || null,
                      },
                    });
                  }}
                  disabled={busy}
                >
                  {busy ? "保存中…" : "保存运行目标"}
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

          {dialog?.kind === "create-folder" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
                  <FolderPlus />
                </span>
                <DialogTitle>新建文件夹</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <label className="grid gap-2 text-sm text-muted">
                  文件夹名称
                  <Input
                    value={folderDraft}
                    onChange={(e) => setFolderDraft(e.target.value)}
                    placeholder="例如：客户项目"
                    autoFocus
                  />
                </label>
                <label className="mt-3 grid gap-2 text-sm text-muted">
                  上级文件夹
                  <select
                    value={folderTargetId ?? ""}
                    onChange={(event) =>
                      setFolderTargetId(event.target.value || null)
                    }
                    className="h-9 rounded-sm border border-line bg-panel-2 px-2 text-sm text-ink outline-none focus:border-primary-line focus:shadow-[var(--ring)]"
                  >
                    <option value="">顶层</option>
                    {folderOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.label}
                      </option>
                    ))}
                  </select>
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
                  onClick={() => runCreateFolder(folderTargetId)}
                  disabled={busy || !folderDraft.trim()}
                >
                  {busy ? "创建中…" : "创建"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "rename-folder" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
                  <Pencil />
                </span>
                <DialogTitle>重命名文件夹</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <label className="grid gap-2 text-sm text-muted">
                  新名称
                  <Input
                    value={folderDraft}
                    onChange={(e) => setFolderDraft(e.target.value)}
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
                    runPatchFolder(dialog.folder, { title: folderDraft.trim() })
                  }
                  disabled={busy || !folderDraft.trim()}
                >
                  {busy ? "保存中…" : "保存"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "move-session" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
                  <FolderInput />
                </span>
                <DialogTitle>移动会话到文件夹</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="mb-3 text-sm text-muted">
                  会话：{sessionTitle(dialog.session)}
                </p>
                <label className="grid gap-2 text-sm text-muted">
                  目标文件夹
                  <select
                    value={folderTargetId ?? ""}
                    onChange={(event) =>
                      setFolderTargetId(event.target.value || null)
                    }
                    className="h-9 rounded-sm border border-line bg-panel-2 px-2 text-sm text-ink outline-none focus:border-primary-line focus:shadow-[var(--ring)]"
                  >
                    <option value="">未分组</option>
                    {folderOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.label}
                      </option>
                    ))}
                  </select>
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
                  onClick={() => runMoveSession(dialog.session, folderTargetId)}
                  disabled={busy}
                >
                  {busy ? "移动中…" : "移动"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "move-folder" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
                  <FolderInput />
                </span>
                <DialogTitle>移动文件夹</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <p className="mb-3 text-sm text-muted">
                  文件夹：{folderLabel(dialog.folder.id)}
                </p>
                <label className="grid gap-2 text-sm text-muted">
                  新上级文件夹
                  <select
                    value={folderTargetId ?? ""}
                    onChange={(event) =>
                      setFolderTargetId(event.target.value || null)
                    }
                    className="h-9 rounded-sm border border-line bg-panel-2 px-2 text-sm text-ink outline-none focus:border-primary-line focus:shadow-[var(--ring)]"
                  >
                    <option value="">顶层</option>
                    {folderMoveTargets(dialog.folder).map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.label}
                      </option>
                    ))}
                  </select>
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
                    runPatchFolder(dialog.folder, { parentId: folderTargetId })
                  }
                  disabled={busy}
                >
                  {busy ? "移动中…" : "移动"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "delete-folder" && (
            <>
              <DialogHeader>
                <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
                  <Trash2 />
                </span>
                <DialogTitle>删除文件夹</DialogTitle>
              </DialogHeader>
              <DialogBody>
                删除「{folderLabel(dialog.folder.id)}」不会删除会话；该文件夹里的会话会回到未分组。确认删除？
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
                  onClick={() => runDeleteFolder(dialog.folder)}
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
