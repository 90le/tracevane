<template>
  <div class="cs-cc-raw-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("原始配置", "Raw Config") }}</p>
        <h4>{{ text("TOML 编辑器", "TOML Editor") }}</h4>
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
      <p v-else-if="saveDisabledHelp" class="cs-disabled-help">
        {{ saveDisabledHelp }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-cc-connect.css";

const props = defineProps<{
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

const saveDisabledHelp = computed(() => (
  props.hasRawChanges ? "" : text("TOML 已同步；修改原始配置后才能保存。", "TOML is synced; edit the raw config before saving.")
));

function textareaValue(event: Event): string {
  return (event.target as HTMLTextAreaElement).value;
}
</script>
