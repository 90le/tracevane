import type {
  TracevaneServiceManagerStatus,
  TracevaneServiceMode,
  TracevaneServiceState,
  TracevaneSupervisorErrorCode,
  TracevaneSupervisorKind,
} from "../../../../types/supervisor";

/** Pure presentation helpers for normalized daemon supervisor state. */

export type ServicePrimaryAction = "install" | "repair" | "start" | "restart";
export type ServiceStateBadge = "ok" | "warn" | "bad" | "mute";

const BLOCKING_ERROR_CODES = new Set<TracevaneSupervisorErrorCode>([
  "permission-denied",
  "command-not-found",
  "command-timeout",
  "template-invalid",
  "unsupported-platform",
  "unknown",
]);

export function primaryServiceAction(
  manager: TracevaneServiceManagerStatus,
): ServicePrimaryAction | null {
  if (manager.mode === "session") {
    if (
      manager.state === "degraded" &&
      manager.errorCode === "runtime-not-ready"
    ) {
      return "restart";
    }
    if (manager.errorCode !== null) return null;
    if (manager.state === "stopped" || manager.state === "not-installed") {
      return "start";
    }
    return manager.state === "running" ? "restart" : null;
  }

  if (
    manager.errorCode !== null &&
    BLOCKING_ERROR_CODES.has(manager.errorCode)
  ) {
    return null;
  }
  if (
    !manager.installed ||
    manager.state === "not-installed" ||
    manager.errorCode === "task-not-found"
  ) {
    return "install";
  }
  if (
    manager.state === "stale-config" ||
    manager.errorCode === "stale-config"
  ) {
    return "repair";
  }
  if (
    manager.state === "degraded" &&
    manager.errorCode === "runtime-not-ready"
  ) {
    return "restart";
  }
  if (manager.errorCode !== null) return null;
  if (manager.state === "stopped") return "start";
  return manager.state === "running" ? "restart" : null;
}

export function canStopService(manager: TracevaneServiceManagerStatus): boolean {
  return (manager.state === "running" && manager.errorCode === null) ||
    (manager.state === "degraded" && manager.errorCode === "runtime-not-ready");
}

export function canUninstallService(
  manager: TracevaneServiceManagerStatus,
): boolean {
  return manager.mode === "persistent" &&
    manager.installed &&
    manager.state !== "starting" &&
    (manager.errorCode === null ||
      manager.errorCode === "stale-config" ||
      manager.errorCode === "runtime-not-ready");
}

export function serviceModeLabel(mode: TracevaneServiceMode): string {
  return mode === "session" ? "会话托管" : "系统守护";
}

export function serviceModeCopy(mode: TracevaneServiceMode): string {
  return mode === "session"
    ? "由 Tracevane 开发 API 管理；开发 API 停止时一同停止；不会注册系统服务。"
    : "注册在当前用户范围，可在开发 API 停止后继续运行；不会请求管理员或 root 权限。";
}

export function supervisorLabel(supervisor: TracevaneSupervisorKind): string {
  switch (supervisor) {
    case "systemd-user":
      return "systemd 用户服务";
    case "launchd-user":
      return "launchd 用户代理";
    case "scheduled-task":
      return "Windows 计划任务";
    case "session":
      return "开发 API 会话";
    case "none":
      return "未托管";
    default:
      return "未知";
  }
}

export function serviceStateLabel(state: TracevaneServiceState): string {
  switch (state) {
    case "not-installed":
      return "未安装";
    case "stopped":
      return "已停止";
    case "starting":
      return "启动中";
    case "running":
      return "运行中";
    case "degraded":
      return "运行异常";
    case "failed":
      return "失败";
    case "stale-config":
      return "配置待修复";
    default:
      return "未知";
  }
}

export function serviceStateBadge(state: TracevaneServiceState): ServiceStateBadge {
  if (state === "running") return "ok";
  if (state === "starting" || state === "degraded" || state === "stale-config") {
    return "warn";
  }
  return state === "failed" ? "bad" : "mute";
}

export function supervisorErrorCopy(
  errorCode: TracevaneSupervisorErrorCode | null,
): string | null {
  switch (errorCode) {
    case null:
      return null;
    case "task-not-found":
      return "当前用户守护服务尚未安装。";
    case "permission-denied":
      return "当前用户权限不足，无法管理守护服务。";
    case "command-not-found":
      return "系统缺少所需的守护服务管理命令。";
    case "command-timeout":
      return "守护服务管理命令执行超时。";
    case "template-invalid":
      return "守护服务定义无效或无法写入。";
    case "runtime-not-ready":
      return "守护进程未通过就绪检查。";
    case "stale-config":
      return "守护服务定义已过期，需要修复。";
    case "unsupported-platform":
      return "当前平台不支持此守护方式。";
    case "unknown":
      return "无法确定守护服务状态。";
  }
}
