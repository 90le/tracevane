import * as React from "react";
import {
  Columns2,
  Copy,
  FolderSearch,
  ClipboardCheck,
  MoveRight,
  PanelLeftClose,
  PanelRightClose,
  Rows2,
  Save,
  TerminalSquare,
  X,
} from "lucide-react";

import type { WorkspaceCommand } from "../workbench/workspaceCommands";

export type EditorTabCommandRisk = "safe" | "mutating";
export type EditorTabCommandSurface =
  | "file-write"
  | "tab-lifecycle"
  | "layout"
  | "clipboard"
  | "terminal"
  | "evidence"
  | "explorer";

export interface EditorTabCommandMetadata {
  risk: EditorTabCommandRisk;
  surface: EditorTabCommandSurface;
}

export type EditorTabWorkspaceCommand = WorkspaceCommand & EditorTabCommandMetadata;

export interface EditorTabCommandRegistryInput {
  activePath: string | null;
  openTabs: string[];
  dirty: boolean;
  dirtyPathsCount: number;
  saving: boolean;
  saveActive: () => void;
  closeActive: (path: string) => void;
  closeAll: () => void;
  closeOthers: (path: string) => void;
  closeSaved: () => void;
  closeLeft: (path: string) => void;
  closeRight: (path: string) => void;
  copyFileName?: (path: string) => void;
  copyPath: (path: string) => void;
  copyRelativePath?: (path: string) => void;
  relativePathLabel?: string;
  revealInExplorer?: (path: string) => void;
  insertPathToTerminal?: (path: string) => void;
  copyFileEvidence?: (path: string) => void;
  /** @deprecated Use copyFileEvidence; kept while dirty callers migrate. */
  copyAiFileContext?: (path: string) => void;
  splitTab?: (path: string, direction: "right" | "down") => void;
  moveTabToGroup?: (path: string) => void;
}

export function createEditorTabCommands({
  activePath,
  openTabs,
  dirty,
  dirtyPathsCount,
  saving,
  saveActive,
  closeActive,
  closeAll,
  closeOthers,
  closeSaved,
  closeLeft,
  closeRight,
  copyFileName,
  copyPath,
  copyRelativePath,
  relativePathLabel,
  revealInExplorer,
  insertPathToTerminal,
  copyFileEvidence,
  copyAiFileContext,
  splitTab,
  moveTabToGroup,
}: EditorTabCommandRegistryInput): EditorTabWorkspaceCommand[] {
  const activeName = activePath?.split("/").pop() || activePath || "当前文件";
  const activeIndex = activePath ? openTabs.indexOf(activePath) : -1;
  const hasActive = Boolean(activePath);
  const savedCount = openTabs.length - dirtyPathsCount;
  const copyEvidence = copyFileEvidence ?? copyAiFileContext;
  return [
    {
      id: "editor.tab.saveActive",
      group: "编辑器",
      label: "编辑器：保存当前文件",
      description: dirty ? `保存 ${activeName}` : "当前文件没有未保存更改",
      shortcut: "Ctrl S",
      risk: "mutating",
      surface: "file-write",
      icon: <Save />,
      disabled: !hasActive || !dirty || saving,
      run: saveActive,
    },
    {
      id: "editor.tab.closeActive",
      group: "编辑器",
      label: "编辑器：关闭当前标签",
      description: hasActive ? `关闭 ${activeName}` : "当前没有打开的文件",
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <X />,
      disabled: !activePath,
      run: () => activePath && closeActive(activePath),
    },
    {
      id: "editor.tab.closeAll",
      group: "编辑器",
      label: "编辑器：关闭全部标签",
      description: openTabs.length
        ? `关闭全部 ${openTabs.length} 个标签`
        : "当前没有打开的文件",
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <X />,
      disabled: openTabs.length === 0,
      run: closeAll,
    },
    {
      id: "editor.tab.closeOthers",
      group: "编辑器",
      label: "编辑器：关闭其它标签",
      description:
        hasActive && openTabs.length > 1
          ? `保留 ${activeName}，关闭其它 ${openTabs.length - 1} 个标签`
          : "没有其它标签可关闭",
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <PanelRightClose />,
      disabled: !activePath || openTabs.length <= 1,
      run: () => activePath && closeOthers(activePath),
    },
    {
      id: "editor.tab.closeSaved",
      group: "编辑器",
      label: "编辑器：关闭已保存标签",
      description:
        savedCount > 0
          ? `关闭 ${savedCount} 个没有未保存更改的标签`
          : "没有已保存标签可关闭",
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <PanelRightClose />,
      disabled: savedCount <= 0,
      run: closeSaved,
    },
    {
      id: "editor.tab.closeLeft",
      group: "编辑器",
      label: "编辑器：关闭左侧标签",
      description:
        activeIndex > 0
          ? `关闭左侧 ${activeIndex} 个标签`
          : "左侧没有标签可关闭",
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <PanelLeftClose />,
      disabled: activeIndex <= 0,
      run: () => activePath && closeLeft(activePath),
    },
    {
      id: "editor.tab.closeRight",
      group: "编辑器",
      label: "编辑器：关闭右侧标签",
      description:
        activeIndex >= 0 && activeIndex < openTabs.length - 1
          ? `关闭右侧 ${openTabs.length - activeIndex - 1} 个标签`
          : "右侧没有标签可关闭",
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <PanelRightClose />,
      disabled: activeIndex < 0 || activeIndex >= openTabs.length - 1,
      run: () => activePath && closeRight(activePath),
    },
    {
      id: "editor.tab.splitRight",
      group: "编辑器",
      label: "编辑器：向右拆分当前标签",
      description: activePath
        ? `将 ${activeName} 放入右侧编辑组`
        : "当前没有打开的文件",
      risk: "safe",
      surface: "layout",
      icon: <Columns2 />,
      disabled: !activePath || !splitTab,
      run: () => activePath && splitTab?.(activePath, "right"),
    },
    {
      id: "editor.tab.splitDown",
      group: "编辑器",
      label: "编辑器：向下拆分当前标签",
      description: activePath
        ? `将 ${activeName} 放入下方编辑组`
        : "当前没有打开的文件",
      risk: "safe",
      surface: "layout",
      icon: <Rows2 />,
      disabled: !activePath || !splitTab,
      run: () => activePath && splitTab?.(activePath, "down"),
    },
    {
      id: "editor.tab.moveToGroup",
      group: "编辑器",
      label: "编辑器：移动当前标签到新组",
      description: !activePath
        ? "当前没有打开的文件"
        : moveTabToGroup
          ? `将 ${activeName} 移入新的编辑组`
          : "当前布局尚未开放编辑组移动",
      risk: "safe",
      surface: "layout",
      icon: <MoveRight />,
      disabled: !activePath || !moveTabToGroup,
      run: () => activePath && moveTabToGroup?.(activePath),
    },
    {
      id: "editor.tab.copyFileName",
      group: "编辑器",
      label: "编辑器：复制当前文件名",
      description: activeName,
      risk: "safe",
      surface: "clipboard",
      icon: <Copy />,
      disabled: !activePath || !copyFileName,
      run: () => activePath && copyFileName?.(activePath),
    },
    {
      id: "editor.tab.copyPath",
      group: "编辑器",
      label: "编辑器：复制当前文件路径",
      description: activePath || "当前没有打开的文件",
      risk: "safe",
      surface: "clipboard",
      icon: <Copy />,
      disabled: !activePath,
      run: () => activePath && copyPath(activePath),
    },
    {
      id: "editor.tab.copyRelativePath",
      group: "编辑器",
      label: "编辑器：复制当前文件相对路径",
      description: relativePathLabel || activePath || "当前没有打开的文件",
      risk: "safe",
      surface: "clipboard",
      icon: <Copy />,
      disabled: !activePath || !copyRelativePath,
      run: () => activePath && copyRelativePath?.(activePath),
    },
    {
      id: "editor.tab.revealInExplorer",
      group: "编辑器",
      label: "编辑器：在资源管理器中显示",
      description: activePath || "当前没有打开的文件",
      risk: "safe",
      surface: "explorer",
      icon: <FolderSearch />,
      disabled: !activePath || !revealInExplorer,
      run: () => activePath && revealInExplorer?.(activePath),
    },
    {
      id: "editor.tab.insertPathToTerminal",
      group: "编辑器",
      label: "编辑器：插入当前文件路径到终端",
      description: activePath || "当前没有打开的文件",
      risk: "safe",
      surface: "terminal",
      icon: <TerminalSquare />,
      disabled: !activePath || !insertPathToTerminal,
      run: () => activePath && insertPathToTerminal?.(activePath),
    },
    {
      id: "editor.tab.copyFileEvidence",
      group: "证据",
      label: "编辑器：复制当前文件证据",
      description: activePath
        ? `复制 @file ${relativePathLabel || activePath}，先形成可审查证据`
        : "当前没有打开的文件",
      risk: "safe",
      surface: "evidence",
      icon: <ClipboardCheck />,
      disabled: !activePath || !copyEvidence,
      run: () => activePath && copyEvidence?.(activePath),
    },
  ];
}
