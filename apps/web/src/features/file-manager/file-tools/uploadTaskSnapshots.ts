import type { UploadJob } from "./uploadManager";
import type { UploadTaskSnapshot } from "./UploadTaskStrip";

export const WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY = "tracevane.workspace.upload.tasks.v1";
export const FILE_MANAGER_UPLOAD_TASK_SNAPSHOT_KEY = "tracevane.file-manager.upload.tasks.v1";
const MAX_UPLOAD_TASK_SNAPSHOTS = 100;
const UPLOAD_TASK_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const RECOVERABLE_UPLOAD_SNAPSHOT_STATUSES = new Set<UploadJob["status"]>([
  "queued",
  "preparing",
  "uploading",
  "paused",
  "error",
]);

export function snapshotsFromUploadJobs(jobs: UploadJob[]): UploadTaskSnapshot[] {
  return jobs.slice(0, MAX_UPLOAD_TASK_SNAPSHOTS).map((job) => ({
    fileName: job.relativePath ?? job.fileName,
    status: job.status,
    size: job.size,
    targetPath: job.targetPath,
    updatedAt: job.updatedAt,
  }));
}

export function loadUploadTaskSnapshots(storageKey: string): UploadTaskSnapshot[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UploadTaskSnapshot[];
    const now = Date.now();
    return Array.isArray(parsed)
      ? parsed
          .filter(isUploadTaskSnapshot)
          .filter((snapshot) => RECOVERABLE_UPLOAD_SNAPSHOT_STATUSES.has(snapshot.status))
          .filter((snapshot) => now - snapshot.updatedAt <= UPLOAD_TASK_SNAPSHOT_MAX_AGE_MS)
          .slice(0, MAX_UPLOAD_TASK_SNAPSHOTS)
      : [];
  } catch {
    return [];
  }
}

export function saveUploadTaskSnapshots(storageKey: string, snapshots: UploadTaskSnapshot[]): void {
  try {
    const safeSnapshots = snapshots.filter(isUploadTaskSnapshot).slice(0, MAX_UPLOAD_TASK_SNAPSHOTS);
    if (!safeSnapshots.length) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify(safeSnapshots));
  } catch {
    // Task snapshots are resumability hints only; storage failures must not block uploads.
  }
}

function isUploadTaskSnapshot(item: unknown): item is UploadTaskSnapshot {
  if (!item || typeof item !== "object") return false;
  const snapshot = item as Partial<UploadTaskSnapshot>;
  return typeof snapshot.fileName === "string"
    && typeof snapshot.size === "number"
    && typeof snapshot.updatedAt === "number"
    && (
      snapshot.status === "queued"
      || snapshot.status === "preparing"
      || snapshot.status === "uploading"
      || snapshot.status === "paused"
      || snapshot.status === "done"
      || snapshot.status === "skipped"
      || snapshot.status === "error"
      || snapshot.status === "canceled"
    );
}
