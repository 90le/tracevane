import * as React from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  Copy,
  Download,
  FilePlus,
  FolderPlus,
  FolderInput,
  Package,
  Pencil,
  Trash2,
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

import { useFileOperations } from "./api";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FileActionsMenuTarget {
  path: string;
  name: string;
  kind: "file" | "directory";
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
 * `FileActionsMenu` — the right-click context menu for the Workspace IDE file
 * tree. Renders a controlled floating menu anchored at `(x, y)` plus the
 * inline action flows (rename / copy / move / archive / delete / new). All
 * mutations go through {@link useFileOperations} which already surfaces the
 * success/error toasts; on success we additionally invoke
 * {@link FileActionsMenuProps.onAfterMutation} so the tree can refetch.
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
    | "delete"
    | null
  >(open ? "menu" : null);

  React.useEffect(() => {
    setFlow(open ? "menu" : null);
  }, [open]);

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
    // Clamp the menu inside the viewport.
    const left = Math.min(x, window.innerWidth - 236);
    const top = Math.min(y, window.innerHeight - 380);
    return (
      <div
        ref={menuRef}
        role="menu"
        className={cn(
          "fixed z-[70] min-w-[220px] overflow-hidden rounded-md border border-line-2 bg-panel py-1 shadow-lg",
        )}
        style={{ left, top }}
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

        {target && (
          <>
            <MenuDivider />
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
                label="解包到当前目录"
                onClick={async () => {
                  if (!target) return;
                  try {
                    await ops.unarchive({
                      rootId,
                      archivePath: target.path,
                      directoryPath: parentOf(target.path),
                    });
                    await afterOk();
                  } catch {
                    /* toast already shown by useFileOperations */
                  }
                }}
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
          "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-base transition-colors outline-none",
          "focus-visible:shadow-[var(--ring)]",
          tone === "danger"
            ? "text-red hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)]"
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
          sourcePath={target?.path ?? ""}
          initialName={target?.name ?? ""}
          rootId={rootId}
          onCancel={onCancel}
          onConfirm={async (dest) => {
            if (!target) return;
            if (flow === "copy") {
              await ops.copy({ rootId, path: target.path }, dest);
            } else {
              await ops.move({ rootId, path: target.path }, dest);
            }
            await onDone();
          }}
        />
      );
    case "archive":
      return (
        <NameDialog
          title="打包为归档"
          description={target ? target.path : ""}
          confirmLabel="打包"
          placeholder="archive.zip"
          initialName="archive.zip"
          onCancel={onCancel}
          onConfirm={async (name) => {
            if (!target) return;
            await ops.archive(
              {
                rootId,
                directoryPath: parentOf(target.path),
                paths: [target.path],
              },
              name,
            );
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

// ---------------------------------------------------------------------------
// Copy / move destination dialog
// ---------------------------------------------------------------------------

interface TransferDialogProps {
  title: string;
  sourcePath: string;
  initialName: string;
  rootId: string;
  onCancel: () => void;
  onConfirm: (
    dest: {
      destinationRootId: string;
      destinationDirectoryPath?: string;
      nextName?: string;
      overwrite?: boolean;
    },
  ) => Promise<void> | void;
}

function TransferDialog({
  title,
  sourcePath,
  initialName,
  rootId,
  onCancel,
  onConfirm,
}: TransferDialogProps) {
  const [destRoot, setDestRoot] = React.useState(rootId);
  const [destPath, setDestPath] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [overwrite, setOverwrite] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!destRoot) return;
    setBusy(true);
    try {
      await onConfirm({
        destinationRootId: destRoot,
        destinationDirectoryPath: destPath || undefined,
        nextName: newName.trim() || undefined,
        overwrite,
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
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="size-4"
            />
            <span>覆盖同名目标</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || !destRoot}
          >
            {busy ? "处理中…" : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

  async function confirm() {
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
          <DialogTitle className="flex items-center gap-2 text-red">
            <AlertTriangle />
            确认删除
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
            此操作不可撤销。删除后无法恢复，请确认上面列出的路径。
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? "删除中…" : "永久删除"}
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
