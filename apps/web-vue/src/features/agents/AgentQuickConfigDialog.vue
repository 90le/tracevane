<template>
  <!-- AgentQuickConfigDialog -->
  <DialogRoot :open="quickConfigOpen" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="agents-quick-config-mask" />
      <DialogContent
        class="agents-quick-config-content"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @pointer-down-outside="handlePointerDownOutside"
        @interact-outside="handleInteractOutside"
      >
        <section class="agents-quick-config-dialog" role="dialog" aria-modal="true" :aria-label="text('快速配置', 'Quick Config')">
          <header class="agents-quick-config-dialog__head">
            <div>
              <p class="eyebrow">{{ text('QUICK CONFIG', 'QUICK CONFIG') }}</p>
              <h3>{{ draft.name || fallbackName || agentId }}</h3>
              <p>{{ agentId }}</p>
            </div>
            <button type="button" class="agents-quick-config-dialog__close" :aria-label="text('关闭', 'Close')" @click="$emit('close')">
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </header>

          <div class="agents-quick-config-dialog__body">
            <div class="status-banner">
              {{ text('更完整的人设、路由和运行配置都可以从当前工作区直接打开。', 'Open the full persona, routing, and runtime settings directly from this workspace when you need more context.') }}
            </div>

            <div class="page-actions">
              <button type="button" class="secondary-button compact-button" @click="$emit('open-docs')">
                {{ text('打开人设', 'Open Persona') }}
              </button>
              <button type="button" class="secondary-button compact-button" @click="$emit('open-bindings')">
                {{ text('打开路由', 'Open Routing') }}
              </button>
              <button type="button" class="secondary-button compact-button" @click="$emit('open-advanced')">
                {{ text('打开运行', 'Open Runtime') }}
              </button>
            </div>

            <div class="agents-quick-config-dialog__grid">
              <div class="form-field">
                <label class="form-label">{{ text('显示名称', 'Display Name') }}</label>
                <input v-model="draft.name" class="form-input" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('模型覆盖', 'Model Override') }}</label>
                <TracevaneSelect
                  v-model="draft.model"
                  :options="modelOptions"
                  :placeholder="text('跟随系统默认', 'Inherit system default')"
                  :teleport="false"
                />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('运行时类型', 'Runtime Type') }}</label>
                <TracevaneSelect
                  v-model="draft.runtimeType"
                  :options="runtimeTypeOptions"
                  :placeholder="text('默认运行时', 'Default runtime')"
                  :teleport="false"
                />
              </div>

              <div class="form-field form-field-full">
                <label class="form-label">{{ text('工作区路径', 'Workspace Path') }}</label>
                <input v-model="draft.workspace" class="form-input" />
              </div>

              <div class="form-field form-field-full">
                <label class="form-label">{{ text('角色', 'Role') }}</label>
                <input v-model="draft.role" class="form-input" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('Emoji', 'Emoji') }}</label>
                <input v-model="draft.emoji" class="form-input" :placeholder="text('例如 agent-mark', 'For example agent-mark')" />
              </div>

              <AvatarFieldEditor
                v-model="draft.avatar"
                class="form-field-full"
                :label="text('Avatar', 'Avatar')"
                :placeholder="text('emoji / 短文本 / 图片 URL / data URI', 'emoji / short text / image URL / data URI')"
                :preview-fallback="draft.name || fallbackName || agentId"
              />

              <div class="form-field">
                <label class="form-label">{{ text('沙盒模式', 'Sandbox Mode') }}</label>
                <TracevaneSelect v-model="draft.sandboxMode" :options="sandboxModeOptions" :teleport="false" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('工作区访问', 'Workspace Access') }}</label>
                <TracevaneSelect v-model="draft.workspaceAccess" :options="workspaceAccessOptions" :teleport="false" />
              </div>

              <div class="form-field">
                <label class="form-label">{{ text('工具配置', 'Tools Profile') }}</label>
                <TracevaneSelect v-model="draft.toolsProfile" :options="toolsProfileOptions" :teleport="false" />
              </div>

              <label class="option-row form-field-full">
                <input v-model="draft.fsWorkspaceOnly" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('仅限工作区文件访问', 'Workspace-only FS access') }}</strong>
                  <span>{{ text('高频安全边界，保留为快速入口。', 'Common safety boundary kept in the fast path.') }}</span>
                </div>
              </label>
            </div>
          </div>

          <footer class="agents-quick-config-dialog__foot">
            <button type="button" class="secondary-button" :disabled="busy" @click="$emit('close')">
              {{ text('取消', 'Cancel') }}
            </button>
            <button type="button" class="primary-button" :disabled="busy" @click="emitSave">
              {{ busy ? text('保存中...', 'Saving...') : text('保存快速配置', 'Save Quick Config') }}
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
import AvatarFieldEditor from '../../shared/components/AvatarFieldEditor.vue';
import TracevaneSelect from '../../shared/components/TracevaneSelect.vue';
import { useLocalePreference } from '../../shared/locale';

defineOptions({ name: 'AgentQuickConfigDialog' });

interface QuickConfigSeed {
  name: string;
  model: string;
  runtimeType: 'default' | 'acp';
  workspace: string;
  role: string;
  emoji: string;
  avatar: string;
  sandboxMode: string;
  workspaceAccess: string;
  toolsProfile: string;
  fsWorkspaceOnly: boolean;
}

interface QuickConfigSavePayload {
  name?: string;
  model?: string;
  runtimeType: 'default' | 'acp';
  workspace?: string;
  sandboxMode?: string;
  workspaceAccess?: string;
  toolsProfile?: string;
  fsWorkspaceOnly?: boolean;
  identity?: {
    name?: string;
    role?: string;
    emoji?: string;
    avatar?: string;
  };
}

const props = defineProps<{
  quickConfigOpen: boolean;
  busy: boolean;
  agentId: string;
  fallbackName: string;
  initial: QuickConfigSeed | null;
  modelOptions: Array<{ value: string; label: string }>;
  runtimeTypeOptions: Array<{ value: string; label: string }>;
  sandboxModeOptions: Array<{ value: string; label: string }>;
  workspaceAccessOptions: Array<{ value: string; label: string }>;
  toolsProfileOptions: Array<{ value: string; label: string }>;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'save', payload: QuickConfigSavePayload): void;
  (event: 'open-docs'): void;
  (event: 'open-bindings'): void;
  (event: 'open-advanced'): void;
}>();

const { text } = useLocalePreference();

const draft = reactive<QuickConfigSeed>({
  name: '',
  model: '',
  runtimeType: 'default',
  workspace: '',
  role: '',
  emoji: '',
  avatar: '',
  sandboxMode: 'off',
  workspaceAccess: 'rw',
  toolsProfile: 'full',
  fsWorkspaceOnly: false,
});

watch(
  () => props.initial,
  (value) => {
    draft.name = value?.name || '';
    draft.model = value?.model || '';
    draft.runtimeType = value?.runtimeType || 'default';
    draft.workspace = value?.workspace || '';
    draft.role = value?.role || '';
    draft.emoji = value?.emoji || '';
    draft.avatar = value?.avatar || '';
    draft.sandboxMode = value?.sandboxMode || 'off';
    draft.workspaceAccess = value?.workspaceAccess || 'rw';
    draft.toolsProfile = value?.toolsProfile || 'full';
    draft.fsWorkspaceOnly = value?.fsWorkspaceOnly === true;
  },
  { immediate: true },
);

function shouldIgnoreOutsideEvent(event: Event): boolean {
  const target = event.target as HTMLElement | null;
  return Boolean(target?.closest('.tracevane-select-menu-portal'));
}

function handlePointerDownOutside(event: Event): void {
  if (shouldIgnoreOutsideEvent(event)) {
    event.preventDefault();
  }
}

function handleInteractOutside(event: Event): void {
  if (shouldIgnoreOutsideEvent(event)) {
    event.preventDefault();
  }
}

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) emit('close');
}

function emitSave(): void {
  emit('save', {
    name: draft.name,
    model: draft.model,
    runtimeType: draft.runtimeType,
    workspace: draft.workspace,
    sandboxMode: draft.sandboxMode,
    workspaceAccess: draft.workspaceAccess,
    toolsProfile: draft.toolsProfile,
    fsWorkspaceOnly: draft.fsWorkspaceOnly,
    identity: {
      name: draft.name,
      role: draft.role,
      emoji: draft.emoji,
      avatar: draft.avatar,
    },
  });
}
</script>
