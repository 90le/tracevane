import {
  cancelFileUpload,
  completeFileUpload,
  getFileUpload,
  initFileUpload,
  uploadFileChunk,
} from "@/lib/api/files";
import type { FilesMutationResponse, FilesUploadConflictPolicy } from "./types";

export type UploadJobStatus = "queued" | "preparing" | "uploading" | "paused" | "done" | "skipped" | "error" | "canceled";

export interface UploadJob {
  id: string;
  file: File;
  fileName: string;
  relativePath?: string;
  size: number;
  loaded: number;
  total: number;
  speedBps: number;
  status: UploadJobStatus;
  error?: string;
  updatedAt: number;
  uploadId?: string;
  chunkCount?: number;
  uploadedChunks?: number[];
  activeChunks?: number;
  targetPath?: string;
}

export interface UploadBatchOptions {
  rootId: string;
  directoryPath: string;
  files: File[];
  overwrite?: boolean;
  conflictPolicy?: FilesUploadConflictPolicy;
  onJobsChange?: (jobs: UploadJob[]) => void;
}

export interface UploadBatchHandle {
  jobs: UploadJob[];
  pause: () => void;
  resume: () => Promise<FilesMutationResponse[]>;
  cancel: () => void;
  done: Promise<FilesMutationResponse[]>;
}

export interface UploadCheckpointStorageKeyOptions {
  rootId: string;
  directoryPath: string;
  file: File;
  overwrite?: boolean;
  conflictPolicy?: FilesUploadConflictPolicy;
}

export function getUploadCheckpointStorageKey(options: UploadCheckpointStorageKeyOptions): string {
  return `${CHECKPOINT_PREFIX}${encodeURIComponent(uploadFingerprintParts({
    rootId: options.rootId,
    directoryPath: options.directoryPath,
    conflictPolicy: options.conflictPolicy ?? (options.overwrite === true ? "overwrite" : "rename"),
    filePath: normalizeUploadRelativePath(options.file) || options.file.name,
    size: options.file.size,
    lastModified: options.file.lastModified,
  }))}`;
}

export const UPLOAD_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = UPLOAD_CHUNK_SIZE_BYTES;
const MAX_CONCURRENT_CHUNKS = 3;
const MAX_CHUNK_RETRIES = 2;
const CHECKPOINT_PREFIX = "tracevane.workspace.upload.v1:";
const MAX_HASH_BYTES = 512 * 1024 * 1024;

interface JobRuntime {
  uploadedChunks: Set<number>;
  activeBytes: Map<number, number>;
  controllers: Set<AbortController>;
  completedBytes: number;
  startedAt: number;
}

export function createUploadBatch(options: UploadBatchOptions): UploadBatchHandle {
  const jobs = options.files.map((file) => createJob(file));
  const runtimes = new Map<string, JobRuntime>();
  let paused = false;
  let canceled = false;
  let running: Promise<FilesMutationResponse[]> | null = null;

  const emit = () => options.onJobsChange?.(jobs.map((job) => ({ ...job })));

  async function run(): Promise<FilesMutationResponse[]> {
    if (running) return running;
    running = (async () => {
      const results: FilesMutationResponse[] = [];
      for (const job of jobs) {
        if (canceled) break;
        if (job.status === "done") continue;
        if (paused) {
          markPaused(job);
          emit();
          break;
        }
        try {
          const result = await uploadJob(job, options, runtimes, () => paused, () => canceled, emit);
          results.push(result);
        } catch (error) {
          if (canceled) {
            job.status = "canceled";
            job.error = "已取消";
          } else if (paused || isAbortError(error)) {
            job.status = "paused";
            job.error = undefined;
          } else {
            job.status = "error";
            job.error = error instanceof Error ? error.message : String(error);
          }
          job.updatedAt = Date.now();
          emit();
          if (!paused && !canceled) break;
        }
      }
      return results;
    })().finally(() => {
      running = null;
    });
    return running;
  }

  const handle: UploadBatchHandle = {
    jobs,
    pause: () => {
      paused = true;
      for (const job of jobs) {
        if (job.status === "uploading" || job.status === "preparing") {
          abortRuntime(runtimes.get(job.id));
          markPaused(job);
        }
      }
      emit();
    },
    resume: async () => {
      paused = false;
      for (const job of jobs) {
        if (job.status === "paused" || job.status === "error") {
          job.status = "queued";
          job.error = undefined;
          job.updatedAt = Date.now();
        }
      }
      emit();
      return run();
    },
    cancel: () => {
      canceled = true;
      for (const job of jobs) {
        abortRuntime(runtimes.get(job.id));
        if (job.uploadId) void cancelFileUpload({ uploadId: job.uploadId }).catch(() => undefined);
        removeUploadCheckpoint(uploadCheckpointKey(options, job));
        if (job.status !== "done" && job.status !== "skipped") {
          job.status = "canceled";
          job.error = "已取消";
          job.updatedAt = Date.now();
        }
      }
      emit();
    },
    done: run(),
  };

  emit();
  return handle;
}

function createJob(file: File): UploadJob {
  const relativePath = normalizeUploadRelativePath(file);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    fileName: file.name,
    relativePath: relativePath && relativePath !== file.name ? relativePath : undefined,
    size: file.size,
    loaded: 0,
    total: file.size,
    speedBps: 0,
    status: "queued",
    updatedAt: Date.now(),
  };
}

async function uploadJob(
  job: UploadJob,
  options: UploadBatchOptions,
  runtimes: Map<string, JobRuntime>,
  isPaused: () => boolean,
  isCanceled: () => boolean,
  emit: () => void,
): Promise<FilesMutationResponse> {
  const runtime = getRuntime(runtimes, job);
  if (!job.uploadId) {
    job.status = "preparing";
    job.loaded = runtime.completedBytes;
    job.total = job.size;
    job.speedBps = 0;
    job.error = undefined;
    job.updatedAt = Date.now();
    emit();

    const conflictPolicy = options.conflictPolicy ?? (options.overwrite === true ? "overwrite" : "rename");
    const sha256 = await hashFileIfUseful(job.file);
    const checkpointKey = uploadCheckpointKey(options, job);
    const checkpoint = loadUploadCheckpoint(checkpointKey);
    const init = checkpoint
      ? await resumeUploadFromCheckpoint(checkpoint.uploadId).catch(() => {
          removeUploadCheckpoint(checkpointKey);
          return null;
        })
      : null;
    const uploadState = init ?? await initFileUpload({
      rootId: options.rootId,
      directoryPath: options.directoryPath,
      fileName: job.fileName,
      relativePath: job.relativePath,
      size: job.size,
      chunkSize: DEFAULT_CHUNK_SIZE,
      conflictPolicy,
      sha256,
    });
    if (uploadState.skipped) {
      job.uploadId = uploadState.uploadId;
      job.chunkCount = 0;
      job.loaded = job.size;
      job.total = job.size;
      job.speedBps = 0;
      job.status = "skipped";
      job.targetPath = uploadState.targetPath;
      job.updatedAt = Date.now();
      emit();
      return {
        success: true,
        action: "upload",
        message: `Skipped ${job.fileName}`,
        affectedPaths: [],
      };
    }
    if (uploadState.instant) {
      job.uploadId = uploadState.uploadId;
      job.chunkCount = 0;
      job.loaded = job.size;
      job.total = job.size;
      job.speedBps = 0;
      job.status = "done";
      job.targetPath = uploadState.targetPath;
      job.updatedAt = Date.now();
      emit();
      return {
        success: true,
        action: "upload",
        message: `Uploaded ${job.fileName}`,
        affectedPaths: [uploadState.targetPath],
      };
    }
    job.uploadId = uploadState.uploadId;
    job.chunkCount = uploadState.chunkCount;
    job.targetPath = uploadState.targetPath;
    runtime.uploadedChunks = new Set(uploadState.uploadedChunks);
    runtime.completedBytes = completedBytesFor(job, runtime.uploadedChunks);
    job.uploadedChunks = Array.from(runtime.uploadedChunks).sort((a, b) => a - b);
    saveUploadCheckpoint(checkpointKey, {
      uploadId: uploadState.uploadId,
      uploadedChunks: job.uploadedChunks,
      chunkCount: uploadState.chunkCount,
      targetPath: uploadState.targetPath,
      updatedAt: Date.now(),
    });
  }

  if (isPaused() || isCanceled()) throw new DOMException("Upload paused", "AbortError");

  job.status = "uploading";
  job.total = job.size;
  updateJobProgress(job, runtime);
  emit();

  const chunkCount = job.chunkCount ?? Math.ceil(job.size / DEFAULT_CHUNK_SIZE);
  if (chunkCount > 0) {
    await uploadMissingChunks(job, runtime, uploadCheckpointKey(options, job), isPaused, isCanceled, emit);
  }

  if (isPaused() || isCanceled()) throw new DOMException("Upload paused", "AbortError");

  const uploadId = job.uploadId;
  if (!uploadId) throw new Error("Upload was not initialized");
  const result = await completeFileUpload({ uploadId });
  removeUploadCheckpoint(uploadCheckpointKey(options, job));
  job.status = "done";
  job.loaded = job.size;
  job.total = job.size;
  job.speedBps = 0;
  job.activeChunks = 0;
  job.uploadedChunks = Array.from(runtime.uploadedChunks).sort((a, b) => a - b);
  job.updatedAt = Date.now();
  emit();
  return result;
}

async function uploadMissingChunks(
  job: UploadJob,
  runtime: JobRuntime,
  checkpointKey: string,
  isPaused: () => boolean,
  isCanceled: () => boolean,
  emit: () => void,
): Promise<void> {
  const uploadId = job.uploadId;
  const chunkCount = job.chunkCount ?? Math.ceil(job.size / DEFAULT_CHUNK_SIZE);
  if (!uploadId) throw new Error("Upload was not initialized");
  const uploadIdValue = uploadId;

  let cursor = 0;
  const scheduledChunks = new Set<number>();
  async function worker(): Promise<void> {
    while (!isPaused() && !isCanceled()) {
      const index = nextMissingChunk(cursor, chunkCount, runtime.uploadedChunks, scheduledChunks);
      if (index == null) return;
      cursor = index + 1;
      scheduledChunks.add(index);
      try {
        await uploadChunkWithRetry(job, runtime, uploadIdValue, checkpointKey, index, isPaused, isCanceled, emit);
      } finally {
        scheduledChunks.delete(index);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_CHUNKS, chunkCount) }, () => worker()));
  if (isPaused() || isCanceled()) throw new DOMException("Upload paused", "AbortError");
  if (runtime.uploadedChunks.size !== chunkCount) throw new Error("Upload is missing chunks");
}

async function uploadChunkWithRetry(
  job: UploadJob,
  runtime: JobRuntime,
  uploadId: string,
  checkpointKey: string,
  chunkIndex: number,
  isPaused: () => boolean,
  isCanceled: () => boolean,
  emit: () => void,
): Promise<void> {
  let attempt = 0;
  while (attempt <= MAX_CHUNK_RETRIES) {
    if (isPaused() || isCanceled()) throw new DOMException("Upload paused", "AbortError");
    const controller = new AbortController();
    runtime.controllers.add(controller);
    runtime.activeBytes.set(chunkIndex, 0);
    try {
      const start = chunkIndex * DEFAULT_CHUNK_SIZE;
      const end = Math.min(job.size, start + DEFAULT_CHUNK_SIZE);
      const response = await uploadFileChunk(
        uploadId,
        chunkIndex,
        job.file.slice(start, end),
        (progress) => {
          runtime.activeBytes.set(chunkIndex, Math.min(progress.loaded, progress.total || progress.loaded));
          updateJobProgress(job, runtime);
          emit();
        },
        controller.signal,
      );
      runtime.uploadedChunks = new Set([
        ...runtime.uploadedChunks,
        ...response.uploadedChunks,
        chunkIndex,
      ]);
      runtime.activeBytes.delete(chunkIndex);
      runtime.completedBytes = completedBytesFor(job, runtime.uploadedChunks);
      job.uploadedChunks = Array.from(runtime.uploadedChunks).sort((a, b) => a - b);
      saveUploadCheckpoint(checkpointKey, {
        uploadId,
        uploadedChunks: job.uploadedChunks,
        chunkCount: job.chunkCount ?? 0,
        targetPath: job.targetPath ?? "",
        updatedAt: Date.now(),
      });
      updateJobProgress(job, runtime);
      emit();
      return;
    } catch (error) {
      runtime.activeBytes.delete(chunkIndex);
      updateJobProgress(job, runtime);
      if (isPaused() || isCanceled() || isAbortError(error)) throw error;
      attempt += 1;
      if (attempt > MAX_CHUNK_RETRIES) throw error;
      await delay(250 * attempt);
    } finally {
      runtime.controllers.delete(controller);
    }
  }
}

function getRuntime(runtimes: Map<string, JobRuntime>, job: UploadJob): JobRuntime {
  let runtime = runtimes.get(job.id);
  if (!runtime) {
    runtime = {
      uploadedChunks: new Set(job.uploadedChunks ?? []),
      activeBytes: new Map(),
      controllers: new Set(),
      completedBytes: 0,
      startedAt: Date.now(),
    };
    runtimes.set(job.id, runtime);
  }
  return runtime;
}

function nextMissingChunk(cursor: number, chunkCount: number, uploadedChunks: Set<number>, scheduledChunks: Set<number>): number | null {
  for (let index = cursor; index < chunkCount; index += 1) {
    if (!uploadedChunks.has(index) && !scheduledChunks.has(index)) return index;
  }
  for (let index = 0; index < cursor; index += 1) {
    if (!uploadedChunks.has(index) && !scheduledChunks.has(index)) return index;
  }
  return null;
}

function completedBytesFor(job: UploadJob, uploadedChunks: Set<number>): number {
  let total = 0;
  for (const index of uploadedChunks) {
    const start = index * DEFAULT_CHUNK_SIZE;
    const end = Math.min(job.size, start + DEFAULT_CHUNK_SIZE);
    total += Math.max(0, end - start);
  }
  return total;
}

function updateJobProgress(job: UploadJob, runtime: JobRuntime): void {
  const activeBytes = Array.from(runtime.activeBytes.values()).reduce((sum, value) => sum + value, 0);
  const loaded = Math.min(job.size, runtime.completedBytes + activeBytes);
  const now = Date.now();
  const elapsedSeconds = Math.max(0.001, (now - runtime.startedAt) / 1000);
  job.loaded = loaded;
  job.total = job.size;
  job.speedBps = loaded / elapsedSeconds;
  job.activeChunks = runtime.controllers.size;
  job.updatedAt = now;
}

function abortRuntime(runtime: JobRuntime | undefined): void {
  for (const controller of runtime?.controllers ?? []) controller.abort();
}

function markPaused(job: UploadJob): void {
  if (job.status !== "done" && job.status !== "skipped" && job.status !== "canceled") {
    job.status = "paused";
    job.activeChunks = 0;
    job.updatedAt = Date.now();
  }
}

interface UploadCheckpoint {
  uploadId: string;
  uploadedChunks: number[];
  chunkCount: number;
  targetPath: string;
  updatedAt: number;
}

function uploadFingerprint(options: UploadBatchOptions, job: UploadJob): string {
  return uploadFingerprintParts({
    rootId: options.rootId,
    directoryPath: options.directoryPath,
    conflictPolicy: options.conflictPolicy ?? (options.overwrite === true ? "overwrite" : "rename"),
    filePath: job.relativePath ?? job.fileName,
    size: job.size,
    lastModified: job.file.lastModified,
  });
}

function uploadFingerprintParts(input: {
  rootId: string;
  directoryPath: string;
  conflictPolicy: FilesUploadConflictPolicy;
  filePath: string;
  size: number;
  lastModified: number;
}): string {
  return [
    input.rootId,
    input.directoryPath || "",
    input.conflictPolicy,
    input.filePath,
    input.size,
    input.lastModified,
  ].join("|");
}

function uploadCheckpointKey(options: UploadBatchOptions, job: UploadJob): string {
  return `${CHECKPOINT_PREFIX}${encodeURIComponent(uploadFingerprint(options, job))}`;
}

async function resumeUploadFromCheckpoint(uploadId: string) {
  return getFileUpload(uploadId);
}

function loadUploadCheckpoint(key: string): UploadCheckpoint | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UploadCheckpoint>;
    if (!parsed.uploadId || !Array.isArray(parsed.uploadedChunks)) return null;
    return {
      uploadId: parsed.uploadId,
      uploadedChunks: parsed.uploadedChunks.filter((value): value is number => Number.isInteger(value) && value >= 0),
      chunkCount: Number(parsed.chunkCount) || 0,
      targetPath: typeof parsed.targetPath === "string" ? parsed.targetPath : "",
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

function saveUploadCheckpoint(key: string, checkpoint: UploadCheckpoint): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(checkpoint));
  } catch {
    // Storage can be unavailable or full; upload still works without persisted resume.
  }
}

function removeUploadCheckpoint(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

async function hashFileIfUseful(file: File): Promise<string | undefined> {
  if (!window.crypto?.subtle) return undefined;
  if (file.size <= 0 || file.size > MAX_HASH_BYTES) return undefined;
  try {
    const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

function normalizeUploadRelativePath(file: File): string | undefined {
  const maybeRelative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return maybeRelative?.split("/").filter(Boolean).join("/");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
