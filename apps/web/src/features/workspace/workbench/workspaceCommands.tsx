import * as React from "react";
import {
  FileCode2,
  Files,
  GitBranch,
  Keyboard,
  PanelLeftClose,
  RotateCcw,
  Search,
  TerminalSquare,
} from "lucide-react";

export type WorkspaceSidePanelCommand = "explorer" | "search" | "git";
export type WorkspaceDockPanelCommand = "editor" | "terminal";
export type WorkspaceCommandGroup =
  "导航" | "布局" | "Git" | "终端" | "编辑器" | "AI";

export interface WorkspaceCommand {
  id: string;
  group: WorkspaceCommandGroup;
  label: string;
  description: string;
  shortcut?: string;
  icon: React.ReactNode;
  disabled?: boolean;
  run: () => void;
}

export interface WorkspaceCommandRegistryInput {
  activePath?: string;
  sideOpen: boolean;
  openSidePanel: (panel: WorkspaceSidePanelCommand) => void;
  openDockPanel: (panel: WorkspaceDockPanelCommand) => void;
  closeSidePanel: () => void;
  resetLayout: () => void;
  resetKeymap?: () => void;
  keybindingOverrideCount?: number;
  keybindingConflictCount?: number;
  extensionCommands?: WorkspaceCommand[];
}

export const WORKSPACE_COMMAND_GROUPS: readonly WorkspaceCommandGroup[] = [
  "导航",
  "布局",
  "Git",
  "终端",
  "编辑器",
  "AI",
];

export function createWorkspaceCommandRegistry({
  activePath,
  sideOpen,
  openSidePanel,
  openDockPanel,
  closeSidePanel,
  resetLayout,
  resetKeymap,
  keybindingOverrideCount = 0,
  keybindingConflictCount = 0,
  extensionCommands = [],
}: WorkspaceCommandRegistryInput): WorkspaceCommand[] {
  return [
    {
      id: "workspace.files.focus",
      group: "导航",
      label: "打开资源管理器",
      description: "切换到文件树和 Workspace 文件操作",
      shortcut: "Alt 1",
      icon: <Files />,
      run: () => openSidePanel("explorer"),
    },
    {
      id: "workspace.search.focus",
      group: "导航",
      label: "打开搜索",
      description: "搜索当前工作区文件名与内容",
      shortcut: "Alt 2",
      icon: <Search />,
      run: () => openSidePanel("search"),
    },
    {
      id: "workspace.git.focus",
      group: "导航",
      label: "打开 Git",
      description: "查看变更、Diff、暂存和 AI Diff 入口",
      shortcut: "Alt 3",
      icon: <GitBranch />,
      run: () => openSidePanel("git"),
    },
    {
      id: "workspace.editor.focus",
      group: "导航",
      label: "聚焦编辑器",
      description: activePath ? `回到 ${activePath}` : "回到主编辑画布",
      shortcut: "Alt E",
      icon: <FileCode2 />,
      run: () => openDockPanel("editor"),
    },
    {
      id: "workspace.terminal.open",
      group: "导航",
      label: "打开终端",
      description: "创建或聚焦 Workspace 终端面板",
      shortcut: "Alt T",
      icon: <TerminalSquare />,
      run: () => openDockPanel("terminal"),
    },
    {
      id: "workspace.side.close",
      group: "布局",
      label: sideOpen ? "收起侧边面板" : "侧边面板已收起",
      description: "减少界面堆叠，把空间让给编辑器",
      icon: <PanelLeftClose />,
      run: closeSidePanel,
    },
    {
      id: "workspace.layout.reset",
      group: "布局",
      label: "重置工作区布局",
      description: "恢复 Dockview 默认布局并清理本地布局缓存",
      icon: <RotateCcw />,
      run: resetLayout,
    },
    {
      id: "workspace.keymap.reset",
      group: "布局",
      label: "重置工作区快捷键",
      description: keybindingConflictCount
        ? `清理自定义快捷键，当前有 ${keybindingConflictCount} 个冲突`
        : "恢复 Workspace 默认快捷键映射",
      icon: <Keyboard />,
      disabled: !resetKeymap || keybindingOverrideCount === 0,
      run: resetKeymap ?? (() => undefined),
    },
    ...extensionCommands,
    {
      id: "workspace.ai.context",
      group: "AI",
      label: "准备 AI 上下文入口",
      description: "后续接入 @file / @terminal / @git / @selection",
      icon: <Search />,
      run: () => openSidePanel("search"),
    },
  ];
}
