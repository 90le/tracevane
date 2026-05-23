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
      <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
        {{ busyDisabledHelp }}
      </p>
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
import "./codex-stack-cc-connect.css";

export type CodexStackCcConnectSetupPlatform = "feishu" | "weixin";

defineProps<{
  commands: string[];
  busy: boolean;
  busyDisabledHelp: string;
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
