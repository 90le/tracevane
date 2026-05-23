<template>
  <section class="page-shell skills-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">{{ pageEyebrow }}</p>
        <h2 class="page-title">{{ pageTitle }}</h2>
        <p class="page-copy">{{ pageCopy }}</p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="summaryLoading" @click="refreshSummary">
          {{ text('刷新状态', 'Refresh state') }}
        </button>
      </div>
    </header>

    <div class="skills-mode-switch" role="tablist" :aria-label="text('技能视图切换', 'Skills mode switch')">
      <button
        type="button"
        class="skills-mode-button"
        :class="{ active: mode === 'installed' }"
        @click="mode = 'installed'"
      >
        <span class="skills-mode-icon" aria-hidden="true">
          <component :is="modeIconInstalled" :size="18" :stroke-width="1.8" />
        </span>
        <span>
          <strong>{{ text('已安装技能', 'Installed Skills') }}</strong>
          <span>{{ text('只关注本地技能、依赖缺口和维护动作', 'Focus on local skills, dependency gaps, and maintenance') }}</span>
        </span>
      </button>

      <button
        type="button"
        class="skills-mode-button"
        :class="{ active: mode === 'marketplace' }"
        @click="mode = 'marketplace'"
      >
        <span class="skills-mode-icon" aria-hidden="true">
          <component :is="modeIconMarketplace" :size="18" :stroke-width="1.8" />
        </span>
        <span>
          <strong>{{ text('技能市场', 'Marketplace') }}</strong>
          <span>{{ text('市场浏览、风险预检和安装都在一个面板里完成', 'Browse, preflight, and install from one panel') }}</span>
        </span>
      </button>

      <button
        type="button"
        class="skills-mode-button"
        :class="{ active: mode === 'local-install' }"
        @click="mode = 'local-install'"
      >
        <span class="skills-mode-icon" aria-hidden="true">
          <component :is="modeIconLocalInstall" :size="18" :stroke-width="1.8" />
        </span>
        <span>
          <strong>{{ text('本地安装', 'Local Install') }}</strong>
          <span>{{ text('上传压缩包、结构检测、选择安装目标', 'Upload archive, validate structure, choose target') }}</span>
        </span>
      </button>

    </div>

    <div v-if="summaryError" class="status-banner status-banner-error">
      {{ summaryError }}
    </div>

    <div v-if="noticeMessage" class="status-banner" :class="noticeMessage.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ noticeMessage.text }}
    </div>

    <template v-if="mode === 'installed'">
      <section class="skills-board">
        <div class="skills-board-head">
          <div>
            <h3>{{ installedHeadline }}</h3>
            <p>
              {{
                summary
                  ? text(`当前共 ${summary.counts.total} 个技能，其中 ${summary.counts.ready} 个可直接使用。`, `There are ${summary.counts.total} skills, with ${summary.counts.ready} currently ready.`)
                  : installedCopy
              }}
            </p>
          </div>

          <div class="skills-inline-stats" v-if="summary">
            <span>{{ text('可直接用', 'Ready') }} {{ summary.counts.ready }}</span>
            <span>{{ text('待补依赖', 'Needs setup') }} {{ summary.counts.needsSetup }}</span>
            <span>{{ text('已关闭', 'Disabled') }} {{ summary.counts.disabled }}</span>
          </div>
        </div>

        <div class="skills-toolbar-grid">
          <label class="form-field">
            <span class="form-label">{{ text('搜索本地技能', 'Search local skills') }}</span>
            <input
              v-model="installedSearch"
              class="form-input"
              type="search"
              :placeholder="text('按名称、描述、环境变量搜索', 'Search by name, description, or env var')"
            />
          </label>

          <label class="form-field">
            <span class="form-label">{{ text('筛选集合', 'Filter set') }}</span>
            <GlassSelect
              v-model="installedFilter"
              :options="installedFilterOptions"
              :placeholder="text('请选择筛选', 'Select filter')"
            />
          </label>
        </div>

        <div class="skills-table">
          <div class="skills-table-head">
            <span>{{ text('技能', 'Skill') }}</span>
            <span>{{ text('状态', 'Status') }}</span>
            <span>{{ text('来源', 'Source') }}</span>
            <span>{{ text('缺口', 'Gaps') }}</span>
            <span>{{ text('操作', 'Action') }}</span>
          </div>

          <div class="skills-table-body">
            <div v-if="summaryLoading && !summary" class="skills-empty-state">
              {{ text('正在读取技能状态…', 'Loading skills...') }}
            </div>

            <div v-else-if="filteredInstalledSkills.length === 0" class="skills-empty-state">
              {{ text('当前没有匹配的技能。', 'No matching installed skills.') }}
            </div>

            <button
              v-for="skill in filteredInstalledSkills"
              :key="skill.slug"
              type="button"
              class="skills-table-row"
              :class="{ active: skill.slug === selectedSkillSlug }"
              @click="selectInstalledSkill(skill.slug)"
            >
              <span class="skills-table-main">
                <strong>{{ skill.name }}</strong>
                <em>{{ summarize(skill.description) }}</em>
              </span>

              <span>
                <span class="status-pill" :class="skillTone(skill.status)">
                  <span class="status-pill-dot"></span>
                  <span>{{ skillStatusLabel(skill.status) }}</span>
                </span>
              </span>

              <span class="skills-table-subtle">{{ sourceCategoryLabel(skill.sourceCategory) }}</span>
              <span class="skills-table-subtle">{{ skillGapCount(skill) }}</span>

              <span class="skills-table-action">
                <label class="skills-inline-toggle" @click.stop>
                  <input
                    type="checkbox"
                    :checked="skill.enabled"
                    @change="toggleInstalledSkillState(skill.slug, !skill.enabled)"
                  />
                  <span>{{ skill.enabled ? text('启用', 'On') : text('关闭', 'Off') }}</span>
                </label>
              </span>
            </button>
          </div>
        </div>
      </section>

      <div v-if="installedDrawerOpen && selectedSkillSummary" class="skills-drawer-mask" @click="closeInstalledDrawer"></div>

      <aside v-if="installedDrawerOpen && selectedSkillSummary" class="skills-drawer">
        <div class="skills-drawer-head">
          <div>
            <h3>{{ selectedSkillSummary.name }}</h3>
            <p>{{ selectedSkillSummary.slug }}</p>
          </div>

          <button type="button" class="skills-drawer-close" :aria-label="text('关闭', 'Close')" @click="closeInstalledDrawer">
            <X class="drawer-close-icon" aria-hidden="true" />
          </button>
        </div>

        <div class="skills-inline-stats">
          <span>{{ sourceCategoryLabel(selectedSkillSummary.sourceCategory) }}</span>
          <span v-if="selectedSkillSummary.primaryEnv">{{ text('主环境变量', 'Primary env') }} · {{ selectedSkillSummary.primaryEnv }}</span>
          <span v-if="selectedSkillSummary.installMetadata?.version">v{{ selectedSkillSummary.installMetadata.version }}</span>
        </div>

        <div class="skills-detail-tabs">
          <button
            v-for="tab in installedDetailTabs"
            :key="tab.value"
            type="button"
            class="skills-detail-tab"
            :class="{ active: installedDetailTab === tab.value }"
            @click="installedDetailTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="skills-drawer-body">
          <section v-if="installedDetailTab === 'overview'" class="skills-detail-panel">
            <div class="skills-facts-grid">
              <div class="skills-fact">
                <span>{{ text('当前状态', 'Current status') }}</span>
                <strong>{{ skillStatusLabel(selectedSkillSummary.status) }}</strong>
              </div>
              <div class="skills-fact">
                <span>{{ text('解析来源', 'Resolved source') }}</span>
                <strong>{{ selectedSkillSummary.source }}</strong>
              </div>
              <div class="skills-fact">
                <span>{{ text('Workspace 路径', 'Workspace path') }}</span>
                <strong>{{ selectedSkillSummary.paths.workspacePath || text('未安装', 'Not installed') }}</strong>
              </div>
              <div class="skills-fact">
                <span>{{ text('共享路径', 'Managed path') }}</span>
                <strong>{{ selectedSkillSummary.paths.managedPath || text('未安装', 'Not installed') }}</strong>
              </div>
            </div>

            <div class="skills-section-head compact">
              <h4>{{ text('技能说明', 'Skill description') }}</h4>
              <p>{{ selectedSkillSummary.description || text('当前技能没有公开描述。', 'This skill does not expose a public description.') }}</p>
            </div>

            <div class="skills-section-head compact">
              <h4>{{ text('依赖缺口', 'Dependency gaps') }}</h4>
            </div>

            <div v-if="hasMissingRequirements(selectedSkillSummary)" class="skills-missing-grid">
              <div v-for="group in missingRequirementGroups(selectedSkillSummary)" :key="group.key" class="skills-missing-block">
                <span>{{ group.label }}</span>
                <div class="skills-missing-items">
                  <code v-for="item in group.items" :key="item">{{ item }}</code>
                </div>
              </div>
            </div>

            <div v-else class="skills-empty-inline">
              {{ text('当前没有缺失项，这个技能已经具备 ready 条件。', 'No missing requirements. This skill currently satisfies ready conditions.') }}
            </div>
          </section>

          <section v-else-if="installedDetailTab === 'agents'" class="skills-detail-panel">
            <div class="skills-section-head compact">
              <h4>{{ text('Agent 复用矩阵', 'Agent reuse matrix') }}</h4>
              <p>{{ text('这里只围绕当前技能显示每个 Agent 的来源：本地副本、共享映射、全局默认、本地分叉或未关联。', 'This panel only shows how each agent gets the current skill: local copy, shared mapping, global default, detached fork, or not linked.') }}</p>
            </div>

            <div v-if="agentSkillMatrixRows.length" class="skills-agent-matrix-grid">
              <article v-for="row in agentSkillMatrixRows" :key="row.agentId" class="skills-agent-matrix-card">
                <div>
                  <strong>{{ row.agentName }}</strong>
                  <span>{{ row.agentId }}</span>
                </div>
                <span class="skills-mini-chip">{{ row.statusLabel }}</span>
                <code>{{ row.path || row.sourcePath || text('未关联', 'Not linked') }}</code>
                <div class="skills-agent-matrix-actions">
                  <button type="button" class="secondary-button compact-button" :disabled="lifecycleRunning || row.hasMapping" @click.stop="requestSkillLifecycleForAgent('map', row.agentId)">
                    {{ text('映射', 'Map') }}
                  </button>
                  <button type="button" class="secondary-button compact-button" :disabled="lifecycleRunning || !row.canUnmap" @click.stop="requestSkillLifecycleForAgent('unmap', row.agentId)">
                    {{ text('取消映射', 'Unmap') }}
                  </button>
                  <button type="button" class="secondary-button compact-button" :disabled="lifecycleRunning || row.hasLocalCopy || !canMaintainSkill(selectedSkillSummary)" @click.stop="requestSkillLifecycleForAgent('copy', row.agentId)">
                    {{ text('复制', 'Copy') }}
                  </button>
                </div>
              </article>
            </div>

            <div v-else class="skills-empty-inline">
              {{ text('当前没有可用 Agent 目标。', 'No agent targets are available.') }}
            </div>
          </section>

          <section v-else-if="installedDetailTab === 'config'" class="skills-detail-panel">
            <div v-if="loadingSkillConfig" class="skills-empty-state">
              {{ text('正在读取技能配置…', 'Loading skill configuration...') }}
            </div>

            <template v-else-if="selectedSkillEditor">
              <div class="skills-form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('技能启用状态', 'Skill enabled') }}</span>
                  <label class="skills-checkbox-row">
                    <input v-model="selectedSkillEditor.enabled" type="checkbox" />
                    <span>
                      {{
                        selectedSkillEditor.enabled
                          ? text('开启后，新会话允许加载该技能。', 'When enabled, new sessions may load this skill.')
                          : text('关闭后，新会话不再加载该技能。', 'When disabled, new sessions stop loading this skill.')
                      }}
                    </span>
                  </label>
                </label>

                <div class="form-field">
                  <span class="form-label">{{ text('主环境变量', 'Primary environment variable') }}</span>
                  <div class="skills-fact-line">
                    <strong>{{ selectedSkillSummary.primaryEnv || text('未声明', 'Not declared') }}</strong>
                    <span>{{ text('来自 metadata.openclaw.primaryEnv', 'Derived from metadata.openclaw.primaryEnv') }}</span>
                  </div>
                </div>

                <div class="form-field form-field-full">
                  <span class="form-label">{{ text('主密钥 / API Key', 'Primary API key') }}</span>
                  <div class="credential-input-row">
                    <input
                      class="form-input"
                      :readonly="!selectedSkillEditor.secretVisible && selectedSkillEditor.hasApiKey"
                      :value="apiKeyInputValue"
                      :placeholder="apiKeyPlaceholder"
                      @input="updateApiKey(($event.target as HTMLInputElement).value)"
                    />

                    <button
                      type="button"
                      class="credential-toggle"
                      :disabled="selectedSkillEditor.apiKeyMode === 'secret-ref' || revealingSecret"
                      @click="toggleApiKeyVisibility"
                    >
                      {{
                        selectedSkillEditor.secretVisible
                          ? text('隐藏', 'Hide')
                          : selectedSkillEditor.hasApiKey
                            ? text('显示', 'Reveal')
                            : text('录入', 'Edit')
                      }}
                    </button>
                  </div>

                  <p class="field-hint">
                    <template v-if="selectedSkillEditor.apiKeyMode === 'secret-ref' && selectedSkillEditor.apiKeySecretRefLabel">
                      {{ text('当前配置使用 SecretRef：', 'Current config uses SecretRef:') }} {{ selectedSkillEditor.apiKeySecretRefLabel }}
                    </template>
                    <template v-else>
                      {{
                        text(
                          '已配置密钥默认遮掩显示；只有点“显示”才会按需读取真实值。',
                          'Configured keys stay masked by default; the real value is loaded only when you explicitly reveal it.'
                        )
                      }}
                    </template>
                  </p>
                </div>
              </div>

              <div class="skills-section-head compact">
                <h4>{{ text('环境变量注入', 'Environment injection') }}</h4>
                <p>{{ text('这些变量只会注入当前技能关联的宿主 agent run。', 'These variables are injected only for host-side agent runs related to this skill.') }}</p>
              </div>

              <div v-if="selectedSkillEditor.envEntries.length === 0" class="skills-empty-inline">
                {{ text('当前没有自定义环境变量。', 'No custom environment variables yet.') }}
              </div>

              <div v-else class="skills-kv-list">
                <div v-for="entry in selectedSkillEditor.envEntries" :key="entry.id" class="skills-kv-row">
                  <input
                    v-model="entry.key"
                    class="form-input"
                    type="text"
                    :placeholder="text('变量名', 'Variable name')"
                  />
                  <input
                    v-model="entry.value"
                    class="form-input"
                    type="text"
                    :placeholder="text('变量值', 'Variable value')"
                  />
                  <button type="button" class="secondary-button skills-remove-button" @click="removeEnvEntry(entry.id)">
                    {{ text('删除', 'Remove') }}
                  </button>
                </div>
              </div>

              <div class="skills-section-actions">
                <button type="button" class="secondary-button" @click="addEnvEntry">
                  {{ text('新增环境变量', 'Add environment variable') }}
                </button>
              </div>

              <div class="skills-section-head compact">
                <h4>{{ text('结构化配置字段', 'Structured config fields') }}</h4>
                <p>{{ text('OpenClaw 没有统一的技能 config schema，这里用“字段名 + 类型 + 值”的方式做结构化编辑，避免直接手改 JSON。', 'OpenClaw does not expose a universal per-skill config schema, so Studio uses a typed field editor instead of raw JSON editing.') }}</p>
              </div>

              <div v-if="selectedSkillEditor.configFields.length === 0" class="skills-empty-inline">
                {{ text('当前没有自定义 config 字段。', 'No custom config fields yet.') }}
              </div>

              <div v-else class="skills-config-fields">
                <div v-for="field in selectedSkillEditor.configFields" :key="field.id" class="skills-config-row">
                  <input
                    v-model="field.key"
                    class="form-input"
                    type="text"
                    :placeholder="text('字段名，例如 endpoint', 'Field key, e.g. endpoint')"
                  />

                  <GlassSelect
                    v-model="field.type"
                    :options="configFieldTypeOptions"
                    :placeholder="text('字段类型', 'Field type')"
                  />

                  <template v-if="field.type === 'boolean'">
                    <div class="skills-boolean-editor">
                      <button
                        type="button"
                        class="choice-pill"
                        :class="{ active: field.value === 'true' }"
                        @click="field.value = 'true'"
                      >
                        {{ text('是', 'True') }}
                      </button>
                      <button
                        type="button"
                        class="choice-pill"
                        :class="{ active: field.value === 'false' }"
                        @click="field.value = 'false'"
                      >
                        {{ text('否', 'False') }}
                      </button>
                    </div>
                  </template>

                  <template v-else>
                    <textarea
                      v-if="field.type === 'json'"
                      v-model="field.value"
                      class="form-textarea skills-json-field"
                      rows="4"
                      spellcheck="false"
                    ></textarea>
                    <input
                      v-else
                      v-model="field.value"
                      class="form-input"
                      type="text"
                      :placeholder="field.type === 'number' ? text('数字值', 'Numeric value') : text('字段值', 'Field value')"
                    />
                  </template>

                  <button type="button" class="secondary-button skills-remove-button" @click="removeConfigField(field.id)">
                    {{ text('删除', 'Remove') }}
                  </button>

                  <p v-if="configFieldError(field)" class="skills-inline-error">
                    {{ configFieldError(field) }}
                  </p>
                </div>
              </div>

              <div class="skills-section-actions">
                <button type="button" class="secondary-button" @click="addConfigField">
                  {{ text('新增配置字段', 'Add config field') }}
                </button>

                <button
                  type="button"
                  class="primary-button"
                  :disabled="savingConfig || Boolean(configFieldsError)"
                  @click="saveInstalledSkillConfig"
                >
                  {{ savingConfig ? text('保存中…', 'Saving...') : text('保存技能配置', 'Save skill config') }}
                </button>
              </div>

              <p v-if="configFieldsError" class="skills-inline-error">{{ configFieldsError }}</p>
            </template>
          </section>

          <section v-else class="skills-detail-panel">
            <div class="skills-maintenance-grid">
              <div class="skills-fact">
                <span>{{ text('更新来源', 'Update source') }}</span>
                <div class="skills-choice-row">
                  <button
                    v-for="source in marketSources"
                    :key="source.id"
                    type="button"
                    class="choice-pill"
                    :class="{ active: maintenanceSourceId === source.id }"
                    @click="maintenanceSourceId = source.id"
                  >
                    {{ marketplaceSourceLabel(source.id) }}
                  </button>
                </div>
              </div>

              <div class="skills-fact">
                <span>{{ text('当前本地位置', 'Current local path') }}</span>
                <strong>{{ selectedSkillSummary.paths.activePath || text('无本地副本', 'No local copy') }}</strong>
              </div>
            </div>

            <div class="skills-section-head compact">
              <h4>{{ text('生命周期操作', 'Lifecycle actions') }}</h4>
              <p>{{ text('删除、复制、移动、提升到共享目录，或把共享技能映射给其它 Agent 复用。', 'Delete, copy, move, promote to shared, or map shared skills to agents for reuse.') }}</p>
            </div>

            <div class="skills-maintenance-grid">
              <label class="form-field">
                <span class="form-label">{{ text('目标位置 / Agent', 'Target location / Agent') }}</span>
                <GlassSelect
                  v-model="lifecycleTargetId"
                  :options="skillTargetOptions"
                  :placeholder="text('选择目标', 'Select target')"
                />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('安装为', 'Install as') }}</span>
                <input
                  v-model="lifecycleInstallAs"
                  class="form-input"
                  :placeholder="selectedSkillSummary.slug"
                />
              </label>
            </div>

            <div class="skills-maintenance-actions">
              <button type="button" class="secondary-button" :disabled="lifecycleRunning || !canMaintainSkill(selectedSkillSummary)" @click="requestSkillLifecycleAction('copy')">
                {{ text('复制到目标', 'Copy to target') }}
              </button>
              <button type="button" class="secondary-button" :disabled="lifecycleRunning || !canMaintainSkill(selectedSkillSummary)" @click="requestSkillLifecycleAction('move')">
                {{ text('移动到目标', 'Move to target') }}
              </button>
              <button type="button" class="secondary-button" :disabled="lifecycleRunning || !canMaintainSkill(selectedSkillSummary)" @click="requestSkillLifecycleAction('promote')">
                {{ text('提升到共享', 'Promote shared') }}
              </button>
              <button type="button" class="secondary-button" :disabled="lifecycleRunning || !selectedLifecycleTarget?.agentId" @click="requestSkillLifecycleAction('map')">
                {{ text('映射给 Agent', 'Map to agent') }}
              </button>
              <button type="button" class="secondary-button" :disabled="lifecycleRunning" @click="requestSkillLifecycleAction('sync')">
                {{ text('同步映射', 'Sync mappings') }}
              </button>
              <button type="button" class="danger-link" :disabled="lifecycleRunning || !canMaintainSkill(selectedSkillSummary)" @click="requestSkillLifecycleAction('delete')">
                {{ text('删除当前副本', 'Delete copy') }}
              </button>
            </div>

            <div class="skills-maintenance-actions">
              <button
                type="button"
                class="primary-button"
                :disabled="maintenanceRunning === 'update' || !canMaintainSkill(selectedSkillSummary)"
                @click="requestUpdateInstalledSkillVersion"
              >
                {{
                  maintenanceRunning === 'update'
                    ? text('更新中…', 'Updating...')
                    : text('从选定市场源更新', 'Update from selected source')
                }}
              </button>

              <button
                type="button"
                class="secondary-button"
                :disabled="maintenanceRunning === 'uninstall' || !canMaintainSkill(selectedSkillSummary)"
                @click="requestRemoveInstalledSkill"
              >
                {{
                  maintenanceRunning === 'uninstall'
                    ? text('卸载中…', 'Removing...')
                    : text('卸载本地技能', 'Uninstall local skill')
                }}
              </button>
            </div>

            <p class="field-hint">
              {{
                text(
                  '更新和卸载只针对本地副本，不影响 OpenClaw 内置 bundled 技能；执行后建议开启新会话。',
                  'Update and uninstall apply only to local copies, not bundled OpenClaw skills; start a new session after the action.'
                )
              }}
            </p>
          </section>
        </div>
      </aside>
    </template>

    <template v-else-if="mode === 'marketplace'">
      <section class="skills-board">
        <div class="skills-board-head">
          <div>
            <h3>{{ marketplaceHeadline }}</h3>
            <p>{{ marketplaceCopy }}</p>
          </div>

          <div class="skills-inline-stats" v-if="marketplace">
            <span>{{ text('结果', 'Results') }} {{ filteredMarketItems.length }}</span>
            <span>{{ text('来源', 'Source') }} {{ marketplaceSourceLabel(marketSourceId) }}</span>
          </div>
        </div>

        <div class="skills-toolbar-grid market">
          <label class="form-field">
            <span class="form-label">{{ text('市场源', 'Source') }}</span>
            <div class="skills-choice-row">
              <button
                v-for="source in marketSources"
                :key="source.id"
                type="button"
                class="choice-pill"
                :class="{ active: marketSourceId === source.id }"
                @click="selectMarketplaceSource(source.id)"
              >
                {{ marketplaceSourceLabel(source.id) }}
              </button>
            </div>
          </label>

          <label class="form-field">
            <span class="form-label">{{ text('搜索市场', 'Search marketplace') }}</span>
            <input
              v-model="marketSearch"
              class="form-input"
              type="search"
              :placeholder="text('按技能名或用途搜索', 'Search by skill name or use case')"
            />
          </label>

          <label class="form-field">
            <span class="form-label">{{ text('排序', 'Sort') }}</span>
            <GlassSelect
              v-model="marketSort"
              :options="marketSortOptions"
              :placeholder="text('请选择排序', 'Select sort order')"
            />
          </label>

          <label class="form-field">
            <span class="form-label">{{ text('分类筛选', 'Category filter') }}</span>
            <GlassSelect
              v-model="marketCategory"
              :options="marketCategoryOptions"
              :placeholder="text('全部分类', 'All categories')"
            />
          </label>
        </div>

        <div class="skills-toolbar-subrow">
          <div class="form-field form-field-full">
            <span class="form-label">{{ text('快捷筛选', 'Quick filters') }}</span>
            <div class="skills-choice-row">
              <button
                v-for="filter in marketQuickFilters"
                :key="filter.value"
                type="button"
                class="choice-pill"
                :class="{ active: marketQuickFilter === filter.value }"
                @click="marketQuickFilter = filter.value"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="skills-table">
          <div class="skills-table-head">
            <span>{{ text('技能', 'Skill') }}</span>
            <span>{{ text('版本', 'Version') }}</span>
            <span>{{ text('指标', 'Metrics') }}</span>
            <span>{{ text('来源', 'Source') }}</span>
            <span>{{ text('状态', 'State') }}</span>
          </div>

          <div class="skills-table-body">
            <div v-if="marketLoading && !marketplace" class="skills-empty-state">
              {{ text('正在读取市场数据…', 'Loading marketplace data...') }}
            </div>

            <div v-else-if="marketplaceError" class="skills-empty-state">
              {{ marketplaceError }}
            </div>

            <div v-else-if="filteredMarketItems.length === 0" class="skills-empty-state">
              {{ text('当前没有匹配的市场技能。', 'No matching marketplace skills.') }}
            </div>

            <button
              v-for="item in filteredMarketItems"
              :key="`${item.sourceId}:${item.slug}`"
              type="button"
              class="skills-table-row"
              :class="{ active: item.slug === selectedMarketSlug }"
              @click="selectMarketSkill(item.slug)"
            >
              <span class="skills-table-main">
                <strong>{{ item.name }}</strong>
                <em>{{ summarize(item.summary) }}</em>
              </span>
              <span class="skills-table-subtle">{{ item.version ? `v${item.version}` : text('无', 'None') }}</span>
              <span class="skills-table-subtle">{{ marketMetricsLabel(item) }}</span>
              <span class="skills-table-subtle">{{ marketplaceSourceLabel(item.sourceId) }}</span>
              <span class="skills-table-subtle">{{ item.installed ? text('已安装', 'Installed') : text('未安装', 'Not installed') }}</span>
            </button>
          </div>
        </div>
      </section>

      <div v-if="marketDrawerOpen && selectedMarketItem" class="skills-drawer-mask" @click="closeMarketDrawer"></div>

      <aside v-if="marketDrawerOpen && selectedMarketItem" class="skills-drawer">
        <div class="skills-drawer-head">
          <div>
            <h3>{{ selectedMarketItem.name }}</h3>
            <p>{{ selectedMarketItem.slug }}</p>
          </div>

          <button type="button" class="skills-drawer-close" :aria-label="text('关闭', 'Close')" @click="closeMarketDrawer">
            <X class="drawer-close-icon" aria-hidden="true" />
          </button>
        </div>

        <div class="skills-inline-stats">
          <span v-if="selectedMarketItem.category">{{ marketCategoryLabel(selectedMarketItem.category) }}</span>
          <span>{{ marketplaceSourceLabel(selectedMarketItem.sourceId) }}</span>
          <span v-if="selectedMarketItem.version">v{{ selectedMarketItem.version }}</span>
        </div>

        <div class="skills-detail-tabs">
          <button
            v-for="tab in marketDetailTabs"
            :key="tab.value"
            type="button"
            class="skills-detail-tab"
            :class="{ active: marketDetailTab === tab.value }"
            @click="marketDetailTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="skills-drawer-body">
          <section v-if="marketDetailTab === 'overview'" class="skills-detail-panel">
            <div class="skills-section-head compact">
              <h4>{{ text('市场说明', 'Marketplace summary') }}</h4>
              <p>{{ selectedMarketItem.summary }}</p>
            </div>

            <div class="skills-facts-grid">
              <div class="skills-fact">
                <span>{{ text('作者', 'Author') }}</span>
                <strong>{{ selectedMarketItem.ownerName || text('未知', 'Unknown') }}</strong>
              </div>
              <div class="skills-fact">
                <span>{{ text('下载量', 'Downloads') }}</span>
                <strong>{{ formatMaybeCount(selectedMarketItem.downloads) }}</strong>
              </div>
              <div class="skills-fact">
                <span>{{ text('收藏数', 'Stars') }}</span>
                <strong>{{ formatMaybeCount(selectedMarketItem.stars) }}</strong>
              </div>
              <div class="skills-fact">
                <span>{{ text('安装量', 'Installs') }}</span>
                <strong>{{ formatMaybeCount(selectedMarketItem.installs) }}</strong>
              </div>
            </div>

            <div v-if="selectedMarketItem.tags.length" class="skills-choice-row">
              <span v-for="tag in selectedMarketItem.tags" :key="tag" class="skills-mini-chip">{{ tag }}</span>
            </div>
          </section>

          <section v-else-if="marketDetailTab === 'preflight'" class="skills-detail-panel">
            <div class="skills-section-head compact">
              <h4>{{ text('安装前风险预检', 'Pre-install risk preflight') }}</h4>
              <p>{{ text('预检会下载技能包并做静态扫描：依赖、外链、危险命令模式都会在这里提示。', 'Preflight downloads the bundle and performs a static scan for dependencies, external links, and risky command patterns.') }}</p>
            </div>

            <div class="skills-section-actions">
              <button
                type="button"
                class="secondary-button"
                :disabled="preflightLoading"
                @click="reloadSelectedMarketPreflight"
              >
                {{ preflightLoading ? text('预检中…', 'Scanning...') : text('重新预检', 'Run preflight again') }}
              </button>
            </div>

            <div v-if="preflightLoading && !selectedPreflight" class="skills-empty-state">
              {{ text('正在扫描技能包…', 'Scanning skill bundle...') }}
            </div>

            <div v-else-if="preflightError" class="skills-empty-state">
              {{ preflightError }}
            </div>

            <template v-else-if="selectedPreflight">
              <div class="skills-preflight-summary" :class="preflightTone(selectedPreflight.level)">
                <strong>{{ preflightLevelLabel(selectedPreflight.level) }}</strong>
                <p>{{ selectedPreflight.summary }}</p>
              </div>

              <div class="skills-facts-grid">
                <div class="skills-fact">
                  <span>{{ text('文件数', 'Files') }}</span>
                  <strong>{{ selectedPreflight.payload.fileCount }}</strong>
                </div>
                <div class="skills-fact">
                  <span>{{ text('文本文件', 'Text files') }}</span>
                  <strong>{{ selectedPreflight.payload.textFileCount }}</strong>
                </div>
                <div class="skills-fact">
                  <span>{{ text('包含 SKILL.md', 'Has SKILL.md') }}</span>
                  <strong>{{ selectedPreflight.payload.hasSkillMd ? text('是', 'Yes') : text('否', 'No') }}</strong>
                </div>
                <div class="skills-fact">
                  <span>{{ text('外部链接', 'External URLs') }}</span>
                  <strong>{{ selectedPreflight.payload.externalUrls.length }}</strong>
                </div>
              </div>

              <div v-if="groupedPreflightIndicators.length" class="skills-preflight-groups">
                <section
                  v-for="group in groupedPreflightIndicators"
                  :key="group.level"
                  class="skills-preflight-group"
                  :class="`risk-${group.level}`"
                >
                  <div class="skills-preflight-group-head">
                    <strong>{{ group.label }}</strong>
                    <span>{{ group.items.length }} {{ text('项', 'items') }}</span>
                  </div>

                  <div class="skills-preflight-list">
                    <article
                      v-for="indicator in group.items"
                      :key="`${indicator.key}:${indicator.detail}`"
                      class="skills-preflight-item"
                      :class="`risk-${indicator.severity}`"
                    >
                      <div>
                        <strong>{{ indicator.label }}</strong>
                        <p>{{ indicator.detail }}</p>
                      </div>
                      <span>{{ preflightLevelLabel(indicator.severity) }}</span>
                    </article>
                  </div>
                </section>
              </div>

              <div v-if="selectedPreflight.payload.requiredBins.length" class="skills-preflight-block">
                <div class="skills-preflight-block-head">
                  <span>{{ text('依赖命令', 'Required binaries') }}</span>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="copyList(selectedPreflight.payload.requiredBins, text('依赖清单已复制。', 'Dependency list copied.'))"
                  >
                    {{ text('复制清单', 'Copy list') }}
                  </button>
                </div>
                <div class="skills-missing-items">
                  <code v-for="item in selectedPreflight.payload.requiredBins" :key="item">{{ item }}</code>
                </div>
              </div>

              <div v-if="selectedPreflight.payload.suggestedEnv.length" class="skills-preflight-block">
                <div class="skills-preflight-block-head">
                  <span>{{ text('建议环境变量', 'Suggested environment variables') }}</span>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="copyList(selectedPreflight.payload.suggestedEnv, text('环境变量清单已复制。', 'Environment variable list copied.'))"
                  >
                    {{ text('复制清单', 'Copy list') }}
                  </button>
                </div>
                <div class="skills-missing-items">
                  <code v-for="item in selectedPreflight.payload.suggestedEnv" :key="item">{{ item }}</code>
                </div>
              </div>

              <div v-if="selectedPreflight.payload.externalUrls.length" class="skills-preflight-block">
                <div class="skills-preflight-block-head">
                  <span>{{ text('外部链接', 'External URLs') }}</span>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="copyList(selectedPreflight.payload.externalUrls, text('外部链接清单已复制。', 'External URL list copied.'))"
                  >
                    {{ text('复制清单', 'Copy list') }}
                  </button>
                </div>
                <div class="skills-missing-items">
                  <code v-for="item in selectedPreflight.payload.externalUrls" :key="item">{{ item }}</code>
                </div>
              </div>
            </template>
          </section>

          <section v-else class="skills-detail-panel">
            <div class="skills-section-head compact">
              <h4>{{ text('安装动作', 'Install action') }}</h4>
              <p>
                {{
                  selectedMarketItem.sourceId === 'skillhub-tencent'
                    ? text('优先用腾讯镜像；如果本机有 SkillHub CLI，会优先走 CLI，没有则回退到镜像下载。', 'Tencent mirror is preferred. If SkillHub CLI is installed it will be used first, otherwise Studio falls back to direct mirror download.')
                    : text('官方海外源可直装，但更容易被限流。若失败，建议切回腾讯镜像。', 'The global official source can install directly, but it is more likely to be rate-limited. Switch back to the Tencent mirror if needed.')
                }}
              </p>
            </div>

            <div class="skills-maintenance-grid">
              <div class="skills-fact">
                <span>{{ text('当前源', 'Current source') }}</span>
                <strong>{{ marketplaceSourceLabel(selectedMarketItem.sourceId) }}</strong>
              </div>
              <div class="skills-fact">
                <span>{{ text('CLI 状态', 'CLI status') }}</span>
                <strong>{{ activeMarketSource?.cliInstalled ? text('已安装', 'Installed') : text('未安装', 'Missing') }}</strong>
              </div>
            </div>

            <div class="skills-section-head compact">
              <h4>{{ text('安装目标', 'Install target') }}</h4>
              <p>{{ text('可以安装到默认 workspace、共享目录，或指定 Agent 的 workspace。', 'Install into the default workspace, shared directory, or a specific agent workspace.') }}</p>
            </div>

            <div class="skills-maintenance-grid">
              <label class="form-field">
                <span class="form-label">{{ text('目标', 'Target') }}</span>
                <GlassSelect
                  v-model="marketInstallTargetId"
                  :options="skillTargetOptions"
                  :placeholder="text('选择安装目标', 'Select install target')"
                />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('安装目录名', 'Install folder name') }}</span>
                <input
                  v-model="marketInstallAs"
                  class="form-input"
                  :placeholder="selectedMarketItem.slug"
                />
              </label>
              <label class="skills-checkbox-row form-field-full">
                <input v-model="marketReplaceExisting" type="checkbox" />
                <span>{{ text('如果目标已存在，允许替换现有技能副本。', 'Allow replacing an existing skill copy at the target.') }}</span>
              </label>
            </div>

            <div v-if="activeMarketSource && !activeMarketSource.cliInstalled" class="skills-cli-callout">
              <div class="skills-section-head compact">
                <h4>{{ text('CLI 尚未安装', 'CLI is not installed') }}</h4>
                <p>
                  {{
                    text(
                      '当前源的 CLI 未安装。Studio 仍可回退到镜像/下载安装，但如果你想长期维护、更新和搜索技能，建议先把 CLI 装好。',
                      'The current source CLI is missing. Studio can still fall back to direct download, but for search, update, and long-term maintenance you should install the CLI first.'
                    )
                  }}
                </p>
              </div>

              <div v-if="activeMarketSource.installCommand" class="skills-cli-command">
                <div class="skills-cli-command-head">
                  <span>{{ text('安装命令', 'Install command') }}</span>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="copyCommand(activeMarketSource.installCommand, text('安装命令已复制。', 'Install command copied.'))"
                  >
                    {{ text('复制', 'Copy') }}
                  </button>
                </div>
                <code>{{ activeMarketSource.installCommand }}</code>
              </div>

              <div v-if="activeMarketSource.cliOnlyCommand" class="skills-cli-command">
                <div class="skills-cli-command-head">
                  <span>{{ text('仅安装 CLI', 'CLI only') }}</span>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="copyCommand(activeMarketSource.cliOnlyCommand, text('CLI-only 命令已复制。', 'CLI-only command copied.'))"
                  >
                    {{ text('复制', 'Copy') }}
                  </button>
                </div>
                <code>{{ activeMarketSource.cliOnlyCommand }}</code>
              </div>

              <div class="skills-section-actions">
                <a
                  v-if="activeMarketSource.docsUrl"
                  class="secondary-button skills-link-button"
                  :href="activeMarketSource.docsUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ text('打开安装说明', 'Open install guide') }}
                </a>
              </div>
            </div>

            <div class="skills-maintenance-actions">
              <button
                type="button"
                class="primary-button"
                :disabled="selectedMarketItem.installed || installingSkillSlug === selectedMarketItem.slug"
                @click="requestInstallSelectedMarketSkill"
              >
                {{
                  selectedMarketItem.installed
                    ? text('已安装到本地', 'Already installed')
                    : installingSkillSlug === selectedMarketItem.slug
                      ? text('安装中…', 'Installing...')
                      : text('安装到选定目标', 'Install to selected target')
                }}
              </button>

              <a
                class="secondary-button skills-link-button"
                :href="selectedMarketItem.detailUrl"
                target="_blank"
                rel="noreferrer"
              >
                {{ text('打开外部详情', 'Open details') }}
              </a>
            </div>
          </section>
        </div>
      </aside>
    </template>

    <template v-else-if="mode === 'local-install'">
      <section class="skills-board">
        <div class="skills-board-head">
          <div>
            <h3>{{ uploadHeadline }}</h3>
            <p>{{ uploadCopy }}</p>
          </div>

          <div class="skills-inline-stats">
            <span>{{ text('默认目标', 'Default target') }} · {{ text('共享目录', 'Shared') }}</span>
            <span>{{ text('格式', 'Format') }} · .zip</span>
            <span>{{ text('校验', 'Validation') }} · SKILL.md</span>
          </div>
        </div>

        <section class="skills-upload-panel">
          <div class="skills-section-head compact">
            <h4>{{ text('上传技能压缩包', 'Upload skill archive') }}</h4>
            <p>{{ text('上传 .zip 技能包会先做结构校验：必须能定位唯一 SKILL.md，默认安装到共享目录，也可以选择其它目标。', 'Uploaded .zip archives are validated first: exactly one SKILL.md skill root is required. Default target is shared, but another target can be selected.') }}</p>
          </div>

          <div class="skills-maintenance-grid">
            <label class="form-field">
              <span class="form-label">{{ text('技能压缩包', 'Skill archive') }}</span>
              <input class="form-input" type="file" accept=".zip,application/zip" @change="handleUploadArchiveChange" />
              <span v-if="uploadFileName" class="field-hint">{{ uploadFileName }}</span>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('安装目标', 'Install target') }}</span>
              <GlassSelect
                v-model="uploadTargetId"
                :options="skillTargetOptions"
                :placeholder="text('默认共享目录', 'Default shared directory')"
              />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('安装目录名', 'Install folder name') }}</span>
              <input v-model="uploadInstallAs" class="form-input" :placeholder="uploadSuggestedSlug || text('预检后自动建议', 'Suggested after preflight')" />
            </label>
            <label class="skills-checkbox-row">
              <input v-model="uploadReplaceExisting" type="checkbox" />
              <span>{{ text('如果目标已存在，允许替换。', 'Allow replacing an existing target.') }}</span>
            </label>
          </div>

          <div class="skills-maintenance-actions">
            <button type="button" class="secondary-button" :disabled="uploadBusy || !uploadDataBase64" @click="preflightUploadedArchive">
              {{ uploadBusy ? text('检测中…', 'Checking...') : text('检测压缩包', 'Validate archive') }}
            </button>
            <button type="button" class="primary-button" :disabled="uploadBusy || !uploadPreflight" @click="installUploadedArchive">
              {{ uploadBusy ? text('安装中…', 'Installing...') : text('安装上传技能', 'Install uploaded skill') }}
            </button>
          </div>

          <div v-if="uploadPreflight" class="skills-preflight-summary" :class="preflightTone(uploadPreflight.preflight.level)">
            <strong>{{ text('检测通过', 'Validation passed') }} · {{ uploadPreflight.suggestedSlug }}</strong>
            <p>{{ uploadPreflight.preflight.summary }}</p>
          </div>
        </section>
      </section>
    </template>

    <div v-if="confirmDialog" class="skills-confirm-mask" @click="closeConfirmDialog"></div>
    <section v-if="confirmDialog" class="skills-confirm-dialog" role="dialog" aria-modal="true">
      <div class="skills-section-head compact">
        <h4>{{ confirmDialog.title }}</h4>
        <p>{{ confirmDialog.message }}</p>
      </div>

      <div v-if="confirmDialog.detail" class="skills-confirm-detail">
        {{ confirmDialog.detail }}
      </div>

      <div class="skills-section-actions">
        <button type="button" class="secondary-button" :disabled="confirmRunning" @click="closeConfirmDialog">
          {{ text('取消', 'Cancel') }}
        </button>
        <button type="button" class="primary-button" :disabled="confirmRunning" @click="executeConfirmDialog">
          {{ confirmRunning ? text('执行中…', 'Running...') : confirmDialog.confirmLabel }}
        </button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Compass, Globe2, PackageOpen, X } from '@lucide/vue';
import type {
  SkillApiKeyMode,
  SkillInstallTargetScope,
  SkillSummary,
  SkillTargetDescriptor,
  SkillTargetRef,
  SkillsLifecycleAction,
  SkillsLifecyclePayload,
  SkillsMarketplaceItem,
  SkillsMarketplacePayload,
  SkillsMarketplaceSort,
  SkillsMarketplaceSource,
  SkillsMarketplaceSourceId,
  SkillsMaintenanceResponse,
  SkillsPreflightResult,
  SkillsRiskLevel,
  SkillsSummaryPayload,
  SkillsUploadPreflightResult,
} from '../../../../../types/skills';
import GlassSelect, { type GlassSelectOption } from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  fetchMarketplaceSkills,
  fetchMarketplaceSources,
  fetchSkillConfig,
  fetchSkillSecret,
  fetchSkillTargets,
  fetchSkillsSummary,
  installUploadedSkillArchive,
  installMarketplaceSkill,
  preflightMarketplaceSkill,
  preflightUploadedSkillArchive,
  runSkillLifecycleAction,
  saveSkillConfig,
  toggleSkill,
  uninstallSkill,
  updateInstalledSkill,
} from './api';
import { copyTextToClipboard } from '../../shared/clipboard';
import {
  buildDefaultSkillsOverviewRecipe,
  type SkillsOverviewRecipe,
} from './skills-overview-recipe';

type PageMode = 'installed' | 'marketplace' | 'local-install';
type InstalledFilter = 'all' | 'ready' | 'needs-setup' | 'disabled' | 'workspace' | 'managed' | 'bundled';
type InstalledDetailTab = 'overview' | 'agents' | 'config' | 'maintenance';
type MarketDetailTab = 'overview' | 'preflight' | 'install';
type ConfigFieldType = 'string' | 'number' | 'boolean' | 'json';
type MarketQuickFilter = 'all' | 'installed' | 'not-installed' | 'high-downloads';

interface EditableEnvEntry {
  id: string;
  key: string;
  value: string;
}

interface EditableConfigField {
  id: string;
  key: string;
  type: ConfigFieldType;
  value: string;
}

interface EditableSkillConfig {
  slug: string;
  enabled: boolean;
  apiKey: string;
  apiKeyMode: SkillApiKeyMode;
  apiKeyMasked: string | null;
  apiKeySecretRefLabel: string | null;
  hasApiKey: boolean;
  secretVisible: boolean;
  apiKeyDirty: boolean;
  envEntries: EditableEnvEntry[];
  configFields: EditableConfigField[];
}

interface ConfirmDialogState {
  kind: 'install' | 'update' | 'uninstall' | 'lifecycle';
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
  lifecyclePayload?: SkillsLifecyclePayload;
}

const props = defineProps<{
  overviewRecipe?: SkillsOverviewRecipe;
}>();

const { text } = useLocalePreference();
const route = useRoute();
const isSkillsRouteActive = computed(() => route.path === '/skills' || route.path.startsWith('/skills/'));

const overviewRecipe = computed(() => props.overviewRecipe ?? buildDefaultSkillsOverviewRecipe(text));
const pageEyebrow = computed(() => overviewRecipe.value.pageEyebrow);
const pageTitle = computed(() => overviewRecipe.value.pageTitle);
const pageCopy = computed(() => overviewRecipe.value.pageCopy);
const installedHeadline = computed(() => overviewRecipe.value.installedHeadline);
const installedCopy = computed(() => overviewRecipe.value.installedCopy);
const marketplaceHeadline = computed(() => overviewRecipe.value.marketplaceHeadline);
const marketplaceCopy = computed(() => overviewRecipe.value.marketplaceCopy);
const uploadHeadline = computed(() => overviewRecipe.value.uploadHeadline);
const uploadCopy = computed(() => overviewRecipe.value.uploadCopy);

const mode = ref<PageMode>('installed');
const modeIconInstalled = Compass;
const modeIconMarketplace = Globe2;
const modeIconLocalInstall = PackageOpen;
const summary = ref<SkillsSummaryPayload | null>(null);
const summaryLoading = ref(false);
const summaryError = ref('');
const noticeMessage = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

const installedSearch = ref('');
const installedFilter = ref<InstalledFilter>('all');
const selectedSkillSlug = ref('');
const installedDetailTab = ref<InstalledDetailTab>('overview');
const installedDrawerOpen = ref(false);
const selectedSkillEditor = ref<EditableSkillConfig | null>(null);
const loadedSkillConfigSlug = ref('');
const loadingSkillConfig = ref(false);
const savingConfig = ref(false);
const revealingSecret = ref(false);
const maintenanceRunning = ref<'update' | 'uninstall' | ''>('');
const maintenanceSourceId = ref<SkillsMarketplaceSourceId>('skillhub-tencent');

const marketSources = ref<SkillsMarketplaceSource[]>([]);
const skillTargets = ref<SkillTargetDescriptor[]>([]);
const marketSourceId = ref<SkillsMarketplaceSourceId>('skillhub-tencent');
const marketSearch = ref('');
const marketSort = ref<SkillsMarketplaceSort>('featured');
const marketCategory = ref('');
const marketQuickFilter = ref<MarketQuickFilter>('all');
const marketplace = ref<SkillsMarketplacePayload | null>(null);
const marketLoading = ref(false);
const marketplaceError = ref('');
const selectedMarketSlug = ref('');
const marketDetailTab = ref<MarketDetailTab>('overview');
const marketDrawerOpen = ref(false);
const preflightResultMap = ref<Record<string, SkillsPreflightResult>>({});
const preflightErrorMap = ref<Record<string, string>>({});
const preflightLoading = ref(false);
const installingSkillSlug = ref('');
const marketInstallTargetId = ref('default-workspace');
const marketInstallAs = ref('');
const marketReplaceExisting = ref(false);
const lifecycleTargetId = ref('managed');
const lifecycleInstallAs = ref('');
const lifecycleRunning = ref(false);
const uploadFileName = ref('');
const uploadDataBase64 = ref('');
const uploadInstallAs = ref('');
const uploadTargetId = ref('managed');
const uploadReplaceExisting = ref(false);
const uploadBusy = ref(false);
const uploadPreflight = ref<SkillsUploadPreflightResult | null>(null);
const confirmDialog = ref<ConfirmDialogState | null>(null);
const confirmRunning = ref(false);

let marketSearchTimer: ReturnType<typeof setTimeout> | null = null;
let skillsPageBootstrapped = false;

function clearMarketSearchTimer(): void {
  if (!marketSearchTimer) return;
  window.clearTimeout(marketSearchTimer);
  marketSearchTimer = null;
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function setNotice(kind: 'success' | 'error', message: string): void {
  noticeMessage.value = { kind, text: message };
}

async function copyCommand(command: string | null | undefined, successMessage: string): Promise<void> {
  if (!command) return;

  try {
    const copied = await copyTextToClipboard(command);
    if (!copied) {
      throw new Error(text('当前环境不支持复制到剪贴板。', 'Clipboard copy is not available in this environment.'));
    }
    setNotice('success', successMessage);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('复制命令失败。', 'Failed to copy command.'));
  }
}

async function copyList(items: string[], successMessage: string): Promise<void> {
  await copyCommand(items.join('\n'), successMessage);
}

function summarize(value: string, max = 110): string {
  if (!value) return text('没有描述。', 'No description.');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function formatCount(value: number): string {
  if (value >= 10_000) {
    const amount = value / 10_000;
    return `${amount.toFixed(amount >= 100 ? 0 : 1)}${text('万', 'w')}`;
  }
  return value.toLocaleString();
}

function formatMaybeCount(value: number | null): string {
  return value === null ? text('未知', 'Unknown') : formatCount(value);
}

function sourceCategoryLabel(value: SkillSummary['sourceCategory']): string {
  switch (value) {
    case 'workspace': return text('当前 workspace', 'Workspace');
    case 'managed': return text('共享目录', 'Managed');
    case 'bundled': return text('OpenClaw 内置', 'Bundled');
    case 'plugin': return text('插件技能', 'Plugin');
    case 'extra': return text('扩展目录', 'Extra source');
    case 'config-only': return text('仅配置残留', 'Config only');
    default: return text('未知来源', 'Unknown');
  }
}

function skillStatusLabel(value: SkillSummary['status']): string {
  switch (value) {
    case 'ready': return text('可直接用', 'Ready');
    case 'needs-setup': return text('待补依赖', 'Needs setup');
    case 'disabled': return text('已关闭', 'Disabled');
    case 'blocked': return text('被 allowlist 拦截', 'Blocked');
    default: return value;
  }
}

function skillTone(value: SkillSummary['status']): string {
  switch (value) {
    case 'ready': return 'tone-sage';
    case 'needs-setup': return 'tone-accent';
    case 'disabled': return 'tone-neutral';
    case 'blocked': return 'tone-neutral';
    default: return 'tone-neutral';
  }
}

function skillGapCount(skill: SkillSummary): string {
  const count = Object.values(skill.missing).reduce((total, group) => total + group.length, 0);
  return count === 0 ? text('无', 'None') : `${count} ${text('项', 'items')}`;
}

function hasMissingRequirements(skill: SkillSummary): boolean {
  return Object.values(skill.missing).some((group) => group.length > 0);
}

function missingRequirementGroups(skill: SkillSummary) {
  return [
    { key: 'bins', label: text('缺少二进制', 'Missing binaries'), items: skill.missing.bins },
    { key: 'anyBins', label: text('缺少任一命令', 'Missing any-bin requirement'), items: skill.missing.anyBins },
    { key: 'env', label: text('缺少环境变量', 'Missing env vars'), items: skill.missing.env },
    { key: 'config', label: text('缺少配置项', 'Missing config paths'), items: skill.missing.config },
    { key: 'os', label: text('系统限制', 'OS requirements'), items: skill.missing.os },
  ].filter((group) => group.items.length > 0);
}

function marketplaceSourceLabel(sourceId: SkillsMarketplaceSourceId): string {
  return sourceId === 'skillhub-tencent' ? 'SkillHub Tencent' : 'ClawHub';
}

function marketCategoryLabel(value: string): string {
  const mapping: Record<string, [string, string]> = {
    'ai-intelligence': ['AI 智能', 'AI Intelligence'],
    'developer-tools': ['开发工具', 'Developer Tools'],
    productivity: ['效率提升', 'Productivity'],
    'data-analysis': ['数据分析', 'Data Analysis'],
    'content-creation': ['内容创作', 'Content Creation'],
    'security-compliance': ['安全合规', 'Security'],
    'communication-collaboration': ['通讯协作', 'Communication'],
  };
  const target = mapping[value];
  return target ? text(target[0], target[1]) : value;
}

function marketMetricsLabel(item: SkillsMarketplaceItem): string {
  const parts: string[] = [];
  if (item.downloads !== null) parts.push(`⬇ ${formatCount(item.downloads)}`);
  if (item.stars !== null) parts.push(`★ ${formatCount(item.stars)}`);
  if (item.installs !== null) parts.push(`⎘ ${formatCount(item.installs)}`);
  return parts.join(' · ') || text('无指标', 'No metrics');
}

function toEnvEntries(env: Record<string, string>): EditableEnvEntry[] {
  return Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ id: createId('env'), key, value }));
}

function detectConfigFieldType(value: unknown): ConfigFieldType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  return 'json';
}

function toConfigFields(config: Record<string, unknown>): EditableConfigField[] {
  return Object.entries(config)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const type = detectConfigFieldType(value);
      return {
        id: createId('cfg'),
        key,
        type,
        value: type === 'json' ? JSON.stringify(value, null, 2) : String(value),
      };
    });
}

function configFieldError(field: EditableConfigField): string {
  const key = field.key.trim();
  if (!key) return text('字段名不能为空。', 'Field key is required.');
  if (field.type === 'number' && field.value.trim() && Number.isNaN(Number(field.value))) {
    return text('数字字段必须是合法数字。', 'Number fields must contain a valid number.');
  }
  if (field.type === 'json') {
    try {
      JSON.parse(field.value || '{}');
    } catch (error) {
      return error instanceof Error ? error.message : text('JSON 无法解析。', 'Invalid JSON.');
    }
  }
  return '';
}

function buildConfigObject(fields: EditableConfigField[]): { value: Record<string, unknown> | null; error: string } {
  const result: Record<string, unknown> = {};
  const keys = new Set<string>();

  for (const field of fields) {
    const key = field.key.trim();
    if (!key) return { value: null, error: text('配置字段名不能为空。', 'Config field keys cannot be empty.') };
    if (keys.has(key)) return { value: null, error: text(`存在重复字段：${key}`, `Duplicate field key: ${key}`) };
    keys.add(key);

    const error = configFieldError(field);
    if (error) return { value: null, error };

    if (field.type === 'boolean') {
      result[key] = field.value === 'true';
    } else if (field.type === 'number') {
      result[key] = Number(field.value);
    } else if (field.type === 'json') {
      result[key] = JSON.parse(field.value || '{}');
    } else {
      result[key] = field.value;
    }
  }

  return { value: result, error: '' };
}

function createEditableSkillConfig(payload: Awaited<ReturnType<typeof fetchSkillConfig>>): EditableSkillConfig {
  return {
    slug: payload.slug,
    enabled: payload.entry.enabled,
    apiKey: '',
    apiKeyMode: payload.entry.apiKeyMode,
    apiKeyMasked: payload.entry.apiKeyMasked,
    apiKeySecretRefLabel: payload.entry.apiKeySecretRefLabel,
    hasApiKey: payload.entry.hasApiKey,
    secretVisible: false,
    apiKeyDirty: false,
    envEntries: toEnvEntries(payload.entry.env),
    configFields: toConfigFields(payload.entry.config),
  };
}

function buildTargetRef(
  targetId: string,
  installAs: string,
  fallbackSlug: string,
): SkillTargetRef | undefined {
  const target = targetById(targetId);
  if (!target) return undefined;
  const targetRef: SkillTargetRef = {
    scope: target.scope as SkillInstallTargetScope,
    agentId: target.agentId,
    installAs: installAs.trim() || fallbackSlug,
  };
  if (target.scope === 'custom') targetRef.targetPath = target.path;
  return targetRef;
}

function lifecycleActionLabel(action: SkillsLifecycleAction): string {
  switch (action) {
    case 'copy': return text('复制', 'Copy');
    case 'move': return text('移动', 'Move');
    case 'promote': return text('提升到共享', 'Promote shared');
    case 'map': return text('映射给 Agent', 'Map to agent');
    case 'sync': return text('同步映射', 'Sync mappings');
    case 'delete': return text('删除', 'Delete');
    case 'detach': return text('脱离成副本', 'Detach copy');
    case 'unmap': return text('取消映射', 'Unmap');
    default: return action;
  }
}

const installedFilterOptions = computed<GlassSelectOption[]>(() => [
  { value: 'all', label: text('全部技能', 'All skills') },
  { value: 'ready', label: text('可直接用', 'Ready') },
  { value: 'needs-setup', label: text('待补依赖', 'Needs setup') },
  { value: 'disabled', label: text('已关闭', 'Disabled') },
  { value: 'workspace', label: text('Workspace', 'Workspace') },
  { value: 'managed', label: text('共享目录', 'Managed') },
  { value: 'bundled', label: text('内置技能', 'Bundled') },
]);

const configFieldTypeOptions = computed<GlassSelectOption[]>(() => [
  { value: 'string', label: text('文本', 'String') },
  { value: 'number', label: text('数字', 'Number') },
  { value: 'boolean', label: text('布尔值', 'Boolean') },
  { value: 'json', label: text('JSON', 'JSON') },
]);

const installedDetailTabs = computed(() => [
  { value: 'overview', label: text('概览', 'Overview') },
  { value: 'agents', label: text('Agent', 'Agents') },
  { value: 'config', label: text('配置', 'Config') },
  { value: 'maintenance', label: text('维护', 'Maintenance') },
]);

const marketDetailTabs = computed(() => [
  { value: 'overview', label: text('概览', 'Overview') },
  { value: 'preflight', label: text('风险预检', 'Preflight') },
  { value: 'install', label: text('安装', 'Install') },
]);

const marketSortOptions = computed<GlassSelectOption[]>(() => {
  if (marketSourceId.value === 'skillhub-tencent') {
    return [
      { value: 'featured', label: text('精选推荐', 'Featured') },
      { value: 'downloads', label: text('下载量', 'Downloads') },
      { value: 'stars', label: text('收藏数', 'Stars') },
      { value: 'installs', label: text('安装量', 'Installs') },
    ];
  }

  return [
    { value: 'downloads', label: text('下载量', 'Downloads') },
    { value: 'stars', label: text('收藏数', 'Stars') },
    { value: 'installs', label: text('安装量', 'Installs') },
    { value: 'newest', label: text('最近更新', 'Newest') },
  ];
});

const marketQuickFilters = computed(() => [
  { value: 'all', label: text('全部结果', 'All results') },
  { value: 'installed', label: text('只看已安装', 'Installed only') },
  { value: 'not-installed', label: text('只看未安装', 'Not installed') },
  { value: 'high-downloads', label: text('高下载量', 'High downloads') },
]);

const selectedSkillSummary = computed(() => {
  return summary.value?.skills.find((skill) => skill.slug === selectedSkillSlug.value) || null;
});

const skillTargetOptions = computed<GlassSelectOption[]>(() =>
  skillTargets.value.map((target) => ({
    value: target.id,
    label: `${target.label} · ${target.path}`,
  })),
);

function targetById(targetId: string): SkillTargetDescriptor | null {
  return skillTargets.value.find((target) => target.id === targetId) || null;
}

const selectedMarketInstallTarget = computed(() => targetById(marketInstallTargetId.value));
const selectedLifecycleTarget = computed(() => targetById(lifecycleTargetId.value));
const uploadSuggestedSlug = computed(() => uploadPreflight.value?.suggestedSlug || '');

const agentTargets = computed(() => skillTargets.value.filter((target) => target.scope === 'agent-workspace' && target.agentId));

const agentSkillMatrixRows = computed(() => {
  const skill = selectedSkillSummary.value;
  if (!skill) return [] as Array<{
    agentId: string;
    agentName: string;
    hasLocalCopy: boolean;
    hasMapping: boolean;
    canUnmap: boolean;
    path: string;
    sourcePath: string;
    statusLabel: string;
  }>;
  return agentTargets.value.map((target) => {
    const agentId = target.agentId || '';
    const mapping = (skill.agentMappings || []).find((item) => item.agentId === agentId) || null;
    const localPath = mapping?.targetPath || skill.paths.agentWorkspacePaths?.[agentId] || '';
    const hasLocalCopy = mapping?.mode === 'local-copy' || mapping?.mode === 'detached-fork' || Boolean(localPath);
    const hasMapping = mapping?.mode === 'shared-mapping' || mapping?.mode === 'global-default';
    const canUnmap = mapping?.mode === 'shared-mapping';
    const sourcePath = mapping?.sourcePath || skill.paths.managedPath || skill.paths.workspacePath || '';
    return {
      agentId,
      agentName: target.label,
      hasLocalCopy,
      hasMapping,
      canUnmap,
      path: localPath,
      sourcePath,
      statusLabel: mapping?.mode === 'detached-fork'
        ? text('本地分叉', 'Detached fork')
        : mapping?.mode === 'local-copy'
          ? text('本地副本', 'Local copy')
          : mapping?.mode === 'shared-mapping'
            ? text('Agent 映射', 'Agent mapping')
            : mapping?.mode === 'global-default'
              ? text('全局默认', 'Global default')
              : text('未关联', 'Not linked'),
    };
  });
});

const filteredInstalledSkills = computed(() => {
  const list = summary.value?.skills || [];
  const keyword = installedSearch.value.trim().toLowerCase();

  return list.filter((skill) => {
    const matchesFilter = installedFilter.value === 'all'
      ? true
      : installedFilter.value === 'ready'
        ? skill.status === 'ready'
        : installedFilter.value === 'needs-setup'
          ? skill.status === 'needs-setup'
          : installedFilter.value === 'disabled'
            ? skill.status === 'disabled'
            : installedFilter.value === 'workspace'
              ? skill.sourceCategory === 'workspace'
              : installedFilter.value === 'managed'
                ? skill.sourceCategory === 'managed'
                : skill.sourceCategory === 'bundled';

    if (!matchesFilter) return false;
    if (!keyword) return true;

    const haystack = [
      skill.name,
      skill.slug,
      skill.description,
      skill.primaryEnv || '',
      ...skill.envKeys,
      ...skill.configKeys,
    ].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });
});

const activeMarketSource = computed(() => {
  return marketSources.value.find((source) => source.id === marketSourceId.value) || null;
});

const marketCategoryOptions = computed<GlassSelectOption[]>(() => {
  const categories = new Set<string>();
  for (const item of marketplace.value?.items || []) {
    if (item.category) categories.add(item.category);
  }

  return [
    { value: '', label: text('全部分类', 'All categories') },
    ...Array.from(categories).sort().map((category) => ({
      value: category,
      label: marketCategoryLabel(category),
    })),
  ];
});

const filteredMarketItems = computed(() => {
  const items = marketplace.value?.items || [];
  return items.filter((item) => {
    if (marketCategory.value && item.category !== marketCategory.value) return false;
    if (marketQuickFilter.value === 'installed' && !item.installed) return false;
    if (marketQuickFilter.value === 'not-installed' && item.installed) return false;
    if (marketQuickFilter.value === 'high-downloads' && (item.downloads ?? 0) < 10_000) return false;
    return true;
  });
});

const selectedMarketItem = computed(() => {
  return filteredMarketItems.value.find((item) => item.slug === selectedMarketSlug.value)
    || marketplace.value?.items.find((item) => item.slug === selectedMarketSlug.value)
    || null;
});

const selectedPreflight = computed(() => {
  if (!selectedMarketItem.value) return null;
  return preflightResultMap.value[`${selectedMarketItem.value.sourceId}:${selectedMarketItem.value.slug}`] || null;
});

const groupedPreflightIndicators = computed(() => {
  if (!selectedPreflight.value) return [];
  const groups: Array<{ level: SkillsRiskLevel; label: string; items: SkillsPreflightResult['indicators'] }> = [
    { level: 'high', label: preflightLevelLabel('high'), items: [] },
    { level: 'medium', label: preflightLevelLabel('medium'), items: [] },
    { level: 'low', label: preflightLevelLabel('low'), items: [] },
  ];

  for (const indicator of selectedPreflight.value.indicators) {
    const match = groups.find((group) => group.level === indicator.severity);
    if (match) match.items.push(indicator);
  }

  return groups.filter((group) => group.items.length > 0);
});

const preflightError = computed(() => {
  if (!selectedMarketItem.value) return '';
  return preflightErrorMap.value[`${selectedMarketItem.value.sourceId}:${selectedMarketItem.value.slug}`] || '';
});

const apiKeyInputValue = computed(() => {
  if (!selectedSkillEditor.value) return '';
  if (selectedSkillEditor.value.secretVisible || !selectedSkillEditor.value.hasApiKey) return selectedSkillEditor.value.apiKey;
  return selectedSkillEditor.value.apiKeyMasked || '';
});

const apiKeyPlaceholder = computed(() => {
  if (!selectedSkillEditor.value) return '';
  if (selectedSkillEditor.value.apiKeyMode === 'secret-ref') {
    return text('当前由 SecretRef 提供', 'Provided by SecretRef');
  }
  return text('未配置主密钥', 'No primary API key');
});

const configFieldsError = computed(() => {
  if (!selectedSkillEditor.value) return '';
  return buildConfigObject(selectedSkillEditor.value.configFields).error;
});

function canMaintainSkill(skill: SkillSummary | null): boolean {
  if (!skill) return false;
  if (skill.sourceCategory === 'bundled') return false;
  return Boolean(skill.paths.activePath);
}

function preflightTone(level: SkillsRiskLevel): string {
  return `level-${level}`;
}

function preflightLevelLabel(level: SkillsRiskLevel): string {
  switch (level) {
    case 'high': return text('高风险', 'High risk');
    case 'medium': return text('中风险', 'Medium risk');
    default: return text('低风险', 'Low risk');
  }
}

async function loadSummary(refresh = false): Promise<void> {
  if (!isSkillsRouteActive.value) return;
  summaryLoading.value = true;
  summaryError.value = '';

  try {
    const payload = await fetchSkillsSummary(refresh);
    if (!isSkillsRouteActive.value) return;
    summary.value = payload;

    if (!selectedSkillSlug.value || !payload.skills.some((skill) => skill.slug === selectedSkillSlug.value)) {
      selectedSkillSlug.value = payload.skills[0]?.slug || '';
    }
  } catch (error) {
    if (!isSkillsRouteActive.value) return;
    summaryError.value = error instanceof Error ? error.message : text('读取技能状态失败。', 'Failed to load skills.');
  } finally {
    summaryLoading.value = false;
  }
}

async function refreshSummary(): Promise<void> {
  await loadSummary(true);
}

function selectInstalledSkill(slug: string): void {
  selectedSkillSlug.value = slug;
  installedDetailTab.value = 'overview';
  installedDrawerOpen.value = true;
}

function closeInstalledDrawer(): void {
  installedDrawerOpen.value = false;
}

function closeConfirmDialog(): void {
  if (confirmRunning.value) return;
  confirmDialog.value = null;
}

async function ensureSkillConfigLoaded(): Promise<void> {
  if (!selectedSkillSlug.value || loadedSkillConfigSlug.value === selectedSkillSlug.value) return;

  loadingSkillConfig.value = true;
  try {
    const payload = await fetchSkillConfig(selectedSkillSlug.value);
    selectedSkillEditor.value = createEditableSkillConfig(payload);
    loadedSkillConfigSlug.value = selectedSkillSlug.value;
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('读取技能配置失败。', 'Failed to load skill config.'));
  } finally {
    loadingSkillConfig.value = false;
  }
}

async function toggleInstalledSkillState(slug: string, enabled: boolean): Promise<void> {
  try {
    await toggleSkill({ slug, enabled });
    await loadSummary(true);
    if (loadedSkillConfigSlug.value === slug) loadedSkillConfigSlug.value = '';
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('切换技能状态失败。', 'Failed to toggle skill.'));
  }
}

function updateApiKey(value: string): void {
  if (!selectedSkillEditor.value) return;
  selectedSkillEditor.value.secretVisible = true;
  selectedSkillEditor.value.apiKeyDirty = true;
  selectedSkillEditor.value.apiKey = value;
}

async function toggleApiKeyVisibility(): Promise<void> {
  if (!selectedSkillEditor.value || selectedSkillEditor.value.apiKeyMode === 'secret-ref') return;

  if (!selectedSkillEditor.value.hasApiKey) {
    selectedSkillEditor.value.secretVisible = true;
    return;
  }

  if (selectedSkillEditor.value.secretVisible) {
    selectedSkillEditor.value.secretVisible = false;
    return;
  }

  if (!selectedSkillEditor.value.apiKeyDirty && !selectedSkillEditor.value.apiKey) {
    revealingSecret.value = true;
    try {
      const payload = await fetchSkillSecret(selectedSkillEditor.value.slug);
      selectedSkillEditor.value.apiKey = payload.apiKey || '';
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : text('读取技能密钥失败。', 'Failed to load skill secret.'));
    } finally {
      revealingSecret.value = false;
    }
  }

  selectedSkillEditor.value.secretVisible = true;
}

function addEnvEntry(): void {
  if (!selectedSkillEditor.value) return;
  selectedSkillEditor.value.envEntries.push({ id: createId('env'), key: '', value: '' });
}

function removeEnvEntry(entryId: string): void {
  if (!selectedSkillEditor.value) return;
  selectedSkillEditor.value.envEntries = selectedSkillEditor.value.envEntries.filter((entry) => entry.id !== entryId);
}

function addConfigField(): void {
  if (!selectedSkillEditor.value) return;
  selectedSkillEditor.value.configFields.push({
    id: createId('cfg'),
    key: '',
    type: 'string',
    value: '',
  });
}

function removeConfigField(fieldId: string): void {
  if (!selectedSkillEditor.value) return;
  selectedSkillEditor.value.configFields = selectedSkillEditor.value.configFields.filter((field) => field.id !== fieldId);
}

async function saveInstalledSkillConfig(): Promise<void> {
  if (!selectedSkillEditor.value) return;
  const builtConfig = buildConfigObject(selectedSkillEditor.value.configFields);
  if (!builtConfig.value) {
    setNotice('error', builtConfig.error || text('配置字段无效。', 'Config fields are invalid.'));
    return;
  }

  const env = Object.fromEntries(
    selectedSkillEditor.value.envEntries
      .map((entry) => [entry.key.trim(), entry.value] as const)
      .filter(([key, value]) => key && value.trim())
  );

  savingConfig.value = true;
  try {
    await saveSkillConfig(selectedSkillEditor.value.slug, {
      enabled: selectedSkillEditor.value.enabled,
      env,
      config: builtConfig.value,
      ...(selectedSkillEditor.value.apiKeyDirty ? { apiKey: selectedSkillEditor.value.apiKey.trim() || null } : {}),
    });

    setNotice('success', text('技能配置已保存。新的 OpenClaw session 会应用这些变更。', 'Skill config saved. A new OpenClaw session will apply these changes.'));
    loadedSkillConfigSlug.value = '';
    await loadSummary(true);
    await ensureSkillConfigLoaded();
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('保存技能配置失败。', 'Failed to save skill config.'));
  } finally {
    savingConfig.value = false;
  }
}

async function updateInstalledSkillVersion(): Promise<void> {
  if (!selectedSkillSummary.value) return;
  maintenanceRunning.value = 'update';
  try {
    const result = await updateInstalledSkill(selectedSkillSummary.value.slug, maintenanceSourceId.value);
    handleMaintenanceResult(result, text('技能已更新。建议开启新会话。', 'Skill updated. Start a new session to pick it up.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('更新技能失败。', 'Failed to update skill.'));
  } finally {
    maintenanceRunning.value = '';
  }
}

async function removeInstalledSkill(): Promise<void> {
  if (!selectedSkillSummary.value) return;
  maintenanceRunning.value = 'uninstall';
  try {
    const result = await uninstallSkill(selectedSkillSummary.value.slug);
    handleMaintenanceResult(result, text('技能已卸载。', 'Skill removed.'));
    loadedSkillConfigSlug.value = '';
    selectedSkillEditor.value = null;
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('卸载技能失败。', 'Failed to remove skill.'));
  } finally {
    maintenanceRunning.value = '';
  }
}

function handleMaintenanceResult(result: SkillsMaintenanceResponse, fallback: string): void {
  setNotice('success', result.note ? `${result.output} ${result.note}` : `${result.output} ${fallback}`);
  void loadSummary(true);
}

async function loadMarketplaceSources(): Promise<void> {
  if (!isSkillsRouteActive.value) return;
  try {
    const payload = await fetchMarketplaceSources();
    if (!isSkillsRouteActive.value) return;
    marketSources.value = payload.sources;
    maintenanceSourceId.value = payload.recommendedSourceId;
    if (!marketplace.value) {
      marketSourceId.value = payload.recommendedSourceId;
      marketSort.value = payload.recommendedSourceId === 'skillhub-tencent' ? 'featured' : 'downloads';
    }
  } catch (error) {
    if (!isSkillsRouteActive.value) return;
    setNotice('error', error instanceof Error ? error.message : text('读取市场源失败。', 'Failed to load marketplace sources.'));
  }
}

async function loadSkillTargets(): Promise<void> {
  if (!isSkillsRouteActive.value) return;
  try {
    const payload = await fetchSkillTargets();
    if (!isSkillsRouteActive.value) return;
    skillTargets.value = payload.targets || [];
    if (!targetById(marketInstallTargetId.value)) {
      marketInstallTargetId.value = skillTargets.value[0]?.id || 'default-workspace';
    }
    if (!targetById(lifecycleTargetId.value)) {
      lifecycleTargetId.value = skillTargets.value.find((target) => target.scope === 'managed')?.id
        || skillTargets.value[0]?.id
        || 'managed';
    }
    if (!targetById(uploadTargetId.value)) {
      uploadTargetId.value = skillTargets.value.find((target) => target.scope === 'managed')?.id
        || skillTargets.value[0]?.id
        || 'managed';
    }
  } catch (error) {
    if (!isSkillsRouteActive.value) return;
    setNotice('error', error instanceof Error ? error.message : text('读取技能目标失败。', 'Failed to load skill targets.'));
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',').pop() || '' : value);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function handleUploadArchiveChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] || null;
  uploadPreflight.value = null;
  uploadInstallAs.value = '';
  uploadDataBase64.value = '';
  uploadFileName.value = '';
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.zip')) {
    setNotice('error', text('请上传 .zip 技能压缩包。', 'Upload a .zip skill archive.'));
    input.value = '';
    return;
  }
  try {
    uploadFileName.value = file.name;
    uploadDataBase64.value = await readFileAsBase64(file);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('读取上传文件失败。', 'Failed to read uploaded file.'));
  }
}

async function preflightUploadedArchive(): Promise<void> {
  if (!uploadDataBase64.value || !uploadFileName.value) return;
  uploadBusy.value = true;
  try {
    const payload = await preflightUploadedSkillArchive({
      fileName: uploadFileName.value,
      dataBase64: uploadDataBase64.value,
    });
    uploadPreflight.value = payload;
    uploadInstallAs.value = payload.suggestedSlug;
    setNotice('success', text('压缩包结构检测通过。', 'Archive structure validated.'));
  } catch (error) {
    uploadPreflight.value = null;
    setNotice('error', error instanceof Error ? error.message : text('压缩包检测失败。', 'Archive validation failed.'));
  } finally {
    uploadBusy.value = false;
  }
}

async function installUploadedArchive(): Promise<void> {
  if (!uploadDataBase64.value || !uploadFileName.value || !uploadPreflight.value) return;
  uploadBusy.value = true;
  try {
    const result = await installUploadedSkillArchive({
      fileName: uploadFileName.value,
      dataBase64: uploadDataBase64.value,
      target: buildTargetRef(uploadTargetId.value, uploadInstallAs.value || uploadPreflight.value.suggestedSlug, uploadPreflight.value.suggestedSlug),
      installAs: uploadInstallAs.value || uploadPreflight.value.suggestedSlug,
      replaceExisting: uploadReplaceExisting.value,
    });
    setNotice('success', `${result.output}${result.note ? ` ${result.note}` : ''}`);
    await loadSummary(true);
    await loadSkillTargets();
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('安装上传技能失败。', 'Failed to install uploaded skill.'));
  } finally {
    uploadBusy.value = false;
  }
}

async function runLifecycle(payload: SkillsLifecyclePayload): Promise<void> {
  lifecycleRunning.value = true;
  try {
    const result = await runSkillLifecycleAction(payload);
    const affected = result.affectedAgents.length
      ? text(`，影响 ${result.affectedAgents.length} 个 Agent`, `, ${result.affectedAgents.length} agent(s) affected`)
      : '';
    setNotice('success', `${result.output}${affected}${result.note ? ` ${result.note}` : ''}`);
    await loadSummary(true);
    await loadSkillTargets();
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('执行技能生命周期操作失败。', 'Failed to run skill lifecycle action.'));
  } finally {
    lifecycleRunning.value = false;
  }
}

async function loadMarketplace(force = false): Promise<void> {
  if (!isSkillsRouteActive.value) return;
  if (!force && marketplace.value && marketSourceId.value === marketplace.value.source.id) return;
  marketLoading.value = true;
  marketplaceError.value = '';

  try {
    const payload = await fetchMarketplaceSkills({
      sourceId: marketSourceId.value,
      query: marketSearch.value,
      sort: marketSort.value,
      page: 1,
      pageSize: 24,
    });
    if (!isSkillsRouteActive.value) return;
    marketplace.value = payload;
    marketCategory.value = '';
    if (!selectedMarketSlug.value || !payload.items.some((item) => item.slug === selectedMarketSlug.value)) {
      selectedMarketSlug.value = payload.items[0]?.slug || '';
    }
  } catch (error) {
    if (!isSkillsRouteActive.value) return;
    marketplaceError.value = error instanceof Error ? error.message : text('读取市场失败。', 'Failed to load marketplace.');
  } finally {
    marketLoading.value = false;
  }
}

function selectMarketplaceSource(sourceId: SkillsMarketplaceSourceId): void {
  if (marketSourceId.value === sourceId) return;
  marketSourceId.value = sourceId;
  marketSort.value = sourceId === 'skillhub-tencent' ? 'featured' : 'downloads';
  marketCategory.value = '';
}

function selectMarketSkill(slug: string): void {
  selectedMarketSlug.value = slug;
  marketDetailTab.value = 'overview';
  marketDrawerOpen.value = true;
}

function closeMarketDrawer(): void {
  marketDrawerOpen.value = false;
}

function requestUpdateInstalledSkillVersion(): void {
  if (!selectedSkillSummary.value) return;
  confirmDialog.value = {
    kind: 'update',
    title: text('确认更新技能', 'Confirm skill update'),
    message: text('将从当前选定市场源覆盖本地技能目录。若你对本地技能做过手工修改，这次更新会直接覆盖掉。', 'Studio will overwrite the local skill directory from the selected marketplace source. Any local manual edits inside that skill folder will be replaced.'),
    detail: `${selectedSkillSummary.value.slug} · ${marketplaceSourceLabel(maintenanceSourceId.value)}`,
    confirmLabel: text('确认更新', 'Update now'),
  };
}

function requestRemoveInstalledSkill(): void {
  if (!selectedSkillSummary.value) return;
  confirmDialog.value = {
    kind: 'uninstall',
    title: text('确认卸载技能', 'Confirm uninstall'),
    message: text('将删除本地技能目录并清理 Studio 中对应的技能配置。这个动作不会影响 OpenClaw bundled 内置技能。', 'Studio will delete the local skill directory and remove the matching Studio skill config entry. Bundled OpenClaw skills are not affected.'),
    detail: `${selectedSkillSummary.value.slug} · ${selectedSkillSummary.value.paths.activePath || text('无本地路径', 'No local path')}`,
    confirmLabel: text('确认卸载', 'Remove now'),
  };
}

function requestInstallSelectedMarketSkill(): void {
  if (!selectedMarketItem.value) return;
  const targetLabel = selectedMarketInstallTarget.value?.label || text('默认 workspace', 'Default workspace');
  confirmDialog.value = {
    kind: 'install',
    title: text('确认安装技能', 'Confirm skill install'),
    message: text('将把该技能安装到选定目标，并在下一个新会话中由 OpenClaw 自动发现。', 'Studio will install this skill into the selected target and OpenClaw will discover it in the next new session.'),
    detail: `${selectedMarketItem.value.slug} · ${marketplaceSourceLabel(selectedMarketItem.value.sourceId)} · ${targetLabel}`,
    confirmLabel: text('确认安装', 'Install now'),
  };
}

function requestSkillLifecycleAction(action: SkillsLifecycleAction): void {
  if (!selectedSkillSummary.value) return;
  const slug = selectedSkillSummary.value.slug;
  const targetRef = buildTargetRef(lifecycleTargetId.value, lifecycleInstallAs.value, slug);
  const lifecyclePayload: SkillsLifecyclePayload = {
    action,
    slug,
    replaceExisting: true,
    confirmAffected: action === 'delete',
  };
  if (action === 'copy' || action === 'move' || action === 'detach') {
    lifecyclePayload.destination = targetRef || null;
  } else if (action === 'promote') {
    lifecyclePayload.destination = { scope: 'managed', installAs: lifecycleInstallAs.value.trim() || slug };
  } else if (action === 'map' || action === 'unmap') {
    if (!selectedLifecycleTarget.value?.agentId) {
      setNotice('error', text('请先选择一个 Agent 目标。', 'Select an agent target first.'));
      return;
    }
    lifecyclePayload.agentIds = [selectedLifecycleTarget.value.agentId];
  } else if (action === 'delete') {
    lifecyclePayload.deleteMode = 'physical-and-mappings';
  }

  confirmDialog.value = {
    kind: 'lifecycle',
    title: text(`确认${lifecycleActionLabel(action)}`, `Confirm ${lifecycleActionLabel(action)}`),
    message: text('该操作会修改技能目录或 Agent 技能映射，执行后建议开启新会话。', 'This changes skill directories or agent skill mappings. Start a new session after running it.'),
    detail: `${slug} · ${lifecycleActionLabel(action)}${selectedLifecycleTarget.value ? ` · ${selectedLifecycleTarget.value.label}` : ''}`,
    confirmLabel: lifecycleActionLabel(action),
    lifecyclePayload,
  };
}

function requestSkillLifecycleForAgent(action: 'copy' | 'map' | 'unmap', agentId: string): void {
  if (!selectedSkillSummary.value) return;
  const slug = selectedSkillSummary.value.slug;
  const target = skillTargets.value.find((item) => item.scope === 'agent-workspace' && item.agentId === agentId);
  if (!target) {
    setNotice('error', text('找不到 Agent 目标。', 'Agent target not found.'));
    return;
  }
  const lifecyclePayload: SkillsLifecyclePayload = action === 'map' || action === 'unmap'
    ? {
        action,
        slug,
        agentIds: [agentId],
      }
    : {
        action: 'copy',
        slug,
        destination: {
          scope: 'agent-workspace',
          agentId,
          installAs: slug,
        },
        replaceExisting: true,
      };

  confirmDialog.value = {
    kind: 'lifecycle',
    title: action === 'copy'
      ? text('确认复制技能', 'Confirm skill copy')
      : action === 'unmap'
        ? text('确认取消映射', 'Confirm unmap')
        : text('确认映射技能', 'Confirm skill mapping'),
    message: action === 'copy'
      ? text('将为该 Agent 创建一个本地技能副本，后续可独立编辑。', 'This creates a local skill copy for the agent so it can be edited independently later.')
      : action === 'unmap'
        ? text('将从该 Agent 的技能列表中移除映射，不删除任何物理副本。', 'This removes the mapping from the agent skill list without deleting physical copies.')
        : text('将把共享技能映射给该 Agent 复用，不创建新的物理副本。', 'This maps the shared skill to the agent without creating a new physical copy.'),
    detail: `${slug} · ${target.label}`,
    confirmLabel: action === 'copy'
      ? text('确认复制', 'Copy now')
      : action === 'unmap'
        ? text('确认取消映射', 'Unmap now')
        : text('确认映射', 'Map now'),
    lifecyclePayload,
  };
}

async function ensureSelectedMarketPreflight(force = false): Promise<void> {
  if (!selectedMarketItem.value) return;
  const key = `${selectedMarketItem.value.sourceId}:${selectedMarketItem.value.slug}`;
  if (!force && preflightResultMap.value[key]) return;

  preflightLoading.value = true;
  preflightErrorMap.value[key] = '';
  try {
    const payload = await preflightMarketplaceSkill({
      sourceId: selectedMarketItem.value.sourceId,
      slug: selectedMarketItem.value.slug,
    });
    preflightResultMap.value = {
      ...preflightResultMap.value,
      [key]: payload,
    };
  } catch (error) {
    preflightErrorMap.value = {
      ...preflightErrorMap.value,
      [key]: error instanceof Error ? error.message : text('预检失败。', 'Preflight failed.'),
    };
  } finally {
    preflightLoading.value = false;
  }
}

async function reloadSelectedMarketPreflight(): Promise<void> {
  await ensureSelectedMarketPreflight(true);
}

async function installSelectedMarketSkill(): Promise<void> {
  if (!selectedMarketItem.value) return;
  installingSkillSlug.value = selectedMarketItem.value.slug;
  try {
    const result = await installMarketplaceSkill({
      sourceId: selectedMarketItem.value.sourceId,
      slug: selectedMarketItem.value.slug,
      target: buildTargetRef(marketInstallTargetId.value, marketInstallAs.value, selectedMarketItem.value.slug),
      replaceExisting: marketReplaceExisting.value,
    });
    setNotice('success', result.note ? `${result.output} ${result.note}` : `${result.output} ${text('新的 OpenClaw session 会自动拾取这个技能。', 'A new OpenClaw session will pick up this skill automatically.')}`);
    await loadSummary(true);
    await loadMarketplace(true);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('安装技能失败。', 'Failed to install skill.'));
  } finally {
    installingSkillSlug.value = '';
  }
}

async function executeConfirmDialog(): Promise<void> {
  if (!confirmDialog.value || confirmRunning.value) return;
  confirmRunning.value = true;

  try {
    if (confirmDialog.value.kind === 'install') {
      await installSelectedMarketSkill();
    } else if (confirmDialog.value.kind === 'update') {
      await updateInstalledSkillVersion();
    } else if (confirmDialog.value.kind === 'lifecycle') {
      if (confirmDialog.value.lifecyclePayload) {
        await runLifecycle(confirmDialog.value.lifecyclePayload);
      }
    } else {
      await removeInstalledSkill();
    }
    confirmDialog.value = null;
  } finally {
    confirmRunning.value = false;
  }
}

watch(installedDetailTab, (tab) => {
  if (!isSkillsRouteActive.value) return;
  if (tab === 'config') {
    void ensureSkillConfigLoaded();
  }
});

watch(selectedSkillSlug, () => {
  loadedSkillConfigSlug.value = '';
  selectedSkillEditor.value = null;
});

watch(mode, async (value) => {
  if (!isSkillsRouteActive.value) return;
  installedDrawerOpen.value = false;
  marketDrawerOpen.value = false;
  confirmDialog.value = null;
  if (value === 'marketplace' && !marketplace.value) {
    await loadMarketplace(true);
  }
});

watch(marketSourceId, () => {
  if (!isSkillsRouteActive.value) return;
  if (mode.value === 'marketplace') {
    void loadMarketplace(true);
  }
});

watch(marketSort, () => {
  if (!isSkillsRouteActive.value) return;
  if (mode.value === 'marketplace') {
    void loadMarketplace(true);
  }
});

watch(filteredMarketItems, (items) => {
  if (!isSkillsRouteActive.value) return;
  if (!items.length) {
    selectedMarketSlug.value = '';
    return;
  }

  if (!items.some((item) => item.slug === selectedMarketSlug.value)) {
    selectedMarketSlug.value = items[0]?.slug || '';
  }
});

watch(marketSearch, () => {
  clearMarketSearchTimer();
  if (!isSkillsRouteActive.value) return;
  marketSearchTimer = window.setTimeout(() => {
    marketSearchTimer = null;
    if (isSkillsRouteActive.value && mode.value === 'marketplace') {
      void loadMarketplace(true);
    }
  }, 240);
});

watch(selectedMarketSlug, () => {
  if (!isSkillsRouteActive.value) return;
  if (selectedMarketItem.value) {
    void ensureSelectedMarketPreflight(false);
  }
});

watch(marketDetailTab, (tab) => {
  if (!isSkillsRouteActive.value) return;
  if (tab === 'preflight' || tab === 'install') {
    void ensureSelectedMarketPreflight(false);
  }
});

async function activateSkillsPage(): Promise<void> {
  if (!isSkillsRouteActive.value) return;
  if (!skillsPageBootstrapped) {
    skillsPageBootstrapped = true;
    await Promise.all([
      loadSummary(false),
      loadMarketplaceSources(),
      loadSkillTargets(),
    ]);
    return;
  }
  if (!summary.value) void loadSummary(false);
  if (!marketSources.value.length) void loadMarketplaceSources();
  if (!skillTargets.value.length) void loadSkillTargets();
  if (mode.value === 'marketplace' && !marketplace.value) void loadMarketplace(true);
}

onMounted(() => { void activateSkillsPage(); });
onActivated(() => { void activateSkillsPage(); });
onDeactivated(clearMarketSearchTimer);
onBeforeUnmount(clearMarketSearchTimer);
</script>

<style scoped>
.skills-page {
  gap: 18px;
}

.skills-mode-switch {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background:
    radial-gradient(560px 220px at 0% 0%, color-mix(in srgb, var(--acc) 10%, transparent), transparent 66%),
    color-mix(in srgb, var(--line) 72%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--shell-highlight) 10%, transparent),
    0 10px 26px rgba(8, 18, 29, 0.07);
}

.skills-mode-button {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 0;
  padding: 13px 16px;
  background: color-mix(in srgb, var(--surface-base) 90%, transparent);
  color: var(--muted);
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.skills-mode-button:hover {
  transform: translateX(2px);
  color: var(--text);
  background: color-mix(in srgb, var(--surface-raised) 62%, transparent);
}

.skills-mode-button.active {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--acc) 12%, transparent), transparent 64%),
    color-mix(in srgb, var(--surface-raised) 78%, transparent);
  color: var(--text);
}

.skills-mode-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--icon-surface) 84%, transparent);
  border: 1px solid var(--line);
  color: var(--acc);
}

.skills-mode-button strong,
.skills-board-head h3,
.skills-drawer-head h3,
.skills-section-head h4 {
  display: block;
  margin: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
}

.skills-mode-button span:last-child span,
.skills-board-head p,
.skills-drawer-head p,
.skills-section-head p {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.skills-board {
  padding: 20px;
  border-radius: 12px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface-base) 88%, transparent), color-mix(in srgb, var(--code-bg) 10%, transparent));
  border: 1px solid var(--line);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--shell-highlight) 10%, transparent),
    0 12px 30px rgba(8, 18, 29, 0.07);
}

.skills-board {
  display: grid;
  gap: 14px;
}

.skills-board-head,
.skills-drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.skills-drawer-head {
  position: sticky;
  top: 0;
  z-index: 2;
  padding-bottom: 10px;
  background: inherit;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.skills-inline-stats,
.skills-choice-row,
.skills-maintenance-actions,
.skills-section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skills-inline-stats span,
.skills-mini-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text-soft);
  font-size: 11px;
}

.skills-toolbar-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 220px;
  gap: 12px;
}

.skills-toolbar-grid.market {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 220px 220px;
}

.skills-toolbar-subrow {
  display: grid;
  gap: 10px;
}

.skills-plugin-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.skills-agent-matrix {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.skills-upload-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background:
    linear-gradient(135deg, rgba(109, 240, 207, 0.055), transparent 56%),
    var(--surface);
}

.skills-agent-matrix-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.skills-agent-matrix-card {
  display: grid;
  gap: 9px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.025);
  min-width: 0;
}

.skills-agent-matrix-card strong,
.skills-agent-matrix-card span {
  display: block;
}

.skills-agent-matrix-card strong {
  color: var(--text);
  font-size: 13px;
}

.skills-agent-matrix-card span {
  color: var(--muted);
  font-size: 11px;
}

.skills-agent-matrix-card code {
  min-height: 34px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--code-bg);
  color: var(--text-soft);
  font-size: 11px;
  line-height: 1.45;
  word-break: break-all;
}

.skills-agent-matrix-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.skills-plugin-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  min-width: 0;
}

.skills-plugin-card-entries {
  grid-column: 1 / -1;
}

.skills-plugin-list,
.skills-plugin-entry-list {
  max-height: min(48vh, 420px);
  overflow-y: auto;
  padding-right: 2px;
}

.skills-plugin-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.skills-plugin-entry {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.02);
}

.skills-plugin-entry-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.skills-plugin-entry-head strong {
  color: var(--text);
  font-size: 14px;
  line-height: 1.45;
  word-break: break-word;
}

.skills-plugin-entry-config {
  display: grid;
  gap: 8px;
}

.skills-plugin-savebar {
  grid-column: 1 / -1;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.skills-table {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}

.skills-table-head,
.skills-table-row {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) 180px 180px 120px 150px;
  gap: 12px;
  align-items: center;
}

.skills-table-head {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
}

.skills-table-body {
  max-height: 420px;
  overflow-y: auto;
}

.skills-table-row {
  width: 100%;
  padding: 14px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease;
}

.skills-table-row:hover {
  background: rgba(255, 255, 255, 0.025);
}

.skills-table-row.active {
  background: var(--tab-active-bg);
}

.skills-table-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.skills-table-main strong {
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.skills-table-main em,
.skills-table-subtle {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
  font-style: normal;
}

.skills-table-action {
  display: flex;
  justify-content: flex-end;
}

.skills-inline-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-soft);
  font-size: 12px;
}

.skills-drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(7, 13, 23, 0.34);
  backdrop-filter: blur(3px);
  z-index: 80;
}

.skills-drawer {
  position: fixed;
  top: 18px;
  right: 18px;
  bottom: 18px;
  width: min(680px, calc(100vw - 36px));
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 14px;
  padding: 18px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(10, 18, 30, 0.95), rgba(12, 24, 39, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.38);
  z-index: 81;
}

html[data-theme="light"] .skills-drawer {
  background: linear-gradient(180deg, rgba(251, 253, 255, 0.96), rgba(242, 247, 251, 0.94));
  box-shadow: 0 28px 90px rgba(77, 102, 132, 0.22);
}

.skills-drawer-close {
  width: 40px;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

.skills-drawer-body {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.skills-detail-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.skills-detail-tab {
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.skills-detail-tab:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 190, 122, 0.22);
  color: var(--text);
}

.skills-detail-tab.active {
  border-color: rgba(255, 190, 122, 0.3);
  background: var(--tab-active-bg);
  color: var(--text);
}

.skills-detail-panel {
  display: grid;
  gap: 14px;
}

.skills-section-head.compact {
  gap: 4px;
}

.skills-facts-grid,
.skills-maintenance-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.skills-fact,
.skills-fact-line {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.skills-fact span {
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.skills-fact strong,
.skills-fact-line strong {
  color: var(--text);
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
}

.skills-fact-line span {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.skills-empty-state,
.skills-empty-inline {
  padding: 18px;
  border-radius: 12px;
  border: 1px dashed var(--line);
  background: rgba(255, 255, 255, 0.02);
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.skills-empty-inline {
  padding: 14px;
}

.skills-missing-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.skills-missing-block,
.skills-preflight-block {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--line);
}

.skills-missing-block span,
.skills-preflight-block span {
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.skills-preflight-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.skills-missing-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skills-missing-items code {
  padding: 7px 10px;
  border-radius: 10px;
  background: var(--code-bg);
  border: 1px solid var(--line);
  color: var(--text-soft);
  font-size: 11px;
  line-height: 1.55;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
}

.skills-form-grid {
  display: grid;
  gap: 12px;
}

.skills-checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.6;
}

.skills-kv-list,
.skills-config-fields,
.skills-preflight-list {
  display: grid;
  gap: 10px;
}

.skills-preflight-groups {
  display: grid;
  gap: 12px;
}

.skills-preflight-group {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.02);
}

.skills-preflight-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.skills-preflight-group-head strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.skills-preflight-group-head span {
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.skills-preflight-group.risk-high {
  border-color: rgba(255, 127, 143, 0.18);
  background: rgba(255, 127, 143, 0.05);
}

.skills-preflight-group.risk-medium {
  border-color: rgba(255, 190, 122, 0.18);
  background: rgba(255, 190, 122, 0.05);
}

.skills-preflight-group.risk-low {
  border-color: rgba(109, 240, 207, 0.18);
  background: rgba(109, 240, 207, 0.04);
}

.skills-kv-row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.skills-config-row {
  display: grid;
  grid-template-columns: minmax(0, 0.7fr) 180px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.skills-boolean-editor {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 44px;
}

.skills-json-field {
  min-height: 120px;
}

.skills-remove-button {
  min-width: 84px;
}

.skills-maintenance-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.skills-link-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.skills-preflight-summary {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--line);
}

.skills-preflight-summary strong {
  display: block;
  margin-bottom: 6px;
  color: var(--text);
  font-size: 14px;
}

.skills-preflight-summary p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.skills-preflight-summary.level-low {
  background: rgba(109, 240, 207, 0.08);
}

.skills-preflight-summary.level-medium {
  background: rgba(255, 190, 122, 0.1);
}

.skills-preflight-summary.level-high {
  background: rgba(255, 127, 143, 0.12);
}

.skills-cli-callout {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 190, 122, 0.08);
  border: 1px solid rgba(255, 190, 122, 0.18);
}

.skills-cli-command {
  display: grid;
  gap: 8px;
}

.skills-cli-command-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.skills-cli-command span {
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.skills-cli-command code {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--code-bg);
  border: 1px solid var(--line);
  color: var(--text-soft);
  font-size: 11px;
  line-height: 1.55;
  word-break: break-all;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
}

.skills-confirm-mask {
  position: fixed;
  inset: 0;
  background: rgba(7, 13, 23, 0.42);
  backdrop-filter: blur(4px);
  z-index: 90;
}

.skills-confirm-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(520px, calc(100vw - 32px));
  display: grid;
  gap: 14px;
  padding: 18px;
  transform: translate(-50%, -50%);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(10, 18, 30, 0.98), rgba(12, 24, 39, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.4);
  z-index: 91;
}

html[data-theme="light"] .skills-confirm-dialog {
  background: linear-gradient(180deg, rgba(251, 253, 255, 0.98), rgba(242, 247, 251, 0.96));
  box-shadow: 0 28px 90px rgba(77, 102, 132, 0.26);
}

.skills-confirm-detail {
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--line);
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.skills-preflight-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.skills-preflight-item strong {
  display: block;
  color: var(--text);
  font-size: 13px;
  margin-bottom: 5px;
}

.skills-preflight-item p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.skills-preflight-item > span {
  flex-shrink: 0;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.skills-preflight-item.risk-low > span {
  background: rgba(109, 240, 207, 0.12);
  color: var(--mint);
}

.skills-preflight-item.risk-medium > span {
  background: rgba(255, 190, 122, 0.14);
  color: var(--peach);
}

.skills-preflight-item.risk-high > span {
  background: rgba(255, 127, 143, 0.15);
  color: var(--coral);
}

.skills-inline-error {
  margin: 4px 0 0 0;
  color: var(--danger);
  font-size: 12px;
}

@media (max-width: 1200px) {
  .skills-toolbar-grid.market {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 980px) {
  .skills-plugin-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .skills-toolbar-grid,
  .skills-toolbar-grid.market,
  .skills-table-head,
  .skills-table-row,
  .skills-agent-matrix-grid,
  .skills-facts-grid,
  .skills-maintenance-grid,
  .skills-missing-grid,
  .skills-kv-row,
  .skills-config-row,
  .skills-mode-switch {
    grid-template-columns: minmax(0, 1fr);
  }

  .skills-table-head {
    display: none;
  }

  .skills-table-row {
    gap: 8px;
  }

  .skills-table-action {
    justify-content: flex-start;
  }

  .skills-drawer {
    top: 10px;
    right: 10px;
    bottom: 10px;
    width: calc(100vw - 20px);
    padding: 14px;
  }
}
</style>
