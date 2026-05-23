<template>
  <section class="page-shell plugins-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">{{ pageEyebrow }}</p>
        <h2 class="page-title">{{ text('插件控制中心', 'Plugin Control Center') }}</h2>
        <p class="page-copy">
          {{ text('管理 OpenClaw 宿主运行时扩展：插件发现、能力、策略、配置、安装记录和诊断。', 'Manage OpenClaw host runtime extensions: discovery, capabilities, policy, config, install records, and diagnostics.') }}
        </p>
      </div>

      <div class="page-actions">
        <span v-if="pluginPolicyDirty" class="plugins-dirty-pill">
          {{ text('有未保存更改', 'Unsaved changes') }} · {{ dirtyConfiguredPluginCount }}
        </span>
        <button type="button" class="secondary-button" :disabled="loading" @click="loadPlugins">
          {{ loading ? text('刷新中…', 'Refreshing...') : text('重新扫描', 'Rescan') }}
        </button>
        <button type="button" class="primary-button" :disabled="saving || loading" @click="saveConfig">
          {{ saving ? text('保存中…', 'Saving...') : text('保存策略', 'Save policy') }}
        </button>
      </div>
    </header>

    <div v-if="noticeMessage" class="status-banner" :class="noticeMessage.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ noticeMessage.text }}
    </div>

    <section class="plugins-command-center">
      <div>
        <p class="eyebrow">{{ text('RUNTIME EXTENSIONS', 'RUNTIME EXTENSIONS') }}</p>
        <h3>{{ form.enabled ? text('插件运行时已启用', 'Plugin runtime enabled') : text('插件运行时已关闭', 'Plugin runtime disabled') }}</h3>
        <p>{{ text('关键变更通常需要重启或新会话才能完全生效。先看诊断，再动策略。', 'Most critical changes require restart or new sessions. Check diagnostics before changing policy.') }}</p>
      </div>
      <div class="plugins-hero-metrics">
        <span>{{ text('已配置', 'Configured') }} {{ counts.entries }}</span>
        <span>{{ text('已发现', 'Discovered') }} {{ counts.manifests }}</span>
        <span>{{ text('启用', 'Enabled') }} {{ counts.enabledEntries }}</span>
        <span>{{ text('阻断', 'Blocked') }} {{ counts.blocked }}</span>
        <span>{{ text('异常', 'Issues') }} {{ counts.diagnostics }}</span>
      </div>
    </section>

    <nav class="plugins-tabs" :aria-label="text('插件页面', 'Plugin pages')">
      <button
        v-for="tab in pageTabs"
        :key="tab.value"
        type="button"
        class="plugins-tab"
        :class="{ active: activeTab === tab.value }"
        @click="activeTab = tab.value"
      >
        <component :is="tab.icon" class="plugins-tab-icon" aria-hidden="true" />
        <strong>{{ tab.label }}</strong>
      </button>
    </nav>

    <section v-if="activeTab === 'overview'" class="plugins-overview">
      <article class="plugins-posture-strip plugins-stage-card--wide">
        <div class="plugins-section-head">
          <div>
            <p class="eyebrow">{{ text('HEALTH', 'HEALTH') }}</p>
            <h3>{{ text('运行态势', 'Runtime posture') }}</h3>
            <p>{{ text('按配置、发现结果和诊断汇总插件运行风险。', 'Summarizes plugin runtime risk from config, discovery, and diagnostics.') }}</p>
          </div>
        </div>
        <div class="plugins-summary-grid">
          <article class="plugins-summary-card">
            <span>{{ text('插件系统', 'Plugin system') }}</span>
            <strong>{{ form.enabled ? text('启用', 'Enabled') : text('关闭', 'Off') }}</strong>
          </article>
          <article class="plugins-summary-card">
            <span>{{ text('Load Paths', 'Load Paths') }}</span>
            <strong>{{ form.loadPaths.length }}</strong>
          </article>
          <article class="plugins-summary-card">
            <span>{{ text('Manifests', 'Manifests') }}</span>
            <strong>{{ counts.manifests }}</strong>
          </article>
          <article class="plugins-summary-card">
            <span>{{ text('Diagnostics', 'Diagnostics') }}</span>
            <strong>{{ counts.diagnostics }}</strong>
          </article>
        </div>
      </article>

      <article class="plugins-side-pane plugins-stage-card">
        <div class="plugins-section-head compact">
          <h3>{{ text('能力索引', 'Capability index') }}</h3>
          <p>{{ text('根据 manifest kind、skills、configSchema 和插件 ID 推导。', 'Derived from manifest kind, skills, configSchema, and plugin id.') }}</p>
        </div>
        <div class="plugins-capability-grid">
          <span v-for="entry in capabilityEntries" :key="entry.key">
            <strong>{{ entry.key }}</strong>
            <em>{{ entry.ids.length }}</em>
          </span>
        </div>
      </article>

      <article class="plugins-side-pane plugins-stage-card">
        <div class="plugins-section-head compact">
          <h3>{{ text('关键插件', 'Critical plugins') }}</h3>
          <p>{{ text('这些插件决定 Studio、memory、browser、模型路由等核心能力是否正常。', 'These plugins control Studio, memory, browser, and model-routing critical paths.') }}</p>
        </div>
        <div class="plugins-critical-grid">
          <article
            v-for="card in criticalPluginCards"
            :key="card.id"
            class="plugins-critical-card"
            :class="{ danger: card.status !== 'enabled' && card.status !== 'available' }"
          >
            <div class="plugins-section-head compact">
              <h4>{{ card.label }}</h4>
              <span class="plugins-status-pill" :class="`is-${card.status}`">{{ card.statusLabel }}</span>
            </div>
            <p class="field-hint">{{ card.id }} · {{ card.source }}</p>
            <div class="plugins-chip-row">
              <span v-for="capability in card.capabilities" :key="`${card.id}-${capability}`">{{ capability }}</span>
              <span>{{ text('影响项', 'Impacts') }} {{ card.impacts }}</span>
            </div>
          </article>
        </div>
      </article>
    </section>

    <section v-else-if="activeTab === 'inventory'" class="plugins-layout">
      <aside class="plugins-rail">
        <div class="plugins-rail-head">
          <h3>{{ text('插件清单', 'Plugin inventory') }}</h3>
          <p>{{ text('包含已配置条目和 manifest-only 发现项。', 'Includes configured entries and manifest-only discoveries.') }}</p>
        </div>
        <label class="form-field">
          <span class="form-label">{{ text('搜索', 'Search') }}</span>
          <input v-model="pluginSearch" class="form-input" :placeholder="text('插件 ID / 名称 / 能力', 'Plugin id / name / capability')" />
        </label>
        <div class="plugins-filter-grid">
          <label class="form-field">
            <span class="form-label">{{ text('排序', 'Sort') }}</span>
            <select v-model="pluginSortMode" class="form-input">
              <option value="name">{{ text('按名称', 'By name') }}</option>
              <option value="status">{{ text('按状态', 'By status') }}</option>
              <option value="source">{{ text('按来源', 'By source') }}</option>
              <option value="critical">{{ text('关键优先', 'Critical first') }}</option>
              <option value="capabilities">{{ text('按能力数量', 'By capability count') }}</option>
            </select>
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('状态', 'Status') }}</span>
            <select v-model="pluginStatusFilter" class="form-input">
              <option value="all">{{ text('全部状态', 'All statuses') }}</option>
              <option value="enabled">{{ text('已启用', 'Enabled') }}</option>
              <option value="disabled">{{ text('已禁用', 'Disabled') }}</option>
              <option value="blocked">{{ text('被阻断', 'Blocked') }}</option>
              <option value="missing">{{ text('缺失', 'Missing') }}</option>
              <option value="available">{{ text('可配置', 'Available') }}</option>
            </select>
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('来源', 'Source') }}</span>
            <select v-model="pluginSourceFilter" class="form-input">
              <option value="all">{{ text('全部来源', 'All sources') }}</option>
              <option value="configured">{{ text('已配置', 'Configured') }}</option>
              <option value="manifest-only">{{ text('仅发现', 'Manifest only') }}</option>
            </select>
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('能力', 'Capability') }}</span>
            <select v-model="pluginCapabilityFilter" class="form-input">
              <option value="all">{{ text('全部能力', 'All capabilities') }}</option>
              <option v-for="capability in pluginCapabilityOptions" :key="capability" :value="capability">{{ capability }}</option>
            </select>
          </label>
          <label class="form-field">
            <span class="form-label">{{ text('关键性', 'Criticality') }}</span>
            <select v-model="pluginCriticalFilter" class="form-input">
              <option value="all">{{ text('全部', 'All') }}</option>
              <option value="critical">{{ text('关键插件', 'Critical') }}</option>
              <option value="non-critical">{{ text('普通插件', 'Non-critical') }}</option>
            </select>
          </label>
        </div>
        <div class="plugins-bulk-toolbar">
          <div class="plugins-guided-group-meta">
            <span>{{ text('已选择', 'Selected') }} {{ bulkSelectedPluginIds.length }}</span>
            <span>{{ text('可批量启用', 'Bulk enable') }} {{ bulkEnableEligibleIds.length }}</span>
            <span>{{ text('可批量禁用', 'Bulk disable') }} {{ bulkDisableEligibleIds.length }}</span>
          </div>
          <div class="plugins-inline-actions">
            <button
              type="button"
              class="secondary-button compact-button"
              :disabled="!visibleBulkSelectableIds.length"
              @click="toggleVisibleBulkPluginSelection(!allVisibleBulkSelected)"
            >
              {{
                allVisibleBulkSelected
                  ? text('取消全选可见项', 'Clear visible selection')
                  : text('选择可见项', 'Select visible')
              }}
            </button>
            <button
              type="button"
              class="secondary-button compact-button"
              :disabled="!bulkEnableEligibleIds.length || loading"
              @click="runBulkPluginToggle(true)"
            >
              {{ text('批量启用/接管', 'Bulk enable/adopt') }}
            </button>
            <button
              type="button"
              class="danger-link compact-button"
              :disabled="!bulkDisableEligibleIds.length || loading"
              @click="runBulkPluginToggle(false)"
            >
              {{ text('批量禁用已配置', 'Bulk disable configured') }}
            </button>
          </div>
        </div>
        <p class="field-hint">{{ text('当前筛选结果', 'Filtered results') }}: {{ filteredPluginRailItems.length }}</p>
        <div
          v-for="item in filteredPluginRailItems"
          :key="item.id"
          class="plugins-rail-row"
        >
          <label class="plugins-rail-check">
            <input
              class="form-checkbox"
              type="checkbox"
              :checked="isBulkPluginSelected(item.id)"
              :aria-label="text(`选择 ${item.name}`, `Select ${item.name}`)"
              @change="toggleBulkPluginSelection(item.id, ($event.target as HTMLInputElement).checked)"
            />
          </label>
          <button
            type="button"
            class="plugins-rail-item"
            :class="{ active: selectedPluginId === item.id }"
            @click="selectedPluginId = item.id"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.id }} · {{ pluginStatusLabel(item.status) }}</span>
          </button>
        </div>
        <div v-if="!filteredPluginRailItems.length" class="empty-inline">
          {{ text('当前筛选条件下没有匹配插件。', 'No plugins match the current filters.') }}
        </div>
      </aside>

      <main class="plugins-stage">
        <article class="plugins-stage-card">
          <div class="plugins-section-head">
            <div>
              <p class="eyebrow">{{ selectedPlugin?.source || 'PLUGIN' }}</p>
              <h3>{{ selectedPluginId || text('选择插件', 'Select a plugin') }}</h3>
              <p>{{ selectedPlugin?.manifest?.description || text('选择左侧插件查看 manifest、能力、配置和状态。', 'Select a plugin to inspect manifest, capabilities, config, and state.') }}</p>
            </div>
            <span v-if="selectedPlugin" class="plugins-status-pill" :class="`is-${selectedPlugin.status}`">{{ pluginStatusLabel(selectedPlugin.status) }}</span>
          </div>

          <template v-if="selectedPlugin">
            <div class="plugins-facts-grid">
              <div class="plugins-fact">
                <span>{{ text('名称', 'Name') }}</span>
                <strong>{{ selectedPlugin.manifest?.name || selectedPlugin.id }}</strong>
              </div>
              <div class="plugins-fact">
                <span>{{ text('版本', 'Version') }}</span>
                <strong>{{ selectedPlugin.manifest?.version || '—' }}</strong>
              </div>
              <div class="plugins-fact">
                <span>{{ text('类型', 'Kind') }}</span>
                <strong>{{ selectedPlugin.manifest?.kind || '—' }}</strong>
              </div>
              <div class="plugins-fact">
                <span>{{ text('路径', 'Path') }}</span>
                <strong>{{ selectedPlugin.manifest?.path || '—' }}</strong>
              </div>
            </div>
            <div class="plugins-chip-row">
              <span v-for="capability in selectedPlugin.capabilities" :key="capability">{{ capability }}</span>
            </div>
          </template>
        </article>

        <article v-if="selectedEntry" class="plugins-stage-card">
          <div class="plugins-section-head compact">
            <h3>{{ text('插件控制', 'Plugin controls') }}</h3>
            <p>{{ text('配置只保存非敏感字段；token/secret/password 不会在摘要中回显。', 'Only non-sensitive config is shown; token/secret/password fields are redacted.') }}</p>
          </div>
          <div class="plugins-inline-actions">
            <button
              type="button"
              class="primary-button"
              :disabled="loading"
              @click="applyPluginToggle(selectedPluginId, !selectedEntry.enabled)"
            >
              {{
                selectedEntry.enabled
                  ? text('立即禁用', 'Disable now')
                  : text('立即启用', 'Enable now')
              }}
            </button>
          </div>
          <label class="toggle-card">
            <input v-model="selectedEntry.enabled" class="form-checkbox" type="checkbox" />
            <div>
              <strong>{{ selectedEntry.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</strong>
              <span>{{ criticalPluginIds.has(selectedPluginId) ? text('这是关键插件，禁用前需要确认影响范围。', 'This is a critical plugin; review impact before disabling it.') : text('更改通常需要新会话或宿主重启后生效。', 'Changes usually apply after a new session or host restart.') }}</span>
            </div>
          </label>
          <div class="plugins-inline-actions">
            <button type="button" class="secondary-button compact-button" :class="{ active: pluginConfigMode === 'guided' }" @click="pluginConfigMode = 'guided'">
              {{ text('基础表单', 'Guided form') }}
            </button>
            <button type="button" class="secondary-button compact-button" :class="{ active: pluginConfigMode === 'json' }" @click="pluginConfigMode = 'json'">
              {{ text('高级 JSON', 'Advanced JSON') }}
            </button>
            <button
              v-if="pluginConfigMode === 'guided' && selectedPluginHasAdvancedFields"
              type="button"
              class="secondary-button compact-button"
              :class="{ active: showAdvancedGuidedFields }"
              @click="showAdvancedGuidedFields = !showAdvancedGuidedFields"
            >
              {{ showAdvancedGuidedFields ? text('隐藏高级字段', 'Hide advanced') : text('显示高级字段', 'Show advanced') }}
            </button>
          </div>
          <div class="plugins-guided-toolbar">
            <div class="plugins-guided-group-meta">
              <span v-if="selectedPluginDirty">{{ text('当前插件有未保存更改', 'Selected plugin has unsaved changes') }}</span>
              <span v-if="selectedPluginSchemaValidationIssues.length">{{ text('校验项', 'Validation') }} {{ selectedPluginSchemaValidationIssues.length }}</span>
              <span v-if="pluginPolicyDirty">{{ text('全局策略未保存', 'Policy unsaved') }}</span>
            </div>
            <div class="plugins-inline-actions">
              <button
                v-if="selectedPluginDirty"
                type="button"
                class="secondary-button compact-button"
                @click="resetSelectedPluginChanges"
              >
                {{ text('回退当前插件修改', 'Revert plugin edits') }}
              </button>
              <button
                type="button"
                class="primary-button compact-button"
                :disabled="saving || loading || !pluginPolicyDirty"
                @click="saveConfig"
              >
                {{ text('保存当前策略', 'Save current policy') }}
              </button>
            </div>
          </div>
          <div v-if="pluginConfigMode === 'guided' && selectedPluginSchemaGroupsForDisplay.length" class="plugins-guided-stack">
            <article v-if="selectedPluginSchemaValidationIssues.length" class="plugins-guided-summary" :class="{ danger: blockingSchemaIssueCount > 0 }">
              <strong>
                {{
                  blockingSchemaIssueCount > 0
                    ? text(`当前有 ${blockingSchemaIssueCount} 个阻断问题`, `${blockingSchemaIssueCount} blocking issues`)
                    : text('当前配置需要复核', 'Configuration needs review')
                }}
              </strong>
              <div class="plugins-guided-summary-list">
                <span
                  v-for="issue in selectedPluginSchemaValidationIssues"
                  :key="issue.key"
                  class="plugins-guided-summary-item"
                  :class="`is-${issue.level}`"
                >
                  {{ issue.title }}
                </span>
              </div>
            </article>
            <article v-for="group in selectedPluginSchemaGroupsForDisplay" :key="group.path" class="plugins-guided-group">
              <div class="plugins-guided-group-head">
                <div class="plugins-section-head compact">
                  <h4>{{ group.title }}</h4>
                  <p v-if="group.description">{{ group.description }}</p>
                </div>
                <div class="plugins-guided-group-meta">
                  <span>{{ group.fields.length }} {{ text('项', 'fields') }}</span>
                  <span v-if="groupHasAdvancedFields(group)">{{ text('含高级字段', 'has advanced') }}</span>
                  <span v-if="groupDefaultableFieldCount(group)">{{ text('可恢复默认值', 'defaults available') }}</span>
                  <span v-if="groupDirtyFieldCount(group)">{{ text('未保存字段', 'dirty fields') }} {{ groupDirtyFieldCount(group) }}</span>
                  <span v-if="groupIssueCount(group)">{{ text('问题', 'issues') }} {{ groupIssueCount(group) }}</span>
                </div>
                <div class="plugins-inline-actions">
                  <button
                    v-if="groupDirtyFieldCount(group)"
                    type="button"
                    class="secondary-button compact-button"
                    @click="revertGuidedGroupEdits(group.path)"
                  >
                    {{ text('回退本组修改', 'Revert group edits') }}
                  </button>
                  <button
                    v-if="groupDefaultableFieldCount(group)"
                    type="button"
                    class="secondary-button compact-button"
                    @click="restoreGuidedGroupDefaults(group.path)"
                  >
                    {{ text('本组恢复默认', 'Restore group defaults') }}
                  </button>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    @click="toggleGuidedGroup(group.path)"
                  >
                    {{ isGuidedGroupCollapsed(group.path) ? text('展开分组', 'Expand group') : text('折叠分组', 'Collapse group') }}
                  </button>
                </div>
              </div>
              <div v-if="!isGuidedGroupCollapsed(group.path)" class="plugins-guided-grid">
                <div v-for="field in group.fields" :key="field.path" class="form-field plugins-guided-field">
                  <div class="plugins-guided-field-head">
                    <span class="form-label">{{ field.label }}<small v-if="field.required"> *</small></span>
                    <div class="plugins-guided-field-chips">
                      <span v-if="field.advanced" class="plugins-guided-chip">{{ text('高级', 'Advanced') }}</span>
                      <span v-if="field.hasDefault" class="plugins-guided-chip">{{ text('有默认值', 'Has default') }}</span>
                      <span v-if="fieldUsesDefault(field)" class="plugins-guided-chip is-default">{{ text('当前使用默认值', 'Using default') }}</span>
                      <span v-if="fieldDirty(field)" class="plugins-guided-chip is-dirty">{{ text('已修改', 'Dirty') }}</span>
                    </div>
                  </div>
                  <code class="plugins-guided-path">{{ field.path }}</code>
                  <select
                    v-if="field.enumValues.length"
                    class="form-input"
                    :value="String(getGuidedFieldValue(field) ?? '')"
                    @change="updateGuidedPluginField(field, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">{{ text('未设置', 'Unset') }}</option>
                    <option v-for="option in field.enumValues" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <input
                    v-else-if="field.type === 'boolean'"
                    class="form-checkbox"
                    type="checkbox"
                    :checked="getGuidedFieldValue(field) === true"
                    @change="updateGuidedPluginField(field, ($event.target as HTMLInputElement).checked)"
                  />
                  <div v-else-if="field.type === 'array'" class="plugins-array-editor">
                    <div v-if="field.itemType === 'unsupported'" class="empty-inline">
                      {{ text('这个数组结构需要切到 JSON 模式编辑。', 'This array shape currently requires JSON mode.') }}
                    </div>
                    <template v-else>
                      <div
                        v-for="(item, index) in getGuidedArrayValues(field)"
                        :key="`${field.path}-${index}`"
                        class="plugins-array-row"
                      >
                        <input
                          v-if="field.itemType !== 'boolean'"
                          class="form-input"
                          :type="field.itemType === 'number' || field.itemType === 'integer' ? 'number' : 'text'"
                          :value="String(item ?? '')"
                          :placeholder="field.placeholder || text('输入条目值', 'Enter item value')"
                          @input="updateGuidedArrayField(field, index, ($event.target as HTMLInputElement).value)"
                        />
                        <label v-else class="toggle-card compact">
                          <input
                            class="form-checkbox"
                            type="checkbox"
                            :checked="item === true"
                            @change="updateGuidedArrayField(field, index, ($event.target as HTMLInputElement).checked)"
                          />
                          <div>
                            <strong>{{ text(`条目 ${index + 1}`, `Item ${index + 1}`) }}</strong>
                          </div>
                        </label>
                        <button type="button" class="danger-link compact-button" @click="removeGuidedArrayField(field, index)">
                          {{ text('移除', 'Remove') }}
                        </button>
                      </div>
                      <button type="button" class="secondary-button compact-button" @click="appendGuidedArrayField(field)">
                        {{ text('添加条目', 'Add item') }}
                      </button>
                    </template>
                  </div>
                  <textarea
                    v-else-if="field.multiline"
                    class="form-textarea"
                    :rows="field.rows"
                    :value="String(getGuidedFieldValue(field) ?? '')"
                    :placeholder="field.placeholder"
                    spellcheck="false"
                    @input="updateGuidedPluginField(field, ($event.target as HTMLTextAreaElement).value)"
                  />
                  <input
                    v-else
                    class="form-input"
                    :type="field.type === 'number' || field.type === 'integer' ? 'number' : 'text'"
                    :value="String(getGuidedFieldValue(field) ?? '')"
                    :placeholder="field.placeholder"
                    @input="updateGuidedPluginField(field, ($event.target as HTMLInputElement).value)"
                  />
                  <div class="plugins-guided-field-actions">
                    <span v-if="field.hasDefault" class="field-hint">
                      {{ text('默认值：', 'Default: ') }}{{ formatDefaultValue(field.defaultValue) }}
                    </span>
                    <button
                      v-if="field.hasDefault"
                      type="button"
                      class="secondary-button compact-button"
                      @click="applyGuidedFieldDefault(field)"
                    >
                      {{ text('恢复默认', 'Restore default') }}
                    </button>
                    <button
                      v-if="fieldHasCustomValue(field)"
                      type="button"
                      class="danger-link compact-button"
                      @click="clearGuidedField(field)"
                    >
                      {{ text('清空字段', 'Clear field') }}
                    </button>
                    <button
                      v-if="fieldDirty(field)"
                      type="button"
                      class="secondary-button compact-button"
                      @click="revertGuidedField(field)"
                    >
                      {{ text('回退修改', 'Revert edit') }}
                    </button>
                  </div>
                  <span v-if="field.help || field.description" class="field-hint">{{ field.help || field.description }}</span>
                </div>
              </div>
              <div v-else class="empty-inline">
                {{ text('该分组已折叠。展开后继续编辑。', 'This group is collapsed. Expand it to continue editing.') }}
              </div>
            </article>
          </div>
          <div v-else-if="pluginConfigMode === 'guided' && selectedPluginSchemaGroups.length && selectedPluginHasAdvancedFields" class="empty-inline">
            {{ text('当前字段都被标记为高级项。打开“显示高级字段”后可继续编辑。', 'All available fields are marked as advanced. Enable "Show advanced" to continue editing.') }}
          </div>
          <div v-else-if="pluginConfigMode === 'guided'" class="empty-inline">
            {{ text('当前 manifest 没有可渲染的基础配置 schema，使用 JSON 模式编辑。', 'This manifest does not expose a renderable config schema. Use JSON mode instead.') }}
          </div>
          <label v-if="pluginConfigMode === 'json'" class="form-field">
            <span class="form-label">{{ text('插件配置 JSON', 'Plugin config JSON') }}</span>
            <textarea
              :value="selectedPluginConfigJson"
              class="form-textarea plugins-json"
              rows="8"
              spellcheck="false"
              @input="onSelectedPluginConfigInput(($event.target as HTMLTextAreaElement).value)"
            />
          </label>
          <p v-if="selectedPluginConfigError" class="plugins-error">{{ selectedPluginConfigError }}</p>
          <div v-if="selectedPlugin?.impacts?.length" class="plugins-impact-list">
            <article v-for="impact in selectedPlugin.impacts" :key="impact.key" class="plugins-impact-card">
              <strong>{{ impact.title }}</strong>
              <p>{{ impact.detail }}</p>
            </article>
          </div>
        </article>

        <article v-else-if="selectedPlugin" class="plugins-stage-card">
          <div class="plugins-section-head compact">
            <h3>{{ text('快速接管', 'Quick activate') }}</h3>
            <p>{{ text('这个插件已被发现，但还没有配置 entry。可以先把它加入配置并启用，再回到策略页细调。', 'This plugin is discovered but has no configured entry yet. Add it to config and enable it first, then refine policy later.') }}</p>
          </div>
          <div class="plugins-inline-actions">
            <button type="button" class="primary-button" @click="adoptDiscoveredPlugin(selectedPlugin.id)">
              {{ text('加入配置并启用', 'Add and enable') }}
            </button>
          </div>
        </article>
      </main>
    </section>

    <section v-else-if="activeTab === 'policy'" class="plugins-policy-grid">
      <article class="plugins-stage-card plugins-stage-card--wide">
        <div class="plugins-section-head">
          <div>
            <p class="eyebrow">{{ text('POLICY', 'POLICY') }}</p>
            <h3>{{ text('运行时加载策略', 'Runtime load policy') }}</h3>
            <p>{{ text('先看策略摘要，再决定是调整安全边界、路径还是独占插槽。避免直接从原始配置入手。', 'Review the policy summary first, then adjust safety boundaries, paths, or exclusive slots instead of jumping straight into raw config.') }}</p>
          </div>
        </div>
        <div class="plugins-summary-grid">
          <article v-for="card in policySnapshotCards" :key="card.key" class="plugins-summary-card">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
          </article>
        </div>
        <label class="toggle-card">
          <input v-model="form.enabled" class="form-checkbox" type="checkbox" />
          <div>
            <strong>{{ text('全局启用插件系统', 'Enable plugin loading globally') }}</strong>
            <span>{{ text('关闭后插件配置保留，但宿主不会加载插件。', 'When disabled, plugin config remains but the host does not load plugins.') }}</span>
          </div>
        </label>
      </article>

      <PolicyListEditor
        :title="text('白名单', 'Allowlist')"
        :description="text('留空通常表示不强制限制；配置后只有列出的插件允许加载。', 'Empty usually means no hard restriction; once configured, only listed plugins may load.')"
        :placeholder="text('插件 ID', 'Plugin ID')"
        v-model="form.allow"
      />
      <PolicyListEditor
        :title="text('黑名单', 'Denylist')"
        :description="text('用于风险隔离或紧急阻止插件加载。', 'Use for risk isolation or emergency plugin load blocking.')"
        :placeholder="text('插件 ID', 'Plugin ID')"
        v-model="form.deny"
      />
      <PolicyListEditor
        class="plugins-stage-card--wide"
        :title="text('加载路径', 'Load paths')"
        :description="text('填写绝对路径；路径缺失会在诊断里提示。', 'Use absolute paths; missing paths are reported in diagnostics.')"
        :placeholder="text('插件加载路径', 'Plugin load path')"
        v-model="form.loadPaths"
      />

      <article class="plugins-stage-card plugins-stage-card--wide">
        <div class="plugins-section-head compact">
          <h3>{{ text('独占插槽', 'Exclusive slots') }}</h3>
          <p>{{ text('Memory 和 Context Engine 这类能力只能由一个插件提供。', 'Capabilities like Memory and Context Engine can be owned by one plugin at a time.') }}</p>
        </div>
        <div class="plugins-form-grid">
          <label class="form-field">
            <span class="form-label">Memory</span>
            <input v-model="form.slots.memory" class="form-input" placeholder="memory-core / none" />
          </label>
          <label class="form-field">
            <span class="form-label">Context Engine</span>
            <input v-model="form.slots.contextEngine" class="form-input" placeholder="context-engine-default" />
          </label>
        </div>
      </article>
    </section>

    <section v-else-if="activeTab === 'installs'" class="plugins-overview">
      <article class="plugins-stage-card plugins-stage-card--wide">
        <div class="plugins-section-head">
          <div>
            <p class="eyebrow">{{ text('INSTALLS', 'INSTALLS') }}</p>
            <h3>{{ text('安装与维护', 'Install & maintain') }}</h3>
            <p>{{ text('推荐先上传本地 .zip 插件包。高级来源安装保留给开发或排障使用。', 'Uploading a local .zip plugin package is the recommended flow. Advanced source installs are kept for development and troubleshooting.') }}</p>
          </div>
        </div>
        <div class="plugins-install-stack">
          <article class="plugins-stage-card">
            <div class="plugins-section-head compact">
              <h4>{{ text('上传本地插件包', 'Upload local plugin package') }}</h4>
              <p>{{ text('用户流程应从这里开始：上传 .zip，先检测结构，再安装。必须能定位唯一 openclaw.plugin.json。', 'This is the primary user flow: upload a .zip, validate its structure, then install it. Studio must locate exactly one openclaw.plugin.json.') }}</p>
            </div>
            <div class="plugins-summary-grid plugins-summary-grid--compact">
              <article class="plugins-summary-card">
                <span>{{ text('推荐入口', 'Recommended entry') }}</span>
                <strong>.zip</strong>
              </article>
              <article class="plugins-summary-card">
                <span>{{ text('结构校验', 'Validation') }}</span>
                <strong>openclaw.plugin.json</strong>
              </article>
              <article class="plugins-summary-card">
                <span>{{ text('安装方式', 'Install mode') }}</span>
                <strong>{{ text('官方 CLI', 'Official CLI') }}</strong>
              </article>
            </div>
            <div class="plugins-form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('插件压缩包', 'Plugin archive') }}</span>
                <input class="form-input" type="file" accept=".zip,application/zip" @change="handleUploadArchiveChange" />
                <span v-if="uploadFileName" class="field-hint">{{ uploadFileName }}</span>
              </label>
              <label class="toggle-card">
                <input v-model="pluginInstallForce" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('覆盖已有插件', 'Force overwrite') }}</strong>
                  <span>{{ text('上传安装会继承这个开关。', 'Uploaded installs inherit this switch.') }}</span>
                </div>
              </label>
              <label class="toggle-card">
                <input v-model="pluginInstallPin" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('固定版本记录', 'Pin install record') }}</strong>
                  <span>{{ text('如果安装器支持，会记录解析后的来源。', 'Stores the resolved source when the installer supports it.') }}</span>
                </div>
              </label>
            </div>
            <div class="plugins-inline-actions">
              <button type="button" class="secondary-button" :disabled="uploadBusy || !uploadDataBase64" @click="preflightUploadedArchive">
                {{ uploadBusy ? text('检测中…', 'Checking...') : text('检测插件压缩包', 'Validate plugin archive') }}
              </button>
              <button type="button" class="primary-button" :disabled="uploadBusy || !uploadPreflight || uploadPreflight.preflight.readiness === 'blocked'" @click="installUploadedArchiveFile">
                {{ uploadBusy ? text('安装中…', 'Installing...') : text('安装上传插件', 'Install uploaded plugin') }}
              </button>
            </div>
            <div v-if="uploadPreflight" class="plugins-preflight-card" :class="`is-${uploadPreflight.preflight.level}`">
              <strong>{{ uploadPreflight.preflight.summary }}</strong>
              <div class="plugins-chip-row">
                <span>{{ uploadPreflight.fileName }}</span>
                <span>{{ uploadPreflight.preflight.manifest?.id || text('未知插件', 'Unknown plugin') }}</span>
                <span>{{ uploadPreflight.preflight.readiness }}</span>
              </div>
              <div v-if="uploadPreflight.preflight.indicators.length" class="plugins-diagnostics">
                <article v-for="item in uploadPreflight.preflight.indicators" :key="item.key" class="plugins-diagnostic" :class="`is-${item.level}`">
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.detail }}</p>
                </article>
              </div>
            </div>
          </article>

          <div class="plugins-install-layout">
            <div class="plugins-stage">
              <article class="plugins-stage-card">
                <div class="plugins-section-head compact">
                  <h4>{{ text('高级来源安装', 'Advanced source install') }}</h4>
                  <p>{{ text('保留给 npm/path/clawhub spec、本地开发链接安装和排障使用。普通用户优先使用上面的上传入口。', 'Keep this for npm/path/clawhub specs, local dev links, and troubleshooting. Regular users should prefer the upload flow above.') }}</p>
                </div>
                <div class="plugins-form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('插件来源 / 路径', 'Plugin spec / path') }}</span>
                    <input v-model="pluginInstallSpec" class="form-input" :placeholder="text('例如 @openclaw/matrix 或 /abs/path/plugin', 'For example @openclaw/matrix or /abs/path/plugin')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Marketplace 源', 'Marketplace source') }}</span>
                    <input v-model="pluginInstallMarketplace" class="form-input" placeholder="clawhub-fixtures / custom" />
                  </label>
                  <label class="toggle-card">
                    <input v-model="pluginInstallLink" class="form-checkbox" type="checkbox" />
                    <div>
                      <strong>{{ text('本地链接安装', 'Link local path') }}</strong>
                      <span>{{ text('对应 --link，适合本地开发插件。', 'Maps to --link for local plugin development.') }}</span>
                    </div>
                  </label>
                </div>
                <div class="plugins-inline-actions">
                  <button type="button" class="secondary-button" :disabled="loading" @click="preflightInstallSpec">
                    {{ text('安装前预检', 'Run preflight') }}
                  </button>
                  <button type="button" class="primary-button" :disabled="loading || installBlockedByPreflight" @click="installPluginFromSpec">
                    {{ text('安装插件', 'Install plugin') }}
                  </button>
                  <button type="button" class="secondary-button" :disabled="loading || !form.installs.length" @click="updateSelectedInstall(true)">
                    {{ text('更新全部', 'Update all') }}
                  </button>
                  <button type="button" class="secondary-button" :disabled="loading || !selectedInstallRecord" @click="updateSelectedInstall(false)">
                    {{ text('更新当前', 'Update selected') }}
                  </button>
                  <button type="button" class="danger-link" :disabled="loading || !selectedInstallRecord" @click="uninstallSelectedInstall">
                    {{ text('卸载当前', 'Uninstall selected') }}
                  </button>
                </div>
              </article>
            </div>
            <aside class="plugins-preflight-card" :class="pluginPreflight ? `is-${pluginPreflight.level}` : ''">
              <div class="plugins-section-head compact">
                <h4>{{ text('高级来源预检', 'Advanced-source preflight') }}</h4>
                <p>{{ text('这里只有高级来源的预检结论；本地上传的预检在左侧单独展示。', 'This panel only shows advanced-source preflight results. Uploaded archive validation is shown in the left card.') }}</p>
              </div>
              <template v-if="pluginPreflight">
                <strong>{{ pluginPreflight.summary }}</strong>
                <div class="plugins-chip-row">
                  <span>{{ preflightReadinessLabel }}</span>
                  <span>{{ pluginPreflight.kind }}</span>
                  <span>{{ text('Manifest', 'Manifest') }} {{ pluginPreflight.manifestCount }}</span>
                </div>
                <div class="plugins-facts-grid plugins-facts-grid--compact">
                  <div class="plugins-fact">
                    <span>{{ text('目标', 'Spec') }}</span>
                    <strong>{{ pluginPreflight.spec }}</strong>
                  </div>
                  <div class="plugins-fact">
                    <span>{{ text('插件根目录', 'Plugin root') }}</span>
                    <strong>{{ pluginPreflight.pluginRoot || '—' }}</strong>
                  </div>
                  <div class="plugins-fact">
                    <span>{{ text('Manifest 路径', 'Manifest path') }}</span>
                    <strong>{{ pluginPreflight.manifestPath || '—' }}</strong>
                  </div>
                  <div class="plugins-fact">
                    <span>{{ text('生效方式', 'Activation') }}</span>
                    <strong>{{ pluginPreflight.requiresRestart ? text('需新会话/重启', 'Restart/new session') : text('立即生效', 'Immediate') }}</strong>
                  </div>
                </div>
                <div v-if="pluginPreflight.manifest" class="plugins-chip-row">
                  <span>{{ pluginPreflight.manifest.kind || 'plugin' }}</span>
                  <span v-for="cap in pluginPreflight.manifest.capabilities" :key="cap">{{ cap }}</span>
                </div>
                <div v-if="pluginPreflight.indicators.length" class="plugins-diagnostics">
                  <article v-for="item in pluginPreflight.indicators" :key="item.key" class="plugins-diagnostic" :class="`is-${item.level}`">
                    <strong>{{ item.title }}</strong>
                    <p>{{ item.detail }}</p>
                  </article>
                </div>
              </template>
              <div v-else class="empty-inline">
                {{ text('如果要从路径、npm 或 clawhub spec 安装，先在左侧填写来源并执行预检。', 'If you want to install from a path, npm, or clawhub spec, fill the source on the left and run preflight first.') }}
              </div>
            </aside>
          </div>
        </div>
        <div v-if="form.installs.length" class="plugins-install-grid">
          <div class="plugins-filter-grid plugins-stage-card--wide">
            <label class="form-field">
              <span class="form-label">{{ text('安装记录搜索', 'Install search') }}</span>
              <input
                v-model="installSearch"
                class="form-input"
                :placeholder="text('按 ID / 来源 / 路径 / spec 搜索', 'Search by id / source / path / spec')"
              />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('安装来源', 'Install source') }}</span>
              <select v-model="installSourceFilter" class="form-input">
                <option value="all">{{ text('全部来源', 'All sources') }}</option>
                <option v-for="source in installSourceOptions" :key="source" :value="source">{{ source }}</option>
              </select>
            </label>
          </div>
          <div class="plugins-bulk-toolbar plugins-stage-card--wide">
            <div class="plugins-guided-group-meta">
              <span>{{ text('已选择安装记录', 'Selected install records') }} {{ selectedInstallIds.length }}</span>
              <span>{{ text('当前筛选结果', 'Filtered installs') }} {{ filteredInstallRecords.length }}</span>
              <span>{{ text('总安装记录', 'Total installs') }} {{ form.installs.length }}</span>
            </div>
            <div class="plugins-inline-actions">
              <button
                type="button"
                class="secondary-button compact-button"
                @click="toggleAllInstallSelection(!allInstallSelected)"
              >
                {{ allInstallSelected ? text('取消全选筛选结果', 'Clear filtered selection') : text('全选筛选结果', 'Select filtered installs') }}
              </button>
              <button
                type="button"
                class="secondary-button compact-button"
                :disabled="!selectedInstallIds.length || loading"
                @click="runBulkInstallRecordAction('update')"
              >
                {{ text('批量更新选中', 'Bulk update selected') }}
              </button>
              <button
                type="button"
                class="danger-link compact-button"
                :disabled="!selectedInstallIds.length || loading"
                @click="runBulkInstallRecordAction('uninstall')"
              >
                {{ text('批量卸载选中', 'Bulk uninstall selected') }}
              </button>
            </div>
          </div>
          <div
            v-for="install in filteredInstallRecords"
            :key="install.id"
            class="plugins-install-row"
          >
            <label class="plugins-rail-check">
              <input
                class="form-checkbox"
                type="checkbox"
                :checked="selectedInstallIds.includes(install.id)"
                :aria-label="text(`选择安装记录 ${install.id}`, `Select install ${install.id}`)"
                @change="toggleInstallSelection(install.id, ($event.target as HTMLInputElement).checked)"
              />
            </label>
            <article
              class="plugins-install-card"
              :class="{ active: selectedPluginId === install.id }"
              @click="selectedPluginId = install.id"
            >
              <strong>{{ install.id }}</strong>
              <span>{{ install.source || text('未知来源', 'Unknown source') }}</span>
              <code>{{ install.installPath || install.resolvedSpec || install.spec || '—' }}</code>
            </article>
          </div>
          <div v-if="!filteredInstallRecords.length" class="empty-inline">
            {{ text('当前筛选条件下没有匹配安装记录。', 'No install records match the current filters.') }}
          </div>
        </div>
        <div v-else class="empty-inline">{{ text('当前没有安装记录。', 'No install records.') }}</div>
      </article>
    </section>

    <section v-else class="plugins-overview">
      <article class="plugins-stage-card plugins-stage-card--wide">
        <div class="plugins-section-head">
          <div>
            <p class="eyebrow">{{ text('DIAGNOSTICS', 'DIAGNOSTICS') }}</p>
            <h3>{{ text('诊断', 'Diagnostics') }}</h3>
            <p>{{ text('基于 manifest、配置和策略输出风险项。', 'Reports risks from manifests, config, and policy.') }}</p>
          </div>
        </div>
        <div class="plugins-diagnostics">
          <article v-for="item in combinedDiagnostics" :key="item.key" class="plugins-diagnostic" :class="`is-${item.level}`">
            <strong>{{ item.title }}</strong>
            <p>{{ item.detail }}</p>
          </article>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onActivated, onMounted, reactive, ref, watch, type PropType } from 'vue';
import { AlertTriangle, Boxes, Download, Gauge, SlidersHorizontal } from '@lucide/vue';
import { useRoute } from 'vue-router';
import type { ConfigSummaryPayload } from '../../../../../types/config';
import type {
  PluginEntrySummary,
  PluginPreflightResult,
  PluginUploadPreflightResult,
  PluginsSummaryPayload,
} from '../../../../../types/plugins';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import { useLocalePreference } from '../../shared/locale';
import {
  bulkTogglePluginEntries,
  bulkUninstallPluginInstalls,
  bulkUpdatePluginInstalls,
  fetchPluginsSummary,
  installPlugin,
  installUploadedPluginArchive,
  preflightPlugin,
  preflightUploadedPluginArchive,
  savePluginsConfig,
  togglePluginEntry,
  uninstallPlugin,
  updatePlugins,
} from './api';

interface PluginEntry {
  enabled: boolean;
  config?: Record<string, unknown>;
}

type PluginInstallRecord = NonNullable<NonNullable<ConfigSummaryPayload['plugins']>['installs']>[number];
type PluginsTab = 'overview' | 'inventory' | 'policy' | 'installs' | 'diagnostics';
type PluginConfigMode = 'guided' | 'json';
type PluginSortMode = 'name' | 'status' | 'source' | 'critical' | 'capabilities';
type GuidedSchemaFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'unsupported';

interface GuidedSchemaField {
  path: string;
  key: string;
  type: GuidedSchemaFieldType;
  enumValues: string[];
  description: string;
  label: string;
  help: string;
  advanced: boolean;
  required: boolean;
  itemType: 'string' | 'number' | 'integer' | 'boolean' | 'unsupported' | null;
  order: number;
  placeholder: string;
  multiline: boolean;
  rows: number;
  hasDefault: boolean;
  defaultValue: unknown;
}

interface GuidedSchemaGroup {
  path: string;
  title: string;
  description: string;
  fields: GuidedSchemaField[];
  order: number;
}

const PLUGINS_UI_STATE_STORAGE_KEY = 'openclaw.studio.plugins.ui.v1';

interface PersistedPluginsUiState {
  activeTab?: PluginsTab;
  pluginSearch?: string;
  pluginSortMode?: PluginSortMode;
  pluginStatusFilter?: 'all' | PluginEntrySummary['status'];
  pluginSourceFilter?: 'all' | PluginEntrySummary['source'];
  pluginCriticalFilter?: 'all' | 'critical' | 'non-critical';
  pluginCapabilityFilter?: 'all' | string;
  selectedPluginId?: string;
}

const PolicyListEditor = defineComponent({
  name: 'PolicyListEditor',
  props: {
    modelValue: { type: Array as PropType<string[]>, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    placeholder: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    const update = (index: number, value: string) => {
      const next = [...props.modelValue];
      next[index] = value;
      emit('update:modelValue', next);
    };
    const remove = (index: number) => {
      const next = [...props.modelValue];
      next.splice(index, 1);
      emit('update:modelValue', next);
    };
    const add = () => emit('update:modelValue', [...props.modelValue, '']);
    return () => h('article', { class: ['plugins-stage-card', attrs.class] }, [
      h('div', { class: 'plugins-section-head compact' }, [
        h('h3', props.title),
        h('p', props.description),
      ]),
      ...props.modelValue.map((item, index) => h('div', { class: 'plugins-kv-row', key: `${props.title}-${index}` }, [
        h('input', {
          class: 'form-input',
          value: item,
          placeholder: props.placeholder,
          onInput: (event: Event) => update(index, (event.target as HTMLInputElement).value),
        }),
        h('button', { type: 'button', class: 'danger-link compact-button', onClick: () => remove(index) }, '移除'),
      ])),
      h('button', { type: 'button', class: 'secondary-button compact-button', onClick: add }, 'Add'),
    ]);
  },
});

const props = defineProps<{ pageEyebrow: string }>();
const { text } = useLocalePreference();
const { confirm } = useConfirmDialog();
const route = useRoute();
const isPluginsRouteActive = computed(() => route.path === '/plugins' || route.path.startsWith('/plugins/'));
let pluginsPageBootstrapped = false;

function readPersistedPluginsUiState(): PersistedPluginsUiState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PLUGINS_UI_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedPluginsUiState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistPluginsUiState(nextState: PersistedPluginsUiState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PLUGINS_UI_STATE_STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // ignore storage failures
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

const persistedPluginsUiState = readPersistedPluginsUiState();

const loading = ref(false);
const saving = ref(false);
const activeTab = ref<PluginsTab>(persistedPluginsUiState.activeTab || 'overview');
const pluginConfigMode = ref<PluginConfigMode>('guided');
const showAdvancedGuidedFields = ref(false);
const guidedGroupCollapsed = ref<Record<string, boolean>>({});
const selectedPluginId = ref(persistedPluginsUiState.selectedPluginId || '');
const selectedPluginConfigDraft = ref('');
const selectedPluginConfigError = ref('');
const pluginSearch = ref(persistedPluginsUiState.pluginSearch || '');
const pluginSortMode = ref<PluginSortMode>(persistedPluginsUiState.pluginSortMode || 'name');
const pluginStatusFilter = ref<'all' | PluginEntrySummary['status']>(persistedPluginsUiState.pluginStatusFilter || 'all');
const pluginSourceFilter = ref<'all' | PluginEntrySummary['source']>(persistedPluginsUiState.pluginSourceFilter || 'all');
const pluginCriticalFilter = ref<'all' | 'critical' | 'non-critical'>(persistedPluginsUiState.pluginCriticalFilter || 'all');
const pluginCapabilityFilter = ref<'all' | string>(persistedPluginsUiState.pluginCapabilityFilter || 'all');
const bulkSelectedPluginIds = ref<string[]>([]);
const selectedInstallIds = ref<string[]>([]);
const installSearch = ref('');
const installSourceFilter = ref<'all' | string>('all');
const uploadBusy = ref(false);
const uploadFileName = ref('');
const uploadDataBase64 = ref('');
const uploadPreflight = ref<PluginUploadPreflightResult | null>(null);
const pluginInstallSpec = ref('');
const pluginInstallMarketplace = ref('');
const pluginInstallForce = ref(false);
const pluginInstallLink = ref(false);
const pluginInstallPin = ref(false);
const pluginPreflight = ref<PluginPreflightResult | null>(null);
const noticeMessage = ref<{ kind: 'success' | 'error'; text: string } | null>(null);
const summary = ref<PluginsSummaryPayload | null>(null);

const form = reactive({
  enabled: true,
  allow: [] as string[],
  deny: [] as string[],
  loadPaths: [] as string[],
  slots: { memory: '', contextEngine: '' },
  entries: {} as Record<string, PluginEntry>,
  installs: [] as PluginInstallRecord[],
});

const criticalPluginIds = new Set(['studio', 'memory-core', 'acpx', 'browser', 'openai']);
const criticalPluginList = ['studio', 'memory-core', 'acpx', 'browser', 'openai'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function splitConfigPath(pathValue: string): string[] {
  return pathValue.split('.').map((segment) => segment.trim()).filter(Boolean);
}

function readConfigValue(root: Record<string, unknown> | undefined, pathValue: string): unknown {
  const segments = splitConfigPath(pathValue);
  let current: unknown = root;
  for (const segment of segments) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function hasConfigValue(root: Record<string, unknown> | undefined, pathValue: string): boolean {
  return readConfigValue(root, pathValue) !== undefined;
}

function pruneConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const next = value
      .map((item) => pruneConfigValue(item))
      .filter((item) => !(item == null || item === ''));
    return next.length ? next : undefined;
  }
  if (isRecord(value)) {
    const nextEntries = Object.entries(value)
      .map(([key, entry]) => [key, pruneConfigValue(entry)] as const)
      .filter(([, entry]) => entry != null && entry !== '');
    return nextEntries.length ? Object.fromEntries(nextEntries) : undefined;
  }
  return value;
}

function writeConfigValue(root: Record<string, unknown> | undefined, pathValue: string, nextValue: unknown): Record<string, unknown> {
  const nextRoot = { ...(root || {}) };
  const segments = splitConfigPath(pathValue);
  if (!segments.length) return nextRoot;
  let current: Record<string, unknown> = nextRoot;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    current[segment] = isRecord(current[segment]) ? { ...(current[segment] as Record<string, unknown>) } : {};
    current = current[segment] as Record<string, unknown>;
  }
  const leaf = segments[segments.length - 1];
  if (nextValue === undefined || nextValue === null || nextValue === '') {
    delete current[leaf];
  } else {
    current[leaf] = nextValue;
  }
  return (pruneConfigValue(nextRoot) as Record<string, unknown>) || {};
}

function prettifySchemaKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function normalizeSchemaFieldType(value: unknown): GuidedSchemaFieldType {
  if (value === 'string' || value === 'number' || value === 'integer' || value === 'boolean' || value === 'array') {
    return value;
  }
  return 'unsupported';
}

function normalizeArrayItemType(value: unknown): GuidedSchemaField['itemType'] {
  if (value === 'string' || value === 'number' || value === 'integer' || value === 'boolean') {
    return value;
  }
  return 'unsupported';
}

function toNumericOrder(value: unknown, fallback = 999): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coerceGuidedValue(field: GuidedSchemaField, rawValue: unknown): unknown {
  if (field.type === 'boolean') return rawValue === true;
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === 'boolean') return rawValue;
  if (field.type === 'number' || field.type === 'integer') {
    if (typeof rawValue === 'number') {
      return Number.isFinite(rawValue) ? rawValue : undefined;
    }
    if (typeof rawValue !== 'string') {
      return rawValue;
    }
    if (rawValue.trim() === '') return undefined;
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : rawValue;
  }
  if (field.type === 'array') {
    return rawValue;
  }
  return rawValue;
}

function cloneDefaultValue<T>(value: T): T {
  if (value == null) return value;
  if (Array.isArray(value) || isRecord(value)) {
    return JSON.parse(JSON.stringify(value)) as T;
  }
  return value;
}

function formatDefaultValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '[]';
  if (isRecord(value)) return JSON.stringify(value);
  return text('未设置', 'Unset');
}

const PLUGIN_STATUS_SORT_ORDER: Record<PluginEntrySummary['status'], number> = {
  enabled: 0,
  disabled: 1,
  blocked: 2,
  missing: 3,
  available: 4,
};

const PLUGIN_SOURCE_SORT_ORDER: Record<PluginEntrySummary['source'], number> = {
  configured: 0,
  'manifest-only': 1,
};

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeComparableValue(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeComparableValue(entry)]),
    );
  }
  return value;
}

function normalizeEntryState(entry: { enabled?: boolean; config?: Record<string, unknown> | null } | null | undefined) {
  return {
    enabled: entry?.enabled !== false,
    config: normalizeComparableValue(entry?.config || {}),
  };
}

const counts = computed(() => summary.value?.counts || {
  entries: 0,
  manifests: 0,
  enabledEntries: 0,
  blocked: 0,
  missing: 0,
  loadPaths: 0,
  diagnostics: 0,
});
const pageTabs = computed(() => [
  { value: 'overview' as const, icon: Gauge, label: text('总览', 'Overview') },
  { value: 'inventory' as const, icon: Boxes, label: text('清单', 'Inventory') },
  { value: 'policy' as const, icon: SlidersHorizontal, label: text('策略', 'Policy') },
  { value: 'installs' as const, icon: Download, label: text('安装', 'Installs') },
  { value: 'diagnostics' as const, icon: AlertTriangle, label: text('诊断', 'Diagnostics') },
]);
const allPluginItems = computed<PluginEntrySummary[]>(() => summary.value?.entries || []);
const pluginEntryIds = computed(() => Object.keys(form.entries).sort());
const pluginRailItems = computed(() =>
  allPluginItems.value.map((item) => ({
    id: item.id,
    name: item.manifest?.name || item.id,
    enabled: item.enabled,
    status: item.status,
    source: item.source,
    capabilities: item.capabilities,
    critical: item.critical,
  })),
);
const sortedPluginRailItems = computed(() => {
  const items = [...pluginRailItems.value];
  return items.sort((left, right) => {
    switch (pluginSortMode.value) {
      case 'status':
        return (PLUGIN_STATUS_SORT_ORDER[left.status] ?? 99) - (PLUGIN_STATUS_SORT_ORDER[right.status] ?? 99)
          || left.name.localeCompare(right.name);
      case 'source':
        return (PLUGIN_SOURCE_SORT_ORDER[left.source] ?? 99) - (PLUGIN_SOURCE_SORT_ORDER[right.source] ?? 99)
          || left.name.localeCompare(right.name);
      case 'critical':
        return Number(right.critical) - Number(left.critical)
          || left.name.localeCompare(right.name);
      case 'capabilities':
        return right.capabilities.length - left.capabilities.length
          || left.name.localeCompare(right.name);
      case 'name':
      default:
        return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
    }
  });
});
const pluginCapabilityOptions = computed(() =>
  Array.from(new Set(allPluginItems.value.flatMap((item) => item.capabilities))).sort(),
);
const bulkSelectedPlugins = computed(() =>
  bulkSelectedPluginIds.value
    .map((id) => allPluginItems.value.find((item) => item.id === id) || null)
    .filter((item): item is PluginEntrySummary => item != null),
);
const filteredPluginRailItems = computed(() => {
  const keyword = pluginSearch.value.trim().toLowerCase();
  return sortedPluginRailItems.value.filter((item) => {
    if (keyword && ![item.id, item.name, item.status, item.source, ...item.capabilities].join(' ').toLowerCase().includes(keyword)) {
      return false;
    }
    if (pluginStatusFilter.value !== 'all' && item.status !== pluginStatusFilter.value) {
      return false;
    }
    if (pluginSourceFilter.value !== 'all' && item.source !== pluginSourceFilter.value) {
      return false;
    }
    if (pluginCriticalFilter.value === 'critical' && !item.critical) {
      return false;
    }
    if (pluginCriticalFilter.value === 'non-critical' && item.critical) {
      return false;
    }
    if (pluginCapabilityFilter.value !== 'all' && !item.capabilities.includes(pluginCapabilityFilter.value)) {
      return false;
    }
    return true;
  });
});
const visibleBulkSelectableIds = computed(() => filteredPluginRailItems.value.map((item) => item.id));
const allVisibleBulkSelected = computed(() =>
  visibleBulkSelectableIds.value.length > 0
  && visibleBulkSelectableIds.value.every((id) => bulkSelectedPluginIds.value.includes(id)),
);
const bulkEnableEligibleIds = computed(() =>
  bulkSelectedPlugins.value
    .filter((item) => item.status !== 'blocked' && (item.source === 'manifest-only' || item.status === 'disabled' || item.status === 'missing'))
    .map((item) => item.id),
);
const bulkDisableEligibleIds = computed(() =>
  bulkSelectedPlugins.value
    .filter((item) => item.source === 'configured' && item.enabled)
    .map((item) => item.id),
);
const selectedPlugin = computed(() => allPluginItems.value.find((item) => item.id === selectedPluginId.value) || null);
const selectedEntry = computed(() => selectedPluginId.value ? form.entries[selectedPluginId.value] : null);
const selectedPluginConfigJson = computed(() => selectedPluginConfigDraft.value);
const selectedPluginSchemaGroups = computed<GuidedSchemaGroup[]>(() => {
  const schema = selectedPlugin.value?.manifest?.configSchema;
  if (!isRecord(schema)) return [];
  const uiHints = selectedPlugin.value?.manifest?.uiHints || {};
  const groups = new Map<string, GuidedSchemaGroup>();
  const rootUiHint = (uiHints.__root__ || uiHints.root || {}) as Record<string, unknown>;

  const resolveUiHint = (pathValue: string, fallbackKey?: string): Record<string, unknown> => {
    const direct = uiHints[pathValue];
    if (isRecord(direct)) return direct;
    if (fallbackKey) {
      const fallback = uiHints[fallbackKey];
      if (isRecord(fallback)) return fallback;
    }
    return {};
  };

  const ensureGroup = (groupPath: string, title: string, description: string, order = 999) => {
    if (!groups.has(groupPath)) {
      groups.set(groupPath, {
        path: groupPath,
        title,
        description,
        fields: [],
        order,
      });
    }
    const group = groups.get(groupPath)!;
    if (!group.description && description) group.description = description;
    if (group.title === prettifySchemaKey(group.path) && title) group.title = title;
    group.order = Math.min(group.order, order);
    return group;
  };

  const walk = (node: Record<string, unknown>, nodePath: string, fallbackTitle: string) => {
    const uiHint = resolveUiHint(nodePath, fallbackTitle);
    const title = typeof uiHint.label === 'string'
      ? uiHint.label
      : nodePath
        ? prettifySchemaKey(nodePath.split('.').slice(-1)[0] || fallbackTitle)
        : text('基础设置', 'Core settings');
    const description = typeof uiHint.help === 'string'
      ? uiHint.help
      : typeof node.description === 'string'
        ? node.description
        : '';
    const groupPath = nodePath || '__root__';
    const groupOrder = toNumericOrder(uiHint.order, groupPath === '__root__' ? -10 : 999);
    const group = ensureGroup(groupPath, title, description, groupOrder);
    const properties = isRecord(node.properties) ? node.properties : {};
    const required = Array.isArray(node.required) ? node.required.map(String) : [];
    for (const [key, rawChild] of Object.entries(properties)) {
      if (!isRecord(rawChild)) continue;
      const childPath = nodePath ? `${nodePath}.${key}` : key;
      const childHint = resolveUiHint(childPath, key);
      const childType = normalizeSchemaFieldType(rawChild.type);
      const childGroupPath = typeof childHint.group === 'string' && childHint.group.trim()
        ? childHint.group.trim()
        : groupPath;
      const childGroupTitle = typeof childHint.groupLabel === 'string'
        ? childHint.groupLabel
        : childGroupPath === '__root__'
          ? title
          : prettifySchemaKey(childGroupPath.split('.').slice(-1)[0] || childGroupPath);
      const childGroupDescription = typeof childHint.groupHelp === 'string'
        ? childHint.groupHelp
        : '';
      const childGroupOrder = toNumericOrder(childHint.groupOrder, groupOrder);
      if (childType === 'unsupported' && isRecord(rawChild.properties)) {
        walk(rawChild, childPath, key);
        continue;
      }
      const targetGroup = ensureGroup(childGroupPath, childGroupTitle, childGroupDescription, childGroupOrder);
      if (childType === 'array') {
        const itemType = isRecord(rawChild.items) ? normalizeArrayItemType(rawChild.items.type) : 'unsupported';
        const hasDefault = Object.prototype.hasOwnProperty.call(rawChild, 'default');
        const defaultValue = hasDefault ? cloneDefaultValue(rawChild.default) : null;
        targetGroup.fields.push({
          path: childPath,
          key,
          type: 'array',
          enumValues: [],
          description: typeof rawChild.description === 'string' ? rawChild.description : '',
          label: typeof childHint.label === 'string' ? childHint.label : prettifySchemaKey(key),
          help: typeof childHint.help === 'string' ? childHint.help : '',
          advanced: childHint.advanced === true,
          required: required.includes(key),
          itemType,
          order: toNumericOrder(childHint.order),
          placeholder: typeof childHint.placeholder === 'string'
            ? childHint.placeholder
            : hasDefault && Array.isArray(defaultValue)
              ? JSON.stringify(defaultValue)
              : '',
          multiline: false,
          rows: typeof childHint.rows === 'number' && Number.isFinite(childHint.rows) ? childHint.rows : 3,
          hasDefault,
          defaultValue,
        });
        continue;
      }
      const hasDefault = Object.prototype.hasOwnProperty.call(rawChild, 'default');
      const defaultValue = hasDefault ? cloneDefaultValue(rawChild.default) : null;
      targetGroup.fields.push({
        path: childPath,
        key,
        type: childType,
        enumValues: Array.isArray(rawChild.enum) ? rawChild.enum.map(String) : [],
        description: typeof rawChild.description === 'string' ? rawChild.description : '',
        label: typeof childHint.label === 'string' ? childHint.label : prettifySchemaKey(key),
        help: typeof childHint.help === 'string' ? childHint.help : '',
        advanced: childHint.advanced === true,
        required: required.includes(key),
        itemType: null,
        order: toNumericOrder(childHint.order),
        placeholder: typeof childHint.placeholder === 'string'
          ? childHint.placeholder
          : hasDefault && (typeof defaultValue === 'string' || typeof defaultValue === 'number')
            ? String(defaultValue)
            : '',
        multiline: childHint.multiline === true,
        rows: typeof childHint.rows === 'number' && Number.isFinite(childHint.rows) ? childHint.rows : 4,
        hasDefault,
        defaultValue,
      });
    }
  };

  walk(schema, '', 'root');
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      title: group.path === '__root__' && typeof rootUiHint.label === 'string' ? rootUiHint.label : group.title,
      description: group.path === '__root__' && typeof rootUiHint.help === 'string' && rootUiHint.help
        ? rootUiHint.help
        : group.description,
      order: group.path === '__root__' ? toNumericOrder(rootUiHint.order, -10) : group.order,
      fields: group.fields.sort((left, right) => left.order - right.order || left.label.localeCompare(right.label)),
    }))
    .filter((group) => group.fields.length)
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.title.localeCompare(right.title);
    });
});
const selectedPluginSchemaGroupsForDisplay = computed(() =>
  selectedPluginSchemaGroups.value
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => showAdvancedGuidedFields.value || !field.advanced),
    }))
    .filter((group) => group.fields.length),
);
const selectedPluginSchemaFields = computed(() =>
  selectedPluginSchemaGroups.value.flatMap((group) => group.fields),
);
const selectedPluginSchemaGroupMap = computed(() =>
  Object.fromEntries(selectedPluginSchemaGroups.value.map((group) => [group.path, group])) as Record<string, GuidedSchemaGroup>,
);
const selectedPluginHasAdvancedFields = computed(() =>
  selectedPluginSchemaFields.value.some((field) => field.advanced),
);
const selectedPluginSchemaValidationIssues = computed(() => {
  const issues: Array<{ key: string; level: 'warn' | 'danger'; title: string; detail: string }> = [];
  const config = selectedEntry.value?.config || {};
  for (const field of selectedPluginSchemaFields.value) {
    const value = readConfigValue(config, field.path);
    const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
    if (field.required && isEmpty) {
      issues.push({
        key: `required-${field.path}`,
        level: 'danger',
        title: text(`缺少必填字段：${field.label}`, `Missing required field: ${field.label}`),
        detail: field.path,
      });
      continue;
    }
    if (field.type === 'number' || field.type === 'integer') {
      if (value != null && value !== '' && (typeof value !== 'number' || Number.isNaN(value))) {
        issues.push({
          key: `number-${field.path}`,
          level: 'danger',
          title: text(`字段类型错误：${field.label}`, `Invalid numeric field: ${field.label}`),
          detail: text('当前值不是数字。', 'Current value is not numeric.'),
        });
      } else if (field.type === 'integer' && typeof value === 'number' && !Number.isInteger(value)) {
        issues.push({
          key: `integer-${field.path}`,
          level: 'danger',
          title: text(`字段必须是整数：${field.label}`, `Field must be an integer: ${field.label}`),
          detail: field.path,
        });
      }
    }
    if (field.enumValues.length && value != null && value !== '' && !field.enumValues.includes(String(value))) {
      issues.push({
        key: `enum-${field.path}`,
        level: 'warn',
        title: text(`字段值不在枚举中：${field.label}`, `Value is outside enum: ${field.label}`),
        detail: `${value}`,
      });
    }
    if (field.type === 'array' && field.itemType === 'unsupported') {
      issues.push({
        key: `array-${field.path}`,
        level: 'warn',
        title: text(`数组结构需要 JSON 模式：${field.label}`, `Array shape requires JSON mode: ${field.label}`),
        detail: text('当前只支持原始类型数组（string/number/boolean/integer）的可视化编辑。', 'Only primitive arrays are editable in guided mode right now.'),
      });
    }
  }
  return issues;
});
const blockingSchemaIssueCount = computed(() =>
  selectedPluginSchemaValidationIssues.value.filter((issue) => issue.level === 'danger').length,
);
const capabilityEntries = computed(() => Object.entries(summary.value?.capabilityIndex || {}).map(([key, ids]) => ({ key, ids })));
const criticalPluginCards = computed(() =>
  criticalPluginList.map((id) => {
    const entry = allPluginItems.value.find((item) => item.id === id) || null;
    return {
      id,
      label: entry?.manifest?.name || id,
      status: entry?.status || 'missing',
      statusLabel: pluginStatusLabel(entry?.status || 'missing'),
      source: entry?.source === 'manifest-only'
        ? text('仅发现', 'Manifest only')
        : text('已配置', 'Configured'),
      impacts: entry?.impacts?.length || 0,
      capabilities: entry?.capabilities?.slice(0, 3) || [],
    };
  }),
);
const policySnapshotCards = computed(() => [
  {
    key: 'enabled',
    label: text('插件运行时', 'Plugin runtime'),
    value: form.enabled ? text('开启', 'On') : text('关闭', 'Off'),
  },
  {
    key: 'allow',
    label: text('白名单', 'Allowlist'),
    value: normalizedAllow.value.length || 0,
  },
  {
    key: 'deny',
    label: text('黑名单', 'Denylist'),
    value: normalizedDeny.value.length || 0,
  },
  {
    key: 'paths',
    label: text('加载路径', 'Load paths'),
    value: normalizedLoadPaths.value.length || 0,
  },
  {
    key: 'slots',
    label: text('独占插槽', 'Slots'),
    value: [form.slots.memory.trim(), form.slots.contextEngine.trim()].filter(Boolean).length || 0,
  },
]);
const combinedDiagnostics = computed(() => {
  const serverDiagnostics = summary.value?.diagnostics || [];
  const local = localDiagnostics.value;
  const byKey = new Map([...serverDiagnostics, ...local].map((item) => [item.key, item]));
  return Array.from(byKey.values());
});
const baselinePolicyState = computed(() => {
  if (!summary.value) return null;
  return {
    enabled: summary.value.enabled !== false,
    allow: [...(summary.value.allow || [])].sort(),
    deny: [...(summary.value.deny || [])].sort(),
    loadPaths: [...(summary.value.loadPaths || [])].sort(),
    slots: {
      memory: summary.value.slots?.memory || '',
      contextEngine: summary.value.slots?.contextEngine || '',
    },
    entries: Object.fromEntries(
      summary.value.entries
        .filter((entry) => entry.source === 'configured')
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((entry) => [entry.id, normalizeEntryState(entry)]),
    ),
  };
});
const currentPolicyState = computed(() => ({
  enabled: form.enabled,
  allow: [...normalizedAllow.value].sort(),
  deny: [...normalizedDeny.value].sort(),
  loadPaths: [...normalizedLoadPaths.value].sort(),
  slots: {
    memory: form.slots.memory.trim(),
    contextEngine: form.slots.contextEngine.trim(),
  },
  entries: Object.fromEntries(
    Object.entries(form.entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, entry]) => [id, normalizeEntryState(entry)]),
  ),
}));
const pluginPolicyDirty = computed(() =>
  baselinePolicyState.value != null
  && JSON.stringify(normalizeComparableValue(currentPolicyState.value)) !== JSON.stringify(normalizeComparableValue(baselinePolicyState.value)),
);
const dirtyConfiguredPluginCount = computed(() => {
  const baselineEntries = isRecord(baselinePolicyState.value?.entries) ? baselinePolicyState.value?.entries as Record<string, unknown> : {};
  const currentEntries = currentPolicyState.value.entries as Record<string, unknown>;
  const ids = Array.from(new Set([...Object.keys(baselineEntries), ...Object.keys(currentEntries)]));
  return ids.filter((id) => JSON.stringify(currentEntries[id] ?? null) !== JSON.stringify(baselineEntries[id] ?? null)).length;
});
const selectedPluginBaselineEntry = computed(() => {
  if (!selectedPluginId.value || !summary.value) return null;
  const entry = summary.value.entries.find((item) => item.id === selectedPluginId.value && item.source === 'configured');
  return entry ? normalizeEntryState(entry) : null;
});
const selectedPluginCurrentEntry = computed(() =>
  selectedEntry.value ? normalizeEntryState(selectedEntry.value) : null,
);
const selectedPluginDirty = computed(() =>
  JSON.stringify(selectedPluginCurrentEntry.value ?? null) !== JSON.stringify(selectedPluginBaselineEntry.value ?? null),
);

const selectedInstallRecord = computed(() =>
  summary.value?.installs.find((item) => item.id === selectedPluginId.value) || null,
);
const selectedInstallRecords = computed(() =>
  form.installs.filter((item) => selectedInstallIds.value.includes(item.id)),
);
const installSourceOptions = computed(() =>
  Array.from(new Set(form.installs.map((item) => item.source || '').filter(Boolean))).sort(),
);
const filteredInstallRecords = computed(() => {
  const keyword = installSearch.value.trim().toLowerCase();
  return form.installs.filter((item) => {
    if (installSourceFilter.value !== 'all' && (item.source || '') !== installSourceFilter.value) {
      return false;
    }
    if (!keyword) return true;
    return [item.id, item.source || '', item.installPath || '', item.resolvedSpec || '', item.spec || '']
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
});
const allInstallSelected = computed(() =>
  filteredInstallRecords.value.length > 0 && filteredInstallRecords.value.every((item) => selectedInstallIds.value.includes(item.id)),
);
const installBlockedByPreflight = computed(() =>
  pluginPreflight.value?.spec === pluginInstallSpec.value.trim() && pluginPreflight.value.level === 'danger',
);
const preflightReadinessLabel = computed(() => {
  switch (pluginPreflight.value?.readiness) {
    case 'ready': return text('可安装', 'Ready');
    case 'review': return text('需复核', 'Needs review');
    case 'blocked': return text('阻止安装', 'Blocked');
    default: return '';
  }
});

function pluginStatusLabel(status: PluginEntrySummary['status']): string {
  switch (status) {
    case 'enabled': return text('已启用', 'Enabled');
    case 'disabled': return text('已禁用', 'Disabled');
    case 'blocked': return text('被策略阻断', 'Blocked');
    case 'missing': return text('缺失', 'Missing');
    case 'available': return text('可配置', 'Available');
    default: return status;
  }
}

function isCriticalDisabled(id: string): boolean {
  const item = allPluginItems.value.find((plugin) => plugin.id === id);
  return Boolean(item && item.status !== 'enabled' && item.status !== 'available');
}

function isBulkPluginSelected(id: string): boolean {
  return bulkSelectedPluginIds.value.includes(id);
}

function setBulkSelectedPluginIds(ids: string[]): void {
  bulkSelectedPluginIds.value = Array.from(new Set(ids.filter(Boolean)));
}

function toggleBulkPluginSelection(id: string, selected: boolean): void {
  if (selected) {
    setBulkSelectedPluginIds([...bulkSelectedPluginIds.value, id]);
    return;
  }
  setBulkSelectedPluginIds(bulkSelectedPluginIds.value.filter((item) => item !== id));
}

function toggleVisibleBulkPluginSelection(selected: boolean): void {
  if (selected) {
    setBulkSelectedPluginIds([...bulkSelectedPluginIds.value, ...visibleBulkSelectableIds.value]);
    return;
  }
  setBulkSelectedPluginIds(bulkSelectedPluginIds.value.filter((id) => !visibleBulkSelectableIds.value.includes(id)));
}

function reconcileBulkPluginSelection(entryIds: string[]): void {
  setBulkSelectedPluginIds(bulkSelectedPluginIds.value.filter((id) => entryIds.includes(id)));
}

function setSelectedInstallIds(ids: string[]): void {
  selectedInstallIds.value = Array.from(new Set(ids.filter(Boolean)));
}

function toggleInstallSelection(id: string, selected: boolean): void {
  if (selected) {
    setSelectedInstallIds([...selectedInstallIds.value, id]);
    return;
  }
  setSelectedInstallIds(selectedInstallIds.value.filter((item) => item !== id));
}

function toggleAllInstallSelection(selected: boolean): void {
  if (selected) {
    setSelectedInstallIds([...selectedInstallIds.value, ...filteredInstallRecords.value.map((item) => item.id)]);
    return;
  }
  setSelectedInstallIds(selectedInstallIds.value.filter((id) => !filteredInstallRecords.value.some((item) => item.id === id)));
}

function reconcileInstallSelection(ids: string[]): void {
  setSelectedInstallIds(selectedInstallIds.value.filter((id) => ids.includes(id)));
}

function normalizeList(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function ensureEntry(pluginId: string): PluginEntry {
  if (!form.entries[pluginId]) {
    form.entries[pluginId] = { enabled: true, config: {} };
  }
  return form.entries[pluginId];
}

const normalizedAllow = computed(() => normalizeList(form.allow));
const normalizedDeny = computed(() => normalizeList(form.deny));
const normalizedLoadPaths = computed(() => normalizeList(form.loadPaths));

const localDiagnostics = computed(() => {
  const items: Array<{ key: string; level: 'warn' | 'danger' | 'info'; title: string; detail: string }> = [];
  if (!form.enabled) {
    items.push({ key: 'plugins-disabled-local', level: 'danger', title: text('插件系统已关闭', 'Plugin system disabled'), detail: text('宿主不会加载插件。', 'The host will not load plugins.') });
  }
  for (const id of normalizedDeny.value) {
    if (normalizedAllow.value.includes(id)) {
      items.push({ key: `deny-allow-conflict-local-${id}`, level: 'danger', title: text(`白名单/黑名单冲突：${id}`, `Allow/Deny conflict: ${id}`), detail: id });
    }
  }
  for (const path of normalizedLoadPaths.value) {
    if (!path.startsWith('/')) {
      items.push({ key: `relative-path-local-${path}`, level: 'warn', title: text('加载路径不是绝对路径', 'Load path is not absolute'), detail: path });
    }
  }
  if (!items.length) {
    items.push({ key: 'restart-hint-local', level: 'info', title: text('变更通常需要重启', 'Changes usually require restart'), detail: text('加载路径、白名单和启用状态通常在宿主重启或新会话后完全生效。', 'Load paths, allowlists, and enablement usually fully apply after host restart or new sessions.') });
  }
  return items;
});

function hydrate(payload: PluginsSummaryPayload): void {
  summary.value = payload;
  form.enabled = payload.enabled !== false;
  form.allow = [...(payload.allow || [])];
  form.deny = [...(payload.deny || [])];
  form.loadPaths = [...(payload.loadPaths || [])];
  form.slots.memory = payload.slots?.memory || '';
  form.slots.contextEngine = payload.slots?.contextEngine || '';
  form.installs = [...(payload.installs || [])];
  const nextEntries: Record<string, PluginEntry> = {};
  for (const entry of payload.entries.filter((item) => item.source === 'configured')) {
    nextEntries[entry.id] = { enabled: entry.enabled !== false, config: entry.config ? { ...entry.config } : undefined };
  }
  form.entries = nextEntries;
  if (!selectedPluginId.value || !payload.entries.some((entry) => entry.id === selectedPluginId.value)) {
    selectedPluginId.value = payload.entries[0]?.id || '';
  }
  if (pluginCapabilityFilter.value !== 'all' && !pluginCapabilityOptions.value.includes(pluginCapabilityFilter.value)) {
    pluginCapabilityFilter.value = 'all';
  }
  reconcileBulkPluginSelection(payload.entries.map((entry) => entry.id));
  reconcileInstallSelection(payload.installs.map((install) => install.id));
  syncSelectedPluginDraft();
}

async function applyPluginToggle(pluginId: string, enabled: boolean): Promise<void> {
  const target = allPluginItems.value.find((item) => item.id === pluginId);
  if (!target) return;
  if (!enabled && target.critical) {
    const impacts = (target.impacts || [])
      .map((item) => `- ${item.title}: ${item.detail}`)
      .join('\n');
    const ok = await confirm({
      title: text('确认禁用关键插件', 'Confirm disabling critical plugin'),
      message: `${pluginId}\n\n${impacts || text('该插件可能影响宿主关键能力。', 'This plugin may affect critical host capabilities.')}`,
      confirmText: text('确认禁用', 'Disable'),
      cancelText: text('取消', 'Cancel'),
      tone: 'danger',
    });
    if (!ok) return;
  }
  loading.value = true;
  try {
    const result = await togglePluginEntry(pluginId, enabled);
    noticeMessage.value = {
      kind: 'success',
      text: result.enabled
        ? text('插件已启用。建议开启新会话或重启宿主。', 'Plugin enabled. Start a new session or restart the host.')
        : text('插件已禁用。建议开启新会话或重启宿主。', 'Plugin disabled. Start a new session or restart the host.'),
    };
    await loadPlugins();
  } catch (error) {
    noticeMessage.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('切换插件失败。', 'Failed to toggle plugin.'),
    };
  } finally {
    loading.value = false;
  }
}

async function runPluginAction(action: "install" | "update" | "uninstall", payload: unknown): Promise<void> {
  loading.value = true;
  try {
    const result = action === "install"
      ? await installPlugin(payload as Parameters<typeof installPlugin>[0])
      : action === "update"
        ? await updatePlugins(payload as Parameters<typeof updatePlugins>[0])
        : await uninstallPlugin(payload as Parameters<typeof uninstallPlugin>[0]);
    noticeMessage.value = {
      kind: "success",
      text: `${result.output}${result.requiresRestart ? ` ${text("建议开启新会话或重启宿主。", "Start a new session or restart the host.")}` : ""}`,
    };
    await loadPlugins();
  } catch (error) {
    noticeMessage.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("插件操作失败。", "Plugin action failed."),
    };
  } finally {
    loading.value = false;
  }
}

async function runBulkPluginToggle(enabled: boolean): Promise<void> {
  const targetIds = enabled ? bulkEnableEligibleIds.value : bulkDisableEligibleIds.value;
  if (!targetIds.length) {
    noticeMessage.value = {
      kind: 'error',
      text: enabled
        ? text('当前选择里没有可启用或可接管的插件。', 'No selected plugins can be enabled or adopted.')
        : text('当前选择里没有可禁用的已配置插件。', 'No selected configured plugins can be disabled.'),
    };
    return;
  }
  if (!enabled) {
    const criticalTargets = bulkSelectedPlugins.value.filter((item) => targetIds.includes(item.id) && item.critical);
    if (criticalTargets.length) {
      const ok = await confirm({
        title: text('确认批量禁用关键插件', 'Confirm bulk disabling critical plugins'),
        message: criticalTargets.map((item) => item.id).join('\n'),
        confirmText: text('继续禁用', 'Continue'),
        cancelText: text('取消', 'Cancel'),
        tone: 'danger',
      });
      if (!ok) return;
    }
  }
  loading.value = true;
  try {
    const result = await bulkTogglePluginEntries({
      ids: targetIds,
      enabled,
      createMissingEntries: enabled,
    });
    hydrate(result.summary);
    noticeMessage.value = result.skipped.length
      ? {
          kind: 'error',
          text: `${text('部分批量操作被跳过', 'Some bulk operations were skipped')}: ${result.skipped.map((item) => `${item.id || 'unknown'}(${item.reason})`).join(' | ')}`,
        }
      : {
          kind: 'success',
          text: enabled
            ? text(`已批量启用 ${result.updatedIds.length} 个插件。`, `Enabled ${result.updatedIds.length} plugins.`)
            : text(`已批量禁用 ${result.updatedIds.length} 个插件。`, `Disabled ${result.updatedIds.length} plugins.`),
        };
  } finally {
    loading.value = false;
  }
}

function syncSelectedPluginDraft(): void {
  selectedPluginConfigError.value = '';
  const config = selectedEntry.value?.config || {};
  selectedPluginConfigDraft.value = JSON.stringify(config, null, 2);
}

function initializeGuidedGroupCollapsed(): void {
  const nextState: Record<string, boolean> = {};
  for (const group of selectedPluginSchemaGroups.value) {
    const hasOnlyAdvancedFields = group.fields.length > 0 && group.fields.every((field) => field.advanced);
    nextState[group.path] = hasOnlyAdvancedFields;
  }
  guidedGroupCollapsed.value = nextState;
}

function isGuidedGroupCollapsed(groupPath: string): boolean {
  return guidedGroupCollapsed.value[groupPath] === true;
}

function toggleGuidedGroup(groupPath: string): void {
  guidedGroupCollapsed.value = {
    ...guidedGroupCollapsed.value,
    [groupPath]: !isGuidedGroupCollapsed(groupPath),
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if ((Array.isArray(left) || isRecord(left)) && (Array.isArray(right) || isRecord(right))) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

function fieldUsesDefault(field: GuidedSchemaField): boolean {
  if (!field.hasDefault) return false;
  const value = getGuidedFieldValue(field);
  if (value === undefined) return false;
  return valuesEqual(value, field.defaultValue);
}

function fieldHasCustomValue(field: GuidedSchemaField): boolean {
  return hasConfigValue(selectedEntry.value?.config || {}, field.path);
}

function fieldDirty(field: GuidedSchemaField): boolean {
  const baselineValue = selectedPluginBaselineEntry.value ? readConfigValue(selectedPluginBaselineEntry.value.config as Record<string, unknown>, field.path) : undefined;
  const currentValue = getGuidedFieldValue(field);
  return !valuesEqual(currentValue, baselineValue);
}

function clearGuidedField(field: GuidedSchemaField): void {
  if (!selectedEntry.value) return;
  const nextConfig = writeConfigValue(selectedEntry.value.config || {}, field.path, undefined);
  selectedEntry.value.config = nextConfig;
  selectedPluginConfigDraft.value = JSON.stringify(nextConfig, null, 2);
}

function applyGuidedFieldDefault(field: GuidedSchemaField): void {
  if (!field.hasDefault) return;
  updateGuidedPluginField(field, cloneDefaultValue(field.defaultValue));
}

function restoreGuidedGroupDefaults(groupPath: string): void {
  const group = selectedPluginSchemaGroupMap.value[groupPath];
  if (!group || !selectedEntry.value) return;
  let nextConfig = { ...(selectedEntry.value.config || {}) };
  for (const field of group.fields) {
    nextConfig = writeConfigValue(nextConfig, field.path, field.hasDefault ? cloneDefaultValue(field.defaultValue) : undefined);
  }
  selectedEntry.value.config = nextConfig;
  selectedPluginConfigDraft.value = JSON.stringify(nextConfig, null, 2);
}

function groupHasAdvancedFields(group: GuidedSchemaGroup): boolean {
  return group.fields.some((field) => field.advanced);
}

function groupDefaultableFieldCount(group: GuidedSchemaGroup): number {
  return group.fields.filter((field) => field.hasDefault).length;
}

function groupDirtyFieldCount(group: GuidedSchemaGroup): number {
  return group.fields.filter((field) => fieldDirty(field)).length;
}

function groupIssueCount(group: GuidedSchemaGroup): number {
  return selectedPluginSchemaValidationIssues.value.filter((issue) =>
    group.fields.some((field) => issue.key.includes(field.path)),
  ).length;
}

function revertGuidedField(field: GuidedSchemaField): void {
  const baselineValue = selectedPluginBaselineEntry.value
    ? readConfigValue(selectedPluginBaselineEntry.value.config as Record<string, unknown>, field.path)
    : undefined;
  if (baselineValue === undefined) {
    clearGuidedField(field);
    return;
  }
  updateGuidedPluginField(field, cloneDefaultValue(baselineValue));
}

function revertGuidedGroupEdits(groupPath: string): void {
  const group = selectedPluginSchemaGroupMap.value[groupPath];
  if (!group || !selectedEntry.value) return;
  let nextConfig = { ...(selectedEntry.value.config || {}) };
  for (const field of group.fields) {
    const baselineValue = selectedPluginBaselineEntry.value
      ? readConfigValue(selectedPluginBaselineEntry.value.config as Record<string, unknown>, field.path)
      : undefined;
    nextConfig = writeConfigValue(nextConfig, field.path, baselineValue === undefined ? undefined : cloneDefaultValue(baselineValue));
  }
  selectedEntry.value.config = nextConfig;
  selectedPluginConfigDraft.value = JSON.stringify(nextConfig, null, 2);
}

function resetSelectedPluginChanges(): void {
  if (!selectedPluginId.value) return;
  const baselineEntry = summary.value?.entries.find((item) => item.id === selectedPluginId.value && item.source === 'configured');
  if (!baselineEntry) {
    delete form.entries[selectedPluginId.value];
    selectedPluginConfigDraft.value = '{}';
    return;
  }
  form.entries[selectedPluginId.value] = {
    enabled: baselineEntry.enabled !== false,
    config: baselineEntry.config ? { ...baselineEntry.config } : {},
  };
  syncSelectedPluginDraft();
}

function updateGuidedPluginField(field: GuidedSchemaField, nextValue: unknown): void {
  if (!selectedEntry.value) return;
  const normalizedValue = coerceGuidedValue(field, nextValue);
  const nextConfig = writeConfigValue(selectedEntry.value.config || {}, field.path, normalizedValue);
  selectedEntry.value.config = nextConfig;
  selectedPluginConfigDraft.value = JSON.stringify(nextConfig, null, 2);
}

function getGuidedFieldValue(field: GuidedSchemaField): unknown {
  return readConfigValue(selectedEntry.value?.config || {}, field.path);
}

function getGuidedArrayValues(field: GuidedSchemaField): unknown[] {
  const value = getGuidedFieldValue(field);
  return Array.isArray(value) ? [...value] : [];
}

function updateGuidedArrayField(field: GuidedSchemaField, index: number, nextValue: string | boolean): void {
  const nextItems = getGuidedArrayValues(field);
  nextItems[index] = coerceGuidedValue({ ...field, type: field.itemType || 'string', enumValues: [] }, nextValue);
  updateGuidedPluginField(field, nextItems);
}

function appendGuidedArrayField(field: GuidedSchemaField): void {
  const nextItems = getGuidedArrayValues(field);
  const nextValue = field.itemType === 'boolean'
    ? false
    : field.itemType === 'number' || field.itemType === 'integer'
      ? 0
      : '';
  nextItems.push(nextValue);
  updateGuidedPluginField(field, nextItems);
}

function removeGuidedArrayField(field: GuidedSchemaField, index: number): void {
  const nextItems = getGuidedArrayValues(field);
  nextItems.splice(index, 1);
  updateGuidedPluginField(field, nextItems);
}

async function loadPlugins(): Promise<void> {
  if (!isPluginsRouteActive.value) return;
  loading.value = true;
  try {
    const payload = await fetchPluginsSummary();
    if (!isPluginsRouteActive.value) return;
    hydrate(payload);
  } catch (error) {
    if (!isPluginsRouteActive.value) return;
    noticeMessage.value = { kind: 'error', text: error instanceof Error ? error.message : text('读取插件配置失败。', 'Failed to load plugin config.') };
  } finally {
    loading.value = false;
  }
}

function onSelectedPluginConfigInput(value: string): void {
  selectedPluginConfigDraft.value = value;
  selectedPluginConfigError.value = '';
  if (!selectedEntry.value) return;
  try {
    const parsed = value.trim() ? JSON.parse(value) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      selectedPluginConfigError.value = text('配置必须是 JSON 对象。', 'Config must be a JSON object.');
      return;
    }
    selectedEntry.value.config = parsed as Record<string, unknown>;
  } catch (error) {
    selectedPluginConfigError.value = error instanceof Error ? error.message : text('JSON 无法解析。', 'Invalid JSON.');
  }
}

async function saveConfig(): Promise<void> {
  if (selectedPluginConfigError.value) {
    noticeMessage.value = { kind: 'error', text: selectedPluginConfigError.value };
    return;
  }
  if (blockingSchemaIssueCount.value) {
    noticeMessage.value = {
      kind: 'error',
      text: text('当前插件配置仍有必填或类型错误，请先修复基础表单中的问题。', 'The selected plugin config still has required/type issues. Fix the guided form first.'),
    };
    activeTab.value = 'inventory';
    pluginConfigMode.value = 'guided';
    return;
  }
  saving.value = true;
  try {
    await savePluginsConfig({
      enabled: form.enabled,
      allow: normalizeList(form.allow),
      deny: normalizeList(form.deny),
      loadPaths: normalizeList(form.loadPaths),
      slots: { memory: form.slots.memory.trim(), contextEngine: form.slots.contextEngine.trim() },
      entries: Object.fromEntries(Object.entries(form.entries).map(([id, entry]) => [id, { enabled: entry.enabled !== false, ...(entry.config && Object.keys(entry.config).length ? { config: entry.config } : {}) }])),
    });
    noticeMessage.value = { kind: 'success', text: text('插件策略已保存。', 'Plugin policy saved.') };
    await loadPlugins();
  } catch (error) {
    noticeMessage.value = { kind: 'error', text: error instanceof Error ? error.message : text('保存插件配置失败。', 'Failed to save plugin config.') };
  } finally {
    saving.value = false;
  }
}

function adoptDiscoveredPlugin(pluginId: string): void {
  void applyPluginToggle(pluginId, true);
}

async function installPluginFromSpec(): Promise<void> {
  const spec = pluginInstallSpec.value.trim();
  if (!spec) {
    noticeMessage.value = { kind: "error", text: text("请先填写插件来源或路径。", "Enter a plugin spec or path first.") };
    return;
  }
  if (installBlockedByPreflight.value) {
    noticeMessage.value = {
      kind: 'error',
      text: text('当前预检结果阻止安装。请先修复结构问题或改用安全来源。', 'Current preflight result blocks installation. Fix the package structure or use a safe source first.'),
    };
    return;
  }
  await runPluginAction("install", {
    spec,
    force: pluginInstallForce.value,
    link: pluginInstallLink.value,
    pin: pluginInstallPin.value,
    marketplace: pluginInstallMarketplace.value.trim() || null,
  });
}

async function handleUploadArchiveChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] || null;
  uploadFileName.value = '';
  uploadDataBase64.value = '';
  uploadPreflight.value = null;
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.zip')) {
    noticeMessage.value = {
      kind: 'error',
      text: text('请上传 .zip 插件压缩包。', 'Upload a .zip plugin archive.'),
    };
    input.value = '';
    return;
  }
  try {
    uploadFileName.value = file.name;
    uploadDataBase64.value = await readFileAsBase64(file);
  } catch (error) {
    noticeMessage.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('读取上传插件失败。', 'Failed to read uploaded plugin archive.'),
    };
  }
}

async function preflightUploadedArchive(): Promise<void> {
  if (!uploadDataBase64.value || !uploadFileName.value) return;
  uploadBusy.value = true;
  try {
    uploadPreflight.value = await preflightUploadedPluginArchive({
      fileName: uploadFileName.value,
      dataBase64: uploadDataBase64.value,
    });
    noticeMessage.value = {
      kind: uploadPreflight.value.preflight.level === 'danger' ? 'error' : 'success',
      text: uploadPreflight.value.preflight.summary,
    };
  } catch (error) {
    uploadPreflight.value = null;
    noticeMessage.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('插件压缩包检测失败。', 'Plugin archive validation failed.'),
    };
  } finally {
    uploadBusy.value = false;
  }
}

async function installUploadedArchiveFile(): Promise<void> {
  if (!uploadDataBase64.value || !uploadFileName.value || !uploadPreflight.value) return;
  uploadBusy.value = true;
  try {
    const result = await installUploadedPluginArchive({
      fileName: uploadFileName.value,
      dataBase64: uploadDataBase64.value,
      force: pluginInstallForce.value,
      pin: pluginInstallPin.value,
    });
    hydrate(result.summary);
    noticeMessage.value = {
      kind: 'success',
      text: `${result.output}${result.requiresRestart ? ` ${text('建议开启新会话或重启宿主。', 'Start a new session or restart the host.')}` : ''}`,
    };
  } catch (error) {
    noticeMessage.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('安装上传插件失败。', 'Failed to install uploaded plugin.'),
    };
  } finally {
    uploadBusy.value = false;
  }
}

async function preflightInstallSpec(): Promise<void> {
  const spec = pluginInstallSpec.value.trim();
  if (!spec) {
    noticeMessage.value = { kind: "error", text: text("请先填写插件来源或路径。", "Enter a plugin spec or path first.") };
    return;
  }
  loading.value = true;
  try {
    pluginPreflight.value = await preflightPlugin({
      spec,
      marketplace: pluginInstallMarketplace.value.trim() || null,
    });
    noticeMessage.value = {
      kind: pluginPreflight.value.level === "danger" ? "error" : "success",
      text: pluginPreflight.value.summary,
    };
  } catch (error) {
    pluginPreflight.value = null;
    noticeMessage.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("插件预检失败。", "Plugin preflight failed."),
    };
  } finally {
    loading.value = false;
  }
}

async function updateSelectedInstall(all = false): Promise<void> {
  if (!all && !selectedInstallRecord.value?.id) {
    noticeMessage.value = { kind: "error", text: text("请选择一个已安装插件记录。", "Select an installed plugin record first.") };
    return;
  }
  await runPluginAction("update", {
    all,
    id: all ? null : selectedInstallRecord.value?.id,
  });
}

async function uninstallSelectedInstall(): Promise<void> {
  if (!selectedInstallRecord.value?.id) {
    noticeMessage.value = { kind: "error", text: text("请选择一个已安装插件记录。", "Select an installed plugin record first.") };
    return;
  }
  const target = allPluginItems.value.find((item) => item.id === selectedInstallRecord.value?.id);
  if (target?.critical) {
    const impacts = (target.impacts || []).map((item) => `- ${item.title}: ${item.detail}`).join('\n');
    const ok = await confirm({
      title: text('确认卸载关键插件', 'Confirm uninstalling critical plugin'),
      message: `${target.id}\n\n${impacts || text('该插件可能影响宿主关键能力。', 'This plugin may affect critical host capabilities.')}`,
      confirmText: text('确认卸载', 'Uninstall'),
      cancelText: text('取消', 'Cancel'),
      tone: 'danger',
    });
    if (!ok) return;
  }
  await runPluginAction("uninstall", {
    id: selectedInstallRecord.value.id,
    force: true,
  });
}

async function runBulkInstallRecordAction(action: 'update' | 'uninstall'): Promise<void> {
  const ids = selectedInstallIds.value.filter((id) => form.installs.some((item) => item.id === id));
  if (!ids.length) {
    noticeMessage.value = {
      kind: 'error',
      text: action === 'update'
        ? text('请先选择至少一个安装记录再更新。', 'Select at least one install record to update.')
        : text('请先选择至少一个安装记录再卸载。', 'Select at least one install record to uninstall.'),
    };
    return;
  }
  if (action === 'uninstall') {
    const criticalTargets = allPluginItems.value.filter((item) => ids.includes(item.id) && item.critical);
    if (criticalTargets.length) {
      const ok = await confirm({
        title: text('确认批量卸载关键插件', 'Confirm bulk uninstalling critical plugins'),
        message: criticalTargets.map((item) => item.id).join('\n'),
        confirmText: text('继续卸载', 'Continue'),
        cancelText: text('取消', 'Cancel'),
        tone: 'danger',
      });
      if (!ok) return;
    }
  }
  loading.value = true;
  try {
    const result = action === 'update'
      ? await bulkUpdatePluginInstalls({
          ids,
          all: ids.length === form.installs.length,
        })
      : await bulkUninstallPluginInstalls({
          ids,
          force: true,
        });
    hydrate(result.summary);
    noticeMessage.value = result.failures.length
      ? {
          kind: 'error',
          text: `${text('部分批量安装记录操作失败', 'Some bulk install-record operations failed')}: ${result.failures.map((failure) => `${failure.id}: ${failure.error}`).join(' | ')}`,
        }
      : {
          kind: 'success',
          text: action === 'update'
            ? text(`已批量更新 ${result.processedIds.length} 个安装记录。`, `Updated ${result.processedIds.length} install records.`)
            : text(`已批量卸载 ${result.processedIds.length} 个安装记录。`, `Uninstalled ${result.processedIds.length} install records.`),
        };
  } finally {
    loading.value = false;
  }
}

watch(selectedPluginId, () => {
  showAdvancedGuidedFields.value = false;
  syncSelectedPluginDraft();
  initializeGuidedGroupCollapsed();
});
watch(selectedPluginSchemaGroups, initializeGuidedGroupCollapsed);
watch(
  [activeTab, pluginSearch, pluginStatusFilter, pluginSourceFilter, pluginCriticalFilter, pluginCapabilityFilter, selectedPluginId],
  () => {
    persistPluginsUiState({
      activeTab: activeTab.value,
      pluginSearch: pluginSearch.value,
      pluginSortMode: pluginSortMode.value,
      pluginStatusFilter: pluginStatusFilter.value,
      pluginSourceFilter: pluginSourceFilter.value,
      pluginCriticalFilter: pluginCriticalFilter.value,
      pluginCapabilityFilter: pluginCapabilityFilter.value,
      selectedPluginId: selectedPluginId.value,
    });
  },
  { deep: false },
);
watch([pluginInstallSpec, pluginInstallMarketplace], () => {
  pluginPreflight.value = null;
});
function activatePluginsPage(): void {
  if (!isPluginsRouteActive.value) return;
  if (pluginsPageBootstrapped && summary.value) return;
  pluginsPageBootstrapped = true;
  void loadPlugins();
}

onMounted(activatePluginsPage);
onActivated(activatePluginsPage);
</script>

<style scoped>
.plugins-page { gap: 18px; }
.plugins-command-center {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(420px, 1.18fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background:
    radial-gradient(620px 260px at 0% 0%, color-mix(in srgb, var(--acc) 11%, transparent), transparent 66%),
    color-mix(in srgb, var(--surface-base) 88%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--shell-highlight) 12%, transparent),
    0 12px 30px rgba(8, 18, 29, 0.08);
}
.plugins-command-center > div {
  min-width: 0;
  padding: 22px;
}
.plugins-command-center h3 { margin: 0; color: var(--text); font-size: clamp(1.3rem, 2vw, 1.9rem); }
.plugins-command-center p { margin: 8px 0 0; color: var(--muted); line-height: 1.6; }
.plugins-hero-metrics,
.plugins-tabs,
.plugins-chip-row,
.plugins-critical-list,
.plugins-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.plugins-impact-list {
  display: grid;
  gap: 10px;
}
.plugins-install-stack,
.plugins-critical-grid {
  display: grid;
  gap: 14px;
}
.plugins-bulk-toolbar,
.plugins-rail-row,
.plugins-install-row {
  display: grid;
  gap: 10px;
}
.plugins-filter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.plugins-guided-stack,
.plugins-guided-group {
  display: grid;
  gap: 12px;
}
.plugins-guided-toolbar {
  position: sticky;
  top: 12px;
  z-index: 4;
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--sky) 22%, var(--line));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 94%, transparent), color-mix(in srgb, var(--surface) 96%, transparent));
  backdrop-filter: blur(12px);
}
.plugins-guided-group-head {
  display: grid;
  gap: 10px;
  position: sticky;
  top: 76px;
  z-index: 3;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-base) 94%, transparent), color-mix(in srgb, var(--surface) 96%, transparent));
  backdrop-filter: blur(12px);
}
.plugins-guided-group-meta,
.plugins-guided-field-chips,
.plugins-guided-field-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.plugins-guided-group-meta span,
.plugins-guided-chip {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-soft);
  font-size: 12px;
}
.plugins-guided-chip.is-default {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 28%, var(--line));
}
.plugins-guided-chip.is-dirty,
.plugins-dirty-pill {
  color: var(--peach-ink, var(--text));
  border: 1px solid color-mix(in srgb, var(--peach) 34%, var(--line));
  background: color-mix(in srgb, var(--peach) 14%, var(--surface));
}
.plugins-dirty-pill {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
}
.plugins-guided-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.plugins-guided-summary {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--peach) 32%, var(--line));
  background: color-mix(in srgb, var(--peach) 10%, var(--surface));
}
.plugins-guided-summary.danger {
  border-color: color-mix(in srgb, var(--danger) 34%, var(--line));
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
}
.plugins-guided-summary strong { color: var(--text); }
.plugins-guided-summary-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.plugins-guided-summary-item {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-soft);
  font-size: 12px;
}
.plugins-guided-summary-item.is-danger {
  border-color: color-mix(in srgb, var(--danger) 34%, var(--line));
  color: var(--danger);
}
.plugins-guided-summary-item.is-warn {
  border-color: color-mix(in srgb, var(--peach) 34%, var(--line));
}
.plugins-guided-field {
  align-content: start;
}
.plugins-guided-field-head {
  display: grid;
  gap: 8px;
}
.plugins-guided-path {
  font-size: 11px;
  color: var(--muted);
  word-break: break-all;
}
.plugins-array-editor {
  display: grid;
  gap: 10px;
}
.plugins-array-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.plugins-impact-card {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--peach) 8%, var(--surface));
}
.plugins-impact-card strong {
  display: block;
  margin-bottom: 6px;
  color: var(--text);
}
.plugins-impact-card p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}
.plugins-hero-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  align-self: stretch;
  padding: 0 !important;
  border-left: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  background: color-mix(in srgb, var(--line) 70%, transparent);
}
.plugins-hero-metrics span,
.plugins-chip-row span,
.plugins-critical-list span {
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-soft);
  font-size: 12px;
}
.plugins-hero-metrics span {
  display: grid;
  align-content: center;
  min-height: 92px;
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--surface-base) 90%, transparent);
  color: var(--text);
  font-weight: 750;
}
.plugins-critical-list span.disabled {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 32%, var(--line));
}
.plugins-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}
.plugins-tab.active {
  background: var(--tab-active-bg);
  color: var(--text);
  border-color: color-mix(in srgb, var(--sky) 32%, var(--line));
}
.plugins-overview,
.plugins-policy-grid,
.plugins-stage,
.plugins-stage-card,
.plugins-list-editor,
.plugins-diagnostics,
.plugins-install-card {
  display: grid;
  gap: 12px;
}
.plugins-overview {
  grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.8fr);
}
.plugins-posture-strip,
.plugins-side-pane {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface-base) 90%, transparent), color-mix(in srgb, var(--code-bg) 12%, transparent));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--shell-highlight) 10%, transparent),
    0 12px 30px rgba(8, 18, 29, 0.07);
}
.plugins-side-pane {
  align-content: start;
}
.plugins-policy-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.plugins-critical-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.plugins-stage-card--wide { grid-column: 1 / -1; }
.plugins-install-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 14px;
  align-items: start;
}
.plugins-summary-grid,
.plugins-facts-grid,
.plugins-form-grid,
.plugins-install-grid,
.plugins-capability-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.plugins-posture-strip .plugins-summary-grid,
.plugins-capability-grid {
  gap: 1px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--line) 72%, transparent);
}
.plugins-capability-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.plugins-facts-grid--compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.plugins-summary-grid--compact { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.plugins-summary-card,
.plugins-fact,
.plugins-capability-grid span {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.plugins-posture-strip .plugins-summary-card,
.plugins-capability-grid span {
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--surface-base) 90%, transparent);
}
.plugins-summary-card span,
.plugins-fact span,
.plugins-rail-head p,
.plugins-section-head p,
.plugins-rail-item span,
.plugins-install-card span,
.plugins-capability-grid em {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}
.plugins-summary-card strong,
.plugins-fact strong,
.plugins-capability-grid strong {
  color: var(--text);
  word-break: break-word;
}
.plugins-critical-card {
  display: grid;
  gap: 10px;
  padding: 14px 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
  background: transparent;
}
.plugins-critical-card.danger {
  border-color: color-mix(in srgb, var(--danger) 34%, var(--line));
  background: linear-gradient(90deg, color-mix(in srgb, var(--danger) 10%, transparent), transparent 58%);
}
.plugins-layout {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.plugins-rail {
  display: grid;
  gap: 10px;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 120px);
  overflow: auto;
}
.plugins-rail-head h3,
.plugins-section-head h3,
.plugins-section-head h4 { margin: 0; color: var(--text); }
.plugins-rail-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
}
.plugins-install-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
}
.plugins-rail-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.plugins-rail-item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.plugins-rail-item.active { background: var(--tab-active-bg); }
.plugins-section-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.plugins-section-head.compact { display: grid; }
.plugins-kv-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.toggle-card.compact {
  padding: 10px 12px;
}
.plugins-json {
  min-height: 180px;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
}
.plugins-error { margin: 0; color: var(--danger); font-size: 12px; }
.plugins-status-pill {
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-soft);
  font-size: 12px;
}
.plugins-status-pill.is-enabled { color: var(--success); }
.plugins-status-pill.is-blocked,
.plugins-status-pill.is-missing { color: var(--danger); }
.plugins-diagnostic {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.plugins-diagnostic strong { display: block; color: var(--text); margin-bottom: 6px; }
.plugins-diagnostic p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
.plugins-diagnostic.is-danger { border-color: color-mix(in srgb, var(--danger) 34%, var(--line)); }
.plugins-diagnostic.is-warn { border-color: color-mix(in srgb, var(--peach) 34%, var(--line)); }
.plugins-install-card { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); cursor: pointer; }
.plugins-install-card strong { color: var(--text); }
.plugins-install-card code { color: var(--text-soft); word-break: break-all; font-size: 11px; }
.plugins-install-card.active { background: var(--tab-active-bg); border-color: color-mix(in srgb, var(--sky) 32%, var(--line)); }
.plugins-preflight-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.plugins-preflight-card strong { color: var(--text); }
.plugins-preflight-card p { margin: 0; color: var(--muted); font-size: 12px; }
.plugins-preflight-card.is-danger { border-color: color-mix(in srgb, var(--danger) 34%, var(--line)); }
.plugins-preflight-card.is-warn { border-color: color-mix(in srgb, var(--peach) 34%, var(--line)); }
@media (max-width: 980px) {
  .plugins-command-center,
  .plugins-overview,
  .plugins-policy-grid,
  .plugins-layout,
  .plugins-install-layout,
  .plugins-install-stack,
  .plugins-filter-grid,
  .plugins-rail-row,
  .plugins-install-row,
  .plugins-critical-grid,
  .plugins-summary-grid,
  .plugins-facts-grid,
  .plugins-guided-grid,
  .plugins-form-grid,
  .plugins-install-grid,
  .plugins-capability-grid {
    display: grid;
    grid-template-columns: 1fr;
  }
  .plugins-hero-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-left: 0;
    border-top: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  }
  .plugins-rail { position: static; max-height: none; }
  .plugins-guided-toolbar,
  .plugins-guided-group-head {
    position: static;
    backdrop-filter: none;
  }
  .plugins-rail-check {
    min-height: 42px;
  }
}
</style>
