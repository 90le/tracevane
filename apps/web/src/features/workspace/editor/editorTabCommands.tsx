import * as React from "react";
import { Copy, PanelRightClose, Save, X } from "lucide-react";

import type { WorkspaceCommand } from "../workbench/workspaceCommands";

export interface EditorTabCommandRegistryInput {
  activePath: string | null;
  openTabs: string[];
  dirty: boolean;
  saving: boolean;
  saveActive: () => void;
  closeActive: (path: string) => void;
  closeOthers: (path: string) => void;
  closeRight: (path: string) => void;
  copyPath: (path: string) => void;
}

export function createEditorTabCommands({
  activePath,
  openTabs,
  dirty,
  saving,
  saveActive,
  closeActive,
  closeOthers,
  closeRight,
  copyPath,
}: EditorTabCommandRegistryInput): WorkspaceCommand[] {
  const activeName = activePath?.split("/").pop() || activePath || "当前文件";
  const activeIndex = activePath ? openTabs.indexOf(activePath) : -1;
  const hasActive = Boolean(activePath);
  return [
    {
      id: "editor.tab.saveActive",
      group: "编辑器",
      label: "编辑器：保存当前文件",
      description: dirty ? `保存 ${activeName}` : "当前文件没有未保存更改",
      shortcut: "Ctrl S",
      icon: <Save />,
      disabled: !hasActive || !dirty || saving,
      run: saveActive,
    },
    {
      id: "editor.tab.closeActive",
      group: "编辑器",
      label: "编辑器：关闭当前标签",
      description: hasActive ? `关闭 ${activeName}` : "当前没有打开的文件",
      icon: <X />,
      disabled: !activePath,
      run: () => activePath && closeActive(activePath),
    },
    {
      id: "editor.tab.closeOthers",
      group: "编辑器",
      label: "编辑器：关闭其它标签",
      description:
        hasActive && openTabs.length > 1
          ? `保留 ${activeName}，关闭其它 ${openTabs.length - 1} 个标签`
          : "没有其它标签可关闭",
      icon: <PanelRightClose />,
      disabled: !activePath || openTabs.length <= 1,
      run: () => activePath && closeOthers(activePath),
    },
    {
      id: "editor.tab.closeRight",
      group: "编辑器",
      label: "编辑器：关闭右侧标签",
      description:
        activeIndex >= 0 && activeIndex < openTabs.length - 1
          ? `关闭右侧 ${openTabs.length - activeIndex - 1} 个标签`
          : "右侧没有标签可关闭",
      icon: <PanelRightClose />,
      disabled: activeIndex < 0 || activeIndex >= openTabs.length - 1,
      run: () => activePath && closeRight(activePath),
    },
    {
      id: "editor.tab.copyPath",
      group: "编辑器",
      label: "编辑器：复制当前文件路径",
      description: activePath || "当前没有打开的文件",
      icon: <Copy />,
      disabled: !activePath,
      run: () => activePath && copyPath(activePath),
    },
  ];
}
