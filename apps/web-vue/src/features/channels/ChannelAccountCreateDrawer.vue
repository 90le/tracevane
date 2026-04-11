<template>
  <!-- ChannelAccountCreateDrawer -->
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="channels-drawer-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section class="channels-drawer create-account-drawer" :aria-label="text('新建账号', 'Create account')">
          <header class="channels-drawer__head">
            <div>
              <p class="eyebrow">{{ text('CREATE ACCOUNT', 'CREATE ACCOUNT') }}</p>
              <h3>{{ channelLabel }}</h3>
              <p>{{ text('创建入口收成单页表单：上半部分填账号和凭据，下半部分补常用策略。', 'Creation now uses a single-page form: identity and credentials on top, common policies below.') }}</p>
            </div>
            <button type="button" class="channels-drawer__close" @click="$emit('close')">✕</button>
          </header>

          <div class="channels-drawer__body">
            <section class="channels-drawer-section">
              <div class="channels-drawer-section__head">
                <h4>{{ text('身份与凭据', 'Identity and credentials') }}</h4>
                <p>{{ text('先填账号 ID，再把必需凭据补齐。', 'Start with the account id, then fill in the required credentials.') }}</p>
              </div>

              <div class="form-grid">
                <div class="form-field form-field-full">
                  <label class="form-label">{{ text('账号 ID', 'Account ID') }}</label>
                  <input v-model="draft.id" class="form-input" :placeholder="text('例如 main / work / 客服号', 'For example main / work / support-bot')" />
                  <span class="field-hint">
                    {{ text(
                      '当前版本账号没有单独名称字段，账号 ID 就是显示身份和配置键。可以写中文，但建议使用短、稳定、便于排查日志的 ID。',
                      'Accounts do not have a separate display-name field yet. The account ID is both the visible identity and config key. Chinese is accepted, but a short stable ID is easier to debug.'
                    ) }}
                  </span>
                </div>

                <label class="toggle-card form-field-full">
                  <input v-model="draft.enabled" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('创建后立即启用', 'Enable after create') }}</strong>
                    <span>{{ text('保留为主流程入口，避免创建后还要再启一次。', 'Kept in the fast path so users do not need a second step to enable the account.') }}</span>
                  </div>
                </label>

                <div
                  v-for="field in catalog?.credentialFields || []"
                  :key="field.key"
                  class="form-field"
                >
                  <label class="form-label">{{ field.label }}</label>
                  <input
                    v-model="draft.credentialValues[field.key]"
                    class="form-input"
                    :type="field.secret ? 'password' : 'text'"
                    :placeholder="field.placeholder || text(`填写 ${field.label}`, `Enter ${field.label}`)"
                  />
                </div>
              </div>
            </section>

            <section class="channels-drawer-section">
              <div class="channels-drawer-section__head">
                <h4>{{ text('常用策略', 'Common policies') }}</h4>
                <p>{{ text('这里只保留高频策略字段，复杂字段后续进入账号详情页。', 'Only common policy fields live here. Complex fields belong in account detail later.') }}</p>
              </div>

              <div class="form-grid">
                <div class="form-field">
                  <label class="form-label">{{ text('私聊策略', 'DM policy') }}</label>
                  <GlassSelect v-model="draft.dmPolicy" :options="dmPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('群组策略', 'Group policy') }}</label>
                  <GlassSelect v-model="draft.groupPolicy" :options="groupPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('上下文可见性', 'Context visibility') }}</label>
                  <GlassSelect v-model="draft.contextVisibility" :options="contextVisibilityOptions" :placeholder="text('继承默认值', 'Inherit default')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('流式响应', 'Streaming') }}</label>
                  <GlassSelect v-model="draft.streaming" :options="streamingOptions" :placeholder="text('继承默认值', 'Inherit default')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('连接模式', 'Connection mode') }}</label>
                  <GlassSelect v-model="draft.connectionMode" :options="connectionModeOptions" :placeholder="text('未指定', 'Unset')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('渲染模式', 'Render mode') }}</label>
                  <GlassSelect v-model="draft.renderMode" :options="renderModeOptions" :placeholder="text('未指定', 'Unset')" />
                </div>
                <div class="form-field form-field-full">
                  <label class="form-label">{{ text('代理地址', 'Proxy URL') }}</label>
                  <input v-model="draft.proxy" class="form-input" :placeholder="text('例如 http://127.0.0.1:9981', 'For example http://127.0.0.1:9981')" />
                </div>
              </div>
            </section>
          </div>

          <footer class="channels-drawer__foot">
            <button type="button" class="secondary-button" :disabled="busy" @click="$emit('close')">
              {{ text('取消', 'Cancel') }}
            </button>
            <button
              type="button"
              class="primary-button"
              :disabled="busy || !draft.id.trim()"
              @click="emitSave"
            >
              {{ busy ? text('创建中...', 'Creating...') : text('创建账号', 'Create account') }}
            </button>
          </footer>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import type { ChannelAccountInput, ChannelCatalogEntry } from '../../../../../types/channels';
import GlassSelect, { type GlassSelectOption } from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import { createBlankAccountDraft } from './channel-ui';

defineOptions({ name: 'ChannelAccountCreateDrawer' });

const props = defineProps<{
  open: boolean;
  busy: boolean;
  channelLabel: string;
  catalog: ChannelCatalogEntry | null;
  initial: ChannelAccountInput | null;
  dmPolicyOptions: GlassSelectOption[];
  groupPolicyOptions: GlassSelectOption[];
  contextVisibilityOptions: GlassSelectOption[];
  streamingOptions: GlassSelectOption[];
  connectionModeOptions: GlassSelectOption[];
  renderModeOptions: GlassSelectOption[];
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'save', payload: ChannelAccountInput): void;
}>();

const { text } = useLocalePreference();
const draft = reactive(createBlankAccountDraft());

watch(
  () => props.open,
  (value) => {
    if (!value) return;
    Object.assign(draft, createBlankAccountDraft());
    draft.id = props.initial?.id || '';
    draft.enabled = props.initial?.enabled ?? true;
    draft.dmPolicy = props.initial?.dmPolicy || '';
    draft.groupPolicy = props.initial?.groupPolicy || '';
    draft.contextVisibility = props.initial?.contextVisibility || '';
    draft.streaming = props.initial?.streaming || '';
    draft.connectionMode = props.initial?.connectionMode || '';
    draft.renderMode = props.initial?.renderMode || '';
    draft.proxy = props.initial?.proxy || '';
    draft.credentialValues = {};
    for (const field of props.catalog?.credentialFields || []) {
      draft.credentialValues[field.key] = '';
    }
  },
  { immediate: true },
);

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) emit('close');
}

function emitSave(): void {
  emit('save', {
    id: draft.id.trim(),
    enabled: draft.enabled,
    fieldValues: { ...draft.credentialValues },
    dmPolicy: draft.dmPolicy || null,
    groupPolicy: draft.groupPolicy || null,
    contextVisibility: draft.contextVisibility || null,
    streaming: draft.streaming || null,
    connectionMode: draft.connectionMode || null,
    renderMode: draft.renderMode || null,
    proxy: draft.proxy || null,
  });
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
    radial-gradient(circle at top right, color-mix(in srgb, var(--body-glow-a) 48%, transparent), transparent 36%),
    var(--shell-stage-fill-strong);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
  z-index: 1201;
}

.create-account-drawer {
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
}

.channels-drawer__body {
  overflow: auto;
  display: grid;
  gap: 16px;
  min-height: 0;
  padding-right: 4px;
  overscroll-behavior: contain;
}

.channels-drawer-section {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--surface) 84%, transparent);
}

.channels-drawer-section__head h4 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
}

.channels-drawer-section__head p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.channels-drawer__foot {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 2px;
  border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}

html[data-theme="light"] .channels-drawer {
  background:
    radial-gradient(circle at top right, rgba(79, 132, 248, 0.1), transparent 38%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 254, 0.93));
}

html[data-theme="light"] .channels-drawer-section,
html[data-theme="light"] .channels-drawer .toggle-card {
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
    padding: 16px;
    border-radius: 18px;
  }

  .channels-drawer .form-grid {
    grid-template-columns: 1fr;
  }

  .channels-drawer__foot {
    justify-content: stretch;
  }

  .channels-drawer__foot > button {
    flex: 1 1 150px;
  }
}
</style>
