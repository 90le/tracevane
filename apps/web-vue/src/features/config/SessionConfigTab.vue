<template>
  <section class="page-shell config-section-grid config-section-grid-session-policy">
    <article class="panel-card config-sheet">

      <!-- 1. Global reset strategy -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('全局重置策略', 'Global Reset Strategy') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection is-primary">
            <div class="config-subsection-head">
              <h4>{{ text('会话重置模式', 'Session reset mode') }}</h4>
              <p>{{ text('控制何时自动分割会话，按天定时或按空闲超时。', 'Control when sessions are automatically split: at a fixed time daily, or after an idle timeout.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('重置模式', 'Reset mode') }}</span>
                <GlassSelect
                  :modelValue="form.sessionReset.mode"
                  @update:modelValue="form.sessionReset.mode = $event"
                  :options="resetModeOptions"
                  :placeholder="text('选择重置模式', 'Select reset mode')"
                />
                <span class="field-hint">{{ text('作用：控制会话何时自动切段。`daily` 适合按天归档，`idle` 适合长时间无消息后自动开新会话。', 'Purpose: controls when a session is automatically split. `daily` works for day-based archives, while `idle` opens a fresh session after long inactivity.') }}</span>
              </label>
              <label v-if="form.sessionReset.mode === 'daily'" class="form-field">
                <span class="form-label">{{ text('重置时刻', 'Reset hour') }}</span>
                <input v-model.number="form.sessionReset.atHour" class="form-input" type="number" min="0" max="23" />
                <span class="field-hint">{{ text('每天几点重置（本地时间，0-23）', 'Hour of day to reset (local time, 0-23)') }}</span>
              </label>
              <label v-if="form.sessionReset.mode === 'idle'" class="form-field">
                <span class="form-label">{{ text('空闲超时（分钟）', 'Idle timeout (minutes)') }}</span>
                <input v-model.number="form.sessionReset.idleMinutes" class="form-input" type="number" min="1" />
                <span class="field-hint">{{ text('空闲多少分钟后重置（必须大于 0）', 'Minutes of inactivity before session resets (must be greater than 0)') }}</span>
              </label>
            </div>
          </section>
        </div>
      </section>

      <!-- 2. Per-type overrides -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('按类型覆盖', 'Per-Type Overrides') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('按会话类型设置重置策略', 'Reset strategy by session type') }}</h4>
              <p>{{ text('为不同类型的会话设置不同的重置策略，留空表示使用全局默认。', 'Set different reset strategies for different session types. Leave empty to use global defaults.') }}</p>
            </div>
            <div class="config-reset-type-table">
              <div class="config-reset-type-header">
                <span>{{ text('类型', 'Type') }}</span>
                <span>{{ text('模式', 'Mode') }}</span>
              </div>
              <div v-for="entry in resetTypeEntries" :key="entry.key" class="config-reset-type-row">
                <span class="config-reset-type-label">{{ entry.label }}</span>
                <GlassSelect
                  :modelValue="form.sessionReset.resetByType[entry.key] || ''"
                  @update:modelValue="setResetByType(entry.key, $event)"
                  :options="resetByTypeModeOptions"
                  :placeholder="text('跟随全局', 'Follow global')"
                />
              </div>
            </div>
            <p class="field-hint">{{ text('作用：针对不同类型会话单独覆盖全局重置策略。配置方式：只给确实需要不同生命周期的类型设置覆盖。', 'Purpose: overrides the global reset strategy for specific session types. How to configure: add overrides only for types that truly need a different lifecycle.') }}</p>
          </section>
        </div>
      </section>

      <!-- 3. Per-channel overrides -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('按频道覆盖', 'Per-Channel Overrides') }}</span></h3>
          <button class="secondary-button compact-button" type="button" @click="addChannelOverride">{{ text('添加频道覆盖', 'Add channel override') }}</button>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('按频道设置重置策略', 'Reset strategy by channel') }}</h4>
              <p>{{ text('为特定频道设置独立的重置策略。', 'Set independent reset strategies for specific channels.') }}</p>
            </div>
            <div v-if="form.sessionReset.resetByChannelList.length" class="provider-model-list">
              <article
                v-for="(entry, entryIndex) in form.sessionReset.resetByChannelList"
                :key="entry.uid"
                class="provider-model-row"
              >
                <div class="provider-model-row-head">
                  <strong>{{ text('频道覆盖', 'Channel Override') }} {{ entryIndex + 1 }}</strong>
                  <button class="danger-link" type="button" @click="removeChannelOverride(entryIndex)">{{ text('移除', 'Remove') }}</button>
                </div>
                <div class="settings-inline-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('频道名', 'Channel name') }}</span>
                    <input v-model="entry.channelId" class="form-input" type="text" :placeholder="text('例如 slack, discord', 'e.g. slack, discord')" />
                    <span class="field-hint">{{ text('作用：指定要覆盖的渠道 id。配置方式：填写宿主配置里真实的 channel key，例如 `slack`、`discord`。', 'Purpose: selects which provider id should receive this override. How to configure: use the real channel key from host config, such as `slack` or `discord`.') }}</span>
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('重置模式', 'Reset mode') }}</span>
                    <GlassSelect
                      v-model="entry.mode"
                      :options="resetModeOptions"
                      :placeholder="text('选择重置模式', 'Select reset mode')"
                    />
                    <span class="field-hint">{{ text('作用：覆盖当前频道的会话切段策略。配置方式：只在某个渠道需要更短或更长会话跨度时设置。', 'Purpose: overrides the session split strategy for this channel. How to configure: use it only when one provider needs shorter or longer-lived sessions.') }}</span>
                  </label>
                </div>
              </article>
            </div>
            <div v-else class="empty-inline">{{ text('当前没有按频道的重置策略覆盖。', 'No per-channel reset overrides configured.') }}</div>
          </section>
        </div>
      </section>

      <!-- 4. DM scope -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('DM 作用域', 'DM Scope') }}</span></h3>
        </div>
        <div class="settings-stack">
          <div class="setting-block">
            <span class="form-label">{{ text('私聊会话隔离策略', 'DM session scope') }}</span>
            <div class="choice-group choice-group-tight">
              <button
                v-for="option in effectiveDmScopeOptions"
                :key="option.value"
                type="button"
                class="choice-pill"
                :class="{ active: form.session.dmScope === option.value }"
                @click="form.session.dmScope = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            <span class="field-hint">{{ text('控制私聊消息如何隔离到不同会话中。', 'Controls how DM messages are isolated into separate sessions.') }}</span>
          </div>
        </div>
      </section>

      <!-- 5. Thread bindings -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('线程绑定', 'Thread Bindings') }}</span></h3>
        </div>
        <div class="settings-stack">
          <div class="settings-inline-grid">
            <label class="toggle-card">
              <input v-model="form.session.threadBindings.enabled" class="form-checkbox" type="checkbox" />
              <div>
                <strong>{{ text('启用线程绑定', 'Enable thread bindings') }}</strong>
                <span>{{ text('从共享频道线程映射到独立会话', 'Map shared channel threads into dedicated sessions.') }}</span>
              </div>
            </label>
          </div>
          <div v-if="form.session.threadBindings.enabled" class="settings-inline-grid">
            <label class="form-field">
              <span class="form-label">{{ text('线程空闲小时', 'Thread idle hours') }}</span>
              <input v-model.number="form.session.threadBindings.idleHours" class="form-input" type="number" min="0" />
              <span class="field-hint">{{ text('作用：线程在空闲多久后回收。配置方式：填写非负小时数。', 'Purpose: defines how long an idle thread binding stays alive. How to configure: enter a non-negative number of hours.') }}</span>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('线程最大存活小时', 'Thread max age hours') }}</span>
              <input v-model.number="form.session.threadBindings.maxAgeHours" class="form-input" type="number" min="0" />
              <span class="field-hint">{{ text('作用：即使线程持续活跃，到达这个时长后也强制轮换。配置方式：0 表示不加额外上限。', 'Purpose: forces a thread binding to rotate after this age even if still active. How to configure: use 0 for no extra cap.') }}</span>
            </label>
          </div>
        </div>
      </section>

      <!-- Summary -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('当前行为摘要', 'Current behavior summary') }}</span></h3>
        </div>
        <div class="config-fact-list">
          <div class="config-fact">
            <span>{{ text('重置模式', 'Reset mode') }}</span>
            <strong>{{ form.sessionReset.mode }}</strong>
          </div>
          <div class="config-fact" v-if="form.sessionReset.mode === 'daily'">
            <span>{{ text('重置时刻', 'Reset hour') }}</span>
            <strong>{{ form.sessionReset.atHour }}:00</strong>
          </div>
          <div class="config-fact" v-if="form.sessionReset.mode === 'idle'">
            <span>{{ text('空闲超时', 'Idle timeout') }}</span>
            <strong>{{ `${form.sessionReset.idleMinutes} ${text('分钟', 'min')}` }}</strong>
          </div>
          <div class="config-fact">
            <span>{{ text('DM 作用域', 'DM scope') }}</span>
            <strong>{{ form.session.dmScope }}</strong>
          </div>
          <div class="config-fact">
            <span>{{ text('线程绑定', 'Thread bindings') }}</span>
            <strong>{{ form.session.threadBindings.enabled ? text('已启用', 'Enabled') : text('未启用', 'Disabled') }}</strong>
          </div>
        </div>
      </section>

    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import GlassSelect, { type GlassSelectOption } from '../../shared/components/GlassSelect.vue';
import { createUuid } from '../../shared/uuid';

interface ChoiceOption {
  value: string;
  label: string;
  note?: string;
}

export interface SessionResetFormState {
  mode: string;
  atHour: number;
  idleMinutes: number;
  resetByType: Record<string, string>;
  resetByChannelList: Array<{
    uid: string;
    channelId: string;
    mode: string;
  }>;
}

export interface SessionFormState {
  dmScope: string;
  threadBindings: {
    enabled: boolean;
    idleHours: number;
    maxAgeHours: number;
  };
}

const props = defineProps<{
  form: {
    sessionReset: SessionResetFormState;
    session: SessionFormState;
  };
  dmScopeOptions: ChoiceOption[];
}>();

const { text } = useLocalePreference();

const resetModeOptions = computed<GlassSelectOption[]>(() => [
  { value: 'daily', label: text('按天重置', 'Daily reset') },
  { value: 'idle', label: text('空闲超时', 'Idle timeout') },
]);

const resetByTypeModeOptions = computed<GlassSelectOption[]>(() => [
  { value: '', label: text('跟随全局', 'Follow global') },
  { value: 'daily', label: text('按天重置', 'Daily reset') },
  { value: 'idle', label: text('空闲超时', 'Idle timeout') },
]);

const resetTypeEntries = computed(() => [
  { key: 'direct', label: text('私聊 (direct)', 'Direct (DM)') },
  { key: 'group', label: text('群组 (group)', 'Group') },
  { key: 'thread', label: text('线程 (thread)', 'Thread') },
]);

function withCurrentOption(options: ChoiceOption[], current: string): ChoiceOption[] {
  if (!current || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: text(`${current}（当前）`, `${current} (Current)`) }];
}

const effectiveDmScopeOptions = computed(() => withCurrentOption(props.dmScopeOptions, props.form.session.dmScope));

function setResetByType(key: string, value: string) {
  if (value) {
    props.form.sessionReset.resetByType[key] = value;
  } else {
    delete props.form.sessionReset.resetByType[key];
  }
}

function addChannelOverride() {
  props.form.sessionReset.resetByChannelList.push({
    uid: createUuid('session'),
    channelId: '',
    mode: props.form.sessionReset.mode || 'idle',
  });
}

function removeChannelOverride(index: number) {
  props.form.sessionReset.resetByChannelList.splice(index, 1);
}
</script>

<style scoped>
.config-reset-type-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  overflow: hidden;
}
.config-reset-type-header {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 12px;
  padding: 8px 12px;
  background: var(--surface-muted, rgba(255,255,255,0.03));
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}
.config-reset-type-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.config-reset-type-row:last-child {
  border-bottom: none;
}
.config-reset-type-label {
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
