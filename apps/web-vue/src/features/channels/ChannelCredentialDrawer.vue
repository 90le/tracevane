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
            <button type="button" class="channels-drawer__close" @click="$emit('close')">✕</button>
          </header>

          <div class="channels-drawer__body credential-drawer__body">
            <div class="credential-drawer__account-context">
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

            <div
              v-if="credentialFieldCount"
              class="credential-field-grid"
              :class="{ 'credential-field-grid--compact': credentialFieldCount <= 2 }"
            >
              <div
                v-for="field in catalog?.credentialFields || []"
                :key="field.key"
                class="form-field credential-field-card"
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
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import type { ChannelCatalogEntry } from '../../../../../types/channels';
import { useLocalePreference } from '../../shared/locale';

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

<style scoped>
.channels-drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(8, 16, 24, 0.66);
  backdrop-filter: blur(6px);
  z-index: 1200;
}

.channels-drawer {
  position: fixed;
  top: 24px;
  right: 24px;
  bottom: 24px;
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--line);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--body-glow-a) 52%, transparent), transparent 36%),
    var(--shell-stage-fill-strong),
    var(--glass-accent);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
  z-index: 1201;
}

.credential-drawer {
  width: min(620px, calc(100vw - 32px));
  border-color: color-mix(in srgb, var(--line) 86%, var(--sky) 14%);
}

.channels-drawer__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.channels-drawer__head h3 {
  margin: 4px 0 6px 0;
  color: var(--text);
}

.channels-drawer__head p:last-child {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.channels-drawer__close {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--line) 92%, transparent);
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  color: var(--text);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.channels-drawer__close:hover {
  border-color: color-mix(in srgb, var(--sky) 34%, var(--line));
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

.channels-drawer__body {
  overflow: auto;
  display: grid;
  gap: 16px;
  min-height: 0;
  padding-right: 4px;
  overscroll-behavior: contain;
}

.channels-drawer__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 2px;
  border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}

.channels-drawer__foot .primary-button,
.channels-drawer__foot .secondary-button {
  min-height: 40px;
}

.channels-credential-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.credential-drawer__account-context {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.credential-drawer__account-context span {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--surface) 84%, transparent);
  color: var(--text);
  overflow-wrap: anywhere;
}

.credential-drawer__account-context strong {
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.channels-credential-summary span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  color: var(--text-soft);
  font-size: 11px;
}

.credential-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.credential-field-grid--compact {
  grid-template-columns: minmax(0, 1fr);
  max-width: 520px;
}

.credential-field-card {
  min-width: 0;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--surface) 84%, transparent);
}

.credential-drawer__empty {
  padding: 16px;
  border-radius: 14px;
  border: 1px dashed color-mix(in srgb, var(--line) 86%, transparent);
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 74%, transparent);
}

.channels-drawer .form-grid {
  min-width: 0;
}

.channels-drawer .form-field {
  min-width: 0;
}

.channels-drawer .form-label {
  overflow-wrap: anywhere;
}

.channels-drawer .form-input {
  background: color-mix(in srgb, var(--field-bg) 88%, rgba(8, 16, 26, 0.3));
  border-color: color-mix(in srgb, var(--field-border) 92%, transparent);
}

.channels-drawer .form-input::placeholder {
  color: var(--muted-soft);
}

.channels-drawer .field-hint {
  color: var(--muted);
  overflow-wrap: anywhere;
}

html[data-theme="light"] .channels-drawer {
  background:
    radial-gradient(circle at top right, rgba(79, 132, 248, 0.1), transparent 38%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 254, 0.93));
}

html[data-theme="light"] .channels-credential-summary span {
  background: rgba(255, 255, 255, 0.82);
  border-color: rgba(19, 32, 49, 0.12);
}

html[data-theme="light"] .credential-drawer__account-context span,
html[data-theme="light"] .credential-field-card {
  background: rgba(255, 255, 255, 0.84);
  border-color: rgba(19, 32, 49, 0.1);
}

html[data-theme="light"] .channels-drawer .form-input {
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(19, 32, 49, 0.16);
}

@media (max-width: 920px) {
  .channels-drawer {
    inset: 10px;
    width: auto;
  }
}

@media (max-width: 640px) {
  .channels-drawer {
    inset: 8px;
    padding: 16px;
    border-radius: 16px;
  }

  .channels-drawer .form-grid {
    grid-template-columns: 1fr;
  }

  .credential-field-grid {
    grid-template-columns: 1fr;
  }

  .credential-drawer__account-context {
    grid-template-columns: 1fr;
  }

  .channels-drawer__foot {
    justify-content: stretch;
  }

  .channels-drawer__foot .primary-button,
  .channels-drawer__foot .secondary-button {
    flex: 1 1 calc(50% - 10px);
  }
}
</style>
