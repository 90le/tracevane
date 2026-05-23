<template>
  <div class="cs-service-grid">
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
      <p class="cs-service-blurb">{{ service.blurb }}</p>
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
        <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
          {{ mutationDisabledHelp }}
        </p>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { CodexStackServiceAction, CodexStackServiceId } from "../../../../../types/codex-stack";
import type { CodexStackTone } from "./codex-stack-view-model";

export interface CodexStackServiceCard {
  id: CodexStackServiceId;
  active: boolean;
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
  };
}>();

defineEmits<{
  "service-action": [serviceId: CodexStackServiceId, action: Extract<CodexStackServiceAction, "start" | "stop" | "restart">];
}>();
</script>

<style scoped>
.cs-service-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  border-radius: 22px;
  background: color-mix(in srgb, var(--surface) 58%, transparent);
}

.cs-service-card {
  display: grid;
  grid-template-columns: minmax(250px, 0.72fr) minmax(260px, 1fr) minmax(220px, 0.72fr) auto;
  gap: 14px;
  align-items: center;
  min-height: 0;
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 74%, transparent);
  background: transparent;
}

.cs-service-card:last-child {
  border-bottom: 0;
}

.cs-service-card-head,
.cs-service-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-service-title {
  justify-content: flex-start;
}

.cs-service-title h4 {
  margin: 0;
}

.cs-service-title p {
  margin: 4px 0 0;
  color: var(--text-soft);
}

.cs-service-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-soft);
  font-size: 0.85rem;
}

.cs-service-badge-live {
  border-color: color-mix(in srgb, var(--success) 36%, var(--line));
}

.cs-service-badge-off {
  border-color: color-mix(in srgb, var(--danger) 36%, var(--line));
}

.cs-service-blurb {
  margin: 0;
  color: var(--text-soft);
}

.cs-stat-list {
  display: grid;
  gap: 6px;
  margin: 0;
}

.cs-stat-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  border-top: 0;
}

.cs-stat-list dt {
  color: var(--muted);
  font-size: 0.82rem;
}

.cs-stat-list dd {
  margin: 0;
  color: var(--text);
  text-align: right;
  word-break: break-word;
}

.cs-service-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 0;
}

.cs-disabled-help {
  flex-basis: 100%;
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--muted);
  box-shadow: 0 0 14px currentColor;
  flex: 0 0 auto;
}

.cs-dot.tone-sage {
  color: var(--success);
  background: var(--success);
}

.cs-dot.tone-accent {
  color: var(--acc);
  background: var(--acc);
}

.cs-dot.tone-danger {
  color: var(--danger);
  background: var(--danger);
}

.cs-dot.tone-neutral {
  color: var(--muted);
  background: var(--muted);
}

@media (max-width: 1200px) {
  .cs-service-grid {
    grid-template-columns: 1fr;
  }

  .cs-service-card {
    grid-template-columns: minmax(240px, 0.7fr) minmax(0, 1fr);
    align-items: start;
  }

  .cs-stat-list,
  .cs-service-card-actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .cs-service-card {
    grid-template-columns: 1fr;
  }

  .cs-service-card-actions {
    justify-content: flex-start;
  }
}
</style>
