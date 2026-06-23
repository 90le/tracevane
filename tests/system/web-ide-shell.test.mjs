import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
const router = fs.readFileSync(new URL("../../apps/web/src/app/router.tsx", import.meta.url), "utf-8");
test("/ide renders IdeShell outside AppShell layout", () => {
  assert.match(router, /import \{ IdeShell \}/);
  assert.ok(router.includes('<Route path="/ide" element={<IdeShell />} />'));
});
test("IdeShell is exported", () => {
  const shell = fs.readFileSync(new URL("../../apps/web/src/features/ide/IdeShell.tsx", import.meta.url), "utf-8");
  assert.match(shell, /export function IdeShell/);
});
