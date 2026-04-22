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

test("buildTerminalSessionStatusSummary marks completed session as ended", () => {
  const summary = selectors.buildTerminalSessionStatusSummary({
    status: "completed",
    controlState: "observer",
    canResume: false,
  });

  assert.equal(summary.tone, "muted");
  assert.equal(summary.labelZh, "已结束");
});

test("buildTerminalSessionStatusSummary marks failed sessions explicitly", () => {
  const summary = selectors.buildTerminalSessionStatusSummary({
    status: "failed",
    controlState: "observer",
    canResume: false,
  });

  assert.equal(summary.tone, "warning");
  assert.equal(summary.labelZh, "失败");
});

test("buildTerminalSessionDisplayTitle localizes generated terminal titles", () => {
  const summary = selectors.buildTerminalSessionDisplayTitle({
    title: "Terminal test-session",
    sessionId: "test-session",
  });

  assert.equal(summary.labelZh, "终端 test-session");
  assert.equal(summary.labelEn, "Shell test-session");
});

test("buildTerminalSessionDisplayTitle falls back to a short shell label", () => {
  const summary = selectors.buildTerminalSessionDisplayTitle({
    title: "",
    sessionId: "term-1",
  });

  assert.equal(summary.labelZh, "终端");
  assert.equal(summary.labelEn, "Shell");
});
