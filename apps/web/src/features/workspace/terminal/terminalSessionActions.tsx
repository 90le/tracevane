import * as React from "react";
import {
  Clipboard,
  Columns2,
  Eraser,
  Edit3,
  MessageSquarePlus,
  MoveRight,
  Plus,
  Rows2,
  Square,
  Trash2,
} from "lucide-react";

import type { TerminalSessionDescriptor } from "@/features/workspace/shared/types";

export type TerminalSessionActionId =
  | "terminal.session.new"
  | "terminal.session.closeOthers"
  | "terminal.session.closeRight"
  | "terminal.session.rename"
  | "terminal.session.splitRight"
  | "terminal.session.splitDown"
  | "terminal.session.moveToEditor"
  | "terminal.session.clear"
  | "terminal.session.copyOutput"
  | "terminal.session.copyEvidenceContext"
  | "terminal.session.end"
  | "terminal.session.delete"
  | "terminal.session.insertCwd"
  | "terminal.session.copyCwd";

export interface TerminalSessionAction {
  id: TerminalSessionActionId;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  shortcut?: string;
  icon: React.ReactNode;
  run: () => void;
}

export interface TerminalSessionActionRegistryInput {
  session: TerminalSessionDescriptor;
  cwd: string;
  createSession: () => void;
  closeOtherSessions?: (session: TerminalSessionDescriptor) => void;
  closeRightSessions?: (session: TerminalSessionDescriptor) => void;
  rightSessionCount?: number;
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
  copyCwd: (cwd: string) => void;
}

export function createTerminalSessionActions({
  session,
  cwd,
  createSession,
  closeOtherSessions,
  closeRightSessions,
  rightSessionCount = 0,
  renameSession,
  splitSession,
  moveSessionToEditor,
  clearSession,
  copyOutput,
  copyAiContext,
  insertCwd,
  endSession,
  deleteSession,
  copyCwd,
}: TerminalSessionActionRegistryInput): TerminalSessionAction[] {
  return [
    {
      id: "terminal.session.new",
      label: "新建终端",
      shortcut: "Ctrl+Shift+`",
      icon: <Plus />,
      run: createSession,
    },
    {
      id: "terminal.session.closeOthers",
      label: "关闭其它终端",
      disabled: !closeOtherSessions,
      icon: <Square />,
      run: () => closeOtherSessions?.(session),
    },
    {
      id: "terminal.session.closeRight",
      label: "关闭右侧终端",
      disabled: !closeRightSessions || rightSessionCount === 0,
      icon: <Square />,
      run: () => closeRightSessions?.(session),
    },
    {
      id: "terminal.session.rename",
      label: "重命名",
      shortcut: "F2",
      icon: <Edit3 />,
      run: () => renameSession(session),
    },
    {
      id: "terminal.session.splitRight",
      label: "向右拆分终端",
      shortcut: "Ctrl+Shift+5",
      disabled: !session.canResume,
      icon: <Columns2 />,
      run: () => splitSession(session, "right"),
    },
    {
      id: "terminal.session.splitDown",
      label: "向下拆分终端",
      disabled: !session.canResume,
      icon: <Rows2 />,
      run: () => splitSession(session, "down"),
    },
    {
      id: "terminal.session.moveToEditor",
      label: "停靠到 IDE 主工作区",
      disabled: !session.canResume,
      icon: <MoveRight />,
      run: () => moveSessionToEditor(session),
    },
    {
      id: "terminal.session.clear",
      label: "清屏",
      shortcut: "Ctrl+L",
      disabled: !session.canResume,
      icon: <Eraser />,
      run: () => clearSession(session.sessionId),
    },
    {
      id: "terminal.session.copyOutput",
      label: "复制输出",
      shortcut: "Ctrl+Shift+C",
      disabled: !session.canResume,
      icon: <Clipboard />,
      run: () => copyOutput(session.sessionId),
    },
    {
      id: "terminal.session.copyEvidenceContext",
      label: "复制上下文证据",
      icon: <MessageSquarePlus />,
      run: () => copyAiContext(session),
    },
    {
      id: "terminal.session.end",
      label: "结束会话",
      shortcut: "Delete",
      separatorBefore: true,
      disabled: !session.canResume,
      icon: <Square />,
      run: () => endSession(session.sessionId),
    },
    {
      id: "terminal.session.delete",
      label: session.canResume ? "关闭并删除终端" : "删除记录",
      icon: <Trash2 />,
      run: () => deleteSession(session.sessionId),
    },
    {
      id: "terminal.session.copyCwd",
      label: "复制 cwd 证据",
      disabled: !cwd,
      separatorBefore: true,
      icon: <Clipboard />,
      run: () => copyCwd(cwd),
    },
    {
      id: "terminal.session.insertCwd",
      label: "插入 cwd 到输入行",
      disabled: !cwd || !session.canResume,
      icon: <Clipboard />,
      run: () => insertCwd(session.sessionId, cwd),
    },
  ];
}
