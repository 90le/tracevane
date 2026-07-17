import * as React from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  Copy,
  Code2,
  Download,
  Eye,
  FilePlus,
  FolderPlus,
  FolderInput,
  Info,
  Package,
  Pencil,
  Upload,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Input } from "@/design/ui/input";
import { dryRunFileTransfer, dryRunUnarchiveFile, transferFiles } from "@/lib/api/files";
import { toast } from "@/design/ui/sonner";
import type {
  FilesTransferConflictPolicy,
  FilesTransferDryRunResponse,
  FilesUnarchiveDryRunResponse,
} from "../../../../../../types/files";

import { useFileOperations } from "./fileOperations";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FileActionsMenuTarget {
  path: string;
  name: string;
  kind: "file" | "directory";
  textLike?: boolean;
}

export interface FileActionsMenuProps {
  /** Whether the floating menu is visible. */
  open: boolean;
  /** Anchor coordinates (the contextmenu event's clientX/clientY). */
  x: number;
  y: number;
  /** Root id the target lives under (also the default scope for new actions). */
  rootId: string;
  /** The right-clicked entry, or null when the background was clicked. */
  target: FileActionsMenuTarget | null;
  onClose: () => void;
  /** Fired after a successful mutation so the parent (tree) can refetch. */
  onAfterMutation?: () => void;
  /** Open the upload manager for a directory without invoking the file picker directly. */
  onUploadRequest?: (directoryPath: string) => void;
  /** Optional legacy preview hook exposed as an IDE file inspection action. */
  onPreviewRequest?: (target: FileActionsMenuTarget) => void;
  /** Optional online editor entry point for text-like files. */
  onEditRequest?: (target: FileActionsMenuTarget) => void;
  /** Optional properties dialog entry point used by full file-manager surfaces. */
  onPropertiesRequest?: (target: FileActionsMenuTarget) => void;
  /**
   * Optional direct-entry flow for keyboard/command surfaces.
   * Context-menu callers leave this as "menu"; F2/Delete can jump straight
   * into rename/delete without forcing the user through the floating menu.
   */
  initialFlow?:
    | "menu"
    | "newFile"
    | "newDir"
    | "rename"
    | "copy"
    | "move"
    | "archive"
    | "unarchive"
    | "delete";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARCHIVE_EXTENSIONS = [
  ".zip",
  ".tar",
  ".tar.gz",
  ".tgz",
  ".tar.bz2",
  ".tbz2",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
];

function isArchiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Directory that "new" actions should target — the dir itself, or its parent. */
function newActionsDir(target: FileActionsMenuTarget | null): string {
  if (!target) return "";
  return target.kind === "directory" ? target.path : parentOf(target.path);
}

function parentOf(path: string): string {
  if (!path) return "";
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "" : path.slice(0, idx);
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

/**
 * `FileActionsMenu` — the right-click context menu for the file manager list.
 * Renders a controlled floating menu anchored at `(x, y)` plus the inline
 * action flows (rename / copy / move / archive / delete / new). All mutations
 * go through {@link useFileOperations} which already surfaces the success/error
 * toasts; on success we additionally invoke
 * {@link FileActionsMenuProps.onAfterMutation} so the list can refetch.
 *
 * Aurora design: built from `@/design/ui/*`, lucide icons, destructive items
 * use the `danger` button variant + `AlertTriangle`.
 */
export function FileActionsMenu({
  open,
  x,
  y,
  rootId,
  target,
  onClose,
  onAfterMutation,
  onUploadRequest,
  onPreviewRequest,
  onEditRequest,
  onPropertiesRequest,
  initialFlow = "menu",
}: FileActionsMenuProps) {
  const ops = useFileOperations();
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  // Which inline flow is open ("menu" = the floating menu itself).
  const [flow, setFlow] = React.useState<
    | "menu"
    | "newFile"
    | "newDir"
    | "rename"
    | "copy"
    | "move"
    | "archive"
    | "unarchive"
    | "delete"
    | null
  >(open ? initialFlow : null);

  React.useEffect(() => {
    setFlow(open ? initialFlow : null);
  }, [initialFlow, open]);

  // --- outside-click + Escape dismissal for the floating menu --------------
  React.useEffect(() => {
    if (flow !== "menu") return;
    function onDocMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [flow, onClose]);

  // --- helpers --------------------------------------------------------------
  const closeAll = React.useCallback(() => {
    setFlow(null);
    onClose();
  }, [onClose]);

  const afterOk = React.useCallback(async () => {
    onAfterMutation?.();
    closeAll();
  }, [onAfterMutation, closeAll]);

  const startFlow = React.useCallback(
    (next: Exclude<typeof flow, "menu" | null>) => {
      setFlow(next);
    },
    [],
  );

  // The directory under which "new" actions land.
  const newDir = newActionsDir(target);
  const isDirTarget = target?.kind === "directory";
  const isArchiveTarget = !!target && isArchiveName(target.name);

  // --- download -------------------------------------------------------------
  const onDownload = React.useCallback(() => {
    if (!target || target.kind !== "file") return;
    const url =
      `/api/files/download?rootId=${encodeURIComponent(rootId)}` +
      `&path=${encodeURIComponent(target.path)}` +
      `&download=1`;
    window.open(url, "_blank", "noopener,noreferrer");
    closeAll();
  }, [target, rootId, closeAll]);

  // Don't render anything when fully closed.
  if (flow === null) return null;

  // --- the floating menu ----------------------------------------------------
  if (flow === "menu") {
    // Keep the menu inside the viewport. File-manager actions can be taller
    // than the old fixed 380px estimate, so constrain the rendered panel and
    // let it scroll instead of allowing the browser bottom edge to clip items.
    const viewportPadding = 8;
    const menuMinWidth = 220;
    const preferredMenuHeight = 380;
    const left = Math.max(
      viewportPadding,
      Math.min(x, window.innerWidth - menuMinWidth - viewportPadding),
    );
    const top = Math.max(
      viewportPadding,
      Math.min(y, window.innerHeight - preferredMenuHeight - viewportPadding),
    );
    const maxHeight = Math.max(160, window.innerHeight - top - viewportPadding);
    return (
      <div
        ref={menuRef}
        role="menu"
        data-file-manager-actions-context-menu
        className={cn(
          "fixed z-[70] min-w-[220px] overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-line-2 bg-panel py-1 shadow-lg",
        )}
        style={{ left, top, maxHeight }}
      >
        {/* New actions: always available (background right-click = root dir). */}
        <MenuItem
          icon={<FilePlus />}
          label={isDirTarget ? "在此目录新建文件" : "新建文件"}
          onClick={() => startFlow("newFile")}
        />
        <MenuItem
          icon={<FolderPlus />}
          label={isDirTarget ? "在此目录新建目录" : "新建目录"}
          onClick={() => startFlow("newDir")}
        />
        {onUploadRequest && (
          <MenuItem
            icon={<Upload />}
            label={isDirTarget ? "上传到此目录…" : "上传到当前目录…"}
            onClick={() => {
              onUploadRequest(newDir);
              closeAll();
            }}
          />
        )}

        {target && (
          <>
            <MenuDivider />
            {target.kind === "file" && onPreviewRequest ? (
              <MenuItem
                icon={<Eye />}
                label="检查文件"
                onClick={() => {
                  onPreviewRequest(target);
                  closeAll();
                }}
              />
            ) : null}
            {target.kind === "file" && target.textLike && onEditRequest ? (
              <MenuItem
                icon={<Code2 />}
                label="编辑"
                onClick={() => {
                  onEditRequest(target);
                  closeAll();
                }}
              />
            ) : null}
            {onPropertiesRequest ? (
              <MenuItem
                icon={<Info />}
                label="属性"
                onClick={() => {
                  onPropertiesRequest(target);
                  closeAll();
                }}
              />
            ) : null}
            <MenuItem
              icon={<Pencil />}
              label="重命名"
              onClick={() => startFlow("rename")}
            />
            <MenuItem
              icon={<Copy />}
              label="复制到…"
              onClick={() => startFlow("copy")}
            />
            <MenuItem
              icon={<FolderInput />}
              label="移动到…"
              onClick={() => startFlow("move")}
            />
            <MenuItem
              icon={<Package />}
              label="打包为归档…"
              onClick={() => startFlow("archive")}
            />
            {isArchiveTarget && (
              <MenuItem
                icon={<ArchiveRestore />}
                label="解包到…"
                onClick={() => startFlow("unarchive")}
              />
            )}
            {target.kind === "file" && (
              <MenuItem
                icon={<Download />}
                label="下载"
                onClick={onDownload}
              />
            )}
            <MenuDivider />
            <MenuItem
              icon={<AlertTriangle />}
              label="删除…"
              tone="danger"
              onClick={() => startFlow("delete")}
            />
          </>
        )}
      </div>
    );
  }

  // --- inline action flows --------------------------------------------------
  return (
    <ActionFlow
      flow={flow}
      target={target}
      rootId={rootId}
      newDir={newDir}
      ops={ops}
      onDone={afterOk}
      onCancel={closeAll}
    />
  );

  // ---------------------------------------------------------------------
  // Small presentational pieces (kept local — not worth a design export).
  // ---------------------------------------------------------------------

  function MenuItem({
    icon,
    label,
    onClick,
    tone = "default",
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    tone?: "default" | "danger";
  }) {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors outline-none",
          "focus-visible:shadow-[var(--ring)]",
          tone === "danger"
            ? "text-danger hover:bg-danger/10"
            : "text-ink hover:bg-panel-2",
        )}
      >
        <span className="grid size-4 place-items-center [&_svg]:size-4">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </button>
    );
  }

  function MenuDivider() {
    return <div className="my-1 h-px bg-line" />;
  }
}

// ---------------------------------------------------------------------------
// Inline action flow (one Dialog per action)
// ---------------------------------------------------------------------------

type ActionFlowKind =
  | "newFile"
  | "newDir"
  | "rename"
  | "copy"
  | "move"
  | "archive"
  | "unarchive"
  | "delete";

interface ActionFlowProps {
  flow: ActionFlowKind;
  target: FileActionsMenuTarget | null;
  rootId: string;
  newDir: string;
  ops: ReturnType<typeof useFileOperations>;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}

function ActionFlow({
  flow,
  target,
  rootId,
  newDir,
  ops,
  onDone,
  onCancel,
}: ActionFlowProps) {
  switch (flow) {
    case "newFile":
      return (
        <NameDialog
          title="新建文件"
          description={`将创建于 ${displayDir(newDir)}`}
          confirmLabel="创建"
          placeholder="文件名（可含相对路径）"
          onCancel={onCancel}
          onConfirm={async (name) => {
            await ops.createFile({ rootId, directoryPath: newDir }, name, "");
            await onDone();
          }}
        />
      );
    case "newDir":
      return (
        <NameDialog
          title="新建目录"
          description={`将创建于 ${displayDir(newDir)}`}
          confirmLabel="创建"
          placeholder="目录名（可含相对路径）"
          onCancel={onCancel}
          onConfirm={async (name) => {
            await ops.createDirectory({ rootId, directoryPath: newDir }, name);
            await onDone();
          }}
        />
      );
    case "rename":
      return (
        <NameDialog
          title="重命名"
          description={target?.path ?? ""}
          confirmLabel="重命名"
          initialName={target?.name ?? ""}
          onCancel={onCancel}
          onConfirm={async (name) => {
            if (!target) return;
            await ops.rename({ rootId, path: target.path }, name);
            await onDone();
          }}
        />
      );
    case "copy":
    case "move":
      return (
        <TransferDialog
          title={flow === "copy" ? "复制到…" : "移动到…"}
          operation={flow}
          sourcePath={target?.path ?? ""}
          initialName={target?.name ?? ""}
          rootId={rootId}
          onCancel={onCancel}
          onConfirm={async (payload) => {
            if (!target) return;
            const result = await transferFiles({
              operation: flow,
              sourceRootId: rootId,
              sourcePaths: [target.path],
              destinationRootId: payload.destinationRootId,
              destinationDirectoryPath: payload.destinationDirectoryPath,
              nextName: payload.nextName,
              conflictPolicy: payload.conflictPolicy,
            });
            toast.success(flow === "copy" ? "复制成功" : "移动成功", {
              description: result.affectedPaths?.[1] ?? result.affectedPaths?.[0] ?? target.path,
            });
            await onDone();
          }}
        />
      );
    case "archive":
      return (
        <ArchiveDialog
          sourcePath={target?.path ?? ""}
          defaultDirectory={target ? parentOf(target.path) : ""}
          defaultName={target ? `${target.name}.zip` : "archive.zip"}
          onCancel={onCancel}
          onConfirm={async ({ directoryPath, name }) => {
            if (!target) return;
            await ops.archive(
              {
                rootId,
                directoryPath,
                paths: [target.path],
              },
              name,
            );
            await onDone();
          }}
        />
      );
    case "unarchive":
      return (
        <UnarchiveDialog
          rootId={rootId}
          archivePath={target?.path ?? ""}
          defaultDirectory={target ? parentOf(target.path) : ""}
          onCancel={onCancel}
          onConfirm={async ({
            destinationDirectoryPath,
            conflictPolicy,
            overwriteConfirm,
          }) => {
            if (!target) return;
            await ops.unarchive({
              rootId,
              archivePath: target.path,
              directoryPath: parentOf(target.path),
              destinationDirectoryPath,
              conflictPolicy,
              overwriteConfirm,
            });
            await onDone();
          }}
        />
      );
    case "delete":
      return (
        <DeleteDialog
          paths={target ? [target.path] : []}
          onCancel={onCancel}
          onConfirm={async () => {
            if (!target) return;
            await ops.remove({ rootId, paths: [target.path] });
            await onDone();
          }}
        />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reusable single-input dialog (new file / new dir / rename / archive name)
// ---------------------------------------------------------------------------

interface NameDialogProps {
  title: string;
  description?: string;
  confirmLabel: string;
  placeholder?: string;
  initialName?: string;
  onCancel: () => void;
  onConfirm: (name: string) => Promise<void> | void;
}

function NameDialog({
  title,
  description,
  confirmLabel,
  placeholder,
  initialName,
  onCancel,
  onConfirm,
}: NameDialogProps) {
  const [value, setValue] = React.useState(initialName ?? "");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function submit() {
    const name = value.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onConfirm(name);
    } catch {
      /* toast already shown by useFileOperations */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && (
          <DialogBody>
            <DialogDescription>{description}</DialogDescription>
          </DialogBody>
        )}
        <div className="px-5 pb-2 pt-3">
          <Input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || !value.trim()}
          >
            {busy ? "处理中…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDialog({
  sourcePath,
  defaultDirectory,
  defaultName,
  onCancel,
  onConfirm,
}: {
  sourcePath: string;
  defaultDirectory: string;
  defaultName: string;
  onCancel: () => void;
  onConfirm: (value: { directoryPath: string; name: string }) => Promise<void> | void;
}) {
  const [directoryPath, setDirectoryPath] = React.useState(defaultDirectory);
  const [name, setName] = React.useState(defaultName);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setBusy(true);
    try {
      await onConfirm({ directoryPath: directoryPath.trim(), name: trimmedName });
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>打包为归档</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>源：{sourcePath}</DialogDescription>
        </DialogBody>
        <div className="flex flex-col gap-3 px-5 pb-2 pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">保存目录（默认当前目录）</span>
            <Input value={directoryPath} onChange={(e) => setDirectoryPath(e.target.value)} placeholder="例如 docs/dist，留空为根目录" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">归档文件名</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="archive.zip" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>取消</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy ? "打包中…" : "打包"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnarchiveDialog({
  rootId,
  archivePath,
  defaultDirectory,
  onCancel,
  onConfirm,
}: {
  rootId: string;
  archivePath: string;
  defaultDirectory: string;
  onCancel: () => void;
  onConfirm: (value: {
    destinationDirectoryPath: string;
    conflictPolicy: "fail" | "overwrite" | "skip" | "rename";
    overwriteConfirm?: string;
  }) => Promise<void> | void;
}) {
  const [destinationDirectoryPath, setDestinationDirectoryPath] = React.useState(defaultDirectory);
  const [conflictPolicy, setConflictPolicy] = React.useState<"fail" | "overwrite" | "skip" | "rename">("fail");
  const [overwriteConfirm, setOverwriteConfirm] = React.useState("");
  const [dryRun, setDryRun] = React.useState<FilesUnarchiveDryRunResponse | null>(null);
  const [dryRunBusy, setDryRunBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const overwriteRequired = Boolean(dryRun?.counts.overwrite);
  const overwriteConfirmed = !overwriteRequired || overwriteConfirm.trim() === "OVERWRITE";

  React.useEffect(() => {
    if (!archivePath) return;
    let cancelled = false;
    setDryRunBusy(true);
    const timer = window.setTimeout(() => {
      void dryRunUnarchiveFile({
        rootId,
        archivePath,
        directoryPath: defaultDirectory,
        destinationDirectoryPath: destinationDirectoryPath.trim(),
        conflictPolicy,
      })
        .then((result) => {
          if (!cancelled) setDryRun(result);
        })
        .catch(() => {
          if (!cancelled) setDryRun(null);
        })
        .finally(() => {
          if (!cancelled) setDryRunBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [archivePath, conflictPolicy, defaultDirectory, destinationDirectoryPath, rootId]);

  async function submit() {
    setBusy(true);
    try {
      await onConfirm({
        destinationDirectoryPath: destinationDirectoryPath.trim(),
        conflictPolicy,
        overwriteConfirm:
          conflictPolicy === "overwrite" ? overwriteConfirm.trim() : undefined,
      });
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>解包归档</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>归档：{archivePath}</DialogDescription>
        </DialogBody>
        <div className="flex flex-col gap-3 px-5 pb-2 pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">解压目录（默认当前目录）</span>
            <Input value={destinationDirectoryPath} onChange={(e) => setDestinationDirectoryPath(e.target.value)} placeholder="例如 restore，留空为根目录" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">冲突处理</span>
            <select
              value={conflictPolicy}
              onChange={(e) => setConflictPolicy(e.target.value as typeof conflictPolicy)}
              className="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink outline-none focus-visible:shadow-[var(--ring)]"
            >
              <option value="fail">遇到同名文件时报错</option>
              <option value="overwrite">覆盖同名文件</option>
              <option value="skip">跳过同名文件</option>
              <option value="rename">同名文件自动重命名</option>
            </select>
          </label>
          <UnarchiveDryRunSummary dryRun={dryRun} busy={dryRunBusy} />
          {overwriteRequired ? (
            <label className="grid gap-1 rounded border border-warning/30 bg-warning-soft p-2 text-xs text-warning">
              覆盖会替换 {dryRun?.counts.overwrite ?? 0} 个同名目标。请输入 OVERWRITE 确认。
              <Input
                value={overwriteConfirm}
                onChange={(event) => setOverwriteConfirm(event.target.value)}
                placeholder="OVERWRITE"
              />
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>取消</Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={
              busy ||
              !dryRun ||
              dryRunBusy ||
              !overwriteConfirmed ||
              Boolean(dryRun?.counts.conflicts || dryRun?.counts.errors)
            }
          >
            {busy ? "解压中…" : "解压"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnarchiveDryRunSummary({
  dryRun,
  busy,
}: {
  dryRun: FilesUnarchiveDryRunResponse | null;
  busy: boolean;
}) {
  if (busy) return <div className="rounded border border-line bg-panel-2 px-2 py-1 text-xs text-muted">正在预检归档内容…</div>;
  if (!dryRun) return <div className="rounded border border-line bg-panel-2 px-2 py-1 text-xs text-muted">将读取归档目录并预检解压冲突。</div>;
  const counts = dryRun.counts;
  const risky = counts.conflicts + counts.overwrite + counts.errors;
  const visible = dryRun.items.filter((item) => item.status !== "ready").slice(0, 5);
  return (
    <div className="grid gap-2 rounded border border-line bg-panel-2 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">解压预检</span>
        <span className="rounded-full bg-panel px-2 py-0.5 text-muted">{counts.total} 项</span>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">{counts.ready} 就绪</span>
        {counts.rename ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">{counts.rename} 重命名</span> : null}
        {counts.skip ? <span className="rounded-full bg-panel px-2 py-0.5 text-muted">{counts.skip} 跳过</span> : null}
        {risky ? <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">{risky} 风险</span> : null}
      </div>
      {counts.conflicts || counts.errors ? (
        <div className="rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger">
          存在阻塞冲突或不安全条目，请调整冲突策略或检查归档。
        </div>
      ) : null}
      {visible.length ? (
        <div className="max-h-28 overflow-auto rounded border border-line bg-panel">
          {visible.map((item) => (
            <div key={`${item.entryPath}:${item.status}:${item.destinationPath ?? ""}`} className="grid gap-0.5 border-b border-line px-2 py-1 last:border-b-0">
              <span className="truncate font-mono text-[11px] text-ink-strong">{item.entryPath}</span>
              <span className="truncate text-subtle">
                {unarchiveStatusLabel(item.status)} · {item.destinationPath ?? "—"}{item.message ? ` · ${item.message}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function unarchiveStatusLabel(status: FilesUnarchiveDryRunResponse["items"][number]["status"]): string {
  if (status === "ready") return "可解压";
  if (status === "conflict") return "冲突";
  if (status === "overwrite") return "覆盖";
  if (status === "skip") return "跳过";
  if (status === "rename") return "重命名";
  return "错误";
}

// ---------------------------------------------------------------------------
// Copy / move destination dialog
// ---------------------------------------------------------------------------

interface TransferDialogProps {
  title: string;
  operation: "copy" | "move";
  sourcePath: string;
  initialName: string;
  rootId: string;
  onCancel: () => void;
  onConfirm: (
    dest: {
      destinationRootId: string;
      destinationDirectoryPath?: string;
      nextName?: string;
      conflictPolicy: FilesTransferConflictPolicy;
    },
  ) => Promise<void> | void;
}

function TransferDialog({
  title,
  operation,
  sourcePath,
  initialName,
  rootId,
  onCancel,
  onConfirm,
}: TransferDialogProps) {
  const [destRoot, setDestRoot] = React.useState(rootId);
  const [destPath, setDestPath] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [conflictPolicy, setConflictPolicy] =
    React.useState<FilesTransferConflictPolicy>("fail");
  const [overwriteConfirm, setOverwriteConfirm] = React.useState("");
  const [dryRun, setDryRun] =
    React.useState<FilesTransferDryRunResponse | null>(null);
  const [dryRunError, setDryRunError] = React.useState<string | null>(null);
  const [dryRunBusy, setDryRunBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const overwriteRequired = Boolean(dryRun?.counts.overwrite);
  const overwriteConfirmed =
    !overwriteRequired || overwriteConfirm.trim() === "OVERWRITE";
  const disabled = Boolean(
    busy ||
      !destRoot.trim() ||
      dryRunBusy ||
      !dryRun ||
      dryRun.counts.conflicts ||
      dryRun.counts.errors ||
      !overwriteConfirmed,
  );

  React.useEffect(() => {
    if (!sourcePath || !destRoot.trim()) {
      setDryRun(null);
      setDryRunError(null);
      setDryRunBusy(false);
      return;
    }
    let cancelled = false;
    setDryRunBusy(true);
    setDryRunError(null);
    const timer = window.setTimeout(() => {
      void dryRunFileTransfer({
        operation,
        sourceRootId: rootId,
        sourcePaths: [sourcePath],
        destinationRootId: destRoot.trim(),
        destinationDirectoryPath: destPath.trim() || undefined,
        nextName: newName.trim() || undefined,
        conflictPolicy,
      })
        .then((result) => {
          if (!cancelled) setDryRun(result);
        })
        .catch((error) => {
          if (!cancelled) {
            setDryRun(null);
            setDryRunError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) setDryRunBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [conflictPolicy, destPath, destRoot, newName, operation, rootId, sourcePath]);

  async function submit() {
    if (disabled) return;
    setBusy(true);
    try {
      await onConfirm({
        destinationRootId: destRoot.trim(),
        destinationDirectoryPath: destPath.trim() || undefined,
        nextName: newName.trim() || undefined,
        conflictPolicy,
      });
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>源：{sourcePath}</DialogDescription>
        </DialogBody>
        <div className="flex flex-col gap-3 px-5 pb-2 pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">目标根 (rootId)</span>
            <Input
              value={destRoot}
              onChange={(e) => setDestRoot(e.target.value)}
              placeholder="rootId"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">目标目录路径（可选）</span>
            <Input
              value={destPath}
              onChange={(e) => setDestPath(e.target.value)}
              placeholder="例如 docs/subdir"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">新名称（可选，默认不变）</span>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={initialName}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">冲突处理</span>
            <select
              value={conflictPolicy}
              onChange={(event) =>
                setConflictPolicy(event.target.value as FilesTransferConflictPolicy)
              }
              className="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink outline-none focus-visible:shadow-[var(--ring)]"
            >
              <option value="fail">遇到同名目标时报错</option>
              <option value="rename">保留两者，自动重命名</option>
              <option value="skip">跳过同名目标</option>
              <option value="overwrite">覆盖同名目标</option>
            </select>
          </label>
          <TransferDryRunSummary dryRun={dryRun} busy={dryRunBusy} errorMessage={dryRunError} />
          {overwriteRequired ? (
            <label className="grid gap-1 rounded border border-warning/30 bg-warning-soft p-2 text-xs text-warning">
              覆盖会替换 {dryRun?.counts.overwrite ?? 0} 个目标。请输入 OVERWRITE 确认。
              <Input
                value={overwriteConfirm}
                onChange={(event) => setOverwriteConfirm(event.target.value)}
                placeholder="OVERWRITE"
              />
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={disabled}
          >
            {busy ? "处理中…" : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDryRunSummary({
  dryRun,
  busy,
  errorMessage,
}: {
  dryRun: FilesTransferDryRunResponse | null;
  busy: boolean;
  errorMessage: string | null;
}) {
  if (busy) {
    return (
      <div className="rounded border border-line bg-panel-2 px-2 py-1 text-xs text-muted">
        正在预检目标目录和同名冲突…
      </div>
    );
  }
  if (errorMessage) {
    return (
      <div className="rounded border border-danger/20 bg-danger-soft px-2 py-1 text-xs text-danger">
        预检失败：{errorMessage}
      </div>
    );
  }
  if (!dryRun) {
    return (
      <div className="rounded border border-line bg-panel-2 px-2 py-1 text-xs text-muted">
        执行前会先 dry-run 预检目标是否存在、是否会覆盖或跳过。
      </div>
    );
  }
  const item = dryRun.items[0];
  const risky = dryRun.counts.conflicts + dryRun.counts.overwrite + dryRun.counts.errors;
  return (
    <div
      className="grid gap-2 rounded border border-line bg-panel-2 p-2 text-xs"
      data-file-actions-transfer-dry-run-summary
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">转移预检</span>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
          {dryRun.counts.ready} 就绪
        </span>
        {dryRun.counts.rename ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
            {dryRun.counts.rename} 重命名
          </span>
        ) : null}
        {dryRun.counts.skip ? (
          <span className="rounded-full bg-panel px-2 py-0.5 text-muted">
            {dryRun.counts.skip} 跳过
          </span>
        ) : null}
        {risky ? (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">
            {risky} 风险
          </span>
        ) : null}
      </div>
      {item ? (
        <div className="grid gap-0.5 rounded border border-line bg-panel px-2 py-1">
          <span className="truncate font-mono text-[11px] text-ink-strong">
            {item.sourcePath}
          </span>
          <span className="truncate text-subtle">
            {transferStatusLabel(item.status)} · {item.destinationPath ?? "—"}
            {item.message ? ` · ${item.message}` : ""}
          </span>
        </div>
      ) : null}
      {dryRun.counts.conflicts || dryRun.counts.errors ? (
        <div className="rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger">
          存在阻塞冲突或无效来源，不能执行。
        </div>
      ) : null}
    </div>
  );
}

function transferStatusLabel(
  status: FilesTransferDryRunResponse["items"][number]["status"],
): string {
  if (status === "ready") return "可执行";
  if (status === "conflict") return "冲突";
  if (status === "overwrite") return "覆盖";
  if (status === "skip") return "跳过";
  if (status === "rename") return "重命名";
  return "错误";
}

// ---------------------------------------------------------------------------
// Destructive confirmation (delete)
// ---------------------------------------------------------------------------

function DeleteDialog({
  paths,
  onCancel,
  onConfirm,
}: {
  paths: string[];
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function runDeleteConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-danger">
            <AlertTriangle />
            移入回收站
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ul className="mb-2 list-disc pl-5 text-ink">
            {paths.map((p) => (
              <li key={p} className="break-all">
                {p}
              </li>
            ))}
          </ul>
          <DialogDescription>
            默认会移动到全局回收站 .openclaw/.tracevane/trash，避免误删后完全无法找回。需要永久删除时请在独立文件管理器删除弹窗中勾选永久删除。
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={() => void runDeleteConfirm()}
            disabled={busy}
          >
            {busy ? "处理中…" : "移入回收站"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function displayDir(dir: string): string {
  return dir ? dir : "/（根目录）";
}
