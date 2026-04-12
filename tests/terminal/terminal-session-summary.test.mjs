import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const sessionSummary =
  await import("../../apps/api/modules/terminal/session-summary.ts");

test("terminal session summary exposes recoverable status and controller metadata", () => {
  const summary = sessionSummary.buildTerminalSessionSummary({
    sid: "term-1",
    status: "running",
    attachedClientId: "client-a",
    observerCount: 2,
  });

  assert.equal(summary.sessionId, "term-1");
  assert.equal(summary.controlState, "controller");
  assert.equal(summary.observerCount, 2);
  assert.equal(summary.canResume, true);
});

test("terminal session summary marks detached session as resumable observer", () => {
  const summary = sessionSummary.buildTerminalSessionSummary({
    sid: "term-2",
    status: "detached",
    attachedClientId: null,
    observerCount: 0,
  });

  assert.equal(summary.controlState, "observer");
  assert.equal(summary.canResume, true);
});
