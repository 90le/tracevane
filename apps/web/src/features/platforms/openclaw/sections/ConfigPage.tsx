import * as React from "react";
import { Badge } from "@/design/ui/badge";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useOpenClawConfigSummaryQuery, useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, EvidenceRow, JsonSnippet, Panel, PanelHead, ReadOnlyStrip, ResponsiveTable, WorkbenchToolbar, fmtDate } from "../components";
import { StatTile } from "../../_shared";

export function ConfigPage() {
  const config = useOpenClawConfigSummaryQuery();
  const diagnostics = useSystemDiagnosticsQuery();
  if (config.isLoading || diagnostics.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[280px] w-full" /></div>;
  if (config.error) return <ErrorState title="无法加载 OpenClaw 配置摘要" description={config.error.message} />;
  const data = config.data;
  const diag = diagnostics.data;
  const mcpServers = Object.entries(data?.mcp?.servers ?? {});
  const commands = Object.entries(data?.commands ?? {});
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>配置页按设置工作台呈现真实摘要。后续写入必须走 validate → diff → backup → apply → verify；本轮不提供无契约保存按钮。</ReadOnlyStrip>
    <Panel>
      <WorkbenchToolbar title="配置工作台" description="Defaults、模型压缩、MCP、commands 与运行边界。"><BoundaryBadge /><Badge variant="mute">checked {fmtDate(data?.checkedAt)}</Badge></WorkbenchToolbar>
      <div className="grid gap-3 p-3 md:grid-cols-4"><StatTile label="默认模型" value={data?.defaults.model ?? "—"} sub="OpenClaw default" /><StatTile label="并发" value={data?.defaults.maxConcurrent ?? "—"} sub="maxConcurrent" /><StatTile label="MCP servers" value={mcpServers.length} sub="config.mcp.servers" /><StatTile label="commands" value={commands.length} sub="slash commands" /></div>
    </Panel>
    <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-[18px]">
        <Panel><PanelHead title="Defaults / Models / Compaction" sub="关键配置分组，不直接暴露原始大表单。" /><div className="py-1.5"><EvidenceRow label="workspace" value={data?.defaults.workspace ?? "—"} /><EvidenceRow label="repo root" value={data?.defaults.repoRoot ?? "—"} /><EvidenceRow label="fallback" value={(data?.defaults.modelFallback ?? []).join(" / ") || "—"} /><EvidenceRow label="subagent model" value={data?.defaults.subagentModel ?? "—"} /><EvidenceRow label="context tokens" value={data?.defaults.contextTokens ?? "—"} /><EvidenceRow label="compaction" value={`${data?.compaction.mode ?? "—"} · ${data?.compaction.model ?? "—"}`} /><EvidenceRow label="reserved floor" value={data?.compaction.reserveTokensFloor ?? "—"} /></div></Panel>
        <Panel><PanelHead title="MCP servers" sub="长配置以表格证据呈现，避免撑破页面。" /><ResponsiveTable columns={["name", "transport / summary"]} rows={mcpServers.slice(0, 24).map(([name, server]) => <tr key={name}><td className="max-w-[260px] truncate px-4 py-3 font-medium text-ink-strong">{name}</td><td className="px-4 py-3"><JsonSnippet value={server} /></td></tr>)} empty="无 MCP server" /></Panel>
        <Panel><PanelHead title="Commands" sub="slash command 摘要。" /><ResponsiveTable columns={["command", "evidence"]} rows={commands.slice(0, 24).map(([name, command]) => <tr key={name}><td className="max-w-[260px] truncate px-4 py-3 font-medium text-ink-strong">{name}</td><td className="px-4 py-3"><JsonSnippet value={command} /></td></tr>)} empty="无 commands" /></Panel>
      </div>
      <Panel><PanelHead title="运行边界" sub="来自 system diagnostics。" /><div className="py-1.5"><EvidenceRow label="openclaw root" value={diag?.config.openclawRoot ?? "—"} /><EvidenceRow label="config file" value={diag?.config.openclawConfigFile ?? "—"} /><EvidenceRow label="gateway ws" value={diag?.config.gatewayWsUrl ?? "—"} /><EvidenceRow label="control UI" value={diag?.config.gatewayControlUiBasePath ?? "—"} /><EvidenceRow label="runtime cwd" value={diag?.runtime.cwd ?? "—"} /></div></Panel>
    </div>
  </div>;
}
