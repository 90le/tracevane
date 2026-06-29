import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace Evidence Responsive Launcher exposes one adaptive review entry", () => {
  const launcher = readWeb("features/workspace/shared/WorkspaceEvidenceResponsiveLauncher.tsx");
  const barrel = readWeb("features/workspace/shared/index.ts");
  assert.match(launcher, /export interface WorkspaceEvidenceResponsiveLauncherProps/);
  assert.match(launcher, /export function WorkspaceEvidenceResponsiveLauncher/);
  assert.match(launcher, /data-workspace-evidence-responsive-launcher/);
  assert.match(launcher, /data-workspace-evidence-mobile-entry/);
  assert.match(launcher, /data-workspace-evidence-rail-entry/);
  assert.match(launcher, /className="md:hidden"/);
  assert.match(launcher, /className="hidden min-w-0 md:block"/);
  assert.match(launcher, /aria-label="Workspace evidence rail"/);
  assert.match(launcher, /WorkspaceEvidenceMobileSheet/);
  assert.match(launcher, /WorkspaceEvidenceReviewSurface/);
  assert.match(launcher, /density="compact"/);
  assert.match(launcher, /triggerLabel=\{triggerLabel\}/);
  assert.match(launcher, /onCopyHandoff=\{onCopyHandoff\}/);
  assert.match(launcher, /onRecordsChange=\{onRecordsChange\}/);
  assert.match(barrel, /export \* from "\.\/WorkspaceEvidenceResponsiveLauncher"/);
});
