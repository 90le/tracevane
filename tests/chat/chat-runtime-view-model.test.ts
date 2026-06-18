import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatComposerPersistedDraft } from "../../lib/chat-composer-draft";
import { mergeCanonicalSnapshotPageInfo } from "../../lib/chat-history-page-info";
import {
  clearChatRealtimeRecoveryState,
  createChatRealtimeRecoveryState,
  markChatRealtimeDisconnected,
  resolveChatRealtimeRecoverySyncDecision,
  shouldScheduleChatRealtimeRecoverySync,
} from "../../lib/chat-realtime-recovery";
import {
  clearChatStreamReplaySession,
  createChatStreamReplayState,
  listChatStreamEventsAfter,
  normalizeChatStreamSeq,
  rememberChatStreamEvent,
} from "../../lib/chat-stream-replay";
import {
  clearChatLastStreamSeq,
  readChatComposerDraft,
  readChatSessionViewportSnapshot,
  readChatLastStreamSeq,
  rememberChatComposerDraft,
  rememberChatSessionViewportSnapshot,
  rememberChatLastStreamSeq,
} from "../../apps/web-vue/src/features/chat/storage";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const viewModelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/chat/chat-runtime-view-model.ts",
);
const conversationPanePath = path.join(
  rootDir,
  "apps/web-vue/src/features/chat/ConversationPane.vue",
);
const conversationPaneCssPath = path.join(
  rootDir,
  "apps/web-vue/src/features/chat/conversation-pane.css",
);
const chatShellPagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/chat/ChatShellPage.vue",
);
const composerBarPath = path.join(
  rootDir,
  "apps/web-vue/src/features/chat/ComposerBar.vue",
);
const chatApiPath = path.join(
  rootDir,
  "apps/web-vue/src/features/chat/api.ts",
);

test("chat runtime view model consumes runtime summary helpers", () => {
  const source = fs.readFileSync(viewModelPath, "utf8");
  assert.match(source, /buildChatRuntimeSummary/);
  assert.match(source, /buildChatOverlaySummary/);
  assert.match(source, /const runtimeSummary = computed/);
  assert.match(source, /const overlaySummary = computed/);
});

test("canonical snapshot page info keeps existing before cursor for bounded tail snapshots", () => {
  const merged = mergeCanonicalSnapshotPageInfo(
    {
      hasMoreBefore: true,
      beforeCursor: "before-bootstrap",
      hasMoreAfter: false,
      afterCursor: null,
    },
    {
      hasMoreBefore: false,
      beforeCursor: null,
      hasMoreAfter: false,
      afterCursor: null,
    },
    { snapshotMessageCount: 24 },
  );

  assert.deepEqual(merged, {
    hasMoreBefore: true,
    beforeCursor: "before-bootstrap",
    hasMoreAfter: false,
    afterCursor: null,
  });
});

test("canonical snapshot page info accepts explicit before cursor and reset snapshots", () => {
  assert.deepEqual(
    mergeCanonicalSnapshotPageInfo(
      {
        hasMoreBefore: true,
        beforeCursor: "before-bootstrap",
        hasMoreAfter: false,
        afterCursor: null,
      },
      {
        hasMoreBefore: true,
        beforeCursor: "before-snapshot",
        hasMoreAfter: false,
        afterCursor: null,
      },
      { snapshotMessageCount: 24 },
    ),
    {
      hasMoreBefore: true,
      beforeCursor: "before-snapshot",
      hasMoreAfter: false,
      afterCursor: null,
    },
  );

  assert.deepEqual(
    mergeCanonicalSnapshotPageInfo(
      {
        hasMoreBefore: true,
        beforeCursor: "before-bootstrap",
        hasMoreAfter: false,
        afterCursor: null,
      },
      {
        hasMoreBefore: false,
        beforeCursor: null,
        hasMoreAfter: false,
        afterCursor: null,
      },
      { snapshotMessageCount: 0 },
    ),
    {
      hasMoreBefore: false,
      beforeCursor: null,
      hasMoreAfter: false,
      afterCursor: null,
    },
  );
});

test("conversation pane observes async item resizes for scroll stability", () => {
  const source = fs.readFileSync(conversationPanePath, "utf8");
  assert.match(source, /let timelineItemResizeObserver: ResizeObserver \| null = null;/);
  assert.match(source, /function observeTimelineItemShell/);
  assert.match(source, /new ResizeObserver/);
  assert.match(source, /handleObservedTimelineResize/);
  assert.match(source, /let resizeObserverFrame: number \| null = null;/);
  assert.match(source, /function scheduleResizeObserverWork/);
  assert.match(source, /scheduleResizeObserverWork\(\{ timelineResize: true \}\)/);
  assert.match(source, /scheduleResizeObserverWork\(\{ threadSync: true, timelineResize: true \}\)/);
  assert.match(source, /scheduleTimelineItemMeasurement\(\)/);
  assert.match(source, /scrollState\.value\.isPinnedToBottom/);
  assert.match(source, /let pinnedBottomRepairFrame: number \| null = null;/);
  assert.match(source, /function schedulePinnedBottomRepair\(\): void \{/);
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(source, /scrollToBottom\('auto', \{ force: true \}\)/);
  assert.match(source, /const HISTORY_PREPEND_ANCHOR_STABILIZE_MS = 2200;/);
  assert.match(source, /changed && \(stableRestoreAnchorItemId \|\| stableRestoreBottomDistance != null\)/);
  assert.match(source, /const HISTORY_LATEST_BOTTOM_ANCHOR_STABILIZE_MS = 3600;/);
});

test("conversation pane restores per-session history viewport when returning to a chat", () => {
  const source = fs.readFileSync(conversationPanePath, "utf8");
  assert.match(source, /type SessionViewportSnapshot = \{/);
  assert.match(source, /const sessionViewportSnapshots = new Map<string, SessionViewportSnapshot>\(\);/);
  assert.match(source, /readChatSessionViewportSnapshot/);
  assert.match(source, /rememberChatSessionViewportSnapshot/);
  assert.match(source, /window\.addEventListener\('beforeunload', handleBeforeUnload\)/);
  assert.match(source, /function captureSessionViewportSnapshot\(sessionKey: string \| null \| undefined\): void/);
  assert.match(source, /function scheduleSessionViewportSnapshotPersist\(delayMs = 220\): void/);
  assert.match(source, /readVisibleTimelineAnchor\(\)/);
  assert.match(source, /function currentTimelineAnchorCandidateRange\(\): \{ start: number; end: number \} \{/);
  assert.match(source, /const virtualWindow = timelineVirtualWindow\.value;/);
  assert.match(source, /const candidateRange = currentTimelineAnchorCandidateRange\(\);/);
  assert.match(source, /for \(let index = candidateRange\.start; index < candidateRange\.end; index \+= 1\) \{/);
  assert.match(source, /partiallyVisibleAnchor = partiallyVisibleAnchor \|\| anchor/);
  assert.match(source, /anchorMessageId: anchor\?\.messageId \|\| null/);
  assert.match(source, /function restoreMessageElementAnchor\(messageId: string \| null, offset: number\): boolean/);
  assert.match(source, /function restoreSessionViewportSnapshot\(sessionKey: string \| null \| undefined\): boolean/);
  assert.match(source, /restoreTimelineItemAnchor\(snapshot\.anchorItemId, snapshot\.anchorOffset\)/);
  assert.match(source, /restoreMessageElementAnchor\(snapshot\.anchorMessageId, snapshot\.anchorOffset\)/);
  assert.match(source, /restoreHistoryBrowseFallbackBottomDistance\(snapshot\.bottomDistance\)/);
  assert.match(source, /hasRestorableSessionViewportSnapshot\(props\.selectedSession\.key\)/);
  assert.match(source, /captureSessionViewportSnapshot\(previousSessionKey\)/);
  assert.match(source, /const restoredSessionViewport = restoreSessionViewportSnapshot\(sessionKey\)/);

  const shellSource = fs.readFileSync(chatShellPagePath, "utf8");
  assert.match(shellSource, /readChatSessionViewportSnapshot/);
  assert.match(shellSource, /rememberChatSessionViewportSnapshot/);
  assert.match(shellSource, /function resolvePersistedViewportAnchorMessageId\(sessionKey: string\): string/);
  assert.match(shellSource, /function captureShellViewportSnapshot\(\): boolean/);
  assert.match(shellSource, /function startShellViewportSnapshotInterval\(\): void/);
  assert.match(shellSource, /rect\.top >= threadRect\.top/);
  assert.match(shellSource, /anchor: viewportAnchorMessageId \|\| null/);
});

test("conversation pane batches scroll virtualization work and caches timeline layout rows", () => {
  const source = fs.readFileSync(conversationPanePath, "utf8");
  assert.match(source, /let timelineViewportSyncFrame: number \| null = null;/);
  assert.match(source, /function scheduleTimelineViewportSync/);
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(source, /pendingTimelineViewportMetrics/);
  assert.match(source, /const timelineLayoutRows = computed<TimelineItemLayoutRow\[\]>/);
  assert.match(source, /const timelineVirtualOffsetIndex = computed/);
  assert.match(source, /buildChatTimelineVirtualOffsetIndex\(timelineLayoutRows\.value/);
  assert.match(source, /const TIMELINE_VIRTUALIZE_MIN_ITEMS = 96;/);
  assert.match(source, /const TIMELINE_ITEM_GAP = 18;/);
  assert.match(source, /const TIMELINE_VIRTUALIZE_OVERSCAN_VIEWPORTS = 2\.75;/);
  assert.match(source, /const TIMELINE_VIRTUALIZE_OVERSCAN_MIN_PX = 1400;/);
  assert.match(source, /const TIMELINE_VIRTUALIZE_OVERSCAN_MAX_PX = 3200;/);
  assert.match(source, /function resolveTimelineVirtualOverscanPx\(clientHeight: number\): number \{/);
  assert.match(source, /resolveChatTimelineVirtualWindow\(\{/);
  assert.match(source, /overscanPx: resolveTimelineVirtualOverscanPx\(timelineViewport\.value\.clientHeight\),/);
  assert.match(source, /const renderedTimelineRows = computed<RenderedTimelineRow\[\]>/);
  assert.match(source, /v-for="row in renderedTimelineRows"/);
  assert.match(source, /function timelineVirtualSpacerHeight\(position: 'before' \| 'after'\): number \{/);
  assert.match(source, /class="chat-conversation-thread__virtual-spacer"/);
  assert.doesNotMatch(source, /class="chat-conversation-thread__item-placeholder"/);
  assert.doesNotMatch(source, /TIMELINE_VIRTUALIZE_OVERSCAN_PX/);
  assert.match(source, /function pruneTimelineMeasurementCache\(\): void \{/);
  assert.match(source, /const activeItemIds = new Set\(props\.timelineItems\.map\(\(item\) => item\.id\)\);/);
  assert.match(source, /delete timelineItemHeights\[itemId\];/);
  assert.match(source, /unobserveTimelineItemShell\(itemId\);/);
  assert.match(source, /\(\) => props\.timelineItems\.map\(\(item\) => item\.id\)/);
  assert.match(source, /scheduleTimelineViewportSync\(metrics\)/);
  assert.match(source, /window\.cancelAnimationFrame\(timelineViewportSyncFrame\)/);
});

test("conversation pane keeps desktop chat content and composer on an IM-width column", () => {
  const source = fs.readFileSync(conversationPaneCssPath, "utf8");
  const componentSource = fs.readFileSync(conversationPanePath, "utf8");
  const composerSource = fs.readFileSync(composerBarPath, "utf8");
  assert.match(componentSource, /<ComposerBar[\s\S]*ref="composerBarRef"[\s\S]*:key="selectedSession\?\.key \|\| 'no-session'"/);
  assert.match(componentSource, /const composerBarRef = ref<ComposerBarPublicInstance \| null>\(null\);/);
  assert.match(componentSource, /function requestDesktopComposerAutofocus\(\): void/);
  assert.match(componentSource, /props\.selectedSession\?\.permissions\.canSend[\s\S]*!props\.composerDisabled[\s\S]*!isCompactViewport\.value/);
  assert.match(componentSource, /watch\(\n\s+\(\) => props\.composerDisabled,/);
  assert.match(composerSource, /function focusEditor\(options: ComposerFocusOptions = \{\}\): boolean/);
  assert.match(composerSource, /defineExpose\(\{\n\s+focusEditor,/);
  assert.match(composerSource, /class="chat-composer-send"[\s\S]*@mousedown\.prevent[\s\S]*@click="handleSendClick"/);
  assert.match(source, /\.chat-conversation-groups \{\n\s+width: min\(100%, 1160px\);/);
  assert.match(source, /\.chat-conversation-groups \{[\s\S]*align-self: center;/);
  assert.match(source, /\.chat-conversation-thread__item-shell \{[\s\S]*contain: layout;/);
  assert.match(source, /\.chat-conversation-thread__virtual-spacer \{[\s\S]*contain: strict;/);
  assert.match(source, /\.chat-conversation-pane__composer \{[\s\S]*justify-items: center;/);
  assert.match(source, /\.chat-conversation-pane__composer > \.chat-queue-rail,/);
  assert.match(source, /\.chat-conversation-pane__composer > \.chat-composer-shell \{\n\s+width: min\(100%, 1160px\);/);
});

test("conversation pane surfaces unread count while browsing history", () => {
  const source = fs.readFileSync(conversationPanePath, "utf8");
  const cssSource = fs.readFileSync(conversationPaneCssPath, "utf8");
  assert.match(source, /const pendingUnreadDisplayCount = computed/);
  assert.match(source, /const jumpToBottomLabel = computed/);
  assert.match(source, /function unreadTailSignatureForItem\(item: ChatRenderableItem \| null \| undefined\)/);
  assert.match(source, /tailSignature: unreadTailSignatureForItem\(props\.timelineItems\[props\.timelineItems\.length - 1\]\)/);
  assert.match(source, /条新消息 · 返回最新/);
  assert.match(source, /new · Return to latest/);
  assert.match(source, /:aria-label="jumpToBottomLabel"/);
  assert.match(source, /<span v-if="viewingHistoricalPosition" class="chat-conversation-thread__jump-text">\{\{ jumpToBottomLabel \}\}<\/span>/);
  assert.match(cssSource, /\.chat-conversation-thread__jump-text \{[\s\S]*white-space: nowrap;/);
});

test("chat shell preserves composer drafts per session", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  const composerSource = fs.readFileSync(
    path.join(rootDir, "apps/web-vue/src/features/chat/ComposerBar.vue"),
    "utf8",
  );
  const conversationSource = fs.readFileSync(conversationPanePath, "utf8");
  assert.match(source, /const composerDraftsBySession = new Map<string, ChatComposerSessionDraft>\(\);/);
  assert.match(source, /function rememberComposerDraftNow/);
  assert.match(source, /buildPersistableComposerDraft/);
  assert.match(source, /readChatComposerDraft\(sessionKey\)/);
  assert.match(source, /watch\(\[composerDocument, composerAttachments\]/);
  assert.match(source, /watch\(\[composerDocument, composerAttachments\], \(\) => \{\n\s+scheduleComposerDraftSave\(\);\n\}\);/);
  assert.doesNotMatch(source, /watch\(\[composerDocument, composerAttachments\][\s\S]*deep:\s*true/);
  assert.match(source, /flushComposerDraftSave\(previousKey\)/);
  assert.match(source, /restoreComposerDraftForSession\(sessionKey\)/);
  assert.match(composerSource, /function handleComposerLifecycleExit\(\): void/);
  assert.match(composerSource, /window\.addEventListener\('pagehide', handleComposerLifecycleExit\)/);
  assert.match(composerSource, /window\.addEventListener\('beforeunload', handleComposerLifecycleExit\)/);
  assert.match(composerSource, /sessionKey: props\.sessionKey/);
  assert.match(composerSource, /emit\('draft-lifecycle-exit', \{/);
  assert.match(conversationSource, /:session-key="selectedSession\?\.key \|\| ''"/);
  assert.match(conversationSource, /@draft-lifecycle-exit="\$emit\('composer-draft-flush', \$event\)"/);
  assert.match(source, /function handleComposerDocumentUpdate\(payload: ComposerDocumentUpdatePayload\): void/);
  assert.match(source, /function persistComposerDraftLifecycleSnapshot\(payload: ComposerDraftLifecycleExitPayload\): void/);
  assert.match(source, /@composer-draft-flush="flushComposerDraftSave\(\$event\)"/);
  assert.match(source, /window\.addEventListener\('pagehide', handleComposerDraftLifecycleExit\)/);
  assert.match(source, /window\.addEventListener\('beforeunload', handleComposerDraftLifecycleExit\)/);
  assert.match(composerSource, /if \(isComposing\.value \|\| event\.isComposing\) \{/);
});

test("chat shell reads and uploads selected composer files through a bounded concurrent queue", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  const apiSource = fs.readFileSync(chatApiPath, "utf8");
  const composerSource = fs.readFileSync(
    path.join(rootDir, "apps/web-vue/src/features/chat/ComposerBar.vue"),
    "utf8",
  );
  assert.match(source, /type PendingComposerUpload = \{/);
  assert.match(source, /function hasComposerAttachment\(attachmentId: string\): boolean/);
  assert.match(source, /function persistComposerDraftSnapshot\(/);
  assert.match(source, /function patchComposerAttachmentForSession\(/);
  assert.match(source, /function hasComposerAttachmentForSession\(sessionKey: string, attachmentId: string\): boolean/);
  assert.match(source, /const composerUploadSourceFiles = new Map<string, File>\(\);/);
  assert.match(source, /type PreparedComposerUpload = \{\n\s+id: string;\n\s+fileName: string;\n\s+mimeType: string;\n\s+file\?: File;/);
  assert.match(source, /function shouldReadComposerPreview\(kind: ChatAttachmentKind, mimeType: string\): boolean/);
  assert.match(source, /async function prepareComposerUploadPayload\(pendingUpload: PendingComposerUpload\)/);
  assert.match(source, /return \{[\s\S]*file: pendingUpload\.file,[\s\S]*dataUrl,[\s\S]*\};/);
  assert.match(source, /return \{[\s\S]*file: pendingUpload\.file,[\s\S]*dataUrl: '',[\s\S]*\};/);
  assert.match(source, /async function prepareAndUploadComposerAttachment/);
  assert.match(source, /content: prepared\.content \|\| ''/);
  assert.match(source, /file: prepared\.file/);
  assert.match(source, /dataUrl: prepared\.dataUrl \|\| attachment\.dataUrl/);
  assert.doesNotMatch(source, /readFileAsBase64/);
  assert.match(source, /composerUploadSourceFiles\.set\(pendingUpload\.id, pendingUpload\.file\);/);
  assert.match(source, /composerUploadSourceFiles\.delete\(prepared\.id\);/);
  assert.match(source, /const sourceFile = composerUploadSourceFiles\.get\(attachmentId\);/);
  assert.match(source, /catch \(uploadError\) \{\n\s+if \(!hasComposerAttachmentForSession\(sessionKey, prepared\.id\)\) \{/);
  assert.match(source, /catch \(uploadError\) \{\n\s+if \(!hasComposerAttachmentForSession\(sessionKey, pendingUpload\.id\)\) \{/);
  assert.match(source, /patchComposerAttachmentForSession\(sessionKey, prepared\.id/);
  assert.match(source, /patchComposerAttachmentForSession\(sessionKey, pendingUpload\.id/);
  assert.match(source, /if \(selectedSessionKey\.value === sessionKey\) \{\n\s+setNotice\(/);
  assert.match(source, /composerAttachments\.value = \[\n\s+\.\.\.composerAttachments\.value,\n\s+\.\.\.pendingUploads\.map/);
  assert.match(source, /runLimitedComposerUploadQueue\(\n\s+pendingUploads,\n\s+COMPOSER_UPLOAD_CONCURRENCY,/);
  assert.match(source, /\(pendingUpload\) => prepareAndUploadComposerAttachment\(sessionKey, pendingUpload\)/);
  assert.match(composerSource, /attachment\.type === 'image' && attachment\.dataUrl/);
  assert.match(composerSource, /attachment\.type === 'video' && attachment\.dataUrl/);
  assert.match(composerSource, /const textValue = event\.clipboardData\?\.getData\('text\/plain'\) \|\| '';/);
  assert.match(composerSource, /if \(clipboardFiles\.length \|\| textValue\) \{\n\s+event\.preventDefault\(\);/);
  assert.match(composerSource, /if \(textValue\) \{\n\s+insertPlainTextAtSelection\(textValue\);/);
  assert.match(composerSource, /if \(clipboardFiles\.length\) \{\n\s+emit\('select-files', clipboardFiles\);/);
  assert.match(apiSource, /function buildChatUploadFormData\(payload: ChatFileUploadBrowserRequest\): FormData/);
  assert.match(apiSource, /form\.append\('file', payload\.file, payload\.fileName\);/);
  assert.match(apiSource, /if \(payload\.file\) \{[\s\S]*body: buildChatUploadFormData\(payload\)/);
  assert.match(apiSource, /if \(payload\.file\) \{\n\s+xhr\.send\(buildChatUploadFormData\(payload\)\);/);
  assert.match(apiSource, /xhr\.setRequestHeader\('Content-Type', 'application\/json'\);/);
});

test("chat shell keeps selected history session rows hydrated after lightweight list refreshes", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  assert.match(source, /function deriveHistoryBackedSessionRow\(session: ChatSessionRow, messages: ChatMessageItem\[\]\): ChatSessionRow/);
  assert.match(source, /lastMessagePreview: deriveRuntimeMessagePreview\(lastMessage, nextSession\.lastMessagePreview\)/);
  assert.match(source, /function enrichIncomingSessionRowFromProtectedCurrent\(row: ChatSessionRow, current: ChatSessionRow \| null\): ChatSessionRow/);
  assert.match(source, /enrichIncomingSessionRowFromProtectedCurrent\(/);
  assert.match(source, /protectSessionRow\(nextSession\.key\)/);
});

test("chat shell clears stale conversation content immediately when switching sessions", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  assert.match(source, /function primeConversationForImmediateSessionSwitch\(sessionKey: string\): void/);
  assert.match(source, /primeConversationStateFromSnapshot\(sessionKey\)/);
  assert.match(source, /primeEmptyConversationShell\(targetSession, targetSession\.runtime\)/);
  assert.match(source, /runtimeMachineState\.value = resetChatSessionRuntimeMachine\(sessionKey\)/);
  assert.match(source, /primeConversationForImmediateSessionSwitch\(sessionKey\)/);
});

test("chat shell keeps active sends queued through stale runtime windows", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  assert.match(source, /const locallyActiveRunIdBySession = new Map<string, string>\(\);/);
  assert.match(source, /function markSessionRunLocallyActive/);
  assert.match(source, /function clearSessionRunLocallyActive/);
  assert.match(source, /hasSessionRunLocallyActive\(sessionKey\)/);
  assert.match(source, /directSendPendingRunId = requestId;/);
  assert.match(source, /markSessionRunLocallyActive\(sessionKey, directSendPendingRunId\)/);
  assert.match(source, /const ackActiveRunId = ack\.runtime\.activeRunId \|\| \(ack\.status === 'duplicate_completed' \? null : ack\.runId\);/);
  assert.match(source, /clearSessionRunLocallyActive\(sessionKeyForRollback, directSendPendingRunId\)/);
});

test("chat shell clears per-session local caches when deleting chats", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  assert.match(source, /function clearComposerDraftForSession\(sessionKey: string \| null \| undefined\): void/);
  assert.match(source, /function clearLocalSessionCaches\(sessionKey: string \| null \| undefined\): void/);
  assert.match(source, /clearComposerDraftForSession\(normalizedSessionKey\);/);
  assert.match(source, /clearLastStreamSeqForSession\(normalizedSessionKey\);/);
  assert.match(source, /clearChatRuntimeSnapshot\(normalizedSessionKey\);/);
  assert.match(source, /rememberChatSessionViewportSnapshot\(normalizedSessionKey, null\);/);
  assert.match(source, /function repairLastSessionPointerAfterDelete\(sessionKeys: string\[\]\): void/);
  assert.match(source, /const rememberedSessionKey = readLastChatSessionKey\(\);/);
  assert.match(source, /rememberLastChatSessionKey\(nextSessionKey \|\| null\);/);
  assert.match(source, /rememberLastChatAgentId\(nextSessionKey \? deriveAgentIdFromChatSessionKey\(nextSessionKey\) : null\);/);
  assert.match(source, /for \(const sessionKey of deleted\) \{\n\s+clearLocalSessionCaches\(sessionKey\);/);
  assert.match(source, /repairLastSessionPointerAfterDelete\(sessionKeys\);/);
  assert.match(source, /if \(sessionRows\.value\.some\(\(row\) => row\.key === previousKey\)\) \{\n\s+flushComposerDraftSave\(previousKey\);/);
  assert.match(source, /else \{\n\s+clearComposerDraftForSession\(previousKey\);/);
});

test("chat realtime recovery schedules one bounded history sync after reconnect", () => {
  const state = createChatRealtimeRecoveryState();

  assert.equal(shouldScheduleChatRealtimeRecoverySync(state, {
    sessionKey: "session-a",
    nowMs: 10_000,
    minIntervalMs: 1500,
  }), false);

  markChatRealtimeDisconnected(state, "session-a");
  assert.equal(shouldScheduleChatRealtimeRecoverySync(state, {
    sessionKey: "session-a",
    nowMs: 10_000,
    minIntervalMs: 1500,
  }), true);

  assert.equal(shouldScheduleChatRealtimeRecoverySync(state, {
    sessionKey: "session-a",
    nowMs: 10_500,
    minIntervalMs: 1500,
  }), false);

  markChatRealtimeDisconnected(state, "session-a");
  assert.deepEqual(resolveChatRealtimeRecoverySyncDecision(state, {
    sessionKey: "session-a",
    nowMs: 10_900,
    minIntervalMs: 1500,
  }), {
    shouldSync: false,
    retryAfterMs: 600,
  });

  assert.equal(shouldScheduleChatRealtimeRecoverySync(state, {
    sessionKey: "session-a",
    nowMs: 11_600,
    minIntervalMs: 1500,
  }), true);

  clearChatRealtimeRecoveryState(state, "session-a");
  assert.equal(shouldScheduleChatRealtimeRecoverySync(state, {
    sessionKey: "session-a",
    nowMs: 13_500,
    minIntervalMs: 1500,
  }), false);
});

test("chat stream replay assigns bounded per-session sequence windows", () => {
  const state = createChatStreamReplayState();
  const baseEvent: import("../../types/chat").ChatStreamEvent = {
    kind: "runtime",
    sessionKey: "session-a",
    runId: null,
    emittedAt: "2026-06-01T08:00:00.000Z",
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
  };

  const first = rememberChatStreamEvent(state, "session-a", baseEvent, 2);
  const second = rememberChatStreamEvent(state, "session-a", {
    ...baseEvent,
    emittedAt: "2026-06-01T08:00:01.000Z",
  }, 2);
  const third = rememberChatStreamEvent(state, "session-a", {
    ...baseEvent,
    emittedAt: "2026-06-01T08:00:02.000Z",
  }, 2);

  assert.equal(first.streamSeq, 1);
  assert.equal(second.streamSeq, 2);
  assert.equal(third.streamSeq, 3);
  assert.deepEqual(
    listChatStreamEventsAfter(state, "session-a", 1).map((event) => event.streamSeq),
    [2, 3],
  );
  assert.deepEqual(
    listChatStreamEventsAfter(state, "session-a", 2).map((event) => event.streamSeq),
    [3],
  );
  assert.deepEqual(listChatStreamEventsAfter(state, "session-a", null), []);
  assert.equal(normalizeChatStreamSeq("3.9"), 3);

  clearChatStreamReplaySession(state, "session-a");
  assert.deepEqual(listChatStreamEventsAfter(state, "session-a", 0), []);
  const fourth = rememberChatStreamEvent(state, "session-a", {
    ...baseEvent,
    emittedAt: "2026-06-01T08:00:03.000Z",
  }, 2);
  assert.equal(fourth.streamSeq, 4);

  clearChatStreamReplaySession(state, "session-a", { resetSequence: true });
  const recreated = rememberChatStreamEvent(state, "session-a", {
    ...baseEvent,
    emittedAt: "2026-06-01T08:00:04.000Z",
  }, 2);
  assert.equal(recreated.streamSeq, 1);
});

test("chat stream cursor storage restores only fresh reconnect cursors", () => {
  const previousWindow = (globalThis as unknown as { window?: unknown }).window;
  const storage = new Map<string, string>();
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  };

  try {
    rememberChatLastStreamSeq("session-a", 42.9, 1_000);
    assert.equal(readChatLastStreamSeq("session-a", 1_500), 42);
    assert.equal(readChatLastStreamSeq("session-a", 11 * 60 * 1000), null);

    rememberChatLastStreamSeq("session-a", 7, 2_000);
    clearChatLastStreamSeq("session-a");
    assert.equal(readChatLastStreamSeq("session-a", 2_500), null);

    rememberChatLastStreamSeq("session-a", -1, 3_000);
    assert.equal(readChatLastStreamSeq("session-a", 3_500), null);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window?: unknown }).window = previousWindow;
    }
  }
});

test("chat composer draft storage clears corrupt or non-persistable values", () => {
  const previousWindow = (globalThis as unknown as { window?: unknown }).window;
  const storage = new Map<string, string>();
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  };

  try {
    const key = "tracevane.chat.composer-draft:session-a";
    storage.set(key, "{broken-json");
    assert.equal(readChatComposerDraft("session-a"), null);
    assert.equal(storage.has(key), false);

    storage.set(key, JSON.stringify({
      version: 1,
      updatedAt: "2026-06-01T08:00:00.000Z",
      document: [{ type: "resource-ref", id: "r1", attachmentId: "missing", display: "inline-chip" }],
      attachments: [],
    }));
    assert.equal(readChatComposerDraft("session-a"), null);
    assert.equal(storage.has(key), false);

    const validDraft: ChatComposerPersistedDraft = {
      version: 1,
      updatedAt: "2026-06-01T08:00:00.000Z",
      document: [{ type: "text", id: "t1", text: "hello draft" }],
      attachments: [],
    };
    rememberChatComposerDraft("session-a", validDraft);
    assert.equal(readChatComposerDraft("session-a")?.document[0]?.type, "text");
    assert.equal(storage.has(key), true);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window?: unknown }).window = previousWindow;
    }
  }
});

test("chat session viewport storage restores only fresh anchored snapshots", () => {
  const previousWindow = (globalThis as unknown as { window?: unknown }).window;
  const storage = new Map<string, string>();
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  };

  try {
    rememberChatSessionViewportSnapshot("session-a", {
      anchorItemId: "item-1",
      anchorMessageId: "message-1",
      anchorOffset: -42.8,
      bottomDistance: 300.2,
      timelineItemCount: 24,
      timelineVersion: "v1",
      capturedAtMs: 1_000,
    });
    assert.deepEqual(readChatSessionViewportSnapshot("session-a", 1_500), {
      anchorItemId: "item-1",
      anchorMessageId: "message-1",
      anchorOffset: -43,
      bottomDistance: 300,
      timelineItemCount: 24,
      timelineVersion: "v1",
      capturedAtMs: 1000,
    });

    rememberChatSessionViewportSnapshot("session-a", {
      anchorItemId: "",
      anchorMessageId: "message-2",
      anchorOffset: 42,
      bottomDistance: 300,
      timelineItemCount: 24,
      timelineVersion: "v1",
      capturedAtMs: 1_000,
    });
    assert.equal(readChatSessionViewportSnapshot("session-a", 1_500), null);

    rememberChatSessionViewportSnapshot("session-a", {
      anchorItemId: "item-2",
      anchorMessageId: null,
      anchorOffset: 12,
      bottomDistance: null,
      timelineItemCount: 12,
      timelineVersion: "v2",
      capturedAtMs: 2_000,
    });
    assert.equal(readChatSessionViewportSnapshot("session-a", 33 * 60 * 1000), null);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window?: unknown }).window = previousWindow;
    }
  }
});

test("chat shell wires realtime reconnects into recovery history sync", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  assert.match(source, /const realtimeRecoveryState = createChatRealtimeRecoveryState\(\);/);
  assert.match(source, /let realtimeRecoveryRetryTimer: number \| null = null;/);
  assert.match(source, /let realtimeRecoveryRetrySessionKey = '';/);
  assert.match(source, /function markRealtimeDisconnectedForRecovery/);
  assert.match(source, /function clearRealtimeRecoveryRetryTimer\(sessionKey: string \| null \| undefined = null\): void/);
  assert.match(source, /function scheduleRealtimeRecoveryHistorySync/);
  assert.match(source, /const decision = resolveChatRealtimeRecoverySyncDecision\(realtimeRecoveryState,/);
  assert.match(source, /if \(decision\.shouldSync\) \{[\s\S]*scheduleLiveHistorySync\(sessionKey, CHAT_REALTIME_RECOVERY_SYNC_DELAY_MS\);/);
  assert.match(source, /if \(decision\.retryAfterMs == null \|\| typeof window === 'undefined'\) \{/);
  assert.match(source, /realtimeRecoveryRetryTimer = window\.setTimeout\(\(\) => \{[\s\S]*scheduleRealtimeRecoveryHistorySync\(retrySessionKey\);/);
  assert.match(source, /source\.onopen = \(\) => \{[\s\S]*scheduleRealtimeRecoveryHistorySync\(sessionKey\);/);
  assert.match(source, /source\.onerror = \(\) => \{[\s\S]*markRealtimeDisconnectedForRecovery\(sessionKey\);/);
  assert.match(source, /onHello: \(\) => \{[\s\S]*scheduleRealtimeRecoveryHistorySync\(targetSessionKey\);/);
  assert.match(source, /onClose: \(\) => \{[\s\S]*markRealtimeDisconnectedForRecovery\(gatewayChatSessionKey \|\| selectedSessionKey\.value\);/);
  assert.match(source, /socket\.onopen = \(\) => \{[\s\S]*scheduleRealtimeRecoveryHistorySync\(sessionKey\);/);
  assert.match(source, /socket\.onclose = \(\) => \{[\s\S]*markRealtimeDisconnectedForRecovery\(sessionKey\);[\s\S]*scheduleWsReconnect\(sessionKey\);/);
});

test("chat shell resumes realtime streams from the last seen stream sequence", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  const apiSource = fs.readFileSync(
    path.join(rootDir, "apps/web-vue/src/features/chat/api.ts"),
    "utf8",
  );
  assert.match(source, /const lastStreamSeqBySession = new Map<string, number>\(\);/);
  assert.match(source, /const lastStreamSeqLoadedFromStorageBySession = new Set<string>\(\);/);
  assert.match(source, /function rememberStreamSeq\(event: ChatStreamEvent\)/);
  assert.match(source, /rememberStreamSeq\(event\);/);
  assert.match(source, /readChatLastStreamSeq\(normalizedSessionKey\)/);
  assert.match(source, /rememberChatLastStreamSeq\(sessionKey, streamSeq\)/);
  assert.match(source, /clearLastStreamSeqForSession\(currentSession\.key\)/);
  assert.match(source, /lastStreamSeq: lastStreamSeqForSession\(sessionKey\)/);
  assert.match(source, /lastStreamSeqForSession\(sessionKey\)/);
  assert.match(source, /lastStreamSeq=\$\{encodeURIComponent\(String\(lastStreamSeq\)\)\}/);
  assert.match(apiSource, /lastStreamSeq\?: number \| null;/);
  assert.match(apiSource, /url\.searchParams\.set\('lastStreamSeq'/);
});

test("chat shell parses composer send state from normalized document", () => {
  const source = fs.readFileSync(chatShellPagePath, "utf8");
  assert.doesNotMatch(source, /extractComposerPlainText|hasComposerDocumentContent/);
  assert.match(source, /function normalizedComposerDocumentHasContent/);
  assert.match(source, /function readNormalizedSlashCommandText/);
  assert.match(source, /return normalizedComposerDocumentHasContent\(documentValue\) \|\| attachments\.length > 0;/);

  const hasContentStart = source.indexOf("function normalizedComposerDocumentHasContent");
  assert.notEqual(hasContentStart, -1);
  const hasContentEnd = source.indexOf("function readNormalizedSlashCommandText", hasContentStart);
  assert.notEqual(hasContentEnd, -1);
  const hasContentSource = source.slice(hasContentStart, hasContentEnd);
  assert.match(hasContentSource, /for \(const node of documentValue\)/);
  assert.match(hasContentSource, /node\.type === 'resource-ref'/);
  assert.match(hasContentSource, /firstComposerNonWhitespaceIndex\(node\.text \|\| ''\)/);
  assert.doesNotMatch(hasContentSource, /normalizeComposerDocument|\.trim\(\)/);

  const slashTextStart = source.indexOf("function readNormalizedSlashCommandText");
  assert.notEqual(slashTextStart, -1);
  const slashTextEnd = source.indexOf("function cloneComposerAttachment", slashTextStart);
  assert.notEqual(slashTextEnd, -1);
  const slashTextSource = source.slice(slashTextStart, slashTextEnd);
  assert.match(slashTextSource, /for \(const node of documentValue\)/);
  assert.match(slashTextSource, /if \(node\.type === 'resource-ref'\) \{\n\s+return '';/);
  assert.match(slashTextSource, /if \(textValue\[contentIndex\] !== '\/'\) \{\n\s+return '';/);
  assert.match(slashTextSource, /slashTextParts\.join\(''\)\.trimEnd\(\)/);
  assert.doesNotMatch(slashTextSource, /extractComposerPlainText|normalizeComposerDocument/);

  const sendStart = source.indexOf("async function sendMessage");
  assert.notEqual(sendStart, -1);
  const sendEnd = source.indexOf("async function patchQueuedMessage", sendStart);
  assert.notEqual(sendEnd, -1);
  const sendSource = source.slice(sendStart, sendEnd);
  assert.match(sendSource, /const documentValue = normalizeComposerDocument\(documentOverride \|\| composerDocument\.value\);/);
  assert.match(sendSource, /if \(!normalizedComposerDocumentHasContent\(documentValue\) && attachments\.length === 0\)/);
  assert.match(sendSource, /const slashCommandText = readNormalizedSlashCommandText\(documentValue\);/);
  assert.match(sendSource, /normalizedDocument: true,/);
  assert.doesNotMatch(sendSource, /normalizeComposerDocument\(documentValue\)|extractComposerPlainText|hasResourceRefs|hasComposerDocumentContent/);
});

test("composer bar batches live draft sync to the shell", () => {
  const source = fs.readFileSync(composerBarPath, "utf8");
  assert.match(source, /let pendingParentDocumentSyncFrame: number \| null = null;/);
  assert.match(source, /const recentlyEmittedDocumentSignatures: string\[\] = \[\];/);
  assert.match(source, /function scheduleParentDocumentSync/);
  assert.match(source, /function rememberEmittedNormalizedDocumentSignature/);
  assert.match(source, /function normalizedComposerDocumentsEqual/);
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(source, /scheduleParentDocumentSync\(documentValue\)/);
  assert.match(source, /editorHasFocus\(\) && hasLocalContent\.value && normalizedComposerDocumentHasContent\(normalized\)/);
  assert.match(source, /flushPendingParentDocumentSync\(\);/);
  assert.doesNotMatch(source, /function documentSignature/);

  const documentEqualityStart = source.indexOf("function normalizedComposerDocumentsEqual");
  assert.notEqual(documentEqualityStart, -1);
  const documentEqualityEnd = source.indexOf("function rememberEmittedNormalizedDocumentSignature", documentEqualityStart);
  assert.notEqual(documentEqualityEnd, -1);
  const documentEqualitySource = source.slice(documentEqualityStart, documentEqualityEnd);
  assert.match(documentEqualitySource, /left\.length !== right\.length/);
  assert.match(documentEqualitySource, /for \(let index = 0; index < left\.length; index \+= 1\)/);
  assert.match(documentEqualitySource, /leftNode\.text !== rightNode\.text/);
  assert.match(documentEqualitySource, /leftNode\.attachmentId !== rightNode\.attachmentId/);
  assert.match(documentEqualitySource, /leftNode\.display !== rightNode\.display/);
  assert.doesNotMatch(documentEqualitySource, /\.map\(|\.join\(/);

  const scheduleSyncStart = source.indexOf("function scheduleParentDocumentSync");
  assert.notEqual(scheduleSyncStart, -1);
  const scheduleSyncEnd = source.indexOf("function snapshotDocumentFromEditorDom", scheduleSyncStart);
  assert.notEqual(scheduleSyncEnd, -1);
  const scheduleSyncSource = source.slice(scheduleSyncStart, scheduleSyncEnd);
  assert.match(scheduleSyncSource, /pendingParentDocumentSync = documentValue;/);
  assert.match(scheduleSyncSource, /emitNormalizedDocumentUpdate\(documentValue\);/);
  assert.doesNotMatch(scheduleSyncSource, /normalizeComposerDocument/);

  const sendStart = source.indexOf("function handleSendClick");
  assert.notEqual(sendStart, -1);
  const sendEnd = source.indexOf("function scheduleEditorSelectionRestore", sendStart);
  assert.notEqual(sendEnd, -1);
  const sendSource = source.slice(sendStart, sendEnd);
  assert.match(sendSource, /const documentValue = snapshotDocumentFromEditorDom\(\);/);
  assert.match(sendSource, /emitNormalizedDocumentUpdate\(documentValue\);/);
  assert.match(sendSource, /emit\('send', documentValue\);/);
  assert.doesNotMatch(sendSource, /normalizeComposerDocument/);

  const documentWatchStart = source.indexOf("watch(\n  () => props.document");
  assert.notEqual(documentWatchStart, -1);
  const documentWatchEnd = source.indexOf("watch(\n  () => props.disabled", documentWatchStart);
  assert.notEqual(documentWatchEnd, -1);
  const documentWatchSource = source.slice(documentWatchStart, documentWatchEnd);
  assert.match(documentWatchSource, /const normalized = normalizeComposerDocument\(value, \{ editorSurface: true \}\);/);
  assert.match(documentWatchSource, /normalizedComposerDocumentsEqual\(normalized, localDocument\.value\)/);
  assert.doesNotMatch(documentWatchSource, /documentSignature\(|normalizedDocumentSignature\(|normalizeComposerDocument\(normalized|normalizeComposerDocument\(localDocument\.value/);
});

test("composer bar keeps high-frequency input derivation bounded", () => {
  const source = fs.readFileSync(composerBarPath, "utf8");
  const deriveCountsStart = source.indexOf("function deriveAttachmentReferenceCountsFromNormalized");
  assert.notEqual(deriveCountsStart, -1);
  const deriveCountsEnd = source.indexOf("function updateEditorDerivedStateFromNormalized", deriveCountsStart);
  assert.notEqual(deriveCountsEnd, -1);
  const deriveCountsSource = source.slice(deriveCountsStart, deriveCountsEnd);
  assert.match(deriveCountsSource, /for \(const node of document\)/);
  assert.doesNotMatch(deriveCountsSource, /normalizeComposerDocument/);

  const hasContentStart = source.indexOf("function normalizedComposerDocumentHasContent");
  assert.notEqual(hasContentStart, -1);
  const hasContentEnd = source.indexOf("function normalizedComposerDocumentHasEditorValue", hasContentStart);
  assert.notEqual(hasContentEnd, -1);
  const hasContentSource = source.slice(hasContentStart, hasContentEnd);
  assert.match(hasContentSource, /for \(const node of document\)/);
  assert.match(hasContentSource, /firstNonWhitespaceIndex\(node\.text \|\| ''\)/);
  assert.doesNotMatch(hasContentSource, /normalizeComposerDocument|\.trim\(\)/);

  const updateDerivedStart = source.indexOf("function updateEditorDerivedStateFromNormalized");
  assert.notEqual(updateDerivedStart, -1);
  const updateDerivedEnd = source.indexOf("function updateEditorVisualStateFromDom", updateDerivedStart);
  assert.notEqual(updateDerivedEnd, -1);
  const updateDerivedSource = source.slice(updateDerivedStart, updateDerivedEnd);
  assert.match(updateDerivedSource, /hasLocalContent\.value = normalizedComposerDocumentHasContent\(document\);/);
  assert.match(updateDerivedSource, /isEditorEmpty\.value = !normalizedComposerDocumentHasEditorValue\(document\);/);
  assert.match(updateDerivedSource, /deriveAttachmentReferenceCountsFromNormalized\(document\)/);
  assert.doesNotMatch(updateDerivedSource, /normalizeComposerDocument|hasComposerDocumentContent|\.trim\(\)/);
});

test("composer bar short-circuits ordinary drafts before slash-menu text extraction", () => {
  const source = fs.readFileSync(composerBarPath, "utf8");
  const slashTextStart = source.indexOf("function readSlashMenuPlainText");
  assert.notEqual(slashTextStart, -1);
  const slashTextEnd = source.indexOf("function filteredSlashArgOptionDetails", slashTextStart);
  assert.notEqual(slashTextEnd, -1);
  const slashTextSource = source.slice(slashTextStart, slashTextEnd);
  assert.match(slashTextSource, /for \(const node of document\)/);
  assert.match(slashTextSource, /if \(node\.type === 'resource-ref'\) \{\n\s+return null;/);
  assert.match(slashTextSource, /if \(textValue\[contentIndex\] !== '\/'\) \{\n\s+return '';/);
  assert.match(slashTextSource, /slashTextParts\.join\(''\)\.trimEnd\(\)/);
  assert.doesNotMatch(slashTextSource, /extractComposerPlainText/);

  const updateSlashStart = source.indexOf("function updateSlashMenu");
  assert.notEqual(updateSlashStart, -1);
  const updateSlashEnd = source.indexOf("function replaceComposerWithPlainText", updateSlashStart);
  assert.notEqual(updateSlashEnd, -1);
  const updateSlashSource = source.slice(updateSlashStart, updateSlashEnd);
  assert.match(updateSlashSource, /const plainText = readSlashMenuPlainText\(documentValue\);/);
  assert.doesNotMatch(updateSlashSource, /extractComposerPlainText|documentSupportsSlashMenu|normalizeComposerDocument/);
});
