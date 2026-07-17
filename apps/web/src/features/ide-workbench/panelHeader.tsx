import * as React from "react";

import { cn } from "@/design/lib/utils";

/**
 * Workbench panel chrome, shared by the bottom panels (Terminal / Problems /
 * Output / Debug Console) and the activity sidebars (Search / Source Control /
 * Run and Debug). One header rhythm everywhere: compact title row, optional
 * meta in the middle, toolbar actions right-aligned — the VS Code panel
 * convention, expressed with Aurora tokens.
 */

export interface PanelHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  /** Optional leading icon, rendered in the standard subdued tile. */
  icon?: React.ReactNode;
  /** Middle content (badges, selectors, status text). */
  children?: React.ReactNode;
  /** Right-aligned toolbar actions. */
  actions?: React.ReactNode;
}

/** Compact header for bottom/docked panels. */
export function PanelHeader({
  title,
  icon,
  children,
  actions,
  className,
  ...props
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex min-h-9 min-w-0 items-center gap-2 border-b border-line bg-panel-2 px-3 py-1",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className="grid size-5 shrink-0 place-items-center text-primary [&_svg]:size-3.5" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-strong">
        {title}
      </span>
      {children ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </div>
  );
}

/** Small numeric/status chip used inside panel headers and section toolbars. */
export function PanelHeaderChip({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border border-line bg-canvas px-1.5 py-0.5 text-2xs tabular-nums text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export interface SidebarViewHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  icon: React.ReactNode;
  /** Secondary line under the title (workspace, status summary). */
  subtitle?: React.ReactNode;
  /** Small badge next to the title (mode indicator, count). */
  badge?: React.ReactNode;
  /** Right-aligned toolbar actions. */
  actions?: React.ReactNode;
}

/** Header for activity-bar sidebar views (Search, Source Control, Debug). */
export function SidebarViewHeader({
  title,
  icon,
  subtitle,
  badge,
  actions,
  className,
  ...props
}: SidebarViewHeaderProps) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-2 px-2.5 py-2", className)}
      {...props}
    >
      <div
        className="grid size-7 shrink-0 place-items-center rounded-sm border border-primary-line bg-primary-soft text-primary [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate text-sm font-semibold text-ink-strong">{title}</div>
          {badge}
        </div>
        {subtitle ? <div className="truncate text-2xs text-subtle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

/** Uppercase section label used to group blocks inside sidebar/panel bodies. */
export function PanelSectionLabel({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
