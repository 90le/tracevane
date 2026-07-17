import * as React from "react";

import { cn } from "@/design/lib/utils";

/**
 * Segmented-control in-page navigation: a pill group used to switch between
 * sections of one page (not routes). Keyboard accessible as a tablist with
 * automatic activation — ArrowLeft/ArrowRight/Home/End move the selection,
 * skipping disabled items.
 */

export interface SectionNavItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface SectionNavProps {
  items: SectionNavItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}

function SectionNav({
  items,
  value,
  onChange,
  ariaLabel = "页面分区",
  className,
}: SectionNavProps) {
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const focusAndSelect = (id: string) => {
    if (id !== value) onChange(id);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(
          `[role="tab"][data-section-id="${CSS.escape(id)}"]`,
        )
        ?.focus();
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;
    const current = Math.max(
      enabled.findIndex((item) => item.id === value),
      0,
    );
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (current + 1) % enabled.length;
    else if (event.key === "ArrowLeft")
      next = (current - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    if (next === null) return;
    event.preventDefault();
    focusAndSelect(enabled[next].id);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-panel-2 p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-section-id={item.id}
            aria-selected={active}
            disabled={item.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium outline-none transition-[background-color,color,box-shadow] duration-[var(--dur-1)] ease-[var(--ease-standard)]",
              "focus-visible:shadow-[var(--ring)]",
              active
                ? "bg-panel text-ink-strong shadow-sm"
                : "text-muted hover:text-ink",
              item.disabled && "cursor-not-allowed opacity-50 hover:text-muted",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "rounded-full bg-panel-3 px-1.5 py-px text-2xs tabular-nums",
                  active ? "text-muted" : "text-subtle",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export { SectionNav };
