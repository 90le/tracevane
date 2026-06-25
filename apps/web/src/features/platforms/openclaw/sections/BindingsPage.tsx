import * as React from "react";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useChannelsSummaryQuery } from "@/lib/query/channels";
import { BoundaryBadge, DetailRail, EvidenceRow, OwnerHandoff, ReadOnlyStrip, RefreshButton, ResponsiveTable, SearchBox, SelectableRow, WorkbenchToolbar, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

export function BindingsPage() {
  const channels = useChannelsSummaryQuery();
  const [query, setQuery] = React.useState("");
  const bindings = channels.data?.bindings ?? [];
  const filtered = bindings.filter((binding) => `${binding.id} ${binding.channel} ${binding.accountId ?? ""} ${binding.agentId}`.toLowerCase().includes(query.toLowerCase()));
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((binding) => binding.id));
  const selected = filtered.find((binding) => binding.id === selectedKey) ?? filtered[0] ?? bindings[0];
  if (channels.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (channels.error) return <ErrorState title="无法加载 Bindings 摘要" description={channels.error.message} />;
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>这里不是 Tracevane IM 路由绑定：只读展示 OpenClaw 上游 Channel 到 Agent/ACP 的静态绑定证据；IM 会话级动态路由、默认目录和队列仍在 IM 渠道域。</ReadOnlyStrip>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="OpenClaw 原生绑定" description="只读查看上游静态匹配规则、Agent 和 ACP 后端证据；Tracevane 路由绑定请去 IM 渠道。"><SearchBox value={query} onChange={setQuery} placeholder="搜索 OpenClaw binding / agent" /><RefreshButton loading={channels.isFetching} onClick={() => { void channels.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar><div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3"><div className="grid gap-3 md:grid-cols-3"><StatTile label="原生绑定" value={bindings.length} sub="OpenClaw static" /><StatTile label="原生 Agent" value={channels.data?.agents.length ?? 0} sub="OpenClaw options" /><StatTile label="checked" value={channels.data?.checkedAt ? new Date(channels.data.checkedAt).toLocaleTimeString() : "—"} sub="last check" /></div><ResponsiveTable columns={["静态匹配", "OpenClaw 目标", "ACP 后端"]} rows={filtered.map((binding) => <SelectableRow key={binding.id} id={binding.id} selected={selectedKey === binding.id} onSelect={setSelectedKey}><td className="max-w-[360px] truncate px-4 py-3"><div className="font-medium text-ink-strong">{binding.channel} · {binding.accountId ?? "default"}</div><div className="truncate text-xs text-muted">peer={binding.match.peerKind ?? "any"}</div></td><td className="max-w-[240px] truncate px-4 py-3 text-muted">{binding.type} → {binding.agentId}</td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{binding.acp?.backend ?? "—"}</td></SelectableRow>)} empty="无匹配绑定" /></div><DetailRail title={selected?.id ?? "未选择绑定"} subtitle={selected ? `${selected.channel} → ${selected.agentId}` : "—"}><EvidenceRow label="OpenClaw channel" value={selected?.channel ?? "—"} /><EvidenceRow label="原生账号" value={selected?.accountId ?? "default"} /><EvidenceRow label="peer 类型" value={selected?.match.peerKind ?? "any"} /><EvidenceRow label="OpenClaw 目标" value={selected ? `${selected.type} → ${selected.agentId}` : "—"} /><EvidenceRow label="ACP 后端" value={selected?.acp?.backend ?? "—"} /></DetailRail></div></section>
    <OwnerHandoff title="动态 IM 路由属于 IM 渠道" description="OpenClaw binding 是上游静态证据；Tracevane 会话覆盖、默认目录、默认模型和队列策略在 IM Channels。" to="/im-channels?view=routes" action="打开绑定路由" />
  </div>;
}
