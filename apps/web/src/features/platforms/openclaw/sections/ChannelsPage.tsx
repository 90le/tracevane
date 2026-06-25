import * as React from "react";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useChannelsSummaryQuery } from "@/lib/query/channels";
import { BoundaryBadge, DetailRail, EvidenceRow, OwnerHandoff, ReadOnlyStrip, RefreshButton, ResponsiveTable, SearchBox, SelectableRow, StatusPill, WorkbenchToolbar, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

export function ChannelsPage() {
  const channels = useChannelsSummaryQuery();
  const [query, setQuery] = React.useState("");
  const list = channels.data?.channels ?? [];
  const filtered = list.filter((channel) => `${channel.type} ${channel.dmPolicy ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((channel) => channel.type));
  const selected = filtered.find((channel) => channel.type === selectedKey) ?? filtered[0] ?? list[0];
  if (channels.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (channels.error) return <ErrorState title="无法加载 Channels 摘要" description={channels.error.message} />;
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip tone="warn">这里不是 Tracevane IM 渠道：只读展示 OpenClaw 上游 channels 配置摘要；Bot token、账号绑定、投递队列和会话运行态仍在 IM 渠道域。</ReadOnlyStrip>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="OpenClaw 原生 Channel" description="只读查看上游 channel/account/profile 证据；Tracevane IM 配置请去 IM 渠道。"><SearchBox value={query} onChange={setQuery} placeholder="搜索 OpenClaw channel" /><RefreshButton loading={channels.isFetching} onClick={() => { void channels.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar><div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="原生渠道" value={channels.data?.counts.channels ?? 0} sub="OpenClaw 上游" /><StatTile label="原生账号" value={channels.data?.counts.accounts ?? 0} sub="OpenClaw accounts" /><StatTile label="原生 profiles" value={channels.data?.counts.profiles ?? 0} sub="routing profiles" /><StatTile label="pairing" value={channels.data?.counts.pairingPending ?? 0} sub="pending" /></div><ResponsiveTable columns={["OpenClaw channel", "原生账号", "静态绑定", "DM 策略"]} rows={filtered.map((channel) => <SelectableRow key={channel.type} id={channel.type} selected={selectedKey === channel.type} onSelect={setSelectedKey}><td className="max-w-[260px] truncate px-4 py-3"><div className="font-medium text-ink-strong">{channel.type}</div><div className="text-xs text-muted">OpenClaw 上游</div></td><td className="px-4 py-3 text-muted">{channel.accountCount}</td><td className="px-4 py-3 text-muted">{channel.bindingCount}</td><td className="px-4 py-3"><StatusPill tone={channel.enabled ? "ok" : "warn"}>{channel.dmPolicy ?? (channel.enabled ? "已启用" : "已停用")}</StatusPill></td></SelectableRow>)} empty="无匹配 OpenClaw Channel" /></div><DetailRail title={selected?.type ?? "未选择 Channel"} subtitle="OpenClaw 上游证据"><EvidenceRow label="定义状态" value={selected ? (selected.enabled ? "已启用" : "已停用") : "—"} /><EvidenceRow label="原生账号" value={selected?.accountCount ?? "—"} /><EvidenceRow label="静态绑定" value={selected?.bindingCount ?? "—"} /><EvidenceRow label="DM 策略" value={selected?.dmPolicy ?? "—"} /></DetailRail></div></section>
    <OwnerHandoff title="IM 凭据与投递属于 IM 渠道" description="Tracevane Bot token、账号绑定、默认 Agent/模型/目录、队列和会话投递都在 IM Channels 管理。" to="/im-channels" action="打开 IM 渠道" />
  </div>;
}
