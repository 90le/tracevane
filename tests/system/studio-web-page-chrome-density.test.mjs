import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const styleCss = read("apps/web-vue/src/style.css");

test("shared primitives consume semantic aliases for surfaces and action accents", () => {
  assert.match(
    styleCss,
    /\.panel-card,\s*\.metric-card\s*\{[^}]*background:\s*var\(--surface-base\);/,
  );
  assert.match(
    styleCss,
    /\.panel-card,\s*\.metric-card\s*\{[^}]*border:\s*1px solid var\(--border-subtle\);/,
  );
  assert.match(
    styleCss,
    /\.primary-button\s*\{[^}]*background:\s*var\(--accent-primary\);/,
  );
  assert.match(
    styleCss,
    /\.status-banner\s*\{[^}]*background:\s*var\(--surface-raised\);/,
  );
});
