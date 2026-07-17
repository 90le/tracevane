import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface ExplorerContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

export interface ExplorerContextMenuBaseProps {
  open: boolean;
  anchorPoint?: { x: number; y: number } | null;
  items: readonly ExplorerContextMenuItem[];
  title?: React.ReactNode;
  className?: string;
  onClose: () => void;
}

export function ExplorerContextMenuBase({
  open,
  anchorPoint,
  items,
  title,
  className,
  onClose,
}: ExplorerContextMenuBaseProps) {
  React.useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handlePointerDown = () => onClose();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const viewportPadding = 8;
  const menuMinWidth = 192;
  const preferredMenuHeight = 320;
  const viewportWidth = typeof window === "undefined" ? menuMinWidth + viewportPadding * 2 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? preferredMenuHeight + viewportPadding * 2 : window.innerHeight;
  const left = Math.max(
    viewportPadding,
    Math.min(anchorPoint?.x ?? viewportPadding, viewportWidth - menuMinWidth - viewportPadding),
  );
  const top = Math.max(
    viewportPadding,
    Math.min(anchorPoint?.y ?? viewportPadding, viewportHeight - preferredMenuHeight - viewportPadding),
  );
  const maxHeight = Math.max(160, viewportHeight - top - viewportPadding);

  return (
    <div
      role="menu"
      aria-label="文件树菜单"
      className={cn(
        "fixed z-50 min-w-48 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-line bg-panel p-1 text-sm text-ink shadow-lg",
        className,
      )}
      style={{ left, top, maxHeight }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {title && <div className="px-2.5 py-1.5 text-xs font-medium text-muted">{title}</div>}
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {item.separatorBefore && <div className="my-1 border-t border-line" role="separator" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              "flex min-h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left outline-none transition-colors",
              "hover:bg-panel-2 focus-visible:bg-primary-soft focus-visible:shadow-[var(--ring)]",
              item.danger ? "text-danger" : "text-ink",
              item.disabled && "cursor-not-allowed text-subtle opacity-55 hover:bg-transparent",
            )}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            {item.icon && <span className="grid size-4 place-items-center [&_svg]:size-4">{item.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <span className="ml-4 shrink-0 text-xs text-subtle">{item.shortcut}</span>}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
