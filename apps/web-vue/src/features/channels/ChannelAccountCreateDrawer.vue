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
            <button type="button" class="channels-drawer__close" :aria-label="text('关闭', 'Close')" @click="$emit('close')">
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
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

                <label class="option-row form-field-full">
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
                  <StudioSelect v-model="draft.dmPolicy" :options="dmPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" :teleport="false" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('群组策略', 'Group policy') }}</label>
                  <StudioSelect v-model="draft.groupPolicy" :options="groupPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" :teleport="false" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('上下文可见性', 'Context visibility') }}</label>
                  <StudioSelect v-model="draft.contextVisibility" :options="contextVisibilityOptions" :placeholder="text('继承默认值', 'Inherit default')" :teleport="false" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('流式响应', 'Streaming') }}</label>
                  <StudioSelect v-model="draft.streaming" :options="streamingOptions" :placeholder="text('继承默认值', 'Inherit default')" :teleport="false" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('连接模式', 'Connection mode') }}</label>
                  <StudioSelect v-model="draft.connectionMode" :options="connectionModeOptions" :placeholder="text('未指定', 'Unset')" :teleport="false" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('渲染模式', 'Render mode') }}</label>
                  <StudioSelect v-model="draft.renderMode" :options="renderModeOptions" :placeholder="text('未指定', 'Unset')" :teleport="false" />
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
import { X } from '@lucide/vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import type { ChannelAccountInput, ChannelCatalogEntry } from '../../../../../types/channels';
import StudioSelect, { type StudioSelectOption } from '../../shared/components/StudioSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import { createBlankAccountDraft } from './channel-ui';
import './channels-drawer.css';

defineOptions({ name: 'ChannelAccountCreateDrawer' });

const props = defineProps<{
  open: boolean;
  busy: boolean;
  channelLabel: string;
  catalog: ChannelCatalogEntry | null;
  initial: ChannelAccountInput | null;
  dmPolicyOptions: StudioSelectOption[];
  groupPolicyOptions: StudioSelectOption[];
  contextVisibilityOptions: StudioSelectOption[];
  streamingOptions: StudioSelectOption[];
  connectionModeOptions: StudioSelectOption[];
  renderModeOptions: StudioSelectOption[];
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
