<template>
  <div class="cs-cc-setup-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("绑定与动作", "Setup and Actions") }}</p>
        <h4>{{ text("快速绑定命令", "Quick Setup Commands") }}</h4>
      </div>
    </div>
    <p class="cs-field-hint">
      {{ text("保存 TOML 后，如果 cc-connect.service 正在运行会自动重启。绑定完成后可直接执行 finalizer。", "Saving TOML restarts cc-connect.service if it is running. After binding, you can immediately run the finalizer.") }}
    </p>
    <div class="cs-actions cs-actions-wrap">
      <button type="button" class="secondary-button" :disabled="busy" @click="$emit('copy-setup', 'feishu')">
        {{ text("复制 Feishu Setup", "Copy Feishu Setup") }}
      </button>
      <button type="button" class="secondary-button" :disabled="busy" @click="$emit('copy-setup', 'weixin')">
        {{ text("复制 Weixin Setup", "Copy Weixin Setup") }}
      </button>
      <button
        v-if="canFinalize"
        type="button"
        class="primary-button"
        :disabled="!canRunMutation"
        @click="$emit('finalize')"
      >
        {{ text("完成 cc-connect 安装", "Finalize cc-connect") }}
      </button>
      <p v-if="canFinalize && !canRunMutation && mutationDisabledHelp" class="cs-disabled-help">
        {{ mutationDisabledHelp }}
      </p>
    </div>
    <pre class="cs-code">{{ commands.join("\n") }}</pre>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

export type CodexStackCcConnectSetupPlatform = "feishu" | "weixin";

defineProps<{
  commands: string[];
  busy: boolean;
  canRunMutation: boolean;
  mutationDisabledHelp: string;
  canFinalize: boolean;
}>();

defineEmits<{
  "copy-setup": [platform: CodexStackCcConnectSetupPlatform];
  finalize: [];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-cc-setup-panel {
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

.cs-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-disabled-help {
  flex-basis: 100%;
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
}

.cs-code {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  background: var(--code-bg);
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0;
}

@media (max-width: 960px) {
  .cs-card-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
