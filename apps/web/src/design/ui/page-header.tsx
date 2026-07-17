import * as React from "react";

import { cn } from "@/design/lib/utils";

/**
 * Standard page top block: title, optional muted description, an optional
 * meta row (status breadcrumbs / badges) under the title, and a right-aligned
 * actions slot. Every feature page should start with this instead of ad-hoc
 * headers; horizontal/vertical rhythm matches the app shell content padding.
 */

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3 py-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-ink-strong">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-[72ch] text-sm text-muted">{description}</p>
        ) : null}
        {meta ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export { PageHeader };
