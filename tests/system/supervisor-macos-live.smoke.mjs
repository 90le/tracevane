import assert from "node:assert/strict";
import test from "node:test";

import {
  runSupervisorLiveLifecycle,
} from "./fixtures/supervisor-fixture-daemon.mjs";

const liveEnabled = process.env.TRACEVANE_MACOS_SUPERVISOR_LIVE === "1";
const skipReason = process.platform !== "darwin"
  ? "macOS LaunchAgent smoke only runs on darwin"
  : !liveEnabled
    ? "set TRACEVANE_MACOS_SUPERVISOR_LIVE=1 to run the destructive live smoke"
    : false;

test("macOS launchd owns and recovers a PID-unique fixture", {
  skip: skipReason,
  timeout: 75_000,
}, async () => {
  const result = await runSupervisorLiveLifecycle({
    platform: "darwin",
    platformSlug: "macos",
    osRestartTimeoutMs: 30_000,
  });

  assert.equal(
    result.nativeName,
    `dev.tracevane.test.macos.${process.pid}`,
  );
});
