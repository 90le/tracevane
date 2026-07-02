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
}

export const XtermHost = React.forwardRef<XtermHostHandle, {
  onInput: (data: string) => void;
  onResize: (dimensions: XtermDimensions) => void;
}>(function XtermHost({ onInput, onResize }, ref) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<Terminal | null>(null);
  const fitAddonRef = React.useRef<FitAddon | null>(null);
  const onInputRef = React.useRef(onInput);
  const onResizeRef = React.useRef(onResize);

  React.useEffect(() => {
    onInputRef.current = onInput;
    onResizeRef.current = onResize;
  }, [onInput, onResize]);

  React.useImperativeHandle(ref, () => ({
    write(data) {
      terminalRef.current?.write(data);
    },
    clear() {
      terminalRef.current?.clear();
    },
    focus() {
      terminalRef.current?.focus();
    },
  }), []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "var(--mono)",
      fontSize: 12,
      scrollback: 2000,
      theme: createXtermAuroraTheme(container),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    terminal.onData((data) => onInputRef.current(data));
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
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden bg-panel text-ink"
      data-ide-terminal-xterm
    />
  );
});
