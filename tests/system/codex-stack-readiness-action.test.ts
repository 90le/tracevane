import assert from "node:assert/strict";
import test from "node:test";
import type {
  CodexStackRunReadinessCheck,
  CodexStackRunReadinessMode,
  CodexStackSummaryPayload,
} from "../../types/codex-stack";
import {
  normalizeCodexStackRunReadinessCheck,
  normalizeCodexStackRunReadinessMode,
  resolveCodexStackRunReadinessAction,
  resolveCodexStackRunReadinessModeAction,
} from "../../apps/web-vue/src/features/codex-stack/readiness-action";
import { buildCodexStackRepairActions as buildRepairActions } from "../../apps/web-vue/src/features/codex-stack/codex-stack-view-model";

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

test("codex stack readiness action resolver dispatches NO_PROXY repair hints", () => {
  const command = resolveCodexStackRunReadinessAction(
    checkWithAction({
      kind: "repair",
      label: "Fix NO_PROXY",
      repairActions: ["repair-no-proxy-loopback"],
    }),
    "View details",
  );
  assert.deepEqual(command, { type: "repair", actions: ["repair-no-proxy-loopback"] });
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

function modeWithAction(actionHint: CodexStackRunReadinessMode["actionHint"]): CodexStackRunReadinessMode {
  return {
    id: "long-task",
    label: "Long task",
    ready: false,
    detail: "Needs a larger context window.",
    actionHint,
  };
}

test("codex stack readiness action resolver dispatches run mode repair hints", () => {
  const command = resolveCodexStackRunReadinessModeAction(
    modeWithAction({
      kind: "repair",
      label: "Attach Studio Gateway after smoke",
      repairActions: ["apply-codex-studio-after-smoke"],
    }),
    "View details",
  );

  assert.deepEqual(command, { type: "repair", actions: ["apply-codex-studio-after-smoke"] });
});

test("codex stack readiness action resolver opens legacy run modes on the dashboard", () => {
  const legacyMode = {
    id: "chat",
    label: "Chat",
    ready: false,
    detail: "Needs verification.",
  } as CodexStackRunReadinessMode;

  assert.deepEqual(
    normalizeCodexStackRunReadinessMode(legacyMode, "View details").actionHint,
    { kind: "open-section", label: "View details", section: "dashboard" },
  );
  assert.deepEqual(
    resolveCodexStackRunReadinessModeAction(legacyMode, "View details"),
    { type: "open-section", section: "dashboard" },
  );
});

function summaryForRepairAction(
  codexAuthStatus: CodexStackRunReadinessCheck["status"],
  matchesProxyKey: boolean | null,
): CodexStackSummaryPayload {
  return {
    services: [
      {
        id: "openclaw-studio-model-gateway.service",
        installed: true,
        enabled: true,
        active: true,
        rawActiveState: "active",
        rawEnabledState: "enabled",
      },
      {
        id: "cc-connect.service",
        installed: true,
        enabled: true,
        active: true,
        rawActiveState: "active",
        rawEnabledState: "enabled",
      },
    ],
    secrets: {
      studioGatewayProxyKey: {
        hasSecret: true,
        masked: "stu...",
        source: "/tmp/config.toml",
        length: 12,
      },
      codexAuth: {
        hasSecret: true,
        masked: "off...",
        source: "/tmp/auth.json",
        length: 12,
        mode: "apikey",
        matchesProxyKey,
      },
      officialChatGptAuthBackup: {
        hasSecret: false,
        masked: null,
        source: null,
        length: null,
        mode: null,
        restorable: false,
      },
    },
    proxyPolicy: {
      providerMode: "direct",
      providerProxyUrl: null,
      providerProxySource: null,
      noProxy: "localhost,127.0.0.1,::1",
      noProxyLoopbackReady: true,
      noProxyLoopbackMissing: [],
      providerConfigProxyUrls: [],
      upstreamBaseUrl: null,
      upstreamApiKeyConfigured: false,
    },
    ccConnect: {
      bindingPresent: false,
    },
    warnings: [],
    runReadiness: {
      checks: [
        {
          id: "codex-auth",
          label: "Codex CLI key",
          status: codexAuthStatus,
          detail: "Codex auth state.",
          section: "settings",
          actionHint: { kind: "open-section", label: "View config", section: "settings" },
        },
      ],
    },
  } as CodexStackSummaryPayload;
}

test("codex stack recommended repair does not rewrite official Codex auth while CPA is only pending attach", () => {
  const actions = buildRepairActions(summaryForRepairAction("warn", false));

  assert.ok(!actions.includes("repair-auth-json"));
});

test("codex stack recommended repair still rewrites auth when an attached CPA path fails auth readiness", () => {
  const actions = buildRepairActions(summaryForRepairAction("fail", false));

  assert.ok(actions.includes("repair-auth-json"));
});
