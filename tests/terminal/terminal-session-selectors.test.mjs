import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const selectors =
  await import("../../apps/web-vue/src/features/terminal/terminal-session-selectors.ts");

test("buildTerminalSessionStatusSummary derives running controller status", () => {
  const summary = selectors.buildTerminalSessionStatusSummary({
    status: "running",
    controlState: "controller",
    canResume: true,
  });

  assert.equal(summary.tone, "success");
  assert.equal(summary.labelZh, "控制中");
  assert.equal(summary.labelEn, "Live control");
});

test("buildTerminalSessionStatusSummary derives resume state for detached observer", () => {
  const summary = selectors.buildTerminalSessionStatusSummary({
    status: "detached",
    controlState: "observer",
    canResume: true,
  });

  assert.equal(summary.tone, "warning");
  assert.match(summary.labelEn, /Resume/i);
});

test("buildTerminalTakeoverSummary indicates takeover when observer", () => {
  const summary = selectors.buildTerminalTakeoverSummary({
    controlState: "observer",
  });

  assert.equal(summary.canTakeover, true);
  assert.equal(summary.labelZh, "请求接管");
});
