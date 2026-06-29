import type { WorkspaceCommand } from "./workspaceCommands";

export interface WorkspaceCommandShortcutMatch {
  command: WorkspaceCommand;
  shortcut: string;
}

export function findWorkspaceCommandForShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key"
  >,
  commands: readonly WorkspaceCommand[],
): WorkspaceCommandShortcutMatch | null {
  for (const command of commands) {
    if (!command.shortcut || command.disabled) continue;
    if (matchesWorkspaceShortcut(event, command.shortcut)) {
      return { command, shortcut: command.shortcut };
    }
  }
  return null;
}

export function runWorkspaceShortcutCommand(
  event: KeyboardEvent,
  commands: readonly WorkspaceCommand[],
): boolean {
  if (shouldIgnoreWorkspaceShortcutEvent(event)) return false;
  const match = findWorkspaceCommandForShortcut(event, commands);
  if (!match) return false;
  event.preventDefault();
  match.command.run();
  return true;
}

export function matchesWorkspaceShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key"
  >,
  shortcut: string,
): boolean {
  const expected = parseWorkspaceShortcut(shortcut);
  if (!expected) return false;
  const key = normalizeShortcutKey(event.key);
  return (
    expected.key === key &&
    expected.alt === event.altKey &&
    expected.shift === event.shiftKey &&
    expected.ctrl === event.ctrlKey &&
    expected.meta === event.metaKey
  );
}

interface ParsedWorkspaceShortcut {
  key: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

export function shouldIgnoreWorkspaceShortcutEvent(
  event: KeyboardEvent,
): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-workspace-shortcuts=\"allow\"]")) return false;
  if (target.closest("[data-workspace-shortcuts=\"ignore\"]")) return true;
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if ((target as HTMLElement).isContentEditable) return true;
  if (
    target.closest(
      ".monaco-editor, .xterm, [role=\"textbox\"], [contenteditable=\"true\"]",
    )
  ) {
    return true;
  }
  return false;
}

function parseWorkspaceShortcut(
  shortcut: string,
): ParsedWorkspaceShortcut | null {
  const parts = shortcut
    .split(/[+\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const parsed: ParsedWorkspaceShortcut = {
    key: "",
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
  };
  for (const part of parts) {
    const token = part.toLowerCase();
    if (token === "alt" || token === "option" || token === "⌥") {
      parsed.alt = true;
    } else if (token === "ctrl" || token === "control") {
      parsed.ctrl = true;
    } else if (
      token === "cmd" ||
      token === "command" ||
      token === "meta" ||
      token === "⌘"
    ) {
      parsed.meta = true;
    } else if (token === "shift" || token === "⇧") {
      parsed.shift = true;
    } else {
      parsed.key = normalizeShortcutKey(part);
    }
  }
  return parsed.key ? parsed : null;
}

function normalizeShortcutKey(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (normalized === " ") return "space";
  if (normalized === "arrowup") return "up";
  if (normalized === "arrowdown") return "down";
  if (normalized === "arrowleft") return "left";
  if (normalized === "arrowright") return "right";
  return normalized;
}
