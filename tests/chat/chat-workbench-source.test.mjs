import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.cwd(), 'apps/web/src/features/chat/ChatWorkbenchPage.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const sharedSource = fs.readFileSync(path.join(process.cwd(), 'apps/web/src/features/chat/_shared.ts'), 'utf8');
const progressTimelineSource = fs.readFileSync(path.join(process.cwd(), 'lib/agent-progress-timeline.ts'), 'utf8');

test('shared Agent progress timeline follows the Feishu progress-card pattern', () => {
  assert.match(progressTimelineSource, /Shared Agent progress timeline/);
  assert.match(progressTimelineSource, /Feishu progress-card model/);
  assert.match(progressTimelineSource, /AGENT_PROGRESS_TIMELINE_DEFAULT_LIMIT/);
  assert.match(progressTimelineSource, /AGENT_PROGRESS_ENTRY_LIMIT_MAX/);
  assert.match(progressTimelineSource, /normalizeAgentProgressEntryLimit/);
  assert.match(progressTimelineSource, /trimAgentProgressEntries/);
  assert.match(progressTimelineSource, /createAgentProgressFingerprint/);
  assert.match(progressTimelineSource, /export type AgentProgressTimelineItem/);
  assert.match(progressTimelineSource, /upsertAgentProgressAssistant/);
  assert.match(progressTimelineSource, /upsertAgentProgressTool/);
  assert.match(progressTimelineSource, /upsertAgentProgressThinking/);
  assert.match(progressTimelineSource, /upsertAgentProgressPermission/);
  assert.match(progressTimelineSource, /appendAgentProgressSideResult/);
  assert.match(progressTimelineSource, /mergeAgentProgressOverlay/);
});

test('ChatWorkbenchPage reports send success so the composer can preserve failed drafts', () => {
  assert.match(source, /const handleSend = React\.useCallback\(async \(payload: ChatSendRequest\): Promise<boolean>/);
  assert.match(source, /await sendMutation\.mutateAsync/);
  assert.match(source, /return true/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /toast\.error\("发送失败"/);
  assert.match(source, /return false/);
});


test('ChatWorkbenchPage accepts legacy sessionRef deep links without exposing raw encoded keys', () => {
  assert.match(source, /function decodeSessionRef\(value: string \| null\): string \| null/);
  assert.match(source, /raw\?\.startsWith\("r1_"\)/);
  assert.match(source, /window\.atob\(padded\)/);
  assert.match(source, /new TextDecoder\(\)\.decode\(bytes\)/);
  assert.match(source, /searchParams\.get\("session"\) \?\? decodeSessionRef\(searchParams\.get\("sessionRef"\)\)/);
});

test('ChatWorkbenchPage surfaces IM delivery source detail in the conversation header', () => {
  assert.match(sharedSource, /export function sessionSourceDetail/);
  assert.match(sharedSource, /deliveryContext/);
  assert.match(sharedSource, /`账号 \$\{delivery\.accountId\}`/);
  assert.match(sharedSource, /`目标 \$\{delivery\.to\}`/);
  assert.match(sharedSource, /`线程 \$\{delivery\.threadId\}`/);
  assert.match(source, /sessionSourceDetail/);
  assert.match(source, /const selectedSourceDetail = selectedSession/);
  assert.match(source, /title=\{selectedSourceDetail\}/);
});

test('ChatWorkbenchPage passes backend diagnostics into the session runtime picker', () => {
  assert.match(source, new RegExp('const diagnostics =[\\s\\S]*history\\?\\.diagnostics \\?\\? bootstrap\\.data\\?\\.diagnostics \\?\\? null'));
  assert.match(source, /<SessionListView/);
  assert.match(source, /diagnostics=\{diagnostics\}/);
});

test('ChatWorkbenchPage passes backend file capability into the conversation composer', () => {
  assert.match(source, /fileCapability=\{diagnostics\?\.fileCapability \?\? null\}/);
});


test('ChatWorkbenchPage settles immediate native CLI acknowledgements without waiting for a legacy final event', () => {
  assert.match(source, /function isTerminalRuntimeState\(state: string \| null \| undefined\): boolean/);
  assert.match(source, /case "ack": \{/);
  assert.match(source, /case "runtime":/);
  assert.match(source, /case "runtime\.state": \{/);
  assert.match(source, /isTerminalRuntimeState\(event\.runtime\.state\)/);
  assert.match(source, /isTerminalRuntimeState\(ack\.runtime\.state\)/);
  assert.match(source, /ack\.status === "duplicate_completed" \|\| isTerminalRuntimeState\(ack\.runtime\.state\)/);
  assert.match(source, /toast\.error\("Agent 运行失败"/);
});

test('ChatWorkbenchPage reconnects to active runs discovered from bootstrap runtime', () => {
  assert.match(source, /function isActiveRuntimeState\(state: string \| null \| undefined\): boolean/);
  assert.match(source, /function mergeLiveTurnFromOverlay/);
  assert.match(source, /mergeAgentProgressOverlay/);
  assert.match(source, /return state === "running" \|\| state === "streaming"/);
  assert.match(source, /const selectedActiveRunId = runtime\?\.activeRunId \?\? null/);
  assert.match(source, /const selectedRuntimeActive = Boolean\(/);
  assert.match(source, /selectedActiveRunId && isActiveRuntimeState\(runtime\?\.state\)/);
  assert.match(source, /const selectedActiveOverlay = React\.useMemo/);
  assert.match(source, /overlays\.find\(\(overlay\) => overlay\.runId === selectedActiveRunId\)/);
  assert.match(source, /if \(selectedRuntimeActive && selectedActiveRunId\)/);
  assert.match(source, /activeRunIdRef\.current = selectedActiveRunId/);
  assert.match(source, /setStreamEnabled\(true\)/);
  assert.match(source, /selectedActiveOverlay[\s\S]*mergeLiveTurnFromOverlay\(null, selectedActiveOverlay, false\)/);
  assert.match(source, /runId: selectedActiveRunId/);
  assert.match(source, /if \(!selectedActiveRunId\)/);
  assert.match(source, /setStreamEnabled\(false\)/);
  assert.match(source, /selectedRuntimeActive \|\|/);
});

test('ChatWorkbenchPage consumes run overlays as live assistant/tool fallback', () => {
  assert.match(source, /case "run_overlay": \{/);
  assert.match(source, /mergeLiveTurnFromOverlay\(prev, event\.overlay, event\.terminal\)/);
  assert.match(source, /mergeAgentProgressText\(base\.text, overlay\.previewText \|\| ""\)/);
  assert.match(source, /mergeToolCardsFromOverlay\(base\.toolCards, overlay\.toolCalls\)/);
  assert.match(source, /overlay\.lifecycle === "aborted"/);
  assert.match(source, /overlay\.lifecycle === "error" \? "Agent 运行失败" : null/);
  assert.match(source, /if \(event\.terminal\)/);
  assert.match(source, /refetchSelected\(\)/);
});

test('ChatWorkbenchPage routes native permission events into live turns and resolve mutations', () => {
  assert.match(source, /useResolveChatPermissionMutation/);
  assert.match(source, /case "agent_permission"/);
  assert.match(source, /base\.permissions\.findIndex/);
  assert.match(source, /handleResolvePermission/);
  assert.match(source, /payload: \{ decision \}/);
  assert.match(source, /onResolvePermission=\{handleResolvePermission\}/);
  assert.match(source, /resolvingPermission=\{resolvePermissionMutation\.isPending\}/);
});


test('ChatWorkbenchPage keeps side-result events in the live turn instead of losing process replies', () => {
  assert.match(source, /sideResults: \[\]/);
  assert.match(source, /case "side_result"/);
  assert.match(source, /\.\.\.base\.sideResults, event\.result/);
  assert.match(source, /slice\(-5\)/);
  assert.match(source, /appendAgentProgressSideResult\(base\.timeline, event\.result\)/);
});


test('ChatWorkbenchPage keeps live reasoning/process stream blocks in the transient turn', () => {
  assert.match(source, /processBlocks: \[\]/);
  assert.match(source, /case "agent_process"/);
  assert.match(source, /base\.processBlocks\.findIndex/);
  assert.match(source, /\.\.\.base\.processBlocks, event\.block/);
  assert.match(source, /slice\(-8\)/);
  assert.match(source, /upsertAgentProgressThinking\(base\.timeline, event\.block\)/);
});


test('ChatWorkbenchPage accumulates native assistant deltas instead of replacing the live reply', () => {
  assert.match(source, /case "agent_assistant"/);
  assert.match(source, /event\.deltaText/);
  assert.match(source, /`\$\{base\.text\}\$\{event\.deltaText\}`/);
  assert.match(source, /mergeAgentProgressText\(base\.text, incoming\)/);
  assert.match(source, /upsertAgentProgressAssistant\(base\.timeline, nextText\)/);
});


test('ConversationView collapses completed tools and aggregates process blocks for readable streams', () => {
  const conversationSource = fs.readFileSync(path.join(process.cwd(), 'apps/web/src/features/chat/views/ConversationView.tsx'), 'utf8');
  assert.match(conversationSource, /function shouldCollapseToolByDefault/);
  assert.match(conversationSource, /collapsed=\{shouldCollapseToolByDefault\(tool\)\}/);
  assert.match(conversationSource, /<ToolCallBlock key=\{tool\.toolCallId\} tool=\{tool\} collapsed \/>/);
  assert.match(conversationSource, /function ProcessBlockGroup/);
  assert.match(conversationSource, /过程流/);
  assert.match(conversationSource, /const latest = blocks\[blocks\.length - 1\]/);
  assert.match(conversationSource, /查看较早过程/);
  assert.match(conversationSource, /<ProcessBlockGroup blocks=\{processBlocks\} \/>/);
});


test('ConversationView opens a slash command palette from the composer draft', () => {
  const conversationSource = fs.readFileSync(path.join(process.cwd(), 'apps/web/src/features/chat/views/ConversationView.tsx'), 'utf8');
  assert.match(conversationSource, /interface SlashCommandSuggestion/);
  assert.match(conversationSource, /const BASE_SLASH_COMMANDS/);
  assert.match(conversationSource, /function slashCommandPrefix/);
  assert.match(conversationSource, /function slashCommandSuggestions/);
  assert.match(conversationSource, /chat-composer-slash-palette/);
  assert.match(conversationSource, /chat-composer-slash-option/);
  assert.match(conversationSource, /Slash 命令/);
  assert.match(conversationSource, /ArrowDown/);
  assert.match(conversationSource, /applySlashSuggestion/);
  assert.match(conversationSource, /输入消息… 输入 \/ 查看命令/);
  assert.match(source, /runtimeTarget=\{runtimeTarget\}/);
});
