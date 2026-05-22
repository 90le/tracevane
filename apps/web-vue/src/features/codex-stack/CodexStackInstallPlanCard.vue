<template>
  <article class="panel-card cs-install-plan-card">
    <div class="cs-install-plan-copy">
      <p class="cs-section-kicker">{{ text("当前计划", "Current Plan") }}</p>
      <h4>{{ text("新手入口", "Beginner Entry") }}</h4>
      <p class="cs-field-hint">
        {{ text("不用先理解所有组件：第一次使用点“一键安装全部组件”；已经装过但异常，点“推荐修复”。", "You do not need to understand every component first: first-time users choose Install Full Stack; existing unhealthy installs choose Recommended Repair.") }}
      </p>
      <div class="cs-install-plan-list">
        <span v-for="item in highlights" :key="item">{{ item }}</span>
      </div>
    </div>
    <div class="cs-install-plan-actions">
      <section class="cs-entry-action">
        <span>{{ text("第一次使用", "First Time") }}</span>
        <strong>{{ text("直接安装完整链路", "Install the full route") }}</strong>
        <button type="button" class="primary-button cs-big-button" :disabled="!canRunMutation" @click="$emit('install-full')">
          {{ text("一键安装全部组件", "Install Full Stack") }}
        </button>
      </section>
      <section class="cs-entry-action">
        <span>{{ text("已经安装", "Already Installed") }}</span>
        <strong>{{ text("状态异常先修复", "Repair unhealthy state") }}</strong>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair')">
          {{ text("推荐修复", "Recommended Repair") }}
        </button>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('reinstall-full')">
          {{ text("重新安装", "Reinstall") }}
        </button>
        <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('install-base')">
          {{ text("仅基础组件", "Base Only") }}
        </button>
      </section>
      <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
        {{ mutationDisabledHelp }}
      </p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

defineProps<{
  highlights: string[];
  canRunMutation: boolean;
  mutationDisabledHelp: string;
}>();

defineEmits<{
  "install-full": [];
  "install-base": [];
  "reinstall-full": [];
  repair: [];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-install-plan-card {
  display: grid;
  grid-template-columns: minmax(260px, 0.85fr) minmax(420px, 1.15fr);
  gap: 20px;
  align-items: stretch;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--acc) 14%, transparent), transparent 35%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 94%, #0c1d20 6%), var(--surface));
}

.cs-install-plan-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}

.cs-install-plan-card h4 {
  margin: 0;
  font-size: 1.16rem;
}

.cs-install-plan-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cs-install-plan-list span {
  display: inline-flex;
  border: 1px solid color-mix(in srgb, var(--acc) 24%, var(--line));
  border-radius: 14px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--code-bg) 36%, transparent);
  color: var(--text);
  font-size: 0.86rem;
}

.cs-install-plan-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-entry-action {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--acc) 24%, var(--line));
  border-radius: var(--radius-lg);
  padding: 14px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
}

.cs-entry-action span {
  color: var(--muted);
  font-size: 0.74rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cs-entry-action strong {
  color: var(--text);
  line-height: 1.35;
}

.cs-entry-action button:last-child {
  margin-top: auto;
}

.cs-disabled-help {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

@media (max-width: 960px) {
  .cs-install-plan-card {
    grid-template-columns: 1fr;
  }

  .cs-install-plan-actions {
    grid-template-columns: 1fr;
  }
}
</style>
