import { Link, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { RecoveryPage } from "@/features/recovery/RecoveryPage";

import { PlatformBreadcrumb } from "../_shared";
import { getOpenClawSection, normalizeOpenClawSection, OPENCLAW_SECTIONS } from "../sections";
import type { PlatformSectionId } from "../types";
import { OpenClawView } from "./OpenClawView";
import { AgentsPage, BindingsPage, ChannelsPage, ConfigPage, DiagnosticsPage, LogsPage, ServicesPage, SkillsPage } from "./sections";

function renderSection(section: PlatformSectionId) {
  switch (section) {
    case "overview": return <OpenClawView />;
    case "guard": return <RecoveryPage />;
    case "config": return <ConfigPage />;
    case "agents": return <AgentsPage />;
    case "skills": return <SkillsPage />;
    case "channels": return <ChannelsPage />;
    case "bindings": return <BindingsPage />;
    case "services": return <ServicesPage />;
    case "logs": return <LogsPage />;
    case "diagnostics": return <DiagnosticsPage />;
  }
}

export function OpenClawWorkspace({ section: rawSection }: { section?: string }) {
  const navigate = useNavigate();
  const section = normalizeOpenClawSection(rawSection);
  const active = getOpenClawSection(section);

  return <div className="grid min-w-0 gap-[18px]">
    <PlatformBreadcrumb items={[{ label: "平台", to: "/platforms" }, { label: "OpenClaw", to: "/platforms/openclaw" }, { label: active.label }]} />
    <header className="grid gap-3 border-b border-line pb-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-ink-strong">OpenClaw 平台工作台</h1><Badge variant="info">第三方平台</Badge><Badge variant="mute">{active.label}</Badge></div><p className="mt-1 max-w-4xl text-sm text-muted">{active.description} Platform 只承接 OpenClaw 原生平台能力；模型网关、IM、CLI、Workspace 的写入口仍留在各自 owner 域。</p></div>
      <Button variant="outline" asChild><Link to="/platforms">返回平台目录</Link></Button>
    </header>
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <div className="flex min-w-0 items-center gap-2 border-b border-line px-3 py-2 md:hidden"><ChevronDown className="size-4 text-muted" /><label className="sr-only" htmlFor="openclaw-section-select">OpenClaw 子页面</label><select id="openclaw-section-select" className="min-w-0 flex-1 bg-transparent text-sm text-ink-strong outline-none" value={section} onChange={(event) => { const next = OPENCLAW_SECTIONS.find((item) => item.id === event.target.value); if (next) navigate(next.path); }}>{OPENCLAW_SECTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
      <nav aria-label="OpenClaw 平台导航" className="hidden min-w-0 overflow-x-auto px-2 py-2 md:block"><div className="flex min-w-max gap-1">{OPENCLAW_SECTIONS.map((item) => <Link key={item.id} to={item.path} aria-current={item.id === section ? "page" : undefined} className={cn("rounded-sm px-3 py-2 text-sm font-medium text-muted transition hover:bg-panel-2 hover:text-ink-strong", item.id === section && "bg-primary-soft text-primary")}>{item.label}</Link>)}</div></nav>
    </section>
    {renderSection(section)}
  </div>;
}
