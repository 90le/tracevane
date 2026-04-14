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

  const sessionId = String(input.sid || "").trim();
  const updatedAt = input.updatedAt || new Date().toISOString();
  const controllerClientId =
    String(input.attachedClientId || "").trim() || null;
  const observerCount = Math.max(0, Number(input.observerCount || 0));

  return {
    sessionId,
    title: String(input.title || input.sid || "").trim(),
    source: input.source || "manual",
    sourceModule: "terminal",
    sourceAction: "terminal.attach",
    originRoute: `/terminal/${sessionId}`,
    status,
    controllerClientId,
    observerClientIds: [],
    createdAt: updatedAt,
    lastActiveAt: updatedAt,
    lastAttachedAt: updatedAt,
    canResume: status === "running" || status === "detached",
    resumeKey: sessionId || null,
    handoffContext: null,
    recentOutputSummary: null,
    controlState,
    observerCount,
    updatedAt,
  };
}
