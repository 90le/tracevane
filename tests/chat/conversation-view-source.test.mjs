import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.cwd(), 'apps/web/src/features/chat/views/ConversationView.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

test('ConversationView exposes a Files-root picker backed by the Files API', () => {
  assert.match(source, /useFilesSummaryQuery/);
  assert.match(source, /useFilesBrowseQuery/);
  assert.match(source, /defaultFilesRootId/);
  assert.match(source, /@ 文件 \/ 工作区/);
  assert.match(source, /attachFilesRootFile/);
  assert.match(source, /const resourceRef = buildTracevaneFilesResourceRef\(rootId, filePath\)/);
  assert.match(source, /resourceRef,/);
});


test('ConversationView consumes backend Chat file capability for user-facing file contracts', () => {
  assert.match(source, /fileCapability\?: ChatFileCapability \| null/);
  assert.match(source, /const FALLBACK_CHAT_FILE_CAPABILITY: ChatFileCapability/);
  assert.match(source, /const effectiveFileCapability = fileCapability \?\? FALLBACK_CHAT_FILE_CAPABILITY/);
  assert.match(source, /effectiveFileCapability\.browseEndpoint/);
  assert.match(source, /effectiveFileCapability\.uploadEndpoint/);
  assert.match(source, /effectiveFileCapability\.readEndpoint/);
  assert.match(source, /effectiveFileCapability\.resourceRef/);
});


test('ConversationView keeps composer file refs structured and removable across upload states', () => {
  assert.match(source, /type ComposerFileRefItem = ChatSendFileRef &/);
  assert.match(source, /status: "uploading" \| "ready" \| "failed"/);
  assert.match(source, /source: "upload" \| "workspace" \| "files"/);
  assert.match(source, /previewUrl\?: string \| null/);
  assert.match(source, /downloadUrl\?: string \| null/);
  assert.match(source, /readyFileRefs/);
  assert.match(source, /hasPendingFileRefs/);
  assert.match(source, /hasFailedFileRefs/);
  assert.match(source, /chat-composer-pool-item chat-composer-attachment/);
  assert.match(source, /chat-composer-preview-dialog/);
  assert.match(source, /data-composer-attachment-preview-key/);
  assert.match(source, /chat-composer-attachment-remove/);
  assert.match(source, /chat-composer-file-input/);
  assert.match(source, /chat-composer-send/);
  assert.match(source, /cancelledUploadIdsRef/);
  assert.match(source, /结构化 fileRef/);
});

test('ConversationView persists text and ready Files attachments per selected session', () => {
  assert.match(source, /const COMPOSER_DRAFT_PREFIX = "tracevane\.chat\.composer-draft:"/);
  assert.match(source, /function composerDraftStorageKey/);
  assert.match(source, /function parsePersistedComposerDraft/);
  assert.match(source, /function buildPersistedComposerDraft/);
  assert.match(source, /filter\(\(item\) => item\.status === "ready"\)/);
  assert.match(source, /window\.localStorage\.setItem\(key, JSON\.stringify\(persisted\)\)/);
  assert.match(source, /window\.localStorage\.removeItem\(composerDraftStorageKey\(sessionKey\)\)/);
});

test('ConversationView clears composer only after send is accepted', () => {
  assert.match(source, /onSend: \(payload: ChatSendRequest\) => Promise<boolean>/);
  assert.match(source, /const accepted = await onSend/);
  assert.match(source, /if \(!accepted\) return/);
  assert.match(source, /onClick=\{\(\) => void submit\(\)\}/);
  assert.match(source, /void submit\(\)/);
});


test('ConversationView uses Files roots explicitly and sends Files-root refs safely', () => {
  assert.match(source, /const filesRoots = filesSummary\.data\?\.roots \?\? \[\]/);
  assert.match(source, /filePickerRootId/);
  assert.match(source, /effectiveFilePickerRootId/);
  assert.match(source, /aria-label="选择文件根"/);
  assert.match(source, /buildTracevaneFilesResourceRef\(rootId, filePath\)/);
  assert.doesNotMatch(source, /`workspace:\$\{filePath\}`/);
  assert.match(source, /source: isProjectRoot \? "workspace" : "files"/);
  assert.match(source, /effectiveFileCapability\.resourceRef/);
});


test('ConversationView keeps current Chat surface selectors for acceptance smoke coverage', () => {
  assert.match(source, /chat-conversation-pane/);
  assert.match(source, /chat-conversation-thread/);
  assert.match(source, /chat-composer-pool-insert/);
  assert.match(source, /aria-label=\{`引用 \$\{file\.fileName\}`\}/);
});


test('ConversationView aborts in-flight Files uploads when removed or switching sessions', () => {
  assert.match(source, /onUploadFile: \(file: File, signal\?: AbortSignal\) => Promise<ChatFileUploadResponse>/);
  assert.match(source, /uploadControllersRef = React\.useRef\(new Map<string, AbortController>\(\)\)/);
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /onUploadFile\(file, controller\.signal\)/);
  assert.match(source, /uploadControllersRef\.current\.get\(file\.id\)\?\.abort\(\)/);
  assert.match(source, /for \(const controller of uploadControllersRef\.current\.values\(\)\)/);
});


test('ConversationView handles mixed text and file paste through Files uploads', () => {
  assert.match(source, /const handleComposerPaste = \(event: React\.ClipboardEvent<HTMLTextAreaElement>\) => \{/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /clipboard\.getData\("text\/plain"\)/);
  assert.match(source, /void uploadFiles\(pastedFiles\)/);
  assert.match(source, /onPaste=\{handleComposerPaste\}/);
});


test('ConversationView previews text-like attachments through Files read API', () => {
  assert.match(source, /useFileReadQuery/);
  assert.match(source, /function parseFilesResourceRef/);
  assert.match(source, /parseTracevaneFilesResourceRef\(value\)/);
  assert.match(source, /function resolveComposerFilesRef/);
  assert.match(source, /function composerFileRefFromMessageResource/);
  assert.match(source, /parseFilesResourceRef\(resource\.resourceRef \|\| resource\.originalPath\)/);
  assert.match(source, /canReadPreviewAttachment/);
  assert.match(source, /limit: 192 \* 1024/);
  assert.match(source, /文件预览加载失败/);
  assert.match(source, /已按 \$\{effectiveFileCapability\.readEndpoint\} 预览上限截断/);
});

test('ConversationView previews historical message resources through the shared Files preview dialog', () => {
  assert.match(source, /onPreviewResource\?: \(resource: ChatResourceItem\) => void/);
  assert.match(source, /onPreview=\{onPreviewResource\}/);
  assert.match(source, /onPreviewResource=\{onPreviewResource\}/);
  assert.match(source, /onPreviewResource=\{\(resource\) => setPreviewFile\(composerFileRefFromMessageResource\(resource\)\)\}/);
  assert.match(source, /previewUrl: resource\.url/);
  assert.match(source, /downloadUrl: resource\.downloadUrl/);
});

test('ConversationView renders structured message blocks through shared Chat display model', () => {
  assert.match(source, /deriveChatDisplayMessage/);
  assert.match(source, /type ChatDisplayBlock/);
  assert.match(source, /type ChatDisplayParagraphSegment/);
  assert.match(source, /function DisplayBlockView/);
  assert.match(source, /function InlineDisplaySegment/);
  assert.match(source, /block\.runs\.map/);
  assert.match(source, /display\.blocks\.map/);
  assert.match(source, /display=\{segment\.display\}/);
  assert.doesNotMatch(source, /const resources = message\.resources \?\? \[\]/);
});


test('ConversationView paginates Files directory picker through browse API', () => {
  assert.match(source, /const \[filePickerPage, setFilePickerPage\] = React\.useState\(1\)/);
  assert.match(source, /page: filePickerPage/);
  assert.match(source, /pageSize: 80/);
  assert.match(source, /filesBrowse\.data\?\.pagination/);
  assert.match(source, /pagination\.totalPages > 1/);
  assert.match(source, /上一页/);
  assert.match(source, /下一页/);
  assert.match(source, /setFilePickerPage\(1\)/);
});

test('ConversationView renders pending native tool approvals as actionable live cards', () => {
  assert.match(source, /function PermissionRequestBlock/);
  assert.match(source, /工具审批 · \{permission\.toolName\}/);
  assert.match(source, /permission\.status === "pending"/);
  assert.match(source, /onResolve\(permission, "allow"\)/);
  assert.match(source, /onResolve\(permission, "deny"\)/);
  assert.match(source, /turn\.permissions\.map/);
});


test('ConversationView renders assistant markdown and tool stream cards with designed affordances', () => {
  assert.match(source, /function ChatMarkdownContent/);
  assert.match(source, /remarkGfm/);
  assert.match(source, /DOMPurify\.sanitize/);
  assert.match(source, /hljs\.highlightElement/);
  assert.match(source, /dangerouslySetInnerHTML/);
  assert.match(source, /import "\.\/chat-message-markdown\.css"/);
  assert.doesNotMatch(source, /workspace\/preview\/markdown-preview\.css/);
  assert.doesNotMatch(source, /md-preview__article/);
  assert.match(source, /<ChatMarkdownContent source=\{block\.markdownSource\} \/>/);
  assert.match(source, /<ChatMarkdownContent source=\{turn\.text\} streaming=\{!turn\.done\} \/>/);
  assert.match(source, /function ToolPreviewBlock/);
  assert.match(source, /function isJsonPreview/);
  assert.match(source, /render\?: "code" \| "markdown"/);
  assert.match(source, /<ChatMarkdownContent source=\{value\} \/>/);
  assert.match(source, /function ToolArtifactsBlock/);
  assert.match(source, /工具产物 · \{artifacts\.length\}/);
  assert.match(source, /prettyPreview/);
  assert.match(source, /工具正在执行，结果会流式更新/);
  assert.match(source, /label="输入参数"/);
  assert.match(source, /label=\{tool\.isError \? "错误输出" : "执行结果"\}/);
});

test('ConversationView renders process and side-result blocks as readable chat workbench elements', () => {
  assert.match(source, /function ProcessBlockView/);
  assert.match(source, /推理摘要/);
  assert.match(source, /<ChatMarkdownContent source=\{block\.text\} \/>/);
  assert.match(source, /function SideResultBlock/);
  assert.match(source, /旁路回复 · \{result\.question\}/);
  assert.match(source, /<ChatMarkdownContent source=\{result\.text\} \/>/);
  assert.match(source, /turn\.processBlocks\.map/);
  assert.match(source, /turn\.sideResults\.map/);
});
