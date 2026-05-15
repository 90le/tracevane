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
  const serviceActive = new Map(summary.services.map((service) => [service.id, service.active]));
  if (!serviceActive.get("cli-proxy-api.service")) actions.push("restart-cpa");
  if (!serviceActive.get("cpa-compact-proxy.service")) actions.push("restart-compact-proxy");
  if (!serviceActive.get("codex-stack-watchdog.timer")) actions.push("restart-watchdog");
  if (summary.ccConnect.bindingPresent && !serviceActive.get("cc-connect.service")) actions.push("restart-cc-connect");
  return actions.length ? actions : ["restart-cpa", "restart-compact-proxy", "restart-watchdog"];
}
