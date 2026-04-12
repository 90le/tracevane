import type {
  TerminalSessionDescriptor,
  TerminalSessionControlState,
  TerminalSessionSource,
  TerminalSessionStatus,
} from "../../../../types/terminal.js";

export interface BuildTerminalSessionSummaryInput {
  sid: string;
  title?: string;
  status: TerminalSessionStatus;
  source?: TerminalSessionSource;
  attachedClientId?: string | null;
  observerCount: number;
  updatedAt?: string;
}

export function buildTerminalSessionSummary(
  input: BuildTerminalSessionSummaryInput,
): TerminalSessionDescriptor {
  const controlState: TerminalSessionControlState = String(
    input.attachedClientId || "",
  ).trim()
    ? "controller"
    : "observer";
  const status: TerminalSessionStatus = input.status;

  return {
    sessionId: String(input.sid || "").trim(),
    title: String(input.title || input.sid || "").trim(),
    status,
    source: input.source || "manual",
    canResume: status === "running" || status === "detached",
    controlState,
    observerCount: Math.max(0, Number(input.observerCount || 0)),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}
