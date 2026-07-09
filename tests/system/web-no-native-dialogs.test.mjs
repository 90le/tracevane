import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const scannedRoots = [
  path.join(repoRoot, "apps/web/src"),
  path.join(repoRoot, "apps/web/index.html"),
];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".htm"]);
const nativeDialogPatterns = [
  /\b(?:window|globalThis|self)\s*\.\s*(?:alert|confirm|prompt)\s*\(/,
  /(^|[^.$\w])(?:alert|confirm|prompt)\s*\(/,
];

test("web production sources do not use native browser dialogs", () => {
  const violations = [];
  for (const file of scanFiles(scannedRoots)) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (nativeDialogPatterns.some((pattern) => pattern.test(line))) {
        violations.push(`${path.relative(repoRoot, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(violations, [], "Use apps/web/src/design/ui/action-dialog.tsx instead of native alert/confirm/prompt.");
});

function* scanFiles(entries) {
  for (const entry of entries) {
    if (!fs.existsSync(entry)) continue;
    const stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(entry)) {
        yield* scanFiles([path.join(entry, child)]);
      }
      continue;
    }
    if (sourceExtensions.has(path.extname(entry))) yield entry;
  }
}
