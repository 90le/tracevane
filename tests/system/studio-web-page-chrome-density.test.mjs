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
const designContract = read("DESIGN.md");

test("shared primitives consume semantic aliases for surfaces and action accents", () => {
  assert.doesNotMatch(styleCss, /\.panel-card,\s*\.metric-card\s*\{/);
  assert.match(styleCss, /\.cs-surface\s*\{[\s\S]*background:[\s\S]*var\(--surface-base\)/);
  assert.match(styleCss, /\.cs-surface\s*\{[\s\S]*border:\s*1px solid var\(--border-subtle\);/);
  assert.match(
    styleCss,
    /\.primary-button\s*\{[^}]*background:\s*var\(--accent-primary\);/,
  );
  assert.match(
    styleCss,
    /\.status-banner\s*\{[\s\S]*background:\s*var\(--surface-raised\);/,
  );
});

test("design contract keeps global CSS narrow and feature CSS owned by domains", () => {
  assert.match(designContract, /## CSS Ownership/);
  assert.match(designContract, /style\.css` is the shared design-system boundary/);
  assert.match(designContract, /Large feature pages should graduate to feature CSS files/);
  assert.match(designContract, /Scoped Vue styles are acceptable for compact, single-component states/);
});
