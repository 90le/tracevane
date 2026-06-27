import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const WEB_CWD = new URL("../../apps/web/", import.meta.url);

function runDraftStorageScenario() {
  const script = String.raw`
    import { JSDOM } from "jsdom";
    import assert from "node:assert/strict";
    import {
      clearFileUnsavedDraft,
      loadFileUnsavedDraft,
      persistFileUnsavedDraft,
    } from "./src/features/file-manager/FilePreviewPanel.tsx";

    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://tracevane.local/file-manager",
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    const entry = {
      kind: "file",
      name: "notes.md",
      path: "/tmp/notes.md",
      size: 11,
      modifiedAt: "2026-06-26T00:00:00.000Z",
    };

    clearFileUnsavedDraft("root", entry.path);
    assert.equal(loadFileUnsavedDraft("root", entry.path), null);

    const saved = persistFileUnsavedDraft("root", entry, "hello draft", "hello");
    assert.ok(saved, "expected changed text to create an unsaved draft");
    assert.equal(saved.rootId, "root");
    assert.equal(saved.path, entry.path);
    assert.equal(saved.content, "hello draft");
    assert.equal(saved.sourceModifiedAt, entry.modifiedAt);

    const loaded = loadFileUnsavedDraft("root", entry.path);
    assert.equal(loaded?.content, "hello draft");

    const unchanged = persistFileUnsavedDraft("root", entry, "hello", "hello");
    assert.equal(unchanged, null);
    assert.equal(loadFileUnsavedDraft("root", entry.path), null);

    const tooLarge = "x".repeat(513 * 1024);
    const skipped = persistFileUnsavedDraft("root", entry, tooLarge, "hello");
    assert.equal(skipped, null);
    assert.equal(loadFileUnsavedDraft("root", entry.path), null);

    persistFileUnsavedDraft("root", entry, "draft again", "hello");
    clearFileUnsavedDraft("root", entry.path);
    assert.equal(loadFileUnsavedDraft("root", entry.path), null);
  `;

  execFileSync(process.execPath, ["--import", "tsx", "-e", script], {
    cwd: WEB_CWD,
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "test" },
  });
}

test("file preview unsaved drafts persist, restore, skip unchanged/large content, and clear", () => {
  assert.doesNotThrow(runDraftStorageScenario);
});
