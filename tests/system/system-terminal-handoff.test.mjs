import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const handoffPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-terminal-handoff.ts",
);
const handoffPanelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemActionHandoffPanel.vue",
);
const systemControlPagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemControlPage.vue",
);
const handoffModuleUrl = `${pathToFileURL(handoffPath).href}?t=${Date.now()}`;

test("system terminal handoff seam exposes buildSystemTerminalHandoff", () => {
  const handoffSource = fs.readFileSync(handoffPath, "utf8");

  assert.match(handoffSource, /export function buildSystemTerminalHandoff\(/);
  assert.match(
    handoffSource,
    /to:\s*`\/terminal\/\$\{encodeURIComponent\(sessionId\)\}`/,
  );
});

test("system terminal handoff ignores non-string createSessionId results", async () => {
  const { buildSystemTerminalHandoff } = await import(handoffModuleUrl);

  assert.doesNotThrow(() => {
    const handoff = buildSystemTerminalHandoff({
      createSessionId: () => null,
    });
    assert.match(handoff.to, /^\/terminal\/.+/);
    assert.ok(handoff.sessionId.length > 0);
  });
});

test("system control page consumes terminal handoff seam via panel", () => {
  const pageSource = fs.readFileSync(systemControlPagePath, "utf8");

  assert.match(
    pageSource,
    /import SystemActionHandoffPanel from '\.\/SystemActionHandoffPanel\.vue'/,
  );
  assert.match(
    pageSource,
    /import \{ buildSystemTerminalHandoff \} from '\.\/system-terminal-handoff'/,
  );
  assert.match(
    pageSource,
    /const terminalHandoff = computed\(\(\) => buildSystemTerminalHandoff\(/,
  );
  assert.match(pageSource, /<SystemActionHandoffPanel/);
  assert.match(pageSource, /@handoff="openTerminalHandoff"/);
  assert.match(pageSource, /router\.push\(terminalHandoff\.value\.to\)/);
});

test("system terminal handoff panel exposes dedicated handoff event seam", () => {
  const panelSource = fs.readFileSync(handoffPanelPath, "utf8");

  assert.match(panelSource, /defineEmits<\{\s*handoff:\s*\[\]\s*\}>\(\)/);
  assert.match(panelSource, /@click="emit\('handoff'\)"/);
});
