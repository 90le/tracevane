import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type GatewayView = "overview" | "providers" | "models" | "usage";

const gatewayQueries = {
  status: "/api/model-gateway/status",
  runtime: "/api/model-gateway/runtime",
  providers: "/api/model-gateway/providers",
  appConnections: "/api/model-gateway/app-connections",
  usage: "/api/model-gateway/usage",
  daemonService: "/api/model-gateway/daemon-service",
} as const;

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

function GatewayRow({ icon, title, sub, status }: { icon: string; title: string; sub: string; status: unknown }) {
  return (
    <div className="route-row gateway-row">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span className="route-copy"><strong>{title}</strong><span>{sub}</span></span>
      <StatusTag value={status} />
    </div>
  );
}

function GatewayProviderButton({
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

  return (
    <button className={`gateway-provider-row ${selected ? "on" : ""}`} type="button" onClick={onSelect}>
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span className="gateway-provider-copy">
        <strong>{textAt(provider, ["name", "id"], "Provider")}</strong>
        <small>{compactList([textAt(provider, ["apiFormat"], "-"), `${models.length} models`, `${endpointProfiles.length} endpoints`, accountProvider.kind || "api-key"])}</small>
        <span className="gateway-provider-scopes">{appScopes.length ? appScopes.map(String).join(" / ") : "no client scope"}</span>
      </span>
      <span className="gateway-provider-meta">
        <StatusTag value={provider.enabled ? textAt(health, ["circuitState"], "enabled") : "disabled"} />
        <small>{formatMs(numberAt(health, ["lastLatencyMs"], NaN))}</small>
      </span>
    </button>
  );
}

function GatewayTile({ icon, title, value, sub, status }: { icon: string; title: string; value: React.ReactNode; sub: React.ReactNode; status?: unknown }) {
  return (
    <div className="gateway-tile">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <div><strong>{title}</strong><span>{sub}</span></div>
      <div className="gateway-tile-value">
        <b>{value}</b>
        {status !== undefined ? <StatusTag value={status} /> : null}
      </div>
    </div>
  );
}

function ProviderInspector({ provider }: { provider: AnyRecord | null }) {
  if (!provider) {
    return (
      <aside className="panel gateway-provider-inspector">
        <div className="statebox empty"><span className="si"><i data-lucide="route-off" /></span><strong>选择一个 Provider</strong><span>这里显示 endpoint、模型、账号池和健康证据。</span></div>
      </aside>
    );
  }

  const health = recordAt(provider, ["health"]);
  const modelsPayload = recordAt(provider, ["models"]);
  const models = listAt(modelsPayload, ["models"]).map(asRecord);
  const endpoints = listAt(provider, ["endpointProfiles"]).map(asRecord);
  const appScopes = listAt(provider, ["appScopes"]);
  const accountProvider = asRecord(provider.accountProvider);
  const defaultModel = textAt(modelsPayload, ["defaultModel"], "-");

  return (
    <aside className="panel gateway-provider-inspector">
      <div className="gateway-inspector-head">
        <span className="rico r-primary"><i data-lucide={provider.accountProvider ? "bot" : "route"} /></span>
        <span>
          <strong>{textAt(provider, ["name", "id"], "Provider")}</strong>
          <small>{compactList([textAt(provider, ["apiFormat"], "-"), textAt(provider, ["category"], "-"), provider.enabled ? "enabled" : "disabled"])}</small>
        </span>
        <StatusTag value={provider.enabled ? textAt(health, ["circuitState"], "enabled") : "disabled"} />
      </div>

      <div className="gateway-inspector-grid">
        <GatewayTile icon="box" title="默认模型" value={defaultModel} sub={`${models.length} models`} />
        <GatewayTile icon="timer" title="最近延迟" value={formatMs(numberAt(health, ["lastLatencyMs"], NaN))} sub={`success ${formatTime(textAt(health, ["lastSuccessAt"], ""))}`} status={textAt(health, ["circuitState"], "unknown")} />
      </div>

      <section className="gateway-inspector-section">
        <div className="section-label">Endpoint</div>
        <div className="gateway-mini-list">
          {endpoints.slice(0, 4).map((endpoint) => (
            <div className="gateway-mini-row" key={textAt(endpoint, ["id"], "endpoint")}>
              <span><strong>{textAt(endpoint, ["name", "id"], "endpoint")}</strong><small>{compactList([textAt(endpoint, ["apiFormat"], "-"), textAt(endpoint, ["baseUrl"], "-")])}</small></span>
              <StatusTag value={endpoint.enabled ? textAt(recordAt(endpoint, ["health"]), ["circuitState"], "enabled") : "disabled"} />
            </div>
          ))}
          {!endpoints.length ? <div className="statebox empty"><span className="si"><i data-lucide="plug-zap" /></span><strong>无独立 endpoint</strong><span>该 Provider 使用基础 endpoint 配置。</span></div> : null}
        </div>
      </section>

      <section className="gateway-inspector-section">
        <div className="section-label">模型能力</div>
        <div className="gateway-chip-grid">
          {models.slice(0, 10).map((model) => {
            const features = asRecord(model.features);
            const enabledFeatures = Object.entries(features).filter(([, value]) => Boolean(value)).map(([key]) => key);
            return <span className="chip" key={textAt(model, ["id"], "model")}>{textAt(model, ["id"], "model")} · {enabledFeatures.slice(0, 2).join("/") || "text"}</span>;
          })}
          {!models.length ? <span className="chip">暂无模型目录</span> : null}
        </div>
      </section>

      <section className="gateway-inspector-section">
        <div className="section-label">下钻入口</div>
        <div className="gateway-locked-actions">
          <div><strong>配置</strong><span>进入 Provider 子页面；保存前校验，危险变更确认。</span></div>
          <div><strong>账号池</strong><span>{accountProvider.kind ? "账号制 Provider 的从属管理。" : "非账号制 Provider 不显示账号池入口。"}</span></div>
          <div><strong>客户端接入</strong><span>{appScopes.length ? `${appScopes.map(String).join(" / ")} 可引用该 Provider。` : "暂无绑定 scope。"}</span></div>
        </div>
      </section>
    </aside>
  );
}

export function ModelGatewayPage() {
  const shell = useShell();
  const [view, setView] = useState<GatewayView>("overview");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");

  const status = useQuery({ queryKey: ["model-gateway", "status"], queryFn: () => apiJson(gatewayQueries.status), retry: false });
  const runtime = useQuery({ queryKey: ["model-gateway", "runtime"], queryFn: () => apiJson(gatewayQueries.runtime), retry: false });
  const providers = useQuery({ queryKey: ["model-gateway", "providers"], queryFn: () => apiJson(gatewayQueries.providers), retry: false });
  const appConnections = useQuery({ queryKey: ["model-gateway", "app-connections"], queryFn: () => apiJson(gatewayQueries.appConnections), retry: false });
  const usage = useQuery({ queryKey: ["model-gateway", "usage"], queryFn: () => apiJson(gatewayQueries.usage), retry: false });
  const daemonService = useQuery({ queryKey: ["model-gateway", "daemon-service"], queryFn: () => apiJson(gatewayQueries.daemonService), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, status.data, runtime.data, providers.data, appConnections.data, usage.data, daemonService.data]);

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

  useEffect(() => {
    if (!selectedProviderId && providerRows.length) setSelectedProviderId(textAt(providerRows[0], ["id"], ""));
  }, [providerRows, selectedProviderId]);

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
    <>
      <section className="hero gateway-hero">
        <div className="hero-top">
          <span className={`ready-chip ${stateTone(gatewayState) === "ok" ? "ok" : "warn"}`}><i data-lucide="route" />模型网关 · {gatewayState}</span>
          <span className="hero-time">Gateway {textAt(status.data, ["listener"], "loopback")} · {formatTime(textAt(status.data, ["checkedAt"], ""))}</span>
        </div>
        <h1>模型网关只回答一件事：当前流量会走向哪里。</h1>
        <p className="hero-sub">Provider、模型目录、客户端接入和用量是路由的证据层；配置、账号池和写入动作进入子流程，不在主界面平铺。</p>
        <div className="hero-stats gateway-stats">
          <Metric icon="circle-check" label="健康 Provider" value={<>{numberAt(healthSummary, ["okProviders"])}<small>/{numberAt(status.data, ["registry", "providerCount"])}</small></>} sub={`${numberAt(healthSummary, ["degradedProviders"])} degraded · ${numberAt(healthSummary, ["openCircuits"])} open`} />
          <Metric icon="activity" label="请求" value={formatCompact(numberAt(runtimeUsage, ["requestCount"]))} sub={`latest ${formatTime(textAt(runtimeUsage, ["latestRequestAt"], ""))}`} />
          <Metric icon="timer" label="p95 / p99" value={formatMs(numberAt(latency, ["p95Ms"], NaN))} sub={`p99 ${formatMs(numberAt(latency, ["p99Ms"], NaN))}`} />
          <Metric icon="coins" label="tokens" value={formatCompact(numberAt(recordAt(runtimeUsage, ["usage"]), ["totalTokens"]))} sub={`${formatCompact(numberAt(recordAt(runtimeUsage, ["usage"]), ["inputTokens"]))} in · ${formatCompact(numberAt(recordAt(runtimeUsage, ["usage"]), ["outputTokens"]))} out`} />
        </div>
      </section>
      <section className="panel gateway-panel gateway-routes-panel">
        <div className="panel-head"><div className="htitle"><h3>当前路由</h3><span className="sub">每个客户端 scope 最终解析到的 Provider / 协议 / 模型。</span></div><StatusTag value={activeRouteAlerts.length ? "degraded" : "ok"} /></div>
        <div className="panel-body gateway-list">
          <QueryNotice query={providers} label="路由" />
          {!providers.isLoading && !providers.isError && activeRoutes.length ? activeRoutes.map((route) => (
            <GatewayRow
              key={textAt(route, ["scope"], "scope")}
              icon="terminal"
              title={textAt(route, ["scope"], "scope")}
              sub={`${textAt(route, ["resolvedProviderName", "resolvedProviderId"], "auto")} · ${textAt(route, ["resolvedApiFormat"], "-")} · ${textAt(route, ["resolvedModel"], "-")}`}
              status={textAt(route, ["state"], "unknown")}
            />
          )) : null}
          {!providers.isLoading && !providers.isError && !activeRoutes.length ? <div className="statebox empty"><span className="si"><i data-lucide="route-off" /></span><strong>暂无活动路由</strong><span>配置 Provider 后会在这里显示 scope 解析。</span></div> : null}
        </div>
      </section>
      <div className="gateway-overview-grid">
        <section className="panel gateway-panel">
          <div className="panel-head"><div className="htitle"><h3>客户端接入摘要</h3><span className="sub">App Connection 只显示状态；应用 / 回退必须进入确认流。</span></div><button className="btn-ghost btn-sm" onClick={() => setView("providers")}><i data-lucide="arrow-right" />查看 Provider</button></div>
          <div className="panel-body gateway-list">
            <QueryNotice query={appConnections} label="客户端接入" />
            {!appConnections.isLoading && !appConnections.isError ? connectionRows.map((connection) => (
              <GatewayRow
                key={textAt(connection, ["id"], "connection")}
                icon="plug-zap"
                title={textAt(connection, ["label", "id"], "Client")}
                sub={`${textAt(connection, ["protocol"], "-")} · ${textAt(recordAt(connection, ["target"]), ["path"], "-")}`}
                status={connection.configured ? "configured" : "pending"}
              />
            )) : null}
          </div>
        </section>
        <section className="panel gateway-panel">
          <div className="panel-head"><div className="htitle"><h3>运行模式</h3><span className="sub">Daemon / client auth / lifecycle。</span></div></div>
          <div className="panel-body gateway-tile-grid">
            <GatewayTile icon="server" title="Local daemon" value={textAt(daemon, ["state"], "unknown")} sub={textAt(daemon, ["endpoint"], "-")} status={textAt(daemon, ["state"], "unknown")} />
            <GatewayTile icon="shield-keyhole" title="Client auth" value={clientAuth.enabled ? "enabled" : "disabled"} sub={textAt(clientAuth, ["apiKeyRef"], "-")} status={clientAuth.enabled ? "enabled" : "disabled"} />
          </div>
        </section>
      </div>
    </>
  );

  const renderProviders = () => (
    <div className="gateway-provider-shell">
      <section className="panel gateway-provider-list-panel">
        <div className="panel-head">
          <div className="htitle"><h3>Provider</h3><span className="sub">主对象是 Provider。选中后在右侧查看 endpoint、模型、账号与健康证据。</span></div>
          <StatusTag value={`${providerRows.length} providers`} />
        </div>
        <div className="panel-body gateway-provider-list">
          <QueryNotice query={providers} label="Provider" />
          {!providers.isLoading && !providers.isError ? providerRows.map((provider) => (
            <GatewayProviderButton
              key={textAt(provider, ["id"], "provider")}
              provider={provider}
              selected={textAt(provider, ["id"], "") === textAt(selectedProvider, ["id"], "")}
              onSelect={() => setSelectedProviderId(textAt(provider, ["id"], ""))}
            />
          )) : null}
          {!providers.isLoading && !providers.isError && providerRows.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="route-off" /></span><strong>暂无 Provider</strong><span>Provider 创建会进入单独表单流程，不在列表页堆字段。</span></div> : null}
        </div>
      </section>
      <ProviderInspector provider={selectedProvider} />
    </div>
  );

  const renderModels = () => (
    <section className="panel gateway-panel">
      <div className="panel-head"><div className="htitle"><h3>模型目录</h3><span className="sub">按 Provider 聚合模型、能力和预算；只展示当前已配置目录。</span></div><StatusTag value={`${modelCatalog.length} models`} /></div>
      <div className="panel-body gateway-table">
        <QueryNotice query={providers} label="模型目录" />
        {!providers.isLoading && !providers.isError ? modelCatalog.slice(0, 80).map(({ provider, model, health }) => {
          const features = asRecord(model.features);
          const featureNames = Object.entries(features).filter(([, value]) => Boolean(value)).map(([key]) => key).slice(0, 4);
          return (
            <GatewayRow
              key={`${provider}-${textAt(model, ["id"], "model")}`}
              icon="box"
              title={textAt(model, ["label", "id"], "model")}
              sub={`${provider} · ctx ${textAt(model, ["contextWindow"], "-")} · ${featureNames.join(", ") || "text"}`}
              status={health}
            />
          );
        }) : null}
      </div>
    </section>
  );

  const renderUsage = () => (
    <div className="gateway-stack">
      <section className="panel gateway-panel">
        <div className="panel-head"><div className="htitle"><h3>用量总览</h3><span className="sub">最小口径：模型请求次数和 token 消耗。</span></div><StatusTag value={usage.isError ? "error" : "read-only"} /></div>
        <div className="panel-body gateway-tile-grid">
          <GatewayTile icon="activity" title="请求" value={formatCompact(numberAt(usageTotals, ["requestCount"]))} sub={`${formatCompact(numberAt(usageTotals, ["meteredRequestCount"]))} metered`} />
          <GatewayTile icon="coins" title="Tokens" value={formatCompact(numberAt(usageTotals, ["totalTokens"]))} sub={`${formatCompact(numberAt(usageTotals, ["inputTokens"]))} in · ${formatCompact(numberAt(usageTotals, ["outputTokens"]))} out`} />
          <GatewayTile icon="database" title="读取窗口" value={formatCompact(numberAt(recordAt(usage.data, ["readWindow"]), ["entryCount"]))} sub={`${formatCompact(numberAt(recordAt(usage.data, ["readWindow"]), ["readBytes"]))} bytes`} status={recordAt(usage.data, ["readWindow"]).truncated ? "truncated" : "complete"} />
        </div>
      </section>
      <section className="panel gateway-panel">
        <div className="panel-head"><div className="htitle"><h3>按模型</h3><span className="sub">来自 /api/model-gateway/usage。</span></div></div>
        <div className="panel-body gateway-table">
          <QueryNotice query={usage} label="用量" />
          {!usage.isLoading && !usage.isError ? usageModels.slice(0, 40).map((row) => (
            <GatewayRow
              key={textAt(row, ["model"], "model")}
              icon="box"
              title={textAt(row, ["model"], "unknown model")}
              sub={`${formatCompact(numberAt(row, ["requestCount"]))} requests · ${formatCompact(numberAt(row, ["inputTokens"]))} in · ${formatCompact(numberAt(row, ["outputTokens"]))} out`}
              status={`${formatCompact(numberAt(row, ["totalTokens"]))} tokens`}
            />
          )) : null}
          {!usage.isLoading && !usage.isError && usageModels.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="bar-chart-3" /></span><strong>暂无用量</strong><span>模型请求进入 Gateway 后会在这里汇总。</span></div> : null}
        </div>
      </section>
    </div>
  );

  const content = {
    overview: renderOverview,
    providers: renderProviders,
    models: renderModels,
    usage: renderUsage,
  }[view];

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap model-gateway-page">
        <div className="page-head">
          <div className="htitle">
            <h2>模型网关</h2>
            <p>Provider、模型目录、客户端接入和用量的单一真相；写入动作进入下钻确认流。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => { void status.refetch(); void providers.refetch(); void usage.refetch(); }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>
        <div className="viewbar gateway-viewbar" role="tablist" aria-label="模型网关视图">
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
