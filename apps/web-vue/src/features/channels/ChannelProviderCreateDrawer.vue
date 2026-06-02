<template>
  <!-- ChannelProviderCreateDrawer -->
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="channels-drawer-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <section class="channels-drawer create-provider-drawer" :aria-label="text('新增频道', 'Create provider')">
          <header class="channels-drawer__head">
            <div>
              <p class="eyebrow">{{ text('CREATE PROVIDER', 'CREATE PROVIDER') }}</p>
              <h3>{{ text('新增频道', 'Create provider') }}</h3>
              <p>{{ text('从支持目录中选择 provider。创建后会进入对应 provider 工作台，完整设置留在专门任务页。', 'Select a provider from the supported catalog. After creation, Studio opens its workspace; full settings stay in the focused task page.') }}</p>
            </div>
            <button type="button" class="channels-drawer__close" :aria-label="text('关闭', 'Close')" @click="$emit('close')">
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </header>

          <div class="channels-drawer__body">
            <section class="channels-drawer-section">
              <div class="channels-drawer-section__head">
                <h4>{{ text('Provider 类型', 'Provider type') }}</h4>
                <p>{{ text('这里只做最小创建。默认账号、凭据、路由和高级 JSON 会在创建后的工作台里继续处理。', 'This is the minimum creation path. Default accounts, credentials, routing, and advanced JSON continue in the created workspace.') }}</p>
              </div>

              <div v-if="options.length" class="form-grid">
                <div class="form-field form-field-full">
                  <label class="form-label">{{ text('渠道类型', 'Provider type') }}</label>
                  <StudioSelect
                    v-model="draft.type"
                    :options="options"
                    :placeholder="text('请选择渠道类型', 'Select provider type')"
                    :teleport="false"
                  />
                </div>

                <label class="option-row form-field-full">
                  <input v-model="draft.enabled" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('创建后立即启用', 'Enable after create') }}</strong>
                    <span>{{ text('适合已经准备好账号凭据的 provider；也可以先创建后在设置页关闭。', 'Use this when credentials are ready; you can also disable it later from Settings.') }}</span>
                  </div>
                </label>
              </div>

              <div v-else class="create-provider-drawer__empty">
                {{ text('所有支持的 provider 都已经创建。', 'Every supported provider has already been created.') }}
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
              :disabled="busy || !draft.type || !options.length"
              @click="emitSave"
            >
              {{ busy ? text('创建中...', 'Creating...') : text('创建频道', 'Create provider') }}
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
import StudioSelect, { type StudioSelectOption } from '../../shared/components/StudioSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import './channels-drawer.css';

defineOptions({ name: 'ChannelProviderCreateDrawer' });

const props = defineProps<{
  open: boolean;
  busy: boolean;
  options: StudioSelectOption[];
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'save', payload: { type: string; enabled: boolean }): void;
}>();

const { text } = useLocalePreference();
const draft = reactive({
  type: '',
  enabled: true,
});

function syncDraftType(): void {
  if (props.options.some((option) => option.value === draft.type)) return;
  draft.type = props.options[0]?.value || '';
}

watch(
  () => props.open,
  (value) => {
    if (!value) return;
    draft.type = '';
    draft.enabled = true;
    syncDraftType();
  },
  { immediate: true },
);

watch(
  () => props.options,
  () => {
    if (!props.open) return;
    syncDraftType();
  },
  { deep: true },
);

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) emit('close');
}

function emitSave(): void {
  if (!draft.type) return;
  emit('save', {
    type: draft.type,
    enabled: draft.enabled,
  });
}
</script>
