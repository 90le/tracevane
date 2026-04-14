import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const terminalRoutesPath = path.join(
  rootDir,
  "apps/api/modules/terminal/routes.ts",
);

const terminalRoutesSource = fs.readFileSync(terminalRoutesPath, "utf8");

test("terminal routes expose recovery-oriented session endpoints", () => {
  assert.match(terminalRoutesSource, /\/api\/terminal\/sessions\/:sessionId/);
  assert.match(
    terminalRoutesSource,
    /\/api\/terminal\/sessions\/:sessionId\/ledger/,
  );
  assert.match(terminalRoutesSource, /listPersistedSessions\(\)/);
});

test("terminal session recovery endpoints delegate to persistence readers", () => {
  assert.match(
    terminalRoutesSource,
    /getPersistedSession\([\s\S]*params\.sessionId[\s\S]*\)/,
  );
  assert.match(terminalRoutesSource, /listSessionLedger\(params\.sessionId\)/);
  assert.match(
    terminalRoutesSource,
    /terminal session not found: \$\{params\.sessionId\}/,
  );
});

test("system terminal handoff helper encodes a stable session route", async () => {
  const mod =
    await import("../../apps/web-vue/src/features/system/system-terminal-handoff.ts");
  const handoff = mod.buildSystemTerminalHandoff({ sessionId: "term-1" });

  assert.match(handoff.to, /^\/terminal\/term-1\?/);
  assert.match(handoff.to, /fromModule=system/);
});
