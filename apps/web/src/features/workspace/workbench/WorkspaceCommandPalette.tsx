import * as React from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/design/ui/command";

import {
  WORKSPACE_COMMAND_GROUPS,
  type WorkspaceCommand,
} from "./workspaceCommands";
import type { WorkspaceKeybindingConflict } from "./workspaceKeymap";

export interface WorkspaceCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: WorkspaceCommand[];
  keybindingConflicts?: WorkspaceKeybindingConflict[];
}

export function WorkspaceCommandPalette({
  open,
  onOpenChange,
  commands,
  keybindingConflicts = [],
}: WorkspaceCommandPaletteProps) {
  const runCommand = React.useCallback(
    (command: WorkspaceCommand) => {
      if (command.disabled) return;
      onOpenChange(false);
      command.run();
    },
    [onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索 Workspace 命令、面板、AI 上下文…" />
      <CommandList data-workspace-command-palette>
        {keybindingConflicts.length ? (
          <div
            className="mx-2 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
            data-workspace-keybinding-conflicts
          >
            <span className="font-semibold">快捷键冲突：</span>
            {keybindingConflicts
              .map(
                (conflict) =>
                  `${conflict.shortcut} → ${conflict.commandIds.length} 个命令`,
              )
              .join("；")}
          </div>
        ) : null}
        <CommandEmpty>没有匹配的 Workspace 命令</CommandEmpty>
        {WORKSPACE_COMMAND_GROUPS.map((group) => (
          <CommandGroup key={group} heading={group}>
            {commands
              .filter((command) => command.group === group)
              .map((command) => (
                <CommandItem
                  key={command.id}
                  value={`${command.label} ${command.description}`}
                  onSelect={() => runCommand(command)}
                  disabled={command.disabled}
                  data-workspace-command={command.id}
                >
                  {command.icon}
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-medium">
                      {command.label}
                    </span>
                    <span className="truncate text-xs text-muted">
                      {command.description}
                    </span>
                  </span>
                  {command.shortcut ? (
                    <CommandShortcut>{command.shortcut}</CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            {group !== "AI" ? <CommandSeparator /> : null}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
