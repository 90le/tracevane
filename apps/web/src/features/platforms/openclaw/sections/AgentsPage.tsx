import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/design/ui/sonner";
import { ConfirmDialog } from "@/design/ui/action-dialog";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/design/ui/sheet";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { useAgentsSummaryQuery, useCreateAgentMutation, useDeleteAgentMutation, useUpdateAgentMutation } from "@/lib/query/agents";
import type { AgentUpdatePayload } from "../../../../../../../types/agents";
import { Panel, PanelHead, RefreshButton, ResponsiveTable, SearchBox, SelectableRow, StatusPill, WorkbenchToolbar, useSelectedKey } from "../components";

interface AgentFormDraft { id: string; name: string; model: string; workspace: string; enabled: boolean; sandboxMode: string; workspaceAccess: string; toolsProfile: string; thinkingDefault: string; verboseDefault: string; }
interface BatchAgentDraft { model: string; workspace: string; enabled: boolean; sandboxMode: string; workspaceAccess: string; toolsProfile: string; thinkingDefault: string; verboseDefault: string; }
type BatchAgentField = keyof BatchAgentDraft;
const emptyAgentDraft: AgentFormDraft = { id: "", name: "", model: "", workspace: "", enabled: true, sandboxMode: "off", workspaceAccess: "rw", toolsProfile: "full", thinkingDefault: "high", verboseDefault: "off" };
const emptyBatchDraft: BatchAgentDraft = { model: "", workspace: "", enabled: true, sandboxMode: "off", workspaceAccess: "rw", toolsProfile: "full", thinkingDefault: "high", verboseDefault: "off" };
type AgentRow = NonNullable<ReturnType<typeof useAgentsSummaryQuery>["data"]>["agents"][number];

function draftFromAgent(agent?: AgentRow): AgentFormDraft { return agent ? { id: agent.id, name: agent.name, model: agent.model, workspace: agent.workspace, enabled: agent.enabled, sandboxMode: agent.sandboxMode || "off", workspaceAccess: agent.workspaceAccess || "rw", toolsProfile: agent.toolsProfile || "full", thinkingDefault: agent.thinkingDefault || "high", verboseDefault: agent.verboseDefault || "off" } : emptyAgentDraft; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5"><span className="text-xs font-medium text-muted">{label}</span>{children}</label>; }
function TextInput({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) { return <Field label={label}><input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)] disabled:opacity-60" /></Field>; }
function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>; }
function ToggleInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center justify-between gap-3 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm"><span className="font-medium text-ink-strong">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-primary" /></label>; }
function BatchField({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: (value: boolean) => void; children: React.ReactNode }) { return <div className={`grid gap-2 rounded-sm border px-3 py-2 ${enabled ? "border-primary-line bg-panel-2" : "border-line bg-panel"}`}><label className="flex items-center gap-2 text-sm font-medium text-ink-strong"><input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} className="h-4 w-4 accent-primary" />{label}</label><div className={enabled ? "" : "pointer-events-none opacity-45"}>{children}</div></div>; }
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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchDraft, setBatchDraft] = React.useState<BatchAgentDraft>(emptyBatchDraft);
  const [batchFields, setBatchFields] = React.useState<Set<BatchAgentField>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = React.useState<AgentRow | null>(null);
  const list = agents.data?.agents ?? [];
  const filtered = list.filter((agent) => `${agent.name} ${agent.id} ${agent.model ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((agent) => agent.id));
  const selected = filtered.find((agent) => agent.id === selectedKey) ?? filtered[0] ?? list[0];
  const batchTargets = list.filter((agent) => selectedIds.has(agent.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((agent) => selectedIds.has(agent.id));
  const availableModelOptions = (agents.data?.availableModels ?? []).map((model) => ({ value: model, label: model }));
  const modelOptions = [{ value: "", label: "继承默认模型（不单独配置）" }, ...availableModelOptions, ...(!availableModelOptions.some((option) => option.value === draft.model) && draft.model ? [{ value: draft.model, label: `${draft.model}（当前配置未在可用列表）` }] : [])];
  if (agents.isLoading) return <LoadingState title="正在加载 OpenClaw 原生 Agent…" />;
  if (agents.error) return <ErrorState title="无法加载 OpenClaw 原生 Agent" description={agents.error.message} />;
  const openEditor = (nextMode: "edit" | "new", agent?: AgentRow) => { setMode(nextMode); setDraft(nextMode === "new" ? emptyAgentDraft : draftFromAgent(agent)); setEditorOpen(true); };
  const setField = (key: keyof AgentFormDraft) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setBatchField = (key: Exclude<BatchAgentField, "enabled">) => (value: string) => setBatchDraft((prev) => ({ ...prev, [key]: value }));
  const toggleBatchField = (key: BatchAgentField) => (enabled: boolean) => setBatchFields((prev) => { const next = new Set(prev); if (enabled) next.add(key); else next.delete(key); return next; });
  const toggleSelectedId = (id: string, checked: boolean) => setSelectedIds((prev) => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next; });
  const toggleFilteredSelection = () => setSelectedIds((prev) => { const next = new Set(prev); if (allFilteredSelected) filtered.forEach((agent) => next.delete(agent.id)); else filtered.forEach((agent) => next.add(agent.id)); return next; });
  const openBatchEditor = () => { setBatchDraft(emptyBatchDraft); setBatchFields(new Set()); setBatchOpen(true); };
  const buildBatchPayload = (): AgentUpdatePayload => {
    const payload: AgentUpdatePayload = {};
    if (batchFields.has("model")) payload.model = batchDraft.model.trim();
    if (batchFields.has("workspace")) payload.workspace = batchDraft.workspace.trim();
    if (batchFields.has("enabled")) payload.enabled = batchDraft.enabled;
    if (batchFields.has("sandboxMode")) payload.sandboxMode = batchDraft.sandboxMode;
    if (batchFields.has("workspaceAccess")) payload.workspaceAccess = batchDraft.workspaceAccess;
    if (batchFields.has("toolsProfile")) payload.toolsProfile = batchDraft.toolsProfile;
    if (batchFields.has("thinkingDefault")) payload.thinkingDefault = batchDraft.thinkingDefault;
    if (batchFields.has("verboseDefault")) payload.verboseDefault = batchDraft.verboseDefault;
    return payload;
  };
  const saveBatch = async () => {
    if (batchTargets.length === 0) return toast.error("请先选择要批量编辑的 Agent");
    if (batchFields.size === 0) return toast.error("请勾选至少一个要批量修改的字段");
    if (batchFields.has("model") && batchDraft.model.trim() && !availableModelOptions.some((option) => option.value === batchDraft.model.trim())) return toast.error("模型不在可用模型列表中；留空可批量改为继承默认模型");
    const payload = buildBatchPayload();
    try {
      for (const agent of batchTargets) await updateAgent.mutateAsync({ id: agent.id, payload });
      toast.success("OpenClaw Agent 已批量更新", { description: `${batchTargets.length} 个 Agent；仅修改已勾选字段。` });
      setBatchOpen(false);
      setBatchFields(new Set());
      setSelectedIds(new Set());
      void agents.refetch();
    } catch (error) {
      toast.error("批量保存失败", { description: error instanceof Error ? error.message : String(error) });
    }
  };
  const save = () => {
    if (!draft.id.trim()) return toast.error("Agent id 不能为空");
    if (draft.model.trim() && !availableModelOptions.some((option) => option.value === draft.model.trim())) return toast.error("模型不在可用模型列表中；留空可继承默认模型");
    const payload = { name: draft.name.trim() || draft.id.trim(), model: draft.model.trim(), workspace: draft.workspace.trim(), enabled: draft.enabled, sandboxMode: draft.sandboxMode, workspaceAccess: draft.workspaceAccess, toolsProfile: draft.toolsProfile, thinkingDefault: draft.thinkingDefault, verboseDefault: draft.verboseDefault };
    if (mode === "new") createAgent.mutate({ id: draft.id.trim(), ...payload }, { onSuccess: () => { toast.success("OpenClaw Agent 已新增"); setSelectedKey(draft.id.trim()); setEditorOpen(false); }, onError: (error) => toast.error("新增失败", { description: error.message }) });
    else updateAgent.mutate({ id: draft.id, payload }, { onSuccess: () => { toast.success("OpenClaw Agent 已保存"); setEditorOpen(false); }, onError: (error) => toast.error("保存失败", { description: error.message }) });
  };
  const remove = (agent: AgentRow) => setDeleteTarget(agent);
  return (
    <div className="grid gap-[18px]">
      <MetricRail>
        <MetricTile label="原生 Agent" value={agents.data?.count ?? 0} hint={`默认 ${agents.data?.defaultAgentId ?? "—"}`} />
        <MetricTile label="已启用" value={list.filter((agent) => agent.enabled).length} tone="ok" hint="OpenClaw agents.list" />
        <MetricTile label="可用模型" value={agents.data?.availableModels.length ?? 0} hint="OpenClaw 模型清单" />
        <MetricTile label="批量已选" value={selectedIds.size} tone={selectedIds.size > 0 ? "warn" : "default"} hint="只修改勾选字段" />
      </MetricRail>
      <Panel>
        <WorkbenchToolbar title="OpenClaw 原生 Agent" description="OpenClaw agents.list 的原生定义。列表只负责浏览和选择；编辑在右侧抽屉中完成，长列表不会把表单挤到页面底部。">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索 OpenClaw agent / model" />
          <Button size="sm" onClick={() => openEditor("new")}><Plus className="size-4" />新增 Agent</Button>
          <Button variant="outline" size="sm" onClick={openBatchEditor} disabled={selectedIds.size === 0}>批量编辑 {selectedIds.size || ""}</Button>
          <RefreshButton loading={agents.isFetching} onClick={() => { void agents.refetch(); }} />
          <Badge variant="info">可编辑</Badge>
        </WorkbenchToolbar>
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-2 text-sm text-muted">
          <Button variant="ghost" size="sm" onClick={toggleFilteredSelection}>{allFilteredSelected ? "取消选择当前列表" : "选择当前列表"}</Button>
          <span>已选择 {selectedIds.size} 个 Agent；批量编辑只会提交你在抽屉里勾选的字段。</span>
        </div>
        <ResponsiveTable
          columns={["选择", "OpenClaw agent", "默认模型", "定义状态", "操作"]}
          rows={filtered.map((agent) => (
            <SelectableRow key={agent.id} id={agent.id} selected={selectedKey === agent.id} onSelect={setSelectedKey}>
              <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(agent.id)} onChange={(event) => toggleSelectedId(agent.id, event.target.checked)} onClick={(event) => event.stopPropagation()} aria-label={`选择 ${agent.id}`} className="h-4 w-4 accent-primary" /></td>
              <td className="max-w-[320px] truncate px-4 py-3">
                <div className="font-medium text-ink-strong">{agent.name}</div>
                <div className="truncate text-xs text-muted">{agent.id}</div>
              </td>
              <td className="max-w-[220px] truncate px-4 py-3 text-muted">{agent.model || "—"}</td>
              <td className="px-4 py-3"><StatusPill tone={agent.enabled ? "ok" : "warn"}>{agent.enabled ? "已启用" : "已停用"}</StatusPill></td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); openEditor("edit", agent); }}><Pencil className="size-4" />编辑</Button>
                  <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); remove(agent); }}><Trash2 className="size-4" />删除</Button>
                </div>
              </td>
            </SelectableRow>
          ))}
          empty={list.length === 0 ? <EmptyState title="暂无 OpenClaw 原生 Agent" description="新增一个原生 Agent 定义，或确认 OpenClaw agents.list 可用后刷新。" action={<Button size="sm" onClick={() => openEditor("new")}><Plus className="size-4" />新增 Agent</Button>} /> : "无匹配 Agent"}
        />
      </Panel>
      <Sheet open={batchOpen} onOpenChange={setBatchOpen}><SheetContent className="w-[min(720px,94vw)]"><SheetHeader><div><SheetTitle>批量编辑 OpenClaw Agent</SheetTitle><SheetDescription>已选择 {batchTargets.length} 个 Agent。只有勾选的字段会写入；未勾选字段保持每个 Agent 原有配置。</SheetDescription></div></SheetHeader><SheetBody><PanelHead title="批量字段" sub="先勾选字段，再选择要写入所有目标 Agent 的值。模型留空表示继承默认模型。" /><div className="grid gap-3 sm:grid-cols-2"><BatchField label="模型" enabled={batchFields.has("model")} onToggle={toggleBatchField("model")}><SelectInput label="写入值" value={batchDraft.model} onChange={setBatchField("model")} options={modelOptions} /></BatchField><BatchField label="工作目录" enabled={batchFields.has("workspace")} onToggle={toggleBatchField("workspace")}><TextInput label="写入值" value={batchDraft.workspace} onChange={setBatchField("workspace")} /></BatchField><BatchField label="启用状态" enabled={batchFields.has("enabled")} onToggle={toggleBatchField("enabled")}><ToggleInput label="批量设为启用" checked={batchDraft.enabled} onChange={(enabled) => setBatchDraft((prev) => ({ ...prev, enabled }))} /></BatchField><BatchField label="沙箱模式" enabled={batchFields.has("sandboxMode")} onToggle={toggleBatchField("sandboxMode")}><SelectInput label="写入值" value={batchDraft.sandboxMode} onChange={setBatchField("sandboxMode")} options={sandboxOptions} /></BatchField><BatchField label="工作区权限" enabled={batchFields.has("workspaceAccess")} onToggle={toggleBatchField("workspaceAccess")}><SelectInput label="写入值" value={batchDraft.workspaceAccess} onChange={setBatchField("workspaceAccess")} options={workspaceAccessOptions} /></BatchField><BatchField label="工具配置档" enabled={batchFields.has("toolsProfile")} onToggle={toggleBatchField("toolsProfile")}><SelectInput label="写入值" value={batchDraft.toolsProfile} onChange={setBatchField("toolsProfile")} options={toolsProfileOptions} /></BatchField><BatchField label="思考等级" enabled={batchFields.has("thinkingDefault")} onToggle={toggleBatchField("thinkingDefault")}><SelectInput label="写入值" value={batchDraft.thinkingDefault} onChange={setBatchField("thinkingDefault")} options={thinkingOptions} /></BatchField><BatchField label="详细程度" enabled={batchFields.has("verboseDefault")} onToggle={toggleBatchField("verboseDefault")}><SelectInput label="写入值" value={batchDraft.verboseDefault} onChange={setBatchField("verboseDefault")} options={verboseOptions} /></BatchField></div><div className="rounded-sm border border-line bg-panel-2 px-3 py-2 text-xs text-muted">目标：{batchTargets.map((agent) => agent.id).join("、") || "未选择"}</div></SheetBody><SheetFooter><Button onClick={() => { void saveBatch(); }} disabled={updateAgent.isPending || batchTargets.length === 0 || batchFields.size === 0}>批量保存</Button><Button variant="outline" onClick={() => setBatchOpen(false)}>取消</Button></SheetFooter></SheetContent></Sheet>
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}><SheetContent className="w-[min(640px,94vw)]"><SheetHeader><div><SheetTitle>{mode === "new" ? "新增 OpenClaw Agent" : `编辑 ${draft.id || "Agent"}`}</SheetTitle><SheetDescription>只编辑 OpenClaw 原生定义；不启动/停止 Tracevane CLI 运行会话。</SheetDescription></div></SheetHeader><SheetBody><PanelHead title="基础信息" sub="Agent ID 新增后不可直接改名；模型可留空以继承 OpenClaw 默认模型。" /><div className="grid gap-3 sm:grid-cols-2"><TextInput label="Agent ID" value={draft.id} onChange={setField("id")} disabled={mode === "edit"} /><TextInput label="名称" value={draft.name} onChange={setField("name")} /><SelectInput label="模型" value={draft.model} onChange={setField("model")} options={modelOptions} /><TextInput label="工作目录" value={draft.workspace} onChange={setField("workspace")} /><SelectInput label="沙箱模式" value={draft.sandboxMode} onChange={setField("sandboxMode")} options={sandboxOptions} /><SelectInput label="工作区权限" value={draft.workspaceAccess} onChange={setField("workspaceAccess")} options={workspaceAccessOptions} /><SelectInput label="工具配置档" value={draft.toolsProfile} onChange={setField("toolsProfile")} options={toolsProfileOptions} /><SelectInput label="思考等级" value={draft.thinkingDefault} onChange={setField("thinkingDefault")} options={thinkingOptions} /><SelectInput label="详细程度" value={draft.verboseDefault} onChange={setField("verboseDefault")} options={verboseOptions} /><ToggleInput label="启用 Agent" checked={draft.enabled} onChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))} /></div></SheetBody><SheetFooter><Button onClick={save} disabled={createAgent.isPending || updateAgent.isPending}>{mode === "new" ? "新增" : "保存"}</Button><Button variant="outline" onClick={() => setEditorOpen(false)}>取消</Button></SheetFooter></SheetContent></Sheet>
      <ConfirmDialog open={Boolean(deleteTarget)} title="删除 OpenClaw Agent" description={deleteTarget ? `删除 ${deleteTarget.id}。这不会删除 Tracevane CLI Agent 会话。` : undefined} icon={<Trash2 />} tone="danger" confirmLabel="删除" contentDataAttr="openclaw-agent-delete" onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (!deleteTarget) return; const target = deleteTarget; setDeleteTarget(null); deleteAgent.mutate({ id: target.id }, { onSuccess: () => toast.success("OpenClaw Agent 已删除"), onError: (error) => toast.error("删除失败", { description: error.message }) }); }} />
    </div>
  );
}
