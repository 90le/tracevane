import * as React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  KeyRound,
  Lock,
  Menu,
  Search,
  Moon,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/design/ui/tooltip";
import { useTheme } from "@/app/providers";
import { useAuth } from "@/features/auth/AuthGate";
import { ChangePasswordDialog } from "@/features/auth/ChangePasswordDialog";
import {
  isNavItemActive,
  navItemsByGroup,
  resolvePageMeta,
  type NavItem,
} from "@/app/navigation";

function NavList({
  pathname,
  search,
  onNavigate,
}: {
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  const { collapsed } = useSidebar();
  return (
    <SidebarNav>
      {navItemsByGroup().map(({ group, items }) => (
        <SidebarGroup key={group} label={group}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(item, pathname, search);
            const navItem = (
              <SidebarItem
                asChild
                active={active}
                icon={Icon ? <Icon /> : undefined}
                count={item.status === "coming-soon" ? "…" : undefined}
                className="before:w-[2px]"
              >
                <Link
                  to={item.path}
                  onClick={onNavigate}
                  title={collapsed ? undefined : item.title}
                  aria-label={item.label}
                >
                  {item.label}
                </Link>
              </SidebarItem>
            );
            if (!collapsed) {
              return <React.Fragment key={item.path}>{navItem}</React.Fragment>;
            }
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                  {item.status === "coming-soon" ? " · 建设中" : ""}
                </TooltipContent>
              </Tooltip>
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
      <img
        src="/brand/tracevane-mark.svg"
        alt="Tracevane"
        className="size-8 shrink-0 rounded-md shadow-sm"
        draggable={false}
      />
      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-md font-semibold text-ink-strong">
            Tracevane
          </div>
          <div className="truncate text-2xs uppercase tracking-[.12em] text-subtle">
            AI 控制台
          </div>
        </div>
      )}
    </SidebarHeader>
  );
}

function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "切换到浅色" : "切换到深色";
  const button = (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="text-subtle hover:text-ink"
      title={collapsed ? undefined : label}
      aria-label="切换主题"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Session lock — only rendered when the standalone server enforces auth. */
function LockButton({ collapsed = false }: { collapsed?: boolean }) {
  const { required, lock } = useAuth();
  if (!required) return null;
  const button = (
    <Button
      variant="ghost"
      size="icon"
      onClick={lock}
      className="text-subtle hover:text-ink"
      title={collapsed ? undefined : "锁定"}
      aria-label="锁定"
    >
      <Lock />
    </Button>
  );
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">锁定</TooltipContent>
    </Tooltip>
  );
}

/** Change-password entry — only rendered when the standalone server enforces auth. */
function ChangePasswordButton({ collapsed = false }: { collapsed?: boolean }) {
  const { required } = useAuth();
  const [open, setOpen] = React.useState(false);
  if (!required) return null;
  const button = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setOpen(true)}
      className="text-subtle hover:text-ink"
      title={collapsed ? undefined : "修改密码"}
      aria-label="修改密码"
    >
      <KeyRound />
    </Button>
  );
  return (
    <>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">修改密码</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <ChangePasswordDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function SidebarUtilities({
  collapsed,
  onToggleCollapse,
  showCollapse = true,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  showCollapse?: boolean;
}) {
  const collapseLabel = collapsed ? "展开导航" : "收起导航";
  return (
    <SidebarFooter data-app-shell-sidebar-utilities>
      <div
        className={
          collapsed
            ? "grid justify-items-center gap-1"
            : "flex items-center gap-1"
        }
      >
        {showCollapse &&
          (collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCollapse}
                  className="text-subtle hover:text-ink"
                  aria-label={collapseLabel}
                >
                  <PanelLeftOpen />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{collapseLabel}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="flex-1 justify-start gap-2 text-subtle hover:text-ink"
              title={collapseLabel}
              aria-label={collapseLabel}
            >
              <PanelLeftClose />
              <span>收起导航</span>
            </Button>
          ))}
        <ThemeToggle collapsed={collapsed} />
        <ChangePasswordButton collapsed={collapsed} />
        <LockButton collapsed={collapsed} />
      </div>
    </SidebarFooter>
  );
}

function MobileDrawerBrand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img
        src="/brand/tracevane-mark.svg"
        alt="Tracevane"
        className="size-8 shrink-0 rounded-md shadow-sm"
        draggable={false}
      />
      <div className="min-w-0">
        <SheetTitle>Tracevane</SheetTitle>
        <div className="truncate text-xs text-subtle">
          选择工作流、接入或底座能力
        </div>
      </div>
    </div>
  );
}

function TopbarActions({ onOpenCommand }: { onOpenCommand: () => void }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenCommand}
        className="hidden min-w-[200px] justify-start gap-2 px-3 text-subtle hover:text-ink sm:inline-flex"
        aria-label="快速打开"
        title="快速打开（⌘K / Ctrl K）"
      >
        <Search />
        <span className="min-w-0 truncate">快速打开</span>
        <kbd className="ml-auto rounded border border-line bg-panel px-1.5 py-px font-mono text-2xs text-subtle">
          ⌘K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenCommand}
        className="sm:hidden"
        aria-label="快速打开"
        title="快速打开"
      >
        <Search />
      </Button>
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
      <CommandInput placeholder="搜索页面或输入功能名…" />
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
  const isChromeLessRoute = false;
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
    <TooltipProvider delayDuration={200}>
      <div
        className="grid h-dvh grid-cols-1 overflow-hidden transition-[grid-template-columns] duration-200 ease-out md:grid-cols-[64px_minmax(0,1fr)] xl:grid-cols-[var(--sidebar)_minmax(0,1fr)]"
        style={{ ["--sidebar" as string]: collapsed ? "64px" : "220px" }}
      >
        {/* Tablet rail — keeps primary destinations available without crushing the body. */}
        <Sidebar collapsed className="hidden md:grid xl:hidden">
          <WorkspaceBrand />
          <NavList pathname={pathname} search={search} />
          <SidebarUtilities
            collapsed
            onToggleCollapse={toggleCollapsed}
            showCollapse={false}
          />
        </Sidebar>

        {/* Desktop sidebar — persistent, full-height, own scroll, collapsible. */}
        <Sidebar collapsed={collapsed} className="hidden xl:grid">
          <WorkspaceBrand />
          <NavList pathname={pathname} search={search} />
          <SidebarUtilities
            collapsed={collapsed}
            onToggleCollapse={toggleCollapsed}
          />
        </Sidebar>

        {/* Compact / tablet drawer with labels and secondary utilities. */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-[min(360px,92vw)] p-0 xl:hidden">
            <SheetHeader className="pr-12">
              <MobileDrawerBrand />
            </SheetHeader>
            <div className="min-h-0 overflow-auto p-[14px]">
              <NavList
                pathname={pathname}
                search={search}
                onNavigate={() => setMobileNavOpen(false)}
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
          {/* Topbar — context only: breadcrumb trail + command palette entry */}
          {!isChromeLessRoute && (
            <header className="flex min-h-12 items-center gap-2 border-b border-line bg-panel/95 px-3 backdrop-blur sm:min-h-14 sm:px-4">
              <Button
                variant="ghost"
                size="icon"
                className="xl:hidden"
                onClick={() => setMobileNavOpen(true)}
                aria-label="打开导航"
              >
                <Menu />
              </Button>
              <div className="min-w-0 flex-1 py-2">
                <div
                  className="hidden min-w-0 items-center gap-1.5 text-xs text-muted sm:flex"
                  data-app-shell-mobile-hidden-breadcrumbs
                >
                  {pageMeta.breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={`${crumb.label}-${index}`}>
                      {index > 0 ? <span className="text-subtle">/</span> : null}
                      {crumb.path &&
                      index < pageMeta.breadcrumbs.length - 1 ? (
                        <Link
                          className="truncate hover:text-ink-strong"
                          to={crumb.path}
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span
                          className={cn(
                            "truncate",
                            index === pageMeta.breadcrumbs.length - 1 &&
                              "text-sm font-semibold text-ink-strong sm:text-md",
                          )}
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
                {/* Mobile context — breadcrumbs are hidden below sm */}
                <div className="truncate text-sm font-semibold text-ink-strong sm:hidden">
                  {pageMeta.label}
                </div>
              </div>
              <TopbarActions onOpenCommand={() => setCommandOpen(true)} />
            </header>
          )}

          {/* Routed content — the only scroll region besides the sidebar nav */}
          <main
            className={cn(
              "h-full min-h-0 min-w-0 overflow-auto",
              isChromeLessRoute ? "p-0" : "p-3 sm:p-5",
            )}
          >
            <Outlet />
          </main>
        </div>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      </div>
    </TooltipProvider>
  );
}
