<template>
  <div class="cs-service-grid">
    <div class="cs-service-grid-head">
      <div>
        <p class="cs-section-kicker">{{ text("服务", "Services") }}</p>
        <h4>{{ text("服务控制", "Service Control") }}</h4>
      </div>
      <span class="cs-status-pill tone-neutral">{{ services.length }}</span>
    </div>
    <article v-for="service in services" :key="service.id" class="cs-service-card">
      <div class="cs-service-card-head">
        <div class="cs-service-title">
          <span :class="`cs-dot tone-${service.tone}`"></span>
          <div>
            <h4>{{ service.label }}</h4>
            <p>{{ service.stateLabel }}</p>
          </div>
        </div>
        <span class="cs-service-badge" :class="service.active ? 'cs-service-badge-live' : 'cs-service-badge-off'">
          {{ service.active ? labels.running : labels.stopped }}
        </span>
      </div>
      <dl class="cs-stat-list">
        <div>
          <dt>{{ service.endpointLabel }}</dt>
          <dd>{{ service.endpointValue }}</dd>
        </div>
        <div>
          <dt>{{ labels.enabled }}</dt>
          <dd>{{ service.enabledLabel }}</dd>
        </div>
        <div>
          <dt>{{ labels.systemd }}</dt>
          <dd>{{ service.rawState }}</dd>
        </div>
      </dl>
      <div class="cs-service-card-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="!canRunMutation || service.active"
          @click="$emit('service-action', service.id, 'start')"
        >
          {{ labels.start }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="!canRunMutation || !service.active"
          @click="$emit('service-action', service.id, 'stop')"
        >
          {{ labels.stop }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="!canRunMutation"
          @click="$emit('service-action', service.id, 'restart')"
        >
          {{ labels.restart }}
        </button>
        <button
          type="button"
          class="secondary-button"
          :disabled="!canRunMutation || service.enabled"
          @click="$emit('service-action', service.id, 'enable')"
        >
          {{ labels.enableAutostart }}
        </button>
        <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
          {{ mutationDisabledHelp }}
        </p>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { CodexStackManualServiceId, CodexStackServiceAction } from "../../../../../types/codex-stack";
import { useLocalePreference } from "../../shared/locale";
import type { CodexStackTone } from "./codex-stack-view-model";
import "./codex-stack-dashboard.css";

export interface CodexStackServiceCard {
  id: CodexStackManualServiceId;
  active: boolean;
  enabled: boolean;
  label: string;
  blurb: string;
  tone: CodexStackTone;
  stateLabel: string;
  enabledLabel: string;
  rawState: string;
  endpointLabel: string;
  endpointValue: string;
}

defineProps<{
  services: CodexStackServiceCard[];
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  labels: {
    running: string;
    stopped: string;
    enabled: string;
    systemd: string;
    start: string;
    stop: string;
    restart: string;
    enableAutostart: string;
  };
}>();

defineEmits<{
  "service-action": [
    serviceId: CodexStackManualServiceId,
    action: Extract<CodexStackServiceAction, "start" | "stop" | "restart" | "enable">,
  ];
}>();

const { text } = useLocalePreference();
</script>
