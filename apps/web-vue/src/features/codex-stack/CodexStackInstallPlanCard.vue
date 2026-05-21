<template>
  <article class="panel-card cs-install-plan-card">
    <div>
      <p class="cs-section-kicker">{{ text("当前计划", "Current Plan") }}</p>
      <h4>{{ text("执行前确认", "Preflight Confirmation") }}</h4>
      <p class="cs-field-hint">
        {{ text("下面是安装脚本将使用的关键参数。强制/跳过策略会直接转成 auto-setup.sh 参数。", "These are the key parameters passed to the installer. Force/skip strategy maps directly to auto-setup.sh arguments.") }}
      </p>
    </div>
    <div class="cs-install-plan-list">
      <span v-for="item in highlights" :key="item">{{ item }}</span>
    </div>
    <div class="cs-install-plan-actions">
      <button type="button" class="primary-button cs-big-button" :disabled="!canRunMutation" @click="$emit('install-full')">
        {{ text("一键安装全部组件", "Install Full Stack") }}
      </button>
      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('install-base')">
        {{ text("仅基础组件", "Base Only") }}
      </button>
      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="$emit('repair')">
        {{ text("推荐修复", "Recommended Repair") }}
      </button>
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
  repair: [];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-install-plan-card {
  display: grid;
  grid-template-columns: minmax(220px, 0.72fr) minmax(320px, 1fr) auto;
  gap: 18px;
  align-items: center;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--acc) 14%, transparent), transparent 35%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 94%, #0c1d20 6%), var(--surface));
}

.cs-install-plan-card h4 {
  margin: 0;
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}

.cs-disabled-help {
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
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
