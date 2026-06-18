import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatHistoryStateSummary,
  buildChatStageHeader,
} from "../../dist/apps/web-vue/src/features/chat/chat-stage-selectors.js";

function createSession(overrides = {}) {
  return {
    key: "session-alpha",
    sessionId: "session-alpha-id",
    kind: "studio_managed",
    agentId: "agent.alpha",
    label: "Session Alpha",
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: "2026-04-12T10:00:00.000Z",
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
    },
    source: {
      source: "studio",
      channel: "webchat",
      surface: "studio-chat",
      originLabel: "Tracevane managed",
    },
    deliveryContext: {
      channel: "webchat",
      accountId: null,
      to: null,
      threadId: null,
    },
    permissions: {
      writable: true,
      canSend: true,
      canAbort: true,
      canReset: true,
      canDelete: true,
      canInject: false,
      visibleInFrontend: true,
      visibleInMvpRail: true,
    },
    runtime: {
      gatewayConnected: true,
      sessionWritable: true,
      activeRunId: null,
      state: "idle",
      lastEventAt: null,
      lastAckAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    ...overrides,
  };
}

test("buildChatStageHeader mirrors title, subtitle, and agent name", () => {
  const header = buildChatStageHeader({
    conversationTitle: "会话标题",
    conversationSubtitle: "会话副标题",
    agentName: "Claude",
  });

  assert.deepEqual(header, {
    title: "会话标题",
    subtitle: "会话副标题",
    agentName: "Claude",
  });
});

test("buildChatHistoryStateSummary captures selected session runtime context", () => {
  const session = createSession();
  const summary = buildChatHistoryStateSummary({
    historyMode: "search",
    selectedSessionKey: session.key,
    selectedSession: session,
    activeRunId: "run-1",
    viewingHistoricalPosition: true,
  });

  assert.deepEqual(summary, {
    historyMode: "search",
    selectedSessionKey: "session-alpha",
    hasSelectedSession: true,
    selectedSessionKind: "studio_managed",
    selectedSessionWritable: true,
    selectedSessionCanSend: true,
    selectedSessionHasActiveRun: true,
    viewingHistoricalPosition: true,
  });
});

test("buildChatHistoryStateSummary degrades safely when no session is selected", () => {
  const summary = buildChatHistoryStateSummary({
    historyMode: "history",
    selectedSessionKey: "",
    selectedSession: null,
    activeRunId: null,
    viewingHistoricalPosition: false,
  });

  assert.equal(summary.hasSelectedSession, false);
  assert.equal(summary.selectedSessionKind, null);
  assert.equal(summary.selectedSessionWritable, false);
  assert.equal(summary.selectedSessionCanSend, false);
  assert.equal(summary.selectedSessionHasActiveRun, false);
});
