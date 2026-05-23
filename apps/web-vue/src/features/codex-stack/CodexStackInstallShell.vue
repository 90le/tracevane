<template>
  <div class="cs-install-shell" :class="{ 'cs-install-shell-busy': busy }">
    <aside class="cs-install-guide" :aria-label="text('安装修复向导', 'Install and repair guide')">
      <p class="cs-section-kicker">{{ text("向导", "Guide") }}</p>
      <ol class="cs-install-guide-list">
        <li class="active">
          <span>1</span>
          <strong>{{ text("选择入口", "Choose entry") }}</strong>
          <small>{{ text("首次安装或推荐修复", "First install or recommended repair") }}</small>
        </li>
        <li>
          <span>2</span>
          <strong>{{ text("验证链路", "Verify route") }}</strong>
          <small>{{ text("普通、流式、非流式、压缩上下文", "Chat, stream, non-stream, and compact checks") }}</small>
        </li>
        <li>
          <span>3</span>
          <strong>{{ text("按需切换", "Attach when ready") }}</strong>
          <small>{{ text("通过 smoke gate 后再接入 Codex", "Attach Codex only after smoke gate passes") }}</small>
        </li>
      </ol>
      <p class="cs-install-guide-note">
        {{ text("执行日志会在右下角浮层展示，当前页面只保留下一步动作。", "Execution logs open in the floating panel; this page keeps the next action in focus.") }}
      </p>
    </aside>
    <div class="cs-install-workflow">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-install.css";

defineProps<{
  busy: boolean;
}>();

const { text } = useLocalePreference();
</script>
