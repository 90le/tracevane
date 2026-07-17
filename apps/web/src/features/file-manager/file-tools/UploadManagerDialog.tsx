import * as React from "react";
import {
  FolderUp,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Upload,
  XCircle,
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

import type { UploadJob } from "./uploadManager";
import { UPLOAD_CHUNK_SIZE_BYTES } from "./uploadManager";
import type { FilesUploadConflictPolicy } from "./types";
import { estimateRemaining, formatBytes } from "./uploadFormatting";
import {
  collectUploadFilesFromDataTransfer,
  uploadFilesClipboardFingerprint,
} from "./uploadInputs";

export function UploadManagerDialog({
  open,
  targetDirectory,
  files,
  jobs,
  activeUpload,
  conflictPolicy,
  onChangeConflictPolicy,
  onChangeTargetDirectory,
  onChooseFiles,
  onChooseFolder,
  onPasteFiles,
  onClear,
  onRemoveFile,
  onStart,
  onPause,
  onResume,
  onCancelUpload,
  onOpenChange,
}: {
  open: boolean;
  targetDirectory: string;
  files: File[];
  jobs: UploadJob[];
  activeUpload: boolean;
  conflictPolicy: FilesUploadConflictPolicy;
  onChangeConflictPolicy: (policy: FilesUploadConflictPolicy) => void;
  onChangeTargetDirectory?: (directoryPath: string) => void;
  onChooseFiles: () => void;
  onChooseFolder: () => void;
  onPasteFiles: (files: File[]) => void;
  onClear: () => void;
  onRemoveFile: (index: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancelUpload: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const hasJobs = jobs.length > 0;
  const resumable = jobs.some((job) => job.status === "paused" || job.status === "error");
  const recentPasteRef = React.useRef<{ key: string; at: number } | null>(null);

  const handlePaste = React.useCallback((event: ClipboardEvent | React.ClipboardEvent) => {
    const dataTransfer = event.clipboardData;
    if (!dataTransfer?.files?.length && !dataTransfer?.items?.length) return;
    event.preventDefault();
    void collectUploadFilesFromDataTransfer(dataTransfer)
      .then((files) => {
        if (!files.length) return;
        const fingerprint = uploadFilesClipboardFingerprint(files);
        const now = Date.now();
        const recent = recentPasteRef.current;
        if (recent?.key === fingerprint && now - recent.at < 1000) return;
        recentPasteRef.current = { key: fingerprint, at: now };
        onPasteFiles(files);
      })
      .catch(() => undefined);
  }, [onPasteFiles]);

  React.useEffect(() => {
    if (!open) return;
    const onWindowPaste = (event: ClipboardEvent) => handlePaste(event);
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [handlePaste, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>上传文件到 {displayDir(targetDirectory)}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            支持单文件、批量文件、文件夹上传；进度、速率、暂停、错误诊断和文件级续传在这里统一管理。
          </DialogDescription>
        </DialogBody>
        <div
          className="grid min-h-[420px] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-4 px-5 pb-3 pt-2 outline-none"
          tabIndex={0}
        >
          <div className="grid gap-2 rounded-md border border-line bg-panel-2 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="grid gap-1 text-xs text-muted">
              上传目标目录
              <Input
                value={targetDirectory}
                disabled={activeUpload || !onChangeTargetDirectory}
                onChange={(event) => onChangeTargetDirectory?.(event.target.value)}
                placeholder="留空为当前 root，例如 docs 或 apps/web/src"
                aria-label="上传目标目录"
                className="h-8 bg-panel text-xs"
              />
            </label>
            <label className="grid gap-1 text-xs text-muted">
              重名处理
              <select
                value={conflictPolicy}
                aria-label="上传重名处理"
                disabled={activeUpload}
                onChange={(event) => onChangeConflictPolicy(event.target.value as FilesUploadConflictPolicy)}
                className="h-8 rounded-sm border border-line bg-panel px-2 py-1 text-ink outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="rename">保留两者</option>
                <option value="overwrite">覆盖</option>
                <option value="skip">跳过</option>
                <option value="fail">冲突时报错</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onChooseFiles} disabled={activeUpload}>
              <Upload className="size-4" />
              选择文件
            </Button>
            <Button variant="outline" size="sm" onClick={onChooseFolder} disabled={activeUpload} data-upload-manager-choose-folder>
              <FolderUp className="size-4" />
              选择文件夹
            </Button>
            <span className="rounded-full border border-primary-line bg-primary-soft px-2 py-1 text-2xs text-primary" data-upload-manager-resumable-badge>
              分片续传 · {formatBytes(UPLOAD_CHUNK_SIZE_BYTES)} / chunk
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear} disabled={activeUpload && !resumable && !hasJobs}>
              清空列表
            </Button>
          </div>

          {hasJobs ? <UploadProgressPanel jobs={jobs} onPause={onPause} onResume={onResume} onCancel={onCancelUpload} /> : null}

          <UploadFileTable files={files} jobs={jobs} onRemoveFile={onRemoveFile} disabled={activeUpload} />
          <div className="text-2xs text-subtle">提示：上传窗口打开时，可直接粘贴剪贴板里的截图或文件；资源管理器聚焦时也可直接粘贴快速上传。</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {resumable && !activeUpload ? (
            <Button
              variant="outline"
              onClick={onResume}
              data-upload-manager-retry-resume
            >
              <RotateCcw className="size-4" />
              继续/重试失败
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={onStart}
            disabled={files.length === 0 || activeUpload}
          >
            {hasJobs ? "重新开始全部" : "开始上传"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadFileTable({
  files,
  jobs,
  disabled,
  onRemoveFile,
}: {
  files: File[];
  jobs: UploadJob[];
  disabled: boolean;
  onRemoveFile: (index: number) => void;
}) {
  const rows = jobs.length > 0 ? jobs : files.map((file, index) => ({
    id: `${file.name}-${index}`,
    fileName: file.name,
    relativePath: relativePathOf(file),
    size: file.size,
    loaded: 0,
    total: file.size,
    speedBps: 0,
    status: "queued" as const,
    updatedAt: 0,
    targetPath: undefined,
    file,
  }));

  return (
    <div className="min-h-0 overflow-hidden rounded-md border border-line bg-panel">
      <div className="grid grid-cols-[minmax(0,1fr)_110px_160px_90px] border-b border-line px-3 py-2 text-xs font-medium text-subtle">
        <span>文件名</span>
        <span>文件大小</span>
        <span>上传状态 / 速率</span>
        <span>操作</span>
      </div>
      <div className="max-h-[300px] min-h-[220px] overflow-auto">
        {rows.length === 0 ? (
          <div className="grid h-[220px] place-items-center text-sm text-muted">先选择文件或文件夹，再开始上传。</div>
        ) : (
          rows.map((row, index) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_110px_160px_90px] items-center border-b border-line px-3 py-2 text-sm last:border-b-0">
              <span className="truncate text-ink" title={row.targetPath ? `${row.relativePath ?? row.fileName} → ${row.targetPath}` : row.relativePath ?? row.fileName}>
                {row.relativePath ?? row.fileName}
                {row.targetPath && row.targetPath !== (row.relativePath ?? row.fileName) ? (
                  <span className="ml-1 text-2xs text-subtle">→ {row.targetPath}</span>
                ) : null}
              </span>
              <span className="text-muted">{formatBytes(row.size)}</span>
              <span className={cn("grid gap-1 text-muted", row.status === "error" && "text-danger")} title={"error" in row && row.error ? row.error : undefined}>
                <span>{uploadStatusLabel(row.status)}{row.status === "uploading" ? ` · ${formatBytes(row.speedBps)}/s` : ""}</span>
                <span className="h-1 overflow-hidden rounded-full bg-panel-2">
                  <span className={cn("block h-full transition-all", row.status === "error" ? "bg-danger" : "bg-primary")} style={{ width: `${uploadProgressPercent(row)}%` }} />
                </span>
              </span>
              <button type="button" disabled={disabled} onClick={() => onRemoveFile(index)} className="text-left text-primary disabled:cursor-not-allowed disabled:opacity-40">
                移除
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UploadProgressPanel({
  jobs,
  onPause,
  onResume,
  onCancel,
}: {
  jobs: UploadJob[];
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const total = jobs.reduce((sum, job) => sum + (job.total || job.size), 0);
  const loaded = jobs.reduce((sum, job) => sum + Math.min(job.loaded, job.total || job.size), 0);
  const active = jobs.some((job) => job.status === "preparing" || job.status === "uploading" || job.status === "queued");
  const resumable = jobs.some((job) => job.status === "paused" || job.status === "error");
  const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
  const speed = jobs.reduce((sum, job) => sum + job.speedBps, 0);
  const uploadedCount = jobs.filter((job) => job.status === "done" || job.status === "skipped").length;

  return (
    <section className="rounded-md border border-primary-line bg-primary-soft p-3 text-xs" data-upload-manager-progress-panel>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-primary">
        <span className="font-semibold" data-upload-manager-total-progress>总进度：{percent}%</span>
        <span className="text-primary/70">正在上传：({uploadedCount}/{jobs.length})</span>
        <span className="text-primary/70" data-upload-manager-speed>上传速度：{formatBytes(speed)}/s</span>
        <span className="text-primary/70" data-upload-manager-remaining>预计耗时：{estimateRemaining(total, loaded, speed)}</span>
        <button type="button" className="ml-auto rounded border border-primary-line bg-panel px-2 py-0.5 text-2xs text-primary hover:text-ink" onClick={() => copyUploadDiagnostics(jobs)}>复制诊断</button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-primary-line bg-panel px-2 py-0.5 text-2xs text-primary hover:text-ink"
          onClick={active ? onPause : onResume}
          title={active ? "暂停" : "继续/重试失败"}
          aria-label={active ? "暂停上传" : "继续或重试失败上传"}
          data-upload-manager-inline-retry-resume
        >
          {active ? <PauseCircle className="size-4" /> : <PlayCircle className="size-4" />}
          {active ? "暂停" : "继续/重试"}
        </button>
        <button type="button" className="text-primary hover:text-danger" onClick={onCancel} title="取消">
          <XCircle className="size-4" />
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel" data-upload-manager-progress-track>
        <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <UploadFailureSummary jobs={jobs} />
      {resumable ? <div className="mt-2 text-2xs text-muted">支持按分片检查点续传：重新选择同一文件后可继续未完成分片。</div> : null}
    </section>
  );
}

function displayDir(dir: string): string {
  return dir ? dir : "/（当前 root）";
}

function relativePathOf(file: File): string | undefined {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined;
}

function uploadStatusLabel(status: UploadJob["status"]): string {
  switch (status) {
    case "preparing":
      return "准备中";
    case "uploading":
      return "上传中";
    case "paused":
      return "已暂停";
    case "done":
      return "已完成";
    case "skipped":
      return "已跳过";
    case "error":
      return "失败";
    case "canceled":
      return "已取消";
    case "queued":
    default:
      return "等待上传";
  }
}

function UploadFailureSummary({ jobs }: { jobs: UploadJob[] }) {
  const failures = jobs.filter((job) => job.status === "error" || job.status === "canceled");
  if (!failures.length) return null;
  return (
    <div className="mt-2 rounded border border-danger-line bg-danger-soft p-2 text-2xs text-danger" data-upload-manager-failure-summary>
      <div className="font-semibold">失败/取消任务 {failures.length} 个</div>
      <div className="mt-1 grid max-h-20 gap-1 overflow-auto">
        {failures.slice(0, 4).map((job) => (
          <div key={job.id} className="truncate" title={job.error ?? job.fileName}>
            {job.relativePath ?? job.fileName}: {job.error ?? uploadStatusLabel(job.status)}
          </div>
        ))}
      </div>
    </div>
  );
}

function uploadProgressPercent(row: Pick<UploadJob, "loaded" | "total" | "size" | "status">): number {
  if (row.status === "done" || row.status === "skipped") return 100;
  const total = row.total || row.size;
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((row.loaded / total) * 100)));
}

function copyUploadDiagnostics(jobs: UploadJob[]): void {
  const payload = jobs.map((job) => ({
    fileName: job.fileName,
    relativePath: job.relativePath,
    size: job.size,
    loaded: job.loaded,
    total: job.total,
    progress: uploadProgressPercent(job),
    speedBps: Math.round(job.speedBps),
    status: job.status,
    error: job.error,
    uploadId: job.uploadId,
    chunkCount: job.chunkCount,
    uploadedChunkCount: job.uploadedChunks?.length ?? 0,
    activeChunks: job.activeChunks ?? 0,
    targetPath: job.targetPath,
    updatedAt: new Date(job.updatedAt).toISOString(),
  }));
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => undefined);
  }
}
