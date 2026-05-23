<template>
  <section class="page-shell config-section-grid config-section-grid-commands-hooks">
    <article class="panel-card config-sheet">
      <!-- Commands Section -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('命令配置', 'Command Settings') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('命令控制', 'Command Controls') }}</h4>
              <p>{{ text('配置原生命令、技能以及管理者显示方式。', 'Configure native commands, skills, and owner display mode.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('原生命令', 'Native Commands') }}</span>
                <GlassSelect
                  :modelValue="commands.native"
                  @update:modelValue="$emit('update:commands', { ...commands, native: $event })"
                  :options="nativeOptions"
                  :placeholder="text('选择模式', 'Select mode')"
                />
                <span class="field-hint">{{ text('作用：控制宿主内置 CLI/命令能力是否对会话开放。配置方式：大多数环境使用 `auto`，需要强限制时改为 `off`。', 'Purpose: controls whether built-in CLI/command capabilities are exposed to sessions. How to configure: most environments should keep `auto`; use `off` only when hard restrictions are required.') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('原生技能', 'Native Skills') }}</span>
                <GlassSelect
                  :modelValue="commands.nativeSkills"
                  @update:modelValue="$emit('update:commands', { ...commands, nativeSkills: $event })"
                  :options="nativeOptions"
                  :placeholder="text('选择模式', 'Select mode')"
                />
                <span class="field-hint">{{ text('作用：控制宿主自带 skills 是否参与运行。配置方式：通常保持 `auto`，需要瘦身或排障时再关闭。', 'Purpose: controls whether host-bundled skills participate at runtime. How to configure: usually keep `auto`; disable only for slimming or diagnostics.') }}</span>
              </label>
            </div>
            <div class="settings-inline-grid">
              <label class="toggle-card">
                <input
                  :checked="commands.restart"
                  @change="$emit('update:commands', { ...commands, restart: ($event.target as HTMLInputElement).checked })"
                  class="form-checkbox"
                  type="checkbox"
                />
                <div>
                  <strong>{{ text('允许重启', 'Allow Restart') }}</strong>
                  <span>{{ text('作用：允许通过命令触发 Gateway 重启。配置方式：生产环境建议仅在明确需要远程运维时开启。', 'Purpose: allows commands to trigger Gateway restarts. How to configure: enable it in production only when remote operations explicitly require it.') }}</span>
                </div>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('管理者显示', 'Owner Display') }}</span>
                <GlassSelect
                  :modelValue="commands.ownerDisplay"
                  @update:modelValue="$emit('update:commands', { ...commands, ownerDisplay: $event })"
                  :options="ownerDisplayOptions"
                  :placeholder="text('选择显示方式', 'Select display mode')"
                />
                <span class="field-hint">{{ text('作用：控制 owner/operator 身份在界面和输出里如何展示。配置方式：共享环境建议使用 `masked` 或 `hidden`。', 'Purpose: controls how owner/operator identity is shown in UI and outputs. How to configure: shared environments should usually use `masked` or `hidden`.') }}</span>
              </label>
            </div>
          </section>
        </div>
      </section>

      <!-- Hooks Section -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('钩子配置', 'Hook Settings') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('内部钩子系统', 'Internal Hook System') }}</h4>
              <p>{{ text('管理内部钩子的启用状态和各钩子的独立配置。', 'Manage the internal hook system and individual hook settings.') }}</p>
            </div>
            <div class="toggle-grid">
              <label class="toggle-card">
                <input
                  :checked="hooks.internal.enabled"
                  @change="onInternalEnabledChange(($event.target as HTMLInputElement).checked)"
                  class="form-checkbox"
                  type="checkbox"
                />
                <div>
                  <strong>{{ text('内部钩子', 'Internal Hooks') }}</strong>
                  <span>{{ text('作用：控制宿主内部 hook runtime 是否启用。配置方式：只有确认完全不需要 hook 扩展链时才整体关闭。', 'Purpose: controls whether the host internal hook runtime is enabled. How to configure: disable globally only when you are sure no hook extension chain is needed.') }}</span>
                </div>
              </label>
            </div>
          </section>

          <section v-if="hookEntryList.length" class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('钩子列表', 'Hook List') }}</h4>
              <p>{{ text('每个钩子可独立启用或禁用，部分钩子支持额外配置。', 'Each hook can be enabled or disabled independently. Some hooks support additional configuration.') }}</p>
            </div>
            <div class="provider-stack">
              <article
                v-for="entry in hookEntryList"
                :key="entry.id"
                class="provider-card provider-card-visual"
              >
                <div class="provider-card-head provider-card-head-visual">
                  <div>
                    <strong>{{ entry.id }}</strong>
                    <p class="provider-caption">{{ hookDescription(entry.id) }}</p>
                  </div>
                  <label class="toggle-inline">
                    <input
                      :checked="entry.enabled"
                      @change="onHookEntryEnabledChange(entry.id, ($event.target as HTMLInputElement).checked)"
                      class="form-checkbox"
                      type="checkbox"
                    />
                    <span>{{ entry.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</span>
                  </label>
                </div>

                <!-- session-memory specific config -->
                <div v-if="entry.id === 'session-memory'" class="settings-inline-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('记忆消息条数', 'Memory Messages') }}</span>
                    <input
                      :value="entry.messages ?? 12"
                      @input="onHookEntryFieldChange(entry.id, 'messages', Number(($event.target as HTMLInputElement).value))"
                      class="form-input"
                      type="number"
                      min="1"
                    />
                    <span class="field-hint">{{ text('作用：控制 session-memory hook 会记住最近多少条消息。配置方式：数字越大，记忆越完整，但上下文和存储负担也更高。', 'Purpose: controls how many recent messages the session-memory hook remembers. How to configure: larger values preserve more context but increase prompt and storage overhead.') }}</span>
                  </label>
                </div>

                <!-- command-logger: no extra config -->
                <div v-else-if="entry.id === 'command-logger'" class="panel-muted config-hook-no-extra">
                  {{ text('此钩子无额外配置项。', 'This hook has no additional configuration.') }}
                </div>

                <!-- Generic hooks: JSON textarea -->
                <div v-else class="settings-stack">
                  <label class="form-field">
                    <span class="form-label">{{ text('钩子配置 (JSON)', 'Hook Config (JSON)') }}</span>
                    <textarea
                      :value="hookExtraJson(entry)"
                      @input="onHookExtraJsonChange(entry.id, ($event.target as HTMLInputElement).value)"
                      class="form-textarea"
                      rows="4"
                      :placeholder="text('输入 JSON 格式的额外配置', 'Enter extra configuration in JSON format')"
                    />
                    <span class="field-hint">{{ text('作用：填写该 hook 支持的额外配置。配置方式：只写该 hook 文档声明的 JSON 字段，未知字段可能被忽略。', 'Purpose: stores extra configuration supported by this hook. How to configure: use only JSON fields documented by that hook; unknown fields may be ignored.') }}</span>
                  </label>
                </div>
              </article>
            </div>
          </section>

          <section v-else class="config-subsection">
            <div class="empty-inline">{{ text('当前没有已配置的钩子。', 'No hooks are currently configured.') }}</div>
          </section>
        </div>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import GlassSelect from '../../shared/components/GlassSelect.vue';
import type { ConfigSummaryPayload } from '../../../../../types/config';

type CommandsForm = ConfigSummaryPayload['commands'];
type HooksForm = ConfigSummaryPayload['hooks'];

interface HookEntry {
  id: string;
  enabled: boolean;
  [key: string]: unknown;
}

const props = defineProps<{
  commands: CommandsForm;
  hooks: HooksForm;
}>();

const emit = defineEmits<{
  (event: 'update:commands', value: CommandsForm): void;
  (event: 'update:hooks', value: HooksForm): void;
}>();

const { text } = useLocalePreference();

const nativeOptions = computed(() => [
  { value: 'auto', label: text('自动', 'Auto') },
  { value: 'on', label: text('开启', 'On') },
  { value: 'off', label: text('关闭', 'Off') },
]);

const ownerDisplayOptions = computed(() => [
  { value: 'raw', label: text('原始显示', 'Raw') },
  { value: 'masked', label: text('遮掩显示', 'Masked') },
  { value: 'hidden', label: text('隐藏', 'Hidden') },
]);

const hookEntryList = computed<HookEntry[]>(() => {
  const entries = props.hooks.internal.entries || {};
  return Object.entries(entries).map(([id, entry]) => ({
    id,
    ...entry,
  }));
});

function hookDescription(hookId: string): string {
  switch (hookId) {
    case 'session-memory':
      return text('会话记忆钩子，自动记忆最近的消息', 'Session memory hook, automatically remembers recent messages');
    case 'command-logger':
      return text('命令日志钩子，记录所有执行的命令', 'Command logger hook, records all executed commands');
    default:
      return text('自定义钩子', 'Custom hook');
  }
}

function hookExtraJson(entry: HookEntry): string {
  const { id, enabled, ...rest } = entry;
  try {
    return Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
  } catch {
    return '';
  }
}

function onInternalEnabledChange(enabled: boolean) {
  emit('update:hooks', {
    ...props.hooks,
    internal: {
      ...props.hooks.internal,
      enabled,
    },
  });
}

function onHookEntryEnabledChange(hookId: string, enabled: boolean) {
  const entries = { ...props.hooks.internal.entries };
  entries[hookId] = { ...entries[hookId], enabled };
  emit('update:hooks', {
    ...props.hooks,
    internal: {
      ...props.hooks.internal,
      entries,
    },
  });
}

function onHookEntryFieldChange(hookId: string, field: string, value: unknown) {
  const entries = { ...props.hooks.internal.entries };
  entries[hookId] = { ...entries[hookId], [field]: value };
  emit('update:hooks', {
    ...props.hooks,
    internal: {
      ...props.hooks.internal,
      entries,
    },
  });
}

function onHookExtraJsonChange(hookId: string, jsonStr: string) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null) return;
    const entries = { ...props.hooks.internal.entries };
    const current = entries[hookId] || { enabled: true };
    entries[hookId] = { enabled: current.enabled, ...parsed };
    emit('update:hooks', {
      ...props.hooks,
      internal: {
        ...props.hooks.internal,
        entries,
      },
    });
  } catch {
    // invalid JSON, silently ignore until user finishes editing
  }
}
</script>

<style scoped>
.config-hook-no-extra {
  padding: 0.5rem 0;
  font-size: 0.85rem;
}
.toggle-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.toggle-inline .form-checkbox {
  margin: 0;
}
</style>
