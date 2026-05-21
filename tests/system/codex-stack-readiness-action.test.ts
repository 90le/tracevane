import assert from "node:assert/strict";
import test from "node:test";
import type { CodexStackRunReadinessCheck } from "../../types/codex-stack";
import {
  normalizeCodexStackRunReadinessCheck,
  resolveCodexStackRunReadinessAction,
} from "../../apps/web-vue/src/features/codex-stack/readiness-action";

function checkWithAction(
  actionHint: CodexStackRunReadinessCheck["actionHint"],
): CodexStackRunReadinessCheck {
  return {
    id: "smoke-matrix",
    label: "Smoke matrix",
    status: "fail",
    detail: "Needs verification.",
    section: "install",
    actionHint,
  };
}

test("codex stack readiness action resolver dispatches run-check hints", () => {
  const command = resolveCodexStackRunReadinessAction(
    checkWithAction({ kind: "run-check", label: "Run health check" }),
    "View details",
  );
  assert.deepEqual(command, { type: "run-check" });
});

test("codex stack readiness action resolver dispatches repair hints", () => {
  const command = resolveCodexStackRunReadinessAction(
    checkWithAction({
      kind: "repair",
      label: "Run smoke matrix",
      repairActions: ["run-smoke-matrix"],
    }),
    "View details",
  );
  assert.deepEqual(command, { type: "repair", actions: ["run-smoke-matrix"] });
});

test("codex stack readiness action resolver opens explicit or fallback sections", () => {
  assert.deepEqual(
    resolveCodexStackRunReadinessAction(
      checkWithAction({ kind: "open-section", label: "Edit NO_PROXY", section: "settings" }),
      "View details",
    ),
    { type: "open-section", section: "settings" },
  );

  assert.deepEqual(
    resolveCodexStackRunReadinessAction(
      checkWithAction({ kind: "open-section", label: "View details" }),
      "View details",
    ),
    { type: "open-section", section: "install" },
  );
});

test("codex stack readiness action resolver tolerates legacy checks without actionHint", () => {
  const legacyCheck = {
    id: "proxy-loopback",
    label: "NO_PROXY",
    status: "fail",
    detail: "Missing loopback.",
    section: "settings",
  } as CodexStackRunReadinessCheck;

  assert.deepEqual(
    normalizeCodexStackRunReadinessCheck(legacyCheck, "View details").actionHint,
    { kind: "open-section", label: "View details", section: "settings" },
  );
  assert.deepEqual(
    resolveCodexStackRunReadinessAction(legacyCheck, "View details"),
    { type: "open-section", section: "settings" },
  );
});
