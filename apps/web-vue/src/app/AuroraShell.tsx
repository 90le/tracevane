import * as React from "react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  BarChart3,
  Bot,
  Box,
  Boxes,
  Braces,
  Brain,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock,
  Coins,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FileCog,
  FileDiff,
  FileJson2,
  FilePen,
  FilePlus2,
  FileText,
  Files,
  Folder,
  FolderCheck,
  FolderOpen,
  Gauge,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  HardDrive,
  HeartPulse,
  History,
  Hourglass,
  Image,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  Loader,
  LogIn,
  LogOut,
  Lock,
  Menu,
  MessageSquare,
  MessagesSquare,
  Minus,
  MonitorCheck,
  NotebookText,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plug,
  PlugZap,
  Plus,
  Power,
  PackageCheck,
  Radio,
  RadioTower,
  RefreshCw,
  Route,
  RouteOff,
  ScanSearch,
  ScrollText,
  Search,
  Send,
  SendHorizontal,
  Server,
  ServerCog,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Square,
  SquareTerminal,
  SunMoon,
  Tag,
  Terminal,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Undo2,
  User,
  Users,
  WandSparkles,
  Webhook,
  Wifi,
  Wrench,
  X,
  ZapOff,
  createIcons,
} from "lucide";
import { useQuery } from "@tanstack/react-query";
import { navGroups, routeByPath, routeDefs, platformGroups } from "./route-manifest";
import { ShellContext, type DialogPayload, type SheetPayload, type ShellApi, type StateOptions } from "./shell-context";

interface ToastItem {
  id: number;
  message: string;
  tone: "ok" | "warn" | "info";
}

interface CommandItem {
  group: string;
  label: string;
  icon: string;
  kbd?: string;
  act: () => void;
}

interface HealthPayload {
  ok?: boolean;
  version?: string;
}

const auroraIcons = {
  Activity,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  BarChart3,
  Bot,
  Box,
  Boxes,
  Braces,
  Brain,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock,
  Coins,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FileCog,
  FileDiff,
  FileJson2,
  FilePen,
  FilePlus2,
  FileText,
  Files,
  Folder,
  FolderCheck,
  FolderOpen,
  Gauge,
  GitBranch,
  GitCommitHorizontal,
  Github: Globe,
  Globe,
  HardDrive,
  HeartPulse,
  History,
  Hourglass,
  Image,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  Loader,
  LogIn,
  LogOut,
  Lock,
  Menu,
  MessageSquare,
  MessagesSquare,
  Minus,
  MonitorCheck,
  NotebookText,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plug,
  PlugZap,
  Plus,
  Power,
  PackageCheck,
  Radio,
  RadioTower,
  RefreshCw,
  Route,
  RouteOff,
  ScanSearch,
  ScrollText,
  Search,
  Send,
  SendHorizontal,
  Server,
  ServerCog,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Square,
  SquareTerminal,
  SunMoon,
  Tag,
  Terminal,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Undo2,
  User,
  Users,
  WandSparkles,
  Webhook,
  Wifi,
  Wrench,
  X,
  ZapOff,
};

function currentPath(pathname: string): string {
  const path = pathname.replace(/^\//, "") || "dashboard";
  return path.split("/")[0] || "dashboard";
}

function parseLegacySheet(value: string | null): SheetPayload {
  const parts = String(value || "").split("|");
  const rawLog = parts[6] || "";
  const log = rawLog.includes("\\n")
    ? rawLog.replace(/\\n/g, "\n")
    : rawLog.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    title: parts[0],
    sub: parts[1],
    status: parts[2],
    owner: parts[3],
    action: parts[4],
    note: parts[5],
    log,
  };
}

function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => node.offsetParent !== null);
}

function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement | null>, focusRef?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    const timer = window.setTimeout(() => {
      focusRef?.current?.focus();
      if (!focusRef?.current) focusable(container)[0]?.focus();
    }, 20);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = focusable(container);
      if (!nodes.length) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      container.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [active, containerRef, focusRef]);
}

export function AuroraShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const path = currentPath(location.pathname);
  const route = routeByPath(path);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [palette, setPalette] = useState("blue");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [platformOpen, setPlatformOpen] = useState<Record<string, boolean>>({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const [sheet, setSheet] = useState<SheetPayload | null>(null);
  const [dialog, setDialog] = useState<DialogPayload | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const cmdRef = useRef<HTMLDivElement | null>(null);
  const cmdInputRef = useRef<HTMLInputElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const health = useQuery({
    queryKey: ["system-health"],
    queryFn: async (): Promise<HealthPayload> => {
      const res = await fetch("/api/system/health");
      if (!res.ok) throw new Error(`health ${res.status}`);
      return res.json() as Promise<HealthPayload>;
    },
    retry: false,
  });

  const refreshIcons = useCallback(() => {
    requestAnimationFrame(() => {
      createIcons({ icons: auroraIcons });
    });
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.body.dataset.palette = palette;
    refreshIcons();
  }, [palette, refreshIcons, theme]);

  const toast = useCallback((message: string, tone: "ok" | "warn" | "info" = "ok") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 2900);
  }, []);

  const states = useCallback<ShellApi["states"]>((container, kind, opts = {}) => {
    if (!container) return null;
    const count = opts.count || 4;
    if (kind === "skeleton-rows") {
      container.innerHTML = `<div class="sk-list">${Array.from({ length: count }).map(() => '<div class="sk-row"><span class="skeleton ava"></span><span class="skeleton t"></span><span class="skeleton s"></span><span class="skeleton s"></span></div>').join("")}</div>`;
    } else if (kind === "skeleton-cards") {
      container.innerHTML = `<div class="sk-blocks" style="grid-template-columns:repeat(${Math.min(count, 3)},1fr)">${Array.from({ length: count }).map(() => '<div class="sk-card"><span class="skeleton" style="height:18px;width:50%"></span><span class="skeleton" style="height:28px;width:30%"></span><span class="skeleton" style="height:12px"></span></div>').join("")}</div>`;
    } else if (kind === "empty") {
      container.innerHTML = `<div class="statebox empty"><span class="si"><i data-lucide="${opts.icon || "inbox"}"></i></span><strong>${opts.title || "暂无数据"}</strong><span>${opts.desc || ""}</span>${opts.action ? `<div class="row-actions">${opts.action}</div>` : ""}</div>`;
    } else if (kind === "error") {
      container.innerHTML = `<div class="statebox error"><span class="si"><i data-lucide="${opts.icon || "circle-alert"}"></i></span><strong>${opts.title || "加载失败"}</strong><span>${opts.desc || "请稍后重试。"}</span><div class="row-actions"><button class="btn-ghost btn-sm retry" data-retry><i data-lucide="refresh-cw"></i>重试</button></div></div>`;
      if (opts.onRetry) container.querySelector("[data-retry]")?.addEventListener("click", opts.onRetry);
    } else if (kind === "loading") {
      container.innerHTML = `<div class="statebox"><span class="spinner"></span><strong>${opts.title || "加载中..."}</strong></div>`;
    }
    refreshIcons();
    return container;
  }, [refreshIcons]);

  const bindListSearch = useCallback<ShellApi["bindListSearch"]>((stage, opts: StateOptions = {}) => {
    const input = stage.querySelector<HTMLInputElement>(".search-input input");
    const wrap = stage.querySelector<HTMLElement>(".tablewrap");
    if (!input || !wrap || input.dataset.boundSearch === "1") return;
    input.dataset.boundSearch = "1";
    const apply = () => {
      const rows = Array.from(wrap.querySelectorAll<HTMLElement>(".trow"));
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      for (const row of rows) {
        const show = !query || (row.textContent || "").toLowerCase().includes(query);
        row.style.display = show ? "" : "none";
        if (show) visible += 1;
      }
      let empty = wrap.querySelector<HTMLElement>(".list-empty");
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "list-empty";
        wrap.appendChild(empty);
      }
      if (visible === 0) {
        states(empty, "empty", {
          title: opts.emptyTitle || opts.title || "无匹配结果",
          desc: opts.emptyDesc || opts.desc || "尝试更换关键词或清除筛选。",
          icon: opts.icon || "search-x",
        });
      } else {
        empty.innerHTML = "";
      }
    };
    input.addEventListener("input", apply);
    apply();
  }, [states]);

  const shell = useMemo<ShellApi>(() => ({
    openSheet: (payload) => setSheet(payload),
    openSheetLegacy: (value) => setSheet(parseLegacySheet(value)),
    closeSheet: () => setSheet(null),
    openDialog: (payload) => setDialog(payload),
    closeDialog: () => setDialog(null),
    toast,
    states,
    refreshIcons,
    bindListSearch,
  }), [bindListSearch, refreshIcons, states, toast]);

  const pageCommands: Record<string, CommandItem[]> = useMemo(() => ({
    "model-gateway": [
      { group: "本页动作", label: "打开模型网关", icon: "route", act: () => navigate("/model-gateway") },
    ],
    chat: [{ group: "本页动作", label: "新建会话", icon: "plus", kbd: "⌘N", act: () => toast("新建会话（演示）", "info") }],
    approvals: [{ group: "本页动作", label: "批准全部", icon: "check", act: () => toast("已批准全部待审批", "ok") }],
    recovery: [{ group: "本页动作", label: "重新巡检", icon: "scan-search", act: () => toast("巡检完成 · 2 项可修复", "info") }],
  }), [navigate, toast]);

  const commands = useMemo<CommandItem[]>(() => [
    ...routeDefs.map((item) => ({ group: "导航", label: item.label, icon: item.icon, act: () => navigate(`/${item.path}`) })),
    { group: "动作", label: "新建会话", icon: "plus", kbd: "⌘N", act: () => navigate("/chat") },
    { group: "动作", label: "运行模型连通检查", icon: "activity", act: () => navigate("/model-gateway") },
    { group: "视图", label: "切换深浅主题", icon: "sun-moon", act: () => setTheme((value) => value === "dark" ? "light" : "dark") },
    ...(pageCommands[path] || []),
  ], [navigate, pageCommands, path]);

  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    return commands.filter((item) => item.label.toLowerCase().includes(query));
  }, [commandQuery, commands]);

  useEffect(() => {
    setCommandIndex(0);
  }, [commandQuery, path]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        navigate("/chat");
      } else if (event.key === "Escape") {
        setCommandOpen(false);
        setSheet(null);
        setDialog(null);
        document.querySelectorAll(".split.detail-open").forEach((node) => node.classList.remove("detail-open"));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const routeTarget = target.closest<HTMLElement>("[data-route]");
      if (routeTarget) {
        const targetRoute = routeTarget.getAttribute("data-route");
        if (targetRoute) {
          event.preventDefault();
          navigate(`/${targetRoute}`);
          setMobileOpen(false);
        }
      }
      const sheetTarget = target.closest<HTMLElement>("[data-sheet],[data-route-detail]");
      if (sheetTarget) {
        event.preventDefault();
        setSheet(parseLegacySheet(sheetTarget.getAttribute("data-sheet") || sheetTarget.getAttribute("data-route-detail")));
      }
      const toastTarget = target.closest<HTMLElement>("[data-toast]");
      if (toastTarget) toast(toastTarget.getAttribute("data-toast") || "完成", (toastTarget.getAttribute("data-toast-tone") as "ok" | "warn" | "info") || "ok");
      const smokeTarget = target.closest<HTMLElement>("[data-smoke]");
      if (smokeTarget) toast(`${smokeTarget.getAttribute("data-smoke")} 连通检查通过`, "ok");
      const editEndpointTarget = target.closest<HTMLElement>("[data-edit-endpoint]");
      if (editEndpointTarget) toast(`编辑 ${editEndpointTarget.getAttribute("data-edit-endpoint")}`, "info");
      const setDefaultTarget = target.closest<HTMLElement>("[data-set-default-model]");
      if (setDefaultTarget) toast(`${setDefaultTarget.getAttribute("data-set-default-model")} 已设为默认`, "ok");
      const toggleTarget = target.closest<HTMLElement>(".toggle");
      if (toggleTarget && !toggleTarget.dataset.boundByPage) {
        toggleTarget.classList.toggle("on");
        const on = toggleTarget.classList.contains("on");
        const message = on ? toggleTarget.getAttribute("data-toast-on") : toggleTarget.getAttribute("data-toast-off");
        if (message) toast(message, on ? "ok" : "warn");
      }
      const segButton = target.closest<HTMLButtonElement>(".seg button, .seg-radio button");
      if (segButton) {
        const seg = segButton.parentElement;
        if (seg) Array.from(seg.children).forEach((child) => child.classList.toggle("on", child === segButton));
        const tab = segButton.getAttribute("data-tab");
        if (tab) {
          document.querySelectorAll<HTMLElement>("[data-tabpanel]").forEach((panel) => {
            panel.hidden = panel.getAttribute("data-tabpanel") !== tab;
          });
        }
      }
      const accHead = target.closest<HTMLElement>(".acc-head");
      if (accHead) accHead.closest(".acc")?.classList.toggle("open");
      const row = target.closest<HTMLElement>(".trow[data-row]");
      if (row && row.closest(".split") && window.matchMedia("(max-width:1080px)").matches) {
        row.closest(".split")?.classList.add("detail-open");
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate, toast]);

  useFocusTrap(commandOpen, cmdRef, cmdInputRef);
  useFocusTrap(Boolean(sheet), sheetRef);
  useFocusTrap(Boolean(dialog), dialogRef);

  useEffect(() => {
    refreshIcons();
  }, [commandOpen, dialog, mobileOpen, navCollapsed, palette, refreshIcons, route, sheet, theme, toasts]);

  const runCommand = (item: CommandItem | undefined) => {
    if (!item) return;
    setCommandOpen(false);
    setCommandQuery("");
    item.act();
  };

  return (
    <ShellContext.Provider value={shell}>
      <div className="aurora" />
      <div className="app" id="app" data-nav={navCollapsed ? "collapsed" : "expanded"} data-mobile={mobileOpen ? "open" : "closed"}>
        <a className="skip-link" href="#stage">跳到主内容</a>
        <button className="scrim mobile-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />
        <aside className="sidebar">
          <div className="brand"><div className="logo">TV</div><div className="brand-copy"><strong>Tracevane</strong><span>本地 AI Agent 工作台</span></div></div>
          <button className="cmd-trigger" id="cmdTrigger" onClick={() => setCommandOpen(true)}><i data-lucide="search" /><span>搜索页面或命令</span><span className="kbd">⌘K</span></button>
          <nav className="nav" aria-label="主导航">
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="nav-group-label">{group.label}</div>
                {group.items.map((item) => (
                  <Link
                    key={item.path}
                    className={`nav-item${item.path === path ? " active" : ""}${item.alert ? " alert" : ""}`}
                    to={`/${item.path}`}
                    aria-current={item.path === path ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <i data-lucide={item.icon} />
                    <span>{item.label}</span>
                    {item.count ? <span className="nav-count">{item.count}</span> : null}
                  </Link>
                ))}
              </div>
            ))}
            {/* 平台 / 外部 runtime 分组（独立隔离，淡化，二级可折叠） */}
            <div className="nav-platform-divider" />
            <div className="nav-platform-label">平台 / 外部 runtime</div>
            {platformGroups.map((pg) => {
              const isOpen = platformOpen[pg.id] ?? true;
              return (
                <div key={pg.id} className={`nav-platform-group${isOpen ? " open" : ""}`}>
                  <button
                    className="nav-platform-head"
                    aria-expanded={isOpen}
                    onClick={() => setPlatformOpen((prev) => ({ ...prev, [pg.id]: !isOpen }))}
                  >
                    <i data-lucide={pg.icon} />
                    <span>{pg.label}</span>
                    <i data-lucide="chevron-right" className="chev" />
                  </button>
                  <div className="nav-platform-body">
                    {pg.sections.map((sec) => {
                      const to = `/${pg.basePath}/${sec.path}`;
                      const full = `${pg.basePath}/${sec.path}`;
                      const active = path === full;
                      return (
                        <Link
                          key={sec.path}
                          className={`nav-item${active ? " active" : ""}`}
                          to={to}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMobileOpen(false)}
                        >
                          <i data-lucide={sec.icon} />
                          <span>{sec.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="nav-foot">
            <button className="btn-icon btn-ghost" title="折叠导航" aria-label="折叠导航" onClick={() => setNavCollapsed((value) => !value)}><i data-lucide="panel-left-close" /></button>
            <button className="btn-icon btn-ghost" title="切换深浅主题" aria-label="切换深浅主题" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}><i data-lucide="sun-moon" /></button>
            <button className="btn-icon btn-ghost" title="切换配色" aria-label="切换配色" onClick={() => setPalette((value) => ({ blue: "teal", teal: "violet", violet: "graphite", graphite: "blue" })[value] || "blue")}><i data-lucide="palette" /></button>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <div className="top-left">
              <button className="btn-icon btn-ghost mobile-menu" aria-label="打开导航" onClick={() => setMobileOpen(true)}><i data-lucide="menu" /></button>
              <div className="crumb"><span>{route.group} / {route.label}</span><strong>{route.label}</strong></div>
            </div>
            <div className="top-actions">
              <button className="top-search" aria-label="打开命令面板" onClick={() => setCommandOpen(true)}><i data-lucide="search" /><span>搜索</span><span className="kbd">⌘K</span></button>
              <span className="status-dot s-ok" title={health.data?.version ? `Tracevane ${health.data.version}` : "Tracevane"}><i />{health.isError ? "API 待连接" : "live"}</span>
              <button className="btn-primary" onClick={() => navigate("/chat")}><i data-lucide="plus" /><span>新建会话</span></button>
            </div>
          </header>
          <section className="page">{children}</section>
        </main>
      </div>

      <div className={`mask sheet-mask${sheet ? " show" : ""}`} onClick={() => setSheet(null)} />
      <aside className={`sheet${sheet ? " show" : ""}`} ref={sheetRef} role="dialog" aria-modal="true" aria-label={sheet?.title || "详情"}>
        <div className="sheet-head"><div className="htitle"><strong>{sheet?.title || "详情"}</strong><span>{sheet?.sub || "来源"}</span></div><button className="btn-icon btn-ghost" aria-label="关闭" onClick={() => setSheet(null)}><i data-lucide="x" /></button></div>
        <div className="sheet-body sheet-content">
          <p className="sheet-note">{sheet?.note || ""}</p>
          <dl className="kv"><dt>状态</dt><dd>{sheet?.status || "-"}</dd><dt>来源</dt><dd>{sheet?.owner || "-"}</dd><dt>建议动作</dt><dd>{sheet?.action || "-"}</dd></dl>
          {sheet?.diff ? <div dangerouslySetInnerHTML={{ __html: `<div class="section-label" style="margin-bottom:6px;">配置 diff</div><div class="diff">${sheet.diff}</div>` }} /> : null}
          <div className="logbox sheet-log">{Array.isArray(sheet?.log) ? sheet?.log.join("\n") : sheet?.log || "waiting..."}</div>
        </div>
        <div className="sheet-foot"><button className="btn-ghost" onClick={() => setSheet(null)}>关闭</button><button className="btn-primary" onClick={() => { toast(sheet?.action || "已执行建议动作", "info"); setSheet(null); }}><i data-lucide="arrow-right" /><span>执行建议动作</span></button></div>
      </aside>

      <div className={`dlg-mask dialog-mask${dialog ? " show" : ""}`} onClick={() => setDialog(null)}>
        <div className="dlg" ref={dialogRef} role="dialog" aria-modal="true" aria-label={dialog?.title || "确认"} onClick={(event) => event.stopPropagation()}>
          <div className={`dlg-head ${dialog?.tone || "info"}`}><span className="di"><i data-lucide={dialog?.icon || "shield-alert"} /></span><strong>{dialog?.title || "确认操作"}</strong></div>
          <div className="dlg-body" dangerouslySetInnerHTML={{ __html: dialog?.body || "" }} />
          <div className="dlg-foot"><button className="btn-ghost" onClick={() => setDialog(null)}>取消</button><button className={`btn-primary${dialog?.tone === "danger" ? " danger" : ""}`} onClick={() => { const confirm = dialog?.onConfirm; setDialog(null); confirm?.(); }}><span>{dialog?.okLabel || "确认"}</span></button></div>
        </div>
      </div>

      <div className={`cmd-mask${commandOpen ? " show" : ""}`} onClick={() => setCommandOpen(false)}>
        <div className="cmd" ref={cmdRef} role="dialog" aria-label="命令面板" onClick={(event) => event.stopPropagation()}>
          <div className="cmd-input"><i data-lucide="search" /><input ref={cmdInputRef} value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setCommandIndex((value) => (value + 1) % Math.max(filteredCommands.length, 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setCommandIndex((value) => (value - 1 + Math.max(filteredCommands.length, 1)) % Math.max(filteredCommands.length, 1)); }
            if (event.key === "Enter") { event.preventDefault(); runCommand(filteredCommands[commandIndex]); }
          }} placeholder="搜索页面或命令..." /><span className="kbd">esc</span></div>
          <div className="cmd-list">
            {filteredCommands.length ? filteredCommands.map((item, index) => {
              const showGroup = index === 0 || filteredCommands[index - 1].group !== item.group;
              return (
                <div key={`${item.group}-${item.label}`}>
                  {showGroup ? <div className="cmd-group">{item.group}</div> : null}
                  <button className={`cmd-item${index === commandIndex ? " cur" : ""}`} onMouseEnter={() => setCommandIndex(index)} onClick={() => runCommand(item)}><i data-lucide={item.icon} /><span>{item.label}</span>{item.kbd ? <span className="kbd">{item.kbd}</span> : null}</button>
                </div>
              );
            }) : <div className="empty">无匹配命令</div>}
          </div>
        </div>
      </div>

      <div className="toast-wrap">
        {toasts.map((item) => (
          <div key={item.id} className={`toast ${item.tone} show`}><span className="ti"><i data-lucide={item.tone === "warn" ? "alert-triangle" : item.tone === "info" ? "info" : "check"} /></span><span>{item.message}</span></div>
        ))}
      </div>
    </ShellContext.Provider>
  );
}
