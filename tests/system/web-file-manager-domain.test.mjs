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

test("file manager keeps management and source editing while file rendering is removed", () => {
  const page = read("apps/web/src/features/file-manager/FileManagerPage.tsx");
  const previewPanel = read("apps/web/src/features/file-manager/FilePreviewPanel.tsx");
  const propertiesDialog = read("apps/web/src/features/file-manager/FilePropertiesDialog.tsx");
  const chrome = read("apps/web/src/features/file-manager/FileManagerChrome.tsx");
  const list = read("apps/web/src/features/file-manager/FileManagerList.tsx");
  const actionsMenu = read("apps/web/src/features/file-manager/file-tools/FileActionsMenu.tsx");
  const codeEditor = read("apps/web/src/features/file-manager/code-editor/CodeEditor.tsx");
  const packageJson = read("package.json");
  const webPackageJson = read("apps/web/package.json");
  const viteConfig = read("apps/web/vite.config.ts");

  assert.match(page, /path === "file-manager"|\/file-manager/);
  assert.match(page, /LazyFilePreviewDialog/);
  assert.match(page, /import\("\.\/FilePreviewPanel"\)/);
  assert.match(page, /FilePropertiesDialog/);
  assert.match(page, /\.\/FilePropertiesDialog/);
  assert.match(page, /onPreviewRequest=\{\(target\)/);
  assert.match(actionsMenu, /label="检查文件（弹窗）"/);

  assert.match(chrome, /data-file-manager-command-bar/);
  assert.match(chrome, /data-file-manager-unified-path-bar/);
  assert.match(list, /FileListPanel/);
  assert.match(list, /onDoubleClick=\{onOpen\}/);
  assert.match(propertiesDialog, /export function FilePropertiesDialog/);
  assert.match(propertiesDialog, /基本信息/);
  assert.match(propertiesDialog, /复制相对路径/);

  assert.match(previewPanel, /export function FilePreviewDialog/);
  assert.match(previewPanel, /LazyCodeEditor/);
  assert.match(previewPanel, /React\.Suspense/);
  assert.match(previewPanel, /文件内容已加载/);
  assert.match(previewPanel, /FileSourceEditorRegion/);
  assert.match(previewPanel, /data-file-preview-editor-shell/);
  assert.match(previewPanel, /data-file-save-review-dialog/);
  assert.match(previewPanel, /createFileSaveDiffLines/);
  assert.match(previewPanel, /loadFileUnsavedDraft/);
  assert.match(previewPanel, /persistFileUnsavedDraft/);
  assert.match(previewPanel, /clearFileUnsavedDraft/);
  assert.match(previewPanel, /FileVersionHistoryDialog/);
  assert.match(previewPanel, /buildFileDownloadUrl/);
  assert.match(previewPanel, /非文本文件/);
  assert.match(previewPanel, /打开原始文件/);
  assert.match(previewPanel, /渲染\/媒体预览能力已删除/);
  assert.match(codeEditor, /monaco-editor/);
  assert.match(codeEditor, /scheduleDeferredMonacoLanguageLoad/);
  assert.match(codeEditor, /ensureMonacoLanguage/);
  assert.match(codeEditor, /createModel\([\s\S]*"plaintext"/);
  assert.match(codeEditor, /MONACO_LANGUAGE_LOADERS/);
  assert.doesNotMatch(codeEditor, /^import .*basic-languages\/abap\/abap\.contribution\.js/m);

  assert.doesNotMatch(previewPanel, /DocumentWorkbench/);
  assert.doesNotMatch(previewPanel, /DocumentPreview/);
  assert.doesNotMatch(previewPanel, /VisualDocumentEditor/);
  assert.doesNotMatch(previewPanel, /MarkdownPreview/);
  assert.doesNotMatch(previewPanel, /DocumentWorkbenchMode/);
  assert.doesNotMatch(previewPanel, /viewModeLabel/);
  assert.doesNotMatch(previewPanel, /边写边预览|预览时编辑/);

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
  assert.doesNotMatch(packageJson, /markdown-visual-editor|fallback-preview|media-preview|html-editor|upload-preview|preview-resilience/);
});
