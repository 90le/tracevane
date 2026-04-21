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

test("terminal routes expose rename and delete session endpoints", () => {
  assert.match(
    terminalRoutesSource,
    /\/api\/terminal\/sessions\/:sessionId\/rename/,
  );
  assert.match(
    terminalRoutesSource,
    /\/api\/terminal\/sessions\/:sessionId\/delete/,
  );
});

test("terminal session routes delegate rename and delete to terminal service", () => {
  assert.match(
    terminalRoutesSource,
    /renamePersistedSession\([\s\S]*params\.sessionId,/,
  );
  assert.match(
    terminalRoutesSource,
    /deletePersistedSession\([\s\S]*params\.sessionId/,
  );
});

test("terminal rename route returns not_found when session is missing", () => {
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/rename"[\s\S]*const session = await terminal\.renamePersistedSession\([\s\S]*params\.sessionId,[\s\S]*title[\s\S]*\)/,
  );
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/rename"[\s\S]*if \(!session\)[\s\S]*sendJson\(res, 404, \{/,
  );
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/rename"[\s\S]*message: `terminal session not found: \$\{params\.sessionId\}`/,
  );
});

test("terminal delete route returns not_found when no session is deleted", () => {
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/delete"[\s\S]*const result = await routeCtx\.services\.terminal\.deletePersistedSession\([\s\S]*params\.sessionId[\s\S]*\)/,
  );
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/delete"[\s\S]*if \(!result\.success\)[\s\S]*sendJson\(res, 404, \{/,
  );
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/delete"[\s\S]*message: `terminal session not found: \$\{params\.sessionId\}`/,
  );
});

test("terminal delete route maps active-session delete rejection to conflict response", () => {
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/delete"[\s\S]*if \(result\.reason === "session_active"\)[\s\S]*sendJson\(res, 409, \{/,
  );
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/delete"[\s\S]*error: "conflict"/,
  );
  assert.match(
    terminalRoutesSource,
    /"\/api\/terminal\/sessions\/:sessionId\/delete"[\s\S]*terminal session is active and must be ended before delete/,
  );
});
