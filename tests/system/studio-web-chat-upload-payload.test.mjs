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

test('uploaded composer attachments send through fileRefs without duplicate inline base64 payloads', () => {
  assert.match(chatShellPage, /buildComposerSendPlan/);
  assert.match(
    chatComposerModel,
    /attachment\.type === 'image'[\s\S]*&& !attachment\.relativePath[\s\S]*&& typeof attachment\.content === 'string'/,
  );
  assert.match(chatShellPage, /const sendPayload = sendPlan\.payload/);
  assert.doesNotMatch(chatShellPage, /sendPayload\.attachments = inlineImageAttachments\.map/);
});
