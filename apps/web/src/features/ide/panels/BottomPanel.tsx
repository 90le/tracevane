import * as React from "react";

import { cn } from "@/design/lib/utils";
import { IdeTerminal } from "@/features/ide/terminal/IdeTerminal";

type BottomTab = "terminal" | "problems" | "output";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "terminal", label: "终端" },
  { id: "problems", label: "问题" },
  { id: "output", label: "输出" },
];

/**
 * Bottom panel — Terminal / Problems / Output tab strip + body. The Terminal
 * tab renders the live IDE terminal (xterm.js + node-pty backend). Problems
 * and Output remain placeholders for later tasks.
 */
export function BottomPanel() {
  const [tab, setTab] = React.useState<BottomTab>("terminal");
  return (
    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-t border-line bg-panel">
      <div className="flex h-8 items-center gap-1 border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "h-7 rounded-sm px-2.5 text-sm text-muted outline-none transition-colors hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)]",
              tab === t.id && "bg-panel-2 text-ink-strong",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid min-h-[120px] bg-canvas">
        {tab === "terminal" ? (
          <IdeTerminal />
        ) : (
          <div className="grid place-items-center px-4 py-4 text-center text-sm text-muted">
            {tab === "problems" ? "无问题" : "无输出"}
          </div>
        )}
      </div>
    </section>
  );
}
