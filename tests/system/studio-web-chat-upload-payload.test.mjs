import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);

test('uploaded composer attachments send through fileRefs without duplicate inline base64 payloads', () => {
  assert.match(chatShellPage, /content:\s*''/);
  assert.match(
    chatShellPage,
    /const inlineImageAttachments = attachments\.filter\(\(attachment\) => \([\s\S]*attachment\.type === 'image'[\s\S]*&& !attachment\.relativePath[\s\S]*&& Boolean\(attachment\.content\)[\s\S]*\)\);/,
  );
  assert.match(chatShellPage, /if \(inlineImageAttachments\.length\) \{/);
  assert.match(chatShellPage, /sendPayload\.attachments = inlineImageAttachments\.map/);
});
