<template>
  <!-- ChannelCredentialDrawer -->
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="channels-drawer-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section class="channels-drawer credential-drawer" :aria-label="text('账号凭据', 'Account credentials')">
          <header class="channels-drawer__head">
            <div>
              <p class="eyebrow">{{ text('CREDENTIALS', 'CREDENTIALS') }}</p>
              <h3>{{ text('配置账号凭据', 'Configure account credentials') }}</h3>
              <p>{{ text('凭据会写入当前频道账号；保存前请确认账号上下文。', 'Credentials are saved to the current channel account. Confirm the account context before saving.') }}</p>
            </div>
            <button type="button" class="channels-drawer__close" :aria-label="text('关闭', 'Close')" @click="$emit('close')">
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </header>

          <div class="channels-drawer__body credential-drawer__body">
            <div class="credential-drawer__account-summary">
              <div class="credential-drawer__account-facts">
                <span>
                  <strong>{{ text('频道', 'Provider') }}</strong>
                  {{ channelLabel || text('未选择频道', 'No provider selected') }}
                </span>
                <span>
                  <strong>{{ text('账户', 'Account') }}</strong>
                  {{ accountId || text('未选择账号', 'No account selected') }}
                </span>
              </div>

              <div class="channels-credential-summary">
                <span>{{ text('已配置', 'Configured') }} {{ configuredCount }}</span>
                <span>{{ text('总字段', 'Total fields') }} {{ catalog?.credentialFields.length || 0 }}</span>
              </div>
            </div>

            <div
              v-if="credentialFieldCount"
              class="credential-field-grid"
              :class="{ 'credential-field-grid--compact': credentialFieldCount <= 2 }"
            >
              <div
                v-for="field in catalog?.credentialFields || []"
                :key="field.key"
                class="form-field credential-field-panel"
              >
                <label class="form-label">{{ field.label }}</label>
                <input
                  v-model="draft[field.key]"
                  class="form-input"
                  :type="field.secret ? 'password' : 'text'"
                  :placeholder="field.placeholder || text(`填写 ${field.label}`, `Enter ${field.label}`)"
                />
                <span class="field-hint">
                  {{ configuredKeys.has(field.key) ? text('当前已配置', 'Currently configured') : text('当前未配置', 'Currently unconfigured') }}
                </span>
              </div>
            </div>
            <div v-else class="credential-drawer__empty">
              {{ text('当前频道没有声明凭据字段。', 'This provider does not declare credential fields.') }}
            </div>
          </div>

          <footer class="channels-drawer__foot">
            <button type="button" class="secondary-button" :disabled="busy" @click="$emit('close')">
              {{ text('取消', 'Cancel') }}
            </button>
            <button type="button" class="primary-button" :disabled="busy" @click="emitSave">
              {{ busy ? text('保存中...', 'Saving...') : text('保存凭据', 'Save credentials') }}
            </button>
          </footer>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { X } from '@lucide/vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import type { ChannelCatalogEntry } from '../../../../../types/channels';
import { useLocalePreference } from '../../shared/locale';
import './channels-drawer.css';

defineOptions({ name: 'ChannelCredentialDrawer' });

const props = defineProps<{
  open: boolean;
  busy: boolean;
  channelLabel: string;
  accountId: string;
  catalog: ChannelCatalogEntry | null;
  values: Record<string, string>;
  configuredKeys: Set<string>;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'save', payload: Record<string, string>): void;
}>();

const { text } = useLocalePreference();

const draft = reactive<Record<string, string>>({});

watch(
  () => [props.open, props.values, props.catalog] as const,
  () => {
    for (const key of Object.keys(draft)) {
      delete draft[key];
    }
    for (const field of props.catalog?.credentialFields || []) {
      draft[field.key] = props.values[field.key] || '';
    }
  },
  { immediate: true },
);

const configuredCount = computed(() => props.configuredKeys.size);
const credentialFieldCount = computed(() => props.catalog?.credentialFields.length || 0);

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) emit('close');
}

function emitSave(): void {
  emit('save', { ...draft });
}
</script>
