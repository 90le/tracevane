import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = "/home/binbin/.openclaw/extensions/tracevane";

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const channelConnectorTypes = read("types/channel-connectors.ts");
const imBindingEditor = read(
  "apps/web/src/features/channel-connectors/views/BindingEditor.tsx",
);

test("runnable CLI agent metadata is centralized for IM binding surfaces", () => {
  assert.match(
    channelConnectorTypes,
    /export const CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA = \{/,
  );
  assert.match(channelConnectorTypes, /runnerContract: "codex-app-server"/);
  assert.match(
    channelConnectorTypes,
    /runnerContract: "claude-code-stream-json"/,
  );
  assert.match(channelConnectorTypes, /runnerContract: "opencode-run-session"/);
  assert.match(
    imBindingEditor,
    /CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA\[agent\]\.label/,
  );
  assert.doesNotMatch(
    imBindingEditor,
    /<option key=\{agent\} value=\{agent\}>\s*\{agent\}\s*<\/option>/,
  );
});
