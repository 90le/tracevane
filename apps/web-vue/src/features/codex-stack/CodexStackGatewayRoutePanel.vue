<template>
  <section class="cs-surface cs-gateway-route-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("Gateway", "Gateway") }}</p>
        <h4>{{ text("协议、模型与渠道路由", "Protocol, Model, and Channel Routes") }}</h4>
      </div>
      <div class="cs-gateway-route-head">
        <span class="cs-status-pill" :class="summary.gateway.live ? 'tone-sage' : 'tone-accent'">
          {{ summary.gateway.live ? text("在线", "Online") : text("配置就绪", "Configured") }}
        </span>
        <code>{{ summary.gateway.baseUrl }}</code>
      </div>
    </div>

    <div class="cs-gateway-route-ledger">
      <div
        v-for="adapter in summary.gateway.clientAdapters"
        :key="adapter.id"
        class="cs-gateway-route-row"
      >
        <span>{{ adapter.label }}</span>
        <strong>{{ adapter.protocol }}</strong>
        <code>{{ adapter.baseUrl }}</code>
        <small>{{ adapter.authEnv }} · {{ adapter.modelEnv }}</small>
      </div>
    </div>

    <div class="cs-gateway-source-row">
      <span>{{ text("cc-connect 源码", "cc-connect Source") }}</span>
      <strong>{{ summary.gateway.integrations.ccConnectSourceReady ? text("托管就绪", "Managed source ready") : text("未检测到完整源码", "Source incomplete") }}</strong>
      <code>{{ summary.gateway.integrations.ccConnectSourcePath || "--" }}</code>
      <small>{{ sourceCapabilitiesLabel }}</small>
    </div>

    <details class="cs-gateway-route-catalog">
      <summary>
        <span>{{ text("路由目录", "Route catalog") }}</span>
        <small>{{ text("协议、Provider、模型入口和渠道模板", "Protocols, providers, model entries, and channel templates") }}</small>
      </summary>
      <div class="cs-gateway-route-grid">
        <section>
          <h5>{{ text("协议适配", "Protocol Adapters") }}</h5>
          <div class="cs-gateway-mini-table">
            <div
              v-for="protocol in summary.gateway.protocolCatalog"
              :key="protocol.id"
              class="cs-gateway-mini-row"
            >
              <span>{{ protocol.label }}</span>
              <code>{{ protocol.endpoint }}</code>
              <small>{{ protocol.adapter }} · {{ protocol.streaming ? "stream" : "non-stream" }}</small>
            </div>
          </div>
        </section>

        <section>
          <h5>{{ text("Provider 路由", "Provider Routes") }}</h5>
          <div class="cs-gateway-mini-table">
            <div
              v-for="provider in summary.gateway.providerRoutes"
              :key="provider.id"
              class="cs-gateway-mini-row"
            >
              <span>{{ provider.label }}</span>
              <code>{{ provider.model || defaultModel }}</code>
              <small>{{ provider.protocol }} · {{ provider.agentTypes.join(", ") }}</small>
            </div>
          </div>
        </section>

        <section>
          <h5>{{ text("模型入口", "Model Entries") }}</h5>
          <div class="cs-gateway-mini-table">
            <div
              v-for="model in visibleModelRoutes"
              :key="model.id"
              class="cs-gateway-mini-row"
            >
              <span>{{ model.alias || model.provider }}</span>
              <code>{{ model.label }}</code>
              <small>{{ model.protocol }}</small>
            </div>
          </div>
        </section>

        <section>
          <h5>{{ text("渠道模板", "Channel Templates") }}</h5>
          <div class="cs-gateway-mini-table">
            <div
              v-for="channel in summary.gateway.channelTemplates"
              :key="channel.id"
              class="cs-gateway-mini-row"
            >
              <span>{{ channel.label }}</span>
              <code>{{ channel.requiredOptions.join(", ") || "--" }}</code>
              <small>{{ channel.setupCommand || text("手动参数", "Manual options") }}</small>
            </div>
          </div>
        </section>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CodexStackSummaryPayload } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-settings.css";

const props = defineProps<{
  summary: CodexStackSummaryPayload;
  defaultModel: string;
}>();

const { text } = useLocalePreference();

const visibleModelRoutes = computed(() => {
  const routes = props.summary.gateway.modelRoutes;
  return routes.length ? routes.slice(0, 12) : [{
    id: "default",
    label: props.defaultModel || "--",
    provider: "gateway",
    protocol: "openai-responses + anthropic-messages",
    alias: null,
  }];
});

const sourceCapabilitiesLabel = computed(() => {
  const agents = props.summary.gateway.integrations.ccConnectSourceAgentTypes;
  const platforms = props.summary.gateway.integrations.ccConnectSourcePlatforms;
  const visibleAgents = agents.slice(0, 6).join(", ") || "--";
  const visiblePlatforms = platforms.slice(0, 6).join(", ") || "--";
  return text(
    `Agent ${agents.length}: ${visibleAgents} · 渠道 ${platforms.length}: ${visiblePlatforms}`,
    `Agents ${agents.length}: ${visibleAgents} · Channels ${platforms.length}: ${visiblePlatforms}`,
  );
});
</script>
