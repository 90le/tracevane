import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('apps/web/src/features/chat/views/SessionListView.tsx', 'utf-8');

test('SessionListView treats managed sessions as manageable using typed permission flags', () => {
  const canManageBody = source.match(/function canManage\(session: ChatSessionRow\): boolean \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(canManageBody, /session\.kind === "tracevane_managed"/);
  assert.match(canManageBody, /permissions\?\.canSend === true/);
  assert.match(canManageBody, /permissions\?\.canDelete === true/);
  assert.doesNotMatch(canManageBody, /session\.permissions\?\.writable === true\s*\)\s*;/);
});

test('SessionListView separates all sessions from the unfiled folder scope', () => {
  assert.match(source, /if \(folderFilter === "all"\) return true;/);
  assert.match(source, /if \(folderFilter === "unfiled"\) return !assigned;/);
  assert.match(source, />全部会话</);
  assert.match(source, />未分组</);
});

test('SessionListView exposes runtime target editing for managed sessions', () => {
  assert.match(source, /kind: "edit-runtime"; session: ChatSessionRow/);
  assert.match(source, /编辑运行目标…/);
  assert.match(source, /保存运行目标/);
  assert.match(source, /runtimeTarget: \{/);
});

test('SessionListView defaults new sessions to native CLI Codex instead of OpenClaw webchat', () => {
  assert.match(source, /const DEFAULT_RUNTIME_ADAPTER_KIND: ChatRuntimeAdapterKind = "native-cli"/);
  assert.match(source, /const DEFAULT_RUNTIME_AGENT: ChatRuntimeAgentId = "codex"/);
  assert.match(source, /FALLBACK_NATIVE_CHAT_RUNTIME_AGENT_OPTIONS/);
  assert.match(source, /CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA/);
  assert.match(source, /const metadata = CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA\[agent\]/);
  assert.match(source, /const OPENCLAW_RUNTIME_FALLBACK_OPTION: ChatRuntimeAgentOption = \{/);
  assert.match(source, /setRuntimeAdapterKind\(DEFAULT_RUNTIME_ADAPTER_KIND\)/);
  assert.match(source, /setRuntimeAgent\(DEFAULT_RUNTIME_AGENT\)/);
});


test('SessionListView derives runtime choices from backend Chat diagnostics before local fallback', () => {
  assert.match(source, /diagnostics\?: ChatDiagnostics \| null/);
  assert.match(source, /const backendRuntimeCapabilities = diagnostics\?\.runtimeCapabilities \?\? \[\]/);
  assert.match(source, /status === "runnable"/);
  assert.match(source, /runtimeCapabilityOption/);
  assert.match(source, /backendNativeRuntimeOptions\.length \? backendNativeRuntimeOptions : FALLBACK_NATIVE_CHAT_RUNTIME_AGENT_OPTIONS/);
  assert.match(source, /pending\.length \? pending : FALLBACK_PENDING_NATIVE_CHAT_RUNTIME_AGENT_OPTIONS/);
});

test('SessionListView builds OpenClaw runtime target choices from platform agent summary', () => {
  assert.match(source, /useAgentsSummaryQuery\(\{ staleTime: 30_000, retry: false \}\)/);
  assert.match(source, /const chatRuntimeAgentOptions = React\.useMemo<ChatRuntimeAgentOption\[\]>/);
  assert.match(source, /agentsSummary\.data\?\.agents/);
  assert.match(source, /adapterKind: "openclaw-gateway" as const/);
  assert.match(source, /agent: agent\.id/);
  assert.match(source, /label: `\$\{agent\.name \|\| agent\.id\} 平台 Agent`/);
  assert.match(source, /OpenClaw 原生 Agent/);
  assert.match(source, /OPENCLAW_RUNTIME_FALLBACK_OPTION/);
  assert.match(source, /chatRuntimeAgentOptions\.find/);
  assert.match(source, /chatRuntimeAgentOptions\.map\(\(option\) =>/);
});

test('SessionListView surfaces CLI binary readiness in runtime target choices', () => {
  assert.match(source, /useTerminalStatusQuery\(\{ staleTime: 30_000, retry: false \}\)/);
  assert.match(source, /function nativeRuntimeAgentOption/);
  assert.match(source, /binaryId: metadata\.binaryId as TerminalBinaryStatus\["id"\]/);
  assert.match(source, /label: metadata\.label/);
  assert.match(source, /description: metadata\.description/);
  assert.match(source, /模型列表加载失败，将使用模型网关默认路由/);
});


test('SessionListView takes runnable native CLI display metadata from the shared connector contract', () => {
  assert.match(source, /CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA/);
  assert.match(source, /const metadata = CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA\[agent\]/);
  assert.doesNotMatch(source, /NATIVE_RUNTIME_AGENT_OPTION_DETAILS/);
  assert.doesNotMatch(source, /NativeRuntimeAgentOptionDetail/);
});

test('SessionListView discloses registered but unwired CLI agents without making them selectable', () => {
  const pendingTypeBody = source.match(/type PendingNativeRuntimeAgentOption = \{([\s\S]*?)\n\};/)?.[1] || '';
  assert.match(source, /CHANNEL_CONNECTOR_AGENT_IDS/);
  assert.match(source, /type PendingNativeRuntimeAgentOption/);
  assert.match(pendingTypeBody, /agent: string/);
  assert.doesNotMatch(pendingTypeBody, /ChatRuntimeAgentId/);
  assert.match(source, /const FALLBACK_PENDING_NATIVE_CHAT_RUNTIME_AGENT_OPTIONS/);
  assert.match(source, /status === \"registered_pending\"/);
  assert.doesNotMatch(source, /agent is PendingNativeRuntimeAgentOption\["agent"\]/);
  assert.match(source, /待接入 CLI Agent/);
  assert.equal((source.match(/待接入 CLI Agent/g) || []).length, 1);
  assert.match(source, /Chat 不会假装可运行/);
  assert.match(source, /尚未接入 Channel Connector 进程适配器/);
});


test('SessionListView scopes model selection by runtime model source', () => {
  assert.match(source, /modelSource: "gateway" \| "native" \| "platform"/);
  assert.match(source, /const usesGatewayModelCatalog = selectedRuntimeModelMode === "gateway"/);
  assert.match(source, /if \(!usesGatewayModelCatalog\) return \[\]/);
  assert.match(source, /runtimeModelPlaceholder/);
  assert.match(source, /该 Agent 使用自身 CLI 账号和模型名称/);
  assert.match(source, /平台 Agent 默认使用自身配置/);
  assert.match(source, /\{usesGatewayModelCatalog && runtimeModelOptions\.map/);
});

test('SessionListView keeps the current runtime model visible when gateway catalog changes', () => {
  assert.match(source, /type ChatRuntimeModelOption = \{/);
  assert.match(source, /const runtimeModelOptions = React\.useMemo<ChatRuntimeModelOption\[\]>/);
  assert.match(source, /selectableModels\.some\(\(model\) => model\.id === currentModel\)/);
  assert.match(source, /当前模型，未在列表中/);
  assert.match(source, /runtimeModelOptions\.map\(\(model\) => \(/);
});


test('SessionListView persists chat list filters and folder scope in URL params', () => {
  assert.match(source, /useSearchParams\(\)/);
  assert.match(source, /chatView/);
  assert.match(source, /chatFolder/);
  assert.match(source, /chatQ/);
  assert.match(source, /folderFilterToParam/);
  assert.match(source, /parseFolderFilterParam/);
  assert.match(source, /setSearchParams\(/);
});

test('SessionListView indexes and renders IM delivery source detail', () => {
  assert.match(source, /sessionSourceDetail/);
  assert.match(source, /sessionSourceDetail\(s\)/);
  assert.match(source, /const sourceDetail = sessionSourceDetail\(s\)/);
  assert.match(source, /\{agentLabel\} · \{sourceDetail \|\| source\}/);
});

test('SessionListView recovers stale folder URL params instead of stranding the rail', () => {
  assert.match(source, /folderFilter\.startsWith\("folder:"\)/);
  assert.match(source, /!folderOptions\.some\(\(folder\) => folder\.id === folderId\)/);
  assert.match(source, /setFolderFilter\("all"\)/);
});


test('SessionListView gates new and edited sessions on CLI runtime readiness', () => {
  assert.match(source, /type ChatRuntimeOptionReadiness = \{/);
  assert.match(source, /selectable: boolean/);
  assert.match(source, /disabled=\{!readiness\.selectable\}/);
  assert.match(source, /const active = option\.adapterKind === runtimeAdapterKind && option\.agent === runtimeAgent/);
  assert.match(source, /setRuntimeAdapterKind\(option\.adapterKind\)/);
  assert.match(source, /setRuntimeAgent\(option\.agent\)/);
  assert.match(source, /const ensureRuntimeSelectable = React\.useCallback/);
  assert.match(source, /当前 Agent 运行器不可用/);
  assert.match(source, /disabled=\{busy \|\| !selectedRuntimeReadiness\.selectable\}/);
});


test('SessionListView keeps stable Chat list selectors for browser acceptance helpers', () => {
  assert.match(source, /chat-shell-session-list/);
  assert.match(source, /chat-shell-session-row/);
  assert.match(source, /data-session-key=\{s\.key\}/);
  assert.match(source, /active bg-primary-soft/);
  assert.match(source, /chat-new-chat-trigger/);
  assert.match(source, /chat-agent-picker/);
  assert.match(source, /chat-agent-picker-option/);
});


test('SessionListView honors organizer folder and session ordering in the rail', () => {
  assert.match(source, /function orderSessionRowsByOrganizer/);
  assert.match(source, /function orderFolderOptionsByIds/);
  assert.match(source, /organizer\.folderOrder\?\.length/);
  assert.match(source, /organizer\.childFolderOrder\?\.\[folderId\]/);
  assert.match(source, /organizer\?\.rootSessionOrder/);
  assert.match(source, /organizer\?\.folderSessionOrder\?\.\[folderFilter\.slice\("folder:"\.length\)\]/);
});


test('SessionListView keys runtime picker selection by adapter and agent', () => {
  assert.match(source, /useState<ChatRuntimeAdapterKind>\(DEFAULT_RUNTIME_ADAPTER_KIND\)/);
  assert.match(source, /item\.adapterKind === runtimeAdapterKind && item\.agent === runtimeAgent/);
  assert.match(source, /const active = option\.adapterKind === runtimeAdapterKind && option\.agent === runtimeAgent/);
  assert.doesNotMatch(source, /const active = option\.agent === runtimeAgent/);
});

test('SessionListView offers Files-root work directory presets for CLI runtime targets', () => {
  assert.match(source, /useFilesSummaryQuery\(\{ staleTime: 30_000, retry: false \}\)/);
  assert.match(source, /const runtimeWorkDirPresets = React\.useMemo/);
  assert.match(source, /root\.absolutePath/);
  assert.match(source, /root\.labelZh \|\| root\.labelEn \|\| root\.id/);
  assert.match(source, /setRuntimeWorkDir\(root\.path\)/);
  assert.match(source, /默认 ·/);
});

test('SessionListView sends exactly one runtimeTarget permissionMode when creating sessions', () => {
  const start = source.indexOf('const runCreate = () => {');
  const end = source.indexOf('const runPatch = (', start);
  const runCreateBody = start >= 0 && end > start ? source.slice(start, end) : '';
  assert.match(runCreateBody, /runtimeTarget: \{/);
  assert.equal((runCreateBody.match(/permissionMode: runtimePermissionMode \|\| null/g) || []).length, 1);
  assert.match(runCreateBody, /adapterKind: option\.adapterKind/);
  assert.match(runCreateBody, /agent: option\.agent/);
});
