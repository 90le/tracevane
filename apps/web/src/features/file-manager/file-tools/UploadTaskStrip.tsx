import { Upload } from "lucide-react";

import type { UploadJob } from "./uploadManager";
import { estimateRemaining, formatBytes } from "./uploadFormatting";

export interface UploadTaskSnapshot {
  fileName: string;
  status: UploadJob["status"];
  size: number;
  targetPath?: string;
  updatedAt: number;
}

export function UploadTaskStrip({
  jobs,
  snapshots,
  onOpen,
  onPause,
  onResume,
  onCancel,
}: {
  jobs: UploadJob[];
  snapshots: UploadTaskSnapshot[];
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const live = jobs.length > 0;
  const rows = live ? jobs : snapshots;
  const total = live
    ? jobs.reduce((sum, job) => sum + (job.total || job.size), 0)
    : rows.reduce((sum, job) => sum + job.size, 0);
  const loaded = live
    ? jobs.reduce(
        (sum, job) => sum + Math.min(job.loaded, job.total || job.size),
        0,
      )
    : 0;
  const active =
    live &&
    jobs.some(
      (job) =>
        job.status === "preparing" ||
        job.status === "uploading" ||
        job.status === "queued",
    );
  const failed = rows.filter((job) => job.status === "error").length;
  const done = rows.filter(
    (job) => job.status === "done" || job.status === "skipped",
  ).length;
  const percent = live
    ? total > 0
      ? Math.round((loaded / total) * 100)
      : done === rows.length
        ? 100
        : 0
    : done === rows.length
      ? 100
      : 0;
  const speed = live ? jobs.reduce((sum, job) => sum + job.speedBps, 0) : 0;
  const remaining = live ? estimateRemaining(total, loaded, speed) : "待恢复";

  return (
    <div
      className="border-t border-line bg-panel-2 px-3 py-1.5 text-xs shadow-sm"
      data-upload-task-strip
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left font-medium text-ink-strong transition-colors duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:text-primary focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
          onClick={onOpen}
        >
          <Upload className="size-3.5 shrink-0 text-primary" />
          <span className="truncate tabular-nums">
            {live ? "上传任务" : "待恢复上传"} {done}/{rows.length}
            {failed ? ` · ${failed} 失败` : ""}
          </span>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-panel-3">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-[var(--dur-2)] ease-[var(--ease-standard)]"
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <span className="shrink-0 tabular-nums text-primary">{percent}%</span>
        </div>
        <span className="min-w-0 shrink truncate text-2xs text-subtle">
          {live ? `速度 ${formatBytes(speed)}/s` : `${rows.length} 个任务快照`}
          {" · 剩余 "}
          {remaining}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
          <button
            type="button"
            className="rounded-sm px-2 py-1 text-primary transition-colors duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:bg-primary-soft focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
            onClick={live ? (active ? onPause : onResume) : onOpen}
          >
            {live ? (active ? "暂停" : "继续") : "重新选择文件恢复"}
          </button>
          <button
            type="button"
            className="rounded-sm px-2 py-1 text-muted transition-colors duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:bg-danger-soft hover:text-danger focus-visible:shadow-[var(--ring)] focus-visible:outline-none disabled:opacity-40"
            onClick={onCancel}
            disabled={!live}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
