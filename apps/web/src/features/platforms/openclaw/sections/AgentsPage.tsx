import * as React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useAgentsSummaryQuery, useAgentRuntimeRunsQuery } from "@/lib/query/agents";
import { BoundaryBadge, DetailRail, EvidenceRow, OwnerHandoff, ReadOnlyStrip, ResponsiveTable, SearchBox, StatusPill, WorkbenchToolbar } from "../components";
import { StatTile } from "../../_shared";

export function AgentsPage() {
  const agents = useAgentsSummaryQuery();
  const runs = useAgentRuntimeRunsQuery();
  const [query, setQuery] = React.useState("");
  if (agents.isLoading || runs.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (agents.error) return <ErrorState title="无法加载 Agents 摘要" description={agents.error.message} />;
  const list = agents.data?.agents ?? [];
  const filtered = list.filter((agent) => `${agent.name} ${agent.id} ${agent.model ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const selected = filtered[0] ?? list[0];
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>这里管理 OpenClaw Agent 定义证据；CLI 会话、运行控制和 Agent Runs 仍在 CLI 代理 / IDE。</ReadOnlyStrip>
    <PanelShell title="Agent roster" description="搜索 Agent，查看 persona/model/source 证据。" toolbar={<><SearchBox value={query} onChange={setQuery} placeholder="搜索 agent / model" /><BoundaryBadge /></>}>
      <div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="Agents" value={agents.data?.count ?? 0} sub={`默认 ${agents.data?.defaultAgentId ?? "—"}`} /><StatTile label="可用模型" value={agents.data?.availableModels.length ?? 0} sub="OpenClaw roster" /><StatTile label="运行中" value={runs.data?.totals.running ?? "—"} sub="owner: CLI Agents" /><StatTile label="失败" value={runs.data?.totals.failed ?? "—"} sub="owner: CLI Agents" /></div><ResponsiveTable columns={["agent", "model", "status"]} rows={filtered.map((agent) => <tr key={agent.id}><td className="max-w-[320px] truncate px-4 py-3"><div className="font-medium text-ink-strong">{agent.name}</div><div className="truncate text-xs text-muted">{agent.id}</div></td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{agent.model || "—"}</td><td className="px-4 py-3"><StatusPill tone={agent.enabled ? "ok" : "warn"}>{agent.enabled ? "enabled" : "disabled"}</StatusPill></td></tr>)} empty="无匹配 Agent" /></div>
        <DetailRail title={selected?.name ?? "未选择 Agent"} subtitle={selected?.id ?? "—"}><EvidenceRow label="enabled" value={selected ? String(selected.enabled) : "—"} /><EvidenceRow label="model" value={selected?.model || "—"} /><EvidenceRow label="default" value={selected?.id === agents.data?.defaultAgentId ? "是" : "否"} /><EvidenceRow label="available models" value={agents.data?.availableModels.slice(0, 3).join(" / ") || "—"} /><div className="px-4 py-2"><Button variant="outline" size="sm" asChild><Link to="/cli-agents">查看 CLI 运行台</Link></Button></div></DetailRail>
      </div>
    </PanelShell>
    <OwnerHandoff title="运行控制属于 CLI 代理" description="OpenClaw Agents 页面只展示定义；启动、停止、会话、运行日志和模型选择进入 CLI Agents。" to="/cli-agents" />
  </div>;
}

function PanelShell({ title, description, toolbar, children }: { title: string; description: string; toolbar: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title={title} description={description}>{toolbar}</WorkbenchToolbar>{children}</section>;
}
