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

test("system file manager is an independent app-shell domain with cloud-panel list layout", () => {
  const page = read("apps/web/src/features/file-manager/FileManagerPage.tsx");
  const operationHistory = read(
    "apps/web/src/features/file-manager/OperationHistoryPanel.tsx",
  );
  const previewPanel = read(
    "apps/web/src/features/file-manager/FilePreviewPanel.tsx",
  );
  const propertiesDialog = read(
    "apps/web/src/features/workspace/shared/FilePropertiesDialog.tsx",
  );
  const actionDialog = read(
    "apps/web/src/features/file-manager/FileManagerActionDialog.tsx",
  );
  const contentIndex = read(
    "apps/web/src/features/file-manager/ContentIndexManager.tsx",
  );
  const trashManager = read(
    "apps/web/src/features/file-manager/TrashManager.tsx",
  );
  const searchPanel = read(
    "apps/web/src/features/file-manager/FileManagerSearchPanel.tsx",
  );
  const chrome = read(
    "apps/web/src/features/file-manager/FileManagerChrome.tsx",
  );
  const list = read("apps/web/src/features/file-manager/FileManagerList.tsx");
  const fileTypeIcon = read(
    "apps/web/src/features/file-manager/FileTypeIcon.tsx",
  );
  const workspaceExplorer = read(
    "apps/web/src/features/workspace/files/WorkspaceExplorer.tsx",
  );
  const documentPreview = read(
    "apps/web/src/features/workspace/shared/DocumentPreview.tsx",
  );
  const archivePreview = read(
    "apps/web/src/features/workspace/shared/ArchivePreview.tsx",
  );
  const binaryFilePreview = read(
    "apps/web/src/features/workspace/shared/BinaryFilePreview.tsx",
  );
  const textSlicePreview = read(
    "apps/web/src/features/workspace/shared/TextSlicePreview.tsx",
  );
  const documentViewRegistry = read(
    "apps/web/src/features/workspace/shared/DocumentViewRegistry.ts",
  );
  const textSearchReplace = read(
    "apps/web/src/features/workspace/shared/TextSearchReplaceStrip.tsx",
  );
  const documentWorkbench = read(
    "apps/web/src/features/workspace/shared/DocumentWorkbench.tsx",
  );
  const visualDocumentEditor = read(
    "apps/web/src/features/workspace/shared/VisualDocumentEditor.tsx",
  );
  const actionsMenu = read(
    "apps/web/src/features/workspace/files/FileActionsMenu.tsx",
  );
  const router = read("apps/web/src/app/router.tsx");
  const navigation = read("apps/web/src/app/navigation.ts");
  const packageJson = read("package.json");
  const contentIndexSmoke = read(
    "tests/file-manager/file-manager-content-index.smoke.mjs",
  );
  const previewResilienceSmoke = read(
    "tests/file-manager/file-manager-preview-resilience.smoke.mjs",
  );
  const mediaPreviewSmoke = read(
    "tests/file-manager/file-manager-media-preview.smoke.mjs",
  );
  const markdownVisualEditorSmoke = read(
    "tests/file-manager/file-manager-markdown-visual-editor.smoke.mjs",
  );
  const htmlEditorSmoke = read(
    "tests/file-manager/file-manager-html-editor.smoke.mjs",
  );
  const fallbackPreviewSmoke = read(
    "tests/file-manager/file-manager-fallback-preview.smoke.mjs",
  );
  const largeDirectorySmoke = read(
    "tests/file-manager/file-manager-large-directory.smoke.mjs",
  );
  const fileOperationsSmoke = read(
    "tests/file-manager/file-manager-file-operations.smoke.mjs",
  );

  assert.match(router, /path="\/file-manager"/);
  assert.match(navigation, /label: "文件库"/);

  assert.match(page, /FileManagerHeader/);
  assert.match(page, /FileManagerNavigationBar/);
  assert.match(chrome, /data-file-manager-command-bar/);
  assert.match(chrome, /data-file-manager-view-switcher/);
  assert.match(chrome, /data-file-manager-actions-menu/);
  assert.match(chrome, /data-file-manager-actions-popover/);
  assert.doesNotMatch(chrome, /Web 系统文件管理器/);
  assert.doesNotMatch(chrome, /默认列表视图/);
  assert.match(chrome, /回收站/);
  assert.match(chrome, /viewMode === "trash"/);
  assert.match(page, /LazyTrashManager/);
  assert.match(trashManager, /useFilesTrashQuery/);
  assert.match(trashManager, /FILES_GLOBAL_SCOPE_ID/);
  assert.match(trashManager, /rootId: trashScopeRootId/);
  assert.match(
    trashManager,
    /data-file-manager-trash-root-id=\{item\.rootId\}/,
  );
  assert.match(trashManager, /useRestoreFilesTrashMutation/);
  assert.match(trashManager, /usePurgeFilesTrashMutation/);
  assert.match(trashManager, /恢复冲突/);
  assert.match(trashManager, /data-file-manager-trash-manager/);
  assert.match(trashManager, /data-file-manager-trash-list/);
  assert.match(trashManager, /data-file-manager-trash-category-rail/);
  assert.match(trashManager, /data-file-manager-trash-category=\{item\.id\}/);
  assert.match(trashManager, /data-file-manager-trash-virtual-list/);
  assert.match(trashManager, /data-file-manager-trash-rendered-count/);
  assert.match(trashManager, /data-file-manager-trash-total-count/);
  assert.match(trashManager, /data-file-manager-trash-pagination/);
  assert.match(trashManager, /overflow-x-auto px-3 py-2 sm:hidden/);
  assert.match(trashManager, /useIdleReady\(120\)/);
  assert.match(trashManager, /enabled: trashQueryReady/);
  assert.match(
    trashManager,
    /data-file-manager-trash-item=\{item\.trashPath\}/,
  );
  assert.match(
    trashManager,
    /data-file-manager-trash-original-path=\{item\.originalPath\}/,
  );
  assert.match(trashManager, /data-file-manager-trash-restore/);
  assert.match(trashManager, /data-file-manager-trash-purge/);
  assert.match(trashManager, /aria-label="恢复冲突策略"/);
  assert.match(trashManager, /保留两者/);
  assert.match(trashManager, /清空回收站/);
  assert.match(trashManager, /永久删除/);
  assert.match(trashManager, /createOperationRecord/);
  assert.match(chrome, /breadcrumbs/);

  assert.match(chrome, /data-file-manager-header-title/);
  assert.match(chrome, /data-file-manager-unified-path-bar/);
  assert.match(chrome, /data-file-manager-path-breadcrumb-mode/);
  assert.match(chrome, /data-file-manager-path-edit-mode/);
  assert.match(chrome, /data-file-manager-path-enter-edit/);
  assert.match(chrome, /setEditingPath\(true\)/);
  assert.match(chrome, /setEditingPath\(false\)/);
  assert.match(chrome, /pathInputRef\.current\?\.select\(\)/);
  assert.match(
    chrome,
    /aria-label="文件路径地址栏，可点击面包屑或输入路径跳转"/,
  );
  assert.doesNotMatch(chrome, /data-file-manager-header-kicker/);
  assert.doesNotMatch(chrome, /data-file-manager-mobile-location-compact/);
  assert.doesNotMatch(chrome, /data-file-manager-desktop-breadcrumbs/);
  assert.match(chrome, /data-file-manager-filter-row/);
  assert.match(chrome, /data-file-manager-mobile-filter-dock/);
  assert.match(chrome, /data-file-manager-filter-controls/);
  assert.match(chrome, /data-file-manager-visible-filter-actions/);
  assert.match(chrome, /data-file-manager-hidden-toggle/);
  assert.match(chrome, /aria-pressed=\{showHidden\}/);
  assert.match(chrome, /筛选当前目录/);
  assert.match(chrome, /group-open:grid sm:grid/);
  assert.match(chrome, /compactBreadcrumbs\(breadcrumbs\)/);
  assert.match(chrome, /data-file-manager-path-ellipsis/);
  assert.match(chrome, /pathCrumbs\.slice\(-3\)/);
  assert.doesNotMatch(chrome, /!isLastCrumb && "hidden md:block"/);
  assert.doesNotMatch(chrome, /!isLastCrumb && "hidden md:inline-flex"/);
  assert.match(
    chrome,
    /onClick=\{\(\) => onNavigateToDirectory\(crumb\.path\)\}/,
  );
  assert.match(chrome, /onClick=\{\(\) => onNavigateToDirectory\(""\)\}/);
  assert.match(chrome, /data-file-manager-path-input/);
  assert.doesNotMatch(chrome, /快捷根只是入口/);
  assert.match(chrome, /搜索当前目录/);
  assert.doesNotMatch(page, /WorkspaceExplorer/);
  assert.doesNotMatch(page, /目录树/);
  assert.doesNotMatch(page, /from "@\/features\/workspace\/files"/);
  assert.match(page, /@\/features\/workspace\/files\/FileActionsMenu/);
  assert.match(page, /@\/features\/workspace\/files\/fileOperations/);
  assert.match(page, /@\/features\/workspace\/files\/types/);
  assert.match(page, /FileActionsMenu/);
  assert.match(page, /FileManagerSearchPanel/);
  assert.match(searchPanel, /useFilesSearchQuery/);
  assert.match(searchPanel, /FILE_MANAGER_SEARCH_LIMIT = 500/);
  assert.match(searchPanel, /limit: FILE_MANAGER_SEARCH_LIMIT/);
  assert.match(searchPanel, /文件名和内容搜索/);
  assert.match(searchPanel, /data-file-manager-search-panel/);
  assert.match(searchPanel, /data-file-manager-search-panel-mobile/);
  assert.match(searchPanel, /data-file-manager-search-panel-desktop/);
  assert.match(searchPanel, /data-file-manager-search-mobile-body/);
  assert.match(searchPanel, /group-open:grid/);
  assert.match(searchPanel, /按需展开/);
  assert.match(searchPanel, /md:hidden/);
  assert.match(searchPanel, /md:grid/);
  assert.match(searchPanel, /data-file-manager-search-options-mobile/);
  assert.match(searchPanel, /data-file-manager-search-options-desktop/);
  assert.match(searchPanel, /<details[\s\S]*className=/);
  assert.match(searchPanel, /搜索选项/);
  assert.match(searchPanel, /搜索文件名或内容/);
  assert.match(searchPanel, /递归子目录/);
  assert.match(searchPanel, /区分大小写/);
  assert.match(searchPanel, /正则/);
  assert.match(searchPanel, /内容索引命中/);
  assert.match(contentIndex, /CONTENT_INDEX_RECORDS_PAGE_SIZE = 50/);
  assert.match(contentIndex, /CONTENT_INDEX_RECORD_ROW_HEIGHT/);
  assert.match(contentIndex, /data-content-index-virtualized-records/);
  assert.match(contentIndex, /data-content-index-rendered-count/);
  assert.match(contentIndex, /data-content-index-page-jump/);
  assert.match(contentIndex, /overflow-x-auto px-3 py-2 sm:hidden/);
  assert.match(contentIndex, /data-content-index-total-count/);
  assert.match(contentIndex, /useIdleReady\(140\)/);
  assert.doesNotMatch(contentIndex, /cleanAvailable/);
  assert.match(contentIndex, /disabled=\{busy \|\| !data\}/);
  assert.match(contentIndex, /enabled: Boolean\(data\) && recordsQueryReady/);
  assert.match(searchPanel, /索引未命中，已扫描补全/);
  assert.match(
    searchPanel,
    /truncated=\{Boolean\(search\.data\?\.truncated\)\}/,
  );
  assert.match(searchPanel, /limit=\{search\.data\?\.limit \?\? 250\}/);
  assert.match(searchPanel, /已达到 \$\{limit\} 条上限/);
  assert.match(searchPanel, /请收窄关键词或路径/);
  assert.match(searchPanel, /HighlightedText/);
  assert.match(searchPanel, /预览 \/ 编辑/);
  assert.match(searchPanel, /打开目录/);
  assert.match(searchPanel, /results\.slice\(0, 160\)/);
  assert.match(searchPanel, /matchKind === "content"/);
  assert.match(page, /onOpenContextMenu/);
  assert.match(page, /UploadManagerDialog/);
  assert.match(page, /createUploadBatch/);
  assert.match(page, /handleFileManagerPaste/);
  assert.match(page, /handleDrop/);
  assert.match(page, /handleDropUploadToDirectory/);
  const uploadInputs = read(
    "apps/web/src/features/workspace/files/uploadInputs.ts",
  );
  assert.match(page, /collectUploadFilesFromDataTransfer/);
  assert.match(page, /mergeUploadFiles/);
  assert.match(page, /uploadFilesClipboardFingerprint/);
  assert.match(page, /quickPasteUploadRef/);
  assert.match(page, /queueQuickPasteUpload/);
  assert.match(page, /mergeUploadFiles\(\[\], files\)/);
  assert.match(page, /已忽略重复粘贴/);
  assert.match(
    page,
    /startUpload\(normalizedFiles, targetDirectory, "rename"\)/,
  );
  assert.doesNotMatch(page, /function collectDroppedFiles/);
  assert.match(
    uploadInputs,
    /export async function collectUploadFilesFromDataTransfer/,
  );
  assert.match(uploadInputs, /export function mergeUploadFiles/);
  assert.match(uploadInputs, /uploadFileIdentity/);
  assert.match(uploadInputs, /uploadFileClipboardIdentity/);
  assert.match(uploadInputs, /uploadFilesClipboardFingerprint/);
  assert.match(uploadInputs, /webkitGetAsEntry/);
  assert.match(uploadInputs, /getAsEntry/);
  assert.match(uploadInputs, /collectFilesFromEntry/);
  assert.match(uploadInputs, /withUploadRelativePath/);
  assert.match(uploadInputs, /while \(true\)/);
  assert.match(page, /拖拽上传到当前目录/);
  assert.match(page, /onUploadRequest=\{openUploadManager\}/);
  assert.match(page, /useFilesBrowseQuery/);
  assert.match(page, /FILE_MANAGER_SESSION_STORAGE_KEY/);
  assert.match(page, /loadFileManagerSessionState/);
  assert.match(page, /storeFileManagerSessionState/);
  assert.match(page, /LazyFilePreviewDialog/);
  assert.match(page, /import\("\.\/FilePreviewPanel"\)/);
  assert.match(page, /FileListPanel/);
  assert.match(page, /data-file-manager-stats/);
  assert.match(page, /data-file-manager-secondary-dock/);
  assert.match(page, /data-file-manager-search-and-stats-dock/);
  assert.match(page, /data-file-manager-stats-inline/);
  assert.match(page, /data-file-manager-stats-desktop/);
  assert.match(page, /min-h-8/);
  assert.match(page, /gap-x-3/);
  assert.match(page, /selectedList.length > 0 && "pb-32 sm:pb-0"/);
  assert.match(list, /export function FileListPanel/);
  assert.match(list, /export function BulkActionBar/);
  assert.match(list, /export function sortFileEntries/);
  assert.match(
    list,
    /export type FileManagerSortKey =[\s\S]*"name"[\s\S]*"size"[\s\S]*"modified"[\s\S]*"type"/,
  );
  assert.match(
    list,
    /type FileManagerListDensity = "comfortable" \| "compact"/,
  );
  assert.match(
    list,
    /export type FileManagerListColumn =[\s\S]*"size"[\s\S]*"modified"[\s\S]*"type"[\s\S]*"permissions"[\s\S]*"owner"/,
  );
  assert.match(list, /type FileManagerDisplayMode = "list" \| "grid"/);
  assert.match(
    list,
    /type FileManagerResizableColumn = "name" \| FileManagerListColumn/,
  );
  assert.match(list, /type FileManagerColumnWidths/);
  assert.match(list, /FILE_MANAGER_DEFAULT_COLUMNS/);
  assert.match(list, /FILE_MANAGER_DEFAULT_COLUMN_WIDTHS/);
  assert.match(list, /permissions: 142/);
  assert.match(list, /owner: 112/);
  assert.match(list, /\{ id: "permissions", label: "权限" \}/);
  assert.match(list, /\{ id: "owner", label: "Owner" \}/);
  assert.match(list, /entry\.permissions/);
  assert.match(list, /entry\.uid \?\? "—"/);
  assert.match(list, /key === "permissions"/);
  assert.match(list, /key === "owner"/);
  assert.match(list, /FILE_MANAGER_COLUMN_LIMITS/);
  assert.match(list, /summarizeFileManagerSelection/);
  assert.match(list, /summarizeBulkSelection/);
  assert.match(list, /data-file-manager-bulk-selection-summary/);
  assert.match(list, /data-file-manager-selection-summary/);
  assert.match(list, /onMarqueeSelect/);
  assert.match(page, /selectMarqueePaths/);
  assert.match(page, /onMarqueeSelect=\{selectMarqueePaths\}/);
  assert.match(list, /data-file-manager-marquee-selection-surface/);
  assert.match(list, /data-file-manager-marquee-selection-rect/);
  assert.match(list, /getBoundingClientRect\(\)/);
  assert.match(list, /rectsIntersect/);
  assert.match(list, /normalizeRect/);
  assert.match(list, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(list, /data-file-manager-entry-checkbox-affordance/);
  assert.match(list, /opacity-0 transition-opacity/);
  assert.match(list, /group-hover\/file-row:opacity-100/);
  assert.match(list, /\.slice\(0, 3\)/);
  assert.match(list, /等 \$\{entries\.length\} 项/);
  assert.doesNotMatch(
    list,
    /selectedEntries\.map\(\(entry\) => entry\.name\)\.join/,
  );
  assert.doesNotMatch(list, /selectedStatus\.names/);
  assert.match(list, /已选 \{selectedStatus\.count\} 项/);
  assert.match(list, /未选择项目/);
  assert.match(list, /gridTemplateColumns/);
  assert.match(list, /data-file-manager-responsive-footer/);
  assert.match(list, /data-file-manager-mobile-list-settings/);
  assert.match(list, /data-file-manager-mobile-list-settings-body/);
  assert.match(list, /data-file-manager-mobile-column-settings/);
  assert.match(list, /data-file-manager-column-menu/);
  assert.match(list, /data-file-manager-reset-columns/);
  assert.match(list, /resetColumns/);
  assert.match(list, /data-file-manager-desktop-list-footer/);
  assert.match(list, /列表设置/);
  assert.match(list, /桌面列/);
  assert.match(list, /group-open:grid/);
  assert.match(list, /const LazyRichFileTypeIcon = React\.lazy/);
  assert.match(list, /import\("\.\/FileTypeIcon"\)/);
  assert.match(list, /useFullFileTypeIcons/);
  assert.match(list, /requestIdleCallback/);
  assert.match(list, /data-file-manager-file-type-icon="native"/);
  assert.doesNotMatch(list, /@react-symbols\/icons\/utils/);
  assert.doesNotMatch(fileTypeIcon, /@react-symbols\/icons/);
  assert.match(fileTypeIcon, /pretty-file-icons\/index\.json/);
  assert.match(fileTypeIcon, /pretty-file-icons\/svg\/\*\.svg/);
  assert.match(fileTypeIcon, /import\.meta\.glob/);
  assert.match(fileTypeIcon, /extensionIconMap/);
  assert.match(fileTypeIcon, /loading="lazy"/);
  assert.match(fileTypeIcon, /data-file-manager-file-type-icon/);
  assert.doesNotMatch(list, /FILE_ICON_EXTENSIONS/);
  assert.doesNotMatch(list, /getFileTypeIconDescriptor/);
  assert.match(chrome, /data-file-manager-actions-menu/);
  assert.match(chrome, /data-file-manager-mobile-navigation/);
  assert.doesNotMatch(chrome, /data-file-manager-mobile-action-dock/);
  assert.doesNotMatch(chrome, /data-file-manager-mobile-action-sheet/);
  assert.doesNotMatch(chrome, /data-file-manager-mobile-root-select/);
  assert.doesNotMatch(chrome, /data-file-manager-mobile-view-select/);
  assert.doesNotMatch(chrome, /data-file-manager-mobile-action-selects/);
  assert.doesNotMatch(chrome, /data-file-manager-mobile-primary-actions/);
  assert.match(chrome, /data-file-manager-actions-popover/);
  assert.match(chrome, /sm:absolute sm:inset-auto/);
  assert.doesNotMatch(chrome, /当前视图/);
  assert.doesNotMatch(chrome, /<option value="files">文件列表<\/option>/);
  assert.doesNotMatch(chrome, /<option value="index">内容索引<\/option>/);
  assert.doesNotMatch(chrome, /<option value="trash">回收站<\/option>/);
  assert.match(chrome, /mode === "files"/);
  assert.match(chrome, /mode === "index"/);
  assert.match(chrome, /回收/);
  assert.doesNotMatch(
    chrome,
    /HardDrive className="size-4" \/>[\s\S]*文件[\s\S]*Database className="size-4" \/>[\s\S]*索引[\s\S]*Trash2 className="size-4" \/>[\s\S]*回收站/,
  );
  assert.doesNotMatch(chrome, /type="button"\s+type="button"/);
  assert.match(chrome, /data-file-manager-actions-popover/);
  assert.doesNotMatch(chrome, /data-file-manager-mobile-actions/);
  assert.doesNotMatch(chrome, /mobileActionsOpen/);
  assert.doesNotMatch(chrome, /aria-label="上传"/);
  assert.doesNotMatch(chrome, /文件操作/);
  assert.doesNotMatch(chrome, /上传 · 新建 · 视图/);
  assert.doesNotMatch(chrome, /低频命令收纳到底部/);
  assert.match(
    chrome,
    /fixed inset-x-3 bottom-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/,
  );
  assert.match(chrome, /max-h-\[min\(72dvh,520px\)\]/);
  assert.match(chrome, /htmlFor="file-manager-root"/);
  assert.doesNotMatch(
    chrome,
    /data-file-manager-mobile-action-dock[\s\S]*xl:hidden/,
  );
  assert.match(chrome, /data-file-manager-visible-filter-actions/);
  assert.match(
    chrome,
    /hidden min-w-0 flex-wrap items-center gap-1.5 text-xs xl:flex/,
  );
  assert.match(page, /搜索与统计/);
  assert.match(list, /data-file-manager-responsive-header/);
  assert.match(list, /data-file-manager-list-scrollport/);
  assert.match(list, /FILE_MANAGER_VIRTUALIZATION_THRESHOLD/);
  assert.match(list, /FILE_MANAGER_VIRTUALIZATION_OVERSCAN/);
  assert.match(list, /FILE_MANAGER_ROW_HEIGHT/);
  assert.match(list, /virtualListEnabled/);
  assert.match(list, /virtualWindow/);
  assert.match(list, /data-file-manager-rendered-count/);
  assert.match(list, /data-file-manager-total-count/);
  assert.match(list, /data-file-manager-virtual-window/);
  assert.match(list, /data-file-manager-windowing="fixed-row-overscan"/);
  assert.match(list, /data-file-manager-virtual-spacer="top"/);
  assert.match(list, /data-file-manager-virtual-spacer="bottom"/);
  assert.match(list, /data-file-manager-mobile-meta/);
  assert.match(list, /overflow-y-auto overflow-x-hidden/);
  assert.match(list, /grid-cols-\[36px_minmax\(0,1fr\)_44px\]/);
  assert.match(
    list,
    /sm:\[grid-template-columns:var\(--file-row-desktop-columns\)\]/,
  );
  assert.match(list, /hidden text-muted sm:block/);
  assert.match(page, /selectedPaths/);
  assert.match(page, /toggleAllVisible/);
  assert.match(page, /getEntryRange/);
  assert.match(page, /lastSelectedPath/);
  assert.match(page, /focusRelativeEntry/);
  assert.match(page, /handleFileManagerKeyDown/);
  assert.match(page, /isEditableEventTarget/);
  assert.match(
    page,
    /event\.key === " "[\s\S]*selectedEntry\?\.kind === "file"/,
  );
  assert.match(page, /openFilePreview\(selectedEntry\)/);
  assert.match(page, /isInteractiveShortcutTarget/);
  assert.match(page, /event\.key === "F2"/);
  assert.match(page, /event\.key === "Delete"/);
  assert.match(page, /event\.key === "F5"/);
  assert.match(page, /fileManagerFilterRef/);
  assert.match(page, /event\.altKey && event\.key === "ArrowUp"/);
  assert.match(page, /event\.key === "F3"/);
  assert.match(page, /fileManagerFilterRef\.current\?\.focus\(\)/);
  assert.match(
    page,
    /mod && event\.shiftKey && event\.key\.toLowerCase\(\) === "n"/,
  );
  assert.match(page, /setDialog\(\{ kind: "newDir" \}\)/);
  assert.match(
    page,
    /mod && !event\.shiftKey && event\.key\.toLowerCase\(\) === "n"/,
  );
  assert.match(page, /setDialog\(\{ kind: "newFile" \}\)/);
  assert.match(
    chrome,
    /filterInputRef\?: React\.RefObject<HTMLInputElement \| null>/,
  );
  assert.match(chrome, /ref=\{filterInputRef\}/);
  assert.match(page, /event\.key\.toLowerCase\(\) === "a"/);
  assert.match(page, /FileClipboardState/);
  assert.match(page, /fileClipboard/);
  assert.match(page, /copySelectionToFileClipboard\("copy"\)/);
  assert.match(page, /copySelectionToFileClipboard\("move"\)/);
  assert.match(page, /pasteFileClipboardToCurrentDirectory\(\)/);
  assert.match(page, /event\.altKey && event\.key === "ArrowUp"/);
  assert.match(page, /event\.key === "F3"/);
  assert.match(page, /filterInputRef=\{fileManagerFilterRef\}/);
  assert.match(page, /event\.key\.toLowerCase\(\) === "n"/);
  assert.match(page, /event\.shiftKey && event\.key\.toLowerCase\(\) === "n"/);
  assert.match(page, /copySelectionToFileClipboard/);
  assert.match(page, /FileClipboardState/);
  assert.match(page, /event\.key\.toLowerCase\(\) === "u"/);
  assert.match(workspaceExplorer, /WorkspaceFileClipboardState/);
  assert.match(workspaceExplorer, /copySelectionToFileClipboard\("copy"\)/);
  assert.match(workspaceExplorer, /copySelectionToFileClipboard\("move"\)/);
  assert.match(workspaceExplorer, /pasteFileClipboardToCurrentDirectory\(\)/);
  assert.match(list, /data-file-manager-keyboard-scope="list-grid"/);
  assert.match(list, /useScrollSelectedFileIntoView/);
  assert.match(list, /scrollIntoView/);
  assert.match(list, /block: "nearest"/);
  assert.match(list, /inline: "nearest"/);
  assert.match(list, /data-file-manager-entry-path=\{entry\.path\}/);
  assert.match(
    list,
    /aria-label="文件列表；方向键移动，Shift\+方向键范围选择，空格勾选，Ctrl\+A 全选，Enter 打开，Shift\+F10 打开菜单"/,
  );
  assert.match(list, /handlePanelKeyDown/);
  assert.match(list, /isFileListInteractiveTarget/);
  assert.match(list, /focusEntryAtIndex/);
  assert.match(list, /openSelectedKeyboardMenu/);
  assert.match(list, /event\.key === "ArrowDown"/);
  assert.match(list, /event\.key === "ArrowUp"/);
  assert.match(list, /event\.key === "Home"/);
  assert.match(list, /event\.key === "End"/);
  assert.match(list, /event\.key === "PageDown"/);
  assert.match(list, /event\.key === "PageUp"/);
  assert.match(list, /event\.key === "Enter"/);
  assert.match(list, /event\.key === " "/);
  assert.match(list, /onTogglePath\(selectedEntry\.path\)/);
  assert.match(list, /event\.key\.toLowerCase\(\) === "a"/);
  assert.match(list, /onSelectAllVisible\(\)/);
  assert.match(list, /data-file-manager-marquee-selection-surface/);
  assert.match(list, /data-file-manager-marquee-selection-rect/);
  assert.match(list, /event\.key === "Escape"/);
  assert.match(
    list,
    /focusEntryAtIndex\([\s\S]*currentIndex < 0 \? 0 : currentIndex \+ 1,[\s\S]*event\.shiftKey/,
  );
  assert.match(
    list,
    /focusEntryAtIndex\([\s\S]*currentIndex < 0 \? 0 : currentIndex - 1,[\s\S]*event\.shiftKey/,
  );
  assert.match(list, /onSelect\(entry, \{ range: true \}\)/);
  assert.match(list, /event\.shiftKey/);
  assert.match(list, /event\.key === "ContextMenu"/);
  assert.match(list, /event\.shiftKey && event\.key === "F10"/);
  assert.match(list, /onOpenContextMenu/);
  assert.match(list, /selectedEntry/);
  assert.match(
    list,
    /target\.closest\([\s\S]*input,textarea,select,button,a,label,summary,\[role='menuitem'\]/,
  );
  assert.match(list, /打开 \${entry\.name} 的操作菜单/);
  assert.match(chrome, /搜索当前目录/);
  assert.match(chrome, /编辑文件夹路径，按 Enter 跳转/);
  assert.match(page, /jumpToPathInput/);
  assert.match(page, /resolvePathInput/);
  assert.match(page, /absoluteDisplayPath/);
  assert.match(chrome, /根目录/);
  assert.match(chrome, /上级目录/);
  assert.match(chrome, /任意绝对路径/);
  assert.match(page, /systemRoot/);
  assert.match(page, /RECENT_PATHS_STORAGE_KEY/);
  assert.match(page, /FAVORITE_PATHS_STORAGE_KEY/);
  assert.match(page, /loadRecentFileManagerLocations/);
  assert.match(page, /rememberFileManagerLocation/);
  assert.match(page, /loadFavoriteFileManagerLocations/);
  assert.match(page, /rememberFavoriteFileManagerLocation/);
  assert.match(page, /buildQuickLocations/);
  assert.match(page, /buildPathSuggestions/);
  assert.match(page, /pathSuggestionsOpen/);
  assert.match(chrome, /Tab 补全/);
  assert.match(chrome, /路径建议/);
  assert.match(page, /activePathSuggestionIndex/);
  assert.match(page, /setActivePathSuggestionIndex/);
  assert.match(chrome, /role="combobox"/);
  assert.match(chrome, /aria-autocomplete="list"/);
  assert.match(chrome, /aria-activedescendant=\{activeSuggestionId\}/);
  assert.match(chrome, /data-file-manager-path-suggestion-listbox/);
  assert.match(chrome, /role="listbox"/);
  assert.match(chrome, /role="option"/);
  assert.match(chrome, /event\.key === "ArrowDown"/);
  assert.match(chrome, /event\.key === "ArrowUp"/);
  assert.match(chrome, /onAcceptPathSuggestion\(activeSuggestion\)/);
  assert.match(chrome, /收藏当前位置/);
  assert.match(chrome, /data-file-manager-copy-current-path/);
  assert.match(chrome, /复制当前路径/);
  assert.match(page, /copyCurrentPath/);
  assert.match(page, /copyPathToClipboard/);
  assert.match(page, /copyTextToClipboard\(path\)/);
  assert.match(page, /navigator\.clipboard\?\.writeText/);
  assert.match(page, /document\.execCommand\("copy"\)/);
  assert.match(page, /路径已复制/);
  assert.match(chrome, /移除收藏/);
  assert.match(chrome, /data-file-manager-quick-locations/);
  assert.match(chrome, /快速访问/);
  assert.match(chrome, /data-file-manager-favorite-locations/);
  assert.match(chrome, /收藏/);
  assert.match(chrome, /data-file-manager-recent-locations/);
  assert.match(chrome, /最近/);
  assert.match(chrome, /data-file-manager-clear-recent-locations/);
  assert.match(chrome, /清空最近路径/);
  assert.match(chrome, /清空最近/);
  assert.match(page, /favoriteLocationViews/);
  assert.match(page, /recentLocationViews/);
  assert.match(page, /clearRecentLocations/);
  assert.match(page, /storeRecentFileManagerLocations\(\[\]\)/);
  assert.match(page, /最近路径已清空/);
  assert.match(page, /路径不可访问/);
  assert.match(page, /data-file-manager-path-error-recovery/);
  assert.match(page, /返回上个可用目录/);
  assert.match(page, /回到根目录/);
  assert.match(page, /复制失败路径/);
  assert.match(page, /失败路径已复制/);
  assert.match(page, /PAGE_SIZE = 240/);
  assert.match(chrome, />\s*新建文件\s*</);
  assert.match(chrome, />\s*新建目录\s*</);
  assert.match(chrome, /上传到当前目录/);
  assert.match(page, /BulkActionBar/);
  assert.doesNotMatch(page, /function BulkActionBar/);
  assert.match(list, /fileCount/);
  assert.match(list, /directoryCount/);
  assert.match(list, /selectedBytes/);
  assert.match(list, /危险操作/);
  assert.match(list, /data-file-manager-bulk-desktop/);
  assert.match(list, /data-file-manager-bulk-command-bar/);
  assert.match(list, /data-file-manager-bulk-primary-action="copy"/);
  assert.match(list, /data-file-manager-bulk-primary-action="move"/);
  assert.match(list, /data-file-manager-bulk-primary-action="download"/);
  assert.match(list, /data-file-manager-bulk-overflow/);
  assert.match(list, /data-file-manager-bulk-overflow-menu/);
  assert.match(list, /function BulkOverflowMenu/);
  assert.match(list, /function BulkOverflowAction/);
  assert.match(list, /data-file-manager-bulk-danger-action="delete"/);
  assert.match(list, /flex min-w-0 flex-nowrap items-center gap-2/);
  assert.match(list, /data-file-manager-bulk-mobile-sheet/);
  assert.match(list, /data-file-manager-mobile-bulk-actions/);
  assert.match(list, /data-file-manager-mobile-bulk-more/);
  assert.match(list, /aria-label="更多批量操作"/);
  assert.match(list, /bottom-\[calc\(100%\+0\.5rem\)\]/);
  assert.match(list, /function MobileBulkAction/);
  assert.match(list, /safe-area-inset-bottom/);
  assert.match(list, /canRename/);
  assert.match(list, />\s*重命名\s*</);
  assert.match(list, /export function formatBytes/);
  assert.doesNotMatch(page, /function FileListPanel/);
  assert.match(page, /OperationHistoryPanel/);
  assert.doesNotMatch(page, /data-file-manager-workflow-hint/);
  assert.doesNotMatch(page, /文件预览\/编辑采用独立弹窗工作台/);
  assert.ok(
    page.indexOf("<FileListPanel") < page.indexOf("<OperationHistoryPanel"),
    "mobile-first file list must render before history/hints",
  );
  assert.match(page, /FileOperationRecord/);
  assert.match(page, /createOperationRecord/);
  assert.match(page, /loadFileOperationRecords/);
  assert.match(page, /storeFileOperationRecords/);
  assert.match(operationHistory, /OPERATION_HISTORY_STORAGE_KEY/);
  assert.match(operationHistory, /export function loadFileOperationRecords/);
  assert.match(operationHistory, /export function storeFileOperationRecords/);
  assert.match(operationHistory, /function OperationRecordDetails/);
  assert.match(operationHistory, /function copyOperationHistory/);
  assert.match(
    operationHistory,
    /searchOperationHistory|搜索操作历史|matchOperationRecord/,
  );
  assert.match(operationHistory, /summarizeOperationRecords/);
  assert.match(operationHistory, /function summarizeOperationPaths/);
  assert.match(operationHistory, /data-file-manager-operation-path-summary/);
  assert.doesNotMatch(
    operationHistory,
    /title=\{record\.affectedPaths\.join\("\\n"\)\}/,
  );
  assert.match(operationHistory, /data-file-manager-operation-history-mobile/);
  assert.match(operationHistory, /data-file-manager-operation-history-desktop/);
  assert.match(
    operationHistory,
    /data-file-manager-operation-history-controls/,
  );
  assert.match(operationHistory, /<details className=/);
  assert.match(operationHistory, /onRevealPath/);
  assert.match(operationHistory, /复制当前结果/);
  assert.match(operationHistory, /复制错误报告/);
  assert.match(operationHistory, /导出 CSV/);
  assert.match(operationHistory, /durationMs/);
  assert.match(operationHistory, /平均耗时/);
  assert.match(operationHistory, /formatDuration/);
  assert.match(operationHistory, /copyOperationFailures/);
  assert.match(operationHistory, /exportOperationHistoryCsv/);
  assert.match(operationHistory, /escapeCsvCell/);
  assert.match(operationHistory, /错误报告已复制/);
  assert.match(operationHistory, /操作历史 CSV 已复制/);
  assert.match(operationHistory, /normalizeFileOperationRecord/);
  assert.match(operationHistory, /路径已复制/);
  assert.match(operationHistory, /操作结果/);
  assert.match(operationHistory, /影响路径/);
  assert.match(operationHistory, /定位/);
  assert.match(operationHistory, /清空记录/);
  assert.match(page, /revealOperationPath/);
  assert.match(page, /previewTabs/);
  assert.match(page, /activePreviewTabId/);
  assert.match(page, /createFilePreviewTabId/);
  assert.match(page, /setPreviewTabs/);
  assert.match(page, /selectPreviewTab/);
  assert.match(page, /closePreviewTab/);
  assert.match(page, /closePreviewWindow/);
  assert.match(page, /openFilePreview/);
  assert.match(page, /onOpenFile=\{openFilePreview\}/);
  assert.match(page, /function extensionOf/);
  assert.match(searchPanel, /onOpenFile: \(entry: FileSearchResult\) => void/);
  assert.match(searchPanel, /onOpenFile\(result\)/);
  assert.match(searchPanel, /预览 \/ 编辑/);
  assert.match(page, /normalizeOperationPath/);
  assert.match(page, /const LazyFileManagerActionDialog = React\.lazy/);
  assert.match(page, /import\("\.\/FileManagerActionDialog"\)/);
  assert.match(page, /LazyFileManagerActionDialog/);
  assert.match(page, /文件操作面板加载中/);
  assert.doesNotMatch(page, /import \{ FileManagerActionDialog \} from/);
  assert.doesNotMatch(page, /function FileManagerActionDialog/);
  assert.match(actionDialog, /export function FileManagerActionDialog/);
  assert.match(actionDialog, /deletePermanently/);
  assert.match(actionDialog, /\.openclaw\/\.tracevane\/trash/);
  assert.match(actionDialog, /永久删除/);
  assert.match(actionDialog, /permanent: deletePermanently/);
  assert.match(actionDialog, /dryRunFileTransfer/);
  assert.match(actionDialog, /TransferDryRunSummary/);
  assert.match(actionDialog, /服务端预检/);
  assert.match(actionDialog, /输入 DELETE 确认删除/);
  assert.match(actionDialog, /transferConflictPolicy/);
  assert.match(actionDialog, /export type FileManagerDialog/);
  assert.doesNotMatch(
    page,
    /import \{ FilePreviewDialog \} from "\.\/FilePreviewPanel"/,
  );
  assert.match(page, /const LazyFilePreviewDialog = React\.lazy/);
  assert.match(page, /LazyFilePreviewDialog/);
  assert.match(previewPanel, /class FilePreviewErrorBoundary/);
  assert.match(previewPanel, /data-file-preview-error-boundary/);
  assert.match(previewPanel, /componentDidCatch/);
  assert.match(previewPanel, /已阻止页面整体空白/);
  assert.match(page, /FileManagerModalLoading/);
  assert.match(page, /data-file-manager-modal-loading/);
  assert.doesNotMatch(page, /import \{ FilePreviewDialog \} from/);
  assert.match(page, /FilePropertiesDialog/);
  assert.match(page, /@\/features\/workspace\/shared\/FilePropertiesDialog/);
  assert.doesNotMatch(page, /\.\/FilePropertiesDialog/);
  assert.match(page, /propertiesTarget/);
  assert.match(page, /openFileProperties/);
  assert.match(page, /onPropertiesRequest=\{\(target\)/);
  assert.match(
    page,
    /event\.altKey && event\.key === "Enter" && selectedEntry/,
  );
  assert.match(page, /fileEntryFromMenuTarget/);
  assert.match(
    actionsMenu,
    /onPropertiesRequest\?: \(target: FileActionsMenuTarget\) => void/,
  );
  assert.match(actionsMenu, /label="属性"/);
  assert.match(actionsMenu, /移入回收站/);
  assert.match(actionsMenu, /\.openclaw\/\.tracevane\/trash/);
  assert.match(propertiesDialog, /export function FilePropertiesDialog/);
  assert.match(propertiesDialog, /基本信息/);
  assert.match(propertiesDialog, /复制相对路径/);
  assert.match(propertiesDialog, /复制显示路径/);
  assert.match(propertiesDialog, /目录大小未计算/);
  assert.match(propertiesDialog, /权限/);
  assert.match(propertiesDialog, /UID \/ GID/);
  assert.match(page, /activePreviewPath/);
  assert.match(page, /previewEntry/);
  assert.match(page, /previewFileRead/);
  assert.match(page, /onPreviewRequest=\{\(target\)/);
  assert.match(
    actionsMenu,
    /onPreviewRequest\?: \(target: FileActionsMenuTarget\) => void/,
  );
  assert.match(actionsMenu, /label="检查文件（弹窗）"/);
  assert.doesNotMatch(actionsMenu, /label="预览 \/ 编辑（弹窗）"/);
  assert.match(previewPanel, /DocumentWorkbench/);
  assert.match(previewPanel, /FilePreviewTabStrip/);
  assert.match(previewPanel, /data-file-preview-tab-strip/);
  assert.match(previewPanel, /data-file-preview-tab=\{tab\.id\}/);
  assert.match(previewPanel, /role="tablist"/);
  assert.match(previewPanel, /onSelectTab\?\.\(tab\.id\)/);
  assert.match(previewPanel, /onCloseTab\?\.\(tab\.id\)/);
  assert.doesNotMatch(previewPanel, /role="button"/);
  assert.match(previewPanel, /可多标签打开文件/);
  assert.match(previewPanel, /type DocumentWorkbenchMode/);
  assert.match(previewPanel, /viewModeLabel/);
  assert.match(previewPanel, /onModeChange=\{setViewMode\}/);
  assert.match(previewPanel, /event\.key\.toLowerCase\(\) !== "s"/);
  assert.match(previewPanel, /● 未保存/);
  assert.match(previewPanel, /rootId=\{rootId\}/);
  assert.match(previewPanel, /contentOffset=\{read\?\.contentOffset\}/);
  assert.match(previewPanel, /contentBytes=\{read\?\.contentBytes\}/);
  assert.match(previewPanel, /mimeType=\{read\?\.mimeType\}/);
  assert.doesNotMatch(previewPanel, /function FilePreviewSurface/);
  assert.match(documentWorkbench, /CodeEditor/);
  assert.match(documentWorkbench, /TextSearchReplaceStrip/);
  assert.doesNotMatch(previewPanel, /function SearchReplaceStrip/);
  assert.doesNotMatch(previewPanel, /function countTextMatches/);
  assert.doesNotMatch(previewPanel, /function replaceText/);
  assert.match(textSearchReplace, /export function TextSearchReplaceStrip/);
  assert.match(textSearchReplace, /countTextMatches/);
  assert.match(textSearchReplace, /replaceText/);
  assert.match(textSearchReplace, /同标签页查找\/替换/);
  assert.match(textSearchReplace, /审查全部/);
  assert.doesNotMatch(textSearchReplace, /预览全部/);
  assert.match(textSearchReplace, /确认全部替换/);
  assert.match(textSearchReplace, /替换前审查/);
  assert.match(textSearchReplace, /data-text-replace-preview/);
  assert.match(textSearchReplace, /ReplaceDiffPreview/);
  assert.match(textSearchReplace, /createReplaceDiffLines/);
  assert.match(textSearchReplace, /最多展示前 8 行差异/);
  assert.match(textSearchReplace, /支持代码高亮、Ctrl\/⌘\+F、批量替换/);
  assert.match(textSearchReplace, /export interface TextSearchState/);
  assert.match(textSearchReplace, /collectTextMatchRanges/);
  assert.match(documentWorkbench, /onSearchStateChange=\{setSearchState\}/);
  assert.match(
    documentWorkbench,
    /searchHighlights=\{showSearchReplace \? searchState : undefined\}/,
  );
  assert.match(previewPanel, /DocumentWorkbench/);
  assert.match(documentWorkbench, /DocumentPreview/);
  assert.match(documentWorkbench, /canRenderDocumentPreview/);
  assert.match(documentWorkbench, /export function DocumentWorkbench/);
  assert.doesNotMatch(previewPanel, /renderFilePreview/);
  assert.doesNotMatch(previewPanel, /MarkdownPreview/);
  assert.match(documentPreview, /export function DocumentPreview/);
  assert.match(documentPreview, /import \{ MarkdownPreview \} from/);
  assert.match(
    documentPreview,
    /<MarkdownPreview path=\{path\} rootId=\{rootId\} content=\{content\} \/>/,
  );
  assert.doesNotMatch(
    documentPreview,
    /React\.lazy\(\(\) =>\s*import\("@\/features\/workspace\/preview\/MarkdownPreview"/,
  );
  assert.match(documentPreview, /getDocumentViewer/);
  assert.match(documentViewRegistry, /DOCUMENT_VIEWERS/);
  assert.match(documentViewRegistry, /DOCUMENT_VISUAL_EDITORS/);
  assert.match(documentViewRegistry, /documentExtension/);
  assert.match(documentViewRegistry, /id: "json"/);
  assert.match(documentViewRegistry, /id: "csv"/);
  assert.match(documentViewRegistry, /isArchiveDocument/);
  assert.match(documentViewRegistry, /id: "binary"/);
  assert.match(documentPreview, /JsonPreview/);
  assert.match(documentPreview, /CsvPreview/);
  assert.match(documentPreview, /ArchivePreview/);
  assert.match(documentPreview, /TextSlicePreview/);
  assert.match(documentPreview, /BinaryFilePreview/);
  assert.match(documentPreview, /data-document-preview-kind="markdown"/);
  assert.match(documentPreview, /data-document-preview-kind="html"/);
  assert.match(documentPreview, /data-document-preview-kind="pdf"/);
  assert.match(documentPreview, /data-document-preview-kind="audio"/);
  assert.match(documentPreview, /data-document-preview-kind="archive"/);
  assert.match(documentPreview, /data-document-preview-kind="binary"/);
  assert.match(documentPreview, /previewKind="image"/);
  assert.match(documentPreview, /previewKind="video"/);
  assert.match(documentPreview, /data-document-preview-kind="json"/);
  assert.match(documentPreview, /data-document-preview-kind="csv"/);
  assert.match(binaryFilePreview, /Office \/ 文档文件/);
  assert.match(binaryFilePreview, /data-document-preview-kind/);
  assert.match(binaryFilePreview, /尝试浏览器打开/);
  assert.match(binaryFilePreview, /安全占位检查/);
  assert.doesNotMatch(binaryFilePreview, /安全占位预览/);
  assert.match(textSlicePreview, /仅渲染前/);
  assert.match(textSlicePreview, /data-document-preview-kind/);
  assert.match(textSlicePreview, /下一段/);
  assert.match(textSlicePreview, /尾部/);
  assert.match(archivePreview, /dryRunUnarchiveFile/);
  assert.match(archivePreview, /data-document-preview-kind/);
  assert.match(archivePreview, /data-archive-preview-items/);
  assert.match(archivePreview, /data-archive-preview-error/);
  assert.match(archivePreview, /仅检查前/);
  assert.doesNotMatch(archivePreview, /仅预览前/);
  assert.match(page, /useFileReadQuery/);
  assert.match(previewPanel, /useWriteFileContentMutation/);
  assert.match(previewPanel, /className\?: string/);
  assert.match(previewPanel, /文件详情/);
  assert.match(documentWorkbench, /label: "源码"/);
  assert.match(documentWorkbench, /label: "预览"/);
  assert.match(documentWorkbench, /data-document-workbench-preview-edit-toggle/);
  assert.doesNotMatch(documentWorkbench, /边写边预览/);
  assert.doesNotMatch(documentWorkbench, /预览时编辑/);
  assert.match(visualDocumentEditor, /DocumentEngineMarkdownEditor/);
  assert.match(visualDocumentEditor, /DocumentEngineHtmlEditor/);
  assert.doesNotMatch(visualDocumentEditor, /import Vditor from "vditor"/);
  assert.doesNotMatch(visualDocumentEditor, /data-markdown-vditor-host/);
  assert.doesNotMatch(visualDocumentEditor, /parseMarkdownBlocks/);
  assert.doesNotMatch(visualDocumentEditor, /MarkdownTaskListInlineEditor/);
  assert.doesNotMatch(visualDocumentEditor, /data-markdown-table-inline-editor/);
  assert.doesNotMatch(visualDocumentEditor, /data-markdown-task-list-inline-editor/);
  assert.doesNotMatch(visualDocumentEditor, /data-markdown-block-toolbar/);
  assert.match(previewPanel, /data-file-preview-path=\{entry\.path\}/);
  assert.match(packageJson, /smoke:file-manager:markdown-visual-editor/);
  assert.match(markdownVisualEditorSmoke, /data-document-engine-editor/);
  assert.match(markdownVisualEditorSmoke, /data-file-preview-path/);
  assert.match(markdownVisualEditorSmoke, /data-document-engine-editor/);
  assert.match(markdownVisualEditorSmoke, /milkdown-prosemirror/);
  assert.doesNotMatch(markdownVisualEditorSmoke, /__tracevaneVditor/);
  assert.match(markdownVisualEditorSmoke, /data-file-save-review-dialog/);
  assert.match(packageJson, /smoke:file-manager:html-editor/);
  assert.match(htmlEditorSmoke, /data-document-preview-kind="html"/);
  assert.doesNotMatch(htmlEditorSmoke, /data-split-source-editor/);
  assert.match(htmlEditorSmoke, /data-html-visual-editor-shell/);
  assert.match(htmlEditorSmoke, /data-html-visual-frame/);
  assert.match(htmlEditorSmoke, /data-html-visual-sync/);
  assert.match(
    htmlEditorSmoke,
    /Sandboxed HTML preview executed author script unexpectedly/,
  );
  assert.match(htmlEditorSmoke, /HTML visually edited title/);
  assert.match(htmlEditorSmoke, /data-file-save-review-dialog/);
  assert.match(packageJson, /smoke:file-manager:fallback-preview/);
  assert.match(fallbackPreviewSmoke, /data-document-preview-kind=\"pdf\"/);
  assert.match(fallbackPreviewSmoke, /data-pdf-preview-frame/);
  assert.match(fallbackPreviewSmoke, /data-pdf-preview-fallback/);
  assert.match(fallbackPreviewSmoke, /data-document-preview-kind=\"archive\"/);
  assert.match(fallbackPreviewSmoke, /data-archive-preview-items/);
  assert.match(fallbackPreviewSmoke, /data-archive-preview-error/);
  assert.match(fallbackPreviewSmoke, /data-document-preview-kind=\"binary\"/);
  assert.match(fallbackPreviewSmoke, /data-binary-preview-stage/);
  assert.match(fallbackPreviewSmoke, /data-binary-preview-actions/);
  assert.match(
    fallbackPreviewSmoke,
    /Mobile fallback preview has page overflow/,
  );
  assert.match(fallbackPreviewSmoke, /data-file-manager-modal-error-boundary/);
  assert.match(visualDocumentEditor, /DocumentEngineMarkdownEditor/);
  assert.match(visualDocumentEditor, /DocumentEngineHtmlEditor/);
  assert.doesNotMatch(visualDocumentEditor, /Mermaid 图表默认渲染/);
  assert.match(documentPreview, /buildFileDownloadUrl\(rootId, path, false\)/);
  assert.match(previewPanel, /打开预览/);
  assert.match(previewPanel, /保存修改/);
  assert.match(previewPanel, /Math\.max\([\s\S]*320,[\s\S]*window\.innerWidth/);
  assert.match(previewPanel, /lg:inline-flex/);
  assert.match(documentWorkbench, /flex-wrap/);
  assert.match(documentWorkbench, /overflow-x-auto/);
  assert.match(documentWorkbench, /data-document-workbench-toolbar/);
  assert.match(documentWorkbench, /data-document-workbench-mobile-mode-select/);
  assert.match(previewResilienceSmoke, /data-file-preview-dialog/);
  assert.match(previewResilienceSmoke, /data-file-preview-editor-shell/);
  assert.match(
    previewResilienceSmoke,
    /data-document-workbench-mobile-mode-select/,
  );
  assert.doesNotMatch(previewResilienceSmoke, /data-split-source-editor/);
  assert.match(previewResilienceSmoke, /articleCanScroll/);
  assert.match(
    previewResilienceSmoke,
    /scrollWidth > metrics\.innerWidth \+ 24/,
  );
  assert.match(previewResilienceSmoke, /toolbar\.height > 116/);
  assert.match(packageJson, /smoke:file-manager:large-directory/);
  assert.match(packageJson, /smoke:file-manager:file-operations/);
  assert.match(largeDirectorySmoke, /FILE_COUNT = 240/);
  assert.match(largeDirectorySmoke, /data-file-manager-root-select/);
  assert.match(largeDirectorySmoke, /selectOption\(rootId\)/);
  assert.match(largeDirectorySmoke, /data-file-manager-virtual-window/);
  assert.match(largeDirectorySmoke, /data-file-manager-rendered-count/);
  assert.match(largeDirectorySmoke, /data-file-manager-total-count/);
  assert.match(largeDirectorySmoke, /rendered too many DOM rows/);
  assert.match(largeDirectorySmoke, /Ctrl\+A should select all filtered rows/);
  assert.match(fileOperationsSmoke, /createFileViaUi/);
  assert.match(fileOperationsSmoke, /renameSelectedViaUi/);
  assert.match(fileOperationsSmoke, /transferSelectedViaUi\(page, 'copy'/);
  assert.match(fileOperationsSmoke, /transferSelectedViaUi\(page, 'move'/);
  assert.match(fileOperationsSmoke, /deleteSelectedViaUi/);
  assert.match(fileOperationsSmoke, /findTrashItem/);
  assert.match(fileOperationsSmoke, /data-file-manager-trash-restore/);
  assert.match(fileOperationsSmoke, /Operation history is missing/);
  assert.match(
    documentWorkbench,
    /data-document-workbench-desktop-mode-segments/,
  );
  assert.match(documentWorkbench, /aria-label="选择文件视图模式"/);
  assert.match(documentWorkbench, /sm:hidden/);
  assert.match(documentWorkbench, /sm:inline-flex/);
  assert.match(documentWorkbench, /sm:flex-wrap/);
  assert.match(documentWorkbench, /md:hidden/);
  assert.match(documentPreview, /mediaZoom/);
  assert.match(documentPreview, /MediaPreviewStage/);
  assert.match(documentPreview, /ImagePreviewButton/);
  assert.match(documentPreview, />缩小</);
  assert.match(documentPreview, />放大</);
  assert.match(documentPreview, />适应</);
  assert.match(documentPreview, /mediaFitStyle/);
  assert.match(documentPreview, /data-media-preview-scrollport/);
  assert.match(documentPreview, /data-media-preview-pan="free-canvas"/);
  assert.match(documentPreview, /handleMediaWheel/);
  assert.match(documentPreview, /zoomAtPoint/);
  assert.match(documentPreview, /clampMediaZoom/);
  assert.match(
    documentPreview,
    /previewKind !== "image" && !event\.ctrlKey && !event\.metaKey/,
  );
  assert.match(documentPreview, /setMediaPan/);
  assert.match(documentPreview, /viewportX - \(viewportX - pan\.x\) \* ratio/);
  assert.match(documentPreview, /viewportY - \(viewportY - pan\.y\) \* ratio/);
  assert.match(documentPreview, /handleMediaDoubleClick/);
  assert.match(documentPreview, /zoom === 1 \? 2 : 1/);
  assert.match(
    documentPreview,
    /data-media-preview-shortcuts="wheel,pinch,\+,\-,0,arrows,double-click,drag"/,
  );
  assert.match(documentPreview, /onDoubleClick=\{handleMediaDoubleClick\}/);
  assert.match(documentPreview, /startPan/);
  assert.match(documentPreview, /onPointerDown=\{startPan\}/);
  assert.match(documentPreview, /onPointerMove=\{pan\}/);
  assert.match(documentPreview, /panBy/);
  assert.match(documentPreview, /ArrowLeft/);
  assert.match(documentPreview, /ArrowRight/);
  assert.match(documentPreview, /ArrowUp/);
  assert.match(documentPreview, /ArrowDown/);
  assert.match(
    documentPreview,
    /x: state\.panX \+ event\.clientX - state\.startX/,
  );
  assert.match(
    documentPreview,
    /y: state\.panY \+ event\.clientY - state\.startY/,
  );
  assert.match(documentPreview, /releasePointerCapture/);
  assert.match(documentPreview, /cursor-grabbing select-none/);
  assert.match(documentPreview, /cursor-grab/);
  assert.match(documentPreview, /滚轮或双指缩放，拖拽可像无限画布一样自由移动/);
  assert.match(documentPreview, /activePointersRef/);
  assert.match(documentPreview, /pinchStateRef/);
  assert.match(documentPreview, /updatePinchState/);
  assert.match(
    documentPreview,
    /Math\.hypot\(second\.x - first\.x, second\.y - first\.y\)/,
  );
  assert.match(
    documentPreview,
    /pinch\.startZoom \* \(distance \/ pinch\.startDistance\)/,
  );
  assert.match(documentPreview, /双击切换 100%\/200%/);
  assert.match(documentPreview, /快捷缩放/);
  assert.match(documentPreview, /方向键平移/);
  assert.match(documentPreview, /data-media-preview-toolbar/);
  assert.match(documentPreview, /data-media-preview-mobile-more/);
  assert.match(documentPreview, /data-media-preview-mobile-tools/);
  assert.match(documentPreview, /data-media-preview-desktop-tools/);
  assert.match(documentPreview, /data-media-preview-zoom-label/);
  assert.match(documentPreview, /touch-none \[user-select:none\]/);
  assert.match(
    documentPreview,
    /previewKind !== "image" && "touch-pan-x touch-pan-y"/,
  );
  assert.match(documentPreview, /data-media-preview-canvas/);
  assert.match(documentPreview, /aria-label="展开媒体预览工具"/);
  assert.match(documentPreview, /sm:hidden/);
  assert.match(documentPreview, /sm:flex/);
  assert.match(documentPreview, /data-media-preview-image/);
  assert.match(documentPreview, /draggable=\{false\}/);
  assert.match(documentPreview, /data-media-preview-video/);
  assert.match(documentPreview, /objectFit: "contain"/);
  assert.match(
    documentPreview,
    /min-h-0 overflow-hidden overscroll-contain p-2 outline-none sm:p-4/,
  );
  assert.match(
    documentPreview,
    /grid min-h-full min-w-full place-items-center/,
  );
  assert.match(documentPreview, /data-media-preview-free-transform/);
  assert.match(documentPreview, /data-media-preview-zoom=\{zoom\}/);
  assert.match(documentPreview, /data-media-preview-pan-x=\{mediaPan\.x\}/);
  assert.match(documentPreview, /data-media-preview-pan-y=\{mediaPan\.y\}/);
  assert.match(
    documentPreview,
    /transform: `translate\(\$\{mediaPan\.x\}px, \$\{mediaPan\.y\}px\) scale\(\$\{zoom\}\)`/,
  );
  assert.match(documentPreview, /transformOrigin: "center center"/);
  assert.match(documentPreview, /will-change-transform/);
  assert.match(mediaPreviewSmoke, /readPan/);
  assert.match(mediaPreviewSmoke, /readZoom/);
  assert.match(mediaPreviewSmoke, /Drag pan should move freely on both axes/);
  assert.match(
    mediaPreviewSmoke,
    /Double-click zoom should toggle from 100% to close to 200%/,
  );
  assert.match(
    mediaPreviewSmoke,
    /Fit\/reset should restore 100% and centered pan/,
  );
  assert.match(
    mediaPreviewSmoke,
    /Final fit\/reset should restore 100% and centered pan/,
  );
  assert.match(
    mediaPreviewSmoke,
    /page\.setViewportSize\(\{ width: 390, height: 844 \}\)/,
  );
  assert.match(
    mediaPreviewSmoke,
    /Mobile media preview should not cause horizontal document overflow/,
  );
  assert.match(
    mediaPreviewSmoke,
    /Mobile media scrollport should stay usable within viewport/,
  );
  assert.match(mediaPreviewSmoke, /data-media-preview-mobile-tools/);
  assert.match(visualDocumentEditor, /DocumentEngineMarkdownEditor/);
  const htmlEngineEditor = read("apps/web/src/features/document-engine/html/DocumentEngineHtmlEditor.tsx");
  assert.match(htmlEngineEditor, /data-document-engine-editor="html-visual"/);
  assert.match(htmlEngineEditor, /data-html-visual-editor-shell/);
  assert.match(htmlEngineEditor, /data-html-visual-frame/);
  assert.match(htmlEngineEditor, /data-html-visual-sync/);
  assert.match(htmlEngineEditor, /doc\.designMode = editable \? "on" : "off"/);
  const milkdownEditor = read("apps/web/src/features/document-engine/editor/MilkdownMarkdownEditor.tsx");
  assert.match(milkdownEditor, /document-engine-milkdown/);
  assert.match(milkdownEditor, /min-h-0 min-w-0/);
  assert.match(milkdownEditor, /data-document-engine-milkdown-scrollport/);
  assert.match(milkdownEditor, /\[&_\.ProseMirror\]:min-h-\[360px\]/);
  assert.match(documentPreview, /isVideoDocument/);
  assert.match(documentPreview, /isAudioDocument/);
  assert.match(documentPreview, /isPdfDocument/);
  assert.match(documentPreview, /PdfPreviewStage/);
  assert.match(documentPreview, /data-pdf-preview-stage/);
  assert.match(documentPreview, /data-pdf-preview-toolbar/);
  assert.match(documentPreview, /data-pdf-preview-frame/);
  assert.match(documentPreview, /isNativePdfViewerProbablyEnabled/);
  assert.match(documentPreview, /pdfViewerEnabled/);
  assert.match(documentPreview, /<object[\s\S]*type="application\/pdf"/);
  assert.match(documentPreview, /data-pdf-preview-fallback/);
  assert.match(documentPreview, /PDF 内嵌预览不可用/);
  assert.match(documentPreview, /AudioPreviewStage/);
  assert.match(documentPreview, /data-audio-preview-stage/);
  assert.equal(
    (documentPreview.match(/data-document-preview-kind="audio"/g) ?? []).length,
    1,
  );
  assert.match(documentPreview, /preload="metadata"/);
  assert.match(documentPreview, /data-audio-preview-player/);
  assert.match(documentPreview, /iframe/);
  assert.match(documentPreview, /<video[\s\S]*src=\{resolvedDownloadUrl\}/);
  assert.match(documentPreview, /<audio[\s\S]*src=\{downloadUrl\}/);
  assert.match(documentPreview, /buildFileDownloadUrl/);
  assert.equal(
    fs.existsSync(path.join(rootDir, "apps/web/src/lib/api/chat.ts")),
    false,
  );
  assert.match(binaryFilePreview, /data-binary-preview-stage/);
  assert.match(binaryFilePreview, /data-binary-preview-actions/);
  assert.match(actionDialog, /打包所选项目/);
  assert.match(actionDialog, /重命名项目/);
  assert.match(actionDialog, /ops\.rename/);
  assert.match(actionDialog, /确认重命名/);
  assert.match(actionDialog, /快捷键 F2/);
  assert.match(actionDialog, /复制所选项目/);
  assert.match(actionDialog, /移动所选项目/);
  assert.match(actionDialog, /删除所选项目/);
  assert.match(actionDialog, /修改权限/);
  assert.match(actionDialog, /dryRunChmodFiles/);
  assert.match(actionDialog, /chmodFiles/);
  assert.match(actionDialog, /defaultPermissionMode/);
  assert.match(actionDialog, /displayDir/);
  assert.match(actionDialog, /ChmodDryRunSummary/);
  assert.match(actionDialog, /权限使用八进制模式/);
  assert.match(actionDialog, /递归应用到目录下所有子项/);
  assert.match(actionDialog, /应用权限/);
  assert.match(list, /onChmod/);
  assert.match(list, /权限/);
  assert.match(page, /setDialog\(\{ kind: "chmod" \}\)/);
  assert.match(page, /selectedEntries=\{selectedList\}/);
  assert.match(actionDialog, /deleteConfirmText/);
  assert.match(actionDialog, /deleteRequiresTypedConfirm/);
  assert.match(actionDialog, /deleteConfirmed/);
  assert.match(actionDialog, /deleteConfirmText\.trim\(\) === "DELETE"/);
  assert.match(actionDialog, /输入 DELETE 确认删除/);
  assert.match(actionDialog, /危险操作：默认移入回收站/);
  assert.match(actionDialog, /summarizeActionSelection/);
  assert.match(actionDialog, /data-file-manager-action-selection-summary/);
  assert.match(actionDialog, /data-file-manager-action-selection-sample/);
  assert.match(actionDialog, /paths\.slice\(0, 8\)/);
  assert.doesNotMatch(actionDialog, /selectedPaths\.map\(\(path\) => \(/);
  assert.match(actionDialog, /确认按钮会在输入完全匹配 DELETE[\s\S]*后启用/);
  assert.match(page, /downloadSelectedArchive/);
  assert.match(page, /download-archive/);
  assert.match(actionDialog, /ops\.archive/);
  assert.match(actionDialog, /dryRunArchiveFiles/);
  assert.match(actionDialog, /ArchiveDryRunSummary/);
  assert.match(actionDialog, /data-file-manager-archive-dry-run/);
  assert.match(actionDialog, /data-file-manager-archive-target-conflict/);
  assert.match(actionDialog, /archivePreview\?\.destinationExists/);
  assert.match(actionDialog, /打包预检/);
  assert.match(actionDialog, /目标归档文件已经存在/);
  assert.match(actionDialog, /const preview = await dryRunArchiveFiles/);
  assert.match(actionDialog, /打包预检未通过/);
  assert.match(actionDialog, /dryRunFileTransfer/);
  assert.match(actionDialog, /transferFiles/);
  assert.doesNotMatch(actionDialog, /loadTransferDestinationEntries/);
  assert.doesNotMatch(actionDialog, /resolveTransferConflict/);
  assert.match(actionDialog, /TransferDryRunSummary/);
  assert.match(actionDialog, /const preview = await dryRunFileTransfer/);
  assert.match(actionDialog, /const preview = await dryRunUnarchiveFile/);
  assert.match(actionDialog, /解压预检仍存在阻塞冲突/);
  assert.match(actionDialog, /preview\.counts\.ready \+/);
  assert.match(actionDialog, /服务端预检/);
  assert.match(actionDialog, /存在阻塞冲突/);
  assert.match(actionDialog, /transferPreviewError/);
  assert.match(actionDialog, /transferPreview\?\.counts\.errors/);
  assert.match(actionDialog, /transferNeedsOverwriteConfirm/);
  assert.match(
    actionDialog,
    /transferOverwriteConfirm\.trim\(\) === "OVERWRITE"/,
  );
  assert.match(actionDialog, /data-file-manager-overwrite-confirm/);
  assert.match(actionDialog, /覆盖会替换/);
  assert.match(
    actionDialog,
    /\(isTransfer && \(!transferPreview \|\| transferPreviewBusy\)\)/,
  );
  assert.match(actionDialog, /TransferConflictPolicy/);
  assert.match(actionDialog, /UnarchiveConflictPolicy/);
  assert.match(page, /selectedArchiveEntry/);
  assert.match(list, /canUnarchive/);
  assert.match(list, /ArchiveRestore/);
  assert.match(page, /isSupportedArchiveName/);
  assert.match(page, /SUPPORTED_UNARCHIVE_EXTENSIONS/);
  assert.match(actionDialog, /dryRunUnarchiveFile/);
  assert.match(actionDialog, /UnarchiveDryRunSummary/);
  assert.match(actionDialog, /解压归档/);
  assert.match(actionDialog, /解压预检/);
  assert.match(actionDialog, /unarchivePreviewError/);
  assert.match(actionDialog, /unarchivePreview\?\.counts\.errors/);
  assert.match(actionDialog, /unarchiveNeedsOverwriteConfirm/);
  assert.match(
    actionDialog,
    /unarchiveOverwriteConfirm\.trim\(\) === "OVERWRITE"/,
  );
  assert.match(actionDialog, /overwriteConfirm:/);
  assert.match(
    actionDialog,
    /\(isUnarchive && \(!unarchivePreview \|\| unarchivePreviewBusy\)\)/,
  );
  assert.match(actionDialog, /存在阻塞冲突或不安全条目/);
  assert.match(actionDialog, /ops\.unarchive/);
  assert.match(actionDialog, /parentOf\(selectedArchivePath\)/);
  assert.match(actionDialog, /跳过：保留目标同名项/);
  assert.match(actionDialog, /保留两者：自动生成 name \(1\)\.ext/);
  assert.match(actionsMenu, /overwriteConfirm/);
  assert.match(actionsMenu, /请输入 OVERWRITE 确认/);
  assert.match(actionsMenu, /dryRunBusy/);
  assert.match(actionsMenu, /!dryRun/);
  assert.match(actionDialog, /ops\.remove/);
  assert.match(list, /加载更多/);
  assert.match(list, /名称/);
  assert.match(list, /大小/);
  assert.match(list, /修改时间/);
  assert.match(list, /类型/);
  assert.match(list, /aria-sort/);
  assert.match(list, /列表密度/);
  assert.match(list, /视图布局/);
  assert.match(list, /ResizableSortHeader/);
  assert.match(list, /cursor-col-resize/);
  assert.match(list, /document\.addEventListener\("mousemove"/);
  assert.equal(
    (
      list.match(
        /onResize\(column, state\.startWidth \+ moveEvent\.clientX - state\.startX\)/g,
      ) ?? []
    ).length,
    1,
  );
  assert.match(list, /onColumnWidthsChange/);
  assert.match(list, /draggingColumn/);
  assert.match(list, /onDragStart/);
  assert.match(list, /onDrop/);
  assert.match(list, /reorderColumn/);
  assert.match(list, /moveColumn/);
  assert.match(list, /aria-label=\{`显示\$\{column\.label\}列`\}/);
  assert.match(list, /拖拽或用 ↑↓ 调整可见列顺序/);
  assert.match(list, /orderedColumns/);
  assert.match(list, /FileRowColumn/);
  assert.match(list, /data-file-manager-column="size"/);
  assert.match(list, /data-file-manager-column="modified"/);
  assert.match(list, /data-file-manager-column="type"/);
  assert.match(list, /data-file-manager-column="permissions"/);
  assert.match(list, /data-file-manager-column="owner"/);
  assert.match(list, /FileGridCard/);
  assert.match(list, /FILE_MANAGER_ENTRY_DRAG_MIME/);
  assert.match(list, /parseFileManagerDragPayload/);
  assert.match(
    list,
    /event\.dataTransfer\.setData\([\s\S]*FILE_MANAGER_ENTRY_DRAG_MIME/,
  );
  assert.match(list, /onDropTransfer/);
  assert.match(list, /onDropUploadToDirectory/);
  assert.match(list, /isExternalFileDrag/);
  assert.match(list, /operation: "copy" \| "move" \| "upload"/);
  assert.match(list, /上传到此处/);
  assert.match(list, /onDropOnDirectory/);
  assert.match(list, /dropTarget/);
  assert.match(list, /dropOperation/);
  assert.match(list, /onDragOverDirectory/);
  assert.match(list, /onDragLeaveDirectory/);
  assert.match(list, /移动到此处/);
  assert.match(list, /复制到此处/);
  assert.match(list, /ring-2 ring-primary\/40/);
  assert.match(
    list,
    /dropEffect =[\s\S]*event\.ctrlKey \|\| event\.altKey \? "copy" : "move"/,
  );
  assert.match(list, /event\.dataTransfer\.dropEffect = "copy"/);
  assert.match(list, /onDisplayModeChange/);
  assert.match(list, /displayMode === "grid"/);
  assert.match(list, /网格/);
  assert.match(list, /配置列表列/);
  assert.match(list, /onColumnsChange/);
  assert.match(list, /gridTemplateColumns/);
  assert.match(list, /舒适/);
  assert.match(list, /紧凑/);
  assert.match(list, /FILE_NAME_COLLATOR/);
  assert.match(page, /VIEW_PREFERENCES_STORAGE_KEY/);
  assert.match(page, /displayMode: "list"/);
  assert.match(page, /columnWidths: FILE_MANAGER_DEFAULT_COLUMN_WIDTHS/);
  assert.doesNotMatch(page, /文件预览\/编辑采用独立弹窗工作台/);
  assert.match(page, /openFilePreview/);
  assert.match(previewPanel, /export function FilePreviewDialog/);
  assert.match(previewPanel, /requestOpenChange/);
  assert.match(previewPanel, /confirmDiscardOpen/);
  assert.match(previewPanel, /savingAndClosing/);
  assert.match(previewPanel, /saveHandlerRef/);
  assert.match(previewPanel, /pendingReviewedSaveRef/);
  assert.match(previewPanel, /requestReviewedSave/);
  assert.match(previewPanel, /resolvePendingReviewedSave/);
  assert.match(previewPanel, /reviewSaveAndClose/);
  assert.match(previewPanel, /审阅差异并保存关闭/);
  assert.match(previewPanel, /onSaveHandlerChange\?\.\(saveDraft\)/);
  assert.match(previewPanel, /if \(modal\) return undefined/);
  assert.match(previewPanel, /onSaveHandlerChange\?\.\(requestReviewedSave\)/);
  assert.match(previewPanel, /saveError/);
  assert.match(previewPanel, /lastSavedAt/);
  assert.match(previewPanel, /data-file-save-error/);
  assert.match(previewPanel, /data-file-save-status/);
  assert.match(previewPanel, /role="alert"/);
  assert.match(previewPanel, /role="status"/);
  assert.match(previewPanel, /保存失败/);
  assert.match(previewPanel, /重试保存/);
  assert.match(previewPanel, /最近保存/);
  assert.match(previewPanel, /保存于/);
  assert.match(previewPanel, /FileVersionHistoryDialog/);
  assert.match(previewPanel, /data-file-version-history-dialog/);
  assert.match(previewPanel, /data-file-version-snapshot-list/);
  assert.match(previewPanel, /data-file-version-snapshot-preview/);
  assert.match(previewPanel, /FILE_VERSION_STORAGE_KEY/);
  assert.match(previewPanel, /FILE_VERSION_MAX_SNAPSHOTS/);
  assert.match(previewPanel, /FILE_VERSION_MAX_CONTENT_BYTES/);
  assert.match(previewPanel, /loadFileVersionSnapshots/);
  assert.match(previewPanel, /persistFileVersionSnapshot/);
  assert.match(previewPanel, /deleteFileVersionSnapshot/);
  assert.match(previewPanel, /FILE_UNSAVED_DRAFT_STORAGE_KEY/);
  assert.match(previewPanel, /FILE_UNSAVED_DRAFT_MAX_CONTENT_BYTES/);
  assert.match(previewPanel, /loadFileUnsavedDraft/);
  assert.match(previewPanel, /persistFileUnsavedDraft/);
  assert.match(previewPanel, /clearFileUnsavedDraft/);
  assert.match(previewPanel, /已恢复未保存草稿/);
  assert.match(previewPanel, /data-file-unsaved-draft-restored/);
  assert.match(previewPanel, /草稿仅在当前浏览器保存/);
  assert.match(previewPanel, /content === loadedContent/);
  assert.match(previewPanel, /clearFileUnsavedDraft\(rootId, entry\.path\)/);
  assert.match(previewPanel, /estimateUtf8Bytes/);
  assert.match(previewPanel, /历史版本快照/);
  assert.match(previewPanel, /useFileVersionsQuery/);
  assert.match(previewPanel, /useFileVersionReadQuery/);
  assert.match(previewPanel, /useDeleteFileVersionMutation/);
  assert.match(previewPanel, /readFileVersion/);
  assert.match(previewPanel, /serverVersions/);
  assert.match(previewPanel, /selectedServerRead/);
  assert.match(previewPanel, /previewContent/);
  assert.match(previewPanel, /currentContent/);
  assert.match(previewPanel, /versionDiffLines/);
  assert.match(previewPanel, /compareOpen/);
  assert.match(previewPanel, /data-file-version-diff-preview/);
  assert.match(previewPanel, /对比草稿/);
  assert.match(previewPanel, /查看内容/);
  assert.match(previewPanel, /服务器历史加载中/);
  assert.match(previewPanel, /读取服务器历史内容中/);
  assert.match(previewPanel, /读取服务器历史失败/);
  assert.match(previewPanel, /服务器\/本地历史均可先预览/);
  assert.match(previewPanel, /服务器版本/);
  assert.match(previewPanel, /恢复到草稿/);
  assert.match(previewPanel, /快照/);
  assert.match(previewPanel, /保存前内容/);
  assert.match(previewPanel, /setVersionSnapshots/);
  assert.match(previewPanel, /restoreVersionSnapshot/);
  assert.match(previewPanel, /restoreServerVersion/);
  assert.match(previewPanel, /deleteServerVersion/);
  assert.match(previewPanel, /deleteVersionSnapshot/);
  assert.match(previewPanel, /FileSaveReviewDialog/);
  assert.match(previewPanel, /data-file-save-review-dialog/);
  assert.match(previewPanel, /data-file-save-diff-preview/);
  assert.match(previewPanel, /grid-cols-\[36px_36px_minmax\(0,1fr\)\]/);
  assert.match(previewPanel, /createFileSaveDiffLines/);
  assert.match(previewPanel, /summarizeFileSaveDiff/);
  assert.match(previewPanel, /FILE_SAVE_DIFF_CONTEXT/);
  assert.match(previewPanel, /FILE_SAVE_DIFF_MAX_LINES/);
  assert.match(previewPanel, /审阅差异/);
  assert.match(previewPanel, /保存前审阅差异/);
  assert.match(previewPanel, /确认保存/);
  assert.match(previewPanel, /返回编辑/);
  assert.match(previewPanel, /onClick=\{requestSave\}/);
  assert.match(previewPanel, /setSaveReviewOpen\(true\)/);
  assert.match(previewPanel, /handleEditorShellKeyDown/);
  assert.match(
    previewPanel,
    /data-file-preview-save-shortcut="review-diff-first"/,
  );
  assert.match(previewPanel, /handleSaveReviewOpenChange/);
  assert.match(previewPanel, /resolvePendingReviewedSave\(false\)/);
  assert.match(previewPanel, /const saved = await onSave\(\)/);
  assert.match(previewPanel, /onKeyDown=\{handleEditorShellKeyDown\}/);
  assert.match(previewPanel, /requestSave\(\)/);
  assert.doesNotMatch(
    previewPanel,
    /node\.addEventListener\("keydown", onKeyDown\)/,
  );
  assert.match(previewPanel, /diffLinePrefix/);
  assert.match(previewPanel, /maximized/);
  assert.match(previewPanel, /dialogSize/);
  assert.match(previewPanel, /compactViewport/);
  assert.match(previewPanel, /window\.innerWidth < 640/);
  assert.match(previewPanel, /!compactViewport/);
  assert.match(previewPanel, /FILE_PREVIEW_DIALOG_MIN_SIZE/);
  assert.match(previewPanel, /clampDialogSize/);
  assert.match(previewPanel, /startResize/);
  assert.match(previewPanel, /setPointerCapture/);
  assert.match(previewPanel, /data-file-preview-resize-handle/);
  assert.match(previewPanel, /hidden size-5[\s\S]*sm:block/);
  assert.match(previewPanel, /调整文件预览编辑窗口尺寸/);
  assert.match(previewPanel, /拖拽右下角调整窗口尺寸/);
  assert.match(previewPanel, /默认尺寸/);
  assert.match(previewPanel, /ArrowRight/);
  assert.match(previewPanel, /ArrowDown/);
  assert.match(previewPanel, /Maximize2/);
  assert.match(previewPanel, /Minimize2/);
  assert.match(previewPanel, /最大化文件预览编辑窗口/);
  assert.match(previewPanel, /还原文件预览编辑窗口/);
  assert.match(previewPanel, /h-\[100dvh\]/);
  assert.match(previewPanel, /w-screen/);
  assert.match(previewPanel, /rounded-none/);
  assert.match(previewPanel, /sm:h-\[calc\(100dvh-24px\)\]/);
  assert.match(previewPanel, /sm:h-\[min\(86dvh,860px\)\]/);
  assert.match(previewPanel, /sm:h-\[min\(72dvh,680px\)\]/);
  assert.match(previewPanel, /sm:h-\[min\(76dvh,720px\)\]/);
  assert.match(previewPanel, /grid grid-cols-1 gap-2[\s\S]*sm:flex/);
  assert.equal(
    (previewPanel.match(/<Dialog open=\{confirmDiscardOpen\}/g) ?? []).length,
    1,
  );
  assert.match(previewPanel, /sm:hidden/);
  assert.match(
    previewPanel,
    /hidden min-w-0 items-center gap-2 overflow-x-auto sm:flex sm:justify-end/,
  );
  assert.match(previewPanel, /关闭文件预览\/编辑/);
  assert.match(previewPanel, /保存并关闭/);
  assert.match(previewPanel, /不保存并关闭/);
  assert.match(previewPanel, /beforeunload/);
  assert.match(previewPanel, /onDirtyChange\?\.\(dirty\)/);
  assert.match(previewPanel, /DialogContent/);
  assert.match(previewPanel, /data-file-preview-dialog/);
  assert.match(previewPanel, /data-file-preview-dialog-body/);
  assert.match(previewPanel, /在线预览\/编辑/);
  assert.match(
    previewPanel,
    /grid h-full min-h-0 grid-rows-\[minmax\(0,1fr\)_auto\]/,
  );
  assert.match(previewPanel, /FilePreviewEditorShell/);
  assert.match(previewPanel, /data-file-preview-editor-shell/);
  assert.match(previewPanel, /data-file-preview-editor-toolbar/);
  assert.match(previewPanel, /data-file-preview-editor-toolbar-primary/);
  assert.match(previewPanel, /data-file-preview-mobile-tools/);
  assert.match(previewPanel, /max-h-\[32dvh\]/);
  assert.match(previewPanel, /data-file-preview-desktop-tools/);
  assert.match(previewPanel, /mobileToolsOpen/);
  assert.match(previewPanel, /展开文件预览更多操作/);
  assert.match(previewPanel, /grid-cols-2 gap-2/);
  assert.match(previewPanel, /sm:hidden/);
  assert.match(previewPanel, /sm:flex/);
  assert.match(previewPanel, /data-file-preview-workbench-region/);
  assert.match(previewPanel, /专注式弹窗编辑器/);
  assert.match(previewPanel, /显示属性/);
  assert.match(previewPanel, /隐藏属性/);
  assert.match(previewPanel, /data-file-preview-metadata/);
  assert.match(previewPanel, /max-h-\[30dvh\]/);
  assert.match(previewPanel, /FilePreviewMetadataGrid/);
  assert.match(
    previewPanel,
    /sm:grid-cols-\[72px_minmax\(0,1fr\)_72px_minmax\(0,1fr\)\]/,
  );
  assert.match(previewPanel, /data-file-preview-status-bar/);
  assert.match(
    previewPanel,
    /flex min-h-8 items-center gap-x-3 gap-y-1 overflow-x-auto/,
  );
  assert.match(previewPanel, /UID\/GID/);
  assert.match(previewPanel, /entry\.permissions/);
  assert.match(previewPanel, /FilePreviewEditorStatusBar/);
  assert.match(previewPanel, /editorLanguageLabel/);
  assert.match(previewPanel, /initialFilePreviewMode/);
  assert.match(previewPanel, /defaultMode=\{preferredInitialMode\}/);
  assert.match(previewPanel, /Ctrl\/⌘\+S 保存当前文件/);
  assert.match(previewPanel, /双击打开 · 右键预览\/编辑 · Ctrl\/⌘\+S 保存/);
  assert.match(previewPanel, /UTF-8/);
  assert.match(previewPanel, /LF/);
  assert.match(
    previewPanel,
    /Ctrl\/⌘\+F 查找 · Ctrl\/⌘\+H 替换 · Ctrl\/⌘\+S 保存/,
  );
  assert.doesNotMatch(page, /detailsPanelOpen/);
  assert.doesNotMatch(page, /隐藏详情\/预览/);
  assert.doesNotMatch(page, /显示详情\/预览/);
  assert.match(page, /normalizeFileManagerColumnWidths/);
  assert.match(page, /normalizeColumnWidth/);
  assert.match(page, /parsed\.displayMode === "grid"/);
  assert.match(page, /loadFileManagerViewPreferences/);
  assert.match(page, /storeFileManagerViewPreferences/);
  assert.match(page, /isValidSortState/);
  assert.match(page, /normalizeFileManagerColumns/);
  assert.match(page, /item === "permissions"/);
  assert.match(page, /item === "owner"/);
  assert.match(page, /candidate\.key === "permissions"/);
  assert.match(page, /candidate\.key === "owner"/);
  assert.doesNotMatch(page, /FILE_MANAGER_DEFAULT_COLUMNS\.indexOf\(left\)/);
  assert.match(page, /handleDropTransfer/);
  assert.match(page, /initialDirectoryPath: targetDirectory\.path/);
  assert.match(actionDialog, /dialog\.initialDirectoryPath \?\? directoryPath/);
  assert.match(page, /不能把目录移动\/复制到自身或其子目录/);
  assert.match(
    page,
    /sortFileEntries\(visibleEntries, viewPreferences\.sort\)/,
  );
});

test("file manager owns content index management view instead of placing it in Workspace IDE", () => {
  const page = read("apps/web/src/features/file-manager/FileManagerPage.tsx");
  const contentIndex = read(
    "apps/web/src/features/file-manager/ContentIndexManager.tsx",
  );
  const workspaceArchitecture = read("docs/Workspace前端架构.md");
  const packageJson = read("package.json");
  const contentIndexSmoke = read(
    "tests/file-manager/file-manager-content-index.smoke.mjs",
  );

  assert.match(page, /FileManagerViewMode/);
  assert.match(page, /const LazyContentIndexManager = React\.lazy/);
  assert.match(page, /import\("\.\/ContentIndexManager"\)/);
  assert.match(page, /FileManagerLazyPanelLoading/);
  assert.match(page, /内容索引管理加载中/);
  assert.doesNotMatch(page, /import \{ ContentIndexManager \} from/);
  assert.match(contentIndex, /全局内容索引/);
  assert.match(contentIndex, /useFilesContentIndexQuery/);
  assert.match(contentIndex, /useFilesContentIndexRecordsQuery/);
  assert.match(contentIndex, /CONTENT_INDEX_RECORDS_PAGE_SIZE/);
  assert.match(contentIndex, /useScanFilesContentIndexMutation/);
  assert.match(contentIndex, /useCleanFilesContentIndexMutation/);
  assert.match(contentIndex, /useRebuildFilesContentIndexMutation/);
  assert.match(contentIndex, /全局内容索引/);
  assert.match(contentIndex, /FILES_GLOBAL_SCOPE_ID/);
  assert.match(contentIndex, /rootId: indexScopeRootId/);
  assert.match(contentIndex, /fastStats/);
  assert.match(contentIndex, /扫描失效/);
  assert.match(contentIndex, /重建当前入口/);
  assert.match(contentIndex, /清理失效/);
  assert.match(contentIndex, /复制诊断/);
  assert.match(contentIndex, /deriveContentIndexHealth/);
  assert.match(contentIndex, /data-content-index-overview-strip/);
  assert.match(contentIndex, /data-content-index-toolbar/);
  assert.match(contentIndex, /分页/);
  assert.match(contentIndex, /后端分页/);
  assert.doesNotMatch(contentIndex, /后续可升级分页 API/);
  assert.doesNotMatch(contentIndex, /后续可切到分页 API/);
  assert.doesNotMatch(contentIndex, /预览已截断/);
  assert.match(contentIndex, /maintenanceEvents/);
  assert.match(contentIndex, /staleRatio/);
  assert.match(contentIndex, /copyContentIndexDiagnostics/);
  assert.match(contentIndex, /索引诊断已复制/);
  assert.match(contentIndex, /ContentIndexMaintenanceEvent/);
  assert.match(contentIndex, /appendMaintenanceEvent/);
  assert.match(contentIndex, /后端分页/);
  assert.match(contentIndex, /上一页/);
  assert.match(contentIndex, /下一页/);
  assert.match(contentIndex, /returnedRecordCount/);
  assert.match(contentIndex, /hasMore/);
  assert.match(contentIndex, /data-file-manager-index-manager/);
  assert.match(contentIndex, /IndexRecordsPanel/);
  assert.doesNotMatch(contentIndex, /filterContentIndexRecords/);
  assert.match(contentIndex, /recordsPreview/);
  assert.match(contentIndex, /CONTENT_INDEX_RECORDS_PAGE_SIZE/);
  assert.match(contentIndex, /索引记录/);
  assert.match(contentIndex, /搜索索引记录/);
  assert.match(contentIndex, /queryDraft/);
  assert.match(
    contentIndex,
    /window\.setTimeout\(\(\) => setQuery\(queryDraft\.trim\(\)\), 260\)/,
  );
  assert.match(contentIndex, /window\.clearTimeout\(timer\)/);
  assert.match(contentIndex, /索引状态筛选/);
  assert.match(contentIndex, /复制IndexRecord|copyIndexRecord/);
  assert.match(contentIndex, /索引记录已复制/);
  assert.match(contentIndex, /导出本页/);
  assert.match(contentIndex, /exportIndexRecordsCsv/);
  assert.match(contentIndex, /escapeCsvCell/);
  assert.match(contentIndex, /索引记录 CSV 已导出/);
  assert.match(contentIndex, /onRevealPath/);
  assert.match(
    page,
    /LazyContentIndexManager[\s\S]*rootId=\{rootId\}[\s\S]*rootLabel=\{root\?\.labelZh \?\? rootId\}[\s\S]*onRevealPath=\{revealOperationPath\}[\s\S]*onOpenFile=\{openFilePreview\}/,
  );
  assert.match(page, /activePreviewTab\?\.rootId/);
  assert.match(page, /activePreviewRootId/);
  assert.match(
    contentIndex,
    /onOpenFile\?: \(entry: FileEntrySummary, rootId\?: string\) => void/,
  );
  assert.match(contentIndex, /contentIndexRecordToFileEntry/);
  assert.match(
    contentIndex,
    /onOpenFile\(contentIndexRecordToFileEntry\(record\), record\.rootId\)/,
  );
  assert.match(contentIndex, /预览/);
  assert.match(contentIndex, /data-content-index-export-current-page/);
  assert.match(contentIndex, /导出本页/);
  assert.match(contentIndex, /disabled=\{loading \|\| !records\.length\}/);
  assert.match(contentIndex, /new Blob\(\["\\ufeff", csv\]/);
  assert.match(contentIndex, /anchor\.download = fileName/);
  assert.match(
    contentIndex,
    /window\.setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 1000\)/,
  );
  assert.match(contentIndex, /safeExportName/);
  assert.doesNotMatch(contentIndex, /key=\{status\}[\s\S]*key=\{status\}/);
  assert.doesNotMatch(contentIndex, /data-content-index-records-mobile-list/);
  assert.match(contentIndex, /data-content-index-record-card/);
  assert.match(contentIndex, /data-content-index-record-actions/);
  assert.match(contentIndex, /data-content-index-record-actions/);
  assert.doesNotMatch(contentIndex, /md:hidden/);
  assert.doesNotMatch(contentIndex, /hidden max-h-\[420px\]/);
  assert.match(contentIndex, /data-content-index-records-scrollport/);
  assert.match(contentIndex, /data-content-index-records-table/);
  assert.doesNotMatch(contentIndex, /min-w-\[760px\]/);
  assert.match(contentIndex, /overflow-auto overscroll-contain/);
  assert.match(contentIndex, /grid-rows-\[auto_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(
    contentIndex,
    /aria-label="索引状态筛选">\s*<div className="ml-auto inline-flex rounded border border-line bg-panel p-0\.5" aria-label="索引状态筛选"/,
  );
  assert.match(packageJson, /smoke:file-manager:content-index/);
  assert.match(
    contentIndexSmoke,
    /api\("\/api\/files\/content-index\/rebuild"/,
  );
  assert.match(
    contentIndexSmoke,
    /api\([\s\S]*`\/api\/files\/content-index\/records\?\$\{recordSearch\.toString\(\)\}`/,
  );
  assert.match(
    contentIndexSmoke,
    /getByLabel\("搜索索引记录"\)\.fill\(smokeDir\)/,
  );
  assert.match(contentIndexSmoke, /waitForEvent\("download"\)/);
  assert.match(contentIndexSmoke, /data-content-index-export-current-page/);
  assert.match(contentIndexSmoke, /data-content-index-records-scrollport/);
  assert.match(contentIndexSmoke, /data-content-index-record-card/);
  assert.match(contentIndexSmoke, /scrollWidth > metrics\.innerWidth \+ 24/);
  assert.match(contentIndexSmoke, /recordsScrollport/);
  assert.match(contentIndexSmoke, /全局内容索引/);

  assert.match(
    workspaceArchitecture,
    /索引管理 UI 后续归入独立文件管理器域|内容索引库的统计、清理、重建和失效扫描都放在该域/,
  );
  assert.match(workspaceArchitecture, /\/file-manager/);
});

test("upload manager UI is shared instead of embedded in WorkspaceExplorer", () => {
  const explorer = read(
    "apps/web/src/features/workspace/files/WorkspaceExplorer.tsx",
  );
  const uploadUi = read(
    "apps/web/src/features/workspace/files/UploadManagerDialog.tsx",
  );
  const uploadStrip = read(
    "apps/web/src/features/workspace/files/UploadTaskStrip.tsx",
  );
  const uploadFormatting = read(
    "apps/web/src/features/workspace/files/uploadFormatting.ts",
  );
  const uploadSnapshots = read(
    "apps/web/src/features/workspace/files/uploadTaskSnapshots.ts",
  );
  const barrel = read("apps/web/src/features/workspace/files/index.ts");
  const fileManager = read(
    "apps/web/src/features/file-manager/FileManagerPage.tsx",
  );
  const workspaceExplorer = read(
    "apps/web/src/features/workspace/files/WorkspaceExplorer.tsx",
  );
  const packageJson = read("package.json");
  const quickPasteSmoke = read(
    "tests/file-manager/file-manager-quick-paste-upload.smoke.mjs",
  );
  const uploadConflictsSmoke = read(
    "tests/file-manager/file-manager-upload-conflicts.smoke.mjs",
  );
  const uploadResumableSmoke = read(
    "tests/file-manager/file-manager-upload-resumable.smoke.mjs",
  );

  assert.match(uploadUi, /export function UploadManagerDialog/);
  assert.match(uploadUi, /collectUploadFilesFromDataTransfer/);
  assert.match(uploadUi, /uploadFilesClipboardFingerprint/);
  assert.match(uploadUi, /recentPasteRef/);
  assert.match(uploadStrip, /export function UploadTaskStrip/);
  assert.doesNotMatch(uploadUi, /export function UploadTaskStrip/);
  assert.match(uploadUi, /复制诊断/);
  assert.match(uploadUi, /UploadFailureSummary/);
  assert.match(uploadUi, /data-upload-manager-failure-summary/);
  assert.match(uploadUi, /data-upload-manager-retry-resume/);
  assert.match(uploadUi, /data-upload-manager-inline-retry-resume/);
  assert.match(uploadUi, /data-upload-manager-resumable-badge/);
  assert.match(uploadUi, /data-upload-manager-progress-panel/);
  assert.match(uploadUi, /data-upload-manager-total-progress/);
  assert.match(uploadUi, /data-upload-manager-speed/);
  assert.match(uploadUi, /data-upload-manager-remaining/);
  assert.match(uploadUi, /data-upload-manager-progress-track/);
  assert.match(uploadUi, /data-upload-manager-choose-folder/);
  assert.match(uploadUi, /UPLOAD_CHUNK_SIZE_BYTES/);
  assert.match(uploadUi, /\/（当前 root）/);
  assert.doesNotMatch(uploadUi, /\/（根目录）/);
  assert.match(uploadUi, /继续\/重试失败/);
  assert.match(uploadUi, /重新开始全部/);
  assert.match(
    uploadUi,
    /aria-label=\{active \? "暂停上传" : "继续或重试失败上传"\}/,
  );
  assert.match(uploadUi, /uploadProgressPercent/);
  assert.match(uploadUi, /copyUploadDiagnostics/);
  assert.match(uploadUi, /失败\/取消任务/);
  assert.match(uploadUi, /上传状态 \/ 速率/);
  assert.match(uploadUi, /上传目标目录/);
  assert.match(
    uploadUi,
    /onChangeTargetDirectory\?: \(directoryPath: string\) => void/,
  );
  assert.match(uploadUi, /aria-label="上传目标目录"/);
  assert.match(uploadUi, /aria-label="上传重名处理"/);
  assert.match(uploadUi, /<option value="rename">保留两者<\/option>/);
  assert.match(uploadUi, /<option value="overwrite">覆盖<\/option>/);
  assert.match(uploadUi, /<option value="skip">跳过<\/option>/);
  assert.match(uploadUi, /<option value="fail">冲突时报错<\/option>/);
  assert.match(
    uploadUi,
    /disabled=\{activeUpload \|\| !onChangeTargetDirectory\}/,
  );
  assert.match(uploadUi, /activeChunks/);
  assert.match(uploadUi, /uploadedChunkCount/);
  assert.match(uploadUi, /formatBytes\(speed\)/);
  assert.match(uploadStrip, /formatBytes\(speed\)/);
  assert.match(uploadStrip, /剩余 \{remaining\}/);
  assert.match(uploadFormatting, /export function formatBytes/);
  assert.match(uploadFormatting, /export function estimateRemaining/);
  const uploadManager = read(
    "apps/web/src/features/workspace/files/uploadManager.ts",
  );
  assert.match(uploadStrip, /export interface UploadTaskSnapshot/);
  assert.match(uploadManager, /getUploadCheckpointStorageKey/);
  assert.match(uploadManager, /UPLOAD_CHUNK_SIZE_BYTES/);
  assert.match(uploadSnapshots, /from "\.\/UploadTaskStrip"/);
  assert.match(uploadSnapshots, /FILE_MANAGER_UPLOAD_TASK_SNAPSHOT_KEY/);
  assert.match(uploadSnapshots, /WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY/);
  assert.match(uploadSnapshots, /snapshotsFromUploadJobs/);
  assert.match(uploadSnapshots, /loadUploadTaskSnapshots/);
  assert.match(uploadSnapshots, /saveUploadTaskSnapshots/);
  assert.match(explorer, /from "\.\/UploadManagerDialog"/);
  assert.doesNotMatch(explorer, /export function UploadManagerDialog/);
  assert.doesNotMatch(explorer, /function UploadFileTable/);
  assert.match(barrel, /from "\.\/UploadManagerDialog"/);
  assert.match(barrel, /from "\.\/UploadTaskStrip"/);
  assert.match(fileManager, /const LazyUploadManagerDialog = React\.lazy/);
  assert.match(
    fileManager,
    /import\("@\/features\/workspace\/files\/UploadManagerDialog"\)/,
  );
  assert.match(fileManager, /LazyUploadManagerDialog/);
  assert.match(fileManager, /上传管理器加载中/);
  assert.doesNotMatch(fileManager, /import \{ UploadManagerDialog \} from/);
  assert.match(fileManager, /UploadTaskStrip/);
  assert.match(fileManager, /FILE_MANAGER_UPLOAD_TASK_SNAPSHOT_KEY/);
  assert.match(fileManager, /uploadSnapshots/);
  assert.match(fileManager, /snapshotsFromUploadJobs\(uploadJobs\)/);
  assert.match(
    fileManager,
    /!uploadDialog\.open[\s\S]*uploadJobs\.length > 0 \|\| uploadSnapshots\.length > 0/,
  );
  assert.match(fileManager, /jobs=\{uploadJobs\}/);
  assert.match(fileManager, /snapshots=\{uploadSnapshots\}/);
  assert.match(
    fileManager,
    /onOpen=\{\(\) => setUploadDialog\(\(state\) => \(\{ \.\.\.state, open: true \}\)\)\}/,
  );
  assert.match(
    fileManager,
    /onPause=\{\(\) => uploadHandleRef\.current\?\.pause\(\)\}/,
  );
  assert.match(fileManager, /onResume=\{\(\) => void resumeUpload\(\)\}/);
  assert.match(fileManager, /onChangeTargetDirectory|targetDirectory/);
  assert.match(fileManager, /data-file-manager-shell="true"/);
  assert.match(fileManager, /queueQuickPasteUpload/);
  assert.match(fileManager, /quickPasteUploadRef/);
  assert.match(fileManager, /uploadFilesClipboardFingerprint/);
  assert.match(
    fileManager,
    /startUpload\(normalizedFiles, targetDirectory, "rename"\)/,
  );
  assert.match(quickPasteSmoke, /ClipboardEvent\('paste'/);
  assert.match(quickPasteSmoke, /DataTransfer\(\)/);
  assert.match(quickPasteSmoke, /data-file-manager-shell/);
  assert.match(
    quickPasteSmoke,
    /Duplicate quick paste created a renamed second file/,
  );
  assert.match(quickPasteSmoke, /上传文件到/);
  assert.match(packageJson, /smoke:file-manager:upload-resumable/);
  assert.match(uploadConflictsSmoke, /上传重名处理/);
  assert.match(uploadConflictsSmoke, /selectOption\(conflictPolicy\)/);
  assert.match(
    uploadConflictsSmoke,
    /uploadOnce\(page, smokeDir, localFile, 'skip', '已跳过'\)/,
  );
  assert.match(
    uploadConflictsSmoke,
    /uploadOnce\(page, smokeDir, localFile, 'rename', '已完成'\)/,
  );
  assert.match(
    uploadConflictsSmoke,
    /Skip conflict policy overwrote existing file/,
  );
  assert.match(
    uploadConflictsSmoke,
    /Rename conflict policy changed the original file/,
  );
  assert.match(uploadResumableSmoke, /LARGE_BYTES/);
  assert.match(uploadResumableSmoke, /chunks\/1/);
  assert.match(uploadResumableSmoke, /data-upload-manager-resumable-badge/);
  assert.match(uploadResumableSmoke, /tracevane\.workspace\.upload\.v1:/);
  assert.match(uploadResumableSmoke, /api\/files\/uploads/);
  assert.match(uploadResumableSmoke, /继续\\\/重试失败/);
  assert.match(uploadResumableSmoke, /sha256/);
  assert.match(workspaceExplorer, /onChangeTargetDirectory/);
  assert.match(workspaceExplorer, /targetDirectory/);
  assert.match(
    fileManager,
    /onCancel=\{\(\) => uploadHandleRef\.current\?\.cancel\(\)\}/,
  );
});
