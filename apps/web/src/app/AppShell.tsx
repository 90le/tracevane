import * as React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, Moon, Palette, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";

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
import { PALETTES, useTheme, type Palette as PaletteName } from "@/app/providers";
import { navItemsByGroup, type NavItem } from "@/app/navigation";

const PALETTE_LABELS: Record<PaletteName, string> = {
  default: "靛蓝",
  teal: "青绿",
  violet: "紫罗兰",
  graphite: "石墨",
};

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <SidebarNav>
      {navItemsByGroup().map(({ group, items }) => (
        <SidebarGroup key={group} label={group}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.path || (item.path === "/platforms" && pathname.startsWith("/platforms/"));
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
    <SidebarHeader className={cn("flex items-center gap-2.5 px-1", collapsed && "justify-center px-0")}>
      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-ink font-semibold">
        T
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-md font-semibold text-ink-strong">Tracevane</div>
          <div className="truncate text-2xs uppercase tracking-[.12em] text-subtle">工作台</div>
        </div>
      )}
    </SidebarHeader>
  );
}

function CollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <SidebarFooter>
      <Button
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        onClick={onToggle}
        className={cn("text-subtle", collapsed ? "mx-auto" : "w-full justify-start gap-2")}
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
  const { pathname } = useLocation();
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
  }, [pathname]);

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
        <NavList pathname={pathname} />
        <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} />
      </Sidebar>

      {/* Mobile drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 md:hidden">
          <SheetHeader>
            <SheetTitle>Tracevane</SheetTitle>
          </SheetHeader>
          <div className="overflow-auto p-[14px]">
            <NavList pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 items-center gap-2 border-b border-line bg-panel px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="打开导航"
          >
            <Menu />
          </Button>
          <span className="text-md font-semibold text-ink-strong">Tracevane</span>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className={cn(
              "ml-auto hidden h-9 items-center gap-2 rounded-sm border border-line-2 bg-panel-2 px-3 text-sm text-subtle outline-none transition-colors sm:flex",
              "hover:border-primary-line hover:text-ink focus-visible:shadow-[var(--ring)]",
            )}
          >
            <span>搜索 / 跳转</span>
            <kbd className="rounded border border-line bg-panel px-1.5 py-px font-mono text-2xs">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1 sm:ml-2">
            <PaletteToggle />
            <ThemeToggle />
          </div>
        </header>

        {/* Routed content — the only scroll region besides the sidebar nav */}
        <main className="min-w-0 overflow-auto p-3 sm:p-5">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
