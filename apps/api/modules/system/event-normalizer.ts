import type {
  SystemBootstrapPayload,
  SystemDiagnosticsPayload,
  SystemDeviceTrustPayload,
  SystemStudioReleasePayload,
} from "../../../../types/system.js";
import type {
  SystemEventRecord,
  SystemPersistedEventRecord,
} from "./event-types.js";

export type SystemActionEventKind =
  | "bootstrap-repair"
  | "upgrade"
  | "device-trust-approve"
  | "helper-repair";

export interface BuildSystemActionEventsInput {
  action: SystemActionEventKind;
  ok: boolean;
  occurredAt?: string;
}

function createEventId(kind: string, occurredAt: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${kind}-${occurredAt}-${suffix}`;
}

function toPersistedRecord(
  event: SystemEventRecord,
  persistence: {
    dedupeKey: string;
    sourceEntity: string;
    action: string;
    details?: Record<string, unknown>;
  },
): SystemPersistedEventRecord {
  return {
    ...event,
    dedupeKey: persistence.dedupeKey,
    persistedAt: event.occurredAt,
    sourceEntity: persistence.sourceEntity,
    details: persistence.details ?? {},
    action: persistence.action,
  };
}

function buildEvent(
  action: SystemActionEventKind,
  ok: boolean,
  occurredAt: string,
): SystemPersistedEventRecord {
  if (action === "bootstrap-repair") {
    const kind = ok ? "repair_succeeded" : "repair_failed";
    return toPersistedRecord(
      {
        id: createEventId(kind, occurredAt),
        kind,
        category: "operations",
        severity: ok ? "success" : "error",
        occurredAt,
        title: ok ? "系统初始化修复完成" : "系统初始化修复失败",
        summary: ok
          ? "已应用推荐初始化配置。"
          : "初始化修复执行失败，请检查日志。",
        status: ok ? "succeeded" : "failed",
      },
      {
        dedupeKey: `action:bootstrap-repair:${ok ? "ok" : "failed"}`,
        sourceEntity: "system:bootstrap",
        action: "bootstrap-repair",
        details: { ok },
      },
    );
  }

  if (action === "upgrade") {
    const kind = ok ? "upgrade_started" : "upgrade_failed";
    return toPersistedRecord(
      {
        id: createEventId(kind, occurredAt),
        kind,
        category: "operations",
        severity: ok ? "info" : "error",
        occurredAt,
        title: ok ? "Studio 升级任务已启动" : "Studio 升级任务启动失败",
        summary: ok
          ? "后端已接受升级请求并开始执行。"
          : "升级请求未能启动，请检查安装脚本与环境。",
        status: ok ? "running" : "failed",
      },
      {
        dedupeKey: `action:upgrade:${ok ? "ok" : "failed"}`,
        sourceEntity: "system:upgrade",
        action: "upgrade",
        details: { ok },
      },
    );
  }

  if (action === "device-trust-approve") {
    const kind = ok ? "device_trust_approved" : "device_trust_approve_failed";
    return toPersistedRecord(
      {
        id: createEventId(kind, occurredAt),
        kind,
        category: "operations",
        severity: ok ? "success" : "error",
        occurredAt,
        title: ok ? "设备信任请求已批准" : "设备信任请求批准失败",
        summary: ok ? "已完成设备信任审批。" : "设备信任审批执行失败。",
        status: ok ? "succeeded" : "failed",
      },
      {
        dedupeKey: `action:device-trust-approve:${ok ? "ok" : "failed"}`,
        sourceEntity: "system:device-trust",
        action: "device-trust-approve",
        details: { ok },
      },
    );
  }

  const kind = ok ? "helper_repair_succeeded" : "helper_repair_failed";
  return toPersistedRecord(
    {
      id: createEventId(kind, occurredAt),
      kind,
      category: "operations",
      severity: ok ? "success" : "error",
      occurredAt,
      title: ok ? "本机助手修复完成" : "本机助手修复失败",
      summary: ok ? "本机助手设备信任修复已完成。" : "本机助手修复执行失败。",
      status: ok ? "succeeded" : "failed",
    },
    {
      dedupeKey: `action:helper-repair:${ok ? "ok" : "failed"}`,
      sourceEntity: "system:helper",
      action: "helper-repair",
      details: { ok },
    },
  );
}

export function buildSystemActionEvents(
  input: BuildSystemActionEventsInput,
): SystemEventRecord[] {
  const occurredAt = input.occurredAt || new Date().toISOString();
  return [buildEvent(input.action, input.ok, occurredAt)];
}

function makeSnapshotEventId(prefix: string, occurredAt: string): string {
  return `${prefix}-${occurredAt}`;
}

export function buildSystemSnapshotDerivedEvents(params: {
  diagnostics: Pick<
    SystemDiagnosticsPayload,
    "checkedAt" | "gateway" | "status"
  > | null;
  bootstrap: Pick<SystemBootstrapPayload, "checkedAt" | "ready"> | null;
  deviceTrust: Pick<SystemDeviceTrustPayload, "checkedAt" | "pending"> | null;
  studioRelease: Pick<
    SystemStudioReleasePayload,
    "checkedAt" | "currentVersion" | "latestVersion" | "updateAvailable"
  > | null;
  health?: Pick<SystemDiagnosticsPayload, "checkedAt"> | null;
}): SystemEventRecord[] {
  const { diagnostics, bootstrap, deviceTrust, studioRelease } = params;
  const events: SystemEventRecord[] = [];

  if (diagnostics?.gateway?.rpcOk === false) {
    const occurredAt = diagnostics.checkedAt || new Date().toISOString();
    events.push(
      toPersistedRecord(
        {
          id: makeSnapshotEventId("diagnostic-gateway-rpc", occurredAt),
          kind: "diagnostic_issue",
          category: "alerts",
          severity: "error",
          occurredAt,
          title: "Gateway RPC 不可用",
          summary: "system diagnostics 显示 gateway rpc 不可用",
          status: "failed",
          sourceModule: "diagnostics",
        },
        {
          dedupeKey: "diagnostics:gateway-rpc",
          sourceEntity: "system:diagnostics",
          action: "snapshot",
          details: { rpcOk: false },
        },
      ),
    );
  }

  const bootstrapPending =
    Number(diagnostics?.status?.bootstrapPendingCount || 0) > 0;
  if (bootstrap?.ready === false || bootstrapPending) {
    const occurredAt =
      bootstrap?.checkedAt ||
      diagnostics?.checkedAt ||
      new Date().toISOString();
    events.push(
      toPersistedRecord(
        {
          id: makeSnapshotEventId("diagnostic-bootstrap", occurredAt),
          kind: "diagnostic_issue",
          category: "alerts",
          severity: "warning",
          occurredAt,
          title: "Bootstrap 待处理",
          summary: "bootstrap 未 ready 或存在 pending 项",
          status: "pending",
          sourceModule: "bootstrap",
        },
        {
          dedupeKey: "bootstrap:pending",
          sourceEntity: "system:bootstrap",
          action: "snapshot",
          details: {
            ready: bootstrap?.ready,
            bootstrapPendingCount: diagnostics?.status?.bootstrapPendingCount,
          },
        },
      ),
    );
  }

  if (Array.isArray(deviceTrust?.pending) && deviceTrust.pending.length > 0) {
    const occurredAt = deviceTrust?.checkedAt || new Date().toISOString();
    events.push(
      toPersistedRecord(
        {
          id: makeSnapshotEventId("device-trust-pending", occurredAt),
          kind: "device_trust_pending",
          category: "audit",
          severity: "warning",
          occurredAt,
          title: "设备信任待审批",
          summary: `存在 ${deviceTrust.pending.length} 条待审批请求`,
          status: "pending",
          sourceModule: "device-trust",
        },
        {
          dedupeKey: "device-trust:pending",
          sourceEntity: "system:device-trust",
          action: "snapshot",
          details: { pendingCount: deviceTrust.pending.length },
        },
      ),
    );
  }

  if (studioRelease?.updateAvailable) {
    const occurredAt = studioRelease.checkedAt || new Date().toISOString();
    events.push(
      toPersistedRecord(
        {
          id: makeSnapshotEventId("release-update", occurredAt),
          kind: "release_update_available",
          category: "operations",
          severity: "info",
          occurredAt,
          title: "发现可用更新",
          summary: `${studioRelease.currentVersion} -> ${studioRelease.latestVersion || "unknown"}`,
          status: "pending",
          sourceModule: "studio-release",
        },
        {
          dedupeKey: "release:update-available",
          sourceEntity: "system:studio-release",
          action: "snapshot",
          details: {
            currentVersion: studioRelease.currentVersion,
            latestVersion: studioRelease.latestVersion,
          },
        },
      ),
    );
  }

  return events;
}
