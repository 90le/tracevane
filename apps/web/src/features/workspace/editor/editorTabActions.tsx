import * as React from "react";
import { Copy, PanelRightClose, X } from "lucide-react";

export type EditorTabActionId =
  | "editor.tab.close"
  | "editor.tab.closeOthers"
  | "editor.tab.closeRight"
  | "editor.tab.copyPath";

export interface EditorTabAction {
  id: EditorTabActionId;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  icon: React.ReactNode;
  run: () => void;
}

export interface EditorTabActionRegistryInput {
  path: string;
  canCloseOthers: boolean;
  canCloseRight: boolean;
  close: (path: string) => void;
  closeOthers?: (path: string) => void;
  closeRight?: (path: string) => void;
  copyPath?: (path: string) => void;
}

export function createEditorTabActions({
  path,
  canCloseOthers,
  canCloseRight,
  close,
  closeOthers,
  closeRight,
  copyPath,
}: EditorTabActionRegistryInput): EditorTabAction[] {
  return [
    {
      id: "editor.tab.close",
      label: "关闭",
      icon: <X />,
      run: () => close(path),
    },
    {
      id: "editor.tab.closeOthers",
      label: "关闭其它",
      disabled: !canCloseOthers || !closeOthers,
      icon: <PanelRightClose />,
      run: () => closeOthers?.(path),
    },
    {
      id: "editor.tab.closeRight",
      label: "关闭右侧",
      disabled: !canCloseRight || !closeRight,
      icon: <PanelRightClose />,
      run: () => closeRight?.(path),
    },
    {
      id: "editor.tab.copyPath",
      label: "复制路径",
      disabled: !copyPath,
      separatorBefore: true,
      icon: <Copy />,
      run: () => copyPath?.(path),
    },
  ];
}
