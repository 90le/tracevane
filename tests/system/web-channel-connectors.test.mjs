import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FEATURE_DIR = "apps/web/src/features/channel-connectors";
const VIEWS_DIR = `${FEATURE_DIR}/views`;

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Channel Connectors daemon panel refreshes real supervisor status", () => {
  const panel = read(`${VIEWS_DIR}/DaemonServicePanel.tsx`);
  assert.match(panel, /runCommands: true/);
  assert.doesNotMatch(panel, /runCommands: action !== "status"/);
  assert.match(panel, /激活/);
  assert.match(panel, /开机自启/);
});

test("Channel Connectors overview derives daemon readiness from runtime and service manager", () => {
  const overview = read(`${VIEWS_DIR}/OverviewView.tsx`);
  assert.match(overview, /useChannelConnectorsStatusQuery/);
  assert.match(overview, /runtime\?\.reachable === true/);
  assert.match(overview, /manager\?\.active === true/);
  assert.match(overview, /DaemonServicePanel/);
});

test("Channel Connectors bindings view supports create delete and transport smoke actions", () => {
  const bindings = read(`${VIEWS_DIR}/BindingsView.tsx`);
  assert.match(bindings, /新建绑定/);
  assert.match(bindings, /确认删除/);
  assert.match(bindings, /useRunFeishuTransportSmokeMutation/);
  assert.match(bindings, /useRunOctoTransportSmokeMutation/);
  assert.match(bindings, /tenant-token/);
  assert.match(bindings, /register/);
});

test("Channel Connectors binding editor exposes redacted-safe metadata JSON", () => {
  const editor = read(`${VIEWS_DIR}/BindingEditor.tsx`);
  assert.match(editor, /Transport metadata JSON/);
  assert.match(editor, /metadataJson/);
  assert.match(editor, /\[redacted\]/);
  assert.match(editor, /parseMetadata/);
});
