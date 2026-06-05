export interface OpenClawGatewayServiceStatus {
  loaded: boolean | null;
  loadedText: string;
  runtimeStatus: string;
  runtimeState: string;
  runtimeSubState: string;
  runtimePid: number | null;
  serviceSourcePath: string;
  serviceProgramArguments: string[];
  configAuditOk: boolean | null;
  configAuditIssues: string[];
  rpcOk: boolean | null;
  gatewayPort: number | null;
}

export interface OpenClawGatewayServiceRepairAssessment {
  needsRepair: boolean;
  reasons: string[];
  summary: string;
  shouldInstall: boolean;
  shouldStart: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberValue(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function issueList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((issue) => {
      if (typeof issue === "string") return issue;
      if (!isRecord(issue)) return "";
      return String(issue.message || issue.id || issue.code || "").trim();
    })
    .filter(Boolean);
}

export function parseOpenClawGatewayStatus(
  stdout: string,
): OpenClawGatewayServiceStatus | null {
  try {
    const parsed = JSON.parse(stdout || "{}") as unknown;
    const root = asRecord(parsed);
    const service = asRecord(root.service);
    const command = asRecord(service.command);
    const runtime = asRecord(service.runtime);
    const configAudit = asRecord(service.configAudit);
    const rpc = asRecord(root.rpc);
    const gateway = asRecord(root.gateway);

    return {
      loaded: booleanValue(service.loaded),
      loadedText: stringValue(service.loadedText),
      runtimeStatus: stringValue(runtime.status),
      runtimeState: stringValue(runtime.state),
      runtimeSubState: stringValue(runtime.subState),
      runtimePid: numberValue(runtime.pid),
      serviceSourcePath: stringValue(command.sourcePath),
      serviceProgramArguments: stringList(command.programArguments),
      configAuditOk: booleanValue(configAudit.ok),
      configAuditIssues: issueList(configAudit.issues),
      rpcOk: booleanValue(rpc.ok),
      gatewayPort: numberValue(gateway.port),
    };
  } catch {
    return null;
  }
}

export function assessOpenClawGatewayServiceStatus(
  status: OpenClawGatewayServiceStatus | null,
  input: {
    expectedPort?: number | null;
    sourcePathExists?: boolean | null;
  } = {},
): OpenClawGatewayServiceRepairAssessment {
  if (!status) {
    return {
      needsRepair: true,
      reasons: ["status_unavailable"],
      summary: "OpenClaw gateway status could not be parsed.",
      shouldInstall: true,
      shouldStart: true,
    };
  }

  const reasons: string[] = [];
  if (status.loaded === false) reasons.push("service_not_loaded");
  if (input.sourcePathExists === false) reasons.push("service_source_missing");
  if (
    status.serviceProgramArguments.length > 0 &&
    !status.serviceProgramArguments.some((arg) => arg === "gateway")
  ) {
    reasons.push("service_command_missing_gateway");
  }

  const runtimeText = [
    status.runtimeStatus,
    status.runtimeState,
    status.runtimeSubState,
  ].join(" ").toLowerCase();
  if (/(failed|inactive|dead|exited|stopped|not-found)/.test(runtimeText)) {
    reasons.push("service_not_running");
  }

  if (status.configAuditOk === false) reasons.push("config_audit_failed");
  if (status.rpcOk === false) reasons.push("gateway_rpc_failed");
  if (
    Number.isFinite(Number(input.expectedPort)) &&
    Number.isFinite(Number(status.gatewayPort)) &&
    Number(input.expectedPort) !== Number(status.gatewayPort)
  ) {
    reasons.push("gateway_port_mismatch");
  }

  const installReasons = new Set([
    "status_unavailable",
    "service_not_loaded",
    "service_source_missing",
    "service_command_missing_gateway",
    "config_audit_failed",
    "gateway_port_mismatch",
  ]);
  const shouldInstall = reasons.some((reason) => installReasons.has(reason));
  const shouldStart =
    shouldInstall ||
    reasons.includes("service_not_running") ||
    reasons.includes("gateway_rpc_failed");

  return {
    needsRepair: reasons.length > 0,
    reasons: [...new Set(reasons)],
    summary: reasons.length
      ? `OpenClaw gateway service needs repair: ${[...new Set(reasons)].join(", ")}.`
      : "OpenClaw gateway service status does not require service repair.",
    shouldInstall,
    shouldStart,
  };
}
