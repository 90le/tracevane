import * as React from "react";
import {
  Clipboard,
  Columns2,
  Eraser,
  Edit3,
  Expand,
  Minimize2,
  Menu,
  MessageSquarePlus,
  Minus,
  MoveRight,
  Plus,
  RotateCcw,
  Rows2,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";

import type { TerminalSessionDescriptor } from "@/features/workspace/shared/types";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";

export interface TerminalPanelCommandRegistryInput {
  activeSession: TerminalSessionDescriptor | null;
  cwd: string;
  creating: boolean;
  archivedCount: number;
  fontSize: number;
  createSession: () => void;
  closeOtherSessions?: (session: TerminalSessionDescriptor) => void;
  closeRightSessions?: (session: TerminalSessionDescriptor) => void;
  rightSessionCount: number;
  renameSession: (session: TerminalSessionDescriptor) => void;
  splitSession: (
    session: TerminalSessionDescriptor,
    direction: "right" | "down",
  ) => void;
  moveSessionToEditor: (session: TerminalSessionDescriptor) => void;
  clearSession: (sessionId: string) => void;
  copyOutput: (sessionId: string) => void;
  copyAiContext: (session: TerminalSessionDescriptor) => void;
  insertCwd: (sessionId: string, cwd: string) => void;
  endSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  clearArchivedSessions: () => void;
  copyCwd: (cwd: string) => void;
  decreaseFontSize: () => void;
  increaseFontSize: () => void;
  resetFontSize: () => void;
  maximized: boolean;
  browserFullscreen: boolean;
  browserFullscreenAvailable: boolean;
  toggleMaximize?: () => void;
  toggleBrowserFullscreen?: () => void;
  openActiveSessionActions?: (session: TerminalSessionDescriptor) => void;
  diagnoseOutput: () => void;
}

export function createTerminalPanelCommands({
  activeSession,
  cwd,
  creating,
  archivedCount,
  fontSize,
  createSession,
  closeOtherSessions,
  closeRightSessions,
  rightSessionCount,
  renameSession,
  splitSession,
  moveSessionToEditor,
  clearSession,
  copyOutput,
  copyAiContext,
  insertCwd,
  endSession,
  deleteSession,
  clearArchivedSessions,
  copyCwd,
  decreaseFontSize,
  increaseFontSize,
  resetFontSize,
  maximized,
  browserFullscreen,
  browserFullscreenAvailable,
  toggleMaximize,
  toggleBrowserFullscreen,
  openActiveSessionActions,
  diagnoseOutput,
}: TerminalPanelCommandRegistryInput): WorkspaceCommand[] {
  const activeSessionId = activeSession?.sessionId ?? "";
  return [
    {
      id: "terminal.panel.new",
      group: "终端",
      label: "终端：新建会话",
      description: "在当前 Workspace 目录打开新终端",
      shortcut: "Alt T",
      icon: <Plus />,
      disabled: creating,
      run: createSession,
    },
    {
      id: "terminal.panel.closeOthers",
      group: "终端",
      label: "终端：关闭其它会话",
      description: activeSessionId
        ? `保留 ${activeSession?.title || activeSessionId}，结束其它可恢复终端`
        : "当前没有可保留的终端会话",
      icon: <Square />,
      disabled: !activeSession?.canResume || !closeOtherSessions,
      run: () => {
        if (activeSession) closeOtherSessions?.(activeSession);
      },
    },
    {
      id: "terminal.panel.closeRight",
      group: "终端",
      label: "终端：关闭右侧会话",
      description: rightSessionCount > 0
        ? `结束当前标签右侧 ${rightSessionCount} 个可恢复终端`
        : "当前终端右侧没有可关闭会话",
      icon: <Square />,
      disabled: !activeSession?.canResume || !closeRightSessions || rightSessionCount === 0,
      run: () => {
        if (activeSession) closeRightSessions?.(activeSession);
      },
    },
    {
      id: "terminal.panel.renameActive",
      group: "终端",
      label: "终端：重命名当前会话",
      description: activeSessionId
        ? `修改 ${activeSession?.title || activeSessionId} 的显示名称`
        : "当前没有可重命名的终端会话",
      icon: <Edit3 />,
      disabled: !activeSession,
      run: () => {
        if (activeSession) renameSession(activeSession);
      },
    },
    {
      id: "terminal.panel.splitRight",
      group: "终端",
      label: "终端：向右拆分当前会话",
      description: activeSessionId
        ? `在 ${activeSession?.title || activeSessionId} 的 cwd 创建右侧拆分终端`
        : "当前没有可拆分的终端会话",
      icon: <Columns2 />,
      disabled: !activeSession?.canResume || creating,
      run: () => {
        if (activeSession) splitSession(activeSession, "right");
      },
    },
    {
      id: "terminal.panel.splitDown",
      group: "终端",
      label: "终端：向下拆分当前会话",
      description: activeSessionId
        ? `在 ${activeSession?.title || activeSessionId} 的 cwd 创建下方拆分终端`
        : "当前没有可拆分的终端会话",
      icon: <Rows2 />,
      disabled: !activeSession?.canResume || creating,
      run: () => {
        if (activeSession) splitSession(activeSession, "down");
      },
    },
    {
      id: "terminal.panel.moveToEditor",
      group: "终端",
      label: "终端：停靠到 IDE 主工作区",
      description: activeSessionId
        ? "把当前终端作为一等 IDE 面板参与工作区布局，而不是伪装成编辑器标签"
        : "当前没有可停靠的终端会话",
      icon: <MoveRight />,
      disabled: !activeSession?.canResume,
      run: () => {
        if (activeSession) moveSessionToEditor(activeSession);
      },
    },
    {
      id: "terminal.panel.clearActive",
      group: "终端",
      label: "终端：清屏",
      description: activeSessionId
        ? `清理 ${activeSession?.title || activeSessionId} 的当前显示缓冲`
        : "当前没有可清屏的终端会话",
      icon: <Eraser />,
      disabled: !activeSession?.canResume,
      run: () => {
        if (activeSessionId) clearSession(activeSessionId);
      },
    },
    {
      id: "terminal.panel.copyOutput",
      group: "终端",
      label: "终端：复制当前输出",
      description: activeSessionId
        ? `复制 ${activeSession?.title || activeSessionId} 的可见输出`
        : "当前没有可复制输出的终端会话",
      icon: <Clipboard />,
      disabled: !activeSession?.canResume,
      run: () => {
        if (activeSessionId) copyOutput(activeSessionId);
      },
    },
    {
      id: "terminal.panel.copyAiContext",
      group: "终端",
      label: "终端：复制上下文证据",
      description: activeSessionId
        ? `复制 @terminal ${activeSession?.title || activeSessionId} 作为可审查终端证据`
        : "当前没有可复制上下文证据的终端会话",
      icon: <MessageSquarePlus />,
      disabled: !activeSession,
      run: () => {
        if (activeSession) copyAiContext(activeSession);
      },
    },
    {
      id: "terminal.panel.openActions",
      group: "终端",
      label: "终端：打开会话操作菜单",
      description: activeSessionId
        ? `以触屏友好的方式管理 ${activeSession?.title || activeSessionId}`
        : "当前没有可管理的终端会话",
      icon: <Menu />,
      disabled: !activeSession || !openActiveSessionActions,
      run: () => {
        if (activeSession) openActiveSessionActions?.(activeSession);
      },
    },
    {
      id: "terminal.panel.endActive",
      group: "终端",
      label: "终端：结束当前会话",
      description: activeSessionId
        ? `结束 ${activeSession?.title || activeSessionId}`
        : "当前没有可结束的终端会话",
      icon: <Square />,
      disabled: !activeSession?.canResume,
      run: () => {
        if (activeSessionId) endSession(activeSessionId);
      },
    },
    {
      id: "terminal.panel.deleteActive",
      group: "终端",
      label: activeSession?.canResume
        ? "终端：关闭并删除当前会话"
        : "终端：删除当前记录",
      description: activeSessionId
        ? activeSession?.canResume
          ? `先结束 ${activeSession?.title || activeSessionId}，再删除会话记录`
          : `删除 ${activeSession?.title || activeSessionId} 的会话记录`
        : "当前没有可删除的终端记录",
      icon: <Trash2 />,
      disabled: !activeSessionId,
      run: () => {
        if (activeSessionId) deleteSession(activeSessionId);
      },
    },
    {
      id: "terminal.panel.clearArchived",
      group: "终端",
      label: "终端：清理已结束记录",
      description:
        archivedCount > 0
          ? `删除 ${archivedCount} 条不可恢复终端历史记录`
          : "没有需要清理的终端历史记录",
      icon: <Trash2 />,
      disabled: archivedCount === 0,
      run: clearArchivedSessions,
    },


    {
      id: "terminal.panel.toggleInterfaceFullscreen",
      group: "终端",
      label: maximized ? "终端：恢复界面全屏" : "终端：界面全屏",
      description: maximized
        ? "恢复终端在当前 Workspace 布局中的尺寸"
        : "将终端最大化到当前 Workspace 布局内，保留应用导航能力",
      icon: maximized ? <Minimize2 /> : <Expand />,
      disabled: !toggleMaximize,
      run: () => toggleMaximize?.(),
    },
    {
      id: "terminal.panel.toggleBrowserFullscreen",
      group: "终端",
      label: browserFullscreen ? "终端：退出真实全屏" : "终端：真实全屏",
      description: browserFullscreenAvailable
        ? browserFullscreen
          ? "退出浏览器 Fullscreen API 的真实全屏终端"
          : "进入浏览器 Fullscreen API 的沉浸终端，适合手机/平板专注操作"
        : "当前浏览器不支持真实全屏",
      icon: browserFullscreen ? <Minimize2 /> : <Expand />,
      disabled: !browserFullscreenAvailable || !toggleBrowserFullscreen,
      run: () => toggleBrowserFullscreen?.(),
    },
    {
      id: "terminal.panel.fontDecrease",
      group: "终端",
      label: "终端：缩小字体",
      description: `当前终端字体 ${fontSize}px，适合手机端快速适配阅读密度`,
      icon: <Minus />,
      disabled: fontSize <= 9,
      run: decreaseFontSize,
    },
    {
      id: "terminal.panel.fontIncrease",
      group: "终端",
      label: "终端：放大字体",
      description: `当前终端字体 ${fontSize}px，适合投屏或小字阅读`,
      icon: <Plus />,
      disabled: fontSize >= 18,
      run: increaseFontSize,
    },
    {
      id: "terminal.panel.fontReset",
      group: "终端",
      label: "终端：重置字体",
      description: "恢复当前设备推荐的终端字体大小",
      icon: <RotateCcw />,
      run: resetFontSize,
    },
    {
      id: "terminal.panel.copyCwd",
      group: "终端",
      label: "终端：复制当前 cwd 证据",
      description: cwd ? `复制当前工作目录：${cwd}` : "当前终端没有 cwd",
      icon: <Clipboard />,
      disabled: !cwd,
      run: () => copyCwd(cwd),
    },
    {
      id: "terminal.panel.insertCwd",
      group: "终端",
      label: "终端：插入当前 cwd 到输入行",
      description: cwd
        ? `只把 ${cwd} 插入终端输入行，不自动执行命令`
        : "当前终端没有 cwd",
      icon: <Clipboard />,
      disabled: !activeSession?.canResume || !cwd,
      run: () => {
        if (activeSessionId) insertCwd(activeSessionId, cwd);
      },
    },
    {
      id: "terminal.panel.ai.diagnose",
      group: "终端",
      label: "终端：生成诊断证据摘要",
      description: "基于 @terminal output / cwd / session 形成可审查诊断上下文",
      icon: <TerminalSquare />,
      run: diagnoseOutput,
    },
  ];
}
