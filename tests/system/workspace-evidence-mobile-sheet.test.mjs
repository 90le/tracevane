import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

test("Workspace Evidence Mobile Sheet provides a responsive review entry point", () => {
  const sheet = readWeb("features/workspace/shared/WorkspaceEvidenceMobileSheet.tsx");
  const barrel = readWeb("features/workspace/shared/index.ts");
  assert.match(sheet, /export interface WorkspaceEvidenceMobileSheetProps/);
  assert.match(sheet, /export function WorkspaceEvidenceMobileSheet/);
  assert.match(sheet, /SheetTrigger asChild/);
  assert.match(sheet, /aria-label="Open workspace evidence review sheet"/);
  assert.match(sheet, /Workspace evidence review/);
  assert.match(sheet, /WorkspaceEvidenceReviewSurface/);
  assert.match(sheet, /w-\[min\(720px,96vw\)\]/);
  assert.match(sheet, /sm:w-\[min\(760px,94vw\)\]/);
  assert.match(sheet, /density="compact"/);
  assert.match(sheet, /initialRecords=\{initialRecords\}/);
  assert.match(sheet, /onCopyHandoff=\{onCopyHandoff\}/);
  assert.match(sheet, /onRecordsChange=\{onRecordsChange\}/);
  assert.match(barrel, /export \* from "\.\/WorkspaceEvidenceMobileSheet"/);
});
