import type { WorkspaceEvidenceRecord } from "./WorkspaceEvidenceBasket";
import { exportWorkspaceEvidenceBundle } from "./WorkspaceEvidenceBasket";

export const WORKSPACE_EVIDENCE_HANDOFF_SCHEMA_VERSION = 1;
export const WORKSPACE_EVIDENCE_HANDOFF_RECORD_LIMIT = 12;

export interface WorkspaceEvidenceHandoffPacket {
  schemaVersion: typeof WORKSPACE_EVIDENCE_HANDOFF_SCHEMA_VERSION;
  generatedAt: string;
  objective: string;
  guardrail: string;
  records: WorkspaceEvidenceRecord[];
  bundle: string;
}

export interface WorkspaceEvidenceHandoffInput {
  objective?: string;
  records: WorkspaceEvidenceRecord[];
  limit?: number;
}

export function buildWorkspaceEvidenceHandoffPacket({
  objective = "Use these Tracevane Workspace evidence records to reason, write, or propose code changes. Do not mutate user files without an explicit review step.",
  records,
  limit = WORKSPACE_EVIDENCE_HANDOFF_RECORD_LIMIT,
}: WorkspaceEvidenceHandoffInput): WorkspaceEvidenceHandoffPacket {
  const selectedRecords = records.slice(0, Math.max(0, limit));
  return {
    schemaVersion: WORKSPACE_EVIDENCE_HANDOFF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    objective,
    guardrail:
      "Evidence is read-only context. Preserve user control, cite record ids when making claims, and request review before risky edits.",
    records: selectedRecords,
    bundle: exportWorkspaceEvidenceBundle(selectedRecords),
  };
}

export function formatWorkspaceEvidenceHandoffForAi(
  packet: WorkspaceEvidenceHandoffPacket,
): string {
  return [
    "# Tracevane Workspace Evidence Handoff",
    `schemaVersion: ${packet.schemaVersion}`,
    `generatedAt: ${packet.generatedAt}`,
    "",
    "## Objective",
    packet.objective,
    "",
    "## Guardrail",
    packet.guardrail,
    "",
    "## Evidence Records",
    packet.bundle || "No evidence records selected.",
  ].join("\n");
}
