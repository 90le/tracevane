import { GitBranch, Search, Files, Sparkles } from "lucide-react";

import { cn } from "@/design/lib/utils";

/**
 * Activities exposed by the IDE activity bar. `agent` is reserved for the
 * AI-agent track (P3) and renders disabled in P1.
 */
export type IdeActivity = "files" | "search" | "git" | "agent";

interface ActivityItem {
  id: IdeActivity;
  label: string;
  icon: typeof Files;
  disabled?: boolean;
}

const ITEMS: ActivityItem[] = [
  { id: "files", label: "文件", icon: Files },
  { id: "search", label: "搜索", icon: Search },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "agent", label: "Agent", icon: Sparkles, disabled: true },
];

interface ActivityBarProps {
  activity: IdeActivity;
  onChange: (next: IdeActivity) => void;
}

/**
 * Vertical icon rail on the left edge of the IDE. Mirrors the VS Code
 * activity bar UX. Renders Aurora-styled chrome (panel-2 background, icon
 * buttons with active marker, disabled state for the future agent entry).
 */
export function ActivityBar({ activity, onChange }: ActivityBarProps) {
  return (
    <nav
      aria-label="IDE 活动"
      className="flex flex-col items-center gap-1 border-r border-line bg-panel-2 px-[6px] py-2.5"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activity === item.id;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            title={item.label}
            aria-label={item.label}
            aria-pressed={active}
            onClick={() => !item.disabled && onChange(item.id)}
            className={cn(
              "relative grid size-9 place-items-center rounded-md text-muted outline-none transition-colors",
              "hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]",
              active && "bg-primary-soft text-primary",
              item.disabled && "cursor-not-allowed text-subtle/60 hover:bg-transparent hover:text-subtle/60",
            )}
          >
            <Icon className="size-[18px]" />
            {active && (
              <span
                aria-hidden
                className="absolute -left-[6px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
