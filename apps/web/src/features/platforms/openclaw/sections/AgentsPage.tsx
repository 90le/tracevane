import * as React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useAgentsSummaryQuery } from "@/lib/query/agents";
import { BoundaryBadge, DetailRail, EvidenceRow, OwnerHandoff, ReadOnlyStrip, RefreshButton, ResponsiveTable, SearchBox, SelectableRow, StatusPill, WorkbenchToolbar, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

export function AgentsPage() {
  const agents = useAgentsSummaryQuery();
  const [query, setQuery] = React.useState("");
  const list = agents.data?.agents ?? [];
  const filtered = list.filter((agent) => `${agent.name} ${agent.id} ${agent.model ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((agent) => agent.id));
  const selected = filtered.find((agent) => agent.id === selectedKey) ?? filtered[0] ?? list[0];
  if (agents.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (agents.error) return <ErrorState title="无法加载 Agents 摘要" description={agents.error.message} />;
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>这里不是 Tracevane CLI Agents：不启动、不停止、不管理运行会话，只显示 OpenClaw 上游 agents.list / defaults 里的原生 Agent 定义证据。</ReadOnlyStrip>
    <PanelShell title="OpenClaw 原生 Agent" description="只读查看上游 agents.list、默认 Agent 与可用模型证据；运行台请去 Tracevane CLI Agents。" toolbar={<><SearchBox value={query} onChange={setQuery} placeholder="搜索 OpenClaw agent / model" /><RefreshButton loading={agents.isFetching} onClick={() => { void agents.refetch(); }} /><BoundaryBadge /></>}>
      <div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="原生 Agent" value={agents.data?.count ?? 0} sub={`默认 ${agents.data?.defaultAgentId ?? "—"}`} /><StatTile label="可用模型" value={agents.data?.availableModels.length ?? 0} sub="OpenClaw roster" /><StatTile label="来源" value="OpenClaw" sub="agents.list" /><StatTile label="运行台" value="Tracevane" sub="CLI Agents 独立管理" /></div><ResponsiveTable columns={["OpenClaw agent", "默认模型", "定义状态"]} rows={filtered.map((agent) => <SelectableRow key={agent.id} id={agent.id} selected={selectedKey === agent.id} onSelect={setSelectedKey}><td className="max-w-[320px] truncate px-4 py-3"><div className="font-medium text-ink-strong">{agent.name}</div><div className="truncate text-xs text-muted">{agent.id}</div></td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{agent.model || "—"}</td><td className="px-4 py-3"><StatusPill tone={agent.enabled ? "ok" : "warn"}>{agent.enabled ? "已启用" : "已停用"}</StatusPill></td></SelectableRow>)} empty="无匹配 Agent" /></div>
        <DetailRail title={selected?.name ?? "未选择 Agent"} subtitle={selected?.id ?? "—"}><EvidenceRow label="定义状态" value={selected ? (selected.enabled ? "已启用" : "已停用") : "—"} /><EvidenceRow label="默认模型" value={selected?.model || "—"} /><EvidenceRow label="是否默认 Agent" value={selected?.id === agents.data?.defaultAgentId ? "是" : "否"} /><EvidenceRow label="可用模型证据" value={agents.data?.availableModels.slice(0, 3).join(" / ") || "—"} /><div className="px-4 py-2"><Button variant="outline" size="sm" asChild><Link to="/cli-agents">查看 CLI 运行台</Link></Button></div></DetailRail>
      </div>
    </PanelShell>
    <OwnerHandoff title="运行控制属于 CLI 代理" description="OpenClaw 原生 Agent 页面只展示上游定义；Tracevane CLI Agent 的启动、停止、会话、运行日志和模型选择进入 CLI Agents。" to="/cli-agents" />
  </div>;
}

function PanelShell({ title, description, toolbar, children }: { title: string; description: string; toolbar: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title={title} description={description}>{toolbar}</WorkbenchToolbar>{children}</section>;
}
