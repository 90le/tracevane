import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const launchMetadataModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-launch-metadata.ts");

function createMemoryStorage() {
  const records = new Map();
  return {
    getItem(key) {
      return records.has(key) ? records.get(key) : null;
    },
    setItem(key, value) {
      records.set(key, String(value));
    },
    removeItem(key) {
      records.delete(key);
    },
  };
}

test("terminal pending launch metadata preserves resource cwd until attach", () => {
  const storage = createMemoryStorage();

  launchMetadataModule.writePendingTerminalLaunchMetadata(storage, "term-resource", {
    profileId: "agent-codex",
    targetKind: "local",
    cwd: "/home/binbin/.openclaw/extensions/openclaw-studio",
  });

  assert.deepEqual(
    launchMetadataModule.readPendingTerminalLaunchMetadata(storage, "term-resource"),
    {
      profileId: "agent-codex",
      targetKind: "local",
      cwd: "/home/binbin/.openclaw/extensions/openclaw-studio",
      pinned: null,
    },
  );

  launchMetadataModule.removePendingTerminalLaunchMetadata(storage, "term-resource");
  assert.equal(
    launchMetadataModule.readPendingTerminalLaunchMetadata(storage, "term-resource"),
    null,
  );
});

test("terminal pending launch metadata ignores empty or unsupported values", () => {
  const storage = createMemoryStorage();

  launchMetadataModule.writePendingTerminalLaunchMetadata(storage, "term-empty", {
    profileId: "",
    targetKind: "unsupported",
    cwd: "",
  });

  assert.equal(
    launchMetadataModule.readPendingTerminalLaunchMetadata(storage, "term-empty"),
    null,
  );
});
