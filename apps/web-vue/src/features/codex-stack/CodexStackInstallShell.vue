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

defineProps<{
  busy: boolean;
}>();

const { text } = useLocalePreference();
</script>

<style>
.cs-install-shell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--atlas-radius-lg, 16px);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 70%, transparent), color-mix(in srgb, var(--surface-base) 38%, transparent));
}

.cs-install-guide {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 18px;
  border-right: 1px solid var(--border-subtle);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 58%, transparent), color-mix(in srgb, var(--surface-base) 22%, transparent));
}

.cs-install-guide-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cs-install-guide-list li {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 2px 10px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.cs-install-guide-list li:last-child {
  border-bottom: 0;
}

.cs-install-guide-list span {
  grid-row: 1 / span 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--acc) 34%, var(--line));
  color: var(--acc);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.cs-install-guide-list strong {
  min-width: 0;
  color: var(--text);
  font-size: 0.9rem;
}

.cs-install-guide-list small,
.cs-install-guide-note {
  min-width: 0;
  color: var(--muted);
  line-height: 1.45;
}

.cs-install-guide-list li.active span {
  background: color-mix(in srgb, var(--acc) 14%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--acc) 8%, transparent);
}

.cs-install-guide-note {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid color-mix(in srgb, var(--acc) 56%, var(--line));
  font-size: 0.84rem;
}

.cs-install-workflow {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: 16px;
}

.cs-install-shell-busy .cs-install-guide-note {
  color: color-mix(in srgb, var(--acc) 72%, var(--text));
}

@media (max-width: 960px) {
  .cs-install-shell {
    grid-template-columns: 1fr;
  }

  .cs-install-guide {
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }
}
</style>
