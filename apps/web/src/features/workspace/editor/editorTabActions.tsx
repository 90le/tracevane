import * as React from "react";
import {
  Columns2,
  Copy,
  FolderSearch,
  MessageSquarePlus,
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
  | "editor.tab.copyAiFileContext"
  | "editor.tab.splitRight"
  | "editor.tab.splitDown"
  | "editor.tab.moveToGroup";

export interface EditorTabAction {
  id: EditorTabActionId;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  shortcut?: string;
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
  copyAiFileContext,
  splitTab,
  moveTabToGroup,
}: EditorTabActionRegistryInput): EditorTabAction[] {
  return [
    {
      id: "editor.tab.close",
      label: "关闭",
      shortcut: "Ctrl+F4",
      icon: <X />,
      run: () => close(path),
    },
    {
      id: "editor.tab.closeAll",
      label: "全部关闭",
      shortcut: "Ctrl+K W",
      disabled: !canCloseAll || !closeAll,
      icon: <X />,
      run: () => closeAll?.(),
    },
    {
      id: "editor.tab.closeOthers",
      label: "关闭其它",
      disabled: !canCloseOthers || !closeOthers,
      icon: <PanelRightClose />,
      run: () => closeOthers?.(path),
    },
    {
      id: "editor.tab.closeSaved",
      label: "关闭已保存",
      shortcut: "Ctrl+K U",
      disabled: !canCloseSaved || !closeSaved,
      icon: <PanelRightClose />,
      run: () => closeSaved?.(),
    },
    {
      id: "editor.tab.closeLeft",
      label: "关闭左侧",
      disabled: !canCloseLeft || !closeLeft,
      icon: <PanelLeftClose />,
      run: () => closeLeft?.(path),
    },
    {
      id: "editor.tab.closeRight",
      label: "关闭右侧",
      disabled: !canCloseRight || !closeRight,
      icon: <PanelRightClose />,
      run: () => closeRight?.(path),
    },
    {
      id: "editor.tab.splitRight",
      label: "向右拆分",
      shortcut: "Ctrl+\\",
      disabled: !splitTab,
      separatorBefore: true,
      icon: <Columns2 />,
      run: () => splitTab?.(path, "right"),
    },
    {
      id: "editor.tab.splitDown",
      label: "向下拆分",
      disabled: !splitTab,
      icon: <Rows2 />,
      run: () => splitTab?.(path, "down"),
    },
    {
      id: "editor.tab.moveToGroup",
      label: "移动到新编辑组",
      disabled: !moveTabToGroup,
      icon: <MoveRight />,
      run: () => moveTabToGroup?.(path),
    },
    {
      id: "editor.tab.copyFileName",
      label: "复制文件名",
      disabled: !copyFileName,
      separatorBefore: true,
      icon: <Copy />,
      run: () => copyFileName?.(path),
    },
    {
      id: "editor.tab.copyPath",
      label: "复制路径",
      shortcut: "Shift+Alt+C",
      disabled: !copyPath,
      icon: <Copy />,
      run: () => copyPath?.(path),
    },
    {
      id: "editor.tab.copyRelativePath",
      label: "复制相对路径",
      shortcut: "Ctrl+K Ctrl+Shift+C",
      disabled: !copyRelativePath,
      icon: <Copy />,
      run: () => copyRelativePath?.(path),
    },
    {
      id: "editor.tab.revealInExplorer",
      label: "在资源管理器中显示",
      disabled: !revealInExplorer,
      icon: <FolderSearch />,
      run: () => revealInExplorer?.(path),
    },
    {
      id: "editor.tab.insertPathToTerminal",
      label: "插入路径到终端",
      disabled: !insertPathToTerminal,
      icon: <TerminalSquare />,
      run: () => insertPathToTerminal?.(path),
    },
    {
      id: "editor.tab.copyAiFileContext",
      label: "复制 @file 上下文",
      disabled: !copyAiFileContext,
      icon: <MessageSquarePlus />,
      run: () => copyAiFileContext?.(path),
    },
  ];
}
