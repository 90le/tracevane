export interface ChannelConnectorWorkspaceExecutionLease {
  workspaceKey: string;
  queuedAt: string | null;
  acquiredAt: string;
  release(): void;
}

export interface ChannelConnectorWorkspaceExecutionStatus {
  workspaceKey: string;
  active: number;
  queued: number;
  maxActive: number;
}

interface PendingAcquire {
  queuedAt: string;
  signal: AbortSignal | null;
  resolve: (lease: ChannelConnectorWorkspaceExecutionLease) => void;
  reject: (error: Error) => void;
  abortHandler: (() => void) | null;
}

interface WorkspaceBucket {
  active: number;
  maxActive: number;
  queue: PendingAcquire[];
}

export class ChannelConnectorWorkspaceQueueFullError extends Error {
  readonly workspaceKey: string;

  constructor(workspaceKey: string) {
    super(`Channel Connector workspace queue is full: ${workspaceKey}`);
    this.name = "ChannelConnectorWorkspaceQueueFullError";
    this.workspaceKey = workspaceKey;
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export class ChannelConnectorTargetExecutionCoordinator {
  private readonly buckets = new Map<string, WorkspaceBucket>();

  acquire(input: {
    workspaceKey: string;
    maxActive?: number;
    queueLimit?: number;
    signal?: AbortSignal | null;
  }): Promise<ChannelConnectorWorkspaceExecutionLease> {
    const workspaceKey = input.workspaceKey.trim();
    if (!workspaceKey) return Promise.reject(new Error("Channel Connector workspace key is required."));
    if (input.signal?.aborted) {
      return Promise.reject(input.signal.reason instanceof Error
        ? input.signal.reason
        : new Error("Channel Connector workspace acquire aborted."));
    }
    const maxActive = positiveInteger(input.maxActive, 1);
    const queueLimit = nonNegativeInteger(input.queueLimit, 20);
    const bucket = this.buckets.get(workspaceKey) || {
      active: 0,
      maxActive,
      queue: [],
    };
    bucket.maxActive = Math.min(bucket.maxActive, maxActive);
    this.buckets.set(workspaceKey, bucket);
    if (bucket.active < bucket.maxActive) {
      bucket.active += 1;
      return Promise.resolve(this.createLease(workspaceKey, bucket, null));
    }
    if (bucket.queue.length >= queueLimit) {
      return Promise.reject(new ChannelConnectorWorkspaceQueueFullError(workspaceKey));
    }
    return new Promise<ChannelConnectorWorkspaceExecutionLease>((resolve, reject) => {
      const pending: PendingAcquire = {
        queuedAt: new Date().toISOString(),
        signal: input.signal || null,
        resolve,
        reject,
        abortHandler: null,
      };
      if (pending.signal) {
        pending.abortHandler = () => {
          const index = bucket.queue.indexOf(pending);
          if (index >= 0) bucket.queue.splice(index, 1);
          reject(pending.signal?.reason instanceof Error
            ? pending.signal.reason
            : new Error("Channel Connector workspace acquire aborted."));
          this.deleteIdleBucket(workspaceKey, bucket);
        };
        pending.signal.addEventListener("abort", pending.abortHandler, { once: true });
      }
      bucket.queue.push(pending);
    });
  }

  status(): ChannelConnectorWorkspaceExecutionStatus[] {
    return [...this.buckets.entries()]
      .map(([workspaceKey, bucket]) => ({
        workspaceKey,
        active: bucket.active,
        queued: bucket.queue.length,
        maxActive: bucket.maxActive,
      }))
      .sort((left, right) => left.workspaceKey.localeCompare(right.workspaceKey));
  }

  private createLease(
    workspaceKey: string,
    bucket: WorkspaceBucket,
    queuedAt: string | null,
  ): ChannelConnectorWorkspaceExecutionLease {
    let released = false;
    return {
      workspaceKey,
      queuedAt,
      acquiredAt: new Date().toISOString(),
      release: () => {
        if (released) return;
        released = true;
        bucket.active = Math.max(0, bucket.active - 1);
        this.drain(workspaceKey, bucket);
      },
    };
  }

  private drain(workspaceKey: string, bucket: WorkspaceBucket): void {
    while (bucket.active < bucket.maxActive && bucket.queue.length) {
      const pending = bucket.queue.shift();
      if (!pending) break;
      if (pending.abortHandler && pending.signal) {
        pending.signal.removeEventListener("abort", pending.abortHandler);
      }
      if (pending.signal?.aborted) {
        pending.reject(pending.signal.reason instanceof Error
          ? pending.signal.reason
          : new Error("Channel Connector workspace acquire aborted."));
        continue;
      }
      bucket.active += 1;
      pending.resolve(this.createLease(workspaceKey, bucket, pending.queuedAt));
    }
    this.deleteIdleBucket(workspaceKey, bucket);
  }

  private deleteIdleBucket(workspaceKey: string, bucket: WorkspaceBucket): void {
    if (bucket.active === 0 && bucket.queue.length === 0) this.buckets.delete(workspaceKey);
  }
}

export function createChannelConnectorTargetExecutionCoordinator(): ChannelConnectorTargetExecutionCoordinator {
  return new ChannelConnectorTargetExecutionCoordinator();
}
