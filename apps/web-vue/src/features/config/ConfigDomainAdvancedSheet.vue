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
import './config-workspace.css';

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
