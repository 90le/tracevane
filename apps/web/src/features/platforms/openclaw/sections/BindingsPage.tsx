import * as React from "react";
import { toast } from "@/design/ui/sonner";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import {
  useChannelsSummaryQuery,
  useCreateChannelBindingMutation,
  useDeleteChannelBindingMutation,
  useUpdateChannelBindingMutation,
} from "@/lib/query/channels";
import type { ChannelBindingInput, ChannelBindingSummary } from "../../../../../../../types/channels";
import {
  BoundaryBadge,
  DetailRail,
  EvidenceRow,
  PanelHead,
  RefreshButton,
  ResponsiveTable,
  SearchBox,
  SelectableRow,
  StatusPill,
  WorkbenchToolbar,
  useSelectedKey,
} from "../components";
import { StatTile } from "../../_shared";

interface BindingDraft {
  type: "agent" | "acp";
  channel: string;
  accountId: string;
  agentId: string;
  peerKind: string;
  peerId: string;
  guildId: string;
  teamId: string;
  roles: string;
  comment: string;
  acpMode: string;
  acpLabel: string;
  acpCwd: string;
  acpBackend: string;
}

const emptyDraft: BindingDraft = {
  type: "agent",
  channel: "",
  accountId: "",
  agentId: "main",
  peerKind: "",
  peerId: "",
  guildId: "",
  teamId: "",
  roles: "",
  comment: "",
  acpMode: "",
  acpLabel: "",
  acpCwd: "",
  acpBackend: "",
};

function draftFromBinding(binding?: ChannelBindingSummary): BindingDraft {
  if (!binding) return emptyDraft;
  return {
    type: binding.type,
    channel: binding.channel,
    accountId: binding.accountId ?? "",
    agentId: binding.agentId,
    peerKind: binding.match.peerKind ?? "",
    peerId: binding.match.peerId ?? "",
    guildId: binding.match.guildId ?? "",
    teamId: binding.match.teamId ?? "",
    roles: binding.match.roles.join("\n"),
    comment: binding.comment ?? "",
    acpMode: binding.acp?.mode ?? "",
    acpLabel: binding.acp?.label ?? "",
    acpCwd: binding.acp?.cwd ?? "",
    acpBackend: binding.acp?.backend ?? "",
  };
}

function splitList(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function nullIfBlank(value: string): string | null {
  const next = value.trim();
  return next ? next : null;
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 md:col-span-2 xl:col-span-3">
      <span className="text-xs font-medium text-muted">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 resize-y rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]"
      />
    </label>
  );
}

export function BindingsPage() {
  const channels = useChannelsSummaryQuery();
  const createBinding = useCreateChannelBindingMutation();
  const updateBinding = useUpdateChannelBindingMutation();
  const deleteBinding = useDeleteChannelBindingMutation();
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<"edit" | "new">("edit");
  const bindings = channels.data?.bindings ?? [];
  const channelOptions = (channels.data?.channels ?? []).map((channel) => channel.type);
  const agentOptions = (channels.data?.agents ?? []).map((agent) => agent.id);
  const filtered = bindings.filter((binding) => `${binding.id} ${binding.channel} ${binding.accountId ?? ""} ${binding.agentId}`.toLowerCase().includes(query.toLowerCase()));
  const [selectedKey, setSelectedKey] = useSelectedKey(filtered.map((binding) => binding.id));
  const selected = filtered.find((binding) => binding.id === selectedKey) ?? filtered[0] ?? bindings[0];
  const [draft, setDraft] = React.useState<BindingDraft>(emptyDraft);

  React.useEffect(() => {
    if (mode === "edit") setDraft(draftFromBinding(selected));
  }, [mode, selected?.id]);

  if (channels.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[260px] w-full" /></div>;
  if (channels.error) return <ErrorState title="无法加载 OpenClaw 原生绑定" description={channels.error.message} />;

  const setField = (key: keyof BindingDraft) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setType = (value: string) => setDraft((prev) => ({ ...prev, type: value === "acp" ? "acp" : "agent" }));
  const payload = (): ChannelBindingInput => ({
    type: draft.type,
    channel: draft.channel.trim(),
    agentId: draft.agentId.trim(),
    accountId: nullIfBlank(draft.accountId),
    peerKind: nullIfBlank(draft.peerKind),
    peerId: nullIfBlank(draft.peerId),
    guildId: nullIfBlank(draft.guildId),
    teamId: nullIfBlank(draft.teamId),
    roles: splitList(draft.roles),
    comment: nullIfBlank(draft.comment),
    acpMode: nullIfBlank(draft.acpMode),
    acpLabel: nullIfBlank(draft.acpLabel),
    acpCwd: nullIfBlank(draft.acpCwd),
    acpBackend: nullIfBlank(draft.acpBackend),
  });
  const save = () => {
    if (!draft.channel.trim() || !draft.agentId.trim()) return toast.error("Channel 和 Agent 必填");
    if (mode === "new") {
      createBinding.mutate(payload(), {
        onSuccess: () => { toast.success("OpenClaw 原生绑定已新增"); setMode("edit"); void channels.refetch(); },
        onError: (error) => toast.error("新增失败", { description: error.message }),
      });
      return;
    }
    if (!selected) return;
    updateBinding.mutate({ id: selected.id, payload: payload() }, {
      onSuccess: () => { toast.success("OpenClaw 原生绑定已保存"); void channels.refetch(); },
      onError: (error) => toast.error("保存失败", { description: error.message }),
    });
  };
  const remove = () => {
    if (!selected) return;
    if (!window.confirm(`删除 OpenClaw 原生绑定 '${selected.id}'？`)) return;
    deleteBinding.mutate(selected.id, {
      onSuccess: () => { toast.success("OpenClaw 原生绑定已删除"); void channels.refetch(); },
      onError: (error) => toast.error("删除失败", { description: error.message }),
    });
  };

  return <div className="grid gap-[18px]">
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <WorkbenchToolbar title="OpenClaw 原生绑定" description="管理上游 static bindings：把 OpenClaw channel/account/peer 匹配到原生 Agent 或 ACP。Tracevane IM 动态会话路由仍在 IM 渠道域。">
        <SearchBox value={query} onChange={setQuery} placeholder="搜索 OpenClaw binding / agent" />
        <Button size="sm" onClick={() => { setMode("new"); setDraft({ ...emptyDraft, channel: channelOptions[0] ?? "", agentId: agentOptions[0] ?? "main" }); }}>新增绑定</Button>
        <RefreshButton loading={channels.isFetching} onClick={() => { void channels.refetch(); }} />
        <BoundaryBadge />
      </WorkbenchToolbar>
      <div className="grid gap-[18px] p-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <StatTile label="原生绑定" value={bindings.length} sub="OpenClaw static" />
            <StatTile label="可选 Agent" value={channels.data?.agents.length ?? 0} sub="OpenClaw options" />
            <StatTile label="当前编辑" value={mode === "new" ? "新增" : selected?.channel ?? "—"} sub="OpenClaw 原生规则" />
          </div>
          <ResponsiveTable columns={["静态匹配", "OpenClaw 目标", "状态"]} rows={filtered.map((binding) => <SelectableRow key={binding.id} id={binding.id} selected={mode === "edit" && selectedKey === binding.id} onSelect={(id) => { setMode("edit"); setSelectedKey(id); }}><td className="max-w-[360px] truncate px-4 py-3"><div className="font-medium text-ink-strong">{binding.channel} · {binding.accountId ?? "default"}</div><div className="truncate text-xs text-muted">peer={binding.match.peerKind ?? "any"}{binding.match.peerId ? `/${binding.match.peerId}` : ""}</div></td><td className="max-w-[260px] truncate px-4 py-3 text-muted">{binding.type} → {binding.agentId}</td><td className="px-4 py-3"><StatusPill tone={binding.type === "acp" ? "warn" : "ok"}>{binding.type === "acp" ? "ACP" : "Agent"}</StatusPill></td></SelectableRow>)} empty="无匹配绑定" />
        </div>
        <DetailRail title={selected?.channel ?? "未选择绑定"} subtitle={selected ? `${selected.type} → ${selected.agentId}` : "—"}>
          <EvidenceRow label="原生账号" value={selected?.accountId ?? "default"} />
          <EvidenceRow label="peer 类型" value={selected?.match.peerKind ?? "any"} />
          <EvidenceRow label="peer ID" value={selected?.match.peerId ?? "—"} />
          <EvidenceRow label="ACP 后端" value={selected?.acp?.backend ?? "—"} />
        </DetailRail>
      </div>
    </section>
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <PanelHead title={mode === "new" ? "新增 OpenClaw 原生绑定" : `编辑 ${selected?.channel ?? "绑定"}`} sub="这里编辑 OpenClaw static binding；不会修改 Tracevane IM 会话覆盖、默认目录、队列或模型选择。" />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        <SelectInput label="目标类型" value={draft.type} onChange={setType} options={[{ value: "agent", label: "Agent" }, { value: "acp", label: "ACP" }]} />
        <SelectInput label="Channel" value={draft.channel} onChange={setField("channel")} options={[...new Set([draft.channel, ...channelOptions].filter(Boolean))].map((value) => ({ value, label: value }))} />
        <SelectInput label="Agent" value={draft.agentId} onChange={setField("agentId")} options={[...new Set([draft.agentId, ...agentOptions, "main"].filter(Boolean))].map((value) => ({ value, label: value }))} />
        <TextInput label="Account ID" value={draft.accountId} onChange={setField("accountId")} placeholder="留空表示默认账号" />
        <SelectInput label="Peer 类型" value={draft.peerKind} onChange={setField("peerKind")} options={[{ value: "", label: "任意" }, { value: "dm", label: "私聊" }, { value: "group", label: "群聊" }, { value: "channel", label: "频道" }, { value: "thread", label: "线程" }]} />
        <TextInput label="Peer ID" value={draft.peerId} onChange={setField("peerId")} placeholder="精确匹配时填写" />
        <TextInput label="Guild / 群组 ID" value={draft.guildId} onChange={setField("guildId")} />
        <TextInput label="Team ID" value={draft.teamId} onChange={setField("teamId")} />
        <TextInput label="ACP 后端" value={draft.acpBackend} onChange={setField("acpBackend")} placeholder="仅 ACP 类型使用" />
        <TextInput label="ACP 模式" value={draft.acpMode} onChange={setField("acpMode")} placeholder="可选" />
        <TextInput label="ACP 标签" value={draft.acpLabel} onChange={setField("acpLabel")} placeholder="可选" />
        <TextInput label="ACP 工作目录" value={draft.acpCwd} onChange={setField("acpCwd")} placeholder="可选" />
        <TextArea label="角色匹配" value={draft.roles} onChange={setField("roles")} placeholder="一行一个角色，或使用英文逗号分隔" />
        <TextArea label="备注" value={draft.comment} onChange={setField("comment")} placeholder="写给维护者看的 OpenClaw 原生规则说明" />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
        <Button size="sm" onClick={save} disabled={createBinding.isPending || updateBinding.isPending}>{mode === "new" ? "新增" : "保存"}</Button>
        {mode === "edit" ? <Button variant="outline" size="sm" onClick={remove} disabled={!selected || deleteBinding.isPending}>删除</Button> : <Button variant="ghost" size="sm" onClick={() => setMode("edit")}>取消新增</Button>}
      </div>
    </section>
  </div>;
}
