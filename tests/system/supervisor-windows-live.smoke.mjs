import assert from "node:assert/strict";
import test from "node:test";

import {
  runSupervisorLiveLifecycle,
} from "./fixtures/supervisor-fixture-daemon.mjs";

const liveEnabled = process.env.TRACEVANE_WINDOWS_SUPERVISOR_LIVE === "1";
const skipReason = process.platform !== "win32"
  ? "Windows Task Scheduler smoke only runs on win32"
  : !liveEnabled
    ? "set TRACEVANE_WINDOWS_SUPERVISOR_LIVE=1 to run the destructive live smoke"
    : false;

test("Windows Task Scheduler owns and recovers a PID-unique fixture", {
  skip: skipReason,
  timeout: 180_000,
}, async () => {
  const result = await runSupervisorLiveLifecycle({
    platform: "win32",
    platformSlug: "windows",
    osRestartTimeoutMs: 100_000,
  });

  assert.equal(
    result.nativeName,
    `TracevaneTest-Windows-${process.pid}`,
  );
});
