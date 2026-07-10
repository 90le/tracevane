import test from "node:test";
import assert from "node:assert/strict";

import {
  ChannelConnectorWorkspaceQueueFullError,
  createChannelConnectorTargetExecutionCoordinator,
} from "../../dist/apps/api/modules/channel-connectors/target-execution-coordinator.js";

test("Channel Connectors serializes Agent turns that share one workspace", async () => {
  const coordinator = createChannelConnectorTargetExecutionCoordinator();
  const first = await coordinator.acquire({ workspaceKey: "/workspace/shared" });
  let secondAcquired = false;
  const secondPromise = coordinator.acquire({ workspaceKey: "/workspace/shared" }).then((lease) => {
    secondAcquired = true;
    return lease;
  });
  await Promise.resolve();
  assert.equal(secondAcquired, false);
  assert.deepEqual(coordinator.status(), [{
    workspaceKey: "/workspace/shared",
    active: 1,
    queued: 1,
    maxActive: 1,
  }]);
  first.release();
  const second = await secondPromise;
  assert.equal(secondAcquired, true);
  assert.ok(second.queuedAt);
  second.release();
  assert.deepEqual(coordinator.status(), []);
});

test("Channel Connectors allows different Agent workspaces to run independently", async () => {
  const coordinator = createChannelConnectorTargetExecutionCoordinator();
  const [one, two] = await Promise.all([
    coordinator.acquire({ workspaceKey: "/workspace/one" }),
    coordinator.acquire({ workspaceKey: "/workspace/two" }),
  ]);
  assert.deepEqual(coordinator.status().map((item) => item.active), [1, 1]);
  one.release();
  two.release();
  assert.deepEqual(coordinator.status(), []);
});

test("Channel Connectors supports explicitly verified workspace concurrency", async () => {
  const coordinator = createChannelConnectorTargetExecutionCoordinator();
  const one = await coordinator.acquire({ workspaceKey: "/workspace/read-only", maxActive: 2 });
  const two = await coordinator.acquire({ workspaceKey: "/workspace/read-only", maxActive: 2 });
  assert.deepEqual(coordinator.status(), [{
    workspaceKey: "/workspace/read-only",
    active: 2,
    queued: 0,
    maxActive: 2,
  }]);
  one.release();
  two.release();
});

test("Channel Connectors rejects work when a target workspace queue is full", async () => {
  const coordinator = createChannelConnectorTargetExecutionCoordinator();
  const active = await coordinator.acquire({ workspaceKey: "/workspace/full", queueLimit: 1 });
  const queued = coordinator.acquire({ workspaceKey: "/workspace/full", queueLimit: 1 });
  await assert.rejects(
    coordinator.acquire({ workspaceKey: "/workspace/full", queueLimit: 1 }),
    ChannelConnectorWorkspaceQueueFullError,
  );
  active.release();
  (await queued).release();
});

test("Channel Connectors removes cancelled workspace queue entries", async () => {
  const coordinator = createChannelConnectorTargetExecutionCoordinator();
  const active = await coordinator.acquire({ workspaceKey: "/workspace/cancel" });
  const controller = new AbortController();
  const queued = coordinator.acquire({
    workspaceKey: "/workspace/cancel",
    signal: controller.signal,
  });
  controller.abort(new Error("cancelled by test"));
  await assert.rejects(queued, /cancelled by test/);
  assert.equal(coordinator.status()[0].queued, 0);
  active.release();
  assert.deepEqual(coordinator.status(), []);
});
