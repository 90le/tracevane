import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/design/lib/utils";

/**
 * Lightweight grouped sidebar themed to Aurora (.sidebar / .nav / .nav-item).
 * Supports labelled groups, collapsed (icon-only) mode, active state, and a
 * trailing count badge. Collapsed mode is controlled via the `collapsed` prop
 * on <Sidebar>; descendants read it from context.
 */

type SidebarContextValue = { collapsed: boolean };
const SidebarContext = React.createContext<SidebarContextValue>({ collapsed: false });
const useSidebar = () => React.useContext(SidebarContext);

interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  collapsed?: boolean;
}

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, collapsed = false, children, ...props }, ref) => (
    <SidebarContext.Provider value={{ collapsed }}>
      <aside
        ref={ref}
        data-collapsed={collapsed ? "" : undefined}
        className={cn(
          "grid h-dvh min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-[14px] border-r border-line p-[16px_14px]",
          "bg-[color-mix(in_srgb,var(--panel)_70%,var(--canvas))] backdrop-blur-[20px]",
          collapsed && "p-[16px_10px]",
          className
        )}
        {...props}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
  )
);
Sidebar.displayName = "Sidebar";

function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0", className)} {...props} />;
}

function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        "flex gap-2 border-t border-line pt-3",
        collapsed && "flex-col",
        className
      )}
      {...props}
    />
  );
}

const SidebarNav = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => (
  <nav
    ref={ref}
    className={cn(
      "grid min-h-0 content-start gap-0.5 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      className
    )}
    {...props}
  />
));
SidebarNav.displayName = "SidebarNav";

interface SidebarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

function SidebarGroup({ label, className, children, ...props }: SidebarGroupProps) {
  const { collapsed } = useSidebar();
  return (
    <div className={cn("grid gap-0.5", className)} {...props}>
      {label && !collapsed && (
        <div className="px-[10px] pb-[5px] pt-3 text-2xs font-semibold uppercase tracking-[.1em] text-subtle">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

interface SidebarItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: React.ReactNode;
  count?: React.ReactNode;
  alert?: boolean;
  asChild?: boolean;
}

const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  (
    { className, active, icon, count, alert, asChild = false, children, ...props },
    ref
  ) => {
    const { collapsed } = useSidebar();
    const Comp = asChild ? Slot : "button";
    // When asChild, `children` is a single element (e.g. <Link>label</Link>) that
    // Slot merges onto. Radix Slot requires exactly one child, so we cannot emit
    // icon/label/count as siblings — instead we compose them INTO that single
    // child (its own children become the label), keeping a single Slot child.
    const childIsElement = React.isValidElement(children);
    const labelContent =
      asChild && childIsElement
        ? (children as React.ReactElement<{ children?: React.ReactNode }>).props.children
        : children;
    const inner = (
      <>
        {icon}
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-left">{labelContent}</span>
        )}
        {!collapsed && count != null && (
          <span
            className={cn(
              "ml-auto inline-grid h-[19px] min-w-[19px] place-items-center rounded-full px-[5px] font-mono text-2xs",
              alert ? "bg-red-soft text-red" : "bg-panel-3 text-muted"
            )}
          >
            {count}
          </span>
        )}
      </>
    );
    return (
      <Comp
        ref={ref}
        data-active={active ? "" : undefined}
        className={cn(
          "relative flex h-[37px] items-center gap-[11px] rounded-sm px-[10px] text-[13.5px] text-muted outline-none transition-colors",
          "hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)]",
          "[&_svg]:size-4",
          active &&
            "bg-primary-soft text-ink-strong [&_svg]:text-primary before:absolute before:-left-[14px] before:bottom-[9px] before:top-[9px] before:w-[3px] before:rounded-[0_3px_3px_0] before:bg-primary before:content-['']",
          collapsed && "justify-center px-0",
          className
        )}
        {...props}
      >
        {asChild && childIsElement
          ? React.cloneElement(
              children as React.ReactElement,
              undefined,
              inner
            )
          : inner}
      </Comp>
    );
  }
);
SidebarItem.displayName = "SidebarItem";

export {
  Sidebar,
  SidebarHeader,
  SidebarFooter,
  SidebarNav,
  SidebarGroup,
  SidebarItem,
  useSidebar,
};
