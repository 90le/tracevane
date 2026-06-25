import * as React from "react";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useOpenClawConfigSummaryQuery, usePatchOpenClawConfigMutation, useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, DetailRail, EvidenceRow, JsonSnippet, Panel, PanelHead, ReadOnlyStrip, RefreshButton, ResponsiveTable, SelectableRow, WorkbenchToolbar, fmtDate, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";
import type { ConfigPatchPayload, ConfigSummaryPayload } from "../../../../../../../types/config";

interface ConfigDraft {
  model: string;
  maxConcurrent: string;
  workspace: string;
  repoRoot: string;
  contextTokens: string;
  compactionMode: string;
  compactionModel: string;
  reserveTokensFloor: string;
}

function draftFromConfig(data: ConfigSummaryPayload | undefined): ConfigDraft {
  return {
    model: data?.defaults.model ?? "",
    maxConcurrent: data?.defaults.maxConcurrent != null ? String(data.defaults.maxConcurrent) : "",
    workspace: data?.defaults.workspace ?? "",
    repoRoot: data?.defaults.repoRoot ?? "",
    contextTokens: data?.defaults.contextTokens != null ? String(data.defaults.contextTokens) : "",
    compactionMode: data?.compaction.mode ?? "safeguard",
    compactionModel: data?.compaction.model ?? "",
    reserveTokensFloor: data?.compaction.reserveTokensFloor != null ? String(data.compaction.reserveTokensFloor) : "",
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = numberOrNull(value);
  return parsed == null ? fallback : Math.max(0, Math.floor(parsed));
}

function draftToPatch(draft: ConfigDraft, current: ConfigSummaryPayload): ConfigPatchPayload {
  const patch = {
    defaults: {
      model: draft.model.trim(),
      maxConcurrent: positiveNumber(draft.maxConcurrent, current.defaults.maxConcurrent || 1),
      workspace: draft.workspace.trim(),
      repoRoot: draft.repoRoot.trim(),
      contextTokens: numberOrNull(draft.contextTokens),
    },
    compaction: {
      mode: draft.compactionMode.trim() || current.compaction.mode,
      model: draft.compactionModel.trim(),
      reserveTokensFloor: positiveNumber(draft.reserveTokensFloor, current.compaction.reserveTokensFloor || 0),
    },
  };
  return patch as ConfigPatchPayload;
}

function TextField({ label, value, onChange, helper, type = "text" }: { label: string; value: string; onChange: (value: string) => void; helper?: string; type?: string }) {
  return <label className="grid gap-1.5 border-b border-line px-4 py-3 last:border-b-0"><span className="text-sm font-medium text-ink-strong">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]" />{helper ? <span className="text-xs text-muted">{helper}</span> : null}</label>;
}

function SelectField({ label, value, onChange, options, helper }: { label: string; value: string; onChange: (value: string) => void; options: string[]; helper?: string }) {
  return <label className="grid gap-1.5 border-b border-line px-4 py-3 last:border-b-0"><span className="text-sm font-medium text-ink-strong">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>{helper ? <span className="text-xs text-muted">{helper}</span> : null}</label>;
}

export function ConfigPage() {
  const config = useOpenClawConfigSummaryQuery();
  const diagnostics = useSystemDiagnosticsQuery();
  const patchConfig = usePatchOpenClawConfigMutation();
  const [draft, setDraft] = React.useState<ConfigDraft>(() => draftFromConfig(undefined));
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (config.data && !patchConfig.isPending) setDraft(draftFromConfig(config.data));
  }, [config.data?.checkedAt]);

  if (config.isLoading || diagnostics.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[280px] w-full" /></div>;
  if (config.error) return <ErrorState title="无法加载 OpenClaw 配置摘要" description={config.error.message} />;
  const data = config.data;
  const diag = diagnostics.data;
  const mcpServers = Object.entries(data?.mcp?.servers ?? {});
  const commands = Object.entries(data?.commands ?? {});
  const configRows = [
    ...mcpServers.map(([name, value]) => ({ id: `mcp:${name}`, kind: "MCP server", name, value })),
    ...commands.map(([name, value]) => ({ id: `command:${name}`, kind: "Command", name, value })),
  ];
  const [selectedConfigKey, setSelectedConfigKey] = useSelectedKey(configRows.map((item) => item.id));
  const selectedConfig = configRows.find((item) => item.id === selectedConfigKey) ?? configRows[0];
  const currentDraft = draftFromConfig(data);
  const dirty = JSON.stringify(draft) !== JSON.stringify(currentDraft);
  const setField = (key: keyof ConfigDraft) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const save = () => {
    if (!data) return;
    patchConfig.mutate(draftToPatch(draft, data), {
      onSuccess: (result) => {
        setDraft(draftFromConfig(result.config));
        setSavedAt(new Date().toISOString());
        toast.success("OpenClaw 配置已保存", { description: result.message });
        void config.refetch();
        void diagnostics.refetch();
      },
      onError: (error) => toast.error("保存配置失败", { description: error.message }),
    });
  };
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>配置页已支持第一批低风险字段 PATCH 保存。MCP、Commands、raw JSON、密钥和 Provider 写入仍保持只读，避免无保护配置覆盖。</ReadOnlyStrip>
    <Panel>
      <WorkbenchToolbar title="配置工作台" description="Defaults、模型压缩、MCP、commands 与运行边界。"><RefreshButton loading={config.isFetching || diagnostics.isFetching} onClick={() => { void config.refetch(); void diagnostics.refetch(); }} /><BoundaryBadge /><Badge variant={dirty ? "warn" : "mute"}>{dirty ? "有未保存修改" : `checked ${fmtDate(data?.checkedAt)}`}</Badge></WorkbenchToolbar>
      <div className="grid gap-3 p-3 md:grid-cols-4"><StatTile label="默认模型" value={data?.defaults.model ?? "—"} sub="OpenClaw default" /><StatTile label="并发" value={data?.defaults.maxConcurrent ?? "—"} sub="maxConcurrent" /><StatTile label="MCP servers" value={mcpServers.length} sub="read-only" /><StatTile label="commands" value={commands.length} sub="read-only" /></div>
    </Panel>
    <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-[18px]">
        <Panel><PanelHead title="Defaults / Models" sub="第一批可保存字段，走 PATCH /api/config 合并路径。" action={<Badge variant={dirty ? "warn" : "ok"}>{dirty ? "draft" : "synced"}</Badge>} /><div className="divide-y divide-line"><TextField label="默认模型" value={draft.model} onChange={setField("model")} helper="agents.defaults.model.primary；空值会交给后端 normalize。" /><TextField label="最大并发" type="number" value={draft.maxConcurrent} onChange={setField("maxConcurrent")} helper="agents.defaults.maxConcurrent，保存时会转为非负整数。" /><TextField label="Workspace" value={draft.workspace} onChange={setField("workspace")} helper="默认启动目录。" /><TextField label="Repo root" value={draft.repoRoot} onChange={setField("repoRoot")} helper="默认仓库根目录。" /><TextField label="Context tokens" type="number" value={draft.contextTokens} onChange={setField("contextTokens")} helper="留空表示删除该字段，由 OpenClaw 默认处理。" /></div><div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3"><Button size="sm" onClick={save} disabled={!dirty || patchConfig.isPending}>{patchConfig.isPending ? "保存中…" : "保存配置"}</Button><Button variant="ghost" size="sm" onClick={() => setDraft(currentDraft)} disabled={!dirty || patchConfig.isPending}>重置</Button>{savedAt ? <span className="text-xs text-muted">最近保存：{fmtDate(savedAt)}</span> : null}</div></Panel>
        <Panel><PanelHead title="Compaction" sub="上下文压缩相关字段。" /><div className="divide-y divide-line"><SelectField label="模式" value={draft.compactionMode} onChange={setField("compactionMode")} options={["safeguard", "auto", "off"]} helper="不认识的模式仍可由后端 normalize；这里只提供常用选项。" /><TextField label="压缩模型" value={draft.compactionModel} onChange={setField("compactionModel")} helper="agents.defaults.compaction.model" /><TextField label="Reserve tokens floor" type="number" value={draft.reserveTokensFloor} onChange={setField("reserveTokensFloor")} helper="agents.defaults.compaction.reserveTokensFloor" /></div></Panel>
        <Panel><PanelHead title="MCP servers" sub="长配置以表格证据呈现；本轮不开放写入。" /><ResponsiveTable columns={["name", "transport / summary"]} rows={mcpServers.slice(0, 24).map(([name, server]) => <SelectableRow key={name} id={`mcp:${name}`} selected={selectedConfigKey === `mcp:${name}`} onSelect={setSelectedConfigKey}><td className="max-w-[260px] truncate px-4 py-3 font-medium text-ink-strong">{name}</td><td className="px-4 py-3"><JsonSnippet value={server} /></td></SelectableRow>)} empty="无 MCP server" /></Panel>
        <Panel><PanelHead title="Commands" sub="slash command 摘要；本轮不开放写入。" /><ResponsiveTable columns={["command", "evidence"]} rows={commands.slice(0, 24).map(([name, command]) => <SelectableRow key={name} id={`command:${name}`} selected={selectedConfigKey === `command:${name}`} onSelect={setSelectedConfigKey}><td className="max-w-[260px] truncate px-4 py-3 font-medium text-ink-strong">{name}</td><td className="px-4 py-3"><JsonSnippet value={command} /></td></SelectableRow>)} empty="无 commands" /></Panel>
      </div>
      <DetailRail title={selectedConfig?.name ?? "运行边界"} subtitle={selectedConfig ? selectedConfig.kind : "来自 system diagnostics"}>{selectedConfig ? <><EvidenceRow label="kind" value={selectedConfig.kind} /><EvidenceRow label="name" value={selectedConfig.name} /><div className="px-4 py-2"><JsonSnippet value={selectedConfig.value} /></div></> : null}<EvidenceRow label="openclaw root" value={diag?.config.openclawRoot ?? "—"} /><EvidenceRow label="config file" value={diag?.config.openclawConfigFile ?? "—"} /><EvidenceRow label="gateway ws" value={diag?.config.gatewayWsUrl ?? "—"} /><EvidenceRow label="control UI" value={diag?.config.gatewayControlUiBasePath ?? "—"} /><EvidenceRow label="runtime cwd" value={diag?.runtime.cwd ?? "—"} /></DetailRail>
    </div>
  </div>;
}
