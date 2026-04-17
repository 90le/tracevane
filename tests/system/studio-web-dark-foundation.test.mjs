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
  assert.match(styleCss, /--bg-app:\s*var\(--shell-bg-start\);/);
  assert.match(styleCss, /--surface-base:\s*var\(--shell-panel-fill\);/);
  assert.match(
    styleCss,
    /--surface-raised:\s*var\(--shell-panel-fill-strong\);/,
  );
  assert.match(
    styleCss,
    /--surface-overlay:\s*color-mix\(in srgb, var\(--shell-stage-fill-strong\) 96%, transparent\);/,
  );
  assert.match(styleCss, /--text-primary:\s*var\(--text\);/);
  assert.match(styleCss, /--text-secondary:\s*var\(--muted\);/);
  assert.match(styleCss, /--border-subtle:\s*var\(--shell-panel-border\);/);
  assert.match(styleCss, /--border-strong:\s*var\(--shell-stage-border\);/);
  assert.match(styleCss, /--accent-primary:\s*var\(--acc\);/);
  assert.match(styleCss, /--focus-ring:\s*rgba\(91,\s*150,\s*255,\s*0\.24\);/);
});

test("light theme block keeps semantic aliases defined", () => {
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--surface-base:\s*var\(--shell-panel-fill\);/,
  );
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--surface-raised:\s*var\(--shell-panel-fill-strong\);/,
  );
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--surface-overlay:\s*color-mix\(in srgb, var\(--shell-stage-fill-strong\) 98%, transparent\);/,
  );
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--border-subtle:\s*var\(--shell-panel-border\);/,
  );
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--accent-primary:\s*var\(--acc\);/,
  );
});
