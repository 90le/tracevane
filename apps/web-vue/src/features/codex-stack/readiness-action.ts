import type {
  CodexStackRepairAction,
  CodexStackRunReadinessCheck,
  CodexStackRunReadinessMode,
} from "../../../../../types/codex-stack";

export type CodexStackSectionId = "dashboard" | "install" | "cc-connect" | "settings" | "logs";

export type CodexStackReadinessUiCommand =
  | { type: "run-check" }
  | { type: "repair"; actions: CodexStackRepairAction[] }
  | { type: "open-section"; section: CodexStackSectionId };

export function normalizeCodexStackRunReadinessCheck(
  check: CodexStackRunReadinessCheck,
  fallbackLabel: string,
): CodexStackRunReadinessCheck {
  if (check.actionHint) return check;
  return {
    ...check,
    actionHint: {
      kind: "open-section",
      label: fallbackLabel,
      section: check.section,
    },
  };
}

export function normalizeCodexStackRunReadinessMode(
  mode: CodexStackRunReadinessMode,
  fallbackLabel: string,
): CodexStackRunReadinessMode {
  if (mode.actionHint) return mode;
  return {
    ...mode,
    actionHint: {
      kind: "open-section",
      label: fallbackLabel,
      section: "dashboard",
    },
  };
}

export function resolveCodexStackRunReadinessAction(
  check: CodexStackRunReadinessCheck,
  fallbackLabel: string,
): CodexStackReadinessUiCommand {
  const normalized = normalizeCodexStackRunReadinessCheck(check, fallbackLabel);
  const action = normalized.actionHint;
  if (action.kind === "run-check") {
    return { type: "run-check" };
  }
  if (action.kind === "repair" && action.repairActions?.length) {
    return { type: "repair", actions: action.repairActions };
  }
  return { type: "open-section", section: action.section || normalized.section };
}

export function resolveCodexStackRunReadinessModeAction(
  mode: CodexStackRunReadinessMode,
  fallbackLabel: string,
): CodexStackReadinessUiCommand {
  const normalized = normalizeCodexStackRunReadinessMode(mode, fallbackLabel);
  const action = normalized.actionHint || {
    kind: "open-section" as const,
    label: fallbackLabel,
    section: "dashboard" as const,
  };
  if (action.kind === "run-check") {
    return { type: "run-check" };
  }
  if (action.kind === "repair" && action.repairActions?.length) {
    return { type: "repair", actions: action.repairActions };
  }
  return { type: "open-section", section: action.section || "dashboard" };
}
