<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay :class="['config-domain-advanced-sheet-mask', theme === 'light' ? 'theme-light' : 'theme-dark']" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section
          :class="['config-domain-advanced-sheet', theme === 'light' ? 'theme-light' : 'theme-dark']"
          :aria-label="title"
        >
          <header class="config-domain-advanced-sheet__head">
            <div class="config-domain-advanced-sheet__copy">
              <p class="eyebrow">{{ eyebrow }}</p>
              <h3>{{ title }}</h3>
              <p>{{ description }}</p>
            </div>
            <button
              type="button"
              class="config-domain-advanced-sheet__close"
              :aria-label="text('关闭高级设置', 'Close advanced settings')"
              @click="emit('close')"
            >
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </header>

          <div class="config-domain-advanced-sheet__notice">
            <strong>{{ text('推荐用于大多数情况', 'Recommended for most cases') }}</strong>
            <span>
              {{
                text(
                  '主路径先保持推荐基线，只在需要改 JSON、注入策略或低频运行守卫时再进入这里。',
                  'Keep the recommended baseline in the core path first. Open this panel only when you need JSON, injection policy, or low-frequency runtime guards.',
                )
              }}
            </span>
          </div>

          <div class="config-domain-advanced-sheet__body">
            <slot />
          </div>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { X } from '@lucide/vue';
import { useLocalePreference } from '../../shared/locale';
import type { ResolvedTheme } from '../../shared/theme';

defineOptions({ name: 'ConfigDomainAdvancedSheet' });

defineProps<{
  open: boolean;
  title: string;
  description: string;
  eyebrow?: string;
  theme: ResolvedTheme;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const { text } = useLocalePreference();

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    emit('close');
  }
}
</script>

<style scoped>
.config-domain-advanced-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 3100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--config-domain-advanced-mask-bg);
  backdrop-filter: blur(14px);
}

.config-domain-advanced-sheet {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 3101;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: min(980px, calc(100vw - 28px));
  max-height: min(88vh, 900px);
  transform: translate(-50%, -50%);
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--config-domain-advanced-border);
  background: var(--config-domain-advanced-surface);
  box-shadow: var(--config-domain-advanced-shadow);
}

.config-domain-advanced-sheet-mask.theme-light {
  --config-domain-advanced-mask-bg: rgba(225, 234, 245, 0.74);
}

.config-domain-advanced-sheet-mask.theme-dark {
  --config-domain-advanced-mask-bg: rgba(7, 12, 18, 0.54);
}

.config-domain-advanced-sheet.theme-light {
  --config-domain-advanced-border: rgba(25, 50, 77, 0.14);
  --config-domain-advanced-divider: rgba(25, 50, 77, 0.08);
  --config-domain-advanced-surface:
    radial-gradient(circle at top right, rgba(77, 129, 247, 0.09), transparent 30%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.995), rgba(243, 247, 252, 0.98));
  --config-domain-advanced-shadow: 0 28px 80px rgba(61, 85, 112, 0.24);
  --config-domain-advanced-notice: linear-gradient(180deg, rgba(37, 99, 235, 0.08), rgba(37, 99, 235, 0.03));
  --config-domain-advanced-close-border: rgba(25, 50, 77, 0.12);
  --config-domain-advanced-close-bg: rgba(37, 99, 235, 0.06);
}

.config-domain-advanced-sheet.theme-dark {
  --config-domain-advanced-border: rgba(255, 255, 255, 0.12);
  --config-domain-advanced-divider: rgba(255, 255, 255, 0.08);
  --config-domain-advanced-surface:
    radial-gradient(circle at top right, rgba(255, 199, 128, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(9, 18, 29, 0.98), rgba(11, 22, 35, 0.94));
  --config-domain-advanced-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
  --config-domain-advanced-notice: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.025));
  --config-domain-advanced-close-border: rgba(255, 255, 255, 0.1);
  --config-domain-advanced-close-bg: rgba(255, 255, 255, 0.04);
}

.config-domain-advanced-sheet__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid var(--config-domain-advanced-divider);
}

.config-domain-advanced-sheet__copy {
  display: grid;
  gap: 8px;
}

.config-domain-advanced-sheet__copy h3 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
}

.config-domain-advanced-sheet__copy p:last-child {
  margin: 0;
  max-width: 70ch;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.65;
}

.config-domain-advanced-sheet__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--config-domain-advanced-close-border);
  border-radius: 999px;
  background: var(--config-domain-advanced-close-bg);
  color: var(--text);
  cursor: pointer;
}

.config-domain-advanced-sheet__notice {
  display: grid;
  gap: 6px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--config-domain-advanced-divider);
  background: var(--config-domain-advanced-notice);
}

.config-domain-advanced-sheet__notice strong {
  color: var(--text);
  font-size: 13px;
}

.config-domain-advanced-sheet__notice span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.config-domain-advanced-sheet__body {
  overflow: auto;
  padding: 20px 24px 24px;
}

@media (max-width: 720px) {
  .config-domain-advanced-sheet {
    width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
  }

  .config-domain-advanced-sheet__head,
  .config-domain-advanced-sheet__notice,
  .config-domain-advanced-sheet__body {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
