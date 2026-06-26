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
  assert.match(source, /const resourceRef = `files:\$\{rootId\}:\$\{filePath\}`/);
  assert.match(source, /resourceRef,/);
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
  assert.match(source, /`files:\$\{rootId\}:\$\{filePath\}`/);
  assert.doesNotMatch(source, /`workspace:\$\{filePath\}`/);
  assert.match(source, /source: isProjectRoot \? "workspace" : "files"/);
  assert.match(source, /Files 根引用/);
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
  assert.match(source, /function resolveComposerFilesRef/);
  assert.match(source, /canReadPreviewAttachment/);
  assert.match(source, /limit: 192 \* 1024/);
  assert.match(source, /文件预览加载失败/);
  assert.match(source, /已按 Files API 预览上限截断/);
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
