import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const transferModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-resource-transfer.ts");

test("terminal resource transfer preserves multi-selected resource items", () => {
  const payload = {
    rootId: "workspace-root",
    path: "src/a file.ts",
    absolutePath: "/workspace/src/a file.ts",
    kind: "file",
    name: "a file.ts",
    items: [
      {
        rootId: "workspace-root",
        path: "src/a file.ts",
        absolutePath: "/workspace/src/a file.ts",
        kind: "file",
        name: "a file.ts",
      },
      {
        rootId: "workspace-root",
        path: "src/lib",
        absolutePath: "/workspace/src/lib",
        kind: "directory",
        name: "lib",
      },
    ],
  };

  const parsed = transferModule.parseTerminalResourceTransfer(
    transferModule.serializeTerminalResourceTransfer(payload),
  );

  assert.equal(parsed?.absolutePath, "/workspace/src/a file.ts");
  assert.equal(parsed?.items?.length, 2);
  assert.deepEqual(
    parsed?.items?.map((item) => [item.kind, item.absolutePath]),
    [
      ["file", "/workspace/src/a file.ts"],
      ["directory", "/workspace/src/lib"],
    ],
  );
});

test("terminal path quoting keeps dropped paths shell-safe", () => {
  assert.equal(
    transferModule.shellQuoteTerminalPath("/workspace/src/a file.ts"),
    "'/workspace/src/a file.ts'",
  );
  assert.equal(
    transferModule.shellQuoteTerminalPath("/workspace/src/index.ts"),
    "/workspace/src/index.ts",
  );
});

test("terminal resource cwd uses selected directories directly", () => {
  const folderPayload = {
    rootId: "workspace-root",
    path: "packages/web-vue",
    absolutePath: "/workspace/packages/web-vue",
    kind: "directory",
    name: "web-vue",
  };
  const rootPayload = {
    rootId: "workspace-root",
    path: "",
    absolutePath: "/workspace",
    kind: "directory",
    name: "workspace",
  };

  assert.equal(
    transferModule.getTerminalResourceDirectoryPath(folderPayload),
    "packages/web-vue",
  );
  assert.equal(
    transferModule.getTerminalResourceDirectoryAbsolutePath(folderPayload),
    "/workspace/packages/web-vue",
  );
  assert.equal(transferModule.getTerminalResourceDirectoryPath(rootPayload), "");
  assert.equal(
    transferModule.getTerminalResourceDirectoryAbsolutePath(rootPayload),
    "/workspace",
  );
});

test("terminal resource cwd uses parent directories for files", () => {
  const filePayload = {
    rootId: "workspace-root",
    path: "packages/web-vue/src/App.vue",
    absolutePath: "/workspace/packages/web-vue/src/App.vue",
    kind: "file",
    name: "App.vue",
  };

  assert.equal(
    transferModule.getTerminalResourceDirectoryPath(filePayload),
    "packages/web-vue/src",
  );
  assert.equal(
    transferModule.getTerminalResourceDirectoryAbsolutePath(filePayload),
    "/workspace/packages/web-vue/src",
  );
});

test("terminal dropped path lists normalize file uris and ignore comments", () => {
  assert.deepEqual(
    transferModule.splitTerminalDropPathList(
      "# dragged from file manager\nfile:///workspace/src/a%20file.ts\n/workspace/src/index.ts\n",
    ),
    ["/workspace/src/a file.ts", "/workspace/src/index.ts"],
  );
});

test("terminal plain text drops only keep path-like values", () => {
  assert.deepEqual(
    transferModule.collectTerminalResourceDropPaths({
      text: "term-session-123\nsrc/index.ts\n./README.md\n~/workspace\nplain-token",
    }),
    ["src/index.ts", "./README.md", "~/workspace"],
  );
});

test("terminal resource drop paths prefer structured payloads and dedupe", () => {
  const payload = {
    rootId: "workspace-root",
    path: "src/a file.ts",
    absolutePath: "/workspace/src/a file.ts",
    kind: "file",
    name: "a file.ts",
    items: [
      {
        rootId: "workspace-root",
        path: "src/a file.ts",
        absolutePath: "/workspace/src/a file.ts",
        kind: "file",
        name: "a file.ts",
      },
      {
        rootId: "workspace-root",
        path: "src/a file.ts",
        absolutePath: "/workspace/src/a file.ts",
        kind: "file",
        name: "a file.ts",
      },
      {
        rootId: "workspace-root",
        path: "src/lib",
        absolutePath: "/workspace/src/lib",
        kind: "directory",
        name: "lib",
      },
    ],
  };

  assert.deepEqual(
    transferModule.collectTerminalResourceDropPaths({
      payload,
      text: "/fallback/ignored",
      uriList: "file:///fallback/ignored",
    }),
    ["/workspace/src/a file.ts", "/workspace/src/lib"],
  );
});

test("terminal drop type detection rejects internal non-resource drags", () => {
  assert.equal(
    transferModule.canAcceptTerminalResourceDropTypes([
      transferModule.TERMINAL_RESOURCE_DRAG_MIME,
      "text/plain",
    ]),
    true,
  );
  assert.equal(
    transferModule.canAcceptTerminalResourceDropTypes(["text/uri-list"]),
    true,
  );
  assert.equal(
    transferModule.canAcceptTerminalResourceDropTypes([
      transferModule.TERMINAL_TAB_DRAG_MIME,
      "text/plain",
    ]),
    false,
  );
  assert.equal(
    transferModule.canAcceptTerminalResourceDropTypes([
      transferModule.TERMINAL_FILE_PREVIEW_DRAG_MIME,
      "text/plain",
    ]),
    false,
  );
  assert.equal(
    transferModule.canAcceptTerminalResourceDropTypes([
      transferModule.TERMINAL_FILE_PREVIEW_DRAG_MIME,
      transferModule.TERMINAL_RESOURCE_DRAG_MIME,
      "text/plain",
    ]),
    true,
  );
});
