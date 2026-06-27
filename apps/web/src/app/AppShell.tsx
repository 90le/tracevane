import * as React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  Search,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import {
  Sidebar,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
  useSidebar,
} from "@/design/ui/sidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/design/ui/sheet";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/design/ui/command";
import {
  PALETTES,
  useTheme,
  type Palette as PaletteName,
} from "@/app/providers";
import {
  isNavItemActive,
  navItemsByGroup,
  resolvePageMeta,
  type NavItem,
} from "@/app/navigation";

const PALETTE_LABELS: Record<PaletteName, string> = {
  default: "靛蓝",
  teal: "青绿",
  violet: "紫罗兰",
  graphite: "石墨",
};

function NavList({
  pathname,
  search,
  onNavigate,
}: {
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  return (
    <SidebarNav>
      {navItemsByGroup().map(({ group, items }) => (
        <SidebarGroup key={group} label={group}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(item, pathname, search);
            return (
              <SidebarItem
                key={item.path}
                asChild
                active={active}
                icon={Icon ? <Icon /> : undefined}
                count={item.status === "coming-soon" ? "…" : undefined}
              >
                <Link to={item.path} onClick={onNavigate}>
                  {item.label}
                </Link>
              </SidebarItem>
            );
          })}
        </SidebarGroup>
      ))}
    </SidebarNav>
  );
}

function WorkspaceBrand() {
  const { collapsed } = useSidebar();
  return (
    <SidebarHeader
      className={cn(
        "flex items-center gap-2.5 px-1",
        collapsed && "justify-center px-0",
      )}
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-ink font-semibold">
        T
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-md font-semibold text-ink-strong">
            Tracevane
          </div>
          <div className="truncate text-2xs uppercase tracking-[.12em] text-subtle">
            工作台
          </div>
        </div>
      )}
    </SidebarHeader>
  );
}

function SidebarUtilities({
  collapsed,
  onOpenCommand,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onOpenCommand: () => void;
  onToggleCollapse: () => void;
}) {
  return (
    <SidebarFooter
      className={cn(
        "gap-2 border-t border-line pt-3",
        collapsed && "items-center",
      )}
      data-app-shell-sidebar-utilities
    >
      <Button
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        onClick={onOpenCommand}
        className={cn(
          "text-subtle",
          collapsed ? "mx-auto" : "w-full justify-start gap-2",
        )}
        title="搜索 / 跳转（⌘K）"
        aria-label="搜索 / 跳转"
      >
        <Search />
        {!collapsed && (
          <>
            <span>搜索 / 跳转</span>
            <kbd className="ml-auto rounded border border-line bg-panel px-1.5 py-px font-mono text-2xs text-subtle">
              ⌘K
            </kbd>
          </>
        )}
      </Button>
      <div
        className={cn(
          "flex items-center gap-1",
          collapsed
            ? "flex-col"
            : "rounded-md border border-line bg-panel-2 p-1",
        )}
        aria-label="外观设置"
      >
        <PaletteToggle />
        <ThemeToggle />
        {!collapsed && <span className="px-1 text-xs text-muted">外观</span>}
      </div>
      <Button
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        onClick={onToggleCollapse}
        className={cn(
          "text-subtle",
          collapsed ? "mx-auto" : "w-full justify-start gap-2",
        )}
        title={collapsed ? "展开导航" : "收起导航"}
        aria-label={collapsed ? "展开导航" : "收起导航"}
      >
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        {!collapsed && <span>收起导航</span>}
      </Button>
    </SidebarFooter>
  );
}

function PaletteToggle() {
  const { palette, setPalette } = useTheme();
  const cycle = () => {
    const idx = PALETTES.indexOf(palette);
    setPalette(PALETTES[(idx + 1) % PALETTES.length]);
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      title={`配色：${PALETTE_LABELS[palette]}`}
      aria-label="切换配色"
    >
      <Palette />
    </Button>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={theme === "dark" ? "切换到浅色" : "切换到深色"}
      aria-label="切换主题"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

function MobileDrawerQuickActions({
  onOpenCommand,
}: {
  onOpenCommand: () => void;
}) {
  return (
    <div
      className="mt-3 grid gap-2 border-t border-line pt-3"
      data-app-shell-mobile-drawer-actions
    >
      <Button
        variant="ghost"
        className="justify-start gap-2 rounded-md border border-line bg-panel-2"
        onClick={onOpenCommand}
      >
        <Search />
        <span>搜索 / 跳转</span>
        <kbd className="ml-auto rounded border border-line bg-panel px-1.5 py-px font-mono text-2xs text-subtle">
          ⌘K
        </kbd>
      </Button>
      <div className="rounded-md border border-line bg-panel-2 p-2">
        <div className="px-2 pb-2 text-2xs font-semibold uppercase tracking-[.12em] text-subtle">
          外观
        </div>
        <div className="flex items-center gap-1">
          <PaletteToggle />
          <ThemeToggle />
          <span className="text-xs text-muted">配色与明暗主题</span>
        </div>
      </div>
    </div>
  );
}

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  const go = (item: NavItem) => {
    onOpenChange(false);
    navigate(item.path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="跳转到…" />
      <CommandList>
        <CommandEmpty>未找到匹配项</CommandEmpty>
        {navItemsByGroup().map(({ group, items }) => (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.path}
                  value={`${item.label} ${item.path}`}
                  onSelect={() => go(item)}
                >
                  {Icon ? <Icon /> : null}
                  <span>{item.label}</span>
                  {item.status === "coming-soon" && (
                    <span className="ml-auto text-2xs text-subtle">建设中</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell() {
  const { pathname, search } = useLocation();
  const pageMeta = React.useMemo(
    () => resolvePageMeta(pathname, search),
    [pathname, search],
  );
  const isChromeLessRoute = pathname === "/chat";
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("tracevane-sidebar-collapsed") === "1";
  });

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("tracevane-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore persistence failure */
      }
      return next;
    });
  }, []);

  // Close the mobile drawer on route change.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, search]);

  React.useEffect(() => {
    document.title = pageMeta.browserTitle;
  }, [pageMeta.browserTitle]);

  // Cmd/Ctrl+K opens the command palette.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="grid h-dvh grid-cols-1 overflow-hidden transition-[grid-template-columns] duration-200 ease-out md:grid-cols-[var(--sidebar)_minmax(0,1fr)]"
      style={{ ["--sidebar" as string]: collapsed ? "64px" : "248px" }}
    >
      {/* Desktop sidebar — persistent, full-height, own scroll, collapsible */}
      <Sidebar collapsed={collapsed} className="hidden md:grid">
        <WorkspaceBrand />
        <NavList pathname={pathname} search={search} />
        <SidebarUtilities
          collapsed={collapsed}
          onOpenCommand={() => setCommandOpen(true)}
          onToggleCollapse={toggleCollapsed}
        />
      </Sidebar>

      {/* Mobile drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 md:hidden">
          <SheetHeader>
            <SheetTitle>Tracevane</SheetTitle>
          </SheetHeader>
          <div className="overflow-auto p-[14px]">
            <NavList
              pathname={pathname}
              search={search}
              onNavigate={() => setMobileNavOpen(false)}
            />
            <MobileDrawerQuickActions
              onOpenCommand={() => {
                setMobileNavOpen(false);
                setCommandOpen(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "grid min-w-0 overflow-hidden",
          isChromeLessRoute
            ? "grid-rows-[minmax(0,1fr)]"
            : "grid-rows-[auto_minmax(0,1fr)]",
        )}
      >
        {/* Topbar */}
        {!isChromeLessRoute && (
          <header className="flex h-12 items-center gap-2 border-b border-line bg-panel px-3 sm:h-14 sm:px-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="打开导航"
            >
              <Menu />
            </Button>
            <div className="min-w-0 flex-1">
              <div
                className="hidden min-w-0 items-center gap-1.5 text-xs text-muted sm:flex"
                data-app-shell-mobile-hidden-breadcrumbs
              >
                {pageMeta.breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={`${crumb.label}-${index}`}>
                    {index > 0 ? <span className="text-subtle">/</span> : null}
                    {crumb.path && index < pageMeta.breadcrumbs.length - 1 ? (
                      <Link
                        className="truncate hover:text-ink-strong"
                        to={crumb.path}
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className="truncate"
                        aria-current={
                          index === pageMeta.breadcrumbs.length - 1
                            ? "page"
                            : undefined
                        }
                      >
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div className="truncate text-sm font-semibold text-ink-strong sm:text-md">
                {pageMeta.title}
              </div>
            </div>
          </header>
        )}

        {/* Routed content — the only scroll region besides the sidebar nav */}
        <main
          className={cn(
            "min-w-0 overflow-auto",
            isChromeLessRoute ? "p-0" : "p-3 sm:p-5",
          )}
        >
          <Outlet />
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
