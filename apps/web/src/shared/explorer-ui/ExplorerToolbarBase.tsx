import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface ExplorerToolbarAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
  onSelect: () => void;
}

export interface ExplorerToolbarBaseProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: readonly ExplorerToolbarAction[];
  children?: React.ReactNode;
}

export function ExplorerToolbarBase({
  title,
  description,
  actions = [],
  children,
  className,
  ...props
}: ExplorerToolbarBaseProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 border-b border-line bg-panel px-2.5 py-2 text-sm text-ink",
        className,
      )}
      {...props}
    >
      {(title || description) && (
        <div className="min-w-0 flex-1">
          {title && <div className="truncate font-medium text-ink-strong">{title}</div>}
          {description && <div className="truncate text-xs text-muted">{description}</div>}
        </div>
      )}
      {children}
      {actions.length > 0 && (
        <div className="ml-auto flex shrink-0 items-center gap-1" role="toolbar" aria-label="文件树操作">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              title={action.title ?? action.label}
              aria-pressed={action.pressed}
              disabled={action.disabled}
              className={cn(
                "inline-flex min-h-8 items-center gap-1 rounded-sm border border-transparent px-2 text-sm text-muted outline-none transition-colors",
                "hover:border-line hover:bg-panel-2 hover:text-ink-strong focus-visible:shadow-[var(--ring)]",
                action.pressed && "border-primary-line bg-primary-soft text-primary",
                action.disabled && "cursor-not-allowed opacity-50 hover:border-transparent hover:bg-transparent hover:text-muted",
              )}
              onClick={action.onSelect}
            >
              {action.icon && <span className="grid size-4 place-items-center [&_svg]:size-4">{action.icon}</span>}
              <span className="max-sm:sr-only">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
