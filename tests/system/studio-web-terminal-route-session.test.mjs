import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const routeManifestPath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/route-manifest.ts",
);
const workspacePagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/terminal/TerminalWorkspacePage.vue",
);

const routeManifest = fs.readFileSync(routeManifestPath, "utf8");
const workspacePage = fs.readFileSync(workspacePagePath, "utf8");

test("shell route manifest supports terminal base and session routes", () => {
  assert.match(
    routeManifest,
    /\{\s*path:\s*['"]\/terminal['"],\s*component:\s*TerminalView\s*\}/,
  );
  assert.match(
    routeManifest,
    /\{\s*path:\s*['"]\/terminal\/:sessionId['"],\s*component:\s*TerminalView\s*\}/,
  );
});

test("terminal workspace page persists route session id to terminal session storage", () => {
  assert.match(workspacePage, /route\.params\.sessionId/);
  assert.match(
    workspacePage,
    /TERMINAL_SESSION_STORAGE_KEY\s*=\s*['"]openclaw-studio\.terminal\.sid['"]/,
  );
  assert.match(
    workspacePage,
    /sessionStorage\.setItem\(TERMINAL_SESSION_STORAGE_KEY, normalizedSessionId\)/,
  );
  assert.match(workspacePage, /sessionRouteKey/);
});
