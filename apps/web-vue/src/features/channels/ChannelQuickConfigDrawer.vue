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
            <button type="button" class="channels-drawer__close" :aria-label="text('关闭', 'Close')" @click="$emit('close')">
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </header>

          <div class="channels-drawer__body">
            <label class="option-row form-field-full">
              <input v-model="draft.enabled" class="form-checkbox" type="checkbox" />
              <div>
                <strong>{{ text('频道启用状态', 'Provider enabled') }}</strong>
                <span>{{ text('快速切换当前 provider 是否启用。', 'Quickly toggle whether the provider is enabled.') }}</span>
              </div>
            </label>

            <div class="form-grid">
              <div class="form-field">
                <label class="form-label">{{ text('默认账号', 'Default account') }}</label>
                <StudioSelect v-model="draft.defaultAccount" :options="defaultAccountOptions" :placeholder="text('未指定', 'Unset')" :teleport="false" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('默认私聊策略', 'Default DM policy') }}</label>
                <StudioSelect v-model="draft.dmPolicy" :options="dmPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" :teleport="false" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('默认群组策略', 'Default group policy') }}</label>
                <StudioSelect v-model="draft.groupPolicy" :options="groupPolicyOptions" :placeholder="text('继承默认值', 'Inherit default')" :teleport="false" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('流式响应', 'Streaming') }}</label>
                <StudioSelect v-model="draft.streaming" :options="streamingOptions" :placeholder="text('继承默认值', 'Inherit default')" :teleport="false" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('连接模式', 'Connection mode') }}</label>
                <StudioSelect v-model="draft.connectionMode" :options="connectionModeOptions" :placeholder="text('未指定', 'Unset')" :teleport="false" />
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
import { X } from '@lucide/vue';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import type { ChannelSettingsInput } from '../../../../../types/channels';
import StudioSelect, { type StudioSelectOption } from '../../shared/components/StudioSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import './channels-drawer.css';

defineOptions({ name: 'ChannelQuickConfigDrawer' });

const props = defineProps<{
  open: boolean;
  busy: boolean;
  channelType: string;
  channelLabel: string;
  initial: ChannelSettingsInput | null;
  defaultAccountOptions: StudioSelectOption[];
  dmPolicyOptions: StudioSelectOption[];
  groupPolicyOptions: StudioSelectOption[];
  streamingOptions: StudioSelectOption[];
  connectionModeOptions: StudioSelectOption[];
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
