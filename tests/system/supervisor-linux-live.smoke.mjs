import assert from "node:assert/strict";
import test from "node:test";

import {
  runSupervisorLiveLifecycle,
} from "./fixtures/supervisor-fixture-daemon.mjs";

const liveEnabled = process.env.TRACEVANE_LINUX_SUPERVISOR_LIVE === "1";
const skipReason = process.platform !== "linux"
  ? "systemd user-service smoke only runs on linux"
  : !liveEnabled
    ? "set TRACEVANE_LINUX_SUPERVISOR_LIVE=1 to run the destructive live smoke"
    : false;

test("Linux systemd --user owns and recovers a PID-unique fixture", {
  skip: skipReason,
  timeout: 75_000,
}, async () => {
  const result = await runSupervisorLiveLifecycle({
    platform: "linux",
    platformSlug: "linux",
    osRestartTimeoutMs: 30_000,
  });

  assert.equal(
    result.nativeName,
    `tracevane-test-linux-${process.pid}.service`,
  );
});
