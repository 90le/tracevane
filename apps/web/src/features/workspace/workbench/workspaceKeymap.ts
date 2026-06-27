import type { WorkspaceCommand } from "./workspaceCommands";

export interface WorkspaceKeybindingOverride {
  commandId: string;
  shortcut: string | null;
}

export interface WorkspaceKeybindingConflict {
  shortcut: string;
  commandIds: string[];
}

export const WORKSPACE_KEYMAP_STORAGE_KEY = "tracevane.workspace.keymap.v1";

export function applyWorkspaceKeymap(
  commands: readonly WorkspaceCommand[],
  overrides: readonly WorkspaceKeybindingOverride[],
): WorkspaceCommand[] {
  if (overrides.length === 0) return [...commands];
  const overrideMap = new Map(
    overrides
      .filter((override) => override.commandId)
      .map((override) => [override.commandId, override.shortcut]),
  );
  return commands.map((command) => {
    if (!overrideMap.has(command.id)) return command;
    return {
      ...command,
      shortcut: overrideMap.get(command.id) || undefined,
    };
  });
}

export function getWorkspaceKeybindingConflicts(
  commands: readonly WorkspaceCommand[],
  overrides: readonly WorkspaceKeybindingOverride[] = [],
): WorkspaceKeybindingConflict[] {
  const effectiveCommands = applyWorkspaceKeymap(commands, overrides);
  const byShortcut = new Map<string, string[]>();
  for (const command of effectiveCommands) {
    if (!command.shortcut || command.disabled) continue;
    const shortcut = normalizeWorkspaceKeybinding(command.shortcut);
    if (!shortcut) continue;
    const commandIds = byShortcut.get(shortcut) ?? [];
    commandIds.push(command.id);
    byShortcut.set(shortcut, commandIds);
  }
  return [...byShortcut.entries()]
    .filter(([, commandIds]) => commandIds.length > 1)
    .map(([shortcut, commandIds]) => ({ shortcut, commandIds }));
}

export function loadWorkspaceKeymapOverrides(): WorkspaceKeybindingOverride[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEYMAP_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeWorkspaceKeymapOverrides(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function storeWorkspaceKeymapOverrides(
  overrides: readonly WorkspaceKeybindingOverride[],
): void {
  if (typeof window === "undefined") return;
  try {
    const sanitized = sanitizeWorkspaceKeymapOverrides(overrides);
    if (sanitized.length === 0) {
      window.localStorage.removeItem(WORKSPACE_KEYMAP_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      WORKSPACE_KEYMAP_STORAGE_KEY,
      JSON.stringify(sanitized),
    );
  } catch {
    // Keymap persistence is convenience-only; commands still use defaults.
  }
}

export function normalizeWorkspaceKeybinding(shortcut: string): string {
  return shortcut
    .split(/[+\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      if (part === "control") return "ctrl";
      if (part === "command" || part === "cmd" || part === "win") {
        return "meta";
      }
      if (part === "option") return "alt";
      if (part === "arrowup") return "up";
      if (part === "arrowdown") return "down";
      if (part === "arrowleft") return "left";
      if (part === "arrowright") return "right";
      return part;
    })
    .join("+");
}

function sanitizeWorkspaceKeymapOverrides(
  value: unknown,
): WorkspaceKeybindingOverride[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (typeof record.commandId !== "string") return null;
      if (record.shortcut !== null && typeof record.shortcut !== "string") {
        return null;
      }
      return {
        commandId: record.commandId,
        shortcut:
          typeof record.shortcut === "string"
            ? normalizeWorkspaceKeybinding(record.shortcut)
            : null,
      };
    })
    .filter((item): item is WorkspaceKeybindingOverride => Boolean(item));
}
