import * as React from "react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useSkillsSummaryQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, DetailRail, EvidenceRow, ReadOnlyStrip, RefreshButton, ResponsiveTable, SearchBox, SelectableRow, StatusPill, WorkbenchToolbar, statusTone, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

export function SkillsPage() {
  const [fullScan, setFullScan] = React.useState(false);
  const skills = useSkillsSummaryQuery(undefined, { fast: !fullScan });
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const list = skills.data?.skills ?? [];
  const filtered = list.filter((skill) => (status === "all" || skill.status === status) && `${skill.name} ${skill.slug} ${skill.sourceCategory}`.toLowerCase().includes(query.toLowerCase()));
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((skill) => skill.slug));
  const selected = filtered.find((skill) => skill.slug === selectedKey) ?? filtered[0] ?? list[0];
  const statuses = Array.from(new Set(list.map((skill) => skill.status)));
  if (!skills.data && (skills.isLoading || skills.isPending || skills.isFetching)) return <div className="grid gap-[18px]" role="status" aria-busy="true"><div className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">正在加载快速 Skills 摘要；完整 openclaw skills list 可在页面内手动刷新。</div><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (skills.error) return <ErrorState title="无法加载 Skills 摘要" description={skills.error.message} />;
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>Skills 展示安装、启用与依赖证据；安装/删除/密钥写入需要 OpenClaw 技能管理确认流。</ReadOnlyStrip>
    <section className="rounded-md border border-line bg-panel shadow-sm"><WorkbenchToolbar title="OpenClaw Skills" description="首屏使用快速本地摘要；需要 openclaw CLI 完整扫描时点击“完整扫描”。"><SearchBox value={query} onChange={setQuery} placeholder="搜索 Skill / slug / 来源" /><select className="rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select><Button variant="outline" size="sm" onClick={() => { setFullScan(true); setTimeout(() => { void skills.refetch(); }, 0); }} disabled={skills.isFetching}>完整扫描</Button><RefreshButton loading={skills.isFetching} onClick={() => { void skills.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar><div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="全部技能" value={skills.data?.counts.total ?? 0} sub={skills.data?.stale ? "快速摘要" : "完整扫描"} /><StatTile label="可用" value={skills.data?.counts.ready ?? 0} sub={`${skills.data?.counts.enabled ?? 0} 已启用`} /><StatTile label="需配置" value={skills.data?.counts.needsSetup ?? 0} sub="缺失依赖" /><StatTile label="阻止" value={skills.data?.counts.blocked ?? 0} sub="allowlist / policy" /></div><ResponsiveTable columns={["Skill", "状态", "来源"]} rows={filtered.map((skill) => <SelectableRow key={skill.slug} id={skill.slug} selected={selectedKey === skill.slug} onSelect={setSelectedKey}><td className="max-w-[360px] truncate px-4 py-3"><div className="font-medium text-ink-strong">{skill.emoji ?? ""} {skill.name}</div><div className="truncate text-xs text-muted">{skill.slug}</div></td><td className="px-4 py-3"><StatusPill tone={statusTone(skill.status)}>{skill.status}</StatusPill></td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{skill.sourceCategory}</td></SelectableRow>)} empty="无匹配技能" /></div><DetailRail title={selected?.name ?? "未选择技能"} subtitle={selected?.slug ?? "—"}><EvidenceRow label="状态" value={selected ? <StatusPill tone={statusTone(selected.status)}>{selected.status}</StatusPill> : "—"} /><EvidenceRow label="来源" value={selected?.sourceCategory ?? "—"} /><EvidenceRow label="启用" value={selected ? String(selected.enabled) : "—"} /><EvidenceRow label="注册表" value={skills.data?.stale ? <Badge variant="warn">stale</Badge> : <Badge variant="ok">fresh</Badge>} /></DetailRail></div></section>
  </div>;
}
