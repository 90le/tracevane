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
    <div className="border-t border-line bg-panel-2 px-2 py-2 text-xs" data-upload-task-strip>
      <button
        type="button"
        className="mb-1 flex w-full items-center justify-between gap-2 text-left text-muted hover:text-ink"
        onClick={onOpen}
      >
        <span className="truncate">
          {live ? "上传任务" : "待恢复上传"} {done}/{rows.length}
          {failed ? ` · ${failed} 失败` : ""}
        </span>
        <span className="shrink-0 text-primary">{percent}%</span>
      </button>
      <div className="mb-1 h-1 overflow-hidden rounded-full bg-panel">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <div className="mb-1 flex items-center justify-between gap-2 text-2xs text-subtle">
        <span>
          {live ? `速度 ${formatBytes(speed)}/s` : `${rows.length} 个任务快照`}
        </span>
        <span>剩余 {remaining}</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="text-primary hover:text-ink"
          onClick={live ? (active ? onPause : onResume) : onOpen}
        >
          {live ? (active ? "暂停" : "继续") : "重新选择文件恢复"}
        </button>
        <button
          type="button"
          className="text-muted hover:text-danger disabled:opacity-40"
          onClick={onCancel}
          disabled={!live}
        >
          取消
        </button>
      </div>
    </div>
  );
}
