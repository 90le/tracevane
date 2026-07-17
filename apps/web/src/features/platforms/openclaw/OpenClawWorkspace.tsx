import { Link, useNavigate } from "react-router-dom";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { PageHeader } from "@/design/ui/page-header";
import { SectionNav } from "@/design/ui/section-nav";
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
  const goToSection = (id: string) => {
    const next = OPENCLAW_SECTIONS.find((item) => item.id === id);
    if (next) navigate(next.path);
  };

  return (
    <div className="grid min-w-0 gap-[18px]">
      <PlatformBreadcrumb items={[{ label: "平台", to: "/platforms" }, { label: "OpenClaw", to: "/platforms/openclaw" }, { label: active.label }]} />
      <PageHeader
        className="px-0"
        title="OpenClaw 平台工作台"
        description={`${active.description} Platform 只承接 OpenClaw 原生平台能力；模型网关、IM、CLI、Workspace 的写入口仍留在各自 owner 域。`}
        meta={<><Badge variant="info">第三方平台</Badge><Badge variant="mute">{active.label}</Badge></>}
        actions={<Button variant="outline" asChild><Link to="/platforms">返回平台目录</Link></Button>}
      />
      <div className="grid gap-2">
        <div className="flex min-w-0 items-center gap-2 md:hidden">
          <label className="sr-only" htmlFor="openclaw-section-select">OpenClaw 子页面</label>
          <select
            id="openclaw-section-select"
            className="min-w-0 flex-1 rounded-sm border border-line bg-panel px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]"
            value={section}
            onChange={(event) => goToSection(event.target.value)}
          >
            {OPENCLAW_SECTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <nav aria-label="OpenClaw 平台导航" className="hidden min-w-0 md:block">
          <SectionNav
            ariaLabel="OpenClaw 平台导航"
            items={OPENCLAW_SECTIONS.map((item) => ({ id: item.id, label: item.label }))}
            value={section}
            onChange={goToSection}
          />
        </nav>
      </div>
      {renderSection(section)}
    </div>
  );
}
