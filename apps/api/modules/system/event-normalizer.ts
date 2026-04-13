import type { SystemEventRecord } from "./event-types.js";

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

function buildEvent(
  action: SystemActionEventKind,
  ok: boolean,
  occurredAt: string,
): SystemEventRecord {
  if (action === "bootstrap-repair") {
    const kind = ok ? "repair_succeeded" : "repair_failed";
    return {
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
    };
  }

  if (action === "upgrade") {
    const kind = ok ? "upgrade_started" : "upgrade_failed";
    return {
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
    };
  }

  if (action === "device-trust-approve") {
    const kind = ok ? "device_trust_approved" : "device_trust_approve_failed";
    return {
      id: createEventId(kind, occurredAt),
      kind,
      category: "operations",
      severity: ok ? "success" : "error",
      occurredAt,
      title: ok ? "设备信任请求已批准" : "设备信任请求批准失败",
      summary: ok ? "已完成设备信任审批。" : "设备信任审批执行失败。",
      status: ok ? "succeeded" : "failed",
    };
  }

  const kind = ok ? "repair_succeeded" : "helper_repair_failed";
  return {
    id: createEventId(kind, occurredAt),
    kind,
    category: "operations",
    severity: ok ? "success" : "error",
    occurredAt,
    title: ok ? "本机助手修复完成" : "本机助手修复失败",
    summary: ok ? "本机助手设备信任修复已完成。" : "本机助手修复执行失败。",
    status: ok ? "succeeded" : "failed",
  };
}

export function buildSystemActionEvents(
  input: BuildSystemActionEventsInput,
): SystemEventRecord[] {
  const occurredAt = input.occurredAt || new Date().toISOString();
  return [buildEvent(input.action, input.ok, occurredAt)];
}
