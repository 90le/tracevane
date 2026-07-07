import * as React from "react";
import {
  Bug,
  Command,
  CornerDownLeft,
  FileSearch,
  Files,
  GitBranch,
  Loader2,
  PanelLeft,
  Save,
  Search,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { editorTitleForPath } from "@/shared/editor-core";
import { normalizeExplorerPath } from "@/shared/explorer-core";
import { requestLspWorkspaceSymbols } from "../lsp/lspInteractionClient";
import type { IdeWorkbenchEditorRevealRange, IdeWorkbenchEditorTab, WorkbenchActivityId } from "../types";
import type { LspWorkspaceSymbolItem } from "../../../../../../types/lsp";

export interface IdeCommandPaletteProps {
  open: boolean;
  rootId: string;
  rootLabel: string;
  directoryPath: string;
  activeTab: IdeWorkbenchEditorTab | null;
  onClose: () => void;
  onOpenActivity: (activityId: WorkbenchActivityId) => void;
  onSaveActiveTab: () => void;
  onCloseActiveTab: () => void;
  onOpenSymbol: (request: { rootId: string; path: string; reveal: IdeWorkbenchEditorRevealRange }) => void;
}

type PaletteCommandId =
  | "workbench.view.explorer"
  | "workbench.view.search"
  | "workbench.view.sourceControl"
  | "workbench.view.debug"
  | "workbench.action.files.save"
  | "workbench.action.closeActiveEditor"
  | "workbench.action.gotoSymbol";

interface PaletteCommand {
  id: PaletteCommandId;
  title: string;
  subtitle: string;
  keywords: string;
  shortcut?: string;
  disabled?: boolean;
  icon: React.ReactNode;
  run: () => void;
}

type PaletteItem =
  | { type: "command"; key: string; command: PaletteCommand }
  | { type: "symbol"; key: string; symbol: LspWorkspaceSymbolItem };

const COMMAND_LIMIT = 8;
const SYMBOL_LIMIT = 12;

export function IdeCommandPalette({
  open,
  rootId,
  rootLabel,
  directoryPath,
  activeTab,
  onClose,
  onOpenActivity,
  onSaveActiveTab,
  onCloseActiveTab,
  onOpenSymbol,
}: IdeCommandPaletteProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [symbols, setSymbols] = React.useState<LspWorkspaceSymbolItem[]>([]);
  const [symbolLoading, setSymbolLoading] = React.useState(false);
  const [symbolError, setSymbolError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    setSymbols([]);
    setSymbolError(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const commands = React.useMemo<PaletteCommand[]>(() => [
    {
      id: "workbench.view.explorer",
      title: "打开资源管理器",
      subtitle: "切换到 Explorer / 文件视图",
      keywords: "explorer files resource 文件 资源管理器",
      icon: <Files />,
      run: () => { onOpenActivity("explorer"); onClose(); },
    },
    {
      id: "workbench.view.search",
      title: "打开搜索",
      subtitle: "切换到 Search 视图",
      keywords: "search find grep 搜索 查找",
      icon: <Search />,
      run: () => { onOpenActivity("search"); onClose(); },
    },
    {
      id: "workbench.view.sourceControl",
      title: "打开源代码管理",
      subtitle: "切换到 Source Control / Git 视图",
      keywords: "git source control scm 源代码管理 版本控制",
      icon: <GitBranch />,
      run: () => { onOpenActivity("git"); onClose(); },
    },
    {
      id: "workbench.view.debug",
      title: "打开运行和调试",
      subtitle: "切换到 Run and Debug 视图",
      keywords: "debug run launch 调试 运行",
      icon: <Bug />,
      run: () => { onOpenActivity("run"); onClose(); },
    },
    {
      id: "workbench.action.files.save",
      title: "保存当前文件",
      subtitle: activeTab ? activeTab.ref.path : "没有活动编辑器",
      keywords: "save file 保存 当前文件",
      shortcut: "Ctrl S",
      disabled: !activeTab || activeTab.deleted || activeTab.saveState === "saving" || !activeTab.dirty,
      icon: <Save />,
      run: () => { onSaveActiveTab(); onClose(); },
    },
    {
      id: "workbench.action.closeActiveEditor",
      title: "关闭当前编辑器",
      subtitle: activeTab ? activeTab.ref.path : "没有活动编辑器",
      keywords: "close editor tab 关闭 编辑器 标签",
      shortcut: "Ctrl F4",
      disabled: !activeTab,
      icon: <X />,
      run: () => { onCloseActiveTab(); onClose(); },
    },
    {
      id: "workbench.action.gotoSymbol",
      title: "转到工作区符号",
      subtitle: "输入 @ 或直接输入类、函数、变量名搜索符号",
      keywords: "symbol go to workspace goto @ 符号 转到",
      shortcut: "@",
      icon: <FileSearch />,
      run: () => {
        setQuery((value) => (value.trim().startsWith("@") ? value : `@${value.trim()}`));
        inputRef.current?.focus();
      },
    },
  ], [activeTab, onClose, onCloseActiveTab, onOpenActivity, onSaveActiveTab]);

  const normalizedQuery = query.trim();
  const commandQuery = normalizedQuery.replace(/^>/, "").replace(/^@/, "").trim().toLowerCase();
  const symbolQuery = normalizedQuery.replace(/^@/, "").trim();
  const symbolMode = normalizedQuery.startsWith("@") || (!normalizedQuery.startsWith(">") && symbolQuery.length >= 2);

  const filteredCommands = React.useMemo(() => {
    if (normalizedQuery.startsWith("@")) return commands.filter((item) => item.id === "workbench.action.gotoSymbol");
    if (!commandQuery) return commands;
    return commands.filter((item) => `${item.title} ${item.subtitle} ${item.keywords} ${item.id}`.toLowerCase().includes(commandQuery));
  }, [commandQuery, commands, normalizedQuery]);

  React.useEffect(() => {
    if (!open || !rootId || !symbolMode || symbolQuery.length < 2) {
      setSymbols([]);
      setSymbolLoading(false);
      setSymbolError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSymbolLoading(true);
      setSymbolError(null);
      requestLspWorkspaceSymbols({
        type: "workspaceSymbols",
        rootId,
        query: symbolQuery,
        path: normalizeExplorerPath(directoryPath),
        limit: SYMBOL_LIMIT,
        includeHidden: true,
      }, { signal: controller.signal })
        .then((response) => setSymbols(response.items ?? []))
        .catch((error) => {
          if (controller.signal.aborted) return;
          setSymbols([]);
          setSymbolError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setSymbolLoading(false);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [directoryPath, open, rootId, symbolMode, symbolQuery]);

  const items = React.useMemo<PaletteItem[]>(() => [
    ...filteredCommands.slice(0, COMMAND_LIMIT).map((command) => ({ type: "command" as const, key: `command:${command.id}`, command })),
    ...symbols.slice(0, SYMBOL_LIMIT).map((symbol) => ({
      type: "symbol" as const,
      key: `symbol:${symbol.path}:${symbol.name}:${symbol.startLine}:${symbol.startColumn}`,
      symbol,
    })),
  ], [filteredCommands, symbols]);

  React.useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, items.length - 1)));
  }, [items.length]);

  const runItem = React.useCallback((item: PaletteItem | undefined) => {
    if (!item) return;
    if (item.type === "command") {
      if (!item.command.disabled) item.command.run();
      return;
    }
    onOpenSymbol({
      rootId: item.symbol.rootId || rootId,
      path: item.symbol.path,
      reveal: { lineNumber: item.symbol.startLine, column: item.symbol.startColumn },
    });
    onClose();
  }, [onClose, onOpenSymbol, rootId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] grid place-items-start justify-center bg-canvas/70 backdrop-blur-sm px-3 py-[10vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-ide-command-palette-overlay
    >
      <div
        className="grid w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-panel text-ink shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="IDE 命令面板"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(items.length - 1, index + 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            runItem(items[activeIndex]);
          }
        }}
        data-ide-command-palette
      >
        <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-3 py-2">
          <Command className="size-4 shrink-0 text-primary" aria-hidden />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            placeholder="输入命令，或输入 @ / 符号名转到工作区符号"
            className="h-10 border-0 bg-transparent px-0 text-base shadow-none focus-visible:shadow-none"
            aria-label="IDE 命令面板输入"
            data-ide-command-palette-input
          />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭命令面板" data-ide-command-palette-close>
            <X />
          </Button>
        </div>
        <div className="max-h-[56vh] overflow-auto p-2 [scrollbar-width:thin]" data-ide-command-palette-results>
          <div className="mb-2 flex items-center justify-between gap-2 px-2 text-2xs text-subtle">
            <span className="truncate">{rootLabel || rootId || "Workspace"} · /{normalizeExplorerPath(directoryPath)}</span>
            <span className="shrink-0">F1 / Ctrl+Shift+P</span>
          </div>
          {items.length === 0 && symbolLoading ? (
            <PaletteEmpty loading title="正在搜索符号…" description={`正在查找 ${symbolQuery}`} />
          ) : items.length === 0 ? (
            <PaletteEmpty title="没有匹配项" description={symbolError ?? "请换一个命令或符号关键词。"} />
          ) : (
            <div className="grid gap-1" role="listbox" aria-label="命令和符号结果">
              {filteredCommands.length > 0 ? <PaletteSectionLabel label="命令" /> : null}
              {items.map((item, index) => {
                const previous = items[index - 1];
                const showSymbolLabel = item.type === "symbol" && previous?.type !== "symbol";
                return (
                  <React.Fragment key={item.key}>
                    {showSymbolLabel ? <PaletteSectionLabel label={symbolLoading ? "符号（搜索中…）" : "符号"} /> : null}
                    {item.type === "command" ? (
                      <CommandRow
                        command={item.command}
                        active={index === activeIndex}
                        onHover={() => setActiveIndex(index)}
                        onRun={() => runItem(item)}
                      />
                    ) : (
                      <SymbolRow
                        symbol={item.symbol}
                        active={index === activeIndex}
                        onHover={() => setActiveIndex(index)}
                        onRun={() => runItem(item)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaletteSectionLabel({ label }: { label: string }) {
  return <div className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-subtle first:pt-0">{label}</div>;
}

function CommandRow({
  command,
  active,
  onHover,
  onRun,
}: {
  command: PaletteCommand;
  active: boolean;
  onHover: () => void;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active ? "true" : "false"}
      disabled={command.disabled}
      onMouseEnter={onHover}
      onClick={onRun}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors disabled:cursor-not-allowed disabled:text-disabled [&_svg]:size-4",
        active ? "bg-primary-soft text-ink-strong" : "hover:bg-panel-3",
      )}
      data-ide-command-palette-item
      data-ide-command-palette-command-id={command.id}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-panel-2 text-primary">{command.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{command.title}</span>
        <span className="block truncate text-xs text-subtle">{command.subtitle}</span>
      </span>
      {command.shortcut ? <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-2xs text-subtle">{command.shortcut}</span> : null}
      {active ? <CornerDownLeft className="size-3.5 shrink-0 text-subtle" aria-hidden /> : null}
    </button>
  );
}

function SymbolRow({
  symbol,
  active,
  onHover,
  onRun,
}: {
  symbol: LspWorkspaceSymbolItem;
  active: boolean;
  onHover: () => void;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active ? "true" : "false"}
      onMouseEnter={onHover}
      onClick={onRun}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors [&_svg]:size-4",
        active ? "bg-primary-soft text-ink-strong" : "hover:bg-panel-3",
      )}
      data-ide-command-palette-symbol
      data-ide-command-palette-symbol-path={symbol.path}
      data-ide-command-palette-symbol-name={symbol.name}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-primary-line bg-primary-soft text-primary">
        <FileSearch />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{symbol.name}</span>
        <span className="block truncate text-xs text-subtle">
          {symbol.kind}{symbol.containerName ? ` · ${symbol.containerName}` : ""} · {editorTitleForPath(symbol.path)}:{symbol.startLine}:{symbol.startColumn}
        </span>
      </span>
      <span className="hidden max-w-[14rem] truncate font-mono text-2xs text-subtle sm:block">{symbol.path}</span>
      {active ? <CornerDownLeft className="size-3.5 shrink-0 text-subtle" aria-hidden /> : null}
    </button>
  );
}

function PaletteEmpty({ title, description, loading = false }: { title: string; description: string; loading?: boolean }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-line bg-canvas p-5 text-center text-sm text-muted">
      <div>
        {loading ? <Loader2 className="mx-auto mb-2 size-5 animate-spin text-primary" aria-hidden /> : null}
        <div className="font-semibold text-ink-strong">{title}</div>
        <div className="mt-1 text-xs">{description}</div>
      </div>
    </div>
  );
}
