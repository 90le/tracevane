<template>
  <!-- ChannelQuickConfigDrawer -->
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="channels-drawer-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section class="channels-drawer" :aria-label="text('频道快捷配置', 'Provider quick config')">
          <header class="channels-drawer__head">
            <div>
              <p class="eyebrow">{{ text('QUICK CONFIG', 'QUICK CONFIG') }}</p>
              <h3>{{ channelLabel }}</h3>
              <p>{{ channelType }}</p>
            </div>
            <button type="button" class="channels-drawer__close" @click="$emit('close')">✕</button>
          </header>

          <div class="channels-drawer__body">
            <label class="toggle-card form-field-full">
              <input v-model="draft.enabled" class="form-checkbox" type="checkbox" />
              <div>
                <strong>{{ text('频道启用状态', 'Provider enabled') }}</strong>
                <span>{{ text('快速切换当前 provider 是否启用。', 'Quickly toggle whether the provider is enabled.') }}</span>
              </div>
            </label>

            <div class="form-grid">
              <div class="form-field">
                <label class="form-label">{{ text('默认账号', 'Default account') }}</label>
                <GlassSelect v-model="draft.defaultAccount" :options="defaultAccountOptions" :placeholder="text('未指定', 'Unset')" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('默认私聊策略', 'Default DM policy') }}</label>
                <GlassSelect v-model="draft.dmPolicy" :options="dmPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('默认群组策略', 'Default group policy') }}</label>
                <GlassSelect v-model="draft.groupPolicy" :options="groupPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('流式响应', 'Streaming') }}</label>
                <GlassSelect v-model="draft.streaming" :options="streamingOptions" :placeholder="text('继承默认值', 'Inherit default')" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('连接模式', 'Connection mode') }}</label>
                <GlassSelect v-model="draft.connectionMode" :options="connectionModeOptions" :placeholder="text('未指定', 'Unset')" />
              </div>
            </div>
          </div>

          <footer class="channels-drawer__foot">
            <button type="button" class="secondary-button" :disabled="busy" @click="$emit('close')">
              {{ text('取消', 'Cancel') }}
            </button>
            <button type="button" class="primary-button" :disabled="busy" @click="emitSave">
              {{ busy ? text('保存中...', 'Saving...') : text('保存快捷配置', 'Save quick config') }}
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
import type { ChannelSettingsInput } from '../../../../../types/channels';
import GlassSelect, { type GlassSelectOption } from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';

defineOptions({ name: 'ChannelQuickConfigDrawer' });

const props = defineProps<{
  open: boolean;
  busy: boolean;
  channelType: string;
  channelLabel: string;
  initial: ChannelSettingsInput | null;
  defaultAccountOptions: GlassSelectOption[];
  dmPolicyOptions: GlassSelectOption[];
  groupPolicyOptions: GlassSelectOption[];
  streamingOptions: GlassSelectOption[];
  connectionModeOptions: GlassSelectOption[];
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'save', payload: ChannelSettingsInput): void;
}>();

const { text } = useLocalePreference();

const draft = reactive<ChannelSettingsInput>({
  enabled: true,
  defaultAccount: '',
  dmPolicy: '',
  groupPolicy: '',
  streaming: '',
  connectionMode: '',
});

watch(
  () => props.initial,
  (value) => {
    draft.enabled = value?.enabled ?? true;
    draft.defaultAccount = value?.defaultAccount || '';
    draft.dmPolicy = value?.dmPolicy || '';
    draft.groupPolicy = value?.groupPolicy || '';
    draft.streaming = value?.streaming || '';
    draft.connectionMode = value?.connectionMode || '';
  },
  { immediate: true },
);

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) emit('close');
}

function emitSave(): void {
  emit('save', {
    enabled: draft.enabled,
    defaultAccount: draft.defaultAccount || null,
    dmPolicy: draft.dmPolicy || null,
    groupPolicy: draft.groupPolicy || null,
    streaming: draft.streaming || null,
    connectionMode: draft.connectionMode || null,
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
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--line);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
  z-index: 1201;
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
}

.channels-drawer__close {
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 18px;
}

.channels-drawer__body {
  overflow: auto;
  display: grid;
  gap: 16px;
}

.channels-drawer__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 920px) {
  .channels-drawer {
    inset: 10px;
    width: auto;
  }
}
</style>
