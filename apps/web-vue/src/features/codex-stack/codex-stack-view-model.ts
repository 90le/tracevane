import type {
  CodexStackComponentStatus,
  CodexStackJob,
  CodexStackRepairAction,
  CodexStackServiceStatus,
  CodexStackStatus,
  CodexStackSummaryPayload,
} from "../../../../../types/codex-stack";

export type CodexStackTone = "neutral" | "accent" | "sage" | "danger";

export function codexStackStatusTone(status: CodexStackStatus): CodexStackTone {
  if (status === "ready") return "sage";
  if (status === "needs-setup" || status === "binding-required" || status === "running-action") return "accent";
  if (status === "failed") return "danger";
  return "neutral";
}

export function codexStackComponentTone(status: CodexStackComponentStatus): CodexStackTone {
  if (status === "ok") return "sage";
  if (status === "failed" || status === "missing") return "danger";
  if (status === "degraded") return "accent";
  return "neutral";
}

export function isCodexStackJobRunning(job: CodexStackJob | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export function countActiveServices(services: CodexStackServiceStatus[]): number {
  return services.filter((service) => service.active).length;
}

export function buildCodexStackRepairActions(summary: CodexStackSummaryPayload): Array<
  CodexStackRepairAction
> {
  const actions: CodexStackRepairAction[] = [];
  const services = new Map(summary.services.map((service) => [service.id, service]));
  const cpa = services.get("cli-proxy-api.service");
  const compact = services.get("cpa-compact-proxy.service");
  const watchdog = services.get("codex-stack-watchdog.timer");
  const cpaActive = cpa?.active === true;
  const compactActive = compact?.active === true;
  const watchdogActive = watchdog?.active === true;
  const stackInstalled = cpa?.installed === true && compact?.installed === true && watchdog?.installed === true;
  if (stackInstalled && !cpaActive && !compactActive && !watchdogActive) {
    return ["resume-stack"];
  }
  if (!summary.secrets.codexAuth.hasSecret || summary.secrets.codexAuth.matchesProxyKey === false) {
    actions.push("repair-auth-json");
  }
  if (!summary.cpaManagement.enabled || !summary.cpaManagement.controlPanelEnabled) {
    actions.push("repair-cpa-management");
  }
  if (!cpaActive) actions.push("restart-cpa");
  if (!compactActive) actions.push("restart-compact-proxy");
  if (!watchdogActive) actions.push("restart-watchdog");
  if (summary.ccConnect.bindingPresent && services.get("cc-connect.service")?.active !== true) actions.push("restart-cc-connect");
  return actions.length ? actions : ["restart-cpa", "restart-compact-proxy", "restart-watchdog"];
}
