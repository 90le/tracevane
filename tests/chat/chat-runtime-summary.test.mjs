import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatDiagnosticsSummary,
  buildChatSessionRuntimeSummary,
} from "../../dist/apps/api/modules/chat/runtime-summary.js";

test("buildChatSessionRuntimeSummary projects runtime state fields for history payload seams", () => {
  const summary = buildChatSessionRuntimeSummary({
    gatewayConnected: true,
    sessionWritable: false,
    activeRunId: "run-1",
    state: "running",
    lastEventAt: "2026-04-12T12:00:00.000Z",
    lastAckAt: "2026-04-12T12:00:01.000Z",
    lastErrorCode: null,
    lastErrorMessage: null,
  });

  assert.deepEqual(summary, {
    state: "running",
    hasActiveRun: true,
    activeRunId: "run-1",
    gatewayConnected: true,
    sessionWritable: false,
    lastEventAt: "2026-04-12T12:00:00.000Z",
    lastAckAt: "2026-04-12T12:00:01.000Z",
    lastErrorCode: null,
  });
});

test("buildChatDiagnosticsSummary flags truncation and gateway reachability issues", () => {
  const healthy = buildChatDiagnosticsSummary({
    gatewayReachable: true,
    gatewayWsUrl: "ws://127.0.0.1:11000",
    transport: "tracevane_bff",
    authMode: "tracevane_backend_token",
    rawGatewayFramesExposed: false,
    rawGatewayMethodsExposed: false,
    sameOriginRequired: true,
    historyTruncated: false,
    truncationMode: "none",
    runtimeCapabilities: [],
    fileCapability: {
      browseEndpoint: "/api/files/browse",
      uploadEndpoint: "/api/files/uploads/*",
      readEndpoint: "/api/files/read",
      downloadEndpoint: "/api/files/download",
      resourceRef: "files:<rootId>:<path>",
      legacyRefsReadOnly: ["workspace:", "uploads:"],
    },
    notes: ["ok"],
  });
  assert.equal(healthy.hasIssues, false);
  assert.equal(healthy.noteCount, 1);

  const degraded = buildChatDiagnosticsSummary({
    gatewayReachable: false,
    gatewayWsUrl: "ws://127.0.0.1:11000",
    transport: "tracevane_bff",
    authMode: "tracevane_backend_token",
    rawGatewayFramesExposed: false,
    rawGatewayMethodsExposed: false,
    sameOriginRequired: true,
    historyTruncated: true,
    truncationMode: "tail_marked",
    runtimeCapabilities: [],
    fileCapability: {
      browseEndpoint: "/api/files/browse",
      uploadEndpoint: "/api/files/uploads/*",
      readEndpoint: "/api/files/read",
      downloadEndpoint: "/api/files/download",
      resourceRef: "files:<rootId>:<path>",
      legacyRefsReadOnly: ["workspace:", "uploads:"],
    },
    notes: ["gateway down", "truncated"],
  });

  assert.deepEqual(degraded, {
    gatewayReachable: false,
    historyTruncated: true,
    truncationMode: "tail_marked",
    noteCount: 2,
    hasIssues: true,
  });
});
