import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatShellPage.vue'),
  'utf8',
);
const chatComposerModel = fs.readFileSync(
  path.join(rootDir, 'lib/chat-composer.ts'),
  'utf8',
);
const chatApi = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/api.ts'),
  'utf8',
);
const chatRoutes = fs.readFileSync(
  path.join(rootDir, 'apps/api/modules/chat/routes.ts'),
  'utf8',
);
const chatService = fs.readFileSync(
  path.join(rootDir, 'apps/api/modules/chat/service.ts'),
  'utf8',
);

test('uploaded composer attachments send through fileRefs without duplicate inline base64 payloads', () => {
  assert.match(chatShellPage, /buildComposerSendPlan/);
  assert.match(
    chatComposerModel,
    /attachment\.type === 'image'[\s\S]*&& !attachment\.relativePath[\s\S]*&& typeof attachment\.content === 'string'/,
  );
  assert.match(chatShellPage, /const sendPayload = sendPlan\.payload/);
  assert.doesNotMatch(chatShellPage, /sendPayload\.attachments = inlineImageAttachments\.map/);
});

test('successful upload retry clears stale upload error once no failed attachments remain', () => {
  assert.match(chatShellPage, /async function uploadPreparedComposerAttachment\(/);
  assert.match(
    chatShellPage,
    /noticeMessage\.value\?\.kind === 'error'[\s\S]*!composerAttachments\.value\.some\(\(attachment\) => attachment\.uploadState === 'failed'\)[\s\S]*clearNotice\(\);/,
  );
});

test('composer upload sends binary files with multipart while preserving JSON base64 compatibility', () => {
  assert.match(chatShellPage, /file: pendingUpload\.file/);
  assert.match(chatShellPage, /content: prepared\.content \|\| ''/);
  assert.doesNotMatch(chatShellPage, /readFileAsBase64/);
  assert.match(chatApi, /function buildChatUploadFormData\(payload: ChatFileUploadBrowserRequest\): FormData/);
  assert.match(chatApi, /form\.append\('file', payload\.file, payload\.fileName\);/);
  assert.match(chatApi, /if \(payload\.file\) \{[\s\S]*xhr\.send\(buildChatUploadFormData\(payload\)\);/);
  assert.match(chatApi, /xhr\.setRequestHeader\('Content-Type', 'application\/json'\);/);
  assert.match(chatRoutes, /isMultipartFormData\(req\)/);
  assert.match(chatRoutes, /parseMultipartChatFileUpload\(req\)/);
  assert.match(chatRoutes, /routeCtx\.services\.chat\.uploadFileBytes\(params\.sessionKey, payload\)/);
  assert.match(chatService, /async uploadFile\(sessionKey: string, payload: ChatFileUploadRequest\)/);
  assert.match(chatService, /Buffer\.from\(payload\.content\.replace/);
  assert.match(chatService, /async uploadFileBytes\(sessionKey: string, payload: \{ fileName: string; content: Buffer; mimeType\?: string \}\)/);
});
