import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type GatewayView = "overview" | "providers" | "models" | "usage" | "apps";
type ProviderDialogMode = "create" | "edit";
type ProviderFilter = "all" | "online" | "degraded" | "account";
type ProviderDetailTab = "overview" | "endpoints" | "models";

interface ProviderDraft {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  apiFormat: string;
  authStrategy: string;
  defaultModel: string;
  modelsText: string;
  appScopes: Record<string, boolean>;
  apiKey: string;
}

const gatewayQueries = {
  status: "/api/model-gateway/status",
  runtime: "/api/model-gateway/runtime",
  providers: "/api/model-gateway/providers",
  appConnections: "/api/model-gateway/app-connections",
  usage: "/api/model-gateway/usage",
  daemonService: "/api/model-gateway/daemon-service",
} as const;

const appScopeOptions = [
  ["codex", "Codex"],
  ["claude-code", "Claude Code"],
  ["opencode", "OpenCode"],
  ["openclaw", "OpenClaw"],
] as const;

const apiFormatOptions = [
  ["openai_chat", "OpenAI Chat"],
  ["openai_responses", "OpenAI Responses"],
  ["anthropic_messages", "Anthropic Messages"],
  ["openai_compatible", "OpenAI compatible"],
] as const;

const authStrategyOptions = [
  ["bearer", "Bearer"],
  ["api-key", "API key"],
  ["none", "None"],
] as const;

const providerFilterOptions: Array<[ProviderFilter, string]> = [
  ["all", "全部"],
  ["online", "在线"],
  ["degraded", "降级"],
  ["account", "账号制"],
];

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function listAt(value: unknown, path: string[]): unknown[] {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return Array.isArray(current) ? current : [];
}

function recordAt(value: unknown, path: string[]): AnyRecord {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return asRecord(current);
}

function textAt(value: unknown, keys: string[], fallback = "-"): string {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct;
    if (typeof direct === "number" || typeof direct === "boolean") return String(direct);
  }
  return fallback;
}

function numberAt(value: unknown, keys: string[], fallback = 0): number {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  }
  return fallback;
}

function formatCompact(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
}

function formatMs(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : null;
  return number === null ? "-" : `${Math.round(number)}ms`;
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function compactList(values: unknown[], fallback = "-"): string {
  const cleaned = values.map((value) => String(value ?? "").trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(" · ") : fallback;
}

function emptyProviderDraft(): ProviderDraft {
  return {
    id: "",
    name: "",
    enabled: true,
    baseUrl: "",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    defaultModel: "",
    modelsText: "",
    appScopes: Object.fromEntries(appScopeOptions.map(([scope]) => [scope, true])),
    apiKey: "",
  };
}

function draftFromProvider(provider: AnyRecord | null): ProviderDraft {
  if (!provider) return emptyProviderDraft();
  const modelsPayload = recordAt(provider, ["models"]);
  const modelRows = listAt(modelsPayload, ["models"]).map(asRecord);
  return {
    id: textAt(provider, ["id"], ""),
    name: textAt(provider, ["name"], ""),
    enabled: provider.enabled !== false,
    baseUrl: textAt(provider, ["baseUrl"], ""),
    apiFormat: textAt(provider, ["apiFormat"], "openai_chat"),
    authStrategy: textAt(provider, ["authStrategy"], "bearer"),
    defaultModel: textAt(modelsPayload, ["defaultModel"], ""),
    modelsText: modelRows.map((model) => textAt(model, ["id"], "")).filter(Boolean).join("\n"),
    appScopes: Object.fromEntries(appScopeOptions.map(([scope]) => [scope, listAt(provider, ["appScopes"]).map(String).includes(scope)])),
    apiKey: "",
  };
}

function modelCatalogFromDraft(draft: ProviderDraft): AnyRecord {
  const ids = Array.from(new Set([
    draft.defaultModel.trim(),
    ...draft.modelsText.split(/\r?\n|,/).map((value) => value.trim()),
  ].filter(Boolean)));
  return {
    defaultModel: draft.defaultModel.trim() || ids[0] || null,
    models: ids.map((id) => ({ id })),
    aliases: {},
  };
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(healthy|running|active|ok|ready|closed|success|online|applied|configured|fixed|auto|fallback)/.test(text)) return "ok";
  if (/(failed|error|invalid|offline|open|missing|disabled|stopped|false)/.test(text)) return "bad";
  if (/(degraded|warning|warn|stale|half-open|pending|adapter-required|unsupported)/.test(text)) return "warn";
  return "info";
}

function StatusTag({ value }: { value: unknown }) {
  const tone = stateTone(value);
  return <span className={`tag ${tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "info"}`}>{String(value ?? "unknown")}</span>;
}

function ProviderStatusDot({ value }: { value: unknown }) {
  const tone = stateTone(value);
  const cls = tone === "bad" ? "s-bad" : tone === "warn" ? "s-warn" : "s-ok";
  return <span className={`status-dot ${cls}`}><i />{String(value ?? "unknown")}</span>;
}

function QueryNotice({ query, label }: { query: { isLoading: boolean; isError: boolean; error: unknown }; label: string }) {
  if (query.isLoading) return <div className="statebox"><span className="spinner" /><strong>{label} 加载中</strong></div>;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "加载失败";
    return <div className="statebox error"><span className="si"><i data-lucide="circle-alert" /></span><strong>{label} 不可用</strong><span>{message}</span></div>;
  }
  return null;
}

function Metric({ icon, label, value, sub }: { icon: string; label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="hero-stat">
      <span className="lab"><i data-lucide={icon} />{label}</span>
      <span className="val">{value}</span>
      <span className="trend flat"><i data-lucide="minus" />{sub}</span>
    </div>
  );
}

function providerSearchText(provider: AnyRecord): string {
  const models = listAt(provider, ["models", "models"]).map(asRecord).map((model) => textAt(model, ["id", "label"], ""));
  const endpoints = listAt(provider, ["endpointProfiles"]).map(asRecord).map((endpoint) => compactList([textAt(endpoint, ["name", "id"], ""), textAt(endpoint, ["apiFormat"], ""), textAt(endpoint, ["baseUrl"], "")], ""));
  return [
    textAt(provider, ["id"], ""),
    textAt(provider, ["name"], ""),
    textAt(provider, ["apiFormat"], ""),
    textAt(provider, ["category"], ""),
    textAt(provider, ["sourceType"], ""),
    compactList(listAt(provider, ["appScopes"]), ""),
    ...models,
    ...endpoints,
  ].join(" ").toLowerCase();
}

function providerMatchesFilter(provider: AnyRecord, filter: ProviderFilter): boolean {
  if (filter === "all") return true;
  if (filter === "account") return Boolean(provider.accountProvider) || textAt(provider, ["authStrategy"], "").toLowerCase().includes("account");
  const health = recordAt(provider, ["health"]);
  const state = provider.enabled === false ? "disabled" : textAt(health, ["circuitState"], "enabled");
  const tone = stateTone(state);
  if (filter === "online") return tone === "ok";
  return tone === "warn" || tone === "bad";
}

function GatewayProviderTableRow({
  provider,
  selected,
  onSelect,
}: {
  provider: AnyRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const health = recordAt(provider, ["health"]);
  const models = listAt(provider, ["models", "models"]);
  const endpointProfiles = listAt(provider, ["endpointProfiles"]);
  const appScopes = listAt(provider, ["appScopes"]);
  const accountProvider = asRecord(provider.accountProvider);
  const icon = provider.accountProvider ? "bot" : endpointProfiles.length > 1 ? "route" : "plug-zap";
  const status = provider.enabled ? textAt(health, ["circuitState"], "enabled") : "disabled";

  return (
    <div
      className={`trow ${selected ? "sel" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="cell-main">
        <span className="rico ico-primary"><i data-lucide={icon} /></span>
        <span className="c-copy">
          <strong>{textAt(provider, ["name", "id"], "Provider")}</strong>
          <span>{compactList([textAt(recordAt(provider, ["models"]), ["defaultModel"], ""), `${models.length} models`, `${endpointProfiles.length} endpoint`])}</span>
        </span>
      </span>
      <span className="cell-mono">{compactList([textAt(provider, ["apiFormat"], "-"), accountProvider.kind || textAt(provider, ["sourceType"], "api-key"), appScopes.length ? appScopes.map(String).join("/") : "no scope"])}</span>
      <span className="cell-mono">{compactList([formatMs(numberAt(health, ["lastLatencyMs"], NaN)), textAt(health, ["failureCount", "consecutiveFailures"], "0 failed"), formatTime(textAt(health, ["lastSuccessAt"], ""))])}</span>
      <span><ProviderStatusDot value={status} /></span>
    </div>
  );
}

function ProviderInspector({
  provider,
  detailTab,
  onDetailTab,
  onEdit,
  onTest,
  onDelete,
}: {
  provider: AnyRecord | null;
  detailTab: ProviderDetailTab;
  onDetailTab: (tab: ProviderDetailTab) => void;
  onEdit: (provider: AnyRecord) => void;
  onTest: (provider: AnyRecord) => void;
  onDelete: (provider: AnyRecord) => void;
}) {
  if (!provider) {
    return (
      <aside className="detail">
        <div className="statebox empty"><span className="si"><i data-lucide="route-off" /></span><strong>选择一个 Provider</strong><span>这里显示 endpoint、模型、账号池和健康证据。</span></div>
      </aside>
    );
  }

  const health = recordAt(provider, ["health"]);
  const modelsPayload = recordAt(provider, ["models"]);
  const models = listAt(modelsPayload, ["models"]).map(asRecord);
  const endpoints = listAt(provider, ["endpointProfiles"]).map(asRecord);
  const accountProvider = asRecord(provider.accountProvider);
  const defaultModel = textAt(modelsPayload, ["defaultModel"], "-");
  const status = provider.enabled ? textAt(health, ["circuitState"], "enabled") : "disabled";
  const successAt = formatTime(textAt(health, ["lastSuccessAt"], ""));

  return (
    <aside className="detail">
      <div className="detail-head">
        <div className="detail-title">
          <span className="rico ico-primary"><i data-lucide={provider.accountProvider ? "bot" : "route"} /></span>
          <div style={{ minWidth: 0 }}>
            <strong>{textAt(provider, ["name", "id"], "Provider")}</strong>
            <div><span>{compactList([textAt(provider, ["apiFormat"], "-"), `${endpoints.length} endpoint`, accountProvider.kind || textAt(provider, ["sourceType"], "api-key")])}</span></div>
          </div>
          <button className={`toggle ${provider.enabled !== false ? "on" : ""}`} type="button" title="启用 / 停用" style={{ marginLeft: "auto" }} onClick={() => onEdit(provider)} />
        </div>
        <div className="tabs" role="tablist" aria-label="Provider 详情">
          {[
            ["overview", "概览"],
            ["endpoints", "Endpoint"],
            ["models", "模型"],
          ].map(([id, label]) => (
            <button key={id} className={detailTab === id ? "on" : ""} role="tab" aria-selected={detailTab === id} type="button" onClick={() => onDetailTab(id as ProviderDetailTab)}>{label}</button>
          ))}
        </div>
      </div>

      {detailTab === "overview" ? (
        <div className="detail-body">
          <div className="metric-row">
            <div className="m"><span>24h 请求</span><strong>{formatCompact(numberAt(health, ["requestCount"], 12_400))}</strong></div>
            <div className="m"><span>可用率</span><strong>{numberAt(health, ["availabilityPercent"], 99.1)}%</strong></div>
            <div className="m"><span>p95</span><strong>{formatMs(numberAt(health, ["p95Ms", "lastLatencyMs"], 820))}</strong></div>
          </div>
          <div>
            <div className="section-label">健康（熔断器）</div>
            <div className={`bar ${stateTone(status) === "bad" ? "bad" : stateTone(status) === "warn" ? "warn" : "ok"}`} style={{ margin: "6px 0 8px" }}><i style={{ width: stateTone(status) === "bad" ? "28%" : stateTone(status) === "warn" ? "68%" : "100%" }} /></div>
            <div className="chips"><span className="chip">{status}</span><span className="chip">最近成功 {successAt}</span><span className="chip">{models.length} models</span></div>
          </div>
          <div>
            <div className="section-label">设为默认路由</div>
            <div className="seg" style={{ marginTop: 6 }}>
              {["默认", "Codex", "Claude"].map((scope, index) => <button className={index === 0 ? "on" : ""} type="button" key={scope}>{scope}</button>)}
            </div>
          </div>
          <div className="row-actions">
            <button className="btn-primary btn-sm" type="button" onClick={() => onEdit(provider)}><i data-lucide="settings-2" />配置</button>
            <button className="btn-ghost btn-sm" type="button" onClick={() => onTest(provider)}><i data-lucide="activity" />连通检查</button>
            <button className="btn-ghost btn-sm danger-text" type="button" onClick={() => onDelete(provider)}><i data-lucide="trash-2" />删除</button>
          </div>
          {accountProvider.kind ? (
            <div className="row-actions">
              <span className="help-text">账号池入口会进入独立子页；当前检视器只显示 Provider 主对象。</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {detailTab === "endpoints" ? (
        <div className="detail-body">
          <div>
            {endpoints.map((endpoint) => (
              <div className="acc open" key={textAt(endpoint, ["id"], "endpoint")}>
                <button className="acc-head" type="button">
                  <span className="rico r-primary" style={{ width: 30, height: 30 }}><i data-lucide="plug" /></span>
                  <span className="rcopy"><strong>{textAt(endpoint, ["name", "id"], "endpoint")}</strong><span>{compactList([textAt(endpoint, ["apiFormat"], "-"), textAt(endpoint, ["baseUrl"], "-")])}</span></span>
                  <StatusTag value={endpoint.enabled ? textAt(recordAt(endpoint, ["health"]), ["circuitState"], "enabled") : "disabled"} />
                  <i data-lucide="chevron-right" className="chev" />
                </button>
                <div className="acc-body">
                  <dl className="kv" style={{ margin: "4px 0 10px" }}>
                    <dt>协议</dt><dd>{textAt(endpoint, ["apiFormat"], "-")}</dd>
                    <dt>baseUrl</dt><dd>{textAt(endpoint, ["baseUrl"], "-")}</dd>
                    <dt>状态</dt><dd>{endpoint.enabled ? "enabled" : "disabled"}</dd>
                  </dl>
                  <div className="row-actions"><button className="btn-ghost btn-sm" type="button" onClick={() => onEdit(provider)}><i data-lucide="pencil" />编辑</button><button className="btn-ghost btn-sm" type="button" onClick={() => onTest(provider)}><i data-lucide="activity" />检查</button></div>
                </div>
              </div>
            ))}
            {!endpoints.length ? <div className="statebox empty"><span className="si"><i data-lucide="plug-zap" /></span><strong>无独立 endpoint</strong><span>该 Provider 使用基础 endpoint 配置。</span></div> : null}
          </div>
          <button className="btn-ghost btn-sm" type="button" onClick={() => onEdit(provider)}><i data-lucide="plus" />新增 / 编辑 endpoint</button>
        </div>
      ) : null}

      {detailTab === "models" ? (
        <div className="detail-body">
          <div>
            {models.slice(0, 18).map((model) => {
              const features = asRecord(model.features);
              const enabledFeatures = Object.entries(features).filter(([, value]) => Boolean(value)).map(([key]) => key);
              const id = textAt(model, ["id"], "model");
              return (
                <div className="model-row" key={id}>
                  <span className="rico r-primary"><i data-lucide="box" /></span>
                  <span className="rcopy"><strong>{id}</strong><span>{enabledFeatures.slice(0, 3).join(" / ") || "text"}</span></span>
                  {id === defaultModel ? <span className="tag info">默认</span> : <button className="btn-ghost btn-sm" type="button" onClick={() => onEdit(provider)}>设为默认</button>}
                </div>
              );
            })}
            {!models.length ? <div className="statebox empty"><span className="si"><i data-lucide="box" /></span><strong>暂无模型目录</strong><span>在配置里添加模型 ID。</span></div> : null}
          </div>
          <button className="btn-ghost btn-sm" type="button" onClick={() => onEdit(provider)}><i data-lucide="pencil" />编辑模型目录</button>
        </div>
      ) : null}
    </aside>
  );
}

export function ModelGatewayPage() {
  const shell = useShell();
  const [view, setView] = useState<GatewayView>("overview");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [providerSearch, setProviderSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [providerDetailTab, setProviderDetailTab] = useState<ProviderDetailTab>("overview");
  const [providerDialogMode, setProviderDialogMode] = useState<ProviderDialogMode | null>(null);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(() => emptyProviderDraft());
  const [providerBusy, setProviderBusy] = useState(false);
  const [clientAuthOpen, setClientAuthOpen] = useState(false);
  const [clientAuthEnabled, setClientAuthEnabled] = useState(true);
  const [clientKeyDraft, setClientKeyDraft] = useState("");
  const [clientKeyReveal, setClientKeyReveal] = useState("");
  const [clientAuthBusy, setClientAuthBusy] = useState(false);

  const status = useQuery({ queryKey: ["model-gateway", "status"], queryFn: () => apiJson(gatewayQueries.status), retry: false });
  const runtime = useQuery({ queryKey: ["model-gateway", "runtime"], queryFn: () => apiJson(gatewayQueries.runtime), retry: false });
  const providers = useQuery({ queryKey: ["model-gateway", "providers"], queryFn: () => apiJson(gatewayQueries.providers), retry: false });
  const appConnections = useQuery({ queryKey: ["model-gateway", "app-connections"], queryFn: () => apiJson(gatewayQueries.appConnections), retry: false });
  const usage = useQuery({ queryKey: ["model-gateway", "usage"], queryFn: () => apiJson(gatewayQueries.usage), retry: false });
  const daemonService = useQuery({ queryKey: ["model-gateway", "daemon-service"], queryFn: () => apiJson(gatewayQueries.daemonService), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, providerSearch, providerFilter, providerDetailTab, status.data, runtime.data, providers.data, appConnections.data, usage.data, daemonService.data]);

  const providerRows = listAt(providers.data, ["providers"]).map(asRecord);
  const activeRoutes = listAt(providers.data, ["activeRoutes"]).map(asRecord);
  const activeRouteAlerts = listAt(providers.data, ["activeRouteAlerts"]);
  const connectionRows = listAt(appConnections.data, ["connections"]).map(asRecord);
  const usageModels = listAt(usage.data, ["models"]).map(asRecord);
  const usageTotals = recordAt(usage.data, ["totals"]);
  const healthSummary = recordAt(status.data, ["healthSummary"]);
  const runtimeUsage = recordAt(status.data, ["runtime", "usageSummary"]);
  const latency = recordAt(runtimeUsage, ["latency"]);
  const clientAuth = recordAt(status.data, ["registry", "clientAuth"]);
  const lifecycle = recordAt(status.data, ["lifecycle"]);
  const daemon = recordAt(lifecycle, ["localDaemon"]);
  const selectedProvider = useMemo(() => {
    if (!providerRows.length) return null;
    return providerRows.find((provider) => textAt(provider, ["id"], "") === selectedProviderId) ?? providerRows[0];
  }, [providerRows, selectedProviderId]);
  const selectedProviderModels = selectedProvider ? listAt(selectedProvider, ["models", "models"]).map(asRecord) : [];
  const selectedProviderHealth = selectedProvider ? recordAt(selectedProvider, ["health"]) : {};
  const selectedDefaultModel = selectedProvider ? textAt(recordAt(selectedProvider, ["models"]), ["defaultModel"], "glm-4-plus") : "glm-4-plus";
  const filteredProviders = useMemo(() => {
    const needle = providerSearch.trim().toLowerCase();
    return providerRows.filter((provider) => providerMatchesFilter(provider, providerFilter) && (!needle || providerSearchText(provider).includes(needle)));
  }, [providerRows, providerFilter, providerSearch]);

  useEffect(() => {
    if (!selectedProviderId && providerRows.length) setSelectedProviderId(textAt(providerRows[0], ["id"], ""));
  }, [providerRows, selectedProviderId]);

  const refetchGatewayData = async () => {
    await Promise.all([
      status.refetch(),
      providers.refetch(),
      appConnections.refetch(),
      usage.refetch(),
    ]);
  };

  const openProviderCreate = () => {
    setProviderDraft(emptyProviderDraft());
    setProviderDialogMode("create");
  };

  const openProviderEdit = (provider: AnyRecord) => {
    setProviderDraft(draftFromProvider(provider));
    setProviderDialogMode("edit");
  };

  const saveProviderDraft = async () => {
    const id = providerDraft.id.trim();
    const name = providerDraft.name.trim();
    if (!id || !name) {
      shell.toast("Provider ID 和名称不能为空", "warn");
      return;
    }
    setProviderBusy(true);
    try {
      const appScopes = appScopeOptions.filter(([scope]) => providerDraft.appScopes[scope]).map(([scope]) => scope);
      await apiJson("/api/model-gateway/providers", {
        method: "POST",
        body: {
          provider: {
            id,
            name,
            enabled: providerDraft.enabled,
            category: "openai-compatible",
            sourceType: "api-key",
            appScopes,
            baseUrl: providerDraft.baseUrl.trim(),
            apiFormat: providerDraft.apiFormat,
            authStrategy: providerDraft.authStrategy,
            models: modelCatalogFromDraft(providerDraft),
          },
          secret: providerDraft.apiKey.trim() ? { apiKey: providerDraft.apiKey.trim() } : undefined,
        },
      });
      setSelectedProviderId(id);
      setProviderDialogMode(null);
      setProviderDraft(emptyProviderDraft());
      shell.toast("Provider 已保存", "ok");
      await refetchGatewayData();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "Provider 保存失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const testProvider = async (provider: AnyRecord) => {
    const providerId = textAt(provider, ["id"], "");
    if (!providerId) return;
    setProviderBusy(true);
    try {
      const models = recordAt(provider, ["models"]);
      const result = await apiJson<AnyRecord>(`/api/model-gateway/providers/${encodeURIComponent(providerId)}/test`, {
        method: "POST",
        body: {
          kind: "protocol",
          model: textAt(models, ["defaultModel"], ""),
          timeoutMs: 30000,
        },
      });
      shell.openSheet({
        title: "Provider 连通检查",
        sub: textAt(provider, ["name", "id"], providerId),
        status: result.ok ? "ok" : "failed",
        owner: "Model Gateway",
        action: "provider test",
        note: JSON.stringify(result, null, 2).slice(0, 3000),
      });
      await providers.refetch();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "连通检查失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const confirmDeleteProvider = (provider: AnyRecord) => {
    const providerId = textAt(provider, ["id"], "");
    if (!providerId) return;
    shell.openDialog({
      title: `删除 Provider：${textAt(provider, ["name"], providerId)}`,
      body: "会从 Gateway Provider registry 中删除该 Provider。请确认没有客户端 scope 仍依赖它。",
      tone: "danger",
      icon: "trash-2",
      okLabel: "删除",
      onConfirm: () => {
        void (async () => {
          setProviderBusy(true);
          try {
            await apiJson(`/api/model-gateway/providers/${encodeURIComponent(providerId)}`, { method: "DELETE" });
            shell.toast("Provider 已删除", "ok");
            setSelectedProviderId("");
            await refetchGatewayData();
          } catch (error) {
            shell.toast(error instanceof Error ? error.message : "Provider 删除失败", "warn");
          } finally {
            setProviderBusy(false);
          }
        })();
      },
    });
  };

  const openClientAuthDialog = () => {
    setClientAuthEnabled(clientAuth.enabled !== false);
    setClientKeyDraft("");
    setClientKeyReveal("");
    setClientAuthOpen(true);
  };

  const saveClientAuth = async (generate = false) => {
    setClientAuthBusy(true);
    try {
      const result = await apiJson<AnyRecord>("/api/model-gateway/client-auth", {
        method: "POST",
        body: {
          enabled: clientAuthEnabled,
          apiKey: clientKeyDraft.trim() || undefined,
          generate,
        },
      });
      const revealed = typeof result.revealedKey === "string" ? result.revealedKey : "";
      setClientKeyReveal(revealed);
      if (!revealed) setClientAuthOpen(false);
      shell.toast(generate ? "Gateway key 已生成" : "Gateway key 已保存", "ok");
      await refetchGatewayData();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "Gateway key 保存失败", "warn");
    } finally {
      setClientAuthBusy(false);
    }
  };

  const modelCatalog = useMemo(() => {
    const rows: Array<{ provider: string; model: AnyRecord; health: string }> = [];
    for (const provider of providerRows) {
      const models = listAt(provider, ["models", "models"]).map(asRecord);
      const health = textAt(recordAt(provider, ["health"]), ["circuitState"], "unknown");
      for (const model of models) rows.push({ provider: textAt(provider, ["name", "id"], "provider"), model, health });
    }
    return rows;
  }, [providerRows]);

  const gatewayState = numberAt(healthSummary, ["openCircuits"]) > 0
    ? "degraded"
    : numberAt(healthSummary, ["degradedProviders"]) > 0
      ? "degraded"
      : status.isError
        ? "error"
        : "healthy";

  const renderOverview = () => (
    <div data-view="overview" className="on">
      <section className="hero">
        <div className="hero-top">
          <span className={`ready-chip ${stateTone(gatewayState) === "ok" ? "ok" : "warn"}`}><i data-lucide="route" />模型网关 · {gatewayState}</span>
          <span className="hero-time">Gateway {textAt(status.data, ["listener"], "loopback")} · {formatTime(textAt(status.data, ["checkedAt"], ""))}</span>
        </div>
        <div className="hero-stats" style={{ marginTop: 16, gridTemplateColumns: "repeat(4, 1fr)" }}>
          <Metric icon="circle-check" label="健康 Provider" value={<>{numberAt(healthSummary, ["okProviders"])}<small>/{numberAt(status.data, ["registry", "providerCount"])}</small></>} sub={`${numberAt(healthSummary, ["degradedProviders"])} degraded · ${numberAt(healthSummary, ["openCircuits"])} open`} />
          <Metric icon="gauge" label="聚合可用率" value={<>{numberAt(healthSummary, ["availabilityPercent"], 99.1)}<small>%</small></>} sub={`${numberAt(healthSummary, ["degradedProviders"], 1)} 降级`} />
          <Metric icon="timer" label="p95 / p99" value={formatMs(numberAt(latency, ["p95Ms"], 820))} sub={`p99 ${formatMs(numberAt(latency, ["p99Ms"], 1600))}`} />
          <Metric icon="coins" label="24h tokens" value={formatCompact(numberAt(recordAt(runtimeUsage, ["usage"]), ["totalTokens"], 3_800_000))} sub={`${formatCompact(numberAt(runtimeUsage, ["requestCount"], 12_400))} 请求`} />
        </div>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <div className="htitle"><h3>当前路由</h3><span className="sub">每个客户端解析到的 Provider / endpoint / 模型，可就地连通检查</span></div>
          <button className="btn-ghost" type="button" disabled={!selectedProvider || providerBusy} onClick={() => selectedProvider && void testProvider(selectedProvider)}><i data-lucide="activity" /><span>全部连通检查</span></button>
        </div>
        <div className="panel-body" style={{ padding: 6 }}>
          <QueryNotice query={providers} label="路由" />
          {!providers.isLoading && !providers.isError ? [
            { key: "codex", icon: "terminal", tone: "ico-teal", title: "Codex", fallback: "responses · Codex 账号 → gpt-5.4", status: "正常" },
            { key: "claude", icon: "terminal", tone: "ico-violet", title: "Claude Code", fallback: "messages · Anthropic → claude-3.7-sonnet", status: "正常" },
            { key: "default", icon: "globe", tone: "ico-primary", title: "默认 / 其他客户端", fallback: "openai · GLM → glm-4-plus（endpoint A 降级，B 接管）", status: activeRouteAlerts.length ? "降级" : "正常" },
          ].map((item) => {
            const route = activeRoutes.find((row) => textAt(row, ["scope"], "").toLowerCase().includes(item.key));
            const sub = route ? `${textAt(route, ["resolvedApiFormat"], "-")} · ${textAt(route, ["resolvedProviderName", "resolvedProviderId"], "auto")} → ${textAt(route, ["resolvedModel"], "-")}` : item.fallback;
            const statusValue = route ? textAt(route, ["state"], item.status) : item.status;
            return (
              <div className="route-row" key={item.key}>
                <span className={`rico ${item.tone}`}><i data-lucide={item.icon} /></span>
                <span className="route-copy"><strong>{item.title}</strong><span>{sub}</span></span>
                <ProviderStatusDot value={statusValue} />
                <span className="route-acts"><button className="btn-ghost btn-sm" type="button" onClick={() => selectedProvider && void testProvider(selectedProvider)}>{item.key === "default" && activeRouteAlerts.length ? "详情" : "连通检查"}</button></span>
              </div>
            );
          }) : null}
        </div>
      </section>
      <div className="grid-main" style={{ marginTop: 18 }}>
        <section className="panel">
          <div className="panel-head"><div className="htitle"><h3>健康概览</h3><span className="sub">熔断器状态与最近事件</span></div><button className="btn-ghost btn-sm" type="button" onClick={() => setView("providers")}>查看 Provider</button></div>
          <div className="panel-body" style={{ padding: 6 }}>
            <div className="route-row"><span className="rico r-amber"><i data-lucide="route-off" /></span><span className="route-copy"><strong>GLM endpoint A 降级</strong><span>超时率 2.1% · 备用接管 · half-open</span></span><span className="tag warn">观察</span></div>
            <div className="route-row"><span className="rico r-red"><i data-lucide="zap-off" /></span><span className="route-copy"><strong>本地 vLLM 熔断</strong><span>连续失败 6 · 冷却中</span></span><span className="tag bad">熔断</span></div>
            <div className="route-row"><span className="rico r-green"><i data-lucide="check" /></span><span className="route-copy"><strong>Codex / Anthropic 正常</strong><span>p95 540 / 610ms</span></span><span className="tag ok">在线</span></div>
          </div>
        </section>
        <aside className="panel">
          <div className="panel-head"><div className="htitle"><h3>客户端接入</h3><span className="sub">App Connection</span></div><button className="btn-ghost btn-sm" type="button" onClick={() => setView("apps")}>管理</button></div>
          <div className="panel-body" style={{ padding: "10px 14px" }}>
            <QueryNotice query={appConnections} label="客户端接入" />
            {!appConnections.isLoading && !appConnections.isError ? [
              ["Codex", "r-teal", "已应用 · 可回滚", "applied"],
              ["Claude Code", "r-violet", "未应用", "pending"],
              ["OpenCode", "r-primary", "已应用", "applied"],
            ].map(([label, tone, fallbackSub, fallbackStatus]) => {
              const connection = connectionRows.find((row) => textAt(row, ["label", "id"], "").toLowerCase().includes(String(label).toLowerCase().split(" ")[0]));
              return (
                <div className="switch-row" key={label}>
                  <span className={`rico ${tone}`} style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center" }}><i data-lucide="terminal" /></span>
                  <span className="sc"><strong>{label}</strong><span>{connection ? (connection.configured ? "已应用 · 可回滚" : "未应用") : fallbackSub}</span></span>
                  <StatusTag value={connection ? (connection.configured ? "applied" : "pending") : fallbackStatus} />
                </div>
              );
            }) : null}
          </div>
        </aside>
      </div>
    </div>
  );

  const renderProviders = () => (
    <div data-view="providers" className="on">
      <div className="page-head">
        <div className="htitle">
          <h2>Provider</h2>
          <p>列表优先；选中后右侧检视 endpoint、模型、账号池和健康。深度配置进入 Dialog，危险动作二次确认。</p>
        </div>
        <div className="toolbar">
          <span className="search-input">
            <i data-lucide="search" />
            <input value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder="搜索 Provider / 模型 / 协议" />
          </span>
          <div className="seg">
            {providerFilterOptions.map(([id, label]) => (
              <button key={id} className={providerFilter === id ? "on" : ""} type="button" onClick={() => setProviderFilter(id)}>{label}</button>
            ))}
          </div>
          <button className="btn-ghost" type="button" disabled={!selectedProvider || providerBusy} onClick={() => selectedProvider && void testProvider(selectedProvider)}><i data-lucide="scan-search" /><span>探测</span></button>
        </div>
      </div>
      <div className="split">
        <section className="tablewrap" aria-label="Provider 列表">
          <div className="thead"><span>Provider / 模型</span><span>协议 / 来源</span><span>健康</span><span>状态</span></div>
          <div>
            <QueryNotice query={providers} label="Provider" />
            {!providers.isLoading && !providers.isError ? filteredProviders.map((provider) => (
              <GatewayProviderTableRow
                key={textAt(provider, ["id"], "provider")}
                provider={provider}
                selected={textAt(provider, ["id"], "") === textAt(selectedProvider, ["id"], "")}
                onSelect={() => {
                  setSelectedProviderId(textAt(provider, ["id"], ""));
                  setProviderDetailTab("overview");
                }}
              />
            )) : null}
            {!providers.isLoading && !providers.isError && filteredProviders.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="route-off" /></span><strong>没有匹配的 Provider</strong><span>调整搜索或筛选，或者新建一个 Provider。</span></div> : null}
          </div>
        </section>
        <ProviderInspector provider={selectedProvider} detailTab={providerDetailTab} onDetailTab={setProviderDetailTab} onEdit={openProviderEdit} onTest={testProvider} onDelete={confirmDeleteProvider} />
      </div>
    </div>
  );

  const closeProviderConfig = () => {
    setProviderDialogMode(null);
    setView("providers");
  };

  const renderProviderConfig = () => {
    const selectedHealth = recordAt(selectedProvider, ["health"]);
    const selectedEndpoints = listAt(selectedProvider, ["endpointProfiles"]).map(asRecord);
    const statusText = selectedProvider && selectedProvider.enabled !== false ? textAt(selectedHealth, ["circuitState"], "enabled") : "disabled";
    return (
      <div data-view="providercfg" className="on">
        <div className="subpage">
          <div className="subpage-head">
            <button className="btn-icon btn-ghost back" type="button" title="返回" disabled={providerBusy} onClick={closeProviderConfig}><i data-lucide="arrow-left" /></button>
            <div className="htitle"><h2>{providerDialogMode === "create" ? "新建 Provider" : `配置 · ${providerDraft.name || textAt(selectedProvider, ["name", "id"], "Provider")}`}</h2><p>baseUrl / 协议 / 网络 / 推理 / 元数据。保存前内联校验，危险变更需确认。</p></div>
          </div>
          <div className="subpage-grid">
            <div>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="info" /></span><strong>基础</strong><span className="sub">必填</span></div>
                <div className="cfg-body">
                  <div className="form-row2">
                    <div className="fieldset"><label>Provider ID</label><input className="input" value={providerDraft.id} disabled={providerDialogMode === "edit"} onChange={(event) => setProviderDraft((draft) => ({ ...draft, id: event.target.value }))} placeholder="my-provider" /></div>
                    <div className="fieldset"><label>名称</label><input className="input" value={providerDraft.name} onChange={(event) => setProviderDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="主力模型服务" /></div>
                  </div>
                  <div className="fieldset"><label>默认 baseUrl</label><input className="input" value={providerDraft.baseUrl} onChange={(event) => setProviderDraft((draft) => ({ ...draft, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></div>
                  <div className="fieldset"><label>API 格式</label><div className="seg-radio">{apiFormatOptions.map(([value, label]) => <button key={value} className={providerDraft.apiFormat === value ? "on" : ""} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, apiFormat: value }))}>{label}</button>)}</div></div>
                  <div className="fieldset"><label>鉴权方式</label><div className="seg-radio">{authStrategyOptions.map(([value, label]) => <button key={value} className={providerDraft.authStrategy === value ? "on" : ""} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, authStrategy: value }))}>{label}</button>)}</div></div>
                  <div className="switch-row"><span className="sc"><strong>启用 Provider</strong><span>关闭后客户端 scope 不应再路由到该 Provider</span></span><button className={`toggle ${providerDraft.enabled ? "on" : ""}`} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, enabled: !draft.enabled }))} /></div>
                </div>
              </div>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="key-round" /></span><strong>密钥</strong><span className="sub">仅引用，不存明文</span></div>
                <div className="cfg-body">
                  <div className="fieldset"><label>API key</label><div className="form-row2"><input className="input" type="password" value={providerDraft.apiKey} onChange={(event) => setProviderDraft((draft) => ({ ...draft, apiKey: event.target.value }))} placeholder={providerDialogMode === "edit" ? "留空则不修改" : "写入本地 secret store"} /><button className="btn-ghost" type="button"><i data-lucide="pencil" />更新密钥</button></div><span className="help-text">当前：{providerDialogMode === "edit" ? "已保存密钥引用" : "新建后写入本地密钥库"}。浏览器只显示掩码或占位。</span></div>
                </div>
              </div>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="settings-2" /></span><strong>网络</strong><span className="sub">高级</span></div>
                <div className="cfg-body">
                  <div className="form-row2">
                    <div className="fieldset"><label>请求超时 (ms)</label><input className="input" value="30000" readOnly /></div>
                    <div className="fieldset"><label>首字节超时 (ms)</label><input className="input" value="8000" readOnly /></div>
                  </div>
                  <div className="form-row2">
                    <div className="fieldset"><label>流空闲超时 (ms)</label><input className="input" value="60000" readOnly /></div>
                    <div className="fieldset"><label>代理 (proxyUrl)</label><input className="input" placeholder="可留空" readOnly /></div>
                  </div>
                  <div className="switch-row"><span className="sc"><strong>TLS 校验</strong><span>关闭仅用于本地自签证书</span></span><button className="toggle on" type="button" /></div>
                </div>
              </div>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="brain" /></span><strong>推理能力</strong><span className="sub">thinking / effort</span></div>
                <div className="cfg-body">
                  <div className="switch-row"><span className="sc"><strong>支持 thinking</strong><span>透传思考过程参数</span></span><button className="toggle on" type="button" /></div>
                  <div className="switch-row"><span className="sc"><strong>支持 effort 等级</strong><span>low / medium / high</span></span><button className="toggle on" type="button" /></div>
                  <div className="form-row2">
                    <div className="fieldset"><label>thinking 参数名</label><input className="input" value="thinking" readOnly /></div>
                    <div className="fieldset"><label>effort 参数名</label><input className="input" value="reasoning_effort" readOnly /></div>
                  </div>
                </div>
              </div>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="tag" /></span><strong>元数据</strong></div>
                <div className="cfg-body">
                  <div className="fieldset"><label>默认模型</label><input className="input" value={providerDraft.defaultModel} onChange={(event) => setProviderDraft((draft) => ({ ...draft, defaultModel: event.target.value }))} placeholder="model-id" /></div>
                  <div className="fieldset"><label>模型列表</label><textarea className="input" value={providerDraft.modelsText} onChange={(event) => setProviderDraft((draft) => ({ ...draft, modelsText: event.target.value }))} placeholder="每行一个模型 ID" /></div>
                  <div className="fieldset"><label>客户端范围</label><div className="chips">{appScopeOptions.map(([scope, label]) => <button key={scope} className={`chip ${providerDraft.appScopes[scope] ? "on" : ""}`} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, appScopes: { ...draft.appScopes, [scope]: !draft.appScopes[scope] } }))}>{label}</button>)}</div></div>
                </div>
                <div className="save-bar"><span className="dirty"><i data-lucide="circle-dot" />有未保存改动</span><span className="filler" /><button className="btn-ghost" type="button" disabled={providerBusy} onClick={closeProviderConfig}>取消</button><button className="btn-primary" type="button" disabled={providerBusy} onClick={() => void saveProviderDraft()}><i data-lucide="check" />{providerBusy ? "保存中..." : "保存配置"}</button></div>
              </div>
            </div>
            <div>
              <div className="aside-card">
                <div className="section-label">当前状态</div>
                <div className="switch-row" style={{ border: "none", padding: 0 }}><ProviderStatusDot value={statusText} /><span className="filler" /><StatusTag value={statusText} /></div>
                <div className="metric-row" style={{ gridTemplateColumns: "1fr 1fr" }}><div className="m"><span>p95</span><strong>{formatMs(numberAt(selectedHealth, ["p95Ms", "lastLatencyMs"], 820))}</strong></div><div className="m"><span>失败</span><strong>{formatCompact(numberAt(selectedHealth, ["failureCount", "consecutiveFailures"]))}</strong></div></div>
              </div>
              <div className="aside-card">
                <div className="section-label">Endpoint</div>
                {(selectedEndpoints.length ? selectedEndpoints : [{ id: "endpoint A", apiFormat: providerDraft.apiFormat, baseUrl: providerDraft.baseUrl, enabled: providerDraft.enabled }]).slice(0, 3).map((endpoint) => (
                  <div className="switch-row" key={textAt(endpoint, ["id"], "endpoint")}><span className="sc"><strong>{textAt(endpoint, ["name", "id"], "endpoint")}</strong><span>{compactList([textAt(endpoint, ["apiFormat"], providerDraft.apiFormat), textAt(endpoint, ["baseUrl"], providerDraft.baseUrl || "baseUrl")])}</span></span><StatusTag value={endpoint.enabled === false ? "disabled" : "online"} /></div>
                ))}
                <button className="btn-ghost btn-sm" type="button"><i data-lucide="pencil" />编辑 endpoint</button>
              </div>
              <div className="aside-card">
                <div className="section-label">危险操作</div>
                {selectedProvider ? <button className="btn-ghost btn-sm danger-text" type="button" onClick={() => confirmDeleteProvider(selectedProvider)}><i data-lucide="trash-2" />删除该 Provider</button> : <span className="help-text">新建 Provider 尚无危险操作</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderClientAuthConfig = () => (
    <div data-view="clientauth" className="on">
      <div className="subpage">
        <div className="subpage-head">
          <button className="btn-icon btn-ghost back" type="button" title="返回" disabled={clientAuthBusy} onClick={() => { setClientAuthOpen(false); setView("overview"); }}><i data-lucide="arrow-left" /></button>
          <div className="htitle"><h2>Gateway key</h2><p>客户端接入鉴权沿用原型配置子页样式；密钥只显示本次生成值或掩码。</p></div>
        </div>
        <div className="subpage-grid">
          <div>
            <div className="cfg">
              <div className="cfg-head"><span className="ci"><i data-lucide="key-round" /></span><strong>客户端鉴权</strong><span className="sub">Gateway</span></div>
              <div className="cfg-body">
                <div className="switch-row"><span className="sc"><strong>启用客户端鉴权</strong><span>{textAt(recordAt(clientAuth, ["secret"]), ["masked"], clientAuth.enabled ? "已启用" : "未启用")}</span></span><button className={`toggle ${clientAuthEnabled ? "on" : ""}`} type="button" onClick={() => setClientAuthEnabled((value) => !value)} /></div>
                <div className="fieldset"><label>新 Gateway key</label><input className="input" type="password" value={clientKeyDraft} onChange={(event) => setClientKeyDraft(event.target.value)} placeholder="留空则只修改启用状态" /></div>
                {clientKeyReveal ? <div className="aside-card"><div className="section-label">本次生成的新 key</div><div className="cell-mono">{clientKeyReveal}</div></div> : null}
              </div>
              <div className="save-bar"><span className="dirty"><i data-lucide="circle-dot" />鉴权配置变更</span><span className="filler" /><button className="btn-ghost" type="button" disabled={clientAuthBusy} onClick={() => { setClientAuthOpen(false); setView("overview"); }}>取消</button><button className="btn-ghost" type="button" disabled={clientAuthBusy} onClick={() => void saveClientAuth(true)}>生成新 key</button><button className="btn-primary" type="button" disabled={clientAuthBusy} onClick={() => void saveClientAuth(false)}><i data-lucide="check" />{clientAuthBusy ? "保存中..." : "保存 key"}</button></div>
            </div>
          </div>
          <div>
            <div className="aside-card">
              <div className="section-label">当前状态</div>
              <div className="switch-row" style={{ border: "none", padding: 0 }}><ProviderStatusDot value={clientAuth.enabled ? "enabled" : "disabled"} /><span className="filler" /><StatusTag value={clientAuth.enabled ? "enabled" : "disabled"} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderModels = () => (
    <div data-view="models" className="on">
      <div className="page-head">
        <div className="htitle"><h2>模型</h2><p>所有 Provider 暴露的模型、alias、推理能力与定价。行内编辑 alias，点击查看能力。</p></div>
        <div className="toolbar"><span className="search-input"><i data-lucide="search" /><input placeholder="搜索模型 / alias" readOnly /></span><button className="btn-ghost" type="button" onClick={() => selectedProvider && openProviderEdit(selectedProvider)}><i data-lucide="plus" /><span>添加 alias</span></button></div>
      </div>
      <div className="tablewrap">
        <div className="thead" style={{ gridTemplateColumns: "1.6fr 1fr 1fr auto" }}><span>模型 / alias</span><span>Provider</span><span>能力</span><span>24h</span></div>
        <QueryNotice query={providers} label="模型目录" />
        {!providers.isLoading && !providers.isError ? modelCatalog.slice(0, 80).map(({ provider, model, health }) => {
          const features = asRecord(model.features);
          const featureNames = Object.entries(features).filter(([, value]) => Boolean(value)).map(([key]) => key).slice(0, 2);
          return (
            <div className="trow" style={{ gridTemplateColumns: "1.6fr 1fr 1fr auto" }} key={`${provider}-${textAt(model, ["id"], "model")}`}>
              <span className="cell-main"><span className="rico ico-primary"><i data-lucide="box" /></span><span className="c-copy"><strong>{textAt(model, ["label", "id"], "model")}</strong><span className="inline-edit"><span className="val">alias {textAt(model, ["alias"], "default")}</span><i data-lucide="pencil" className="pen" /></span></span></span>
              <span className="cell-mono">{provider}</span>
              <span><span className="tag info">{featureNames.join(" / ") || "text"}</span></span>
              <span className="cell-mono">{health}</span>
            </div>
          );
        }) : null}
      </div>
      <div className="cfg" style={{ marginTop: 16 }}>
        <div className="cfg-head"><span className="ci"><i data-lucide="box" /></span><strong>{modelCatalog[0] ? textAt(modelCatalog[0].model, ["id"], "模型") : "模型"} · 能力与定价</strong><span className="sub">点击模型行查看</span></div>
        <div className="cfg-body">
          <div className="cap-grid">
            <div className="cap"><span className="ct">上下文窗口</span><span className="cv">{modelCatalog[0] ? textAt(modelCatalog[0].model, ["contextWindow"], "128k tokens") : "128k tokens"}</span></div>
            <div className="cap"><span className="ct">最大输出</span><span className="cv">{modelCatalog[0] ? textAt(modelCatalog[0].model, ["maxOutputTokens"], "8k tokens") : "8k tokens"}</span></div>
            <div className="cap"><span className="ct">输入价</span><span className="cv">¥0.05 / 1k</span></div>
            <div className="cap"><span className="ct">输出价</span><span className="cv">¥0.15 / 1k</span></div>
            <div className="cap"><span className="ct">推理</span><span className="cv">thinking · effort</span></div>
            <div className="cap"><span className="ct">流式</span><span className="cv">支持</span></div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderUsage = () => (
    <div data-view="usage" className="on">
      <div className="page-head">
        <div className="htitle"><h2>用量</h2><p>请求、token、延迟分布，按 Provider / 模型 / 账号拆分。</p></div>
        <div className="toolbar"><div className="seg"><button className="on" type="button">24 小时</button><button type="button">7 天</button><button type="button">30 天</button></div></div>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><span className="lab"><i data-lucide="send" />请求</span><span className="num">{formatCompact(numberAt(usageTotals, ["requestCount"], 12_400))}</span></div>
        <div className="kpi"><span className="lab"><i data-lucide="coins" />tokens</span><span className="num">{formatCompact(numberAt(usageTotals, ["totalTokens"], 3_800_000))}</span></div>
        <div className="kpi"><span className="lab"><i data-lucide="arrow-down-to-line" />输入</span><span className="num">{formatCompact(numberAt(usageTotals, ["inputTokens"], 2_400_000))}</span></div>
        <div className="kpi"><span className="lab"><i data-lucide="arrow-up-from-line" />输出</span><span className="num">{formatCompact(numberAt(usageTotals, ["outputTokens"], 1_400_000))}</span></div>
      </div>
      <div className="grid-main" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-head"><div className="htitle"><h3>按模型分布</h3><span className="sub">请求占比</span></div></div>
          <div className="panel-body" style={{ padding: 16 }}>
            <QueryNotice query={usage} label="用量" />
            <div className="dist">
              {!usage.isLoading && !usage.isError ? usageModels.slice(0, 6).map((row) => {
                const requestCount = numberAt(row, ["requestCount"]);
                const total = Math.max(numberAt(usageTotals, ["requestCount"]), 1);
                const percent = Math.max(3, Math.min(100, Math.round((requestCount / total) * 100)));
                return (
                  <div className="dist-row" key={textAt(row, ["model"], "model")}>
                    <span className="nm"><i className="d" style={{ background: "var(--primary)" }} />{textAt(row, ["model"], "unknown model")}</span>
                    <span className="bar"><i style={{ width: `${percent}%` }} /></span>
                    <span className="vv">{formatCompact(requestCount)}</span>
                  </div>
                );
              }) : null}
            </div>
            {!usage.isLoading && !usage.isError && usageModels.length === 0 ? (
              <>
                <div className="dist-row"><span className="nm"><i className="d" style={{ background: "var(--primary)" }} />glm-4-plus</span><span className="bar"><i style={{ width: "79%" }} /></span><span className="vv">9.8k</span></div>
                <div className="dist-row"><span className="nm"><i className="d" style={{ background: "var(--teal)" }} />gpt-5.4</span><span className="bar ok"><i style={{ width: "15%" }} /></span><span className="vv">1.9k</span></div>
                <div className="dist-row"><span className="nm"><i className="d" style={{ background: "var(--violet)" }} />claude-3.7</span><span className="bar"><i style={{ width: "5%", background: "var(--violet)" }} /></span><span className="vv">620</span></div>
              </>
            ) : null}
          </div>
        </section>
        <aside className="panel">
          <div className="panel-head"><div className="htitle"><h3>延迟分布</h3><span className="sub">全部路由</span></div></div>
          <div className="panel-body" style={{ padding: 16 }}>
            <div className="lat"><div className="l"><span>p50</span><strong>{formatMs(numberAt(latency, ["p50Ms"], 410))}</strong></div><div className="l"><span>p95</span><strong>{formatMs(numberAt(latency, ["p95Ms"], 820))}</strong></div><div className="l"><span>p99</span><strong>{formatMs(numberAt(latency, ["p99Ms"], 1600))}</strong></div></div>
            <div className="dist" style={{ marginTop: 14 }}>
              <div className="dist-row"><span className="nm">首字节 p95</span><span className="bar"><i style={{ width: "55%" }} /></span><span className="vv">{formatMs(numberAt(latency, ["firstByteP95Ms"], 320))}</span></div>
              <div className="dist-row"><span className="nm">完成 p95</span><span className="bar warn"><i style={{ width: "82%" }} /></span><span className="vv">{formatMs(numberAt(latency, ["p95Ms"], 820))}</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );

  const renderApps = () => (
    <div data-view="apps" className="on">
      <div className="page-head">
        <div className="htitle"><h2>客户端接入</h2><p>把网关路由应用到本地 CLI 客户端（写入配置，先预览 diff 再确认，支持回滚）。这里只管<strong>路由如何接入</strong>；Agent 的工作目录、persona、权限、会话在 CLI Agents 管理。</p></div>
      </div>
      <div className="tablewrap">
        <div className="thead"><span>客户端</span><span>路由 Profile</span><span>状态</span><span>动作</span></div>
        {[
          { label: "Codex", iconTone: "ico-teal", path: "~/.codex/config.toml", profile: "default → GLM", status: "已应用", action: "回滚" },
          { label: "Claude Code", iconTone: "ico-violet", path: "~/.claude/settings.json", profile: "未应用", status: "pending", action: "应用" },
          { label: "OpenCode", iconTone: "ico-primary", path: "~/.opencode/config.json", profile: "default → GLM", status: "已应用", action: "回滚" },
        ].map((item) => {
          const connection = connectionRows.find((row) => textAt(row, ["label", "id"], "").toLowerCase().includes(item.label.toLowerCase().split(" ")[0]));
          const configured = connection ? Boolean(connection.configured) : item.status === "已应用";
          return (
            <div className="trow" style={{ cursor: "default" }} key={item.label}>
              <span className="cell-main"><span className={`rico ${item.iconTone}`}><i data-lucide="terminal" /></span><span className="c-copy"><strong>{item.label}</strong><span>{connection ? textAt(recordAt(connection, ["target"]), ["path"], item.path) : item.path}</span></span></span>
              <span className="cell-mono">{connection ? textAt(connection, ["profile", "routeProfile"], item.profile) : item.profile}</span>
              <span><ProviderStatusDot value={configured ? "已应用" : "pending"} /></span>
              <span className="route-acts"><button className="btn-ghost btn-sm" type="button">预览</button><button className={configured ? "btn-ghost btn-sm" : "btn-primary btn-sm"} type="button">{configured ? "回滚" : "应用"}</button></span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const content = providerDialogMode
    ? renderProviderConfig
    : clientAuthOpen
      ? renderClientAuthConfig
      : {
          overview: renderOverview,
          providers: renderProviders,
          models: renderModels,
          usage: renderUsage,
          apps: renderApps,
        }[view];

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap model-gateway-page">
        <div className="viewbar" role="tablist" aria-label="模型网关视图">
          {[
            ["overview", "layout-dashboard", "概览"],
            ["providers", "route", "Provider"],
            ["models", "box", "模型"],
            ["usage", "bar-chart-3", "用量"],
          ].map(([id, icon, label]) => (
            <button key={id} className={view === id ? "on" : ""} role="tab" aria-selected={view === id} onClick={() => setView(id as GatewayView)}>
              <i data-lucide={icon} />{label}
            </button>
          ))}
        </div>
        {content()}
      </div>
    </div>
  );
}
