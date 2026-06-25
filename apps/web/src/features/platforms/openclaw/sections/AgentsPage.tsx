import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/design/ui/sonner";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/design/ui/sheet";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useAgentsSummaryQuery, useCreateAgentMutation, useDeleteAgentMutation, useUpdateAgentMutation } from "@/lib/query/agents";
import { PanelHead, RefreshButton, ResponsiveTable, SearchBox, SelectableRow, StatusPill, WorkbenchToolbar, useSelectedKey } from "../components";
import { StatTile } from "../../_shared";

interface AgentFormDraft { id: string; name: string; model: string; workspace: string; enabled: boolean; sandboxMode: string; workspaceAccess: string; toolsProfile: string; thinkingDefault: string; verboseDefault: string; }
const emptyAgentDraft: AgentFormDraft = { id: "", name: "", model: "", workspace: "", enabled: true, sandboxMode: "off", workspaceAccess: "rw", toolsProfile: "full", thinkingDefault: "high", verboseDefault: "off" };
type AgentRow = NonNullable<ReturnType<typeof useAgentsSummaryQuery>["data"]>["agents"][number];

function draftFromAgent(agent?: AgentRow): AgentFormDraft { return agent ? { id: agent.id, name: agent.name, model: agent.model, workspace: agent.workspace, enabled: agent.enabled, sandboxMode: agent.sandboxMode || "off", workspaceAccess: agent.workspaceAccess || "rw", toolsProfile: agent.toolsProfile || "full", thinkingDefault: agent.thinkingDefault || "high", verboseDefault: agent.verboseDefault || "off" } : emptyAgentDraft; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5"><span className="text-xs font-medium text-muted">{label}</span>{children}</label>; }
function TextInput({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) { return <Field label={label}><input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)] disabled:opacity-60" /></Field>; }
function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>; }
function ToggleInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center justify-between gap-3 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm"><span className="font-medium text-ink-strong">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-primary" /></label>; }
const sandboxOptions = [{ value: "off", label: "关闭沙箱：完全按当前权限运行" }, { value: "workspace-write", label: "工作区写入：只能写工作区" }, { value: "read-only", label: "只读：禁止写入" }];
const workspaceAccessOptions = [{ value: "rw", label: "读写" }, { value: "ro", label: "只读" }];
const toolsProfileOptions = [{ value: "minimal", label: "最小工具：低风险" }, { value: "coding", label: "编码工具：读写/测试" }, { value: "messaging", label: "消息工具：IM/通知" }, { value: "full", label: "完整工具：所有可用能力" }];
const thinkingOptions = [{ value: "off", label: "关闭" }, { value: "minimal", label: "极低" }, { value: "low", label: "低" }, { value: "medium", label: "中" }, { value: "high", label: "高" }, { value: "xhigh", label: "极高" }, { value: "adaptive", label: "自适应" }];
const verboseOptions = [{ value: "off", label: "简洁" }, { value: "on", label: "详细" }, { value: "full", label: "完整过程" }];

export function AgentsPage() {
  const agents = useAgentsSummaryQuery();
  const createAgent = useCreateAgentMutation();
  const updateAgent = useUpdateAgentMutation();
  const deleteAgent = useDeleteAgentMutation();
  const [query, setQuery] = React.useState("");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"edit" | "new">("edit");
  const [draft, setDraft] = React.useState<AgentFormDraft>(emptyAgentDraft);
  const list = agents.data?.agents ?? [];
  const filtered = list.filter((agent) => `${agent.name} ${agent.id} ${agent.model ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((agent) => agent.id));
  const selected = filtered.find((agent) => agent.id === selectedKey) ?? filtered[0] ?? list[0];
  const modelOptions = (agents.data?.availableModels ?? []).map((model) => ({ value: model, label: model }));
  if (agents.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (agents.error) return <ErrorState title="无法加载 OpenClaw 原生 Agent" description={agents.error.message} />;
  const openEditor = (nextMode: "edit" | "new", agent?: AgentRow) => { setMode(nextMode); setDraft(nextMode === "new" ? { ...emptyAgentDraft, model: modelOptions[0]?.value ?? "" } : draftFromAgent(agent)); setEditorOpen(true); };
  const setField = (key: keyof AgentFormDraft) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const save = () => {
    if (!draft.id.trim()) return toast.error("Agent id 不能为空");
    if (!draft.model.trim()) return toast.error("必须从可用模型列表选择模型");
    if (!modelOptions.some((option) => option.value === draft.model.trim())) return toast.error("模型不在可用模型列表中");
    const payload = { name: draft.name.trim() || draft.id.trim(), model: draft.model.trim(), workspace: draft.workspace.trim(), enabled: draft.enabled, sandboxMode: draft.sandboxMode, workspaceAccess: draft.workspaceAccess, toolsProfile: draft.toolsProfile, thinkingDefault: draft.thinkingDefault, verboseDefault: draft.verboseDefault };
    if (mode === "new") createAgent.mutate({ id: draft.id.trim(), ...payload }, { onSuccess: () => { toast.success("OpenClaw Agent 已新增"); setSelectedKey(draft.id.trim()); setEditorOpen(false); }, onError: (error) => toast.error("新增失败", { description: error.message }) });
    else updateAgent.mutate({ id: draft.id, payload }, { onSuccess: () => { toast.success("OpenClaw Agent 已保存"); setEditorOpen(false); }, onError: (error) => toast.error("保存失败", { description: error.message }) });
  };
  const remove = (agent: AgentRow) => { if (!window.confirm(`删除 OpenClaw Agent '${agent.id}'？这不会删除 Tracevane CLI Agent 会话。`)) return; deleteAgent.mutate({ id: agent.id }, { onSuccess: () => toast.success("OpenClaw Agent 已删除"), onError: (error) => toast.error("删除失败", { description: error.message }) }); };
  return <div className="grid gap-[18px]">
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <WorkbenchToolbar title="OpenClaw 原生 Agent" description="OpenClaw agents.list 的原生定义。列表只负责浏览和选择；编辑在右侧抽屉中完成，长列表不会把表单挤到页面底部。"><SearchBox value={query} onChange={setQuery} placeholder="搜索 OpenClaw agent / model" /><Button size="sm" onClick={() => openEditor("new")}><Plus className="size-4" />新增 Agent</Button><RefreshButton loading={agents.isFetching} onClick={() => { void agents.refetch(); }} /><Badge variant="info">可编辑</Badge></WorkbenchToolbar>
      <div className="grid gap-3 p-3"><div className="grid gap-3 md:grid-cols-4"><StatTile label="原生 Agent" value={agents.data?.count ?? 0} sub={`默认 ${agents.data?.defaultAgentId ?? "—"}`} /><StatTile label="可用模型" value={agents.data?.availableModels.length ?? 0} sub="OpenClaw roster" /><StatTile label="已启用" value={list.filter((agent) => agent.enabled).length} sub="agents.list" /><StatTile label="当前选择" value={selected?.id ?? "—"} sub="点击行选中，按钮编辑" /></div><ResponsiveTable columns={["OpenClaw agent", "默认模型", "定义状态", "操作"]} rows={filtered.map((agent) => <SelectableRow key={agent.id} id={agent.id} selected={selectedKey === agent.id} onSelect={setSelectedKey}><td className="max-w-[320px] truncate px-4 py-3"><div className="font-medium text-ink-strong">{agent.name}</div><div className="truncate text-xs text-muted">{agent.id}</div></td><td className="max-w-[220px] truncate px-4 py-3 text-muted">{agent.model || "—"}</td><td className="px-4 py-3"><StatusPill tone={agent.enabled ? "ok" : "warn"}>{agent.enabled ? "已启用" : "已停用"}</StatusPill></td><td className="px-4 py-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); openEditor("edit", agent); }}><Pencil className="size-4" />编辑</Button><Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); remove(agent); }}><Trash2 className="size-4" />删除</Button></div></td></SelectableRow>)} empty="无匹配 Agent" /></div>
    </section>
    <Sheet open={editorOpen} onOpenChange={setEditorOpen}><SheetContent className="w-[min(640px,94vw)]"><SheetHeader><div><SheetTitle>{mode === "new" ? "新增 OpenClaw Agent" : `编辑 ${draft.id || "Agent"}`}</SheetTitle><SheetDescription>只编辑 OpenClaw 原生定义；不启动/停止 Tracevane CLI 运行会话。</SheetDescription></div></SheetHeader><SheetBody><PanelHead title="基础信息" sub="Agent ID 新增后不可直接改名；需要重建或删除后新建。" /><div className="grid gap-3 sm:grid-cols-2"><TextInput label="Agent ID" value={draft.id} onChange={setField("id")} disabled={mode === "edit"} /><TextInput label="名称" value={draft.name} onChange={setField("name")} /><SelectInput label="模型" value={draft.model} onChange={setField("model")} options={modelOptions} /><TextInput label="工作目录" value={draft.workspace} onChange={setField("workspace")} /><SelectInput label="沙箱模式" value={draft.sandboxMode} onChange={setField("sandboxMode")} options={sandboxOptions} /><SelectInput label="工作区权限" value={draft.workspaceAccess} onChange={setField("workspaceAccess")} options={workspaceAccessOptions} /><SelectInput label="工具配置档" value={draft.toolsProfile} onChange={setField("toolsProfile")} options={toolsProfileOptions} /><SelectInput label="思考等级" value={draft.thinkingDefault} onChange={setField("thinkingDefault")} options={thinkingOptions} /><SelectInput label="详细程度" value={draft.verboseDefault} onChange={setField("verboseDefault")} options={verboseOptions} /><ToggleInput label="启用 Agent" checked={draft.enabled} onChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))} /></div></SheetBody><SheetFooter><Button onClick={save} disabled={createAgent.isPending || updateAgent.isPending}>{mode === "new" ? "新增" : "保存"}</Button><Button variant="outline" onClick={() => setEditorOpen(false)}>取消</Button></SheetFooter></SheetContent></Sheet>
  </div>;
}
