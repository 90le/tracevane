import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const defaultDirectoryModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-resource-default-directory.ts");

function createMemoryStorage() {
  const records = new Map();
  return {
    getItem(key) {
      return records.has(key) ? records.get(key) : null;
    },
    setItem(key, value) {
      records.set(key, String(value));
    },
  };
}

test("terminal resource default directory persists absolute cwd for new shells", () => {
  const storage = createMemoryStorage();

  const saved = defaultDirectoryModule.writeTerminalResourceDefaultDirectory(storage, {
    rootId: "openclaw-root",
    path: "/projects/openclaw/",
    absolutePath: "/home/binbin/.openclaw/projects/openclaw",
  });

  assert.deepEqual(saved, {
    rootId: "openclaw-root",
    path: "projects/openclaw",
    absolutePath: "/home/binbin/.openclaw/projects/openclaw",
  });
  assert.deepEqual(
    defaultDirectoryModule.readTerminalResourceDefaultDirectory(storage),
    saved,
  );
});

test("terminal resource default directory supports workspace group scoped defaults", () => {
  const storage = createMemoryStorage();

  const main = defaultDirectoryModule.writeTerminalResourceDefaultDirectory(storage, {
    rootId: "openclaw-root",
    path: "projects/main",
    absolutePath: "/home/binbin/.openclaw/projects/main",
  });
  const group = defaultDirectoryModule.writeTerminalResourceDefaultDirectory(
    storage,
    {
      rootId: "openclaw-root",
      path: "projects/a",
      absolutePath: "/home/binbin/.openclaw/projects/a",
    },
    "cwd:/home/binbin/.openclaw/projects/a",
  );

  assert.deepEqual(defaultDirectoryModule.readTerminalResourceDefaultDirectory(storage, "all"), main);
  assert.deepEqual(
    defaultDirectoryModule.readTerminalResourceDefaultDirectory(
      storage,
      "cwd:/home/binbin/.openclaw/projects/a",
    ),
    group,
  );
  assert.deepEqual(
    defaultDirectoryModule.readTerminalResourceDefaultDirectory(storage, "cwd:/missing"),
    main,
  );
  assert.equal(
    defaultDirectoryModule.hasTerminalResourceDefaultDirectory(
      storage,
      "cwd:/home/binbin/.openclaw/projects/a",
    ),
    true,
  );
});

test("terminal resource default directory can clear a group default to follow main", () => {
  const storage = createMemoryStorage();
  const groupId = "cwd:/home/binbin/.openclaw/projects/a";
  const main = defaultDirectoryModule.writeTerminalResourceDefaultDirectory(storage, {
    rootId: "openclaw-root",
    path: "projects/main",
    absolutePath: "/home/binbin/.openclaw/projects/main",
  });
  defaultDirectoryModule.writeTerminalResourceDefaultDirectory(
    storage,
    {
      rootId: "openclaw-root",
      path: "projects/a",
      absolutePath: "/home/binbin/.openclaw/projects/a",
    },
    groupId,
  );

  assert.equal(defaultDirectoryModule.clearTerminalResourceDefaultDirectory(storage, groupId), true);
  assert.equal(defaultDirectoryModule.hasTerminalResourceDefaultDirectory(storage, groupId), false);
  assert.deepEqual(defaultDirectoryModule.readTerminalResourceDefaultDirectory(storage, groupId), main);
});

test("terminal resource default directory accepts legacy snapshots without absolute cwd", () => {
  assert.deepEqual(
    defaultDirectoryModule.parseTerminalResourceDefaultDirectorySnapshot(
      JSON.stringify({
        rootId: "openclaw-root",
        path: "/workspace/",
      }),
    ),
    {
      rootId: "openclaw-root",
      path: "workspace",
      absolutePath: null,
    },
  );
});

test("terminal resource default directory rejects invalid snapshots", () => {
  assert.equal(defaultDirectoryModule.parseTerminalResourceDefaultDirectorySnapshot("not-json"), null);
  assert.equal(defaultDirectoryModule.parseTerminalResourceDefaultDirectorySnapshot("[]"), null);
  assert.equal(
    defaultDirectoryModule.parseTerminalResourceDefaultDirectorySnapshot(
      JSON.stringify({ path: "/workspace" }),
    ),
    null,
  );
});
