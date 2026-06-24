import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const filePath = new URL("../../apps/web/src/shared/file-editor/FileEditor.tsx", import.meta.url);

const read = () => fs.readFileSync(filePath, "utf-8");

// ---------------------------------------------------------------------------
// Shared FileEditor — single editable control reused by /files and /ide.
// ---------------------------------------------------------------------------

test("FileEditor module exists", () => {
  assert.ok(
    fs.existsSync(filePath),
    "expected shared file editor at apps/web/src/shared/file-editor/FileEditor.tsx",
  );
});

test("FileEditor exports the shared control", () => {
  const source = read();
  assert.match(source, /export function FileEditor/);
});

test("FileEditor reuses the existing CodeEditor", () => {
  const source = read();
  assert.ok(
    source.includes("CodeEditor"),
    "FileEditor must reuse the existing CodeEditor control",
  );
});

test("FileEditor reuses the write mutation", () => {
  const source = read();
  assert.ok(
    source.includes("useWriteFileContentMutation"),
    "FileEditor must save through useWriteFileContentMutation",
  );
});

test("FileEditor handles Cmd/Ctrl+S", () => {
  const source = read();
  assert.ok(
    source.includes("preventDefault") && /metaKey|ctrlKey/.test(source),
    "FileEditor must intercept Cmd/Ctrl+S and prevent the browser save",
  );
});
