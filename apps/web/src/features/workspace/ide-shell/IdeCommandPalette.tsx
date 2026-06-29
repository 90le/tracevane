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
  type WorkspaceCommandSurface,
} from "./ideCommands";

const IDE_SURFACE_FILTERS: readonly {
  surface: WorkspaceCommandSurface | "all";
  label: string;
}[] = [
  { surface: "all", label: "全部" },
  { surface: "files", label: "文件" },
  { surface: "search", label: "搜索" },
  { surface: "git", label: "Git" },
  { surface: "terminal", label: "终端" },
  { surface: "editor", label: "编辑" },
  { surface: "layout", label: "布局" },
  { surface: "evidence", label: "证据" },
  { surface: "ai-handoff", label: "AI" },
];

export interface IdeCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: WorkspaceCommand[];
}

export function IdeCommandPalette({
  open,
  onOpenChange,
  commands,
}: IdeCommandPaletteProps) {
  const [activeSurface, setActiveSurface] =
    React.useState<WorkspaceCommandSurface | "all">("all");
  const enabledCommandCount = React.useMemo(
    () => commands.filter((command) => !command.disabled).length,
    [commands],
  );
  const surfaceCommandCounts = React.useMemo(() => {
    const counts = new Map<WorkspaceCommandSurface | "all", number>();
    counts.set("all", commands.length);
    for (const command of commands) {
      if (!command.surface) continue;
      counts.set(command.surface, (counts.get(command.surface) ?? 0) + 1);
    }
    return counts;
  }, [commands]);
  const visibleCommands = React.useMemo(
    () =>
      activeSurface === "all"
        ? commands
        : commands.filter((command) => command.surface === activeSurface),
    [activeSurface, commands],
  );
  const commandGroups = React.useMemo(
    () =>
      WORKSPACE_COMMAND_GROUPS.map((group) => ({
        group,
        commands: visibleCommands.filter((command) => command.group === group),
      })).filter(({ commands: groupCommands }) => groupCommands.length > 0),
    [visibleCommands],
  );

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
      <header
        className="border-b border-line px-4 py-3"
        data-workspace-command-palette-header="new-ide-command-console"
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
          <div className="shrink-0 rounded-full border border-line bg-panel-2 px-2.5 py-1 text-2xs font-semibold text-muted">
            {enabledCommandCount}/{commands.length} 可用
          </div>
        </div>
        <div
          className="mt-3 flex gap-1.5 overflow-x-auto pb-1"
          role="tablist"
          aria-label="按 IDE 工作面过滤命令"
        >
          {IDE_SURFACE_FILTERS.map(({ surface, label }) => {
            const count = surfaceCommandCounts.get(surface) ?? 0;
            return (
              <button
                key={surface}
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-panel-2 px-2.5 py-1 text-2xs font-semibold text-muted outline-none transition-colors hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)] data-[active=true]:border-primary-line data-[active=true]:bg-primary-soft data-[active=true]:text-primary"
                data-active={activeSurface === surface ? "true" : "false"}
                role="tab"
                aria-selected={activeSurface === surface}
                onClick={() => setActiveSurface(surface)}
              >
                <span>{label}</span>
                <span className="rounded-full bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-subtle">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </header>
      <CommandInput placeholder="输入 IDE 命令：打开文件、搜索项目、Git 审查、终端动作…" />
      <CommandList data-workspace-command-palette data-workspace-command-palette-surface="new-ide-command-center">
        <CommandEmpty>没有匹配的 IDE 命令</CommandEmpty>
        {commandGroups.map(({ group, commands: groupCommands }, index) => (
          <CommandGroup key={group} heading={group}>
            {groupCommands.map((command) => (
              <CommandItem
                key={command.id}
                value={`${command.label} ${command.description}`}
                onSelect={() => runCommand(command)}
                disabled={command.disabled}
                data-workspace-command={command.id}
                data-workspace-command-risk={command.risk ?? "unknown"}
                data-workspace-command-surface={command.surface ?? "unknown"}
              >
                {command.icon}
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">{command.label}</span>
                  <span className="truncate text-xs text-muted">
                    {command.description}
                  </span>
                </span>
                {command.risk && command.risk !== "safe" ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                    {command.risk === "destructive" ? "危险" : "写入"}
                  </span>
                ) : null}
                {command.shortcut ? (
                  <CommandShortcut>{command.shortcut}</CommandShortcut>
                ) : null}
              </CommandItem>
            ))}
            {index < commandGroups.length - 1 ? <CommandSeparator /> : null}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
