import * as React from "react";
import { toast } from "@/design/ui/sonner";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useAgentsSummaryQuery, useCreateAgentMutation, useDeleteAgentMutation, useUpdateAgentMutation } from "@/lib/query/agents";
import { BoundaryBadge, PanelHead, RefreshButton, ResponsiveTable, SearchBox, SelectableRow, StatusPill, WorkbenchToolbar, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

interface AgentFormDraft {
  id: string;
  name: string;
  model: string;
  workspace: string;
  enabled: boolean;
  sandboxMode: string;
  workspaceAccess: string;
  toolsProfile: string;
  thinkingDefault: string;
  verboseDefault: string;
}

const emptyAgentDraft: AgentFormDraft = {
  id: "",
  name: "",
  model: "",
  workspace: "",
  enabled: true,
  sandboxMode: "off",
  workspaceAccess: "rw",
  toolsProfile: "full",
  thinkingDefault: "high",
  verboseDefault: "off",
};

function draftFromAgent(agent: ReturnType<typeof useAgentsSummaryQuery>["data"] extends infer T ? T extends { agents: Array<infer A> } ? A : never : never | undefined): AgentFormDraft {
  return agent ? {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    workspace: agent.workspace,
    enabled: agent.enabled,
    sandboxMode: agent.sandboxMode || "off",
    workspaceAccess: agent.workspaceAccess || "rw",
    toolsProfile: agent.toolsProfile || "full",
    thinkingDefault: agent.thinkingDefault || "high",
    verboseDefault: agent.verboseDefault || "off",
  } : emptyAgentDraft;
}

function TextInput({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="grid gap-1.5"><span className="text-xs font-medium text-muted">{label}</span><input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)] disabled:opacity-60" /></label>;
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="grid gap-1.5"><span className="text-xs font-medium text-muted">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function ToggleInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm"><span className="font-medium text-ink-strong">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-primary" /></label>;
}

export function AgentsPage() {
  const agents = useAgentsSummaryQuery();
  const createAgent = useCreateAgentMutation();
  const updateAgent = useUpdateAgentMutation();
  const deleteAgent = useDeleteAgentMutation();
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<"edit" | "new">("edit");
  const list = agents.data?.agents ?? [];
  const filtered = list.filter((agent) => `${agent.name} ${agent.id} ${agent.model ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((agent) => agent.id));
  const selected = filtered.find((agent) => agent.id === selectedKey) ?? filtered[0] ?? list[0];
  const [draft, setDraft] = React.useState<AgentFormDraft>(emptyAgentDraft);

  React.useEffect(() => {
    if (mode === "edit") setDraft(draftFromAgent(selected));
  }, [selected?.id, mode]);

  if (agents.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (agents.error) return <ErrorState title="无法加载 OpenClaw 原生 Agent" description={agents.error.message} />;

  const setField = (key: keyof AgentFormDraft) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const save = () => {
    if (!draft.id.trim()) return toast.error("Agent id 不能为空");
    const payload = {
      name: draft.name.trim() || draft.id.trim(),
      model: draft.model.trim(),
      workspace: draft.workspace.trim(),
      enabled: draft.enabled,
      sandboxMode: draft.sandboxMode,
      workspaceAccess: draft.workspaceAccess,
      toolsProfile: draft.toolsProfile,
      thinkingDefault: draft.thinkingDefault,
      verboseDefault: draft.verboseDefault,
    };
    if (mode === "new") {
      createAgent.mutate({ id: draft.id.trim(), ...payload }, { onSuccess: () => { toast.success("OpenClaw Agent 已新增"); setMode("edit"); setSelectedKey(draft.id.trim()); }, onError: (error) => toast.error("新增失败", { description: error.message }) });
      return;
    }
    updateAgent.mutate({ id: draft.id, payload }, { onSuccess: () => toast.success("OpenClaw Agent 已保存"), onError: (error) => toast.error("保存失败", { description: error.message }) });
  };
  const remove = () => {
    if (!selected) return;
    if (!window.confirm(`删除 OpenClaw Agent '${selected.id}'？这不会删除 Tracevane CLI Agent 会话。`)) return;
    deleteAgent.mutate({ id: selected.id }, { onSuccess: () => toast.success("OpenClaw Agent 已删除"), onError: (error) => toast.error("删除失败", { description: error.message }) });
  };

  return <div className="grid gap-[18px]">
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <WorkbenchToolbar title="OpenClaw 原生 Agent" description="管理上游 agents.list：新增、编辑、启停和删除。Tracevane CLI Agents 只管理运行台，不替代这里的原生定义。"><SearchBox value={query} onChange={setQuery} placeholder="搜索 OpenClaw agent / model" /><Button size="sm" onClick={() => { setMode("new"); setDraft(emptyAgentDraft); }}>新增 Agent</Button><RefreshButton loading={agents.isFetching} onClick={() => { void agents.refetch(); }} /><BoundaryBadge /></WorkbenchToolbar>
      <div className="grid gap-3 p-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="原生 Agent" value={agents.data?.count ?? 0} sub={`默认 ${agents.data?.defaultAgentId ?? "—"}`} /><StatTile label="可用模型" value={agents.data?.availableModels.length ?? 0} sub="OpenClaw roster" /><StatTile label="已启用" value={list.filter((agent) => agent.enabled).length} sub="agents.list" /><StatTile label="当前编辑" value={mode === "new" ? "新增" : selected?.id ?? "—"} sub="OpenClaw 原生配置" /></div><ResponsiveTable columns={["OpenClaw agent", "默认模型", "定义状态"]} rows={filtered.map((agent) => <SelectableRow key={agent.id} id={agent.id} selected={mode === "edit" && selectedKey === agent.id} onSelect={(id) => { setMode("edit"); setSelectedKey(id); }}><td className="max-w-[320px] truncate px-4 py-3"><div className="font-medium text-ink-strong">{agent.name}</div><div className="truncate text-xs text-muted">{agent.id}</div></td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{agent.model || "—"}</td><td className="px-4 py-3"><StatusPill tone={agent.enabled ? "ok" : "warn"}>{agent.enabled ? "已启用" : "已停用"}</StatusPill></td></SelectableRow>)} empty="无匹配 Agent" /></div>
    </section>
    <section className="rounded-md border border-line bg-panel shadow-sm"><PanelHead title={mode === "new" ? "新增 OpenClaw Agent" : `编辑 ${draft.id || "Agent"}`} sub="常用字段直接编辑；更复杂 persona 文档后续进入 Agent 文档子页。" /><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3"><TextInput label="Agent ID" value={draft.id} onChange={setField("id")} disabled={mode === "edit"} /><TextInput label="名称" value={draft.name} onChange={setField("name")} /><TextInput label="模型" value={draft.model} onChange={setField("model")} /><TextInput label="工作目录" value={draft.workspace} onChange={setField("workspace")} /><SelectInput label="沙箱模式" value={draft.sandboxMode} onChange={setField("sandboxMode")} options={["off", "workspace-write", "read-only"]} /><SelectInput label="工作区权限" value={draft.workspaceAccess} onChange={setField("workspaceAccess")} options={["rw", "ro"]} /><SelectInput label="工具配置档" value={draft.toolsProfile} onChange={setField("toolsProfile")} options={["minimal", "coding", "messaging", "full"]} /><SelectInput label="思考等级" value={draft.thinkingDefault} onChange={setField("thinkingDefault")} options={["off", "minimal", "low", "medium", "high", "xhigh", "adaptive"]} /><SelectInput label="详细程度" value={draft.verboseDefault} onChange={setField("verboseDefault")} options={["off", "on", "full"]} /><ToggleInput label="启用 Agent" checked={draft.enabled} onChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))} /></div><div className="flex flex-wrap gap-2 border-t border-line px-4 py-3"><Button size="sm" onClick={save} disabled={createAgent.isPending || updateAgent.isPending}>{mode === "new" ? "新增" : "保存"}</Button>{mode === "edit" ? <Button variant="outline" size="sm" onClick={remove} disabled={!selected || deleteAgent.isPending}>删除</Button> : <Button variant="ghost" size="sm" onClick={() => setMode("edit")}>取消新增</Button>}</div></section>
  </div>;
}
