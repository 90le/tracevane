import * as React from "react";
import {
  FileCode2,
  Files,
  FolderTree,
  Maximize2,
  Minimize2,
  GitBranch,
  Keyboard,
  PanelLeftClose,
  RotateCcw,
  Search,
  TerminalSquare,
} from "lucide-react";

export type WorkspaceSidePanelCommand = "explorer" | "search" | "git";
export type WorkspaceDockPanelCommand =
  "editor" | "terminal" | WorkspaceSidePanelCommand;
export type WorkspaceCommandGroup =
  "导航" | "布局" | "Git" | "终端" | "编辑器" | "证据" | "AI";

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
  dockSidePanel?: (panel: WorkspaceSidePanelCommand) => void;
  openDockPanel: (panel: WorkspaceDockPanelCommand) => void;
  closeDockPanel?: (panel: WorkspaceDockPanelCommand) => void;
  toggleMaximizedDockPanel?: (panel: WorkspaceDockPanelCommand) => void;
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
  "证据",
  "AI",
];

export function createWorkspaceCommandRegistry({
  activePath,
  sideOpen,
  openSidePanel,
  dockSidePanel,
  openDockPanel,
  closeDockPanel,
  toggleMaximizedDockPanel,
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
      description: "查看变更、Diff、暂存和审查证据入口",
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
      id: "workspace.files.dock",
      group: "布局",
      label: "停靠资源管理器到工作区",
      description: "把文件树作为 Dockview 面板参与编辑器/终端拆分组合",
      icon: <FolderTree />,
      disabled: !dockSidePanel,
      run: () => dockSidePanel?.("explorer"),
    },
    {
      id: "workspace.search.dock",
      group: "布局",
      label: "停靠搜索到工作区",
      description: "把搜索面板作为可拖拽窗口参与组合布局",
      icon: <Search />,
      disabled: !dockSidePanel,
      run: () => dockSidePanel?.("search"),
    },
    {
      id: "workspace.git.dock",
      group: "布局",
      label: "停靠 Git 到工作区",
      description: "把源代码管理面板停靠到 Dockview，便于和 Diff/终端并排",
      icon: <GitBranch />,
      disabled: !dockSidePanel,
      run: () => dockSidePanel?.("git"),
    },
    {
      id: "workspace.files.maximize",
      group: "布局",
      label: "最大化资源管理器",
      description: "把已停靠的资源管理器临时放大为沉浸式面板，再次执行恢复组合布局",
      icon: <Maximize2 />,
      disabled: !toggleMaximizedDockPanel,
      run: () => toggleMaximizedDockPanel?.("explorer"),
    },
    {
      id: "workspace.search.maximize",
      group: "布局",
      label: "最大化搜索面板",
      description: "把已停靠的搜索替换面板临时放大，方便批量检索和替换前审阅",
      icon: <Maximize2 />,
      disabled: !toggleMaximizedDockPanel,
      run: () => toggleMaximizedDockPanel?.("search"),
    },
    {
      id: "workspace.git.maximize",
      group: "布局",
      label: "最大化 Git 面板",
      description: "把已停靠的源代码管理面板临时放大，方便查看变更、分支和提交上下文",
      icon: <Maximize2 />,
      disabled: !toggleMaximizedDockPanel,
      run: () => toggleMaximizedDockPanel?.("git"),
    },
    {
      id: "workspace.side.close",
      group: "布局",
      label: sideOpen ? "收起侧边面板" : "侧边面板已收起",
      description: sideOpen
        ? "减少界面堆叠，把空间让给编辑器"
        : "侧边面板当前已经收起",
      icon: <PanelLeftClose />,
      disabled: !sideOpen,
      run: closeSidePanel,
    },

    {
      id: "workspace.editor.maximize",
      group: "布局",
      label: "最大化编辑器工作区",
      description: "临时收起干扰，把当前代码编辑器和 IDE 主舞台全屏化",
      icon: <Maximize2 />,
      disabled: !toggleMaximizedDockPanel,
      run: () => toggleMaximizedDockPanel?.("editor"),
    },
    {
      id: "workspace.terminal.maximize",
      group: "布局",
      label: "最大化终端区",
      description: "终端排错时一键占满工作台，再次执行恢复",
      icon: <Minimize2 />,
      disabled: !toggleMaximizedDockPanel,
      run: () => toggleMaximizedDockPanel?.("terminal"),
    },
    {
      id: "workspace.terminal.closePanel",
      group: "布局",
      label: "关闭终端面板",
      description: "关闭 Dockview 终端区域，需要时可重新打开",
      icon: <TerminalSquare />,
      disabled: !closeDockPanel,
      run: () => closeDockPanel?.("terminal"),
    },
    {
      id: "workspace.files.closePanel",
      group: "布局",
      label: "关闭资源管理器 Dock 面板",
      description: "关闭已停靠的资源管理器；左侧/底部入口仍可继续打开固定资源管理器",
      icon: <FolderTree />,
      disabled: !closeDockPanel,
      run: () => closeDockPanel?.("explorer"),
    },
    {
      id: "workspace.search.closePanel",
      group: "布局",
      label: "关闭搜索 Dock 面板",
      description: "关闭已停靠的搜索替换窗口；需要时可从搜索入口重新打开",
      icon: <Search />,
      disabled: !closeDockPanel,
      run: () => closeDockPanel?.("search"),
    },
    {
      id: "workspace.git.closePanel",
      group: "布局",
      label: "关闭 Git Dock 面板",
      description: "关闭已停靠的源代码管理窗口；Git 入口仍保留在侧边导航和命令面板中",
      icon: <GitBranch />,
      disabled: !closeDockPanel,
      run: () => closeDockPanel?.("git"),
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
      group: "证据",
      label: "准备 IDE 上下文证据",
      description: "收集 @file / @terminal / @git / @selection，交给 AI 扩展前先形成可审查证据",
      icon: <Search />,
      run: () => openSidePanel("search"),
    },
  ];
}
