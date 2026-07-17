import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(rootDir, relativePath));

test("file manager routes files through unified online surface", () => {
  const page = read("apps/web/src/features/file-manager/FileManagerPage.tsx");
  const propertiesDialog = read("apps/web/src/features/file-manager/FilePropertiesDialog.tsx");
  const chrome = read("apps/web/src/features/file-manager/FileManagerChrome.tsx");
  const list = read("apps/web/src/features/file-manager/FileManagerList.tsx");
  const actionsMenu = read("apps/web/src/features/file-manager/file-tools/FileActionsMenu.tsx");
  const codeEditor = read("apps/web/src/features/file-manager/code-editor/CodeEditor.tsx");
  const fileSurfacePreviewPanel = read("apps/web/src/shared/file-surface/FileSurfacePreviewPanel.tsx");
  const packageJson = read("package.json");
  const webPackageJson = read("apps/web/package.json");
  const viteConfig = read("apps/web/vite.config.ts");

  assert.match(page, /path === "file-manager"|\/file-manager/);
  assert.doesNotMatch(page, /LazyFilePreviewDialog/);
  assert.doesNotMatch(page, /import\("\.\/FilePreviewPanel"\)/);
  assert.match(page, /openFileSurface/);
  assert.match(page, /setUploadJobs\(\[\]\);[\s\S]*setUploadSnapshots\(\[\]\);[\s\S]*saveUploadTaskSnapshots\(\s*FILE_MANAGER_UPLOAD_TASK_SNAPSHOT_KEY,\s*\[\],\s*\)/);
  assert.match(page, /FilePropertiesDialog/);
  assert.match(page, /\.\/FilePropertiesDialog/);
  assert.match(page, /onPreviewRequest=\{\(target\)/);
  assert.match(actionsMenu, /label="检查文件"/);
  assert.match(read("apps/web/src/features/file-manager/file-tools/UploadTaskStrip.tsx"), /data-upload-task-strip/);

  assert.match(chrome, /data-file-manager-command-bar/);
  assert.match(chrome, /data-file-manager-unified-path-bar/);
  assert.match(list, /FileListPanel/);
  assert.match(list, /onDoubleClick=\{onOpen\}/);
  assert.match(propertiesDialog, /export function FilePropertiesDialog/);
  assert.match(propertiesDialog, /基本信息/);
  assert.match(propertiesDialog, /复制相对路径/);

  const onlineEditorDialog = read("apps/web/src/features/file-manager/online-editor/FileOnlineEditorDialog.tsx");
  assert.match(onlineEditorDialog, /data-file-online-editor-action-menu-trigger/);
  assert.match(onlineEditorDialog, /data-file-online-editor-action-menu/);
  assert.match(onlineEditorDialog, /data-file-online-editor-command-palette/);
  assert.match(onlineEditorDialog, /data-file-online-editor-tab-menu/);
  assert.match(onlineEditorDialog, /data-file-online-editor-copy-path/);
  assert.match(onlineEditorDialog, /data-file-online-editor-copy-relative-path/);
  assert.doesNotMatch(onlineEditorDialog, /data-file-online-editor-tab-actions/);
  assert.match(onlineEditorDialog, /<FileSurfacePreviewPanel/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-panel/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-image/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-image-canvas/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-image-zoom-in/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-video/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-video-speed/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-audio/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-audio-speed/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-pdf/);
  assert.match(fileSurfacePreviewPanel, /data-file-surface-binary/);
  assert.match(codeEditor, /monaco-editor/);
  assert.match(codeEditor, /scheduleDeferredMonacoLanguageLoad/);
  assert.match(codeEditor, /ensureMonacoLanguage/);
  assert.match(codeEditor, /createModel\([\s\S]*"plaintext"/);
  assert.match(codeEditor, /MONACO_LANGUAGE_LOADERS/);
  assert.doesNotMatch(codeEditor, /^import .*basic-languages\/abap\/abap\.contribution\.js/m);

  assert.equal(exists("apps/web/src/features/file-manager/preview-shared"), false);
  assert.equal(exists("apps/web/src/features/file-manager/preview-renderers"), false);
  assert.equal(exists("tools/docs-renderer"), false);
  assert.equal(exists("lib/tracevane-markdown-media.ts"), false);
  assert.equal(exists("apps/web/src/features/document-engine"), false);

  for (const removed of [
    "@milkdown/crepe",
    "@milkdown/kit",
    "dompurify",
    "highlight.js",
    "mermaid",
    "rehype-raw",
    "rehype-stringify",
    "remark-gfm",
    "remark-parse",
    "remark-rehype",
    "unified",
  ]) {
    assert.doesNotMatch(webPackageJson, new RegExp(`"${removed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assert.doesNotMatch(viteConfig, /vendor-markdown/);
  assert.doesNotMatch(packageJson, /docs:render/);
  assert.doesNotMatch(packageJson, /markdown-visual-editor|fallback-preview|html-editor|upload-preview|preview-resilience/);
});
