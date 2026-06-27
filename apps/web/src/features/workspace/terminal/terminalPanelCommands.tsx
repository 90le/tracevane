import * as React from "react";
import { Clipboard, Plus, Square, TerminalSquare, Trash2 } from "lucide-react";

import type { TerminalSessionDescriptor } from "@/features/workspace/shared/types";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";

export interface TerminalPanelCommandRegistryInput {
  activeSession: TerminalSessionDescriptor | null;
  cwd: string;
  creating: boolean;
  createSession: () => void;
  endSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  copyCwd: (cwd: string) => void;
  diagnoseOutput: () => void;
}

export function createTerminalPanelCommands({
  activeSession,
  cwd,
  creating,
  createSession,
  endSession,
  deleteSession,
  copyCwd,
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
      label: "终端：删除当前记录",
      description: activeSessionId
        ? `删除 ${activeSession?.title || activeSessionId} 的会话记录`
        : "当前没有可删除的终端记录",
      icon: <Trash2 />,
      disabled: !activeSessionId,
      run: () => {
        if (activeSessionId) deleteSession(activeSessionId);
      },
    },
    {
      id: "terminal.panel.copyCwd",
      group: "终端",
      label: "终端：复制当前 cwd",
      description: cwd || "当前终端没有 cwd",
      icon: <Clipboard />,
      disabled: !cwd,
      run: () => copyCwd(cwd),
    },
    {
      id: "terminal.panel.ai.diagnose",
      group: "终端",
      label: "终端：AI 诊断当前输出",
      description: "预留 @terminal output / cwd / session 上下文入口",
      icon: <TerminalSquare />,
      run: diagnoseOutput,
    },
  ];
}
