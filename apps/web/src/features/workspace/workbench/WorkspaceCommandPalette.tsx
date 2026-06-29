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
  const enabledCommandCount = React.useMemo(
    () => commands.filter((command) => !command.disabled).length,
    [commands],
  );
  const totalCommandCount = commands.length;

  const runCommand = React.useCallback(
    (command: WorkspaceCommand) => {
      if (command.disabled) return;
      onOpenChange(false);
      command.run();
    },
    [onOpenChange],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-[1.35rem] max-md:border-b-0 max-md:pb-[env(safe-area-inset-bottom)]"
      commandClassName="max-md:max-h-[min(76dvh,42rem)] max-md:rounded-b-none max-md:rounded-t-[1.35rem]"
    >
      <div
        aria-hidden
        className="flex justify-center pt-2 md:hidden"
        data-workspace-command-palette-mobile-handle
      >
        <span className="h-1 w-10 rounded-full bg-line-2" />
      </div>
      <header
        className="border-b border-line px-4 py-3"
        aria-describedby="workspace-command-palette-summary"
        data-workspace-command-palette-header="ide-command-console"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
              IDE 命令控制台
            </p>
            <h2 className="truncate text-base font-semibold text-ink-strong">
              文件、搜索、Git、终端、布局的统一动作入口
            </h2>
          </div>
          <div
            className="shrink-0 rounded-full border border-line bg-panel-2 px-2.5 py-1 text-2xs font-semibold text-muted"
            data-workspace-command-palette-count
          >
            {enabledCommandCount}/{totalCommandCount} 可用
          </div>
        </div>
        <div
          className="mt-2 flex flex-wrap gap-1.5 text-2xs text-muted"
          data-workspace-command-palette-scope
        >
          <span>桌面：键盘优先</span>
          <span>移动：拇指安全 Sheet</span>
          <span>冲突：{keybindingConflicts.length}</span>
        </div>
        <p
          id="workspace-command-palette-summary"
          className="mt-2 text-2xs leading-5 text-subtle"
          data-workspace-command-palette-summary
        >
          所有命令必须映射到真实 IDE 操作；不可用动作会被禁用，证据/AI 扩展动作不会直接写入文件或执行命令。
        </p>
        {keybindingConflicts.length ? (
          <div
            className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
            data-workspace-keybinding-conflicts="header-alert"
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
      </header>
      <CommandInput placeholder="输入 IDE 命令：打开文件、搜索项目、Git 审查、终端动作…" />
      <CommandList
        className="max-md:max-h-[calc(min(76dvh,42rem)-4.25rem)] max-md:px-2 max-md:pb-3"
        data-workspace-command-palette
        data-workspace-command-palette-surface="ide-command-center"
        data-workspace-command-palette-mobile-sheet
      >
        <CommandEmpty>没有匹配的 IDE 命令</CommandEmpty>
        {WORKSPACE_COMMAND_GROUPS.map((group, index) => (
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
            {index < WORKSPACE_COMMAND_GROUPS.length - 1 ? <CommandSeparator /> : null}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
