<template>
  <article class="channels-form-panel channels-binding-editor" :class="{ 'channels-binding-editor--inline': inline }">
    <div class="channels-stage-task-head operate-stage-task-head">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
    </div>

    <div class="channels-binding-editor__summary">
      <span>{{ draft.type === 'acp' ? 'ACP' : text('普通路由', 'Standard route') }}</span>
      <span>{{ draft.accountId || text('整个渠道', 'Whole provider') }}</span>
      <span>{{ draft.agentId || text('未选择 Agent', 'Agent unset') }}</span>
    </div>

    <div class="form-grid">
      <section class="channels-binding-editor-section form-field-full">
        <div class="channels-binding-editor-section__head">
          <strong>{{ text('基础路由', 'Route target') }}</strong>
          <span>{{ text('决定由哪个 Agent 承接，以及作用到整个频道还是某个账号。', 'Choose the agent and whether the rule applies to the whole provider or one account.') }}</span>
        </div>
        <div class="channels-binding-editor-section__grid">
          <div class="form-field">
            <label class="form-label">{{ text('路由类型', 'Route type') }}</label>
            <StudioSelect v-model="draft.type" :options="bindingTypeOptions" />
          </div>
          <div class="form-field">
            <label class="form-label">Agent</label>
            <StudioSelect v-model="draft.agentId" :options="agentOptions" :placeholder="text('请选择 Agent', 'Select an agent')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('账户', 'Account') }}</label>
            <StudioSelect v-model="draft.accountId" :options="accountOptions" :placeholder="text('未指定', 'Unset')" />
          </div>
        </div>
      </section>

      <section class="channels-binding-editor-section form-field-full">
        <div class="channels-binding-editor-section__head">
          <strong>{{ text('命中条件', 'Match conditions') }}</strong>
          <span>{{ text('不填写匹配字段时，规则会按账号或频道范围泛化命中。', 'If match fields are empty, the rule matches broadly within the selected account or provider scope.') }}</span>
        </div>
        <div class="channels-binding-editor-section__grid">
          <div class="form-field">
            <label class="form-label">{{ text('匹配类型', 'Peer kind') }}</label>
            <StudioSelect v-model="draft.peerKind" :options="peerKindOptions" :placeholder="text('未指定', 'Unset')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('Peer ID', 'Peer ID') }}</label>
            <input v-model="draft.peerId" class="form-input" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('Guild ID', 'Guild ID') }}</label>
            <input v-model="draft.guildId" class="form-input" />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('匹配角色', 'Matching roles') }}</label>
            <textarea
              v-model="draft.roles"
              class="form-textarea"
              rows="3"
              :placeholder="text('用逗号或换行分隔，例如：ops, triage', 'Use commas or new lines, for example: ops, triage')"
            />
            <span class="field-hint">
              {{ text('只有匹配到这些角色时才会命中该路由。留空表示不按角色过滤。', 'Only match this route when one of these roles is present. Leave empty to avoid role filtering.') }}
            </span>
          </div>
        </div>
      </section>

      <section v-if="draft.type === 'acp'" class="channels-binding-editor-section form-field-full">
        <div class="channels-binding-editor-section__head">
          <strong>{{ text('ACP 路由', 'ACP routing') }}</strong>
          <span>{{ text('仅 ACP 类型需要填写，普通路由会忽略这些字段。', 'Only ACP routes use these fields. Standard routes ignore them.') }}</span>
        </div>
        <div class="channels-binding-editor-section__grid">
          <div class="form-field">
            <label class="form-label">{{ text('ACP 模式', 'ACP mode') }}</label>
            <input
              v-model="draft.acpMode"
              class="form-input"
              :placeholder="text('例如：persistent', 'For example: persistent')"
            />
          </div>
          <div class="form-field">
            <label class="form-label">{{ text('ACP 标签', 'ACP label') }}</label>
            <input
              v-model="draft.acpLabel"
              class="form-input"
              :placeholder="text('例如：runner', 'For example: runner')"
            />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('ACP 工作目录', 'ACP working directory') }}</label>
            <input
              v-model="draft.acpCwd"
              class="form-input"
              :placeholder="text('例如：/srv/openclaw', 'For example: /srv/openclaw')"
            />
          </div>
          <div class="form-field form-field-full">
            <label class="form-label">{{ text('ACP 后端', 'ACP backend') }}</label>
            <input
              v-model="draft.acpBackend"
              class="form-input"
              :placeholder="text('例如：acpx', 'For example: acpx')"
            />
          </div>
        </div>
      </section>

      <div class="form-field form-field-full">
        <label class="form-label">{{ text('备注', 'Comment') }}</label>
        <input v-model="draft.comment" class="form-input" />
      </div>
    </div>

    <div class="page-actions">
      <button type="button" class="secondary-button" @click="$emit('cancel')">{{ text('取消', 'Cancel') }}</button>
      <button type="button" class="primary-button" :disabled="saving" @click="$emit('save')">
        {{ saving ? text('保存中...', 'Saving...') : text('保存路由', 'Save route') }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { ChannelSelectOption } from './channel-ui';
import StudioSelect from '../../shared/components/StudioSelect.vue';
import { useLocalePreference } from '../../shared/locale';

defineOptions({ name: 'ChannelBindingEditorPanel' });

defineEmits<{
  (event: 'cancel'): void;
  (event: 'save'): void;
}>();

defineProps<{
  eyebrow: string;
  title: string;
  description: string;
  inline?: boolean;
  saving?: boolean;
  draft: {
    type: string;
    agentId: string;
    accountId: string;
    comment: string;
    peerKind: string;
    peerId: string;
    guildId: string;
    roles: string;
    acpMode: string;
    acpLabel: string;
    acpCwd: string;
    acpBackend: string;
  };
  bindingTypeOptions: ChannelSelectOption[];
  peerKindOptions: ChannelSelectOption[];
  agentOptions: ChannelSelectOption[];
  accountOptions: ChannelSelectOption[];
}>();

const { text } = useLocalePreference();
</script>
