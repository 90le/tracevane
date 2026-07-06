import * as React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { createXtermAuroraTheme } from "./xtermTheme";

export interface XtermDimensions {
  cols: number;
  rows: number;
}

export interface XtermHostHandle {
  write: (data: string) => void;
  clear: () => void;
  focus: () => void;
  blur: () => void;
  getSelection: () => string;
  clearSelection: () => void;
  selectAll: () => void;
}

export const XtermHost = React.forwardRef<XtermHostHandle, {
  acceptInput?: boolean;
  onInput: (data: string) => void;
  onResize: (dimensions: XtermDimensions) => void;
  onSelectionChange?: (selection: string) => void;
  onCopyShortcut?: () => void;
  onPasteShortcut?: () => void;
}>(function XtermHost({ acceptInput = false, onInput, onResize, onSelectionChange, onCopyShortcut, onPasteShortcut }, ref) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<Terminal | null>(null);
  const fitAddonRef = React.useRef<FitAddon | null>(null);
  const onInputRef = React.useRef(onInput);
  const onResizeRef = React.useRef(onResize);
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  const onCopyShortcutRef = React.useRef(onCopyShortcut);
  const onPasteShortcutRef = React.useRef(onPasteShortcut);
  const suppressProgrammaticInputUntilRef = React.useRef(0);

  React.useEffect(() => {
    onInputRef.current = onInput;
    onResizeRef.current = onResize;
    onSelectionChangeRef.current = onSelectionChange;
    onCopyShortcutRef.current = onCopyShortcut;
    onPasteShortcutRef.current = onPasteShortcut;
  }, [onInput, onResize, onSelectionChange, onCopyShortcut, onPasteShortcut]);

  React.useImperativeHandle(ref, () => ({
    write(data) {
      const terminal = terminalRef.current;
      if (!terminal) return;
      // Writing replayed/backlog output into xterm can make xterm answer
      // terminal capability/status queries through onData. Those bytes are
      // not user input and must never be sent back to the PTY. Use a very
      // short time window instead of a write-callback counter: callback-based
      // suppression could linger and swallow real typing, while pure regex
      // filtering could leave fragments when escape responses were split.
      if (mayTriggerXtermGeneratedReport(data)) {
        suppressProgrammaticInputUntilRef.current = performance.now() + 40;
      }
      terminal.write(data);
    },
    clear() {
      terminalRef.current?.clear();
    },
    focus() {
      terminalRef.current?.focus();
    },
    blur() {
      terminalRef.current?.blur();
    },
    getSelection() {
      return terminalRef.current?.getSelection() ?? "";
    },
    clearSelection() {
      terminalRef.current?.clearSelection();
    },
    selectAll() {
      terminalRef.current?.selectAll();
    },
  }), []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const style = getComputedStyle(container);
    const monoFont = style.getPropertyValue("--mono").trim()
      || "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      disableStdin: !acceptInput,
      fontFamily: monoFont,
      fontSize: 13,
      fontWeight: "400",
      fontWeightBold: "700",
      letterSpacing: 0,
      lineHeight: 1.2,
      scrollback: 2000,
      theme: createXtermAuroraTheme(container),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    const dataDisposable = terminal.onData((data) => {
      if (performance.now() < suppressProgrammaticInputUntilRef.current) return;
      const userInput = stripXtermGeneratedReports(data);
      if (userInput) onInputRef.current(userInput);
    });
    const selectionDisposable = terminal.onSelectionChange(() => {
      onSelectionChangeRef.current?.(terminal.getSelection());
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && event.shiftKey && key === "c") {
        event.preventDefault();
        onCopyShortcutRef.current?.();
        return false;
      }
      if (mod && !event.shiftKey && key === "c" && terminal.getSelection()) {
        event.preventDefault();
        onCopyShortcutRef.current?.();
        return false;
      }
      // Intercept Ctrl/Cmd+V before it reaches the PTY. Browser xterm cannot
      // transfer the user's desktop image clipboard into the backend process
      // clipboard that CLIs like Codex read from, so the workbench bridges it:
      // file/image clipboard items are uploaded and their workspace paths are
      // inserted; text falls back to normal terminal paste.
      if (mod && !event.shiftKey && key === "v") {
        event.preventDefault();
        onPasteShortcutRef.current?.();
        return false;
      }
      if (mod && event.shiftKey && key === "v") {
        event.preventDefault();
        onPasteShortcutRef.current?.();
        return false;
      }
      if (event.shiftKey && event.key === "Insert") {
        event.preventDefault();
        onPasteShortcutRef.current?.();
        return false;
      }
      return true;
    });
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const fit = () => {
      try {
        fitAddon.fit();
        onResizeRef.current({ cols: terminal.cols, rows: terminal.rows });
      } catch {
        // The host can be briefly 0x0 while Panel layout is transitioning.
      }
    };
    const resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(container);
    requestAnimationFrame(fit);

    return () => {
      resizeObserver.disconnect();
      suppressProgrammaticInputUntilRef.current = 0;
      dataDisposable.dispose();
      selectionDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.disableStdin = !acceptInput;
    if (!acceptInput) terminal.blur();
  }, [acceptInput]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-panel text-ink"
      onPointerDown={() => terminalRef.current?.focus()}
      data-ide-terminal-xterm
    />
  );
});

function stripXtermGeneratedReports(data: string): string {
  return data
    .replace(/(?:\x1b\[[?>]?[0-9;]*[cnR])+/g, "")
    .replace(/(?:\x9b[?>]?[0-9;]*[cnR])+/g, "");
}

function mayTriggerXtermGeneratedReport(data: string): boolean {
  return /(?:\x1b\[[?>]?[0-9;]*[cn]|\x9b[?>]?[0-9;]*[cn])/.test(data);
}
