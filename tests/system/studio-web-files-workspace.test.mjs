import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const retiredVendorPattern = new RegExp("vue" + "finder", "i");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

function exists(filePath) {
  return fs.existsSync(path.join(rootDir, filePath));
}

const routeManifest = read("apps/web-vue/src/features/shell/route-manifest.ts");
const managementManifest = read("apps/web-vue/src/features/management/management-domain-manifest.ts");
const filesView = read("apps/web-vue/src/views/FilesView.vue");
const filesControlPage = read("apps/web-vue/src/features/files/FilesControlPage.vue");
const fileEditorWorkspace = read("apps/web-vue/src/features/files/FileEditorWorkspace.vue");
const codeFileEditor = read("apps/web-vue/src/features/files/CodeFileEditor.vue");
const filesWorkspaceCss = read("apps/web-vue/src/features/files/files-workspace.css");
const filesApi = read("apps/web-vue/src/features/files/api.ts");
const filesRoutes = read("apps/api/modules/files/routes.ts");
const filesService = read("apps/api/modules/files/service.ts");
const webPackage = JSON.parse(read("apps/web-vue/package.json"));
const main = read("apps/web-vue/src/main.ts");

test("files route and management domain are wired into Studio shell", () => {
  assert.match(routeManifest, /const FilesView = \(\) => import\("\.\.\/\.\.\/views\/FilesView\.vue"\)/);
  assert.match(routeManifest, /path:\s*"\/files"/);
  assert.match(routeManifest, /key:\s*"files"/);
  assert.match(routeManifest, /icon:\s*"files"/);
  assert.match(managementManifest, /id:\s*"files"/);
  assert.match(managementManifest, /routePath:\s*"\/files"/);
  assert.match(filesView, /FilesControlPage/);
  assert.match(filesView, /getManagementDomainEntry\("files"\)/);
});

test("files workspace is a native Studio workbench instead of a retired vendor adapter", () => {
  assert.doesNotMatch(filesControlPage, retiredVendorPattern);
  assert.doesNotMatch(filesWorkspaceCss, retiredVendorPattern);
  assert.doesNotMatch(main, retiredVendorPattern);
  assert.equal(webPackage.dependencies?.["vue" + "finder"], undefined);
  assert.equal(exists("apps/web-vue/src/features/files/vue" + "finder-driver.ts"), false);
  assert.equal(exists("apps/web-vue/src/types/vue" + "finder-locales.d.ts"), false);

  assert.match(filesControlPage, /class="file-manager-page studio-file-workbench"/);
  assert.match(filesControlPage, /studio-file-tabs/);
  assert.match(filesControlPage, /directoryTabs/);
  assert.match(filesControlPage, /activeDirectoryTabId/);
  assert.match(filesControlPage, /createDirectoryTab/);
  assert.match(filesControlPage, /openCurrentDirectoryInNewTab/);
  assert.match(filesControlPage, /closeDirectoryTab/);
  assert.match(filesControlPage, /studio-file-pathbar/);
  assert.match(filesControlPage, /studio-file-breadcrumbs/);
  assert.match(filesControlPage, /studio-file-toolbar/);
  assert.match(filesControlPage, /studio-file-sidebar/);
  assert.match(filesControlPage, /studio-file-table/);
  assert.match(filesControlPage, /studio-file-grid/);
  assert.match(filesControlPage, /studio-file-details/);
  assert.match(filesControlPage, /studio-file-context-menu/);
  assert.match(filesControlPage, /studio-file-dialog/);
  assert.match(filesControlPage, /viewMode/);
  assert.match(filesControlPage, /sortNativeFileItems/);
  assert.match(filesControlPage, /selectedItemIds/);
  assert.match(filesControlPage, /clipboardMode/);
  assert.match(filesControlPage, /pasteClipboardItems/);
  assert.match(filesControlPage, /handleWorkbenchKeydown/);
  assert.match(filesControlPage, /isTextEditingEventTarget/);
  assert.match(filesControlPage, /\.cm-editor/);
  assert.match(filesControlPage, /\.studio-file-dialog/);
});

test("native files workspace covers operations expected from an ops-oriented web file manager", () => {
  assert.match(filesControlPage, /fetchFilesSummary/);
  assert.match(filesControlPage, /browseDirectory/);
  assert.match(filesControlPage, /fetchDirectoryTree/);
  assert.match(filesControlPage, /searchFiles/);
  assert.match(filesControlPage, /createDirectory/);
  assert.match(filesControlPage, /createFile/);
  assert.match(filesControlPage, /renamePath/);
  assert.match(filesControlPage, /copyPath/);
  assert.match(filesControlPage, /movePath/);
  assert.match(filesControlPage, /deletePaths/);
  assert.match(filesControlPage, /uploadFiles/);
  assert.match(filesControlPage, /handleUploadDirectoryInputChange/);
  assert.match(filesControlPage, /handleDropUpload/);
  assert.match(filesControlPage, /handleWorkbenchPaste/);
  assert.match(filesControlPage, /collectUploadCandidatesFromDataTransfer/);
  assert.match(filesControlPage, /collectUploadCandidatesFromEntry/);
  assert.match(filesControlPage, /MAX_UPLOAD_FILE_BYTES/);
  assert.match(filesControlPage, /MAX_UPLOAD_BATCH_BYTES/);
  assert.match(filesControlPage, /archivePaths/);
  assert.match(filesControlPage, /unarchiveFile/);
  assert.match(filesControlPage, /downloadArchiveForItems/);
  assert.match(filesControlPage, /buildArchiveDownloadUrl/);
  assert.match(filesControlPage, /buildFileDownloadUrl/);
  assert.match(filesControlPage, /openOperationDialog\('archive'/);
  assert.match(filesControlPage, /openOperationDialog\('delete'/);
  assert.match(filesControlPage, /copyContextRelativePath/);
  assert.match(filesControlPage, /copyContextStudioRef/);
  assert.match(filesControlPage, /openTerminalHere/);
  assert.match(filesControlPage, /TERMINAL_RESOURCE_DRAG_MIME/);
  assert.match(filesControlPage, /serializeTerminalResourceTransfer/);
  assert.match(filesControlPage, /TERMINAL_PENDING_LAUNCH_STORAGE_KEY/);
  assert.match(filesControlPage, /router\.push\(\{ path:\s*`\/terminal\/\$\{encodeURIComponent\(sessionId\)\}`/);
});

test("file previews and editor workspace remain integrated with the native file manager", () => {
  assert.match(filesControlPage, /FileEditorWorkspace/);
  assert.match(filesControlPage, /editorTabs/);
  assert.match(filesControlPage, /activeEditorId/);
  assert.match(filesControlPage, /readFileContent/);
  assert.match(filesControlPage, /saveFileContent/);
  assert.match(filesControlPage, /dirtyEditorTabs/);
  assert.match(filesControlPage, /isEditorTabDirty/);
  assert.match(filesControlPage, /confirmDiscardEditorChanges/);
  assert.match(filesControlPage, /beforeunload/);
  assert.match(filesControlPage, /recentEditorFiles/);
  assert.match(filesControlPage, /RECENT_EDITOR_FILES_STORAGE_KEY/);
  assert.match(filesControlPage, /detailsItem\.fileKind === 'image'/);
  assert.match(filesControlPage, /detailsItem\.fileKind === 'video'/);
  assert.match(filesControlPage, /detailsItem\.fileKind === 'audio'/);
  assert.match(filesControlPage, /detailsItem\.fileKind === 'pdf'/);
  assert.match(filesControlPage, /resolveTerminalFileKind/);
  assert.match(filesControlPage, /fileKindLabel/);
  assert.match(filesControlPage, /fileIconKind/);
  assert.match(filesControlPage, /isCodeEditableItem/);

  assert.match(fileEditorWorkspace, /AsyncCodeFileEditor/);
  assert.match(fileEditorWorkspace, /file-manager-editor-drawer--maximized/);
  assert.match(fileEditorWorkspace, /最近打开/);
  assert.match(fileEditorWorkspace, /搜索\/替换/);
  assert.match(fileEditorWorkspace, /file-manager-editor-drawer__statusbar/);
  assert.match(codeFileEditor, /CodeMirror|EditorView|codemirror/);
  assert.match(codeFileEditor, /replaceAll/);
  assert.match(codeFileEditor, /key:\s*"Mod-s"/);
  assert.match(codeFileEditor, /emit\("save"\)/);
});

test("files workspace styles are native, responsive, and kept in feature CSS", () => {
  for (const source of [filesControlPage, fileEditorWorkspace, codeFileEditor]) {
    assert.match(source, /import "\.\/files-workspace\.css";/);
    assert.doesNotMatch(source, /<style scoped>/);
  }

  assert.match(filesWorkspaceCss, /\.studio-file-workbench\s*\{/);
  assert.match(filesWorkspaceCss, /\.studio-file-tabs\s*\{/);
  assert.match(filesWorkspaceCss, /\.studio-file-pathbar\s*,\s*\n\.studio-file-toolbar\s*\{/);
  assert.match(filesWorkspaceCss, /\.studio-file-body\s*\{[\s\S]*grid-template-columns:/);
  assert.match(filesWorkspaceCss, /\.studio-file-table\s*\{[\s\S]*table-layout:\s*fixed;/);
  assert.match(filesWorkspaceCss, /\.studio-file-grid\s*\{[\s\S]*repeat\(auto-fill,/);
  assert.match(filesWorkspaceCss, /\.studio-file-kind-icon--folder/);
  assert.match(filesWorkspaceCss, /\.studio-file-kind-icon--code/);
  assert.match(filesWorkspaceCss, /\.studio-file-kind-icon--image/);
  assert.match(filesWorkspaceCss, /\.studio-file-preview img,\n\.studio-file-preview video\s*\{[\s\S]*object-fit:\s*contain;/);
  assert.match(filesWorkspaceCss, /\.studio-file-context-menu\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(filesWorkspaceCss, /@media \(max-width:\s*760px\)/);
  assert.match(filesWorkspaceCss, /\.studio-file-sidebar\s*\{[\s\S]*display:\s*none;/);
  assert.doesNotMatch(filesWorkspaceCss, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(filesWorkspaceCss, /:deep|:global/);
  assert.doesNotMatch(
    read("apps/web-vue/src/style.css"),
    /\.main-content\.file-surface-route\s*\{|\.shell-layout-files\s*\{|\.shell-route-stage-files\s*\{/,
    "files route shell rules should live with the files feature CSS instead of global style.css",
  );
});

test("files api and server routes cover browse, tree, read, search, mutate, upload, archive, and inline preview", () => {
  assert.match(filesApi, /fetchFilesSummary/);
  assert.match(filesApi, /browseDirectory/);
  assert.match(filesApi, /fetchDirectoryTree/);
  assert.match(filesApi, /readFileContent/);
  assert.match(filesApi, /searchFiles/);
  assert.match(filesApi, /createDirectory/);
  assert.match(filesApi, /createFile/);
  assert.match(filesApi, /saveFileContent/);
  assert.match(filesApi, /renamePath/);
  assert.match(filesApi, /copyPath/);
  assert.match(filesApi, /movePath/);
  assert.match(filesApi, /deletePaths/);
  assert.match(filesApi, /uploadFiles/);
  assert.match(filesApi, /archivePaths/);
  assert.match(filesApi, /unarchiveFile/);
  assert.match(filesApi, /buildArchiveDownloadUrl/);
  assert.match(filesApi, /buildFileDownloadUrl/);
  assert.match(filesApi, /download:\s*options\.download \? 1 : undefined/);

  assert.match(filesRoutes, /\/api\/files\/summary/);
  assert.match(filesRoutes, /\/api\/files\/browse/);
  assert.match(filesRoutes, /\/api\/files\/tree/);
  assert.match(filesRoutes, /\/api\/files\/read/);
  assert.match(filesRoutes, /\/api\/files\/search/);
  assert.match(filesRoutes, /\/api\/files\/download/);
  assert.match(filesRoutes, /readFlag\(url\.searchParams\.get\("download"\), false\) \? "attachment" : "inline"/);
  assert.match(filesRoutes, /\/api\/files\/upload/);
  assert.match(filesRoutes, /\/api\/files\/archive/);
  assert.match(filesRoutes, /\/api\/files\/unarchive/);
  assert.match(filesRoutes, /\/api\/files\/download-archive/);
  assert.match(filesRoutes, /buildContentDisposition\(payload\.fileName, "attachment"\)/);
  assert.match(filesRoutes, /"Cache-Control": "no-store"/);

  assert.match(read("types/files.ts"), /matchKind\?: "name" \| "content"/);
  assert.match(filesService, /findContentSearchSnippet/);
  assert.match(filesService, /target\.relative_to\(destination\)/);
  assert.match(filesService, /unarchive/);
});
