import * as React from "react";

import { Terminal } from "lucide-react";

import { cn } from "@/design/lib/utils";

type BottomTab = "terminal" | "problems" | "output";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "terminal", label: "终端" },
  { id: "problems", label: "问题" },
  { id: "output", label: "输出" },
];

/**
 * Bottom panel — Terminal / Problems / Output tab strip + body. In P1 the
 * body is a placeholder that hints at the upcoming read-only terminal
 * session evidence. The real terminal/git surfaces land in later tasks.
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
        <span className="ml-auto inline-flex items-center gap-1 pr-1 text-2xs text-subtle">
          <Terminal className="size-3" /> P1 占位
        </span>
      </div>
      <div className="grid min-h-[120px] place-items-center bg-canvas px-4 py-4 text-center">
        <div>
          <div className="mx-auto mb-2 grid size-7 place-items-center rounded-md bg-panel-2 text-subtle">
            <Terminal className="size-3.5" />
          </div>
          <p className="text-sm text-muted">
            {tab === "terminal" && "终端会话证据将在此呈现（只读）"}
            {tab === "problems" && "无问题"}
            {tab === "output" && "无输出"}
          </p>
          <p className="mt-1 text-2xs text-subtle">真实终端将在后续任务接入</p>
        </div>
      </div>
    </section>
  );
}
