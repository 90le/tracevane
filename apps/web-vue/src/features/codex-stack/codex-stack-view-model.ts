import type {
  CodexStackComponentStatus,
  CodexStackJob,
  CodexStackRepairAction,
  CodexStackServiceStatus,
  CodexStackStatus,
  CodexStackSummaryPayload,
} from "../../../../../types/codex-stack";

export type CodexStackTone = "neutral" | "accent" | "sage" | "danger";

export const DEFAULT_NO_PROXY = "localhost,127.0.0.1,::1";

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

export function findMissingNoProxyLoopback(noProxy: string): string[] {
  const entries = new Set(noProxy
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((entry) => [entry, entry.replace(/^\[(.*)\]$/, "$1")]));
  if (entries.has("*")) return [];
  const missing: string[] = [];
  if (!entries.has("localhost") && !entries.has(".localhost")) missing.push("localhost");
  if (!entries.has("127.0.0.1") && !entries.has("127.0.0.0/8")) missing.push("127.0.0.1");
  if (!entries.has("::1")) missing.push("::1");
  return missing;
}

export function normalizeProxyPolicy(
  policy: Partial<CodexStackSummaryPayload["proxyPolicy"]> | undefined,
): CodexStackSummaryPayload["proxyPolicy"] {
  const noProxy = policy?.noProxy || DEFAULT_NO_PROXY;
  const missing = Array.isArray(policy?.noProxyLoopbackMissing)
    ? policy.noProxyLoopbackMissing
    : findMissingNoProxyLoopback(noProxy);
  return {
    providerMode: policy?.providerMode === "proxy" ? "proxy" : "direct",
    providerProxyUrl: policy?.providerProxyUrl || null,
    providerProxySource: policy?.providerProxySource || null,
    noProxy,
    noProxyLoopbackReady: typeof policy?.noProxyLoopbackReady === "boolean"
      ? policy.noProxyLoopbackReady
      : missing.length === 0,
    noProxyLoopbackMissing: missing,
    cpaConfigProxyUrls: Array.isArray(policy?.cpaConfigProxyUrls) ? policy.cpaConfigProxyUrls : [],
    upstreamBaseUrl: policy?.upstreamBaseUrl || null,
    upstreamApiKeyConfigured: Boolean(policy?.upstreamApiKeyConfigured),
  };
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
