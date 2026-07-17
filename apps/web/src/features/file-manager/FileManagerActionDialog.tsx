import * as React from "react";

import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Input } from "@/design/ui/input";
import {
  chmodFiles,
  dryRunArchiveFiles,
  dryRunChmodFiles,
  dryRunFileTransfer,
  dryRunUnarchiveFile,
  transferFiles,
} from "@/lib/api/files";
import {
  createOperationRecord,
  type FileOperationRecord,
  type FileOperationStatus,
} from "./OperationHistoryPanel";
import {
  useFileOperations,
  type FileEntrySummary,
} from "@/features/file-manager/file-tools";
import type {
  FilesArchiveDryRunResponse,
  FilesChmodDryRunResponse,
  FilesTransferDryRunResponse,
  FilesUnarchiveDryRunResponse,
} from "../../../../../types/files";

function displayDir(dir: string): string {
  return dir || "/";
}

function defaultPermissionMode(entries: FileEntrySummary[]): string {
  const firstMode = entries.find((entry) =>
    /^[0-7]{3,4}$/.test(entry.mode),
  )?.mode;
  if (firstMode) return firstMode;
  return entries.some((entry) => entry.kind === "directory") ? "0755" : "0644";
}

type TransferConflictPolicy = "fail" | "overwrite" | "skip" | "rename";
type UnarchiveConflictPolicy = "fail" | "overwrite" | "skip" | "rename";

export type FileManagerDialog =
  | { kind: "newFile" }
  | { kind: "newDir" }
  | { kind: "rename" }
  | { kind: "delete" }
  | { kind: "archive" }
  | { kind: "chmod" }
  | { kind: "unarchive" }
  | { kind: "copy"; initialDirectoryPath?: string }
  | { kind: "move"; initialDirectoryPath?: string }
  | null;

export interface FileManagerActionDialogProps {
  dialog: FileManagerDialog;
  rootId: string;
  directoryPath: string;
  selectedEntries: FileEntrySummary[];
  selectedPaths: string[];
  selectedArchivePath?: string;
  ops: ReturnType<typeof useFileOperations>;
  onClose: () => void;
  onDone: (record: FileOperationRecord) => void;
}

export function FileManagerActionDialog({
  dialog,
  rootId,
  directoryPath,
  selectedEntries,
  selectedPaths,
  selectedArchivePath,
  ops,
  onClose,
  onDone,
}: FileManagerActionDialogProps) {
  const [value, setValue] = React.useState("");
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");
  const [deletePermanently, setDeletePermanently] = React.useState(false);
  const [chmodMode, setChmodMode] = React.useState("0644");
  const [chmodRecursive, setChmodRecursive] = React.useState(false);
  const [archivePreview, setArchivePreview] =
    React.useState<FilesArchiveDryRunResponse | null>(null);
  const [archivePreviewBusy, setArchivePreviewBusy] = React.useState(false);
  const [archivePreviewError, setArchivePreviewError] = React.useState<
    string | null
  >(null);
  const [chmodPreview, setChmodPreview] =
    React.useState<FilesChmodDryRunResponse | null>(null);
  const [chmodPreviewBusy, setChmodPreviewBusy] = React.useState(false);
  const [transferConflictPolicy, setTransferConflictPolicy] =
    React.useState<TransferConflictPolicy>("fail");
  const [transferPreview, setTransferPreview] =
    React.useState<FilesTransferDryRunResponse | null>(null);
  const [transferPreviewBusy, setTransferPreviewBusy] = React.useState(false);
  const [transferPreviewError, setTransferPreviewError] = React.useState<
    string | null
  >(null);
  const [transferOverwriteConfirm, setTransferOverwriteConfirm] =
    React.useState("");
  const [unarchiveConflictPolicy, setUnarchiveConflictPolicy] =
    React.useState<UnarchiveConflictPolicy>("fail");
  const [unarchivePreview, setUnarchivePreview] =
    React.useState<FilesUnarchiveDryRunResponse | null>(null);
  const [unarchivePreviewBusy, setUnarchivePreviewBusy] = React.useState(false);
  const [unarchivePreviewError, setUnarchivePreviewError] = React.useState<
    string | null
  >(null);
  const [unarchiveOverwriteConfirm, setUnarchiveOverwriteConfirm] =
    React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!dialog) return;
    setDeleteConfirmText("");
    setDeletePermanently(false);
    setArchivePreviewError(null);
    setTransferPreviewError(null);
    setTransferOverwriteConfirm("");
    setUnarchivePreviewError(null);
    setUnarchiveOverwriteConfirm("");
    if (dialog.kind === "newFile") setValue("untitled.txt");
    else if (dialog.kind === "newDir") setValue("new-folder");
    else if (dialog.kind === "rename") setValue(selectedEntries[0]?.name ?? "");
    else if (dialog.kind === "archive") setValue(defaultArchiveName());
    else if (dialog.kind === "chmod") {
      setValue("");
      setChmodMode(defaultPermissionMode(selectedEntries));
      setChmodRecursive(
        selectedEntries.some((entry) => entry.kind === "directory"),
      );
    } else if (dialog.kind === "copy" || dialog.kind === "move") {
      setValue(dialog.initialDirectoryPath ?? directoryPath);
      setTransferConflictPolicy("fail");
    } else if (dialog.kind === "unarchive") {
      setValue(directoryPath);
      setUnarchiveConflictPolicy("fail");
    } else setValue("");
  }, [dialog, directoryPath, selectedEntries]);


  React.useEffect(() => {
    if (!dialog || dialog.kind !== "archive" || selectedPaths.length === 0 || !rootId) {
      setArchivePreview(null);
      setArchivePreviewError(null);
      setArchivePreviewBusy(false);
      return;
    }
    let cancelled = false;
    setArchivePreviewBusy(true);
    setArchivePreviewError(null);
    const timer = window.setTimeout(() => {
      void dryRunArchiveFiles({
        rootId,
        directoryPath,
        paths: selectedPaths,
        name: value.trim(),
      })
        .then((preview) => {
          if (!cancelled) setArchivePreview(preview);
        })
        .catch((error) => {
          if (!cancelled) {
            setArchivePreview(null);
            setArchivePreviewError(
              error instanceof Error ? error.message : String(error),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setArchivePreviewBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dialog, directoryPath, rootId, selectedPaths, value]);

  React.useEffect(() => {
    if (
      !dialog ||
      dialog.kind !== "unarchive" ||
      !selectedArchivePath ||
      !rootId
    ) {
      setUnarchivePreview(null);
      setUnarchivePreviewError(null);
      setUnarchivePreviewBusy(false);
      return;
    }
    let cancelled = false;
    setUnarchivePreviewBusy(true);
    setUnarchivePreviewError(null);
    const timer = window.setTimeout(() => {
      void dryRunUnarchiveFile({
        rootId,
        archivePath: selectedArchivePath,
        directoryPath: parentOf(selectedArchivePath),
        destinationDirectoryPath: value.trim(),
        conflictPolicy: unarchiveConflictPolicy,
      })
        .then((preview) => {
          if (!cancelled) setUnarchivePreview(preview);
        })
        .catch((error) => {
          if (!cancelled) {
            setUnarchivePreview(null);
            setUnarchivePreviewError(
              error instanceof Error ? error.message : String(error),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setUnarchivePreviewBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dialog, rootId, selectedArchivePath, unarchiveConflictPolicy, value]);

  React.useEffect(() => {
    if (
      !dialog ||
      dialog.kind !== "chmod" ||
      selectedPaths.length === 0 ||
      !rootId
    ) {
      setChmodPreview(null);
      setChmodPreviewBusy(false);
      return;
    }
    let cancelled = false;
    setChmodPreviewBusy(true);
    const timer = window.setTimeout(() => {
      void dryRunChmodFiles({
        rootId,
        paths: selectedPaths,
        mode: chmodMode.trim(),
        recursive: chmodRecursive,
      })
        .then((preview) => {
          if (!cancelled) setChmodPreview(preview);
        })
        .catch(() => {
          if (!cancelled) setChmodPreview(null);
        })
        .finally(() => {
          if (!cancelled) setChmodPreviewBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chmodMode, chmodRecursive, dialog, rootId, selectedPaths]);

  React.useEffect(() => {
    if (
      !dialog ||
      (dialog.kind !== "copy" && dialog.kind !== "move") ||
      selectedPaths.length === 0 ||
      !rootId
    ) {
      setTransferPreview(null);
      setTransferPreviewError(null);
      setTransferPreviewBusy(false);
      return;
    }
    let cancelled = false;
    setTransferPreviewBusy(true);
    setTransferPreviewError(null);
    const timer = window.setTimeout(() => {
      void dryRunFileTransfer({
        operation: dialog.kind,
        sourceRootId: rootId,
        sourcePaths: selectedPaths,
        destinationRootId: rootId,
        destinationDirectoryPath: value.trim(),
        conflictPolicy: transferConflictPolicy,
      })
        .then((preview) => {
          if (!cancelled) setTransferPreview(preview);
        })
        .catch((error) => {
          if (!cancelled) {
            setTransferPreview(null);
            setTransferPreviewError(
              error instanceof Error ? error.message : String(error),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setTransferPreviewBusy(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dialog, rootId, selectedPaths, transferConflictPolicy, value]);

  if (!dialog) return null;

  const isDelete = dialog.kind === "delete";
  const isRename = dialog.kind === "rename";
  const isArchive = dialog.kind === "archive";
  const isChmod = dialog.kind === "chmod";
  const isTransfer = dialog.kind === "copy" || dialog.kind === "move";
  const isUnarchive = dialog.kind === "unarchive";
  const archiveHasBlockingConflicts = Boolean(
    isArchive &&
    (archivePreview?.destinationExists || archivePreview?.counts.errors),
  );
  const transferHasBlockingConflicts = Boolean(
    isTransfer &&
    (transferPreview?.counts.conflicts || transferPreview?.counts.errors),
  );
  const unarchiveHasBlockingConflicts = Boolean(
    isUnarchive &&
    (unarchivePreview?.counts.conflicts || unarchivePreview?.counts.errors),
  );
  const transferNeedsOverwriteConfirm = Boolean(
    isTransfer && transferPreview?.counts.overwrite,
  );
  const unarchiveNeedsOverwriteConfirm = Boolean(
    isUnarchive && unarchivePreview?.counts.overwrite,
  );
  const overwriteConfirmed =
    (!transferNeedsOverwriteConfirm ||
      transferOverwriteConfirm.trim() === "OVERWRITE") &&
    (!unarchiveNeedsOverwriteConfirm ||
      unarchiveOverwriteConfirm.trim() === "OVERWRITE");
  const chmodModeValid = /^[0-7]{3,4}$/.test(chmodMode.trim());
  const deleteRequiresTypedConfirm = isDelete && selectedPaths.length > 0;
  const deleteConfirmed =
    !deleteRequiresTypedConfirm || deleteConfirmText.trim() === "DELETE";
  const deleteFileCount = selectedEntries.filter(
    (entry) => entry.kind === "file",
  ).length;
  const deleteDirectoryCount = selectedEntries.filter(
    (entry) => entry.kind === "directory",
  ).length;
  const selectionScope = summarizeActionSelection(
    selectedEntries,
    selectedPaths,
    deleteFileCount,
    deleteDirectoryCount,
  );
  const title =
    dialog.kind === "newFile"
      ? "新建文件"
      : dialog.kind === "newDir"
        ? "新建目录"
        : isRename
          ? "重命名项目"
          : isArchive
            ? "打包所选项目"
            : isChmod
              ? "修改权限"
              : isUnarchive
                ? "解压归档"
                : dialog.kind === "copy"
                  ? "复制所选项目"
                  : dialog.kind === "move"
                    ? "移动所选项目"
                    : "删除所选项目";
  const description =
    dialog.kind === "newFile" || dialog.kind === "newDir"
      ? `创建位置：${displayDir(directoryPath)}`
      : isRename
        ? `当前名称：${selectedEntries[0]?.name ?? "未选择"}`
        : isUnarchive
          ? `归档：${selectedArchivePath ?? "未选择归档"}`
          : `${selectedPaths.length} 个项目`;
  const disabled =
    busy ||
    (isArchive && (!archivePreview || archivePreviewBusy)) ||
    (isTransfer && (!transferPreview || transferPreviewBusy)) ||
    (isUnarchive && (!unarchivePreview || unarchivePreviewBusy)) ||
    archiveHasBlockingConflicts ||
    transferHasBlockingConflicts ||
    unarchiveHasBlockingConflicts ||
    !overwriteConfirmed ||
    !deleteConfirmed ||
    (isChmod &&
      (!chmodModeValid ||
        selectedPaths.length === 0 ||
        Boolean(chmodPreview?.truncated))) ||
    ((dialog.kind === "newFile" ||
      dialog.kind === "newDir" ||
      isRename ||
      isArchive) &&
      value.trim().length === 0) ||
    (isRename && selectedEntries.length !== 1) ||
    ((isDelete || isArchive || isTransfer) && selectedPaths.length === 0) ||
    (isUnarchive && !selectedArchivePath);

  async function submit() {
    if (disabled || !dialog) return;
    setBusy(true);
    const startedAt = new Date().toISOString();
    const affectedPaths: string[] = [];
    const errorMessages: string[] = [];
    let successCount = 0;
    let failureCount = 0;
    const itemCount =
      dialog.kind === "newFile" ||
      dialog.kind === "newDir" ||
      dialog.kind === "rename" ||
      dialog.kind === "unarchive"
        ? 1
        : selectedPaths.length;
    try {
      if (dialog.kind === "newFile") {
        const result = await ops.createFile(
          { rootId, directoryPath },
          value.trim(),
          "",
        );
        affectedPaths.push(...result.affectedPaths);
        successCount = 1;
      } else if (dialog.kind === "newDir") {
        const result = await ops.createDirectory(
          { rootId, directoryPath },
          value.trim(),
        );
        affectedPaths.push(...result.affectedPaths);
        successCount = 1;
      } else if (dialog.kind === "rename") {
        const target = selectedEntries[0];
        if (!target) throw new Error("请选择一个要重命名的项目");
        const result = await ops.rename(
          { rootId, path: target.path },
          value.trim(),
        );
        affectedPaths.push(...result.affectedPaths);
        successCount = 1;
      } else if (dialog.kind === "archive") {
        const preview = await dryRunArchiveFiles({
          rootId,
          directoryPath,
          paths: selectedPaths,
          name: value.trim(),
        });
        if (preview.destinationExists || preview.counts.errors) {
          throw new Error("打包预检未通过，请更换归档名称或修复无效来源后重试");
        }
        const result = await ops.archive(
          { rootId, directoryPath, paths: selectedPaths },
          value.trim(),
        );
        affectedPaths.push(...result.affectedPaths);
        successCount = selectedPaths.length;
      } else if (dialog.kind === "chmod") {
        const result = await chmodFiles({
          rootId,
          paths: selectedPaths,
          mode: chmodMode.trim(),
          recursive: chmodRecursive,
        });
        affectedPaths.push(...result.affectedPaths);
        successCount = selectedPaths.length;
      } else if (dialog.kind === "unarchive") {
        if (!selectedArchivePath) throw new Error("请选择一个支持的归档文件");
        const preview = await dryRunUnarchiveFile({
          rootId,
          archivePath: selectedArchivePath,
          directoryPath: parentOf(selectedArchivePath),
          destinationDirectoryPath: value.trim(),
          conflictPolicy: unarchiveConflictPolicy,
        });
        if (preview.counts.conflicts || preview.counts.errors) {
          throw new Error("解压预检仍存在阻塞冲突，请调整冲突策略后重试");
        }
        const result = await ops.unarchive({
          rootId,
          archivePath: selectedArchivePath,
          directoryPath: parentOf(selectedArchivePath),
          destinationDirectoryPath: value.trim(),
          conflictPolicy: unarchiveConflictPolicy,
          overwriteConfirm:
            unarchiveConflictPolicy === "overwrite"
              ? unarchiveOverwriteConfirm.trim()
              : undefined,
        });
        affectedPaths.push(...result.affectedPaths);
        successCount =
          preview.counts.ready +
          preview.counts.overwrite +
          preview.counts.rename +
          preview.counts.skip;
      } else if (dialog.kind === "copy" || dialog.kind === "move") {
        const preview = await dryRunFileTransfer({
          operation: dialog.kind,
          sourceRootId: rootId,
          sourcePaths: selectedPaths,
          destinationRootId: rootId,
          destinationDirectoryPath: value.trim(),
          conflictPolicy: transferConflictPolicy,
        });
        if (preview.counts.conflicts || preview.counts.errors) {
          throw new Error("存在阻塞冲突，请调整冲突策略后重试");
        }
        const result = await transferFiles({
          operation: dialog.kind,
          sourceRootId: rootId,
          sourcePaths: selectedPaths,
          destinationRootId: rootId,
          destinationDirectoryPath: value.trim(),
          conflictPolicy: transferConflictPolicy,
        });
        affectedPaths.push(...result.affectedPaths);
        successCount =
          preview.counts.ready +
          preview.counts.overwrite +
          preview.counts.rename +
          preview.counts.skip;
      } else if (dialog.kind === "delete") {
        const result = await ops.remove({
          rootId,
          paths: selectedPaths,
          permanent: deletePermanently,
        });
        affectedPaths.push(...result.affectedPaths);
        successCount = selectedPaths.length;
      }
    } catch (error) {
      failureCount = Math.max(1, itemCount - successCount);
      errorMessages.push(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }

    const status: FileOperationStatus =
      failureCount > 0 && successCount > 0
        ? "partial"
        : failureCount > 0
          ? "error"
          : "success";
    onDone(
      createOperationRecord({
        title,
        status,
        startedAt,
        itemCount,
        successCount,
        failureCount,
        affectedPaths,
        errorMessages,
      }),
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {!isDelete ? (
          <div className="px-5 py-3">
            {!isChmod ? (
              <Input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                placeholder={isTransfer ? "目标目录相对路径" : undefined}
              />
            ) : null}
            {isRename ? (
              <div className="mt-2 rounded border border-line bg-panel-2 px-2 py-1 text-xs text-muted">
                快捷键 F2 可打开此重命名流程；只允许单选重命名，避免批量误改。
              </div>
            ) : null}
            {isArchive ? (
              <ArchiveDryRunSummary
                preview={archivePreview}
                busy={archivePreviewBusy}
                errorMessage={archivePreviewError}
              />
            ) : null}
            {isChmod ? (
              <div className="mt-3 grid gap-2 rounded border border-line bg-panel-2 p-3 text-xs">
                <p className="text-muted">
                  权限使用八进制模式，例如
                  0644、0755。目录递归会影响所有子文件/子目录，执行前会 dry-run
                  预检影响范围。
                </p>
                <label className="grid gap-1 text-subtle">
                  权限模式
                  <Input
                    value={chmodMode}
                    onChange={(event) => setChmodMode(event.target.value)}
                    placeholder="0644"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={chmodRecursive}
                    onChange={(event) =>
                      setChmodRecursive(event.target.checked)
                    }
                    className="size-3 accent-primary"
                  />
                  递归应用到目录下所有子项
                </label>
                <ChmodDryRunSummary
                  preview={chmodPreview}
                  busy={chmodPreviewBusy}
                  modeValid={chmodModeValid}
                />
              </div>
            ) : null}
            {isUnarchive ? (
              <div className="mt-3 grid gap-2 rounded border border-line bg-panel-2 p-3 text-xs">
                <p className="text-muted">
                  目标目录相对于当前 root；留空表示
                  root。执行前会读取归档目录并预检冲突/不安全条目。
                </p>
                <label className="grid gap-1 text-subtle">
                  同名冲突策略
                  <select
                    value={unarchiveConflictPolicy}
                    onChange={(event) =>
                      setUnarchiveConflictPolicy(
                        event.target.value as typeof unarchiveConflictPolicy,
                      )
                    }
                    className="h-8 rounded border border-line bg-panel px-2 text-xs text-ink-strong outline-none focus-visible:shadow-[var(--ring)]"
                  >
                    <option value="fail">询问/阻止：遇到同名即失败</option>
                    <option value="overwrite">覆盖：替换目标同名项</option>
                    <option value="skip">跳过：保留目标同名项</option>
                    <option value="rename">
                      保留两者：自动生成 name (1).ext
                    </option>
                  </select>
                </label>
                <UnarchiveDryRunSummary
                  preview={unarchivePreview}
                  busy={unarchivePreviewBusy}
                  errorMessage={unarchivePreviewError}
                />
                {unarchiveNeedsOverwriteConfirm ? (
                  <OverwriteConfirmField
                    value={unarchiveOverwriteConfirm}
                    onChange={setUnarchiveOverwriteConfirm}
                    count={unarchivePreview?.counts.overwrite ?? 0}
                  />
                ) : null}
              </div>
            ) : null}
            {isTransfer ? (
              <div className="mt-3 grid gap-2 rounded border border-line bg-panel-2 p-3 text-xs">
                <p className="text-muted">
                  目标目录相对于当前 root；留空表示 root。
                </p>
                <label className="grid gap-1 text-subtle">
                  同名冲突策略
                  <select
                    value={transferConflictPolicy}
                    onChange={(event) =>
                      setTransferConflictPolicy(
                        event.target.value as typeof transferConflictPolicy,
                      )
                    }
                    className="h-8 rounded border border-line bg-panel px-2 text-xs text-ink-strong outline-none focus-visible:shadow-[var(--ring)]"
                  >
                    <option value="fail">询问/阻止：遇到同名即失败</option>
                    <option value="overwrite">覆盖：替换目标同名项</option>
                    <option value="skip">跳过：保留目标同名项</option>
                    <option value="rename">
                      保留两者：自动生成 name (1).ext
                    </option>
                  </select>
                </label>
                <TransferDryRunSummary
                  preview={transferPreview}
                  busy={transferPreviewBusy}
                  errorMessage={transferPreviewError}
                />
                {transferNeedsOverwriteConfirm ? (
                  <OverwriteConfirmField
                    value={transferOverwriteConfirm}
                    onChange={setTransferOverwriteConfirm}
                    count={transferPreview?.counts.overwrite ?? 0}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 px-5 py-3 text-sm text-muted">
            <div className="rounded border border-danger/20 bg-danger-soft p-3 text-danger">
              <div className="font-semibold text-danger">
                危险操作：默认移入回收站
              </div>
              <div className="mt-1 text-xs">
                将处理 {selectedPaths.length} 项，其中 {deleteFileCount}{" "}
                个文件、{deleteDirectoryCount} 个目录。默认移动到 root 下的
                .openclaw/.tracevane/trash；勾选永久删除才会跳过回收站。
              </div>
            </div>
            <div
              className="rounded border border-line bg-panel-2 p-3 text-xs"
              data-file-manager-action-selection-summary
            >
              <div className="font-medium text-ink-strong">
                {selectionScope.heading}
              </div>
              <div className="mt-1 text-muted">{selectionScope.detail}</div>
              {selectionScope.sample.length ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-subtle hover:text-ink-strong">
                    查看前 {selectionScope.sample.length} 个示例路径
                  </summary>
                  <div
                    className="mt-2 max-h-28 overflow-auto rounded border border-line bg-panel p-2 font-mono text-2xs text-muted"
                    data-file-manager-action-selection-sample
                  >
                    {selectionScope.sample.map((path) => (
                      <div key={path} className="truncate" title={path}>
                        {path}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
            <label className="grid gap-1 text-xs text-subtle">
              输入 DELETE 确认删除
              <Input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </label>
            <label className="flex items-start gap-2 rounded border border-line bg-panel-2 p-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={deletePermanently}
                onChange={(event) => setDeletePermanently(event.target.checked)}
                className="mt-0.5 size-3 accent-danger"
              />
              <span>
                <strong className="text-danger">永久删除</strong>：跳过
                .openclaw/.tracevane/trash，直接从文件系统移除。
              </span>
            </label>
            <div className="text-xs text-subtle">
              确认按钮会在输入完全匹配 DELETE
              后启用；未勾选永久删除时可从隐藏回收站目录恢复。
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            variant={isDelete ? "danger" : "primary"}
            onClick={() => void submit()}
            disabled={disabled}
          >
            {busy
              ? "处理中..."
              : isDelete
                ? deletePermanently
                  ? "永久删除"
                  : "移入回收站"
                : isRename
                  ? "确认重命名"
                  : isArchive
                    ? "开始打包"
                    : isChmod
                      ? "应用权限"
                      : isUnarchive
                        ? "开始解压"
                        : dialog.kind === "copy"
                          ? "开始复制"
                          : dialog.kind === "move"
                            ? "开始移动"
                            : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDryRunSummary({
  preview,
  busy,
  errorMessage,
}: {
  preview: FilesArchiveDryRunResponse | null;
  busy: boolean;
  errorMessage?: string | null;
}) {
  if (busy) {
    return (
      <div className="mt-3 rounded border border-line bg-panel-2 px-2 py-2 text-xs text-subtle" data-file-manager-archive-dry-run>
        正在预检打包目标…
      </div>
    );
  }
  if (!preview) {
    return (
      <div
        className={
          errorMessage
            ? "mt-3 rounded border border-danger/20 bg-danger-soft px-2 py-2 text-xs text-danger"
            : "mt-3 rounded border border-line bg-panel-2 px-2 py-2 text-xs text-subtle"
        }
        data-file-manager-archive-dry-run
      >
        {errorMessage
          ? `预检失败：${errorMessage}`
          : "输入归档名称后将自动预检目标路径和来源有效性。"}
      </div>
    );
  }
  const visibleErrors = preview.items
    .filter((item) => item.status === "error")
    .slice(0, 5);
  return (
    <div className="mt-3 grid gap-2 rounded border border-line bg-panel-2 p-3 text-xs" data-file-manager-archive-dry-run>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">打包预检</span>
        <span className="rounded-full bg-panel px-2 py-0.5 text-muted">
          {preview.counts.total} 项
        </span>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
          {preview.counts.ready} 可打包
        </span>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
          {preview.archiveFormat}
        </span>
        {preview.destinationExists ? (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger" data-file-manager-archive-target-conflict>
            目标已存在
          </span>
        ) : null}
        {preview.counts.errors ? (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">
            {preview.counts.errors} 错误
          </span>
        ) : null}
      </div>
      <div className="truncate rounded border border-line bg-panel px-2 py-1 font-mono text-[11px] text-muted" title={preview.archivePath}>
        输出：{preview.archivePath}
      </div>
      {preview.destinationExists ? (
        <div className="rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger">
          目标归档文件已经存在。为避免静默覆盖，请更换打包文件名。
        </div>
      ) : null}
      {visibleErrors.length ? (
        <div className="max-h-28 overflow-auto rounded border border-line bg-panel">
          {visibleErrors.map((item) => (
            <div key={item.sourcePath} className="grid gap-0.5 border-b border-line px-2 py-1 last:border-b-0">
              <span className="truncate font-mono text-[11px] text-ink-strong">{item.sourcePath}</span>
              <span className="truncate text-danger">{item.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChmodDryRunSummary({
  preview,
  busy,
  modeValid,
}: {
  preview: FilesChmodDryRunResponse | null;
  busy: boolean;
  modeValid: boolean;
}) {
  if (!modeValid)
    return (
      <div className="rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger">
        请输入 3-4 位八进制权限，例如 644 或 0755。
      </div>
    );
  if (busy)
    return (
      <div className="rounded border border-line bg-panel px-2 py-1 text-subtle">
        正在预检权限影响范围…
      </div>
    );
  if (!preview)
    return (
      <div className="rounded border border-line bg-panel px-2 py-1 text-subtle">
        将自动预检影响路径和当前权限。
      </div>
    );
  const visibleItems = preview.items.slice(0, 8);
  return (
    <div className="grid gap-2 rounded border border-line bg-panel p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">权限预检</span>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
          {preview.counts.total} 项
        </span>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
          {preview.counts.files} 文件
        </span>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
          {preview.counts.directories} 目录
        </span>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
          目标 {preview.mode}
        </span>
      </div>
      {preview.truncated ? (
        <div className="rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger">
          影响范围超过安全预览上限，请缩小选择后再执行。
        </div>
      ) : null}
      {visibleItems.length ? (
        <div className="max-h-32 overflow-auto rounded border border-line bg-panel-2">
          {visibleItems.map((item) => (
            <div
              key={item.path}
              className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 border-b border-line px-2 py-1 last:border-b-0"
            >
              <span className="truncate font-mono text-[11px] text-ink-strong">
                {item.path}
              </span>
              <span className="font-mono text-[11px] text-muted">
                {item.currentMode} → {item.nextMode}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UnarchiveDryRunSummary({
  preview,
  busy,
  errorMessage,
}: {
  preview: FilesUnarchiveDryRunResponse | null;
  busy: boolean;
  errorMessage?: string | null;
}) {
  if (busy) {
    return (
      <div className="rounded border border-line bg-panel px-2 py-1 text-subtle">
        正在预检归档内容…
      </div>
    );
  }
  if (!preview) {
    return (
      <div
        className={
          errorMessage
            ? "rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger"
            : "rounded border border-line bg-panel px-2 py-1 text-subtle"
        }
      >
        {errorMessage
          ? `预检失败：${errorMessage}`
          : "输入目标目录后将自动读取归档目录并预检冲突。"}
      </div>
    );
  }
  const counts = preview.counts;
  const risky = counts.conflicts + counts.overwrite + counts.errors;
  const visibleItems = preview.items
    .filter((item) => item.status !== "ready")
    .slice(0, 5);
  return (
    <div className="grid gap-2 rounded border border-line bg-panel p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">解压预检</span>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
          {counts.total} 项
        </span>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
          {counts.ready} 就绪
        </span>
        {counts.rename ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
            {counts.rename} 保留两者
          </span>
        ) : null}
        {counts.skip ? (
          <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
            {counts.skip} 跳过
          </span>
        ) : null}
        {risky ? (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">
            {risky} 风险
          </span>
        ) : null}
        {counts.errors ? (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">
            {counts.errors} 错误
          </span>
        ) : null}
      </div>
      {counts.conflicts || counts.errors ? (
        <div className="rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger">
          存在阻塞冲突或不安全条目，请选择覆盖、跳过或保留两者后再执行。
        </div>
      ) : null}
      {visibleItems.length ? (
        <div className="max-h-28 overflow-auto rounded border border-line bg-panel-2">
          {visibleItems.map((item) => (
            <div
              key={`${item.entryPath}:${item.status}:${item.destinationPath ?? ""}`}
              className="grid gap-0.5 border-b border-line px-2 py-1 last:border-b-0"
            >
              <span className="truncate font-mono text-[11px] text-ink-strong">
                {item.entryPath}
              </span>
              <span className="truncate text-subtle">
                {unarchiveStatusLabel(item.status)} ·{" "}
                {item.destinationPath ?? "—"}
                {item.message ? ` · ${item.message}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function unarchiveStatusLabel(
  status: FilesUnarchiveDryRunResponse["items"][number]["status"],
): string {
  if (status === "ready") return "可解压";
  if (status === "conflict") return "冲突";
  if (status === "overwrite") return "覆盖";
  if (status === "skip") return "跳过";
  if (status === "rename") return "重命名";
  return "错误";
}

function TransferDryRunSummary({
  preview,
  busy,
  errorMessage,
}: {
  preview: FilesTransferDryRunResponse | null;
  busy: boolean;
  errorMessage?: string | null;
}) {
  if (busy) {
    return (
      <div className="rounded border border-line bg-panel px-2 py-1 text-subtle">
        正在预检目标冲突…
      </div>
    );
  }
  if (!preview) {
    return (
      <div
        className={
          errorMessage
            ? "rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger"
            : "rounded border border-line bg-panel px-2 py-1 text-subtle"
        }
      >
        {errorMessage
          ? `预检失败：${errorMessage}`
          : "输入目标目录后将自动预检同名冲突。"}
      </div>
    );
  }
  const counts = preview.counts;
  const risky = counts.conflicts + counts.overwrite;
  const visibleItems = preview.items
    .filter((item) => item.status !== "ready")
    .slice(0, 5);
  return (
    <div className="grid gap-2 rounded border border-line bg-panel p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-strong">服务端预检</span>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
          {counts.total} 项
        </span>
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
          {counts.ready} 就绪
        </span>
        {counts.rename ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary">
            {counts.rename} 保留两者
          </span>
        ) : null}
        {counts.skip ? (
          <span className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
            {counts.skip} 跳过
          </span>
        ) : null}
        {risky ? (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">
            {risky} 风险
          </span>
        ) : null}
        {counts.errors ? (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">
            {counts.errors} 错误
          </span>
        ) : null}
      </div>
      {counts.conflicts ? (
        <div className="rounded border border-danger/20 bg-danger-soft px-2 py-1 text-danger">
          存在阻塞冲突，请选择覆盖、跳过或保留两者后再执行。
        </div>
      ) : null}
      {visibleItems.length ? (
        <div className="max-h-28 overflow-auto rounded border border-line bg-panel-2">
          {visibleItems.map((item) => (
            <div
              key={`${item.sourcePath}:${item.status}:${item.destinationPath ?? ""}`}
              className="grid gap-0.5 border-b border-line px-2 py-1 last:border-b-0"
            >
              <span className="truncate font-mono text-[11px] text-ink-strong">
                {item.sourcePath}
              </span>
              <span className="truncate text-subtle">
                {transferStatusLabel(item.status)} ·{" "}
                {item.destinationPath ?? "—"}
                {item.message ? ` · ${item.message}` : ""}
              </span>
            </div>
          ))}
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

function OverwriteConfirmField({
  value,
  onChange,
  count,
}: {
  value: string;
  onChange: (value: string) => void;
  count: number;
}) {
  return (
    <label className="grid gap-1 rounded border border-warning/30 bg-warning-soft/60 p-2 text-xs text-warning">
      <span>
        覆盖会替换 {count} 个目标同名项；输入 OVERWRITE 后才允许执行。
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="OVERWRITE"
        autoComplete="off"
        className="h-8 bg-panel text-xs"
        data-file-manager-overwrite-confirm
      />
    </label>
  );
}

function parentOf(filePath: string): string {
  const clean = filePath.replace(/\/+$/, "");
  const index = clean.lastIndexOf("/");
  return index > 0 ? clean.slice(0, index) : "";
}

function defaultArchiveName(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `archive-${stamp}.zip`;
}


function summarizeActionSelection(
  entries: FileEntrySummary[],
  paths: string[],
  fileCount: number,
  directoryCount: number,
): { heading: string; detail: string; sample: string[] } {
  const itemCount = Math.max(entries.length, paths.length);
  const firstNames = entries.slice(0, 3).map((entry) => entry.name);
  const heading = itemCount
    ? `将处理 ${itemCount} 项`
    : "未选择项目";
  const sampleText = firstNames.length
    ? `示例：${firstNames.join("、")}${itemCount > firstNames.length ? ` 等 ${itemCount} 项` : ""}`
    : "未加载到可展示的示例名称";
  return {
    heading,
    detail: `${fileCount} 个文件、${directoryCount} 个目录。${sampleText}`,
    sample: paths.slice(0, 8),
  };
}
