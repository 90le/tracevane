import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const read = (rel) =>
  fs.readFileSync(
    new URL(`../../apps/web/src/${rel}`, import.meta.url),
    "utf-8",
  );

const readWeb = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/${rel}`, import.meta.url), "utf-8");

const readRoot = (rel) =>
  fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");

// ---------------------------------------------------------------------------
// Workspace is the single IDE route; old /ide and /files feature shells are gone.
// ---------------------------------------------------------------------------

test("/workspace renders the Dockview/Monaco WorkspaceWorkbench", () => {
  const router = read("app/router.tsx");
  const page = read("features/workspace/WorkspacePage.tsx");
  assert.match(router, /path=["']\/workspace["']/);
  assert.match(router, /import \{ WorkspacePage \} from/);
  assert.match(router, /LazyPage><WorkspacePage/);
  assert.doesNotMatch(router, /const WorkspacePage = React\.lazy/);
  assert.doesNotMatch(router, /path=["']\/ide["']/);
  assert.doesNotMatch(router, /path=["']\/files["']/);
  assert.match(page, /WorkspaceWorkbench/);
});

test("WorkspaceWorkbench imports Dockview and wires core panels", () => {
  const workbench = read("features/workspace/workbench/WorkspaceWorkbench.tsx");
  assert.match(workbench, /DockviewReact/);

  assert.match(workbench, /singleTabMode="default"/);
  const workbenchCss = read(
    "features/workspace/workbench/workspace-workbench.css",
  );
  assert.match(workbenchCss, /dv-tabs-and-actions-container\.dv-single-tab/);
  assert.match(workbenchCss, /duplicate the active document title/);
  assert.match(workbench, /dockview-react\/dist\/styles\/dockview\.css/);
  assert.match(workbench, /editor:\s*WorkspaceEditorDockPanel/);
  assert.match(workbench, /terminal:\s*WorkspaceTerminalDockPanel/);
  assert.match(workbench, /WorkspaceEditorDockContext/);
  assert.match(workbench, /React\.useContext\(WorkspaceEditorDockContext\)/);
  assert.match(workbench, /openFile=\{context\.activePath\}/);
  assert.match(workbench, /const LazyWorkspaceTerminal = React\.lazy/);
  assert.match(workbench, /正在加载终端引擎/);
  assert.doesNotMatch(workbench, /import \{ WorkspaceTerminal \} from/);
  assert.doesNotMatch(workbench, /preview:\s*\(\)\s*=>/);
  assert.doesNotMatch(workbench, /label=["']预览["']/);
  for (const sideComponent of ["explorer", "search", "git"]) {
    assert.doesNotMatch(
      workbench,
      new RegExp(`${sideComponent}:\\s*\\(\\)\\s*=>`),
    );
  }
  assert.match(workbench, /type SidePanel = "explorer" \| "search" \| "git"/);
  assert.match(workbench, /sideOpen/);
  assert.match(workbench, /WorkbenchSidePanel/);
  assert.match(workbench, /createDefaultLayout/);
  assert.match(
    workbench,
    /api\.addPanel\(\{ id: "editor", component: "editor", title: "Editor" \}\)/,
  );
  const defaultLayoutBody =
    /function createDefaultLayout\(api: DockviewApi\) \{([\s\S]*?)\n\}/.exec(
      workbench,
    )?.[1] ?? "";
  assert.doesNotMatch(defaultLayoutBody, /component: "terminal"/);
  assert.match(workbench, /tracevane\.workspace\.dockview\.v2/);
  assert.match(workbench, /WorkspaceOpenFileOptions/);
  assert.match(workbench, /WorkspaceEditorSearchRequest/);
  assert.match(workbench, /searchRequest/);
  const commandPalette = read(
    "features/workspace/workbench/WorkspaceCommandPalette.tsx",
  );
  const commandRegistry = read(
    "features/workspace/workbench/workspaceCommands.tsx",
  );
  const commandShortcuts = read(
    "features/workspace/workbench/workspaceCommandShortcuts.ts",
  );
  const keymap = read("features/workspace/workbench/workspaceKeymap.ts");
  assert.match(workbench, /WorkspaceCommandPalette/);
  assert.match(workbench, /commandPaletteOpen/);
  assert.match(workbench, /setCommandPaletteOpen\(\(open\) => !open\)/);
  assert.match(workbench, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(workbench, /event\.shiftKey && key === "p"/);
  assert.match(
    workbench,
    /runWorkspaceShortcutCommand\(event, workspaceCommands\)/,
  );
  assert.match(workbench, /loadWorkspaceKeymapOverrides/);
  assert.match(workbench, /applyWorkspaceKeymap/);
  assert.match(workbench, /getWorkspaceKeybindingConflicts/);
  assert.match(workbench, /storeWorkspaceKeymapOverrides\(\[\]\)/);
  assert.match(workbench, /keybindingConflicts=\{keybindingConflicts\}/);
  assert.doesNotMatch(workbench, /event\.altKey && key === "1"/);
  assert.doesNotMatch(workbench, /showSidePanel\("explorer"\)/);
  assert.match(workbench, /data-workspace-command-palette-trigger/);
  assert.match(commandPalette, /CommandDialog/);
  assert.doesNotMatch(commandPalette, /createWorkspaceCommandRegistry/);
  assert.match(commandPalette, /WORKSPACE_COMMAND_GROUPS\.map/);
  assert.match(commandPalette, /data-workspace-command-palette/);
  assert.match(commandPalette, /data-workspace-keybinding-conflicts/);
  assert.match(commandPalette, /快捷键冲突/);
  assert.match(commandPalette, /data-workspace-command=\{command\.id\}/);
  assert.doesNotMatch(commandPalette, /id: "workspace\.files\.focus"/);
  assert.match(commandRegistry, /export interface WorkspaceCommand/);
  assert.match(
    commandRegistry,
    /export interface WorkspaceCommandRegistryInput/,
  );
  assert.match(commandRegistry, /WORKSPACE_COMMAND_GROUPS/);
  assert.match(commandRegistry, /createWorkspaceCommandRegistry/);
  assert.match(commandRegistry, /extensionCommands = \[\]/);
  assert.match(commandRegistry, /\.\.\.extensionCommands/);
  assert.match(commandRegistry, /"Git"/);
  assert.match(commandRegistry, /"终端"/);
  assert.match(commandRegistry, /"编辑器"/);
  assert.match(commandPalette, /disabled=\{command\.disabled\}/);
  assert.match(workbench, /gitCommands/);
  assert.match(workbench, /terminalCommands/);
  assert.match(workbench, /editorCommands/);
  assert.match(workbench, /setGitCommands/);
  assert.match(workbench, /setTerminalCommands/);
  assert.match(workbench, /setEditorCommands/);
  assert.match(workbench, /const workspaceCommands = React\.useMemo/);
  assert.match(workbench, /createWorkspaceCommandRegistry\(\{/);
  assert.match(
    workbench,
    /extensionCommands: \[\s*\.\.\.gitCommands,\s*\.\.\.terminalCommands,\s*\.\.\.editorCommands,?\s*\]/,
  );
  assert.match(workbench, /commands=\{workspaceCommands\}/);
  assert.match(workbench, /onGitCommandsChange=\{registerGitCommands\}/);
  assert.match(workbench, /onTerminalCommandsChange: registerTerminalCommands/);
  assert.match(workbench, /onEditorCommandsChange: registerEditorCommands/);
  assert.match(
    workbench,
    /onCommandsChange=\{context\?\.onTerminalCommandsChange\}/,
  );
  assert.match(
    workbench,
    /onCommandsChange=\{context\.onEditorCommandsChange\}/,
  );
  assert.match(commandRegistry, /workspace\.files\.focus/);
  assert.match(commandRegistry, /workspace\.terminal\.open/);
  assert.match(commandRegistry, /workspace\.layout\.reset/);
  assert.match(commandRegistry, /workspace\.keymap\.reset/);
  assert.match(commandRegistry, /workspace\.ai\.context/);
  assert.match(commandRegistry, /@file \/ @terminal \/ @git \/ @selection/);
  assert.match(commandShortcuts, /findWorkspaceCommandForShortcut/);
  assert.match(commandShortcuts, /runWorkspaceShortcutCommand/);
  assert.match(commandShortcuts, /matchesWorkspaceShortcut/);
  assert.match(commandShortcuts, /parseWorkspaceShortcut/);
  assert.match(commandShortcuts, /command\.shortcut/);
  assert.match(commandShortcuts, /command\.disabled/);
  assert.match(commandShortcuts, /event\.preventDefault\(\)/);
  assert.match(keymap, /WORKSPACE_KEYMAP_STORAGE_KEY/);
  assert.match(keymap, /tracevane\.workspace\.keymap\.v1/);
  assert.match(keymap, /applyWorkspaceKeymap/);
  assert.match(keymap, /getWorkspaceKeybindingConflicts/);
  assert.match(keymap, /loadWorkspaceKeymapOverrides/);
  assert.match(keymap, /storeWorkspaceKeymapOverrides/);
  assert.match(keymap, /sanitizeWorkspaceKeymapOverrides/);
  assert.match(keymap, /normalizeWorkspaceKeybinding/);
});

test("Workspace side explorer exposes file-management toolbar capabilities", () => {
  const explorer = read("features/workspace/files/WorkspaceExplorer.tsx");
  const tree = read("features/workspace/files/FileTree.tsx");
  const upload = read("features/workspace/files/uploadManager.ts");
  const uploadUi = read("features/workspace/files/UploadManagerDialog.tsx");
  const uploadTaskStrip = read("features/workspace/files/UploadTaskStrip.tsx");
  const uploadTaskSnapshots = read(
    "features/workspace/files/uploadTaskSnapshots.ts",
  );
  const filesQuery = read("lib/query/files.ts");
  const searchPanel = read("features/workspace/files/WorkspaceSearchPanel.tsx");
  const replaceDiff = read("features/workspace/shared/ReplaceDiffPreview.tsx");
  const propertiesDialog = read(
    "features/workspace/shared/FilePropertiesDialog.tsx",
  );
  assert.match(explorer, /FileActionsMenu/);
  assert.match(explorer, /filesKeys\.all/);
  assert.match(explorer, /type="file"/);
  assert.match(explorer, /folderInputRef/);
  assert.match(explorer, /setAttribute\("webkitdirectory"/);
  assert.match(explorer, /onUploadChange/);
  assert.match(explorer, /currentDirectory/);
  assert.match(explorer, /createUploadBatch/);
  assert.match(explorer, /UploadManagerDialog/);
  assert.match(explorer, /onUploadRequest/);
  assert.match(uploadUi, /onPasteFiles/);
  assert.match(uploadUi, /const dataTransfer = event\.clipboardData/);
  assert.match(uploadUi, /dataTransfer\?\.files\?\.length/);
  assert.match(uploadUi, /window\.addEventListener\("paste"/);
  assert.match(explorer, /handleExplorerPaste/);
  assert.match(explorer, /handleExplorerKeyDown/);
  assert.match(explorer, /FilePreviewDialog/);
  assert.match(explorer, /previewEntry/);
  assert.match(explorer, /useFileReadQuery/);
  assert.match(explorer, /fileEntryFromActionTarget/);
  assert.match(explorer, /onPreviewRequest=\{\(target\) =>/);
  assert.match(explorer, /onSelectFile\?\.\(path\)/);
  assert.match(explorer, /previewEntry\?\.kind === "file" \? \(/);
  assert.doesNotMatch(
    explorer,
    /entry=\{previewEntry\?\.kind === "file" \? fileEntryFromActionTarget\(previewEntry\) : undefined\}/,
  );
  assert.match(explorer, /FilePropertiesDialog/);
  assert.match(explorer, /propertiesEntry/);
  assert.match(explorer, /onPropertiesRequest=\{setPropertiesEntry\}/);
  assert.match(explorer, /event\.altKey && key === "Enter" && activeEntry/);
  assert.match(explorer, /absoluteDisplayPath/);
  assert.match(propertiesDialog, /export function FilePropertiesDialog/);
  assert.match(propertiesDialog, /FilePropertiesEntry/);
  assert.match(propertiesDialog, /基本信息/);
  assert.match(explorer, /isEditableEventTarget/);
  assert.match(explorer, /key === "F2"/);
  assert.match(explorer, /key === "Delete" \|\| key === "Backspace"/);
  assert.match(explorer, /key === "F5"/);
  assert.match(explorer, /checkedEntries/);
  assert.match(explorer, /WorkspaceBulkActionBar/);
  assert.match(explorer, /WorkspaceBulkDialog/);
  assert.match(explorer, /setBulkDialog\(\{ kind: "delete" \}\)/);
  assert.match(explorer, /openBulkTransfer/);
  assert.match(explorer, /setBulkDialog\(\{ kind \}\)/);
  assert.match(explorer, /dryRunFileTransfer/);
  assert.match(explorer, /transferFiles/);
  assert.match(explorer, /FilesTransferConflictPolicy/);
  assert.match(explorer, /WorkspaceTransferDryRunSummary/);
  assert.match(explorer, /服务端预检/);
  assert.match(explorer, /同名冲突策略/);
  assert.match(explorer, /保留两者：自动生成 name \(1\)\.ext/);
  assert.match(explorer, /ops\.archive/);
  assert.match(explorer, /ops\.remove/);
  assert.match(explorer, /输入 DELETE 确认删除/);
  assert.match(explorer, /归档文件名（保存到当前目录）/);
  assert.match(explorer, /清空多选/);
  assert.match(explorer, /key === "ContextMenu"/);
  assert.match(explorer, /event\.shiftKey && key === "F10"/);
  assert.match(explorer, /findTreeRowMenuPoint/);
  assert.match(explorer, /key\.toLowerCase\(\) === "u"/);
  assert.match(explorer, /initialFlow=\{menu\.initialFlow\}/);
  assert.doesNotMatch(explorer, /onPaste=\{handlePaste\}/);
  assert.doesNotMatch(
    explorer,
    /onClick=\\{\\(\\) => fileInputRef\\.current\\?\\.click\\(\\)\\}/,
  );
  assert.doesNotMatch(explorer, /当前目录：/);
  assert.match(explorer, /setShowHidden/);
  assert.match(explorer, /setTreeVersion/);
  assert.match(tree, /showHidden/);

  assert.match(tree, /FileTypeIcon/);
  assert.match(tree, /fileIconEntry/);
  assert.match(tree, /hidden:\s*props\.showHidden/);
  assert.match(explorer, /treeVersion/);
  assert.match(explorer, /showHidden \? "hidden" : "visible"/);
  assert.match(
    explorer,
    /label=\{showHidden \? "隐藏隐藏文件" : "显示隐藏文件"\}/,
  );
  assert.match(tree, /onDirectoryFocus/);
  assert.match(tree, /onActiveEntryChange/);
  assert.match(tree, /onDoubleClick=\{onOpen\}/);
  assert.match(tree, /onSelectRow/);
  assert.match(
    tree,
    /Fired when a row is explicitly opened \(double-click or Enter\)/,
  );
  assert.match(tree, /checkedPaths/);
  assert.match(tree, /onToggleChecked/);
  assert.match(tree, /aria-multiselectable/);
  assert.match(tree, /aria-checked/);
  assert.match(tree, /选择 \$\{name\}/);
  assert.match(tree, /case " ":/);
  assert.match(tree, /hidden:\s*props\.showHidden/);
  assert.match(tree, /const pageSize = 200/);
  assert.match(tree, /加载更多/);
  assert.match(tree, /setPage\(\(value\) => value \+ 1\)/);
  assert.match(tree, /renderLimit/);
  assert.match(tree, /显示更多已加载/);
  assert.match(upload, /initFileUpload/);
  assert.match(upload, /getFileUpload/);
  assert.match(upload, /uploadFileChunk/);
  assert.match(upload, /completeFileUpload/);
  assert.match(upload, /MAX_CONCURRENT_CHUNKS/);
  assert.match(upload, /localStorage/);
  assert.match(upload, /CHECKPOINT_PREFIX/);
  assert.match(upload, /getUploadCheckpointStorageKey/);
  assert.match(upload, /UPLOAD_CHUNK_SIZE_BYTES/);
  assert.match(upload, /subtle\.digest\("SHA-256"/);
  assert.match(upload, /MAX_HASH_BYTES/);
  assert.doesNotMatch(upload, /readAsDataURL/);
  assert.match(upload, /resume/);
  assert.match(explorer, /conflictPolicy/);
  assert.match(uploadUi, /保留两者/);
  assert.match(explorer, /UploadTaskStrip/);
  assert.match(uploadTaskStrip, /上传任务/);
  assert.match(explorer, /WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY/);
  assert.match(uploadTaskSnapshots, /WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY/);
  assert.match(uploadTaskStrip, /待恢复上传/);
  assert.match(uploadTaskStrip, /重新选择文件恢复/);
  assert.match(explorer, /FileActionsMenu/);
  const fileActionsMenu = read("features/workspace/files/FileActionsMenu.tsx");
  assert.match(fileActionsMenu, /label="属性"/);
  assert.match(fileActionsMenu, /移入回收站/);
  assert.match(fileActionsMenu, /\.tracevane-trash/);
  assert.match(
    fileActionsMenu,
    /onPropertiesRequest\?: \(target: FileActionsMenuTarget\) => void/,
  );
  assert.match(fileActionsMenu, /initialFlow = "menu"/);
  assert.match(fileActionsMenu, /setFlow\(open \? initialFlow : null\)/);
  assert.match(fileActionsMenu, /dryRunUnarchiveFile/);
  assert.match(fileActionsMenu, /UnarchiveDryRunSummary/);
  assert.match(fileActionsMenu, /解压预检/);
  assert.match(fileActionsMenu, /存在阻塞冲突或不安全条目/);
  assert.match(fileActionsMenu, /dryRunFileTransfer/);
  assert.match(fileActionsMenu, /transferFiles/);
  assert.match(fileActionsMenu, /TransferDryRunSummary/);
  assert.match(fileActionsMenu, /data-file-actions-transfer-dry-run-summary/);
  assert.match(fileActionsMenu, /nextName: newName\.trim\(\) \|\| undefined/);
  assert.match(fileActionsMenu, /conflictPolicy/);
  assert.match(fileActionsMenu, /overwriteConfirm\.trim\(\) === "OVERWRITE"/);
  assert.doesNotMatch(fileActionsMenu, /ops\.copy\(/);
  assert.doesNotMatch(fileActionsMenu, /ops\.move\(/);
  assert.match(filesQuery, /params\.hidden\s*\?\?\s*null/);
  assert.match(
    filesQuery,
    /search: \(params: \{ rootId: string; path\?: string; query: string; recursive\?: boolean; hidden\?: boolean/,
  );
  assert.match(filesQuery, /params\.recursive \?\? true/);
  assert.match(filesQuery, /params\.hidden \?\? true/);
  assert.match(filesQuery, /recursive: params\?\.recursive/);
  assert.match(filesQuery, /hidden: params\?\.hidden/);
  assert.match(filesQuery, /params\.limit \?\? null/);
  assert.match(filesQuery, /limit: params\?\.limit/);
  assert.match(filesQuery, /staleTime:\s*5_000/);
  assert.match(searchPanel, /跨文件替换/);
  assert.match(searchPanel, /prepareReplacePreview/);
  assert.match(searchPanel, /ReplacePreviewDialog/);
  assert.match(searchPanel, /ReplaceUndoPackage/);
  assert.match(searchPanel, /ReplaceUndoStrip/);
  assert.match(searchPanel, /预览跨文件替换/);
  assert.match(searchPanel, /replaceSelection/);
  assert.match(searchPanel, /selectedReplaceItems/);
  assert.match(searchPanel, /toggleReplacePreviewItem/);
  assert.match(searchPanel, /selectAllReplacePreviewItems/);
  assert.match(searchPanel, /全选本次预览/);
  assert.match(searchPanel, /包含隐藏文件/);
  assert.match(searchPanel, /hidden: includeHidden/);
  assert.match(searchPanel, /indexStats/);
  assert.match(searchPanel, /WORKSPACE_SEARCH_LIMIT = 250/);
  assert.match(searchPanel, /limit: WORKSPACE_SEARCH_LIMIT/);
  assert.match(searchPanel, /searchLimit/);
  assert.match(searchPanel, /searchTruncated/);
  assert.match(searchPanel, /已达到 \{searchLimit\} 条结果上限/);
  assert.match(searchPanel, /结果上限 \{searchLimit\} 条由后端保护/);
  assert.match(searchPanel, /内容索引命中/);
  assert.match(searchPanel, /索引未命中，已扫描补全/);
  assert.match(searchPanel, /确认全部替换/);
  assert.match(searchPanel, /撤销上次替换/);
  assert.match(searchPanel, /previousContent/);
  assert.match(searchPanel, /replacedContent/);
  assert.match(searchPanel, /current\.content !== item\.replacedContent/);
  assert.match(searchPanel, /countTextMatches/);
  assert.match(searchPanel, /replaceText/);
  assert.match(searchPanel, /searchCaseSensitive/);
  assert.match(searchPanel, /searchRegex/);
  assert.match(searchPanel, /正则搜索/);
  assert.match(searchPanel, /正则替换/);
  assert.match(searchPanel, /caseSensitive: searchCaseSensitive/);
  assert.match(searchPanel, /regex: searchRegex/);
  assert.match(searchPanel, /ReplaceDiffPreview/);
  assert.match(searchPanel, /createReplaceDiffLines/);
  assert.match(replaceDiff, /export function ReplaceDiffPreview/);
  assert.match(replaceDiff, /export function createReplaceDiffLines/);
  assert.match(replaceDiff, /export function renderMarkedLiteral/);
  assert.match(replaceDiff, /export function renderMarkedSearch/);
  assert.match(searchPanel, /diffLines/);
  assert.match(searchPanel, /readFile/);
  assert.match(searchPanel, /writeFileContent/);
  assert.match(searchPanel, /HighlightedText/);
  assert.match(searchPanel, /<mark/);
  assert.match(searchPanel, /WorkspaceOpenFileOptions/);
  assert.match(searchPanel, /initialSearch: \{ query, caseSensitive, regex \}/);
});

// ---------------------------------------------------------------------------
// Editor is Monaco-backed.
// ---------------------------------------------------------------------------

test("CodeEditor imports Monaco, not CodeMirror", () => {
  const editor = read("features/workspace/editor/CodeEditor.tsx");
  const stage = read("features/workspace/editor/WorkspaceEditorStage.tsx");
  const tabs = read("features/workspace/editor/EditorTabs.tsx");
  const editorTabActions = read(
    "features/workspace/editor/editorTabActions.tsx",
  );
  const editorTabCommands = read(
    "features/workspace/editor/editorTabCommands.tsx",
  );
  const documentPreview = read("features/workspace/shared/DocumentPreview.tsx");
  const archivePreview = read("features/workspace/shared/ArchivePreview.tsx");
  const binaryFilePreview = read(
    "features/workspace/shared/BinaryFilePreview.tsx",
  );
  const csvPreview = read("features/workspace/shared/CsvPreview.tsx");
  const jsonPreview = read("features/workspace/shared/JsonPreview.tsx");
  const textSlicePreview = read(
    "features/workspace/shared/TextSlicePreview.tsx",
  );
  const documentViewRegistry = read(
    "features/workspace/shared/DocumentViewRegistry.ts",
  );
  const textSearchReplace = read(
    "features/workspace/shared/TextSearchReplaceStrip.tsx",
  );
  const visualDocumentEditor = read(
    "features/workspace/shared/VisualDocumentEditor.tsx",
  );
  const documentWorkbench = read(
    "features/workspace/shared/DocumentWorkbench.tsx",
  );
  const fileTree = read("features/workspace/files/FileTree.tsx");
  const packageJson = readRoot("package.json");
  const workspaceModesSmoke = readRoot(
    "tests/file-manager/workspace-document-modes.smoke.mjs",
  );
  const viteConfig = readWeb("vite.config.ts");
  assert.match(editor, /monaco-editor\/esm\/vs\/editor\/editor\.api\.js/);
  assert.match(viteConfig, /'monaco-editor'/);
  assert.match(viteConfig, /'dockview-react'/);
  assert.doesNotMatch(editor, /@monaco-editor\/react/);
  assert.match(editor, /useTheme/);
  assert.match(editor, /data-editor-theme/);
  assert.match(editor, /theme === "dark" \? "vs-dark" : "vs"/);
  assert.match(editor, /data-code-editor="monaco-direct"/);
  assert.match(editor, /data-code-editor-container/);
  assert.match(editor, /monaco\.editor\.createModel/);
  assert.match(editor, /monaco\.editor\.create\(container/);
  assert.match(editor, /monaco\.editor\.setModelLanguage\(model, language\)/);
  assert.match(editor, /data-editor-language=\{languageForPath\(path\)\}/);
  assert.match(editor, /requestAnimationFrame\(\(\) => editor\.layout\(\)\)/);
  assert.doesNotMatch(editor, /@codemirror\//);
  assert.doesNotMatch(editor, /actions\.find/);
  assert.doesNotMatch(editor, /editor\.action\.startFindReplaceAction/);
  assert.match(editor, /searchHighlights/);
  assert.match(editor, /createDecorationsCollection/);
  assert.match(editor, /findMatches/);
  assert.match(editor, /tv-monaco-search-inline-active/);
  assert.match(editor, /languageForPath/);
  assert.match(editor, /monaco\.languages\.getLanguages\(\)/);
  assert.match(editor, /language\.extensions \?\? \[\]/);
  assert.match(editor, /language\.filenames \?\? \[\]/);
  assert.match(editor, /extensions\.sort/);
  assert.match(editor, /languageOverrideForFile/);
  assert.match(editor, /fileName\.startsWith\("\.env"\)/);
  assert.match(editor, /fileName\.endsWith\("\.vue"\)/);
  assert.doesNotMatch(editor, /EXTENSION_LANGUAGE_MAP/);
  assert.doesNotMatch(editor, /COMPOUND_EXTENSION_LANGUAGE_MAP/);
  assert.doesNotMatch(editor, /FILE_NAME_LANGUAGE_MAP/);
  assert.match(
    documentWorkbench,
    /export type DocumentWorkbenchMode = "source" \| "preview" \| "split" \| "visual"/,
  );
  assert.match(stage, /type EditorViewMode = DocumentWorkbenchMode/);
  assert.match(
    stage,
    /className="grid h-full min-h-0 min-w-0 grid-rows-\[auto_minmax\(0,1fr\)\]/,
  );
  assert.match(stage, /viewModes/);
  assert.match(stage, /buildActiveModeActions/);
  assert.match(stage, /showModeSwitcher=\{false\}/);
  assert.match(tabs, /EditorTabModeAction/);
  assert.doesNotMatch(tabs, /当前文件标签页内视图模式/);
  assert.doesNotMatch(tabs, /当前标签页模式/);
  assert.match(stage, /WorkspaceDocumentModePalette/);
  assert.match(tabs, /data-workspace-editor-tab=\{path\}/);
  assert.match(tabs, /data-workspace-editor-tab-menu/);
  assert.match(tabs, /createEditorTabActions/);
  assert.match(tabs, /data-editor-tab-action=\{action\.id\}/);
  assert.doesNotMatch(tabs, /<MenuButton onClick=\{onCloseOthers\}/);
  assert.match(editorTabActions, /export interface EditorTabAction/);
  assert.match(
    editorTabActions,
    /export interface EditorTabActionRegistryInput/,
  );
  assert.match(editorTabActions, /createEditorTabActions/);
  assert.match(editorTabActions, /editor\.tab\.closeOthers/);
  assert.match(editorTabActions, /editor\.tab\.closeRight/);
  assert.match(editorTabActions, /editor\.tab\.copyPath/);
  assert.match(editorTabActions, /关闭其它/);
  assert.match(editorTabActions, /关闭右侧/);
  assert.match(stage, /onCloseOthers=\{\(path\) =>/);
  assert.match(stage, /closeTabs\(openTabs\.filter/);
  assert.match(stage, /onCopyPath=\{copyTabPath\}/);
  assert.match(stage, /navigator\.clipboard\.writeText\(path\)/);
  assert.match(stage, /data-workspace-editor-mode=\{mode\.id\}/);
  assert.match(stage, /aria-label=\{`切换到\$\{mode\.label\}`\}/);
  assert.match(fileTree, /data-tree-name=\{name\}/);
  assert.match(packageJson, /smoke:workspace:document-modes/);
  assert.match(workspaceModesSmoke, /data-workspace-editor-tab/);
  assert.match(workspaceModesSmoke, /data-workspace-editor-mode=\"preview\"/);
  assert.match(workspaceModesSmoke, /data-workspace-editor-mode=\"split\"/);
  assert.match(workspaceModesSmoke, /data-workspace-editor-mode=\"visual\"/);
  assert.match(workspaceModesSmoke, /data-file-preview-dialog/);
  assert.match(
    workspaceModesSmoke,
    /Workspace mode switch opened FileManager preview dialog/,
  );
  assert.match(workspaceModesSmoke, /data-split-source-editor=\"true\"/);
  assert.match(workspaceModesSmoke, /data-visual-document-editor-shell/);
  assert.match(documentWorkbench, /源码/);
  assert.match(documentWorkbench, /预览/);
  assert.match(documentWorkbench, /边写边预览/);
  assert.match(stage, /编辑\+预览/);
  assert.match(stage, /预览时编辑/);
  assert.doesNotMatch(stage, /label: "Preview"/);
  assert.match(documentWorkbench, /编辑、预览、源码始终属于当前文件标签页/);
  assert.match(documentWorkbench, /DocumentPreview/);
  assert.match(documentWorkbench, /TextSearchReplaceStrip/);
  assert.match(documentWorkbench, /查找替换/);
  assert.match(documentWorkbench, /openSearchReplace/);
  assert.match(documentWorkbench, /handleWorkbenchKeyDown/);
  assert.match(documentWorkbench, /data-document-workbench-body="true"/);
  assert.match(documentWorkbench, /data-document-workbench-viewport="true"/);
  assert.match(documentWorkbench, /data-split-source-editor/);
  assert.match(documentWorkbench, /完整 Monaco 在“源码\/编辑”模式/);
  assert.match(documentWorkbench, /grid-rows-\[minmax\(0,1fr\)\]/);
  assert.match(
    documentWorkbench,
    /grid-rows-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/,
  );
  assert.match(
    documentWorkbench,
    /showSearchReplace\s*\?\s*"grid-rows-\[auto_minmax\(0,1fr\)\]"/,
  );
  assert.match(textSearchReplace, /ReplaceDiffPreview/);
  assert.match(textSearchReplace, /createReplaceDiffLines/);
  assert.match(textSearchReplace, /replacePreviewOpen/);
  assert.match(textSearchReplace, /预览全部/);
  assert.match(textSearchReplace, /确认全部替换/);
  assert.match(textSearchReplace, /替换前预览/);
  assert.match(textSearchReplace, /data-text-replace-preview/);
  assert.match(documentWorkbench, /key === "f"/);
  assert.match(documentWorkbench, /key === "h"/);
  assert.match(documentWorkbench, /event\.altKey/);
  assert.match(documentWorkbench, /Ctrl\+Alt\+1/);
  assert.match(documentWorkbench, /Ctrl\+Alt\+4/);
  assert.match(documentWorkbench, /VisualDocumentEditor/);
  assert.match(documentWorkbench, /canEditDocumentVisually/);
  assert.match(documentWorkbench, /onSearchStateChange=\{setSearchState\}/);
  assert.match(documentWorkbench, /initialSearch\?\.query/);
  assert.match(
    documentWorkbench,
    /initialQuery=\{initialSearch\?\.query \?\? ""\}/,
  );
  assert.match(
    documentWorkbench,
    /searchHighlights=\{showSearchReplace \? searchState : undefined\}/,
  );
  assert.match(documentWorkbench, /当前文件查找\/替换；替换后进入未保存状态/);
  assert.match(
    documentWorkbench,
    /density=\{compact \? "compact" : "default"\}/,
  );
  assert.match(stage, /DocumentWorkbench/);
  assert.match(stage, /WorkspaceEditorSearchRequest/);
  assert.match(stage, /searchRequest\?\.path === active/);
  assert.match(stage, /searchRequest : null/);
  assert.match(stage, /initialSearch=\{searchRequest\}/);
  assert.match(
    stage,
    /Source, preview, split preview and visual editing are modes of the active/,
  );
  assert.doesNotMatch(stage, /setSplit/);
  assert.doesNotMatch(stage, /splitPane/);
  assert.doesNotMatch(stage, /grid-cols-2 divide-x divide-line/);
  assert.match(stage, /mimeType=\{readQuery\.data\?\.mimeType\}/);
  assert.doesNotMatch(stage, /function WorkspacePreview/);
  assert.match(documentPreview, /import \{ MarkdownPreview \} from/);
  assert.doesNotMatch(
    documentPreview,
    /React\.lazy\(\(\) =>\s*import\("@\/features\/workspace\/preview\/MarkdownPreview"/,
  );
  assert.match(documentPreview, /getDocumentViewer/);
  assert.match(documentPreview, /canRenderRegisteredDocumentPreview/);
  assert.match(documentPreview, /sandbox=""/);
  assert.match(documentViewRegistry, /export const DOCUMENT_VIEWERS/);
  assert.match(documentViewRegistry, /export const DOCUMENT_VISUAL_EDITORS/);
  assert.match(documentViewRegistry, /getDocumentViewer/);
  assert.match(documentViewRegistry, /getDocumentVisualEditor/);
  assert.match(documentViewRegistry, /canRenderRegisteredDocumentPreview/);
  assert.match(documentViewRegistry, /canEditRegisteredDocumentVisually/);
  assert.match(documentViewRegistry, /id: "markdown"/);
  assert.match(documentViewRegistry, /id: "html"/);
  assert.match(documentViewRegistry, /id: "json"/);
  assert.match(documentViewRegistry, /id: "csv"/);
  assert.match(documentViewRegistry, /id: "image"/);
  assert.match(documentViewRegistry, /id: "video"/);
  assert.match(documentViewRegistry, /id: "audio"/);
  assert.match(documentViewRegistry, /id: "pdf"/);
  assert.match(documentViewRegistry, /id: "archive"/);
  assert.match(documentViewRegistry, /id: "binary"/);
  assert.match(documentViewRegistry, /context\?\.textLike === false/);
  assert.match(documentViewRegistry, /isArchiveDocument/);
  assert.match(documentPreview, /ArchivePreview/);
  assert.match(documentPreview, /JsonPreview/);
  assert.match(documentPreview, /CsvPreview/);
  assert.match(documentPreview, /MediaPreviewStage/);
  assert.match(documentPreview, /data-media-preview-scrollport/);
  assert.match(documentPreview, /mediaFitStyle/);
  assert.match(documentPreview, /TextSlicePreview/);
  assert.match(documentPreview, /BinaryFilePreview/);
  assert.match(jsonPreview, /export function JsonPreview/);
  assert.match(jsonPreview, /JSON\.parse/);
  assert.match(jsonPreview, /JSON 结构化预览/);
  assert.match(csvPreview, /export function CsvPreview/);
  assert.match(csvPreview, /parseDelimitedPreview/);
  assert.match(csvPreview, /CSV.*表格预览|CSV\"/);
  assert.match(binaryFilePreview, /安全占位预览/);
  assert.match(binaryFilePreview, /describeBinaryKind/);
  assert.match(binaryFilePreview, /application\/octet-stream/);
  assert.match(binaryFilePreview, /下载文件/);
  assert.match(textSlicePreview, /TEXT_SLICE_LIMIT/);
  assert.match(textSlicePreview, /MAX_RENDERED_LINES/);
  assert.match(
    textSlicePreview,
    /readFile\(\{ rootId, path, offset, limit: TEXT_SLICE_LIMIT \}\)/,
  );
  assert.match(textSlicePreview, /大文本\/日志切片预览/);
  assert.match(archivePreview, /dryRunUnarchiveFile/);
  assert.match(archivePreview, /压缩包清单预览/);
  assert.match(archivePreview, /conflictPolicy: "fail"/);
  assert.match(documentPreview, /<video[\s\S]*src=\{resolvedDownloadUrl\}/);
  assert.match(documentPreview, /<audio[\s\S]*src=\{downloadUrl\}/);
  assert.match(documentPreview, /isPdfDocument/);
  assert.match(textSearchReplace, /export function TextSearchReplaceStrip/);
  assert.match(textSearchReplace, /export function replaceText/);
  assert.match(textSearchReplace, /export interface TextSearchState/);
  assert.match(textSearchReplace, /focusTarget/);
  assert.match(textSearchReplace, /focusSignal/);
  assert.match(textSearchReplace, /initialQuery/);
  assert.match(textSearchReplace, /initialSignal/);
  assert.match(textSearchReplace, /setQuery\(initialQuery\)/);
  assert.match(textSearchReplace, /queryInputRef/);
  assert.match(textSearchReplace, /replaceInputRef/);
  assert.match(textSearchReplace, /collectTextMatchRanges/);
  assert.match(textSearchReplace, /上一个/);
  assert.match(textSearchReplace, /下一个/);
  assert.match(visualDocumentEditor, /getDocumentVisualEditor/);
  assert.match(visualDocumentEditor, /const MarkdownPreview = React\.lazy/);
  assert.match(visualDocumentEditor, /VisualPreviewLoading/);
  assert.doesNotMatch(
    visualDocumentEditor,
    /import \{ MarkdownPreview \} from/,
  );
  assert.match(visualDocumentEditor, /export function MarkdownLiveEditor/);
  assert.match(visualDocumentEditor, /export function HtmlVisualEditor/);
  assert.match(visualDocumentEditor, /parseMarkdownBlocks/);
  assert.match(
    visualDocumentEditor,
    /data-markdown-visual-block=\{block\.kind\}/,
  );
  assert.match(visualDocumentEditor, /Mermaid 图表默认渲染/);
  assert.match(visualDocumentEditor, /图片默认直接预览/);
  assert.match(visualDocumentEditor, /代码块默认高亮预览/);
  assert.match(visualDocumentEditor, /textarea/);
  assert.match(visualDocumentEditor, /编辑 Markdown 块源码/);
  assert.match(visualDocumentEditor, /data-markdown-fence-inline-editor/);
  assert.match(visualDocumentEditor, /data-markdown-table-inline-editor/);
  assert.match(visualDocumentEditor, /data-markdown-html-inline-editor/);
  assert.match(visualDocumentEditor, /MarkdownTaskListInlineEditor/);
  assert.match(visualDocumentEditor, /data-markdown-task-list-inline-editor/);
  assert.match(visualDocumentEditor, /parseMarkdownListItems/);
  assert.match(visualDocumentEditor, /buildMarkdownListItems/);
  assert.match(visualDocumentEditor, /parseMarkdownFence/);
  assert.match(visualDocumentEditor, /buildMarkdownTable/);
  assert.match(visualDocumentEditor, /parseMarkdownTableClipboard/);
  assert.match(visualDocumentEditor, /pasteTableAtCell/);
  assert.match(visualDocumentEditor, /onPaste=\{\(event\) => \{/);
  assert.match(
    visualDocumentEditor,
    /doc\.designMode = editable \? "on" : "off"/,
  );
  assert.match(visualDocumentEditor, /serializeHtmlDocument/);
});

// ---------------------------------------------------------------------------
// Preview remains remark/rehype-backed Markdown.
// ---------------------------------------------------------------------------

test("MarkdownPreview imports remarkParse and resolves file-root media", () => {
  const preview = read("features/workspace/preview/MarkdownPreview.tsx");
  const documentPreview = read("features/workspace/shared/DocumentPreview.tsx");
  const visualDocumentEditor = read(
    "features/workspace/shared/VisualDocumentEditor.tsx",
  );
  const css = read("features/workspace/preview/markdown-preview.css");

  assert.ok(
    preview.includes("remark-parse"),
    "MarkdownPreview must use remarkParse (remark pipeline)",
  );
  assert.match(preview, /rootId\?: string/);
  assert.match(preview, /useTheme/);
  assert.match(
    preview,
    /mermaidTheme = theme === "dark" \? "dark" : "default"/,
  );
  assert.match(preview, /ensureMermaid\(mermaidTheme\)/);
  assert.match(preview, /mermaidInitializedTheme !== theme/);
  assert.match(preview, /\[debounced, path, mermaidTheme\]/);
  assert.match(preview, /decorateMarkdownDom/);
  assert.match(preview, /resolveMarkdownResourceUrl/);
  assert.match(preview, /normalizeMarkdownAssetPath/);
  assert.match(preview, /new URLSearchParams\(\{ rootId, path: assetPath \}\)/);
  assert.match(preview, /image\.setAttribute\("loading"/);
  assert.match(preview, /image\.setAttribute\("decoding"/);
  assert.match(preview, /getMarkdownMediaKind/);
  assert.match(preview, /image\.replaceWith\(video\)/);
  assert.match(preview, /image\.replaceWith\(audio\)/);
  assert.match(preview, /copyMarkdownMediaLabel/);
  assert.match(preview, /media\.setAttribute\("controls"/);
  assert.match(preview, /media\.setAttribute\("preload"/);
  assert.match(preview, /anchor\.setAttribute\("target", "_blank"\)/);
  assert.match(
    preview,
    /onTaskToggle\?: \(taskIndex: number, checked: boolean\) => void/,
  );
  assert.match(preview, /li input\[type="checkbox"\]/);
  assert.match(preview, /md-preview__task-toggle/);
  assert.match(preview, /checkbox\.disabled = false/);
  assert.match(
    preview,
    /checkbox\.onchange = \(\) => onTaskToggle\(index, checkbox\.checked\)/,
  );
  assert.match(preview, /grid h-full min-h-0 min-w-0/);
  assert.match(
    documentPreview,
    /<MarkdownPreview path=\{path\} rootId=\{rootId\} content=\{content\} \/>/,
  );
  assert.match(visualDocumentEditor, /content=\{block\.raw\}/);
  assert.match(
    visualDocumentEditor,
    /editable && block\.kind === "list" \? onTaskToggle : undefined/,
  );
  assert.match(visualDocumentEditor, /export function toggleMarkdownTask/);
  assert.match(visualDocumentEditor, /\[ xX\]/);
  assert.match(visualDocumentEditor, /updateBlocks/);
  assert.match(visualDocumentEditor, /insertBlockAfter/);
  assert.match(visualDocumentEditor, /deleteBlock/);
  assert.match(visualDocumentEditor, /moveBlock/);
  assert.match(visualDocumentEditor, /createMarkdownBlock/);
  assert.match(visualDocumentEditor, /data-markdown-table-delete-row/);
  assert.match(visualDocumentEditor, /data-markdown-table-delete-column/);
  assert.match(visualDocumentEditor, /data-markdown-table-align-select/);
  assert.match(visualDocumentEditor, /新增/);
  assert.match(visualDocumentEditor, /删除/);
  assert.match(visualDocumentEditor, /上移 Markdown 块/);
  assert.match(visualDocumentEditor, /下移 Markdown 块/);
  assert.match(visualDocumentEditor, /extractMarkdownResourcePath/);
  assert.match(visualDocumentEditor, /replaceMarkdownResourcePath/);
  assert.match(visualDocumentEditor, /data-markdown-resource-inline-editor/);
  assert.match(visualDocumentEditor, /data-markdown-resource-path-input/);
  assert.match(visualDocumentEditor, /data-markdown-resource-dropzone/);
  assert.match(visualDocumentEditor, /data-markdown-resource-preview/);
  assert.match(visualDocumentEditor, /data-markdown-resource-copy-path/);
  assert.match(visualDocumentEditor, /data-markdown-resource-open/);
  assert.match(visualDocumentEditor, /MARKDOWN_FILE_MANAGER_DRAG_MIME/);
  assert.match(
    visualDocumentEditor,
    /application\/x-tracevane-file-manager-paths/,
  );
  assert.match(visualDocumentEditor, /resolveMarkdownResourcePreviewUrl/);
  assert.match(visualDocumentEditor, /resolveMarkdownResourcePath/);
  assert.match(visualDocumentEditor, /markdownResourcePreviewKind/);
  assert.match(visualDocumentEditor, /这里只修改路径，不执行上传/);
  assert.match(visualDocumentEditor, /MarkdownResourcePicker/);
  assert.match(visualDocumentEditor, /data-markdown-resource-picker/);
  assert.match(visualDocumentEditor, /useFilesBrowseQuery/);
  assert.match(visualDocumentEditor, /relativePathFromMarkdown/);
  assert.match(visualDocumentEditor, /markdownDirectoryPath/);
  assert.match(visualDocumentEditor, /parentDirectoryPath/);
  assert.match(visualDocumentEditor, /isMarkdownResourceCandidate/);
  assert.match(visualDocumentEditor, /MARKDOWN_IMAGE_EXTENSIONS/);
  assert.match(visualDocumentEditor, /MARKDOWN_MEDIA_EXTENSIONS/);
  assert.match(visualDocumentEditor, /资源选择器/);
  assert.match(visualDocumentEditor, /文档目录/);
  assert.match(
    visualDocumentEditor,
    /可选\{pickerKind === "image" \? "图片" : "媒体"\}/,
  );
  assert.match(visualDocumentEditor, /资源路径/);
  assert.match(visualDocumentEditor, /粘贴路径\/URL/);
  assert.match(
    visualDocumentEditor,
    /block\.kind === "image" \|\| block\.kind === "video"/,
  );
  assert.match(css, /\.md-preview__article video/);
  assert.match(css, /\.md-preview__article audio/);
  assert.match(
    css,
    /\.md-preview__article li input\[type="checkbox"\]\.md-preview__task-toggle/,
  );
  assert.match(css, /max-height: 62vh/);
});

// ---------------------------------------------------------------------------
// Terminal remains xterm.js-backed.
// ---------------------------------------------------------------------------

test("WorkspaceTerminal imports @xterm/xterm", () => {
  const terminal = read("features/workspace/terminal/WorkspaceTerminal.tsx");
  const terminalSessionActions = read(
    "features/workspace/terminal/terminalSessionActions.tsx",
  );
  const terminalPanelCommands = read(
    "features/workspace/terminal/terminalPanelCommands.tsx",
  );
  const query = read("lib/query/terminal.ts");
  const api = read("lib/api/terminal.ts");
  assert.ok(
    terminal.includes("@xterm/xterm"),
    "WorkspaceTerminal must import @xterm/xterm",
  );
  assert.match(terminal, /useCreateTerminalSessionMutation/);
  assert.match(terminal, /useEndTerminalSessionMutation/);
  assert.match(terminal, /useDeleteTerminalSessionMutation/);
  assert.match(terminal, /data-workspace-terminal-session-menu/);
  assert.match(terminal, /createTerminalSessionActions/);
  assert.match(terminal, /createTerminalPanelCommands/);
  assert.match(terminal, /onCommandsChange\?\.\(terminalCommands\)/);
  assert.match(terminal, /AI 终端诊断入口已预留/);
  assert.match(terminal, /data-terminal-session-action=\{action\.id\}/);
  assert.doesNotMatch(terminal, /<TerminalMenuButton onClick=\{onEnd\}/);
  assert.match(
    terminalSessionActions,
    /export interface TerminalSessionAction/,
  );
  assert.match(
    terminalSessionActions,
    /export interface TerminalSessionActionRegistryInput/,
  );
  assert.match(terminalSessionActions, /createTerminalSessionActions/);
  assert.match(terminalSessionActions, /terminal\.session\.new/);
  assert.match(terminalSessionActions, /terminal\.session\.end/);
  assert.match(terminalSessionActions, /terminal\.session\.delete/);
  assert.match(terminalSessionActions, /terminal\.session\.copyCwd/);
  assert.match(terminalSessionActions, /复制 cwd/);
  assert.match(terminalSessionActions, /结束会话/);
  assert.match(terminalSessionActions, /删除记录/);
  assert.match(
    terminalPanelCommands,
    /export interface TerminalPanelCommandRegistryInput/,
  );
  assert.match(terminalPanelCommands, /createTerminalPanelCommands/);
  assert.match(terminalPanelCommands, /terminal\.panel\.new/);
  assert.match(terminalPanelCommands, /terminal\.panel\.endActive/);
  assert.match(terminalPanelCommands, /terminal\.panel\.deleteActive/);
  assert.match(terminalPanelCommands, /terminal\.panel\.copyCwd/);
  assert.match(terminalPanelCommands, /terminal\.panel\.ai\.diagnose/);
  assert.match(terminalPanelCommands, /group: "终端"/);
  assert.match(terminal, /attachableSessions/);
  assert.match(terminal, /session\.canResume/);
  assert.match(terminal, /已不可恢复/);
  assert.doesNotMatch(
    terminal,
    /fetch\(`\$\{STREAM_BASE\}\/\$\{encodeURIComponent\(newId\)\}\/stream`/,
  );
  assert.match(query, /useCreateTerminalSessionMutation/);
  assert.match(api, /createTerminalSession/);
  assert.match(api, /`\$\{BASE\}\/sessions`/);
});

test("Workspace editor keeps document modes inside the file canvas and expands Monaco language support", () => {
  const stage = read("features/workspace/editor/WorkspaceEditorStage.tsx");
  const tabs = read("features/workspace/editor/EditorTabs.tsx");
  const editor = read("features/workspace/editor/CodeEditor.tsx");
  assert.match(stage, /WorkspaceDocumentModePalette/);
  assert.match(stage, /absolute right-3 top-3/);
  assert.match(stage, /data-workspace-editor-mode=\{mode\.id\}/);
  assert.doesNotMatch(tabs, /当前文件标签页内视图模式/);
  assert.doesNotMatch(tabs, /activeModeLabel/);
  assert.doesNotMatch(editor, /runEditorAction/);
  assert.doesNotMatch(editor, /editor\.action\.startFindReplaceAction/);
  for (const contribution of [
    "go",
    "rust",
    "java",
    "php",
    "ruby",
    "dockerfile",
    "cpp",
    "csharp",
    "javascript",
    "typescript",
    "scss",
    "less",
    "bat",
    "powershell",
    "ini",
    "lua",
    "graphql",
    "hcl",
    "protobuf",
  ]) {
    assert.match(
      editor,
      new RegExp(
        `basic-languages/${contribution}/${contribution}\.contribution`,
      ),
    );
  }
  assert.match(editor, /monaco\.languages\.getLanguages\(\)/);
  assert.match(editor, /language\.filenames \?\? \[\]/);
  assert.match(editor, /language\.extensions \?\? \[\]/);
  assert.match(editor, /extensions\.sort/);
  assert.match(editor, /fileName\.endsWith\("\.vue"\)/);
  assert.match(editor, /fileName\.endsWith\("\.svelte"\)/);
  assert.match(editor, /fileName\.endsWith\("\.toml"\)/);
  assert.doesNotMatch(editor, /EXTENSION_LANGUAGE_MAP/);
  assert.doesNotMatch(editor, /COMPOUND_EXTENSION_LANGUAGE_MAP/);
  assert.doesNotMatch(editor, /FILE_NAME_LANGUAGE_MAP/);
});

test("Workspace explorer supports address-bar cwd, path copy, terminal drop, and upload auto-clear", () => {
  const explorer = read("features/workspace/files/WorkspaceExplorer.tsx");
  const fileTree = read("features/workspace/files/FileTree.tsx");
  const actionsMenu = read("features/workspace/files/FileActionsMenu.tsx");
  const terminal = read("features/workspace/terminal/WorkspaceTerminal.tsx");
  const terminalSessionActions = read(
    "features/workspace/terminal/terminalSessionActions.tsx",
  );
  const terminalPanelCommands = read(
    "features/workspace/terminal/terminalPanelCommands.tsx",
  );
  const workbench = read("features/workspace/workbench/WorkspaceWorkbench.tsx");

  assert.match(explorer, /data-workspace-explorer-address-bar/);
  assert.match(explorer, /data-workspace-explorer-path-input/);
  assert.match(explorer, /data-workspace-explorer-default-directory/);
  assert.match(explorer, /appliedDefaultRootRef/);
  assert.match(explorer, /appliedDefaultRootRef\.current === rootId/);
  assert.match(explorer, /const initialDirectory =/);
  assert.match(explorer, /basePath=""/);
  assert.doesNotMatch(explorer, /basePath=\{workspaceBaseDirectory\}/);
  assert.match(
    explorer,
    /className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden outline-none"/,
  );
  assert.match(actionsMenu, /onSetDefaultDirectoryRequest/);
  assert.match(actionsMenu, /设为工作区主目录/);
  assert.match(fileTree, /basePath\?: string/);
  assert.match(fileTree, /path=\{basePath\}/);
  assert.match(explorer, /tracevane\.workspace\.default-directory\.v1/);
  assert.match(explorer, /normalizeWorkspacePathInput/);
  assert.match(explorer, /onWorkspaceDirectoryChange\?\.\(/);
  assert.match(explorer, /setUploadJobs\(\[\]\)/);
  assert.match(
    explorer,
    /saveUploadTaskSnapshots\(WORKSPACE_UPLOAD_TASK_SNAPSHOT_KEY, \[\]\)/,
  );

  assert.match(actionsMenu, /onCopyPathRequest/);
  assert.match(actionsMenu, /复制相对路径/);
  assert.match(actionsMenu, /复制绝对路径/);
  assert.match(explorer, /navigator\.clipboard\.writeText/);

  assert.match(fileTree, /focusedPath\?: string/);
  assert.match(fileTree, /rootAbsolutePath\?: string/);
  assert.match(fileTree, /draggable/);
  assert.match(fileTree, /application\/x-tracevane-file-absolute-path/);
  assert.match(fileTree, /shellQuotePath/);

  assert.match(workbench, /workspaceDirectory/);
  assert.match(
    workbench,
    /onWorkspaceDirectoryChange=\{setWorkspaceDirectory\}/,
  );
  assert.match(workbench, /useMediaQuery\("\(max-width: 768px\)"\)/);
  assert.match(workbench, /data-workspace-responsive-shell/);
  assert.match(
    workbench,
    /data-workspace-mobile=\{isMobileWorkbench \? "true" : "false"\}/,
  );
  assert.match(workbench, /data-workspace-main-stage/);
  assert.match(workbench, /data-workspace-mobile-inline-panels/);
  assert.match(workbench, /data-workspace-mobile-panel-dock/);
  assert.match(workbench, /data-workspace-mobile-nav/);
  assert.match(workbench, /grid-rows-\[minmax\(0,1fr\)_minmax\(0,42dvh\)\]/);
  assert.doesNotMatch(workbench, /data-workspace-mobile-side-sheet/);
  assert.doesNotMatch(workbench, /fixed inset-x-3 bottom-16 top-12/);
  assert.match(workbench, /sidePanelTitle\(activeSidePanel\)/);
  assert.match(terminal, /cwd: workspaceDirectory\?\.absolutePath \?\? null/);
  assert.match(terminal, /data-workspace-terminal-drop-target/);
  assert.match(terminal, /application\/x-tracevane-file-absolute-path/);
  assert.match(terminal, /termRef\.current\?\.paste\(data\)/);
  assert.match(terminal, /createTerminalPanelCommands/);
  assert.match(terminal, /terminalCommands/);
  assert.match(terminalPanelCommands, /terminal\.panel\.new/);
  assert.match(terminalPanelCommands, /terminal\.panel\.ai\.diagnose/);
  const gitPanel = read("features/workspace/git/WorkspaceGitPanel.tsx");
  const gitChangeActions = read("features/workspace/git/gitChangeActions.tsx");
  const gitPanelCommands = read("features/workspace/git/gitPanelCommands.tsx");
  assert.match(gitPanel, /createGitChangeActions/);
  assert.match(gitPanel, /createGitPanelCommands/);
  assert.match(gitPanel, /onCommandsChange\?\.\(gitCommands\)/);
  assert.match(gitPanel, /handleStageFiles/);
  assert.match(gitPanel, /handleUnstageFiles/);
  assert.match(gitPanel, /AI Git 总结入口已预留/);
  assert.match(gitPanel, /data-workspace-git-change-menu/);
  assert.match(gitPanel, /data-git-change-action=\{action\.id\}/);
  assert.match(gitPanel, /刷新 Git 状态/);
  assert.match(
    gitPanel,
    /copyPath: \(path\) => void navigator\.clipboard\.writeText\(path\)/,
  );
  assert.doesNotMatch(gitPanel, /<GitMenuButton onClick=\{onStage\}/);
  assert.match(gitChangeActions, /export interface GitChangeAction/);
  assert.match(
    gitChangeActions,
    /export interface GitChangeActionRegistryInput/,
  );
  assert.match(gitChangeActions, /createGitChangeActions/);
  assert.match(gitChangeActions, /git\.change\.openDiff/);
  assert.match(gitChangeActions, /git\.change\.stage/);
  assert.match(gitChangeActions, /git\.change\.unstage/);
  assert.match(gitChangeActions, /git\.change\.copyPath/);
  assert.match(gitChangeActions, /git\.change\.explain/);
  assert.match(gitChangeActions, /AI 解释 Diff/);
  assert.match(
    gitPanelCommands,
    /export interface GitPanelCommandRegistryInput/,
  );
  assert.match(gitPanelCommands, /createGitPanelCommands/);
  assert.match(gitPanelCommands, /git\.panel\.refresh/);
  assert.match(gitPanelCommands, /git\.panel\.stageAll/);
  assert.match(gitPanelCommands, /git\.panel\.unstageAll/);
  assert.match(gitPanelCommands, /git\.panel\.copyBranch/);
  assert.match(gitPanelCommands, /git\.panel\.explainStatus/);
  assert.match(gitPanelCommands, /group: "Git"/);
  assert.match(terminal, /would duplicate the dropped path/);
  assert.doesNotMatch(
    terminal,
    new RegExp(
      "sendInput\\(sessionId, data\\);\\s*sendInput\\(sessionId, data\\);",
    ),
  );
});
