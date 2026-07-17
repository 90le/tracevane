import * as React from "react";
import { Puzzle } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { SectionNav } from "@/design/ui/section-nav";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { useSkillsSummaryQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, boolText, DetailRail, EvidenceRow, Panel, ReadOnlyStrip, RefreshButton, ResponsiveTable, SearchBox, SelectableRow, StatusPill, WorkbenchToolbar, statusTone, useSelectedKey } from "../components";

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
  if (!skills.data && (skills.isLoading || skills.isPending || skills.isFetching)) {
    return <LoadingState title="正在加载快速 Skills 摘要" description="完整 openclaw skills list 可在页面内手动刷新。" />;
  }
  if (skills.error) return <ErrorState title="无法加载 Skills 摘要" description={skills.error.message} />;
  const needsSetup = skills.data?.counts.needsSetup ?? 0;
  const blocked = skills.data?.counts.blocked ?? 0;
  return (
    <div className="grid gap-[18px]">
      <ReadOnlyStrip>Skills 展示安装、启用与依赖证据；安装/删除/密钥写入需要 OpenClaw 技能管理确认流。</ReadOnlyStrip>
      <MetricRail>
        <MetricTile label="全部技能" value={skills.data?.counts.total ?? 0} hint={skills.data?.stale ? "快速摘要" : "完整扫描"} icon={<Puzzle />} />
        <MetricTile label="可用" value={skills.data?.counts.ready ?? 0} tone="ok" hint={`${skills.data?.counts.enabled ?? 0} 已启用`} />
        <MetricTile label="需配置" value={needsSetup} tone={needsSetup > 0 ? "warn" : "default"} hint="缺失依赖" />
        <MetricTile label="阻止" value={blocked} tone={blocked > 0 ? "bad" : "default"} hint="白名单 / 策略限制" />
      </MetricRail>
      <Panel>
        <WorkbenchToolbar title="OpenClaw Skills" description="首屏使用快速本地摘要；需要 openclaw CLI 完整扫描时点击“完整扫描”。">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索 Skill / slug / 来源" />
          <Button variant="outline" size="sm" onClick={() => { setFullScan(true); setTimeout(() => { void skills.refetch(); }, 0); }} disabled={skills.isFetching}>完整扫描</Button>
          <RefreshButton loading={skills.isFetching} onClick={() => { void skills.refetch(); }} />
          <BoundaryBadge />
        </WorkbenchToolbar>
        <div className="border-b border-line px-3 py-2">
          <SectionNav
            ariaLabel="Skills 状态筛选"
            items={[{ id: "all", label: "全部状态", count: list.length }, ...statuses.map((item) => ({ id: item, label: item, count: list.filter((skill) => skill.status === item).length }))]}
            value={status}
            onChange={setStatus}
          />
        </div>
        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 rounded-md border border-line bg-panel">
            <ResponsiveTable
              columns={["Skill", "状态", "来源"]}
              rows={filtered.map((skill) => (
                <SelectableRow key={skill.slug} id={skill.slug} selected={selectedKey === skill.slug} onSelect={setSelectedKey}>
                  <td className="max-w-[360px] truncate px-4 py-3">
                    <div className="font-medium text-ink-strong">{skill.emoji ?? ""} {skill.name}</div>
                    <div className="truncate text-xs text-muted">{skill.slug}</div>
                  </td>
                  <td className="px-4 py-3"><StatusPill tone={statusTone(skill.status)}>{skill.status}</StatusPill></td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-muted">{skill.sourceCategory}</td>
                </SelectableRow>
              ))}
              empty="无匹配技能"
            />
          </div>
          <DetailRail title={selected?.name ?? "未选择技能"} subtitle={selected?.slug ?? "—"}>
            <EvidenceRow label="状态" value={selected ? <StatusPill tone={statusTone(selected.status)}>{selected.status}</StatusPill> : "—"} />
            <EvidenceRow label="来源" value={selected?.sourceCategory ?? "—"} />
            <EvidenceRow label="启用" value={selected ? boolText(selected.enabled) : "—"} />
            <EvidenceRow label="注册表" value={skills.data?.stale ? <Badge variant="warn">快速摘要</Badge> : <Badge variant="ok">完整扫描</Badge>} />
          </DetailRail>
        </div>
      </Panel>
    </div>
  );
}
