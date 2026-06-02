import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const httpSource = fs.readFileSync(path.join(rootDir, "apps/api/core/http.ts"), "utf8");
const filesRoutesSource = fs.readFileSync(path.join(rootDir, "apps/api/modules/files/routes.ts"), "utf8");
const { buildContentDisposition, sendBinary, sendJson, sendText } = await import("../../apps/api/core/http.ts");

function createMockResponse() {
  return {
    writableEnded: false,
    statusCode: 0,
    headers: new Map(),
    body: "",
    setHeader(key, value) {
      this.headers.set(key, value);
    },
    getHeader(key) {
      return this.headers.get(key);
    },
    hasHeader(key) {
      return this.headers.has(key);
    },
    end(payload = "") {
      this.body = String(payload);
      this.writableEnded = true;
    },
  };
}

test("buildContentDisposition keeps download headers ascii-safe while preserving utf8 filenames", () => {
  const header = buildContentDisposition("报告 (final)'*.zip", "attachment");

  assert.match(header, /^attachment; filename="__ \(final\)'\*\.zip";/);
  assert.match(header, /filename\*=UTF-8''%E6%8A%A5%E5%91%8A%20%28final%29%27%2A\.zip$/);
  assert.doesNotMatch(header, /[^\x00-\x7f]/);
});

test("buildContentDisposition strips control characters and escapes quoted fallback filenames", () => {
  const header = buildContentDisposition('evil"\r\nx-bad: yes\\name.txt', "inline");

  assert.match(header, /^inline; filename="evil\\" x-bad: yes\\\\name\.txt";/);
  assert.doesNotMatch(header, /[\r\n]/);
});

test("binary and file stream responses disable browser mime sniffing", () => {
  const response = createMockResponse();

  sendBinary(response, 200, Buffer.from("ok"), "text/plain");

  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(
    httpSource,
    /export function sendFileStream[\s\S]*setNoSniffHeader\(res\);/,
  );
  assert.match(httpSource, /function parseSingleByteRange/);
  assert.match(httpSource, /res\.setHeader\('Accept-Ranges', 'bytes'\)/);
  assert.match(httpSource, /res\.setHeader\('Content-Range', `bytes \$\{range\.start\}-\$\{range\.end\}\/\$\{stat\.size\}`\)/);
  assert.match(httpSource, /fs\.createReadStream\(options\.filePath, \{ start: range\.start, end: range\.end \}\)/);
  assert.match(filesRoutesSource, /range: req\.headers\.range \|\| null/);
});

test("json and text responses also disable browser mime sniffing", () => {
  const jsonResponse = createMockResponse();
  const textResponse = createMockResponse();

  sendJson(jsonResponse, 200, { ok: true });
  sendText(textResponse, 200, "ok");

  assert.equal(jsonResponse.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(textResponse.headers.get("X-Content-Type-Options"), "nosniff");
});
