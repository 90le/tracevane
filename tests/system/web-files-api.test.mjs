import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../../apps/web/src/lib/api/files.ts", import.meta.url), "utf-8");
test("files api binds write endpoints", () => {
  for (const [fn, path] of [
    ["writeFileContent", "/api/files/content"],
    ["createDirectory", "/api/files/directories"],
    ["createFile", "/api/files/files"],
    ["renameFile", "/api/files/rename"],
    ["copyFile", "/api/files/copy"],
    ["moveFile", "/api/files/move"],
    ["deleteFiles", "/api/files"],
    ["archiveFiles", "/api/files/archive"],
    ["unarchiveFile", "/api/files/unarchive"],
  ]) {
    assert.match(src, new RegExp(`export function ${fn}\\b`), `missing ${fn}`);
    assert.ok(src.includes(`"${path}"`) || src.includes(`'${path}'`), `missing path ${path}`);
  }
});
