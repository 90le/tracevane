import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const chatApi = fs.readFileSync(new URL("../../apps/web/src/lib/api/chat.ts", import.meta.url), "utf-8");
const chatView = fs.readFileSync(new URL("../../apps/web/src/features/chat/views/ConversationView.tsx", import.meta.url), "utf-8");
const chatRoutes = fs.readFileSync(new URL("../../apps/api/modules/chat/routes.ts", import.meta.url), "utf-8");
const chatService = fs.readFileSync(new URL("../../apps/api/modules/chat/service.ts", import.meta.url), "utf-8");

test("chat composer uploads use the shared Files API contract", () => {
  assert.match(chatApi, /export async function uploadChatFile\b/);
  assert.match(chatApi, /getFilesSummary\(\)/);
  assert.match(chatApi, /initFileUpload\(/);
  assert.match(chatApi, /uploadFileChunk\(/);
  assert.match(chatApi, /completeFileUpload\(/);
  assert.match(chatApi, /\/api\/files\/download\?/);
  assert.match(chatApi, /files:\$\{rootId\}:\$\{normalizePortablePath\(relativePath\)\}/);
  assert.doesNotMatch(chatApi, /new FormData\(/);
  assert.doesNotMatch(chatApi, /sessions\/\$\{encodeSessionKey\(sessionKey\)\}\/upload/);
});

test("chat workspace picker keeps directory selection on Files browse roots", () => {
  assert.match(chatView, /useFilesSummaryQuery\(/);
  assert.match(chatView, /useFilesBrowseQuery\(/);
  assert.match(chatView, /files:\$\{rootId\}:\$\{filePath\}/);
  assert.match(chatView, /workspace:\$\{filePath\}/);
});


test("chat backend no longer exposes a legacy upload owner", () => {
  assert.doesNotMatch(chatRoutes, /\/api\/chat\/sessions\/:sessionKey\/upload/);
  assert.doesNotMatch(chatRoutes, /parseMultipartChatFileUpload/);
  assert.doesNotMatch(chatService, /uploadFileBytesImpl/);
  assert.doesNotMatch(chatService, /uploadFileBytes\(/);
  assert.doesNotMatch(chatService, /uploadFile\(sessionKey/);
});
