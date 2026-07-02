import { Terminal as TerminalIcon, X } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";

export function TerminalTabs({
  sessionId,
  status,
  onClose,
}: {
  sessionId: string | null;
  status: string;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-8 items-center gap-1 border-b border-line bg-panel-2 px-2" data-ide-terminal-tabs>
      <div
        className={cn(
          "inline-flex min-h-6 max-w-[280px] items-center gap-1.5 rounded-sm border border-primary-line bg-primary-soft px-2 text-xs text-ink-strong",
          !sessionId && "border-line bg-panel text-muted",
        )}
      >
        <TerminalIcon className="size-3.5" />
        <span className="truncate">{sessionId ? "Local Shell" : "Terminal"}</span>
        <span className="rounded bg-panel px-1 font-mono text-2xs text-muted">{status}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          disabled={!sessionId || status === "closed"}
          aria-label="关闭终端"
          title="关闭终端并 kill PTY"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
