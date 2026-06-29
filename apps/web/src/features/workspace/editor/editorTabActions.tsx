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
  TerminalSquare,
  X,
} from "lucide-react";

export type EditorTabActionId =
  | "editor.tab.close"
  | "editor.tab.closeAll"
  | "editor.tab.closeOthers"
  | "editor.tab.closeSaved"
  | "editor.tab.closeLeft"
  | "editor.tab.closeRight"
  | "editor.tab.copyFileName"
  | "editor.tab.copyPath"
  | "editor.tab.copyRelativePath"
  | "editor.tab.revealInExplorer"
  | "editor.tab.insertPathToTerminal"
  | "editor.tab.copyFileEvidence"
  | "editor.tab.splitRight"
  | "editor.tab.splitDown"
  | "editor.tab.moveToGroup";

export type EditorTabActionRisk = "safe" | "mutating";
export type EditorTabActionSurface =
  | "tab-lifecycle"
  | "layout"
  | "clipboard"
  | "terminal"
  | "evidence"
  | "explorer";

export interface EditorTabAction {
  id: EditorTabActionId;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  shortcut?: string;
  risk: EditorTabActionRisk;
  surface: EditorTabActionSurface;
  icon: React.ReactNode;
  run: () => void;
}

export interface EditorTabActionRegistryInput {
  path: string;
  canCloseAll: boolean;
  canCloseOthers: boolean;
  canCloseSaved: boolean;
  canCloseLeft: boolean;
  canCloseRight: boolean;
  close: (path: string) => void;
  closeAll?: () => void;
  closeOthers?: (path: string) => void;
  closeSaved?: () => void;
  closeLeft?: (path: string) => void;
  closeRight?: (path: string) => void;
  copyFileName?: (path: string) => void;
  copyPath?: (path: string) => void;
  copyRelativePath?: (path: string) => void;
  revealInExplorer?: (path: string) => void;
  insertPathToTerminal?: (path: string) => void;
  copyFileEvidence?: (path: string) => void;
  /** @deprecated Use copyFileEvidence; kept while dirty callers migrate. */
  copyAiFileContext?: (path: string) => void;
  splitTab?: (path: string, direction: "right" | "down") => void;
  moveTabToGroup?: (path: string) => void;
}

export function createEditorTabActions({
  path,
  canCloseAll,
  canCloseOthers,
  canCloseSaved,
  canCloseLeft,
  canCloseRight,
  close,
  closeAll,
  closeOthers,
  closeSaved,
  closeLeft,
  closeRight,
  copyFileName,
  copyPath,
  copyRelativePath,
  revealInExplorer,
  insertPathToTerminal,
  copyFileEvidence,
  copyAiFileContext,
  splitTab,
  moveTabToGroup,
}: EditorTabActionRegistryInput): EditorTabAction[] {
  const copyEvidence = copyFileEvidence ?? copyAiFileContext;
  return [
    {
      id: "editor.tab.close",
      label: "关闭",
      shortcut: "Ctrl+F4",
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <X />,
      run: () => close(path),
    },
    {
      id: "editor.tab.closeAll",
      label: "全部关闭",
      shortcut: "Ctrl+K W",
      disabled: !canCloseAll || !closeAll,
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <X />,
      run: () => closeAll?.(),
    },
    {
      id: "editor.tab.closeOthers",
      label: "关闭其它",
      disabled: !canCloseOthers || !closeOthers,
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <PanelRightClose />,
      run: () => closeOthers?.(path),
    },
    {
      id: "editor.tab.closeSaved",
      label: "关闭已保存",
      shortcut: "Ctrl+K U",
      disabled: !canCloseSaved || !closeSaved,
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <PanelRightClose />,
      run: () => closeSaved?.(),
    },
    {
      id: "editor.tab.closeLeft",
      label: "关闭左侧",
      disabled: !canCloseLeft || !closeLeft,
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <PanelLeftClose />,
      run: () => closeLeft?.(path),
    },
    {
      id: "editor.tab.closeRight",
      label: "关闭右侧",
      disabled: !canCloseRight || !closeRight,
      risk: "mutating",
      surface: "tab-lifecycle",
      icon: <PanelRightClose />,
      run: () => closeRight?.(path),
    },
    {
      id: "editor.tab.splitRight",
      label: "向右拆分",
      shortcut: "Ctrl+\\",
      disabled: !splitTab,
      separatorBefore: true,
      risk: "safe",
      surface: "layout",
      icon: <Columns2 />,
      run: () => splitTab?.(path, "right"),
    },
    {
      id: "editor.tab.splitDown",
      label: "向下拆分",
      disabled: !splitTab,
      risk: "safe",
      surface: "layout",
      icon: <Rows2 />,
      run: () => splitTab?.(path, "down"),
    },
    {
      id: "editor.tab.moveToGroup",
      label: "移动到新编辑组",
      disabled: !moveTabToGroup,
      risk: "safe",
      surface: "layout",
      icon: <MoveRight />,
      run: () => moveTabToGroup?.(path),
    },
    {
      id: "editor.tab.copyFileName",
      label: "复制文件名",
      disabled: !copyFileName,
      separatorBefore: true,
      risk: "safe",
      surface: "clipboard",
      icon: <Copy />,
      run: () => copyFileName?.(path),
    },
    {
      id: "editor.tab.copyPath",
      label: "复制路径",
      shortcut: "Shift+Alt+C",
      disabled: !copyPath,
      risk: "safe",
      surface: "clipboard",
      icon: <Copy />,
      run: () => copyPath?.(path),
    },
    {
      id: "editor.tab.copyRelativePath",
      label: "复制相对路径",
      shortcut: "Ctrl+K Ctrl+Shift+C",
      disabled: !copyRelativePath,
      risk: "safe",
      surface: "clipboard",
      icon: <Copy />,
      run: () => copyRelativePath?.(path),
    },
    {
      id: "editor.tab.revealInExplorer",
      label: "在资源管理器中显示",
      disabled: !revealInExplorer,
      risk: "safe",
      surface: "explorer",
      icon: <FolderSearch />,
      run: () => revealInExplorer?.(path),
    },
    {
      id: "editor.tab.insertPathToTerminal",
      label: "插入路径到终端",
      disabled: !insertPathToTerminal,
      risk: "safe",
      surface: "terminal",
      icon: <TerminalSquare />,
      run: () => insertPathToTerminal?.(path),
    },
    {
      id: "editor.tab.copyFileEvidence",
      label: "复制当前文件证据",
      disabled: !copyEvidence,
      risk: "safe",
      surface: "evidence",
      icon: <ClipboardCheck />,
      run: () => copyEvidence?.(path),
    },
  ];
}
