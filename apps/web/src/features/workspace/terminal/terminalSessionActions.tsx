import * as React from "react";
import { Clipboard, Eraser, Edit3, Plus, Square, Trash2 } from "lucide-react";

import type { TerminalSessionDescriptor } from "@/features/workspace/shared/types";

export type TerminalSessionActionId =
  | "terminal.session.new"
  | "terminal.session.rename"
  | "terminal.session.clear"
  | "terminal.session.copyOutput"
  | "terminal.session.end"
  | "terminal.session.delete"
  | "terminal.session.copyCwd";

export interface TerminalSessionAction {
  id: TerminalSessionActionId;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  icon: React.ReactNode;
  run: () => void;
}

export interface TerminalSessionActionRegistryInput {
  session: TerminalSessionDescriptor;
  cwd: string;
  createSession: () => void;
  renameSession: (session: TerminalSessionDescriptor) => void;
  clearSession: (sessionId: string) => void;
  copyOutput: (sessionId: string) => void;
  endSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  copyCwd: (cwd: string) => void;
}

export function createTerminalSessionActions({
  session,
  cwd,
  createSession,
  renameSession,
  clearSession,
  copyOutput,
  endSession,
  deleteSession,
  copyCwd,
}: TerminalSessionActionRegistryInput): TerminalSessionAction[] {
  return [
    {
      id: "terminal.session.new",
      label: "新建终端",
      icon: <Plus />,
      run: createSession,
    },
    {
      id: "terminal.session.rename",
      label: "重命名",
      icon: <Edit3 />,
      run: () => renameSession(session),
    },
    {
      id: "terminal.session.clear",
      label: "清屏",
      disabled: !session.canResume,
      icon: <Eraser />,
      run: () => clearSession(session.sessionId),
    },
    {
      id: "terminal.session.copyOutput",
      label: "复制输出",
      disabled: !session.canResume,
      icon: <Clipboard />,
      run: () => copyOutput(session.sessionId),
    },
    {
      id: "terminal.session.end",
      label: "结束会话",
      separatorBefore: true,
      disabled: !session.canResume,
      icon: <Square />,
      run: () => endSession(session.sessionId),
    },
    {
      id: "terminal.session.delete",
      label: "删除记录",
      icon: <Trash2 />,
      run: () => deleteSession(session.sessionId),
    },
    {
      id: "terminal.session.copyCwd",
      label: "复制 cwd",
      disabled: !cwd,
      separatorBefore: true,
      icon: <Clipboard />,
      run: () => copyCwd(cwd),
    },
  ];
}
