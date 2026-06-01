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

test("semantic token aliases map to shell primitives in dark theme", () => {
  assert.match(styleCss, /--bg-app:\s*var\(--mono-bg\);/);
  assert.match(styleCss, /--surface-base:\s*var\(--mono-panel\);/);
  assert.match(styleCss, /--surface-raised:\s*var\(--mono-panel-2\);/);
  assert.match(styleCss, /--surface-soft:\s*var\(--mono-panel-3\);/);
  assert.match(styleCss, /--surface-overlay:\s*var\(--mono-panel\);/);
  assert.match(styleCss, /--text-primary:\s*var\(--mono-ink\);/);
  assert.match(styleCss, /--text-secondary:\s*var\(--mono-ink-2\);/);
  assert.match(styleCss, /--border-subtle:\s*var\(--mono-line\);/);
  assert.match(styleCss, /--border-strong:\s*var\(--mono-line-2\);/);
  assert.match(styleCss, /--accent-primary:\s*#0f766e;/);
  assert.match(styleCss, /--warn:\s*var\(--warning\);/);
  assert.match(styleCss, /--focus-ring:\s*var\(--mono-ring\);/);
});

test("light theme block keeps semantic aliases defined", () => {
  const lightBlocks = [...styleCss.matchAll(/html\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/g)];
  assert.equal(lightBlocks.length, 1);
  const lightBlock = lightBlocks[0][1];

  assert.match(lightBlock, /--surface-base:\s*var\(--mono-panel\);/);
  assert.match(lightBlock, /--surface-raised:\s*var\(--mono-panel-2\);/);
  assert.match(lightBlock, /--surface-soft:\s*var\(--mono-panel-3\);/);
  assert.match(lightBlock, /--surface-overlay:\s*var\(--mono-panel\);/);
  assert.match(lightBlock, /--text-primary:\s*var\(--mono-ink\);/);
  assert.match(lightBlock, /--warn:\s*var\(--warning\);/);
  assert.match(lightBlock, /--shell-panel-fill:\s*var\(--mono-panel\);/);
  assert.match(lightBlock, /--field-border-focus:\s*var\(--control-border-focus\);/);
});
