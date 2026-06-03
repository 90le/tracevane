<template>
  <div class="cs-cc-setup-panel">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("绑定与动作", "Setup and Actions") }}</p>
        <h4>{{ text("快速绑定命令", "Quick Setup Commands") }}</h4>
      </div>
    </div>
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
    <div class="cs-cc-command-summary">
      <div>
        <strong>{{ text("绑定命令已准备", "Setup commands ready") }}</strong>
        <span>{{ commandMeta }}</span>
      </div>
      <button type="button" class="secondary-button" :disabled="!commands.length" @click="openCommandSheet">
        <Terminal :size="15" aria-hidden="true" />
        {{ text("查看完整命令", "View commands") }}
      </button>
    </div>
    <ul class="cs-cc-command-preview" aria-label="cc-connect setup command preview">
      <li v-for="command in previewCommands" :key="command">
        <code>{{ command }}</code>
      </li>
    </ul>

    <Teleport v-if="commandSheetOpen" to="body">
      <div class="floating-output-dock cs-cc-command-sheet-dock">
        <section
          class="floating-output-sheet cs-cc-command-sheet"
          role="dialog"
          aria-live="polite"
          aria-modal="false"
          :aria-label="text('cc-connect 绑定命令窗口', 'cc-connect setup command window')"
        >
          <header class="floating-output-sheet__head cs-cc-command-sheet-head">
            <div>
              <p class="cs-section-kicker">{{ text("绑定命令", "Setup Commands") }}</p>
              <h3>{{ text("cc-connect 快速绑定", "cc-connect Quick Setup") }}</h3>
              <span>{{ commandMeta }}</span>
            </div>
            <div class="floating-output-sheet__actions cs-cc-command-sheet-actions">
              <button type="button" class="secondary-button" @click="copyAllCommands">
                <Copy :size="15" aria-hidden="true" />
                {{ commandCopied ? text("已复制", "Copied") : text("复制全部", "Copy all") }}
              </button>
              <button type="button" class="secondary-button" @click="closeCommandSheet">
                <X :size="15" aria-hidden="true" />
                {{ text("关闭", "Close") }}
              </button>
            </div>
          </header>
          <pre class="floating-output-sheet__log cs-cc-command-sheet-log">{{ commandText }}</pre>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, Terminal, X } from "@lucide/vue";
import { copyTextToClipboard } from "../../shared/clipboard";
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-cc-connect.css";

export type CodexStackCcConnectSetupPlatform = "feishu" | "weixin";

const props = defineProps<{
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
const commandSheetOpen = ref(false);
const commandCopied = ref(false);
const commandText = computed(() => props.commands.join("\n"));
const previewCommands = computed(() => props.commands.slice(0, 2));
const commandMeta = computed(() => text(
  `${props.commands.length} 条命令 · ${commandText.value.length} 字符`,
  `${props.commands.length} commands · ${commandText.value.length} chars`,
));

function openCommandSheet(): void {
  commandCopied.value = false;
  commandSheetOpen.value = true;
}

function closeCommandSheet(): void {
  commandSheetOpen.value = false;
}

async function copyAllCommands(): Promise<void> {
  const copied = await copyTextToClipboard(commandText.value);
  if (!copied) return;
  commandCopied.value = true;
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      commandCopied.value = false;
    }, 1400);
  }
}
</script>
