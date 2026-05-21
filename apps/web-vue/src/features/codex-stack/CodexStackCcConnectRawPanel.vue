<template>
  <div class="cs-cc-raw-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("原始配置", "Raw Config") }}</p>
        <h4>{{ text("TOML 编辑器", "TOML Editor") }}</h4>
        <p class="cs-field-hint">
          {{ text("用于保留可视化表单尚未覆盖的高级字段。保存会交回主控制页执行 TOML patch 和服务重启。", "Use this for advanced fields not yet covered by the visual form. Saving returns to the control page for TOML patching and service restart.") }}
        </p>
      </div>
      <span class="cs-status-pill" :class="hasRawChanges ? 'tone-accent' : 'tone-neutral'">
        {{ hasRawChanges ? text("TOML 有修改", "TOML unsaved") : text("TOML 已同步", "TOML synced") }}
      </span>
    </div>
    <textarea
      :value="rawDraft"
      class="cs-raw-editor"
      spellcheck="false"
      :placeholder="text('cc-connect TOML 会显示在这里。', 'The cc-connect TOML will appear here.')"
      @input="$emit('update-raw', textareaValue($event))"
    />
    <div class="cs-actions">
      <button
        type="button"
        class="primary-button"
        :disabled="!canRunMutation || !hasRawChanges"
        @click="$emit('save-raw')"
      >
        {{ text("保存 TOML 配置", "Save TOML Config") }}
      </button>
      <p v-if="!canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
        {{ mutationDisabledHelp }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

defineProps<{
  rawDraft: string;
  hasRawChanges: boolean;
  canRunMutation: boolean;
  mutationDisabledHelp: string;
}>();

defineEmits<{
  "update-raw": [raw: string];
  "save-raw": [];
}>();

const { text } = useLocalePreference();

function textareaValue(event: Event): string {
  return (event.target as HTMLTextAreaElement).value;
}
</script>

<style scoped>
.cs-cc-raw-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cs-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-card-header h4 {
  margin: 0;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.cs-status-pill.tone-accent {
  color: var(--acc);
  border-color: color-mix(in srgb, var(--acc) 38%, var(--line));
  background: color-mix(in srgb, var(--acc) 14%, var(--surface));
}

.cs-status-pill.tone-neutral {
  color: var(--text-soft);
  border-color: color-mix(in srgb, var(--muted) 32%, var(--line));
  background: color-mix(in srgb, var(--muted) 12%, var(--surface));
}

.cs-raw-editor {
  width: 100%;
  min-height: 420px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  background: var(--code-bg);
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.cs-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-disabled-help {
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

@media (max-width: 960px) {
  .cs-card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-status-pill {
    width: fit-content;
  }
}
</style>
