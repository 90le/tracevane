import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertPrivateFileSecurity,
  resolvePrivateModeTempRoot,
} from "./helpers/private-file-mode.mjs";

test("native Windows accepts a regular private-state test file without Unix mode bits", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-private-mode-win-"));
  try {
    const file = path.join(root, "secret.json");
    fs.writeFileSync(file, "{}");
    assert.doesNotThrow(() => assertPrivateFileSecurity(file, { platform: "win32" }));
    assert.equal(resolvePrivateModeTempRoot({ platform: "win32", candidates: [root] }), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("POSIX evidence still rejects a non-0600 file", () => {
  assert.throws(
    () => assertPrivateFileSecurity("secret.json", { platform: "linux", statMode: 0o644, isFile: true }),
    /expected mode 0600/,
  );
});
