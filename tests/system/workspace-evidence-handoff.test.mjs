import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace Evidence Handoff prepares bounded read-only AI review packets", () => {
  const handoff = readWeb("features/workspace/shared/WorkspaceEvidenceHandoff.ts");
  assert.match(handoff, /import type \{ WorkspaceEvidenceRecord \}/);
  assert.match(handoff, /exportWorkspaceEvidenceBundle/);
  assert.match(handoff, /WORKSPACE_EVIDENCE_HANDOFF_SCHEMA_VERSION = 1/);
  assert.match(handoff, /WORKSPACE_EVIDENCE_HANDOFF_RECORD_LIMIT = 12/);
  assert.match(handoff, /export interface WorkspaceEvidenceHandoffPacket/);
  assert.match(handoff, /schemaVersion: typeof WORKSPACE_EVIDENCE_HANDOFF_SCHEMA_VERSION/);
  assert.match(handoff, /guardrail: string/);
  assert.match(handoff, /bundle: string/);
  assert.match(handoff, /export function buildWorkspaceEvidenceHandoffPacket/);
  assert.match(handoff, /records\.slice\(0, Math\.max\(0, limit\)\)/);
  assert.match(handoff, /Evidence is read-only context/);
  assert.match(handoff, /cite record ids when making claims/);
  assert.match(handoff, /export function formatWorkspaceEvidenceHandoffForAi/);
  assert.match(handoff, /# Tracevane Workspace Evidence Handoff/);
  assert.match(handoff, /No evidence records selected/);
});
