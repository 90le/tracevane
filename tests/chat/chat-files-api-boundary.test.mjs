import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const chatApi = fs.readFileSync(new URL("../../apps/web/src/lib/api/chat.ts", import.meta.url), "utf-8");
const chatView = fs.readFileSync(new URL("../../apps/web/src/features/chat/views/ConversationView.tsx", import.meta.url), "utf-8");
const chatRoutes = fs.readFileSync(new URL("../../apps/api/modules/chat/routes.ts", import.meta.url), "utf-8");
const chatService = fs.readFileSync(new URL("../../apps/api/modules/chat/service.ts", import.meta.url), "utf-8");
const chatAcceptanceSources = fs.readdirSync(new URL(".", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".acceptance.py"))
  .map((entry) => fs.readFileSync(new URL(entry.name, new URL(".", import.meta.url)), "utf-8"))
  .join("\n--- acceptance boundary ---\n");

test("chat composer uploads use the shared Files API contract", () => {
  assert.match(chatApi, /export async function uploadChatFile\b/);
  assert.match(chatApi, /getFilesSummary\(signal\)/);
  assert.match(chatApi, /function selectChatUploadRoot/);
  assert.match(chatApi, /item\.id === "project-root"/);
  assert.match(chatApi, /initFileUpload\(/);
  assert.match(chatApi, /uploadFileChunk\(/);
  assert.match(chatApi, /completeFileUpload\(/);
  assert.match(chatApi, /\/api\/files\/download\?/);
  assert.match(chatApi, /files:\$\{rootId\}:\$\{normalizePortablePath\(relativePath\)\}/);
  assert.match(chatApi, /rootId: root\.id/);
  assert.doesNotMatch(chatApi, /new FormData\(/);
  assert.doesNotMatch(chatApi, /sessions\/\$\{encodeSessionKey\(sessionKey\)\}\/upload/);
});

test("chat Files-root picker keeps directory selection on Files browse roots", () => {
  assert.match(chatView, /useFilesSummaryQuery\(/);
  assert.match(chatView, /useFilesBrowseQuery\(/);
  assert.match(chatView, /files:\$\{rootId\}:\$\{filePath\}/);
  assert.match(chatView, /const nextPath = entry\.path \|\| joinPortablePath/);
  assert.match(chatView, /rootId: item\.rootId/);
  assert.doesNotMatch(chatView, /workspace:\$\{filePath\}/);
  assert.match(chatView, /buildFilesDownloadUrl\(rootId, filePath, false\)/);
  assert.match(chatView, /@ 文件 \/ 工作区/);
  assert.match(chatView, /chat-composer-preview-dialog/);
});


test("chat backend no longer exposes a legacy upload owner", () => {
  assert.doesNotMatch(chatRoutes, /\/api\/chat\/sessions\/:sessionKey\/upload/);
  assert.doesNotMatch(chatRoutes, /\/api\/chat\/sessions\/:sessionKey\/resources\/resolve/);
  assert.doesNotMatch(chatRoutes, /parseMultipartChatFileUpload/);
  assert.doesNotMatch(chatService, /uploadFileBytesImpl/);
  assert.doesNotMatch(chatService, /uploadFileBytes\(/);
  assert.doesNotMatch(chatService, /uploadFile\(sessionKey/);
  assert.doesNotMatch(chatService, /resolveResourceRefs\(/);
});

test("chat acceptance upload smokes do not mock the removed Chat upload route", () => {
  assert.doesNotMatch(chatAcceptanceSources, /api\/chat\/sessions\/\.\*\/upload/);
  assert.doesNotMatch(chatAcceptanceSources, /sessions\/.*\/upload/);
  assert.doesNotMatch(chatAcceptanceSources, /uploads:/);
  assert.doesNotMatch(chatAcceptanceSources, /api\/chat\/sessions\/.*\/resources/);
  assert.match(chatAcceptanceSources, /install_files_upload_routes/);
  assert.match(chatAcceptanceSources, /files:project-root:/);
});


test("chat upload transport passes abort signals through Files preflight and chunk uploads", () => {
  assert.match(chatApi, /uploadChatFile\(\s*sessionKey: string,\s*file: File,\s*signal\?: AbortSignal/s);
  assert.match(chatApi, /const summary = await getFilesSummary\(signal\)/);
  assert.match(chatApi, /initFileUpload\(\{[\s\S]*?\}, signal\)/);
  assert.match(chatApi, /uploadFileChunk\(init\.uploadId, index, file\.slice\(start, end\), undefined, signal\)/);
  assert.match(chatApi, /completeFileUpload\(\{ uploadId: init\.uploadId \}, signal\)/);
});


test("chat docs describe Files API attachment boundary", () => {
  const chatContract = fs.readFileSync(new URL("../../docs/聊天契约.md", import.meta.url), "utf-8");
  assert.match(chatContract, /Files API `\/api\/files\/summary`/);
  assert.match(chatContract, /`\/api\/files\/browse`/);
  assert.match(chatContract, /`\/api\/files\/read`/);
  assert.match(chatContract, /`\/api\/files\/uploads\/\*`/);
  assert.match(chatContract, /`\/api\/files\/download`/);
  assert.match(chatContract, /files:<rootId>:<path>/);
  assert.match(chatContract, /Chat 不再拥有独立上传 API/);
  assert.doesNotMatch(chatContract, /POST \/api\/chat\/sessions\/:sessionKey\/upload` \| 上传用户文件/);
  assert.doesNotMatch(chatContract, /multipart `\/upload`/);
});
