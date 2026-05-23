<template>
  <motion.section class="page-shell config-page-shell" v-bind="pageSurfaceReveal">
    <motion.header class="page-header page-header-row" v-bind="pageMastheadReveal">
      <div>
        <p class="eyebrow">Config</p>
        <h2 class="page-title">{{ text('系统配置', 'System Configuration') }}</h2>
        <p class="page-copy">{{ text('只管理低频系统级参数；主题、语言、技能安装和插件运维优先使用各自的全局入口或管理页面。', 'Manage low-frequency system parameters only; use global controls or dedicated management pages for theme, language, skill installs, and plugin operations.') }}</p>
      </div>
      <div class="page-actions">
        <button class="secondary-button" type="button" @click="openGlobalConfig">
          {{ text('全局配置', 'Global Config') }}
        </button>
        <button class="secondary-button" type="button" @click="refreshConfigWithDirtyCheck" :disabled="loading || saving">
          <RefreshCw class="button-inline-icon" aria-hidden="true" />
          {{ text('刷新', 'Refresh') }}
        </button>
        <button class="primary-button" :class="{ 'is-saved': saveFeedbackVisible && !hasUnsavedChanges }" type="button" @click="saveChanges" :disabled="loading || saving || !saveReadiness.canSave">
          <Check v-if="saveFeedbackVisible && !hasUnsavedChanges" class="button-inline-icon" aria-hidden="true" />
          {{ saving ? text('保存中...', 'Saving...') : saveFeedbackVisible && !hasUnsavedChanges ? text('已保存', 'Saved') : text('保存配置', 'Save Config') }}
        </button>
      </div>
    </motion.header>

    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-else-if="successMessage" class="status-banner status-banner-success">{{ successMessage }}</div>

    <motion.section class="config-overview-ribbon" v-bind="pageSurfaceReveal">
      <article v-for="signal in configOverviewSignals" :key="signal.label" class="config-overview-card">
        <span>{{ signal.label }}</span>
        <strong>{{ signal.value }}</strong>
        <p>{{ signal.note }}</p>
      </article>
    </motion.section>

    <div v-if="loading" class="empty-inline panel-muted">{{ text('正在加载配置...', 'Loading configuration...') }}</div>

    <template v-else>
      <motion.div class="config-workbench" v-bind="pageSurfaceReveal">
        <aside class="config-sidebar">
          <div class="config-sidebar-head">
            <p class="eyebrow">{{ text('CONFIG DOMAINS', 'CONFIG DOMAINS') }}</p>
            <h3 class="config-sidebar-title">{{ text('从这里开始', 'Start Here') }}</h3>
            <p class="panel-muted">{{ text('先改模型与供应商，再处理安全、会话和集成。日常管理能力不放在这里重复配置。', 'Configure models and providers first, then security, sessions, and integrations. Daily management workflows are not duplicated here.') }}</p>
          </div>

          <article class="config-sidebar-callout">
            <span class="config-sidebar-callout__eyebrow">{{ text('WORKBENCH NOTE', 'WORKBENCH NOTE') }}</span>
            <strong>{{ configSidebarSummary.title }}</strong>
            <p>{{ configSidebarSummary.copy }}</p>
          </article>

          <nav class="config-tabs config-tabs-grouped" :aria-label="text('配置标签页', 'Configuration tabs')">
            <section
              v-for="group in groupedTabs"
              :key="group.id"
              class="config-tab-group"
              :aria-label="group.label"
            >
              <div class="config-tab-group__head">
                <span>{{ group.label }}</span>
                <strong>{{ group.items.length }}</strong>
              </div>
              <button
                v-for="tab in group.items"
                :key="tab.id"
                type="button"
                class="config-tab"
                :class="{ active: activeTab === tab.id }"
                @click="setActiveTab(tab.id)"
              >
                <span class="config-tab-icon">
                  <component :is="resolveConfigTabIcon(tab.id)" aria-hidden="true" />
                </span>
                <span class="config-tab-title">{{ tab.label }}</span>
                <span class="config-tab-copy">{{ tab.copy }}</span>
              </button>
            </section>
          </nav>
        </aside>

        <div class="config-main">
          <article class="config-active-tab-panel">
            <div class="config-active-tab-head">
              <div class="panel-heading-emph">
                <span aria-hidden="true">
                  <component :is="resolveConfigTabIcon(activeTabMeta.id)" class="config-heading-icon" />
                </span>
                <div>
                  <h3>{{ activeTabMeta.label }}</h3>
                  <p class="panel-muted">{{ activeTabMeta.copy }}</p>
                </div>
              </div>
            </div>
            <div class="config-active-tab-facts">
              <article v-for="fact in activeTabFacts" :key="fact.label" class="config-active-tab-fact">
                <span>{{ fact.label }}</span>
                <strong>{{ fact.value }}</strong>
              </article>
            </div>

            <div v-if="activeAdvancedSheetMeta" class="config-advanced-entry">
              <div class="config-advanced-entry__copy">
                <span class="config-advanced-entry__eyebrow">{{ text('ADVANCED SETTINGS', 'ADVANCED SETTINGS') }}</span>
                <strong>{{ activeAdvancedSheetMeta.title }}</strong>
                <p>{{ activeAdvancedSheetMeta.description }}</p>
              </div>
              <button class="secondary-button" type="button" @click="openAdvancedSheet">
                {{ text('打开高级设置', 'Open advanced settings') }}
              </button>
            </div>
          </article>

      <section v-if="activeTab === 'model'" id="global-config" class="page-shell config-section-grid config-section-grid-model">
        <article class="config-sheet">
          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('全局配置与 Agent 默认值', 'Global Config & Agent Defaults') }}</span></h3>
          </div>
          <div class="config-subsection-grid">
            <section class="config-subsection is-primary">
              <div class="config-subsection-head">
                <h4>{{ text('主模型目标', 'Primary model targets') }}</h4>
                <p>{{ text('先确认文本和图片的主模型，这两个值会影响大多数默认路由。', 'Confirm the primary text and image models first. These two values influence most default routing decisions.') }}</p>
              </div>
              <div class="form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('默认模型', 'Default model') }}</span>
                  <GlassSelect v-model="form.defaults.model" :options="modelSelectOptions" :placeholder="text('选择默认模型', 'Select default model')" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('默认图片模型', 'Default image model') }}</span>
                  <GlassSelect v-model="form.defaults.imageModel" :options="imageModelSelectOptions" :placeholder="text('选择图片模型', 'Select image model')" />
                  <span class="field-hint">{{ text('优先从具备 `image` 能力的模型中选取，避免工具运行时临时降级。', 'Prefer models with image capability to avoid runtime downgrades.') }}</span>
                </label>
              </div>
            </section>

            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('全局运行默认值', 'Global runtime defaults') }}</h4>
                <p>{{ text('这里就是全局配置入口：默认工作区、超时、并发、思考级别、Verbose 和全局 HEARTBEAT 都写入 openclaw.json 的 agents.defaults。', 'This is the global config entry: default workspace, timeout, concurrency, thinking, verbose, and global HEARTBEAT are written to agents.defaults in openclaw.json.') }}</p>
              </div>
              <div class="config-core-baseline">
                <article class="config-core-baseline__item">
                  <span>{{ text('推荐思考级别', 'Recommended thinking') }}</span>
                  <strong>{{ text('High', 'High') }}</strong>
                  <p>{{ text('多数 Studio 工作流先用高思考级别，再按成本调低。', 'Start most Studio workflows at high thinking, then dial down only when cost matters.') }}</p>
                </article>
                <article class="config-core-baseline__item">
                  <span>{{ text('推荐并发', 'Recommended concurrency') }}</span>
                  <strong>{{ `${form.defaults.maxConcurrent || 8}` }}</strong>
                  <p>{{ text('先用稳定并发上限，避免一开始就拉高子 Agent 和队列复杂度。', 'Start with a stable concurrency ceiling before increasing sub-agent and queue complexity.') }}</p>
                </article>
                <article class="config-core-baseline__item">
                  <span>{{ text('高级入口', 'Advanced lane') }}</span>
                  <strong>{{ text('JSON / 守卫 / 注入', 'JSON / Guards / Injection') }}</strong>
                  <p>{{ text('需要修改系统提示词覆盖、模型目录或启动守卫时，再进入高级面板。', 'Open the advanced sheet only when you need system-prompt overrides, model registry changes, or bootstrap guards.') }}</p>
                </article>
              </div>
              <div class="form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('默认工作区', 'Default workspace') }}</span>
                  <input v-model="form.defaults.workspace" class="form-input" type="text" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('超时秒数', 'Timeout seconds') }}</span>
                  <input v-model.number="form.defaults.timeoutSeconds" class="form-input" type="number" min="1" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('最大并发', 'Max concurrency') }}</span>
                  <input v-model.number="form.defaults.maxConcurrent" class="form-input" type="number" min="1" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('子 Agent 最大并发', 'Sub-agent max concurrency') }}</span>
                  <input v-model.number="form.defaults.subagentMaxConcurrent" class="form-input" type="number" min="1" />
                </label>
              </div>
              <div class="setting-block">
                <span class="form-label">{{ text('思考级别', 'Thinking level') }}</span>
                <div class="choice-group config-choice-grid">
                  <button
                    v-for="option in thinkingOptions"
                    :key="option.value"
                    type="button"
                    class="choice-chip"
                    :class="{ active: form.defaults.thinking === option.value }"
                    @click="form.defaults.thinking = option.value"
                  >
                    <strong>{{ option.label }}</strong>
                    <span>{{ option.note }}</span>
                  </button>
                </div>
              </div>
              <div class="setting-block">
                <span class="form-label">{{ text('Verbose 默认值', 'Verbose Default') }}</span>
                <div class="choice-group choice-group-tight">
                  <button
                    v-for="option in verboseOptions"
                    :key="option.value"
                    type="button"
                    class="choice-pill"
                    :class="{ active: form.defaults.verbose === option.value }"
                    @click="form.defaults.verbose = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <section class="config-subsection config-subsection-heartbeat">
                <div class="config-subsection-head">
                  <h4>{{ text('内置 HEARTBEAT', 'Built-in HEARTBEAT') }}</h4>
                  <p>{{ text('Heartbeat 不是 cron；这里持久写入 agents.defaults.heartbeat.every。target: none 不会关闭模型心跳消耗。', 'Heartbeat is not cron; this persistently writes agents.defaults.heartbeat.every. target: none does not stop model-consuming heartbeat turns.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('全局心跳策略', 'Global heartbeat policy') }}</span>
                    <GlassSelect v-model="form.defaults.heartbeatMode" :options="choiceToSelectOptions(heartbeatModeOptions)" />
                    <span class="field-hint">{{ text('禁用会持久保存 every: "0m"；不覆盖会移除 every，但不等于关闭宿主默认心跳。', 'Disabled persists every: "0m"; no override removes every, but does not disable host defaults.') }}</span>
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('心跳周期', 'Heartbeat interval') }}</span>
                    <input v-model="form.defaults.heartbeatEvery" class="form-input" :disabled="form.defaults.heartbeatMode !== 'enabled'" placeholder="30m" />
                    <span class="field-hint">{{ text('例如 10m / 30m / 1h。启用但留空时保存为 30m。', 'For example 10m / 30m / 1h. If enabled and empty, Studio saves 30m.') }}</span>
                  </label>
                </div>
              </section>
              <p class="field-hint config-core-hint">
                {{ text('需要修改默认技能、系统提示词覆盖、消息包络、JSON provider 参数或低频守卫时，使用上方高级设置入口。', 'Use the advanced settings entry above when you need default skills, system prompt override, message envelope tuning, JSON provider params, or low-frequency runtime guards.') }}
              </p>
          </section>
          </div>
          </section>

          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('生成模型与运行守卫', 'Generation Models & Runtime Guards') }}</span></h3>
          </div>
          <div class="config-subsection-grid">
            <section class="config-subsection is-primary">
              <div class="config-subsection-head">
                <h4>{{ text('生成模型', 'Generation models') }}</h4>
                <p>{{ text('图像、视频、音乐和 PDF 的默认模型与回退链。', 'Default models and fallback chains for image, video, music, and PDF generation.') }}</p>
              </div>
              <div class="config-subsection-grid">
                <section class="config-subsection">
                  <div class="config-subsection-head">
                    <div class="provider-model-toolbar">
                      <div>
                        <h4>{{ text('图像生成模型', 'Image generation model') }}</h4>
                        <p>{{ text('共享图像生成链路默认使用的模型。', 'Default model for the shared image-generation path.') }}</p>
                      </div>
                      <button class="secondary-button compact-button" type="button" @click="addFallback('imageGeneration')" :disabled="!modelOptions.length">{{ text('添加回退', 'Add fallback') }}</button>
                    </div>
                  </div>
                  <div class="form-grid">
                    <label class="form-field">
                      <span class="form-label">{{ text('主模型', 'Primary model') }}</span>
                      <GlassSelect v-model="form.defaults.imageGenerationModel" :options="modelSelectOptions" :placeholder="text('选择模型', 'Select model')" />
                    </label>
                  </div>
                  <details class="config-collapsible" :open="form.defaults.imageGenerationModelFallback.length > 0">
                    <summary class="config-collapsible-summary">
                      <span>{{ text('回退链', 'Fallback chain') }}</span>
                      <span class="config-collapsible-meta">{{ form.defaults.imageGenerationModelFallback.length }} {{ text('项', 'items') }}</span>
                    </summary>
                    <div v-if="form.defaults.imageGenerationModelFallback.length" class="fallback-list fallback-list-spaced">
                      <div v-for="(model, index) in form.defaults.imageGenerationModelFallback" :key="`image-gen-${index}`" class="fallback-row">
                        <span class="fallback-index">{{ index + 1 }}</span>
                        <GlassSelect
                          v-model="form.defaults.imageGenerationModelFallback[index]"
                          :options="toSelectOptions(filteredFallbackOptions(form.defaults.imageGenerationModel, form.defaults.imageGenerationModelFallback, index, modelOptions))"
                          :placeholder="text('选择回退模型', 'Select fallback model')"
                        />
                        <button class="danger-link" type="button" @click="removeFallback('imageGeneration', index)">{{ text('移除', 'Remove') }}</button>
                      </div>
                    </div>
                    <div v-else class="empty-inline">{{ text('当前未设置图像生成回退。', 'No image-generation fallbacks configured yet.') }}</div>
                  </details>
                </section>
                <section class="config-subsection">
                  <div class="config-subsection-head">
                    <div class="provider-model-toolbar">
                      <div>
                        <h4>{{ text('视频生成模型', 'Video generation model') }}</h4>
                        <p>{{ text('共享视频生成链路默认使用的模型。', 'Default model for the shared video-generation path.') }}</p>
                      </div>
                      <button class="secondary-button compact-button" type="button" @click="addFallback('videoGeneration')" :disabled="!modelOptions.length">{{ text('添加回退', 'Add fallback') }}</button>
                    </div>
                  </div>
                  <div class="form-grid">
                    <label class="form-field">
                      <span class="form-label">{{ text('主模型', 'Primary model') }}</span>
                      <GlassSelect v-model="form.defaults.videoGenerationModel" :options="modelSelectOptions" :placeholder="text('选择模型', 'Select model')" />
                    </label>
                  </div>
                  <details class="config-collapsible" :open="form.defaults.videoGenerationModelFallback.length > 0">
                    <summary class="config-collapsible-summary">
                      <span>{{ text('回退链', 'Fallback chain') }}</span>
                      <span class="config-collapsible-meta">{{ form.defaults.videoGenerationModelFallback.length }} {{ text('项', 'items') }}</span>
                    </summary>
                    <div v-if="form.defaults.videoGenerationModelFallback.length" class="fallback-list fallback-list-spaced">
                      <div v-for="(model, index) in form.defaults.videoGenerationModelFallback" :key="`video-gen-${index}`" class="fallback-row">
                        <span class="fallback-index">{{ index + 1 }}</span>
                        <GlassSelect
                          v-model="form.defaults.videoGenerationModelFallback[index]"
                          :options="toSelectOptions(filteredFallbackOptions(form.defaults.videoGenerationModel, form.defaults.videoGenerationModelFallback, index, modelOptions))"
                          :placeholder="text('选择回退模型', 'Select fallback model')"
                        />
                        <button class="danger-link" type="button" @click="removeFallback('videoGeneration', index)">{{ text('移除', 'Remove') }}</button>
                      </div>
                    </div>
                    <div v-else class="empty-inline">{{ text('当前未设置视频生成回退。', 'No video-generation fallbacks configured yet.') }}</div>
                  </details>
                </section>
                <section class="config-subsection">
                  <div class="config-subsection-head">
                    <div class="provider-model-toolbar">
                      <div>
                        <h4>{{ text('音乐生成模型', 'Music generation model') }}</h4>
                        <p>{{ text('共享音乐生成链路默认使用的模型。', 'Default model for the shared music-generation path.') }}</p>
                      </div>
                      <button class="secondary-button compact-button" type="button" @click="addFallback('musicGeneration')" :disabled="!modelOptions.length">{{ text('添加回退', 'Add fallback') }}</button>
                    </div>
                  </div>
                  <div class="form-grid">
                    <label class="form-field">
                      <span class="form-label">{{ text('主模型', 'Primary model') }}</span>
                      <GlassSelect v-model="form.defaults.musicGenerationModel" :options="modelSelectOptions" :placeholder="text('选择模型', 'Select model')" />
                    </label>
                  </div>
                  <details class="config-collapsible" :open="form.defaults.musicGenerationModelFallback.length > 0">
                    <summary class="config-collapsible-summary">
                      <span>{{ text('回退链', 'Fallback chain') }}</span>
                      <span class="config-collapsible-meta">{{ form.defaults.musicGenerationModelFallback.length }} {{ text('项', 'items') }}</span>
                    </summary>
                    <div v-if="form.defaults.musicGenerationModelFallback.length" class="fallback-list fallback-list-spaced">
                      <div v-for="(model, index) in form.defaults.musicGenerationModelFallback" :key="`music-gen-${index}`" class="fallback-row">
                        <span class="fallback-index">{{ index + 1 }}</span>
                        <GlassSelect
                          v-model="form.defaults.musicGenerationModelFallback[index]"
                          :options="toSelectOptions(filteredFallbackOptions(form.defaults.musicGenerationModel, form.defaults.musicGenerationModelFallback, index, modelOptions))"
                          :placeholder="text('选择回退模型', 'Select fallback model')"
                        />
                        <button class="danger-link" type="button" @click="removeFallback('musicGeneration', index)">{{ text('移除', 'Remove') }}</button>
                      </div>
                    </div>
                    <div v-else class="empty-inline">{{ text('当前未设置音乐生成回退。', 'No music-generation fallbacks configured yet.') }}</div>
                  </details>
                </section>
                <section class="config-subsection">
                  <div class="config-subsection-head">
                    <div class="provider-model-toolbar">
                      <div>
                        <h4>{{ text('PDF 模型', 'PDF model') }}</h4>
                        <p>{{ text('PDF 处理默认使用的模型。', 'Default model for PDF processing.') }}</p>
                      </div>
                      <button class="secondary-button compact-button" type="button" @click="addFallback('pdf')" :disabled="!modelOptions.length">{{ text('添加回退', 'Add fallback') }}</button>
                    </div>
                  </div>
                  <div class="form-grid">
                    <label class="form-field">
                      <span class="form-label">{{ text('主模型', 'Primary model') }}</span>
                      <GlassSelect v-model="form.defaults.pdfModel" :options="modelSelectOptions" :placeholder="text('选择模型', 'Select model')" />
                    </label>
                  </div>
                  <details class="config-collapsible" :open="form.defaults.pdfModelFallback.length > 0">
                    <summary class="config-collapsible-summary">
                      <span>{{ text('回退链', 'Fallback chain') }}</span>
                      <span class="config-collapsible-meta">{{ form.defaults.pdfModelFallback.length }} {{ text('项', 'items') }}</span>
                    </summary>
                    <div v-if="form.defaults.pdfModelFallback.length" class="fallback-list fallback-list-spaced">
                      <div v-for="(model, index) in form.defaults.pdfModelFallback" :key="`pdf-${index}`" class="fallback-row">
                        <span class="fallback-index">{{ index + 1 }}</span>
                        <GlassSelect
                          v-model="form.defaults.pdfModelFallback[index]"
                          :options="toSelectOptions(filteredFallbackOptions(form.defaults.pdfModel, form.defaults.pdfModelFallback, index, modelOptions))"
                          :placeholder="text('选择回退模型', 'Select fallback model')"
                        />
                        <button class="danger-link" type="button" @click="removeFallback('pdf', index)">{{ text('移除', 'Remove') }}</button>
                      </div>
                    </div>
                    <div v-else class="empty-inline">{{ text('当前未设置 PDF 回退。', 'No PDF fallbacks configured yet.') }}</div>
                  </details>
                </section>
              </div>
              <div class="settings-inline-grid">
                <label class="toggle-card">
                  <input v-model="form.defaults.mediaGenerationAutoProviderFallback" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('媒体生成自动补充其他供应商', 'Auto-provider fallback for media generation') }}</strong>
                    <span>{{ text('开启后会在显式回退之后继续补充其他已认证供应商。', 'When enabled, the runtime appends other auth-backed providers after explicit fallbacks.') }}</span>
                  </div>
                </label>
              </div>
            </section>

            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('运行守卫摘要', 'Runtime guard summary') }}</h4>
                <p>{{ text('这里保留当前守卫状态摘要；具体策略和低频阈值迁移到高级面板中集中编辑。', 'This lane keeps a summary of the current guards; the detailed policy and low-frequency thresholds move into the advanced sheet.') }}</p>
              </div>
              <div class="config-guard-summary-grid">
                <article class="config-guard-summary">
                  <span>{{ text('Embedded Pi 项目设置策略', 'Embedded Pi project settings policy') }}</span>
                  <strong>{{ form.defaults.embeddedPiProjectSettingsPolicy || text('未设置', 'Unset') }}</strong>
                </article>
                <article class="config-guard-summary">
                  <span>{{ text('Bootstrap 守卫', 'Bootstrap guard') }}</span>
                  <strong>{{ form.defaults.skipBootstrap ? text('跳过', 'Skipped') : text('启用', 'Enabled') }}</strong>
                </article>
              </div>
              <p class="field-hint config-core-hint">
                {{ text('仓库根目录、Bootstrap 字符阈值、子 Agent 嵌套深度和运行时 JSON 守卫都在高级面板中。', 'Repository root, bootstrap character thresholds, sub-agent depth, and runtime JSON guards now live in the advanced sheet.') }}
              </p>
            </section>
          </div>
          </section>

          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('文本模型回退链', 'Text model fallback chain') }}</span></h3>
            <button class="secondary-button compact-button" type="button" @click="addFallback('model')" :disabled="!modelOptions.length">{{ text('添加回退', 'Add fallback') }}</button>
          </div>
          <details class="config-collapsible" :open="form.defaults.modelFallback.length > 0">
            <summary class="config-collapsible-summary">
              <span>{{ text('查看 / 编辑文本模型回退链', 'View / edit text fallback chain') }}</span>
              <span class="config-collapsible-meta">{{ form.defaults.modelFallback.length }} {{ text('项', 'items') }}</span>
            </summary>
            <div v-if="form.defaults.modelFallback.length" class="fallback-list fallback-list-spaced">
              <div v-for="(model, index) in form.defaults.modelFallback" :key="`model-${index}`" class="fallback-row">
                <span class="fallback-index">{{ index + 1 }}</span>
                <GlassSelect
                  v-model="form.defaults.modelFallback[index]"
                  :options="toSelectOptions(filteredFallbackOptions(form.defaults.model, form.defaults.modelFallback, index, modelOptions))"
                  :placeholder="text('选择回退模型', 'Select fallback model')"
                />
                <button class="danger-link" type="button" @click="removeFallback('model', index)">{{ text('移除', 'Remove') }}</button>
              </div>
            </div>
            <div v-else class="empty-inline">{{ text('当前未设置文本模型回退，主模型失败时不会自动换模。', 'No text-model fallbacks configured yet; if the primary model fails there is no automatic failover.') }}</div>
          </details>
          </section>

          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('图片模型回退链', 'Image model fallback chain') }}</span></h3>
            <button class="secondary-button compact-button" type="button" @click="addFallback('image')" :disabled="!imageModelOptions.length">{{ text('添加回退', 'Add fallback') }}</button>
          </div>
          <details class="config-collapsible" :open="form.defaults.imageModelFallback.length > 0">
            <summary class="config-collapsible-summary">
              <span>{{ text('查看 / 编辑图片模型回退链', 'View / edit image fallback chain') }}</span>
              <span class="config-collapsible-meta">{{ form.defaults.imageModelFallback.length }} {{ text('项', 'items') }}</span>
            </summary>
            <div v-if="form.defaults.imageModelFallback.length" class="fallback-list fallback-list-spaced">
              <div v-for="(model, index) in form.defaults.imageModelFallback" :key="`image-${index}`" class="fallback-row">
                <span class="fallback-index">{{ index + 1 }}</span>
                <GlassSelect
                  v-model="form.defaults.imageModelFallback[index]"
                  :options="toSelectOptions(filteredFallbackOptions(form.defaults.imageModel, form.defaults.imageModelFallback, index, imageModelOptions))"
                  :placeholder="text('选择图片回退模型', 'Select image fallback model')"
                />
                <button class="danger-link" type="button" @click="removeFallback('image', index)">{{ text('移除', 'Remove') }}</button>
              </div>
            </div>
            <div v-else class="empty-inline">{{ text('当前未设置图片模型回退。', 'No image-model fallback configured.') }}</div>
          </details>
          </section>

          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('压缩与记忆刷新', 'Compaction & Memory Flush') }}</span></h3>
          </div>
          <details class="config-collapsible" :open="form.compaction.mode !== 'safeguard' || Boolean(form.compaction.model)">
            <summary class="config-collapsible-summary">
              <span>{{ text('查看 / 编辑压缩策略', 'View / edit compaction settings') }}</span>
              <span class="config-collapsible-meta">{{ form.compaction.mode }}</span>
            </summary>
            <div class="config-subsection-grid settings-stack-spaced">
            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('压缩策略', 'Compaction strategy') }}</h4>
                <p>{{ text('定义何时压缩、保留多少上下文，以及是否使用专用压缩模型。', 'Define when compaction happens, how much context is reserved, and whether a dedicated compaction model is used.') }}</p>
              </div>
              <div class="setting-block">
                <span class="form-label">{{ text('压缩模式', 'Compaction mode') }}</span>
                <div class="choice-group choice-group-tight">
                  <button
                    v-for="option in effectiveCompactionOptions"
                    :key="option.value"
                    type="button"
                    class="choice-pill"
                    :class="{ active: form.compaction.mode === option.value }"
                    @click="form.compaction.mode = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <div class="settings-inline-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('保留 Token 下限', 'Reserve tokens floor') }}</span>
                  <input v-model.number="form.compaction.reserveTokensFloor" class="form-input" type="number" min="0" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('压缩专用模型', 'Compaction-only model') }}</span>
                  <GlassSelect
                    v-model="form.compaction.model"
                    :options="[{ value: '', label: text('跟随主模型', 'Follow primary model') }, ...modelSelectOptions]"
                    :placeholder="text('选择压缩专用模型', 'Select compaction model')"
                  />
                </label>
              </div>
            </section>

            <section class="config-subsection is-risk">
              <div class="config-subsection-head">
                <h4>{{ text('标识符与记忆刷新', 'Identifiers & memory flush') }}</h4>
                <p>{{ text('控制压缩时保留哪些标识符，以及是否在压缩前先做一次静默记忆刷新。', 'Control which identifiers are preserved during compaction and whether a silent memory flush runs before compaction.') }}</p>
              </div>
              <div class="settings-inline-grid">
                <div class="setting-block">
                  <span class="form-label">{{ text('标识符保留策略', 'Identifier policy') }}</span>
                  <div class="choice-group choice-group-tight">
                    <button
                      v-for="option in effectiveIdentifierPolicyOptions"
                      :key="option.value"
                      type="button"
                      class="choice-pill"
                      :class="{ active: form.compaction.identifierPolicy === option.value }"
                      @click="form.compaction.identifierPolicy = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <div class="toggle-grid">
                  <label class="toggle-card">
                    <input v-model="form.compaction.memoryFlush.enabled" class="form-checkbox" type="checkbox" />
                    <div>
                      <strong>{{ text('压缩前记忆刷新', 'Pre-compaction memory flush') }}</strong>
                      <span>{{ text('在自动压缩前触发一次静默持久化', 'Run a silent persistence pass before auto-compaction.') }}</span>
                    </div>
                  </label>
                </div>
              </div>
              <label class="form-field">
                <span class="form-label">{{ text('记忆刷新软阈值 Token', 'Memory-flush soft-threshold tokens') }}</span>
                <input v-model.number="form.compaction.memoryFlush.softThresholdTokens" class="form-input" type="number" min="0" />
                <span class="field-hint">{{ text('官方语义：当会话接近压缩阈值前，先做一次静默持久化。', 'Official meaning: trigger a silent persistence step before the session hits compaction.') }}</span>
              </label>
              <label v-if="form.compaction.identifierPolicy === 'custom'" class="form-field">
                <span class="form-label">{{ text('自定义标识符说明', 'Custom identifier instructions') }}</span>
                <textarea v-model="form.compaction.identifierInstructions" class="form-textarea" rows="3" :placeholder="text('例如：保留工单号、部署 ID 和 host:port 原样输出', 'For example: preserve ticket IDs, deployment IDs, and host:port pairs exactly')" />
              </label>
            </section>

            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('压缩后重注入', 'Post-compaction reinjection') }}</h4>
                <p>{{ text('定义在压缩完成后需要重新注入提示中的哪些段落。', 'Define which prompt sections should be reinjected after compaction completes.') }}</p>
              </div>
              <label class="form-field">
                <span class="form-label">{{ text('压缩后重注入章节', 'Post-compaction reinjected sections') }}</span>
                <input v-model="form.compaction.postCompactionSectionsText" class="form-input" type="text" :placeholder="text('例如：Session Startup, Red Lines', 'For example: Session Startup, Red Lines')" />
                <span class="field-hint">{{ text('以逗号分隔；留空则表示不额外指定。', 'Use commas; leave empty to avoid specifying extra sections.') }}</span>
              </label>
            </section>
            </div>
          </details>
          </section>
        </article>
      </section>

      <section v-else-if="activeTab === 'security'" class="page-shell config-section-grid config-section-grid-security">
        <article class="config-sheet">
          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('Sandbox 策略', 'Sandbox Strategy') }}</span></h3>
          </div>
          <div class="config-subsection-grid">
            <section class="config-subsection is-risk">
              <div class="config-subsection-head">
                <h4>{{ text('隔离边界', 'Isolation boundaries') }}</h4>
                <p>{{ text('先决定 sandbox 怎么隔离，再决定工作区和可见性。', 'Decide how sandboxing is isolated first, then choose workspace and visibility rules.') }}</p>
              </div>
              <div class="settings-inline-grid config-setting-grid">
                <div class="setting-block">
                  <span class="form-label">{{ text('Sandbox 模式', 'Sandbox mode') }}</span>
                  <div class="choice-group choice-group-tight">
                    <button
                      v-for="option in effectiveSandboxModeOptions"
                      :key="option.value"
                      type="button"
                      class="choice-pill"
                      :class="{ active: form.sandbox.mode === option.value }"
                      @click="form.sandbox.mode = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <div class="setting-block">
                  <span class="form-label">{{ text('工作区访问权限', 'Workspace access') }}</span>
                  <div class="choice-group choice-group-tight">
                    <button
                      v-for="option in effectiveWorkspaceAccessOptions"
                      :key="option.value"
                      type="button"
                      class="choice-pill"
                      :class="{ active: form.sandbox.workspaceAccess === option.value }"
                      @click="form.sandbox.workspaceAccess = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <div class="setting-block">
                  <span class="form-label">{{ text('Sandbox 作用域', 'Sandbox scope') }}</span>
                  <div class="choice-group choice-group-tight">
                    <button
                      v-for="option in effectiveSandboxScopeOptions"
                      :key="option.value"
                      type="button"
                      class="choice-pill"
                      :class="{ active: form.sandbox.scope === option.value }"
                      @click="form.sandbox.scope = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <div class="setting-block">
                  <span class="form-label">{{ text('会话工具可见范围', 'Session tools visibility') }}</span>
                  <div class="choice-group choice-group-tight">
                    <button
                      v-for="option in effectiveVisibilityOptions"
                      :key="option.value"
                      type="button"
                      class="choice-pill"
                      :class="{ active: form.sandbox.sessionToolsVisibility === option.value }"
                      @click="form.sandbox.sessionToolsVisibility = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('清理策略', 'Cleanup policy') }}</h4>
                <p>{{ text('控制会话空闲多久后回收，以及 sandbox 最长能保留多久。', 'Control when idle sessions are cleaned up and how long a sandbox may persist.') }}</p>
              </div>
              <div class="settings-inline-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('空闲清理小时', 'Idle cleanup hours') }}</span>
                  <input v-model.number="form.sandbox.prune.idleHours" class="form-input" type="number" min="1" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('最大存活天数', 'Max age days') }}</span>
                  <input v-model.number="form.sandbox.prune.maxAgeDays" class="form-input" type="number" min="1" />
                </label>
              </div>
            </section>
          </div>
          </section>

          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('工具与执行安全', 'Tools & Execution Safety') }}</span></h3>
          </div>
          <div class="config-subsection-grid">
            <section class="config-subsection is-risk config-subsection-spotlight">
              <div class="config-subsection-head">
                <div class="config-spotlight-heading">
                  <h4>{{ text('Studio Chat 宿主管理 Exec', 'Studio Chat host-management Exec') }}</h4>
                  <span class="config-spotlight-badge">{{ text('高风险开关', 'High-impact switch') }}</span>
                </div>
                <p>
                  {{
                    text(
                      '这是 Studio Chat 私聊面里最敏感的执行能力开关。打开后，用户才能在 chat 页面临时放行 `openclaw / systemctl / service / kill` 一类宿主管理命令。',
                      'This is the most sensitive execution switch in Studio Chat. When enabled, users can temporarily allow host-management commands such as `openclaw`, `systemctl`, `service`, and `kill` inside chat sessions.',
                    )
                  }}
                </p>
              </div>

              <label class="toggle-card config-spotlight-toggle-card">
                <input v-model="form.studioChat.allowHostManagementExecInStudioChat" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('允许在 Studio Chat 中启用宿主管理 Exec', 'Allow host-management Exec in Studio Chat') }}</strong>
                  <span>
                    {{
                      text(
                        '作用：允许 chat 页出现“本会话宿主管理 Exec”临时开关。配置方式：默认关闭；仅在需要通过 Studio 直接排障宿主时开启。',
                        'Purpose: allows the chat page to expose the per-session “Host-management Exec” switch. How to configure: keep it off by default and enable it only when Studio must troubleshoot the host directly.',
                      )
                    }}
                  </span>
                </div>
              </label>

              <div class="field-hint">
                {{
                  text(
                    '该开关只决定 Studio Chat 是否“允许启用”宿主管理 Exec；真正放行仍需要用户在具体会话里再次手动开启。',
                    'This switch only decides whether Studio Chat is allowed to expose host-management Exec. Actual execution still requires the user to enable it again inside a specific chat session.',
                  )
                }}
              </div>
            </section>

            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('工具配置', 'Tool profile') }}</h4>
                <p>{{ text('先选工具配置档，再决定执行相关风险策略。', 'Choose the tool profile first, then define execution-related risk policy.') }}</p>
              </div>
              <div class="choice-group">
                <button
                  v-for="option in effectiveToolProfileOptions"
                  :key="option.value"
                  type="button"
                  class="choice-chip"
                  :class="{ active: form.tools.profile === option.value }"
                  @click="form.tools.profile = option.value"
                >
                  <strong>{{ option.label }}</strong>
                  <span>{{ option.note }}</span>
                </button>
              </div>
            </section>

            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('执行策略', 'Execution policy') }}</h4>
                <p>{{ text('控制命令何时需要确认，以及命令是否必须经过 allowlist。', 'Control when command execution requires confirmation and whether execution must pass through an allowlist.') }}</p>
              </div>
              <div class="settings-inline-grid config-setting-grid">
                <div class="setting-block">
                  <span class="form-label">{{ text('命令确认策略', 'Exec ask policy') }}</span>
                  <div class="choice-group choice-group-tight">
                    <button
                    v-for="option in effectiveExecAskOptions"
                      :key="option.value"
                      type="button"
                      class="choice-pill"
                      :class="{ active: form.tools.execAsk === option.value }"
                      @click="form.tools.execAsk = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <div class="setting-block">
                  <span class="form-label">{{ text('执行安全级别', 'Exec security') }}</span>
                  <div class="choice-group choice-group-tight">
                    <button
                    v-for="option in effectiveExecSecurityOptions"
                      :key="option.value"
                      type="button"
                      class="choice-pill"
                      :class="{ active: form.tools.execSecurity === option.value }"
                      @click="form.tools.execSecurity = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('执行目标', 'Execution target') }}</h4>
                <p>{{ text('决定命令在哪里执行，以及默认节点和超时配置。', 'Decide where commands run and configure default node binding plus timeout.') }}</p>
              </div>
              <div class="settings-inline-grid">
                <div class="setting-block">
                  <span class="form-label">{{ text('执行主机', 'Exec host') }}</span>
                  <div class="choice-group choice-group-tight">
                    <button
                      v-for="option in effectiveExecHostOptions"
                      :key="option.value"
                      type="button"
                      class="choice-pill"
                      :class="{ active: form.tools.execHost === option.value }"
                      @click="form.tools.execHost = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <label class="form-field">
                  <span class="form-label">{{ text('默认节点绑定', 'Default node binding') }}</span>
                  <input v-model="form.tools.execNode" class="form-input" type="text" :placeholder="text('node-id-or-name，可留空', 'node-id-or-name, optional')" />
                  <span class="field-hint">{{ text('仅在 `exec host=node` 时使用。', 'Used only when exec host = node.') }}</span>
                </label>
              </div>
              <label class="form-field">
                <span class="form-label">{{ text('执行超时秒数', 'Exec timeout seconds') }}</span>
                <input v-model.number="form.tools.execTimeoutSec" class="form-input" type="number" min="1" />
              </label>
            </section>

            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('权限边界', 'Permission boundary') }}</h4>
                <p>{{ text('控制是否允许提升权限，以及文件系统是否限制在工作区。', 'Control whether elevated mode is allowed and whether filesystem access stays within the workspace.') }}</p>
              </div>
              <div class="toggle-grid">
                <label class="toggle-card">
                  <input v-model="form.tools.elevatedEnabled" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('高权限模式', 'Elevated mode') }}</strong>
                    <span>{{ text('允许提升到更高风险的执行能力', 'Allows escalation into higher-risk execution capability.') }}</span>
                  </div>
                </label>
                <label class="toggle-card">
                  <input v-model="form.tools.fsWorkspaceOnly" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('仅工作区文件系统', 'Workspace-only filesystem') }}</strong>
                    <span>{{ text('限制文件访问范围，减少误操作', 'Restrict file access scope and reduce accidental actions.') }}</span>
                  </div>
                </label>
              </div>
            </section>
          </div>
          </section>

          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('Exec 审批默认策略', 'Exec approval defaults') }}</span></h3>
          </div>
          <div class="settings-stack">
            <div class="settings-inline-grid">
              <div class="setting-block">
                <span class="form-label">{{ text('默认安全策略', 'Default security') }}</span>
                <div class="choice-group choice-group-tight">
                  <button
                    v-for="option in effectiveApprovalsSecurityOptions"
                    :key="`approval-security-${option.value}`"
                    type="button"
                    class="choice-pill"
                    :class="{ active: form.execApprovals.security === option.value }"
                    @click="form.execApprovals.security = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <div class="setting-block">
                <span class="form-label">{{ text('默认询问策略', 'Default ask policy') }}</span>
                <div class="choice-group choice-group-tight">
                  <button
                    v-for="option in effectiveApprovalsAskOptions"
                    :key="`approval-ask-${option.value}`"
                    type="button"
                    class="choice-pill"
                    :class="{ active: form.execApprovals.ask === option.value }"
                    @click="form.execApprovals.ask = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>

            <div class="setting-block">
              <span class="form-label">{{ text('无 UI 时的回退策略', 'Fallback when UI is unavailable') }}</span>
              <div class="choice-group choice-group-tight">
                <button
                  v-for="option in effectiveApprovalsAskFallbackOptions"
                  :key="`approval-fallback-${option.value}`"
                  type="button"
                  class="choice-pill"
                  :class="{ active: form.execApprovals.askFallback === option.value }"
                  @click="form.execApprovals.askFallback = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <label class="toggle-card">
              <input v-model="form.execApprovals.autoAllowSkills" class="form-checkbox" type="checkbox" />
              <div>
                <strong>{{ text('自动放行技能 CLI', 'Auto-allow skill CLIs') }}</strong>
                <span>{{ text('允许已知技能引用的可执行文件在 allowlist 模式下被视为隐式白名单。', 'Treat known skill binaries as implicit allowlist entries in allowlist mode.') }}</span>
              </div>
            </label>
            <p class="field-hint">{{ text(`审批存储位置：${loadedSummary?.execApprovals.socketPath || '未检测到 socket path'}`, `Approvals socket path: ${loadedSummary?.execApprovals.socketPath || 'not detected'}`) }}</p>
            <p class="field-hint">{{ text(`当前有 ${loadedSummary?.execApprovals.agents.length ?? 0} 个 Agent 在 exec-approvals.json 中有独立策略。`, `${loadedSummary?.execApprovals.agents.length ?? 0} agents currently have dedicated policy blocks in exec-approvals.json.`) }}</p>
          </div>
          </section>

          <section class="config-block">
            <details class="config-collapsible" :open="form.execApprovals.agents.length > 0">
              <summary class="config-collapsible-summary">
                <strong>{{ text('Agent Allowlist 管理', 'Agent allowlist manager') }}</strong>
                <span class="config-collapsible-meta">{{ form.execApprovals.agents.length ? text(`${form.execApprovals.agents.length} 个 Agent`, `${form.execApprovals.agents.length} agents`) : text('未配置', 'None') }}</span>
              </summary>

              <div class="settings-stack settings-stack-spaced">
                <div class="panel-head">
                  <button class="secondary-button compact-button" type="button" @click="addApprovalAgent()" :disabled="!missingApprovalAgents.length">
                    {{ text('添加 Agent 覆盖', 'Add agent override') }}
                  </button>
                </div>

                <div v-if="missingApprovalAgents.length" class="choice-group choice-group-tight">
                  <button
                    v-for="agentId in missingApprovalAgents"
                    :key="`quick-agent-${agentId}`"
                    type="button"
                    class="choice-pill"
                    @click="addApprovalAgent(agentId)"
                  >
                    {{ agentId }}
                  </button>
                </div>

                <div class="provider-stack">
                  <article
                    v-for="(agent, agentIndex) in form.execApprovals.agents"
                    :key="agent.uid"
                    class="provider-card provider-card-visual"
                  >
                    <div class="provider-card-head provider-card-head-visual">
                      <div>
                        <strong>{{ agent.agentId }}</strong>
                        <p class="provider-caption">{{ text('针对该 Agent 单独覆盖 exec 审批策略和 allowlist。', 'Override exec approval strategy and allowlist specifically for this agent.') }}</p>
                      </div>
                      <button class="danger-link" type="button" @click="removeApprovalAgent(agentIndex)">{{ text('移除 Agent 覆盖', 'Remove agent override') }}</button>
                    </div>

                    <div class="settings-inline-grid">
                      <div class="setting-block">
                    <span class="form-label">{{ text('安全策略', 'Security') }}</span>
                        <div class="choice-group choice-group-tight">
                          <button
                            v-for="option in withCurrentOption(execSecurityOptions, agent.security)"
                            :key="`${agent.agentId}-security-${option.value}`"
                            type="button"
                            class="choice-pill"
                            :class="{ active: agent.security === option.value }"
                            @click="agent.security = option.value"
                          >
                            {{ option.label }}
                          </button>
                        </div>
                      </div>

                      <div class="setting-block">
                    <span class="form-label">{{ text('询问策略', 'Ask policy') }}</span>
                        <div class="choice-group choice-group-tight">
                          <button
                            v-for="option in withCurrentOption(execAskOptions, agent.ask)"
                            :key="`${agent.agentId}-ask-${option.value}`"
                            type="button"
                            class="choice-pill"
                            :class="{ active: agent.ask === option.value }"
                            @click="agent.ask = option.value"
                          >
                            {{ option.label }}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="setting-block">
                      <span class="form-label">{{ text('回退策略', 'Ask fallback') }}</span>
                      <div class="choice-group choice-group-tight">
                        <button
                          v-for="option in withCurrentOption(askFallbackOptions, agent.askFallback)"
                          :key="`${agent.agentId}-fallback-${option.value}`"
                          type="button"
                          class="choice-pill"
                          :class="{ active: agent.askFallback === option.value }"
                          @click="agent.askFallback = option.value"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                    </div>

                    <label class="toggle-card">
                      <input v-model="agent.autoAllowSkills" class="form-checkbox" type="checkbox" />
                      <div>
                        <strong>{{ text('自动放行技能 CLI', 'Auto-allow skill CLIs') }}</strong>
                        <span>{{ text('仅对当前 Agent 生效。', 'Applies only to the current agent.') }}</span>
                      </div>
                    </label>

                    <div class="provider-model-section">
                      <div class="provider-model-toolbar">
                        <h4>{{ text('Allowlist 模式列表', 'Allowlist Patterns') }}</h4>
                        <button class="secondary-button compact-button" type="button" @click="addAllowlistEntry(agentIndex)">{{ text('添加 Pattern', 'Add pattern') }}</button>
                      </div>
                      <div v-if="agent.allowlist.length" class="provider-model-list">
                        <article
                          v-for="(entry, entryIndex) in agent.allowlist"
                          :key="entry.uid"
                          class="provider-model-row"
                        >
                          <div class="provider-model-row-head">
                            <strong>{{ text('模式', 'Pattern') }} {{ entryIndex + 1 }}</strong>
                            <button class="danger-link" type="button" @click="removeAllowlistEntry(agentIndex, entryIndex)">{{ text('移除', 'Remove') }}</button>
                          </div>
                          <div class="form-grid">
                            <label class="form-field form-field-full">
                              <span class="form-label">{{ text('模式', 'Pattern') }}</span>
                              <input v-model="entry.pattern" class="form-input" type="text" :placeholder="text('例如 ~/.local/bin/* 或 /opt/homebrew/bin/rg', 'For example: ~/.local/bin/* or /opt/homebrew/bin/rg')" />
                            </label>
                            <label class="form-field">
                              <span class="form-label">{{ text('上次使用命令', 'Last used command') }}</span>
                              <input v-model="entry.lastUsedCommand" class="form-input" type="text" :placeholder="text('可留空，仅作为参考', 'Optional, for reference only')" />
                            </label>
                            <label class="form-field">
                              <span class="form-label">{{ text('上次解析路径', 'Last resolved path') }}</span>
                              <input v-model="entry.lastResolvedPath" class="form-input" type="text" :placeholder="text('可留空，仅作为参考', 'Optional, for reference only')" />
                            </label>
                          </div>
                        </article>
                      </div>
                      <div v-else class="empty-inline">{{ text('当前 Agent 没有 allowlist pattern，处于纯策略控制状态。', 'This agent currently has no allowlist pattern and relies only on policy controls.') }}</div>
                    </div>
                  </article>
                </div>
              </div>
            </details>
          </section>
        </article>
      </section>

      <section v-else-if="activeTab === 'session'" class="page-shell config-section-grid config-section-grid-session">
        <article class="config-sheet">
          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('会话与消息行为', 'Sessions & Messaging') }}</span></h3>
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
              <span class="field-hint">{{ text('当前配置读取自 `openclaw.json.session.dmScope`，会忠实保留已有模式。', 'Reads directly from openclaw.json.session.dmScope and preserves the current mode faithfully.') }}</span>
            </div>
            <div class="setting-block">
              <span class="form-label">{{ text('回复前缀', 'Response prefix') }}</span>
              <input v-model="form.messages.responsePrefix" class="form-input" type="text" :placeholder="text('例如 [openclaw]，留空表示不设置', 'For example: [openclaw], leave empty to disable')" />
              <span class="field-hint">{{ text('对应官方 `messages.responsePrefix`。', 'Maps to the official `messages.responsePrefix` setting.') }}</span>
            </div>
            <div class="settings-inline-grid">
              <label class="form-field">
                <span class="form-label">{{ text('确认反应表情', 'Ack reaction emoji') }}</span>
                <input v-model="form.messages.ackReaction" class="form-input" type="text" :placeholder="text('例如 👀，留空按官方默认', 'For example: 👀, leave empty to use the official default')" />
              </label>
              <label class="toggle-card">
                <input v-model="form.messages.removeAckAfterReply" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('回复后移除确认反应', 'Remove ack reaction after reply') }}</strong>
                  <span>{{ text('仅支持部分渠道', 'Supported only on some channels') }}</span>
                </div>
              </label>
            </div>
            <div class="setting-block">
              <span class="form-label">{{ text('确认反应触发范围', 'Ack reaction scope') }}</span>
              <div class="choice-group choice-group-tight">
                <button
                  v-for="option in effectiveAckScopeOptions"
                  :key="option.value"
                  type="button"
                  class="choice-pill"
                  :class="{ active: form.messages.ackReactionScope === option.value }"
                  @click="form.messages.ackReactionScope = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="setting-block">
              <span class="form-label">{{ text('消息队列模式', 'Message queue mode') }}</span>
              <div class="choice-group choice-group-tight">
                <button
                  v-for="option in effectiveQueueModeOptions"
                  :key="`queue-mode-${option.value}`"
                  type="button"
                  class="choice-pill"
                  :class="{ active: form.messages.queue.mode === option.value }"
                  @click="form.messages.queue.mode = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="settings-inline-grid">
              <label class="form-field">
                <span class="form-label">{{ text('队列防抖毫秒', 'Queue debounce ms') }}</span>
                <input v-model.number="form.messages.queue.debounceMs" class="form-input" type="number" min="0" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('队列容量', 'Queue capacity') }}</span>
                <input v-model.number="form.messages.queue.cap" class="form-input" type="number" min="1" />
              </label>
            </div>
            <div class="setting-block">
              <span class="form-label">{{ text('队列丢弃策略', 'Queue drop policy') }}</span>
              <div class="choice-group choice-group-tight">
                <button
                  v-for="option in effectiveQueueDropOptions"
                  :key="`queue-drop-${option.value}`"
                  type="button"
                  class="choice-pill"
                  :class="{ active: form.messages.queue.drop === option.value }"
                  @click="form.messages.queue.drop = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <details class="config-collapsible" :open="form.messages.queue.byChannel.length > 0">
              <summary class="config-collapsible-summary">
                <strong>{{ text('按渠道队列模式', 'Per-channel queue mode') }}</strong>
                <span class="config-collapsible-meta">{{ form.messages.queue.byChannel.length ? text(`${form.messages.queue.byChannel.length} 项`, `${form.messages.queue.byChannel.length} items`) : text('未设置', 'None') }}</span>
              </summary>
              <div class="provider-model-section settings-stack-spaced">
                <div class="provider-model-toolbar">
                  <h4>{{ text('按渠道队列模式', 'Per-channel queue mode') }}</h4>
                  <button class="secondary-button compact-button" type="button" @click="addQueueChannelMode()">{{ text('添加渠道覆盖', 'Add channel override') }}</button>
                </div>
                <div v-if="form.messages.queue.byChannel.length" class="provider-model-list">
                  <article
                    v-for="(entry, entryIndex) in form.messages.queue.byChannel"
                    :key="entry.uid"
                    class="provider-model-row"
                  >
                    <div class="provider-model-row-head">
                      <strong>{{ text('渠道覆盖', 'Channel Override') }} {{ entryIndex + 1 }}</strong>
                      <button class="danger-link" type="button" @click="removeQueueChannelMode(entryIndex)">{{ text('移除', 'Remove') }}</button>
                    </div>
                    <div class="settings-inline-grid">
                      <label class="form-field">
                        <span class="form-label">{{ text('渠道 ID', 'Channel ID') }}</span>
                        <GlassSelect
                          v-model="entry.channelId"
                          :options="queueChannelSelectOptions(entry.channelId)"
                          :placeholder="text('选择渠道', 'Select channel')"
                        />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('队列模式', 'Queue mode') }}</span>
                        <GlassSelect
                          v-model="entry.mode"
                          :options="effectiveQueueModeOptions"
                          :placeholder="text('选择队列模式', 'Select queue mode')"
                        />
                      </label>
                    </div>
                  </article>
                </div>
                <div v-else class="empty-inline">{{ text('当前没有按渠道的队列模式覆盖。', 'There is currently no per-channel queue override.') }}</div>
              </div>
            </details>
            <div class="settings-inline-grid">
              <label class="toggle-card">
                <input v-model="form.session.threadBindings.enabled" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('启用线程绑定', 'Enable thread bindings') }}</strong>
                  <span>{{ text('从共享频道线程映射到独立会话', 'Map shared channel threads into dedicated sessions.') }}</span>
                </div>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('线程空闲小时', 'Thread idle hours') }}</span>
                <input v-model.number="form.session.threadBindings.idleHours" class="form-input" type="number" min="0" />
              </label>
            </div>
            <label class="form-field">
              <span class="form-label">{{ text('线程最大存活小时', 'Thread max age hours') }}</span>
              <input v-model.number="form.session.threadBindings.maxAgeHours" class="form-input" type="number" min="0" />
            </label>
          </div>
          </section>

          <section class="config-block">
          <div class="panel-head">
            <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('当前行为摘要', 'Current behavior summary') }}</span></h3>
          </div>
          <div class="config-fact-list">
            <div class="config-fact">
              <span>{{ text('当前会话策略', 'Current session policy') }}</span>
              <strong>{{ form.session.dmScope }}</strong>
            </div>
            <div class="config-fact">
              <span>{{ text('确认反应范围', 'Ack reaction scope') }}</span>
              <strong>{{ form.messages.ackReactionScope }}</strong>
            </div>
            <div class="config-fact">
              <span>{{ text('当前消息队列', 'Current message queue') }}</span>
              <strong>{{ `${form.messages.queue.mode} · ${form.messages.queue.cap}` }}</strong>
            </div>
            <div class="config-fact">
              <span>{{ text('系统配置摘要', 'Config file summary') }}</span>
              <strong>{{ `${pluginSummary} / ${loadedSummary?.skillEntriesCount ?? 0}` }}</strong>
            </div>
          </div>
          </section>
        </article>
      </section>

      <SessionConfigTab
        v-else-if="activeTab === 'session-policy'"
        :form="form"
        :dmScopeOptions="dmScopeOptions"
      />

      <section v-else-if="activeTab === 'providers'" class="page-shell config-section-grid config-section-grid-providers">
        <div class="config-provider-workbench">
          <aside class="config-provider-sidebar">
            <div class="panel-head">
              <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('供应商列表', 'Provider List') }}</span></h3>
              <button class="secondary-button compact-button" type="button" @click="addProvider">{{ text('新增供应商', 'Add provider') }}</button>
            </div>

            <div v-if="form.providers.length" class="provider-index-list">
              <button
                v-for="(provider, providerIndex) in form.providers"
                :key="provider.uid"
                type="button"
                class="provider-index-item"
                :class="{ active: provider.uid === activeProviderUid }"
                @click="activeProviderUid = provider.uid"
              >
                <strong>{{ resolveProviderDisplayName(provider.id, providerIndex) }}</strong>
                <p>{{ text(`API：${provider.api || '未指定'}，模型数：${provider.models.length}`, `API: ${provider.api || 'unset'}, models: ${provider.models.length}`) }}</p>
              </button>
            </div>

            <div v-else class="empty-inline">
              {{ text('当前还没有模型供应商，先新增一个供应商。', 'There are no model providers yet. Add one to get started.') }}
            </div>
          </aside>

          <article class="config-provider-editor" v-if="activeProvider">
            <div class="panel-head">
              <div class="panel-heading-emph">
                <span class="panel-heading-mark" aria-hidden="true"></span>
                <div>
                  <h3>{{ resolveProviderDisplayName(activeProvider.id, activeProviderIndex) }}</h3>
                  <p class="panel-muted">{{ text('右侧只编辑当前选中的供应商，减少并排供应商卡片带来的噪音。', 'Only the selected provider is edited on the right to reduce the noise of multiple provider cards.') }}</p>
                </div>
              </div>
              <button class="danger-link" type="button" @click="removeProvider(activeProviderIndex)">{{ text('移除供应商', 'Remove provider') }}</button>
            </div>

            <div class="config-sheet">
              <section class="config-block">
                <div class="panel-head">
                  <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('供应商基础配置', 'Provider Basics') }}</span></h3>
                </div>
                <div class="config-fact-list config-fact-list-compact">
                  <div class="config-fact">
                    <span>{{ text('当前 API 类型', 'Current API type') }}</span>
                    <strong>{{ activeProvider.api || text('未指定', 'Unset') }}</strong>
                  </div>
                  <div class="config-fact">
                    <span>{{ text('模型数量', 'Model count') }}</span>
                    <strong>{{ activeProvider.models.length }}</strong>
                  </div>
                  <div class="config-fact">
                    <span>{{ text('密钥状态', 'Key status') }}</span>
                    <strong>{{ activeProvider.hasApiKey ? text('已配置', 'Configured') : text('未配置', 'Missing') }}</strong>
                  </div>
                </div>
                <div class="provider-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('供应商 ID', 'Provider ID') }}</span>
                    <input v-model="activeProvider.id" class="form-input" type="text" :placeholder="text('例如 gmn / bigmodel', 'For example: gmn / bigmodel')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('API 类型', 'API type') }}</span>
                    <GlassSelect
                      v-model="activeProvider.api"
                      :options="[{ value: '', label: text('未指定', 'Unset') }, ...providerApiOptions.map((option) => ({ value: option, label: option }))]"
                      :placeholder="text('选择 API 类型', 'Select API type')"
                    />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Base URL', 'Base URL') }}</span>
                    <input v-model="activeProvider.baseUrl" class="form-input" type="text" placeholder="https://api.example.com/v1" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('API Key', 'API Key') }}</span>
                    <div class="credential-input-row">
                      <input
                        :value="providerApiKeyDisplay(activeProvider)"
                        class="form-input"
                        :type="activeProvider.apiKeyVisible ? 'text' : 'password'"
                        :placeholder="activeProvider.hasApiKey ? text('已配置密钥', 'Configured key') : text('可选', 'Optional')"
                        :readonly="activeProvider.hasApiKey && !activeProvider.apiKeyLoaded && !activeProvider.apiKeyVisible"
                        @input="onProviderApiKeyInput(activeProvider, ($event.target as HTMLInputElement).value)"
                      />
                      <button
                        type="button"
                        class="credential-toggle"
                        :disabled="activeProvider.apiKeyLoading || (!activeProvider.hasApiKey && !activeProvider.apiKeyLoaded && !activeProvider.apiKey)"
                        @click="toggleProviderApiKey(activeProvider)"
                      >
                        {{
                          activeProvider.apiKeyLoading
                            ? text('读取中...', 'Loading...')
                            : activeProvider.apiKeyVisible
                              ? text('隐藏', 'Hide')
                              : text('显示', 'Show')
                        }}
                      </button>
                    </div>
                    <span class="field-hint">
                      {{
                        activeProvider.apiKeyLoading
                          ? text('正在读取当前密钥...', 'Loading current API key...')
                          : activeProvider.hasApiKey
                            ? text('当前已配置密钥，默认遮掩显示；留空不会覆盖。', 'An API key is configured and shown masked by default; leaving it untouched will not overwrite it.')
                            : text('当前未配置密钥。', 'No API key is configured yet.')
                      }}
                    </span>
                  </label>
                </div>
              </section>

              <section class="config-block">
                <div class="provider-model-toolbar">
                  <h4>{{ text('模型矩阵', 'Model matrix') }}</h4>
                  <button class="secondary-button compact-button" type="button" @click="addProviderModel(activeProviderIndex)">{{ text('新增模型', 'Add model') }}</button>
                </div>

                <div v-if="activeProvider.models.length" class="provider-model-list">
                  <article v-for="(model, modelIndex) in activeProvider.models" :key="model.uid" class="provider-model-row">
                    <div class="provider-model-row-head">
                      <strong>{{ text('模型', 'Model') }} {{ modelIndex + 1 }}</strong>
                      <button class="danger-link" type="button" @click="removeProviderModel(activeProviderIndex, modelIndex)">{{ text('移除', 'Remove') }}</button>
                    </div>

                    <div class="provider-grid provider-grid-compact">
                      <label class="form-field">
                        <span class="form-label">{{ text('模型 ID', 'Model ID') }}</span>
                        <input v-model="model.id" class="form-input" type="text" placeholder="gpt-5.4" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('上下文窗口', 'Context Window') }}</span>
                        <input v-model.number="model.contextWindow" class="form-input" type="number" min="0" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('最大 Token', 'Max Tokens') }}</span>
                        <input v-model.number="model.maxTokens" class="form-input" type="number" min="0" />
                      </label>
                      <div class="form-field form-field-full">
                        <span class="form-label">{{ text('能力矩阵', 'Capabilities') }}</span>
                        <div class="capability-row">
                          <label class="capability-chip" :class="{ active: model.capText }">
                            <input v-model="model.capText" type="checkbox" class="form-checkbox" />
                            <span>{{ text('文本', 'Text') }}</span>
                          </label>
                          <label class="capability-chip" :class="{ active: model.capImage }">
                            <input v-model="model.capImage" type="checkbox" class="form-checkbox" />
                            <span>{{ text('图片', 'Image') }}</span>
                          </label>
                          <label class="capability-chip" :class="{ active: model.reasoning }">
                            <input v-model="model.reasoning" type="checkbox" class="form-checkbox" />
                            <span>{{ text('推理', 'Reasoning') }}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
                <div v-else class="empty-inline">{{ text('当前供应商还没有模型，先添加结构化模型项。', 'This provider has no models yet. Add a structured model row first.') }}</div>
              </section>
            </div>
          </article>

          <article v-else class="empty-inline panel-muted">
            {{ text('先从左侧选择一个供应商。', 'Select a provider from the left first.') }}
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'gateway'" class="page-shell config-section-grid">
        <GatewayConfigTab :summary="loadedSummary" @update:gateway="onGatewayUpdate" />
      </section>

      <AcpConfigTab v-else-if="activeTab === 'acp'" ref="acpTabRef" :summary="loadedSummary" :saving="saving" @quick-save="saveChanges" />

      <section v-else-if="activeTab === 'mcp-skills'" class="page-shell config-section-grid config-section-grid-mcp-skills">
        <article class="config-sheet">
          <section class="config-block">
            <div class="panel-head">
              <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('MCP 运行时', 'MCP Runtime') }}</span></h3>
            </div>
            <div class="config-subsection-grid">
              <section class="config-subsection is-primary">
                <div class="config-subsection-head">
                  <h4>{{ text('MCP 会话与服务器', 'MCP sessions and servers') }}</h4>
                  <p>{{ text('维护 mcp.sessionIdleTtlMs 与 mcp.servers。服务器对象保持 JSON 编辑，避免把不同 MCP transport 的结构硬编码死。', 'Maintain mcp.sessionIdleTtlMs and mcp.servers. Server definitions stay JSON-based so different MCP transports are not hard-coded into the UI.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('空闲回收 TTL (ms)', 'Idle TTL (ms)') }}</span>
                    <input v-model.number="form.mcpSkills.mcpSessionIdleTtlMs" class="form-input" type="number" min="0" :placeholder="text('留空表示跟随宿主默认', 'Leave empty to follow host default')" />
                    <span class="field-hint">{{ text('对应 mcp.sessionIdleTtlMs；0 表示禁用空闲回收，留空表示不覆盖。', 'Maps to mcp.sessionIdleTtlMs; 0 disables idle eviction, empty means no override.') }}</span>
                  </label>
                  <label class="form-field form-field-wide">
                    <span class="form-label">{{ text('MCP Servers JSON', 'MCP Servers JSON') }}</span>
                    <textarea v-model="form.mcpSkills.mcpServersJson" class="form-textarea code-textarea" rows="10" spellcheck="false" placeholder="{\n  &quot;filesystem&quot;: {\n    &quot;command&quot;: &quot;npx&quot;,\n    &quot;args&quot;: [&quot;-y&quot;, &quot;@modelcontextprotocol/server-filesystem&quot;]\n  }\n}" />
                    <span class="field-hint">{{ text('对应 mcp.servers；保存前会校验必须是 JSON 对象。', 'Maps to mcp.servers; Studio validates that it is a JSON object before saving.') }}</span>
                  </label>
                </div>
              </section>
            </div>
          </section>

          <section class="config-block">
            <div class="panel-head">
              <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('技能加载与安装', 'Skill Loading & Install') }}</span></h3>
            </div>
            <div class="config-subsection-grid">
              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('共享技能策略', 'Shared skill policy') }}</h4>
                  <p>{{ text('这里只维护技能运行时的加载、监听、安装偏好和限制。安装、删除、迁移、同步请使用技能管理页，避免配置页变成第二个技能市场。', 'This section only maintains skill runtime loading, watching, install preferences, and limits. Use Skills management for install, remove, migration, and sync workflows.') }}</p>
                </div>
                <div class="settings-stack">
                  <div class="form-grid">
                    <label class="form-field">
                      <span class="form-label">{{ text('内置技能白名单', 'Bundled skill allowlist') }}</span>
                      <textarea v-model="form.mcpSkills.skillsAllowBundledText" class="form-textarea" rows="4" :placeholder="text('每行一个内置技能 ID；留空表示不覆盖', 'One bundled skill id per line; leave empty to avoid overriding')" />
                      <span class="field-hint">{{ text('对应 skills.allowBundled。官方结构是字符串数组，不是开关；未配置时留空不会写入，已有配置时清空会写入空白名单。', 'Maps to skills.allowBundled. The official shape is a string array, not a boolean; empty untouched state is not written, while clearing an existing value writes an empty allowlist.') }}</span>
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text('额外技能目录', 'Extra skill directories') }}</span>
                      <textarea v-model="form.mcpSkills.skillsExtraDirsText" class="form-textarea" rows="4" :placeholder="text('每行一个目录，例如 ~/.openclaw/shared-skills', 'One directory per line, e.g. ~/.openclaw/shared-skills')" />
                      <span class="field-hint">{{ text('对应 skills.load.extraDirs。共享技能目录、团队技能目录可以放这里。', 'Maps to skills.load.extraDirs. Shared or team skill directories can be listed here.') }}</span>
                    </label>
                  </div>
                  <div class="settings-inline-grid">
                    <label class="toggle-card">
                      <input v-model="form.mcpSkills.skillsLoadWatch" class="form-checkbox" type="checkbox" />
                      <div>
                        <strong>{{ text('监听技能目录', 'Watch skill directories') }}</strong>
                        <span>{{ text('对应 skills.load.watch，适合开发环境热更新技能。', 'Maps to skills.load.watch; useful for skill hot reload in development.') }}</span>
                      </div>
                    </label>
                    <label class="toggle-card">
                      <input v-model="form.mcpSkills.skillsPreferBrew" class="form-checkbox" type="checkbox" />
                      <div>
                        <strong>{{ text('优先使用 Brew', 'Prefer Brew') }}</strong>
                        <span>{{ text('对应 skills.install.preferBrew。', 'Maps to skills.install.preferBrew.') }}</span>
                      </div>
                    </label>
                  </div>
                  <div class="form-grid">
                    <label class="form-field">
                      <span class="form-label">{{ text('监听防抖 (ms)', 'Watch debounce (ms)') }}</span>
                      <input v-model.number="form.mcpSkills.skillsWatchDebounceMs" class="form-input" type="number" min="0" :placeholder="text('留空表示跟随宿主默认', 'Leave empty to follow host default')" />
                      <span class="field-hint">{{ text('对应 skills.load.watchDebounceMs。', 'Maps to skills.load.watchDebounceMs.') }}</span>
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text('Node 管理器', 'Node manager') }}</span>
                      <GlassSelect v-model="form.mcpSkills.skillsNodeManager" :options="nodeManagerOptions" :placeholder="text('不覆盖', 'No override')" />
                      <span class="field-hint">{{ text('对应 skills.install.nodeManager，只允许 npm / pnpm / yarn / bun。', 'Maps to skills.install.nodeManager; only npm / pnpm / yarn / bun are valid.') }}</span>
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text('技能提示词最大字符数', 'Max skill prompt chars') }}</span>
                      <input v-model.number="form.mcpSkills.skillsMaxPromptChars" class="form-input" type="number" min="1" :placeholder="text('留空表示跟随宿主默认', 'Leave empty to follow host default')" />
                      <span class="field-hint">{{ text('对应 skills.limits.maxSkillsPromptChars。', 'Maps to skills.limits.maxSkillsPromptChars.') }}</span>
                    </label>
                    <details class="config-collapsible form-field-wide">
                      <summary class="config-collapsible-summary">
                        <span>{{ text('更多运行限制', 'More runtime limits') }}</span>
                        <span class="config-collapsible-meta">{{ text('官方 skills.limits', 'official skills.limits') }}</span>
                      </summary>
                      <div class="form-grid config-collapsible-body">
                        <label class="form-field">
                          <span class="form-label">{{ text('每个根目录候选上限', 'Max candidates per root') }}</span>
                          <input v-model.number="form.mcpSkills.skillsMaxCandidatesPerRoot" class="form-input" type="number" min="1" />
                        </label>
                        <label class="form-field">
                          <span class="form-label">{{ text('每个来源加载上限', 'Max loaded per source') }}</span>
                          <input v-model.number="form.mcpSkills.skillsMaxLoadedPerSource" class="form-input" type="number" min="1" />
                        </label>
                        <label class="form-field">
                          <span class="form-label">{{ text('提示词技能数量上限', 'Max skills in prompt') }}</span>
                          <input v-model.number="form.mcpSkills.skillsMaxInPrompt" class="form-input" type="number" min="0" />
                        </label>
                        <label class="form-field">
                          <span class="form-label">{{ text('单个 SKILL.md 字节上限', 'Max SKILL.md bytes') }}</span>
                          <input v-model.number="form.mcpSkills.skillsMaxSkillFileBytes" class="form-input" type="number" min="0" />
                        </label>
                      </div>
                    </details>
                    <label class="form-field form-field-wide">
                      <span class="form-label">{{ text('Skill Entries JSON', 'Skill Entries JSON') }}</span>
                      <textarea v-model="form.mcpSkills.skillsEntriesJson" class="form-textarea code-textarea" rows="8" spellcheck="false" placeholder="{\n  &quot;docs-search&quot;: {\n    &quot;enabled&quot;: true\n  }\n}" />
                      <span class="field-hint">{{ text('对应 skills.entries。需要批量编辑技能条目时使用，日常安装删除优先去技能管理页。', 'Maps to skills.entries. Use this for batch entry edits; use Skills management for normal install/remove flows.') }}</span>
                    </label>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </article>
      </section>

      <section v-else-if="activeTab === 'commands-hooks'" class="page-shell config-section-grid">
        <CommandsHooksConfigTab
          :commands="commandsFormData"
          :hooks="hooksFormData"
          @update:commands="onCommandsUpdate"
          @update:hooks="onHooksUpdate"
        />
      </section>

      <LoggingConfigTab v-else-if="activeTab === 'logging'" ref="loggingTabRef" :summary="loadedSummary" />
      <BrowserConfigTab v-else-if="activeTab === 'browser'" ref="browserTabRef" :summary="loadedSummary" />
        </div>
      </motion.div>

      <section class="config-save-dock" :class="{ 'is-dirty': hasUnsavedChanges, 'is-saved': saveFeedbackVisible && !hasUnsavedChanges }" aria-live="polite">
        <div class="config-save-dock__status">
          <span class="config-save-dock__indicator" :class="{ active: hasUnsavedChanges, saved: saveFeedbackVisible && !hasUnsavedChanges }"></span>
          <div>
            <strong>{{ saveDockState.label }}</strong>
            <p>{{ saveDockState.description }}</p>
          </div>
        </div>
        <div v-if="dirtyDomains.length" class="config-save-dock__changes" :aria-label="text('已修改配置域', 'Changed config domains')">
          <span v-for="domain in dirtyDomains.slice(0, 4)" :key="domain.id" class="config-change-chip">
            {{ domain.label }}
          </span>
          <span v-if="dirtyDomains.length > 4" class="config-change-chip muted">+{{ dirtyDomains.length - 4 }}</span>
        </div>
        <div class="config-save-dock__actions">
          <span v-if="saveFeedbackVisible && !hasUnsavedChanges" class="config-save-dock__saved-pill">
            <Check class="button-inline-icon" aria-hidden="true" />
            {{ text('已保存', 'Saved') }}
          </span>
          <button class="secondary-button compact-button" type="button" @click="refreshConfigWithDirtyCheck" :disabled="loading || saving">
            {{ text('放弃并刷新', 'Discard & refresh') }}
          </button>
          <button class="primary-button compact-button" :class="{ 'is-saved': saveFeedbackVisible && !hasUnsavedChanges }" type="button" @click="saveChanges" :disabled="loading || saving || !saveReadiness.canSave">
            {{ saving ? text('保存中...', 'Saving...') : saveFeedbackVisible && !hasUnsavedChanges ? text('已保存', 'Saved') : text('保存变更', 'Save changes') }}
          </button>
        </div>
      </section>

      <ConfigDomainAdvancedSheet
        v-if="activeAdvancedSheetMeta"
        :open="advancedSheetOpen"
        :eyebrow="activeAdvancedSheetMeta.eyebrow"
        :title="activeAdvancedSheetMeta.title"
        :description="activeAdvancedSheetMeta.description"
        :theme="resolvedTheme"
        @close="closeAdvancedSheet"
      >
        <div v-if="activeTab === 'model'" class="config-advanced-sheet-layout">
          <section class="config-block config-advanced-sheet-block">
            <div class="panel-head">
              <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('Agent 注入与默认覆盖', 'Agent injection & overrides') }}</span></h3>
            </div>
            <div class="config-subsection-grid">
              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('默认技能与系统提示词', 'Default skills & system prompt') }}</h4>
                  <p>{{ text('这组配置会影响所有未单独覆写的 Agent，适合在你已经明确约束边界之后再编辑。', 'These settings affect every agent that does not override them, so edit them only after the core defaults are stable.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field form-field-span-2">
                    <span class="form-label">{{ text('默认技能', 'Default Skills') }}</span>
                    <textarea v-model="form.defaults.skillsText" class="form-textarea" rows="4" :placeholder="text('每行一个 skill。留空表示不设置全局默认 skills。', 'One skill per line. Leave empty to avoid setting global default skills.')" />
                    <span class="field-hint">{{ text('作用：为所有未单独指定 skills 的 Agent 提供默认 skills 白名单。配置方式：每行一个 skill id。', 'Purpose: provide a default skill allowlist for agents that do not override skills. How to configure: one skill id per line.') }}</span>
                  </label>
                  <label class="form-field form-field-span-2">
                    <span class="form-label">{{ text('系统提示词覆盖', 'System Prompt Override') }}</span>
                    <textarea v-model="form.defaults.systemPromptOverride" class="form-textarea" rows="5" :placeholder="text('可选：完整覆盖所有 Agent 默认系统提示词。留空表示不覆盖。', 'Optional: fully override the default system prompt for all agents. Leave empty to inherit host behavior.')" />
                    <span class="field-hint">{{ text('作用：全局覆盖默认系统提示词。配置方式：直接填写完整提示词正文；留空表示使用宿主默认逻辑。', 'Purpose: globally override the default system prompt. How to configure: enter the full prompt body; leave empty to keep host defaults.') }}</span>
                  </label>
                </div>
              </section>

              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('注入与时间语义', 'Injection & time semantics') }}</h4>
                  <p>{{ text('这些配置决定 bootstrap 文档何时进入提示词，以及消息包络里时间如何表达。', 'These settings decide when bootstrap docs enter the prompt and how time is expressed in message envelopes.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('上下文注入策略', 'Context Injection') }}</span>
                    <GlassSelect v-model="form.defaults.contextInjection" :options="choiceToSelectOptions(contextInjectionOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('截断告警模式', 'Truncation Warning Mode') }}</span>
                    <GlassSelect v-model="form.defaults.bootstrapPromptTruncationWarning" :options="choiceToSelectOptions(truncationWarningOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('用户时区', 'User Timezone') }}</span>
                    <input v-model="form.defaults.userTimezone" class="form-input" type="text" :placeholder="text('例如 Asia/Shanghai', 'For example Asia/Shanghai')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('时间格式', 'Time Format') }}</span>
                    <GlassSelect v-model="form.defaults.timeFormat" :options="choiceToSelectOptions(timeFormatOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('消息包络时区', 'Envelope Timezone') }}</span>
                    <input v-model="form.defaults.envelopeTimezone" class="form-input" type="text" :placeholder="text('utc / local / user / IANA 时区', 'utc / local / user / IANA timezone')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('绝对时间戳', 'Envelope Timestamp') }}</span>
                    <GlassSelect v-model="form.defaults.envelopeTimestamp" :options="choiceToSelectOptions(envelopeToggleOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('耗时信息', 'Envelope Elapsed') }}</span>
                    <GlassSelect v-model="form.defaults.envelopeElapsed" :options="choiceToSelectOptions(envelopeToggleOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('上下文窗口 Token', 'Context Tokens') }}</span>
                    <input v-model.number="form.defaults.contextTokens" class="form-input" type="number" min="1" :placeholder="text('例如 200000', 'For example 200000')" />
                  </label>
                </div>
              </section>
            </div>
          </section>

          <section class="config-block config-advanced-sheet-block">
            <div class="panel-head">
              <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('运行时细分默认值', 'Fine-grained runtime defaults') }}</span></h3>
            </div>
            <div class="config-subsection-grid">
              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('子 Agent 与消息流', 'Sub-agent & message flow') }}</h4>
                  <p>{{ text('当你需要调整 spawned sub-agent 的继承行为或消息分块方式时，在这里编辑。', 'Edit these only when you need to tune spawned sub-agent inheritance or message block delivery.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('子 Agent 默认模型', 'Sub-agent default model') }}</span>
                    <GlassSelect v-model="form.defaults.subagentModel" :options="[{ value: '', label: text('未设置', 'Unset') }, ...modelSelectOptions]" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('子 Agent 思考默认值', 'Sub-agent thinking default') }}</span>
                    <GlassSelect v-model="form.defaults.subagentThinking" :options="choiceToSelectOptions(subagentThinkingOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('子 Agent 运行超时秒', 'Sub-agent run timeout seconds') }}</span>
                    <input v-model.number="form.defaults.subagentRunTimeoutSeconds" class="form-input" type="number" min="0" :placeholder="text('留空表示未设置', 'Leave empty for unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('输入中指示模式', 'Typing Mode') }}</span>
                    <GlassSelect v-model="form.defaults.typingMode" :options="choiceToSelectOptions(typingModeOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Typing 指示间隔秒', 'Typing Interval Seconds') }}</span>
                    <input v-model.number="form.defaults.typingIntervalSeconds" class="form-input" type="number" min="1" :placeholder="text('例如 3', 'For example 3')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('高权限默认值', 'Elevated Default') }}</span>
                    <GlassSelect v-model="form.defaults.elevated" :options="choiceToSelectOptions(elevatedOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('分块输出默认值', 'Block Streaming Default') }}</span>
                    <GlassSelect v-model="form.defaults.blockStreaming" :options="choiceToSelectOptions(blockStreamingOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('分块边界', 'Block Streaming Break') }}</span>
                    <GlassSelect v-model="form.defaults.blockStreamingBreak" :options="choiceToSelectOptions(blockStreamingBreakOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                </div>
              </section>

              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('媒体与文档限制', 'Media & document limits') }}</h4>
                  <p>{{ text('这些上限主要影响上下文体积和转录成本，一般在接近容量边界时才需要调整。', 'These limits mostly affect context size and transcription cost, so you usually change them only near capacity edges.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('媒体大小上限 MB', 'Media Max MB') }}</span>
                    <input v-model.number="form.defaults.mediaMaxMb" class="form-input" type="number" min="1" :placeholder="text('留空表示使用宿主默认值', 'Leave empty to use host default')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('图片边长上限 PX', 'Image Max Dimension PX') }}</span>
                    <input v-model.number="form.defaults.imageMaxDimensionPx" class="form-input" type="number" min="1" :placeholder="text('例如 1200', 'For example 1200')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('PDF 大小上限 MB', 'PDF Max MB') }}</span>
                    <input v-model.number="form.defaults.pdfMaxBytesMb" class="form-input" type="number" min="1" :placeholder="text('例如 10', 'For example 10')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('PDF 页数上限', 'PDF Max Pages') }}</span>
                    <input v-model.number="form.defaults.pdfMaxPages" class="form-input" type="number" min="1" :placeholder="text('例如 20', 'For example 20')" />
                  </label>
                </div>
              </section>
            </div>
          </section>

          <section class="config-block config-advanced-sheet-block">
            <div class="panel-head">
              <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('高级 JSON 入口', 'Advanced JSON entries') }}</span></h3>
            </div>
            <div class="config-subsection-grid">
              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('模型目录 JSON', 'Model registry JSON') }}</h4>
                  <p>{{ text('对应 agents.defaults.models，用于记录模型别名、参数和 streaming 元数据。', 'Maps to agents.defaults.models for model aliases, params, and streaming metadata.') }}</p>
                </div>
                <label class="form-field">
                  <span class="form-label">{{ text('模型目录', 'Model registry') }}</span>
                  <textarea v-model="form.defaults.modelsJson" class="form-textarea" rows="6" :placeholder="text('可选：agents.defaults.models。', 'Optional: agents.defaults.models.')" />
                </label>
                <label class="form-field form-field-span-2">
                  <span class="form-label">{{ text('全局模型参数 JSON', 'Global Model Params JSON') }}</span>
                  <textarea v-model="form.defaults.paramsJson" class="form-textarea" rows="5" :placeholder="text('可选：agents.defaults.params 默认配置。', 'Optional: default agents.defaults.params configuration.')" />
                </label>
              </section>

              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('运行时后端 JSON', 'Runtime backend JSON') }}</h4>
                  <p>{{ text('适合 `cliBackends`、`contextPruning`、`blockStreamingChunk`、`blockStreamingCoalesce` 这种结构化但不常改的配置。', 'Use this for structured but infrequently changed config such as cliBackends, contextPruning, blockStreamingChunk, and blockStreamingCoalesce.') }}</p>
                </div>
                <label class="form-field">
                  <span class="form-label">{{ text('CLI Backends JSON', 'CLI backends JSON') }}</span>
                  <textarea v-model="form.defaults.cliBackendsJson" class="form-textarea" rows="5" :placeholder="text('可选：agents.defaults.cliBackends。', 'Optional: agents.defaults.cliBackends.')" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('Context Pruning JSON', 'Context pruning JSON') }}</span>
                  <textarea v-model="form.defaults.contextPruningJson" class="form-textarea" rows="5" :placeholder="text('可选：agents.defaults.contextPruning。', 'Optional: agents.defaults.contextPruning.')" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('Block Streaming Chunk JSON', 'Block streaming chunk JSON') }}</span>
                  <textarea v-model="form.defaults.blockStreamingChunkJson" class="form-textarea" rows="4" :placeholder="text('可选：agents.defaults.blockStreamingChunk。', 'Optional: agents.defaults.blockStreamingChunk.')" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('Block Streaming Coalesce JSON', 'Block streaming coalesce JSON') }}</span>
                  <textarea v-model="form.defaults.blockStreamingCoalesceJson" class="form-textarea" rows="4" :placeholder="text('可选：agents.defaults.blockStreamingCoalesce。', 'Optional: agents.defaults.blockStreamingCoalesce.')" />
                </label>
              </section>

              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('记忆与节奏 JSON', 'Memory & pacing JSON') }}</h4>
                  <p>{{ text('这些对象更适合按结构维护，不适合第一次进入 Config 时直接暴露在主路径。', 'These objects are easier to maintain structurally and should not dominate the first-run core path.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field form-field-span-2">
                    <span class="form-label">{{ text('记忆检索 JSON', 'Memory Search JSON') }}</span>
                    <textarea v-model="form.defaults.memorySearchJson" class="form-textarea" rows="5" :placeholder="text('可选：memorySearch 默认配置。', 'Optional: default memorySearch configuration.')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('拟人延迟 JSON', 'Human Delay JSON') }}</span>
                    <textarea v-model="form.defaults.humanDelayJson" class="form-textarea" rows="5" :placeholder="text('可选：humanDelay 默认配置。', 'Optional: default humanDelay configuration.')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('心跳任务 JSON', 'Heartbeat JSON') }}</span>
                    <textarea v-model="form.defaults.heartbeatJson" class="form-textarea" rows="5" :placeholder="text('可选：heartbeat 默认配置。', 'Optional: default heartbeat configuration.')" />
                    <span class="field-hint">{{ text('every 由主配置里的 HEARTBEAT 策略控制；这里适合保留 includeReasoning 等低频字段。', 'every is controlled by the main HEARTBEAT policy; keep low-frequency fields such as includeReasoning here.') }}</span>
                  </label>
                </div>
              </section>
            </div>
          </section>

          <section class="config-block config-advanced-sheet-block">
            <div class="panel-head">
              <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('启动与运行时守卫', 'Bootstrap & runtime guards') }}</span></h3>
            </div>
            <div class="config-subsection-grid">
              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('Bootstrap 与仓库边界', 'Bootstrap & repository boundaries') }}</h4>
                  <p>{{ text('这些字段主要影响提示词注入体量、仓库根目录判断和嵌入式 Pi 行为。', 'These fields mainly affect prompt injection size, repository-root detection, and Embedded Pi behavior.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('仓库根目录', 'Repository root') }}</span>
                    <input v-model="form.defaults.repoRoot" class="form-input" type="text" :placeholder="text('留空表示自动检测', 'Leave empty to auto-detect')" />
                  </label>
                  <label class="toggle-card">
                    <input v-model="form.defaults.skipBootstrap" class="form-checkbox" type="checkbox" />
                    <div>
                      <strong>{{ text('跳过 Bootstrap', 'Skip bootstrap') }}</strong>
                      <span>{{ text('用于已预置 bootstrap 文件的部署。', 'Use this for deployments that already ship bootstrap files.') }}</span>
                    </div>
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Bootstrap 最大字符', 'Bootstrap max chars') }}</span>
                    <input v-model.number="form.defaults.bootstrapMaxChars" class="form-input" type="number" min="1" :placeholder="text('例如 20000', 'For example 20000')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Bootstrap 总字符上限', 'Bootstrap total max chars') }}</span>
                    <input v-model.number="form.defaults.bootstrapTotalMaxChars" class="form-input" type="number" min="1" :placeholder="text('例如 150000', 'For example 150000')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Embedded Pi 项目设置策略', 'Embedded Pi project settings policy') }}</span>
                    <GlassSelect v-model="form.defaults.embeddedPiProjectSettingsPolicy" :options="choiceToSelectOptions(embeddedPiPolicyOptions)" :placeholder="text('未设置', 'Unset')" />
                  </label>
                </div>
              </section>

              <section class="config-subsection">
                <div class="config-subsection-head">
                  <h4>{{ text('子 Agent 运行守卫', 'Sub-agent runtime guards') }}</h4>
                  <p>{{ text('只有在需要更严格地限制 spawned sub-agent 展开和归档行为时才建议调整。', 'Adjust these only when you need tighter limits on spawned sub-agent expansion and archival behavior.') }}</p>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('子 Agent 最大嵌套深度', 'Sub-agent max spawn depth') }}</span>
                    <input v-model.number="form.defaults.subagentMaxSpawnDepth" class="form-input" type="number" min="1" max="5" :placeholder="text('例如 1', 'For example 1')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('子 Agent 最大子节点数', 'Sub-agent max children') }}</span>
                    <input v-model.number="form.defaults.subagentMaxChildrenPerAgent" class="form-input" type="number" min="1" max="20" :placeholder="text('例如 5', 'For example 5')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('子 Agent 归档分钟', 'Sub-agent archive minutes') }}</span>
                    <input v-model.number="form.defaults.subagentArchiveAfterMinutes" class="form-input" type="number" min="0" :placeholder="text('例如 60', 'For example 60')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Announcement 超时 ms', 'Announcement timeout ms') }}</span>
                    <input v-model.number="form.defaults.subagentAnnounceTimeoutMs" class="form-input" type="number" min="1" :placeholder="text('例如 1000', 'For example 1000')" />
                  </label>
                </div>
              </section>
            </div>
          </section>
        </div>
      </ConfigDomainAdvancedSheet>
    </template>
  </motion.section>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { motion } from 'motion-v';
import { useRoute, useRouter } from 'vue-router';
import {
  Blocks,
  Bolt,
  BrainCircuit,
  Cable,
  Check,
  FileText,
  Globe2,
  Hammer,
  MessagesSquare,
  Monitor,
  Network,
  RefreshCw,
  ShieldCheck,
} from '@lucide/vue';
import { fetchConfigChannelSummary, fetchConfigSummary, fetchProviderSecret, saveConfig } from './api';
import { useLocalePreference } from '../../shared/locale';
import { useThemePreference } from '../../shared/theme';
import GlassSelect, { type GlassSelectOption } from '../../shared/components/GlassSelect.vue';
import GatewayConfigTab from './GatewayConfigTab.vue';
import AcpConfigTab from './AcpConfigTab.vue';
import CommandsHooksConfigTab from './CommandsHooksConfigTab.vue';
import SessionConfigTab from './SessionConfigTab.vue';
import LoggingConfigTab from './LoggingConfigTab.vue';
import BrowserConfigTab from './BrowserConfigTab.vue';
import ConfigDomainAdvancedSheet from './ConfigDomainAdvancedSheet.vue';
import { createUuid } from '../../shared/uuid';
import { pageMastheadReveal, pageSurfaceReveal } from '../../shared/motion';
import { buildHeartbeatConfig, resolveHeartbeatEvery, resolveHeartbeatMode, type HeartbeatMode } from '../../shared/heartbeat-config';
import { buildConfigOverviewRecipe, buildConfigOverviewSignals, buildConfigSidebarSummary, type ConfigOverviewRecipe } from './config-overview-recipe';
import { CONFIG_TAB_IDS, DEFAULT_CONFIG_WORKSPACE_SECTIONS, type ConfigTabId, type ConfigWorkspaceSection } from './config-workspace-sections';
import type {
  ConfigProviderInput,
  ConfigProviderSummary,
  ConfigSummaryPayload,
  ConfigUpdatePayload,
} from '../../../../../types/config';

interface ChoiceOption {
  value: string;
  label: string;
  note?: string;
}

interface ProviderModelFormState {
  uid: string;
  id: string;
  capText: boolean;
  capImage: boolean;
  reasoning: boolean;
  contextWindow: number | null;
  maxTokens: number | null;
}

interface ProviderFormState {
  uid: string;
  id: string;
  api: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  apiKeyLoaded: boolean;
  apiKeyVisible: boolean;
  apiKeyLoading: boolean;
  models: ProviderModelFormState[];
}

interface ApprovalAllowlistEntryFormState {
  uid: string;
  pattern: string;
  lastUsedAt: number;
  lastUsedCommand: string;
  lastResolvedPath: string;
}

interface ApprovalAgentFormState {
  uid: string;
  agentId: string;
  security: string;
  ask: string;
  askFallback: string;
  autoAllowSkills: boolean;
  allowlist: ApprovalAllowlistEntryFormState[];
}

interface ConfigFormState {
    defaults: {
      model: string;
      modelFallback: string[];
      imageModel: string;
      imageModelFallback: string[];
      imageGenerationModel: string;
      imageGenerationModelFallback: string[];
      videoGenerationModel: string;
      videoGenerationModelFallback: string[];
      musicGenerationModel: string;
      musicGenerationModelFallback: string[];
      mediaGenerationAutoProviderFallback: boolean;
      pdfModel: string;
      pdfModelFallback: string[];
      thinking: string;
      verbose: string;
      timeoutSeconds: number;
      maxConcurrent: number;
      subagentMaxConcurrent: number;
      subagentModel: string;
      subagentThinking: string;
      subagentRunTimeoutSeconds: number | null;
      subagentMaxSpawnDepth: number | null;
      subagentMaxChildrenPerAgent: number | null;
      subagentArchiveAfterMinutes: number | null;
      subagentAnnounceTimeoutMs: number | null;
      workspace: string;
      repoRoot: string;
      skipBootstrap: boolean;
      bootstrapMaxChars: number | null;
      bootstrapTotalMaxChars: number | null;
      systemPromptOverride: string;
      skillsText: string;
      contextInjection: string;
      bootstrapPromptTruncationWarning: string;
      userTimezone: string;
      timeFormat: string;
      envelopeTimezone: string;
      envelopeTimestamp: string;
      envelopeElapsed: string;
      contextTokens: number | null;
      typingMode: string;
      elevated: string;
      blockStreaming: string;
      blockStreamingBreak: string;
      blockStreamingChunkJson: string;
      blockStreamingCoalesceJson: string;
      mediaMaxMb: number | null;
      imageMaxDimensionPx: number | null;
      typingIntervalSeconds: number | null;
      pdfMaxBytesMb: number | null;
      pdfMaxPages: number | null;
      embeddedPiProjectSettingsPolicy: string;
      memorySearchJson: string;
      humanDelayJson: string;
      heartbeatMode: HeartbeatMode;
      heartbeatEvery: string;
      heartbeatJson: string;
      paramsJson: string;
      cliBackendsJson: string;
      contextPruningJson: string;
      modelsJson: string;
    };
  compaction: {
      mode: string;
      reserveTokensFloor: number;
      identifierPolicy: string;
      identifierInstructions: string;
      postCompactionSectionsText: string;
      model: string;
      memoryFlush: {
        enabled: boolean;
        softThresholdTokens: number;
      };
    };
  sandbox: {
    mode: string;
    workspaceAccess: string;
    scope: string;
    sessionToolsVisibility: string;
    prune: {
      idleHours: number;
      maxAgeDays: number;
    };
  };
  tools: {
    profile: string;
    elevatedEnabled: boolean;
    execHost: string;
    execNode: string;
    execAsk: string;
    execSecurity: string;
    execTimeoutSec: number;
    fsWorkspaceOnly: boolean;
  };
  studioChat: {
    allowHostManagementExecInStudioChat: boolean;
  };
  execApprovals: {
    security: string;
    ask: string;
    askFallback: string;
    autoAllowSkills: boolean;
    agents: ApprovalAgentFormState[];
  };
  session: {
    dmScope: string;
    threadBindings: {
      enabled: boolean;
      idleHours: number;
      maxAgeHours: number;
    };
  };
  messages: {
    responsePrefix: string;
    ackReaction: string;
    ackReactionScope: string;
    removeAckAfterReply: boolean;
    queue: {
      mode: string;
      debounceMs: number;
      cap: number;
      drop: string;
      byChannel: Array<{
        uid: string;
        channelId: string;
        mode: string;
      }>;
    };
  };
  providers: ProviderFormState[];
  mcpSkills: {
    mcpSessionIdleTtlMs: number | null;
    mcpServersJson: string;
    skillsAllowBundledText: string;
    skillsExtraDirsText: string;
    skillsLoadWatch: boolean;
    skillsWatchDebounceMs: number | null;
    skillsPreferBrew: boolean;
    skillsNodeManager: string;
    skillsMaxCandidatesPerRoot: number | null;
    skillsMaxLoadedPerSource: number | null;
    skillsMaxInPrompt: number | null;
    skillsMaxPromptChars: number | null;
    skillsMaxSkillFileBytes: number | null;
    skillsEntriesJson: string;
  };
  sessionReset: {
    mode: string;
    atHour: number;
    idleMinutes: number;
    resetByType: Record<string, string>;
    resetByChannelList: Array<{
      uid: string;
      channelId: string;
      mode: string;
    }>;
  };
}

interface ConfigDirtyDomain {
  id: ConfigTabId;
  label: string;
  detail: string;
}

type ConfigTabGroupId = 'core' | 'runtime' | 'integrations' | 'maintenance';

interface ConfigTabGroup {
  id: ConfigTabGroupId;
  label: string;
  items: ConfigWorkspaceSection[];
}

const CONFIG_ACTIVE_TAB_STORAGE_KEY = 'openclaw-studio.config.activeTab';

function normalizeConfigTabId(value: unknown): ConfigTabId {
  const tab = typeof value === 'string' ? value.trim() : '';
  return CONFIG_TAB_IDS.includes(tab as ConfigTabId) ? tab as ConfigTabId : CONFIG_TAB_IDS[0];
}

function resolveConfigTabFromSection(value: unknown): ConfigTabId {
  const section = typeof value === 'string' ? value.trim() : '';
  if (!section) {
    return CONFIG_TAB_IDS[0];
  }
  if (section.startsWith('transport.') || section.startsWith('gateway')) {
    return 'gateway';
  }
  if (section.startsWith('deviceTrust.')) {
    return 'security';
  }
  return normalizeConfigTabId(section);
}

const props = withDefaults(defineProps<{
  workspaceSections?: ConfigWorkspaceSection[];
  overviewRecipe?: ConfigOverviewRecipe;
}>(), {
  workspaceSections: () => [],
  overviewRecipe: undefined,
});

const route = useRoute();
const router = useRouter();
const isConfigRouteActive = computed(() => route.path === '/config' || route.path.startsWith('/config/'));
let configPageBootstrapped = false;
let configLoadPromise: Promise<void> | null = null;
function readPersistedConfigTab(): ConfigTabId {
  if (typeof window === 'undefined') return CONFIG_TAB_IDS[0];
  try {
    return normalizeConfigTabId(window.localStorage.getItem(CONFIG_ACTIVE_TAB_STORAGE_KEY));
  } catch {
    return CONFIG_TAB_IDS[0];
  }
}

function resolveInitialConfigTab(): ConfigTabId {
  if (route.query.section) return resolveConfigTabFromSection(route.query.section);
  if (route.query.tab) return normalizeConfigTabId(route.query.tab);
  return readPersistedConfigTab();
}

const activeTab = ref<ConfigTabId>(resolveInitialConfigTab());
const advancedSheetOpen = ref(false);
const activeProviderUid = ref('');
const loggingTabRef = ref<InstanceType<typeof LoggingConfigTab> | null>(null);
const browserTabRef = ref<InstanceType<typeof BrowserConfigTab> | null>(null);
const acpTabRef = ref<InstanceType<typeof AcpConfigTab> | null>(null);
const { locale, text } = useLocalePreference();
const tabs = computed(() => props.workspaceSections?.length ? props.workspaceSections : DEFAULT_CONFIG_WORKSPACE_SECTIONS);
const groupedTabs = computed<ConfigTabGroup[]>(() => {
  const byId = new Map(tabs.value.map((tab) => [tab.id, tab]));
  const groupRecipe: Array<{ id: ConfigTabGroupId; label: string; ids: ConfigTabId[] }> = [
    { id: 'core', label: text('基础', 'Core'), ids: ['model', 'providers'] },
    { id: 'runtime', label: text('运行与安全', 'Runtime & Security'), ids: ['security', 'session', 'session-policy'] },
    { id: 'integrations', label: text('集成', 'Integrations'), ids: ['gateway', 'acp', 'mcp-skills', 'commands-hooks', 'browser'] },
    { id: 'maintenance', label: text('维护', 'Maintenance'), ids: ['logging'] },
  ];
  return groupRecipe
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: group.ids.map((id) => byId.get(id)).filter((tab): tab is ConfigWorkspaceSection => Boolean(tab)),
    }))
    .filter((group) => group.items.length > 0);
});
const activeTabMeta = computed(() => tabs.value.find((tab) => tab.id === activeTab.value) || tabs.value[0]);

function resolveConfigTabIcon(id: ConfigTabId) {
  switch (id) {
    case 'model':
      return BrainCircuit;
    case 'providers':
      return Blocks;
    case 'security':
      return ShieldCheck;
    case 'session':
      return MessagesSquare;
    case 'session-policy':
      return RefreshCw;
    case 'gateway':
      return Network;
    case 'acp':
      return Cable;
    case 'mcp-skills':
      return Hammer;
    case 'commands-hooks':
      return Bolt;
    case 'browser':
      return Monitor;
    case 'logging':
      return FileText;
    default:
      return Globe2;
  }
}

const activeAdvancedSheetMeta = computed(() => {
  if (activeTab.value !== 'model') return null;
  return {
    eyebrow: text('ADVANCED SHEET', 'ADVANCED SHEET'),
    title: text('模型域高级设置', 'Model domain advanced settings'),
    description: text(
      '集中编辑 JSON-heavy 默认值、注入策略和低频运行守卫，不让这些字段挤占新手第一屏。',
      'Edit JSON-heavy defaults, injection policy, and low-frequency runtime guards in one place instead of letting them crowd the first screen.',
    ),
  };
});
const activeProviderIndex = computed(() => form.providers.findIndex((provider) => provider.uid === activeProviderUid.value));
const activeProvider = computed(() => form.providers[activeProviderIndex.value] || null);
const { resolvedTheme } = useThemePreference();

const providerApiOptions = ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative', 'azure-openai'];
const nodeManagerOptions = computed<GlassSelectOption[]>(() => [
  { value: '', label: text('不覆盖', 'No override') },
  { value: 'npm', label: 'npm' },
  { value: 'pnpm', label: 'pnpm' },
  { value: 'yarn', label: 'yarn' },
  { value: 'bun', label: 'bun' },
]);
const thinkingOptions = computed<ChoiceOption[]>(() => [
  { value: 'off', label: text('关闭', 'Off'), note: text('最低成本', 'Lowest cost') },
  { value: 'minimal', label: text('极低', 'Minimal'), note: text('轻量推理', 'Light reasoning') },
  { value: 'low', label: text('低', 'Low'), note: text('简单任务', 'Simple tasks') },
  { value: 'medium', label: text('中', 'Medium'), note: text('平衡', 'Balanced') },
  { value: 'high', label: text('高', 'High'), note: text('当前推荐', 'Recommended') },
  { value: 'xhigh', label: text('极高', 'XHigh'), note: text('高成本深推理', 'High-cost deep reasoning') },
  { value: 'adaptive', label: text('自适应', 'Adaptive'), note: text('按任务自适应', 'Adaptive by task') },
]);
const subagentThinkingOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  ...thinkingOptions.value,
]);
const verboseOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'off', label: text('关闭', 'Off') },
  { value: 'on', label: text('开启', 'On') },
  { value: 'full', label: text('完整', 'Full') },
]);
const heartbeatModeOptions = computed<ChoiceOption[]>(() => [
  { value: 'inherit', label: text('不覆盖', 'No override'), note: text('不写 agents.defaults.heartbeat.every，不代表关闭', 'Do not write agents.defaults.heartbeat.every; this is not disabled') },
  { value: 'enabled', label: text('启用', 'Enabled'), note: text('按指定周期触发内置 HEARTBEAT', 'Run built-in HEARTBEAT on the specified interval') },
  { value: 'disabled', label: text('禁用', 'Disabled'), note: text('写入 every: "0m" 以持久关闭调度', 'Persist every: "0m" to disable scheduling') },
]);
const contextInjectionOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'always', label: text('总是注入', 'Always') },
  { value: 'continuation-skip', label: text('续聊时跳过', 'Continuation Skip') },
]);
const truncationWarningOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'off', label: text('关闭', 'Off') },
  { value: 'once', label: text('仅首次', 'Once') },
  { value: 'always', label: text('每次都提示', 'Always') },
]);
const timeFormatOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'auto', label: text('自动', 'Auto') },
  { value: '12', label: '12' },
  { value: '24', label: '24' },
]);
const envelopeToggleOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'on', label: text('开启', 'On') },
  { value: 'off', label: text('关闭', 'Off') },
]);
const typingModeOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'never', label: text('从不', 'Never') },
  { value: 'instant', label: text('立即', 'Instant') },
  { value: 'thinking', label: text('思考时', 'Thinking') },
  { value: 'message', label: text('输出消息时', 'Message') },
]);
const elevatedOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'off', label: text('关闭', 'Off') },
  { value: 'on', label: text('开启', 'On') },
  { value: 'ask', label: text('询问', 'Ask') },
  { value: 'full', label: text('完全放行', 'Full') },
]);
const blockStreamingOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'off', label: text('关闭', 'Off') },
  { value: 'on', label: text('开启', 'On') },
]);
const blockStreamingBreakOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'text_end', label: text('文本块结尾', 'Text End') },
  { value: 'message_end', label: text('整条消息结尾', 'Message End') },
]);
const embeddedPiPolicyOptions = computed<ChoiceOption[]>(() => [
  { value: '', label: text('未设置', 'Unset') },
  { value: 'sanitize', label: text('清洗', 'Sanitize') },
  { value: 'ignore', label: text('忽略', 'Ignore') },
  { value: 'trusted', label: text('信任', 'Trusted') },
]);
const compactionOptions = computed<ChoiceOption[]>(() => [
  { value: 'default', label: text('标准', 'Default') },
  { value: 'safeguard', label: text('保护模式', 'Safeguard') },
]);
const identifierPolicyOptions = computed<ChoiceOption[]>(() => [
  { value: 'strict', label: text('严格', 'Strict') },
  { value: 'off', label: text('关闭', 'Off') },
  { value: 'custom', label: text('自定义', 'Custom') },
]);
const sandboxModeOptions = computed<ChoiceOption[]>(() => [
  { value: 'off', label: text('关闭', 'Off') },
  { value: 'agent', label: text('按 Agent', 'Per Agent') },
  { value: 'all', label: text('全部', 'All') },
]);
const workspaceAccessOptions = computed<ChoiceOption[]>(() => [
  { value: 'ro', label: text('只读', 'Read Only') },
  { value: 'rw', label: text('读写', 'Read Write') },
  { value: 'none', label: text('无工作区挂载', 'No Workspace Mount') },
]);
const sandboxScopeOptions = computed<ChoiceOption[]>(() => [
  { value: 'session', label: text('按会话', 'Per Session') },
  { value: 'agent', label: text('按 Agent', 'Per Agent') },
  { value: 'global', label: text('全局共享', 'Global') },
]);
const visibilityOptions = computed<ChoiceOption[]>(() => [
  { value: 'spawned', label: text('仅子会话', 'Spawned Only') },
  { value: 'all', label: text('全部可见', 'All Visible') },
  { value: 'none', label: text('全部隐藏', 'None') },
]);
const toolProfileOptions = computed<ChoiceOption[]>(() => [
  { value: 'full', label: text('完整', 'Full'), note: text('完整工具集', 'Full toolset') },
  { value: 'coding', label: text('编码', 'Coding'), note: text('代码优先', 'Code-first') },
  { value: 'messaging', label: text('消息', 'Messaging'), note: text('消息优先', 'Messaging-first') },
  { value: 'minimal', label: text('极简', 'Minimal'), note: text('最少工具', 'Minimal tools') },
]);
const execHostOptions = computed<ChoiceOption[]>(() => [
  { value: 'sandbox', label: text('沙箱', 'Sandbox') },
  { value: 'gateway', label: text('网关', 'Gateway') },
  { value: 'node', label: text('节点', 'Node') },
]);
const execAskOptions = computed<ChoiceOption[]>(() => [
  { value: 'off', label: text('不询问', 'Off') },
  { value: 'on-miss', label: text('未命中时询问', 'On Miss') },
  { value: 'always', label: text('总是询问', 'Always') },
]);
const execSecurityOptions = computed<ChoiceOption[]>(() => [
  { value: 'deny', label: text('拒绝', 'Deny') },
  { value: 'allowlist', label: text('允许列表', 'Allowlist') },
  { value: 'full', label: text('完全放行', 'Full') },
]);
const askFallbackOptions = computed<ChoiceOption[]>(() => [
  { value: 'deny', label: text('拒绝', 'Deny') },
  { value: 'allowlist', label: text('允许列表', 'Allowlist') },
  { value: 'full', label: text('完全放行', 'Full') },
]);
const dmScopeOptions = computed<ChoiceOption[]>(() => [
  { value: 'main', label: text('主会话共享', 'Main Shared') },
  { value: 'per-account-channel-peer', label: text('按账号 + 渠道 + 对端隔离', 'Per Account + Channel + Peer') },
  { value: 'per-channel-peer', label: text('按渠道 + 对端隔离', 'Per Channel + Peer') },
  { value: 'per-peer', label: text('按对端隔离', 'Per Peer') },
]);
const ackScopeOptions = computed<ChoiceOption[]>(() => [
  { value: 'group-mentions', label: text('群聊提及时', 'Group Mentions') },
  { value: 'group-all', label: text('所有群聊消息', 'All Group Messages') },
  { value: 'direct', label: text('仅私聊', 'Direct Only') },
  { value: 'all', label: text('全部消息', 'All Messages') },
]);
const queueModeOptions = computed<ChoiceOption[]>(() => [
  { value: 'steer', label: text('引导处理', 'Steer') },
  { value: 'followup', label: text('跟进模式', 'Followup') },
  { value: 'collect', label: text('收集模式', 'Collect') },
  { value: 'steer-backlog', label: text('引导 + 积压', 'Steer Backlog') },
  { value: 'steer+backlog', label: text('引导并保留积压', 'Steer + Backlog') },
  { value: 'queue', label: text('纯队列', 'Queue') },
  { value: 'interrupt', label: text('中断优先', 'Interrupt') },
]);
const queueDropOptions = computed<ChoiceOption[]>(() => [
  { value: 'old', label: text('丢弃旧消息', 'Drop Old') },
  { value: 'new', label: text('丢弃新消息', 'Drop New') },
  { value: 'summarize', label: text('汇总后保留', 'Summarize') },
]);

const loading = ref(true);
const saving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const saveFeedbackVisible = ref(false);
const loadedSummary = ref<ConfigSummaryPayload | null>(null);
const loadedChannelIds = ref<string[]>([]);
const baselineDomainFingerprints = ref<Record<string, string>>({});
const gatewayFormData = ref<Record<string, unknown> | null>(null);
const gatewayBaselineData = ref<Record<string, unknown> | null>(null);
let saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
const commandsFormData = ref<ConfigSummaryPayload['commands']>({
  native: 'auto',
  nativeSkills: 'auto',
  restart: true,
  ownerDisplay: 'raw',
});
const hooksFormData = ref<ConfigSummaryPayload['hooks']>({
  internal: {
    enabled: true,
    entries: {},
  },
});

function onGatewayUpdate(data: Record<string, unknown>) {
  const next = { ...data };
  const shouldSyncBaselineFingerprint = !gatewayBaselineData.value;
  gatewayFormData.value = next;
  if (shouldSyncBaselineFingerprint) {
    gatewayBaselineData.value = { ...next };
    baselineDomainFingerprints.value = {
      ...baselineDomainFingerprints.value,
      gateway: currentDomainFingerprints().gateway,
    };
  }
}

function onCommandsUpdate(data: ConfigSummaryPayload['commands']) {
  commandsFormData.value = data;
}

function onHooksUpdate(data: ConfigSummaryPayload['hooks']) {
  hooksFormData.value = data;
}

function normalizeGatewayTextList(value: unknown): string[] {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildGatewayPayloadFromFormData(data: Record<string, unknown>): ConfigUpdatePayload['gateway'] {
  return {
    port: Number(data.port) || 31879,
    mode: String(data.mode || 'local'),
    bind: String(data.bind || 'loopback'),
    customBindHost: data.bind === 'custom'
      ? String(data.customBindHost || '').trim()
      : '',
    auth: {
      mode: String(data.authMode || 'token'),
      ...(data.authToken ? { token: String(data.authToken) } : {}),
      ...(data.authPassword ? { password: String(data.authPassword) } : {}),
      allowTailscale: data.authAllowTailscale !== false,
      ...(String(data.authMode || 'token') === 'trusted-proxy' ? {
        trustedProxy: {
          userHeader: String(data.trustedProxyUserHeader || '').trim(),
          requiredHeaders: normalizeGatewayTextList(data.trustedProxyRequiredHeadersText),
          allowUsers: normalizeGatewayTextList(data.trustedProxyAllowUsersText),
        },
      } : {}),
      rateLimit: {
        maxAttempts: Number(data.rateLimitMaxAttempts) || 10,
        windowMs: Number(data.rateLimitWindowMs) || 60000,
        lockoutMs: Number(data.rateLimitLockoutMs) || 600000,
        exemptLoopback: data.rateLimitExemptLoopback !== false,
      },
    },
    controlUi: {
      enabled: data.controlUiEnabled !== false,
      basePath: String(data.controlUiBasePath || '').trim(),
      root: String(data.controlUiRoot || '').trim(),
      allowedOrigins: normalizeGatewayTextList(data.allowedOriginsText),
      dangerouslyAllowHostHeaderOriginFallback: data.hostHeaderOriginFallback === true,
      allowInsecureAuth: data.allowInsecureAuth === true,
      dangerouslyDisableDeviceAuth: data.dangerouslyDisableDeviceAuth === true,
    },
    allowRealIpFallback: data.allowRealIpFallback === true,
    trustedProxies: normalizeGatewayTextList(data.trustedProxiesText),
    tools: {
      allow: normalizeGatewayTextList(data.gatewayToolsAllowText),
      deny: normalizeGatewayTextList(data.gatewayToolsDenyText),
    },
    webchat: {
      chatHistoryMaxChars: Number(data.webchatChatHistoryMaxChars) || 200000,
    },
    channelHealthCheckMinutes: Number(data.channelHealthCheckMinutes) || 0,
    tailscale: {
      mode: String(data.tailscaleMode || 'off'),
    },
  } as ConfigUpdatePayload['gateway'];
}

function isGatewayPatchRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isGatewayPatchValueEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => isGatewayPatchValueEqual(entry, right[index]));
  }
  if (isGatewayPatchRecord(left) || isGatewayPatchRecord(right)) {
    if (!isGatewayPatchRecord(left) || !isGatewayPatchRecord(right)) {
      return false;
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (!isGatewayPatchValueEqual(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }
  return Object.is(left, right);
}

function buildSparseGatewayPatchValue(current: unknown, baseline: unknown): unknown {
  if (Array.isArray(current) || Array.isArray(baseline)) {
    return isGatewayPatchValueEqual(current, baseline) ? undefined : current;
  }
  if (isGatewayPatchRecord(current)) {
    const baselineRecord = isGatewayPatchRecord(baseline) ? baseline : {};
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(current)) {
      const patch = buildSparseGatewayPatchValue(current[key], baselineRecord[key]);
      if (patch !== undefined) {
        next[key] = patch;
      }
    }
    return Object.keys(next).length ? next : undefined;
  }
  return isGatewayPatchValueEqual(current, baseline) ? undefined : current;
}

function buildSparseGatewayPatch(): ConfigUpdatePayload['gateway'] | null {
  if (!gatewayFormData.value || !gatewayBaselineData.value) {
    return null;
  }
  const current = buildGatewayPayloadFromFormData(gatewayFormData.value);
  const baseline = buildGatewayPayloadFromFormData(gatewayBaselineData.value);
  const patch = buildSparseGatewayPatchValue(current, baseline);
  return isGatewayPatchRecord(patch) ? patch as ConfigUpdatePayload['gateway'] : null;
}
const form = reactive<ConfigFormState>({
  defaults: {
    model: '',
    modelFallback: [],
    imageModel: '',
    imageModelFallback: [],
    imageGenerationModel: '',
    imageGenerationModelFallback: [],
    videoGenerationModel: '',
    videoGenerationModelFallback: [],
    musicGenerationModel: '',
    musicGenerationModelFallback: [],
    mediaGenerationAutoProviderFallback: true,
    pdfModel: '',
    pdfModelFallback: [],
    thinking: 'high',
    verbose: '',
    timeoutSeconds: 600,
    maxConcurrent: 8,
    subagentMaxConcurrent: 16,
    subagentModel: '',
    subagentThinking: '',
    subagentRunTimeoutSeconds: null,
    subagentMaxSpawnDepth: null,
    subagentMaxChildrenPerAgent: null,
    subagentArchiveAfterMinutes: null,
    subagentAnnounceTimeoutMs: null,
    workspace: '',
    repoRoot: '',
    skipBootstrap: false,
    bootstrapMaxChars: null,
    bootstrapTotalMaxChars: null,
    systemPromptOverride: '',
    skillsText: '',
    contextInjection: '',
    bootstrapPromptTruncationWarning: '',
    userTimezone: '',
    timeFormat: '',
    envelopeTimezone: '',
    envelopeTimestamp: '',
    envelopeElapsed: '',
    contextTokens: null,
    typingMode: '',
    elevated: '',
    blockStreaming: '',
    blockStreamingBreak: '',
    blockStreamingChunkJson: '',
    blockStreamingCoalesceJson: '',
    mediaMaxMb: null,
    imageMaxDimensionPx: null,
    typingIntervalSeconds: null,
    pdfMaxBytesMb: null,
    pdfMaxPages: null,
    embeddedPiProjectSettingsPolicy: 'sanitize',
    memorySearchJson: '',
    humanDelayJson: '',
    heartbeatMode: 'inherit',
    heartbeatEvery: '',
    heartbeatJson: '',
    paramsJson: '',
    cliBackendsJson: '',
    contextPruningJson: '',
    modelsJson: '',
  },
  compaction: {
    mode: 'safeguard',
    reserveTokensFloor: 20000,
    identifierPolicy: 'strict',
    identifierInstructions: '',
    postCompactionSectionsText: '',
    model: '',
    memoryFlush: {
      enabled: true,
      softThresholdTokens: 4000,
    },
  },
  sandbox: {
    mode: 'off',
    workspaceAccess: 'rw',
    scope: 'session',
    sessionToolsVisibility: 'spawned',
    prune: {
      idleHours: 24,
      maxAgeDays: 7,
    },
  },
  tools: {
    profile: 'full',
    elevatedEnabled: true,
    execHost: 'sandbox',
    execNode: '',
    execAsk: 'off',
    execSecurity: 'full',
    execTimeoutSec: 45,
    fsWorkspaceOnly: false,
  },
  studioChat: {
    allowHostManagementExecInStudioChat: false,
  },
  execApprovals: {
    security: 'deny',
    ask: 'on-miss',
    askFallback: 'deny',
    autoAllowSkills: false,
    agents: [],
  },
  session: {
    dmScope: 'per-account-channel-peer',
    threadBindings: {
      enabled: false,
      idleHours: 24,
      maxAgeHours: 0,
    },
  },
  messages: {
    responsePrefix: '',
    ackReaction: '',
    ackReactionScope: 'group-mentions',
    removeAckAfterReply: false,
    queue: {
      mode: 'collect',
      debounceMs: 1000,
      cap: 20,
      drop: 'summarize',
      byChannel: [],
    },
  },
  providers: [],
  mcpSkills: {
    mcpSessionIdleTtlMs: null,
    mcpServersJson: '',
    skillsAllowBundledText: '',
    skillsExtraDirsText: '',
    skillsLoadWatch: false,
    skillsWatchDebounceMs: null,
    skillsPreferBrew: false,
    skillsNodeManager: '',
    skillsMaxCandidatesPerRoot: null,
    skillsMaxLoadedPerSource: null,
    skillsMaxInPrompt: null,
    skillsMaxPromptChars: null,
    skillsMaxSkillFileBytes: null,
    skillsEntriesJson: '',
  },
  sessionReset: {
    mode: 'idle',
    atHour: 4,
    idleMinutes: 60,
    resetByType: {},
    resetByChannelList: [],
  },
});

function formatConfigCheckedAt(value: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  const formatter = new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return formatter.format(date);
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (key, entry) => {
    if (key === 'uid' || key === 'apiKeyVisible' || key === 'apiKeyLoading') {
      return undefined;
    }
    if (key === 'apiKeyLoaded' || key === 'apiKey') {
      return undefined;
    }
    if (entry && typeof entry === 'object') {
      if (seen.has(entry as object)) return undefined;
      seen.add(entry as object);
      if (!Array.isArray(entry)) {
        return Object.keys(entry as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((next, entryKey) => {
            next[entryKey] = (entry as Record<string, unknown>)[entryKey];
            return next;
          }, {});
      }
    }
    return entry;
  });
}

function domainFingerprint(value: unknown): string {
  return stableStringify(value);
}

function normalizeLoggingDraft(summary: ConfigSummaryPayload | null) {
  const log = summary?.logging;
  return {
    level: log?.level ?? 'info',
    file: log?.file ?? '',
    maxFileBytes: log?.maxFileBytes ?? 0,
    consoleLevel: log?.consoleLevel ?? 'info',
    consoleStyle: log?.consoleStyle ?? 'pretty',
    redactSensitive: log?.redactSensitive ?? 'off',
  };
}

function normalizeBrowserDraft(summary: ConfigSummaryPayload | null) {
  const browser = summary?.browser;
  return {
    enabled: browser?.enabled !== false,
    evaluateEnabled: browser?.evaluateEnabled !== false,
    cdpUrl: browser?.cdpUrl?.trim() || undefined,
    remoteCdpTimeoutMs: browser?.remoteCdpTimeoutMs && browser.remoteCdpTimeoutMs > 0 ? browser.remoteCdpTimeoutMs : undefined,
    remoteCdpHandshakeTimeoutMs: browser?.remoteCdpHandshakeTimeoutMs && browser.remoteCdpHandshakeTimeoutMs > 0
      ? browser.remoteCdpHandshakeTimeoutMs
      : undefined,
    defaultProfile: browser?.defaultProfile?.trim() || undefined,
    attachOnly: browser?.attachOnly === true,
    cdpPortRangeStart: browser?.cdpPortRangeStart && browser.cdpPortRangeStart > 0 ? browser.cdpPortRangeStart : undefined,
    executablePath: browser?.executablePath ?? '',
    headless: browser?.headless ?? false,
    noSandbox: browser?.noSandbox ?? false,
    extraArgs: Array.isArray(browser?.extraArgs)
      ? browser.extraArgs.map((value) => value.trim()).filter(Boolean)
      : [],
    color: browser?.color?.trim() || undefined,
    snapshotDefaults: {
      mode: browser?.snapshotDefaults?.mode?.trim() || undefined,
    },
    tabCleanup: {
      enabled: browser?.tabCleanup?.enabled === true,
      idleMinutes: browser?.tabCleanup?.idleMinutes && browser.tabCleanup.idleMinutes > 0 ? browser.tabCleanup.idleMinutes : undefined,
      maxTabsPerSession: browser?.tabCleanup?.maxTabsPerSession && browser.tabCleanup.maxTabsPerSession > 0
        ? browser.tabCleanup.maxTabsPerSession
        : undefined,
      sweepMinutes: browser?.tabCleanup?.sweepMinutes && browser.tabCleanup.sweepMinutes > 0 ? browser.tabCleanup.sweepMinutes : undefined,
    },
    profiles: Array.isArray(browser?.profiles)
      ? browser.profiles
          .map((profile) => ({
            id: profile.id.trim(),
            driver: profile.driver?.trim() || undefined,
            attachOnly: profile.attachOnly === true,
            cdpPort: profile.cdpPort != null && profile.cdpPort > 0 ? profile.cdpPort : undefined,
            cdpUrl: profile.cdpUrl?.trim() || undefined,
            userDataDir: profile.userDataDir?.trim() || undefined,
            color: profile.color?.trim() || undefined,
          }))
          .filter((profile) => profile.id)
      : [],
    ssrfPolicy: {
      dangerouslyAllowPrivateNetwork: browser?.ssrfPolicy?.dangerouslyAllowPrivateNetwork !== false,
      hostnameAllowlist: Array.isArray(browser?.ssrfPolicy?.hostnameAllowlist)
        ? browser.ssrfPolicy.hostnameAllowlist.map((value) => value.trim()).filter(Boolean)
        : [],
      allowedHostnames: Array.isArray(browser?.ssrfPolicy?.allowedHostnames)
        ? browser.ssrfPolicy.allowedHostnames.map((value) => value.trim()).filter(Boolean)
        : [],
    },
  };
}

function normalizeAcpDraft(summary: ConfigSummaryPayload | null) {
  const acp = summary?.acp;
  return {
    enabled: acp?.enabled ?? false,
    dispatch: { enabled: acp?.dispatch?.enabled ?? false },
    backend: acp?.backend ?? 'acpx',
    defaultAgent: acp?.defaultAgent ?? '',
    allowedAgents: Array.isArray(acp?.allowedAgents)
      ? acp.allowedAgents.filter((agent) => agent.trim() !== '')
      : [],
    maxConcurrentSessions: acp?.maxConcurrentSessions ?? 4,
  };
}

function normalizeAcpPluginsDraft(summary: ConfigSummaryPayload | null) {
  const acp = normalizeAcpDraft(summary);
  const backend = acp.backend.trim().toLowerCase();
  const shouldEnsureAcpx = (acp.enabled || acp.dispatch.enabled || backend === 'acpx') && (!backend || backend === 'acpx');
  if (!shouldEnsureAcpx) return undefined;
  const allow = Array.isArray(summary?.plugins?.allow)
    ? Array.from(new Set([...(summary?.plugins?.allow || []), 'acpx']))
    : undefined;
  return {
    ...(allow && allow.length > 0 ? { allow } : {}),
    entries: {
      acpx: {
        enabled: true,
      },
    },
  };
}

function currentDomainFingerprints(): Record<string, string> {
  return {
    model: domainFingerprint({
      defaults: form.defaults,
      compaction: form.compaction,
    }),
    security: domainFingerprint({
      sandbox: form.sandbox,
      tools: form.tools,
      studioChat: form.studioChat,
      execApprovals: form.execApprovals,
    }),
    session: domainFingerprint({
      session: form.session,
      messages: form.messages,
    }),
    'session-policy': domainFingerprint({
      sessionReset: form.sessionReset,
      threadBindings: form.session.threadBindings,
      dmScope: form.session.dmScope,
    }),
    providers: domainFingerprint(form.providers),
    gateway: domainFingerprint({
      summary: loadedSummary.value?.gateway || null,
      draft: gatewayFormData.value || null,
      patch: buildSparseGatewayPatch(),
    }),
    acp: domainFingerprint({
      summary: loadedSummary.value?.acp || null,
      pluginEntries: loadedSummary.value?.plugins?.entries || null,
      draft: acpTabRef.value
        ? {
            acp: acpTabRef.value.buildAcpPayload(),
            plugins: acpTabRef.value.buildPluginsPayload?.() || null,
          }
        : {
            acp: normalizeAcpDraft(loadedSummary.value),
            plugins: normalizeAcpPluginsDraft(loadedSummary.value) || null,
          },
    }),
    'mcp-skills': domainFingerprint(form.mcpSkills),
    'commands-hooks': domainFingerprint({
      commands: commandsFormData.value,
      hooks: hooksFormData.value,
    }),
    logging: domainFingerprint({
      draft: loggingTabRef.value?.buildLoggingPayload() || normalizeLoggingDraft(loadedSummary.value),
    }),
    browser: domainFingerprint({
      draft: browserTabRef.value?.buildBrowserPayload() || normalizeBrowserDraft(loadedSummary.value),
    }),
  };
}

function captureConfigBaseline(): void {
  baselineDomainFingerprints.value = currentDomainFingerprints();
}

const configOverviewSignals = computed(() => buildConfigOverviewSignals(
  props.overviewRecipe || buildConfigOverviewRecipe(text),
  {
    defaultModel: form.defaults.model,
    imageModel: form.defaults.imageModel,
    providerCount: form.providers.length,
    checkedAtLabel: loadedSummary.value ? formatConfigCheckedAt(loadedSummary.value.checkedAt) : '--',
  },
));

const configSidebarSummary = computed(() => buildConfigSidebarSummary(text, {
  title: props.overviewRecipe?.sidebarTitle || text('先定配置域，再改参数', 'Set the domain first, then change the parameters'),
  activeLabel: activeTabMeta.value.label,
  activeCopy: activeTabMeta.value.copy,
}));

const activeTabFacts = computed(() => {
  switch (activeTab.value) {
    case 'model':
      return [
        { label: text('默认模型', 'Default model'), value: form.defaults.model || '--' },
        { label: text('图片模型', 'Image model'), value: form.defaults.imageModel || '--' },
        { label: text('回退链', 'Fallbacks'), value: `${form.defaults.modelFallback.length} / ${form.defaults.imageModelFallback.length}` },
        { label: text('模型目录', 'Model registry'), value: String(Object.keys(loadedSummary.value?.defaults.models || {}).length) },
        { label: 'HEARTBEAT', value: form.defaults.heartbeatMode === 'enabled' ? (form.defaults.heartbeatEvery || '30m') : form.defaults.heartbeatMode === 'disabled' ? text('关闭', 'Off') : text('不覆盖', 'No override') },
      ];
    case 'security':
      return [
        { label: 'Sandbox', value: form.sandbox.mode || '--' },
        { label: text('工作区权限', 'Workspace access'), value: form.sandbox.workspaceAccess || '--' },
        { label: text('工具配置', 'Tool profile'), value: form.tools.profile || '--' },
        { label: text('Exec 审批', 'Exec ask'), value: form.tools.execAsk || '--' },
      ];
    case 'session':
      return [
        { label: text('DM 范围', 'DM scope'), value: form.session.dmScope || '--' },
        { label: text('Ack 范围', 'Ack scope'), value: form.messages.ackReactionScope || '--' },
        { label: text('队列模式', 'Queue mode'), value: form.messages.queue.mode || '--' },
        { label: text('线程绑定', 'Thread bindings'), value: form.session.threadBindings.enabled ? text('开启', 'On') : text('关闭', 'Off') },
      ];
    case 'session-policy':
      return [
        { label: text('重置模式', 'Reset mode'), value: form.sessionReset.mode || '--' },
        { label: text('类型覆盖', 'Type overrides'), value: String(Object.keys(form.sessionReset.resetByType).length) },
        { label: text('频道覆盖', 'Channel overrides'), value: String(form.sessionReset.resetByChannelList.length) },
        { label: text('线程绑定', 'Thread bindings'), value: form.session.threadBindings.enabled ? text('开启', 'On') : text('关闭', 'Off') },
      ];
    case 'providers':
      return [
        { label: text('供应商数量', 'Providers'), value: String(form.providers.length) },
        { label: text('模型数量', 'Models'), value: String(form.providers.reduce((sum, provider) => sum + provider.models.length, 0)) },
        { label: text('已有密钥', 'With API key'), value: String(form.providers.filter((provider) => provider.hasApiKey || provider.apiKey.trim()).length) },
        { label: text('当前编辑', 'Active editor'), value: activeProvider.value ? resolveProviderDisplayName(activeProvider.value.id.trim(), activeProviderIndex.value) : text('未选择', 'None') },
      ];
    case 'gateway':
      return [
        { label: 'Port', value: loadedSummary.value?.gateway.port != null ? String(loadedSummary.value.gateway.port) : '--' },
        { label: text('绑定', 'Bind'), value: loadedSummary.value?.gateway.bind || '--' },
        { label: text('认证', 'Auth'), value: loadedSummary.value?.gateway.auth.mode || '--' },
        { label: 'Tailscale', value: loadedSummary.value?.gateway.tailscale.mode || '--' },
      ];
    case 'acp':
      return [
        { label: 'ACP', value: loadedSummary.value?.acp?.enabled ? text('开启', 'On') : text('关闭', 'Off') },
        { label: text('Backend', 'Backend'), value: loadedSummary.value?.acp?.backend || '--' },
        { label: text('默认 Agent', 'Default agent'), value: loadedSummary.value?.acp?.defaultAgent || '--' },
        { label: text('允许 Agent', 'Allowed agents'), value: String(loadedSummary.value?.acp?.allowedAgents?.length || 0) },
      ];
    case 'mcp-skills':
      return [
        { label: 'MCP Servers', value: String(Object.keys(loadedSummary.value?.mcp?.servers || {}).length) },
        { label: text('MCP TTL', 'MCP TTL'), value: loadedSummary.value?.mcp?.sessionIdleTtlMs != null ? `${loadedSummary.value.mcp.sessionIdleTtlMs}ms` : '--' },
        { label: text('额外技能目录', 'Extra dirs'), value: String(loadedSummary.value?.skills?.load?.extraDirs?.length || 0) },
        { label: text('技能条目', 'Skill entries'), value: String(Object.keys(loadedSummary.value?.skills?.entries || {}).length) },
      ];
    case 'commands-hooks':
      return [
        { label: text('原生命令', 'Native command'), value: commandsFormData.value.native || '--' },
        { label: text('Native skills', 'Native skills'), value: commandsFormData.value.nativeSkills || '--' },
        { label: text('内部钩子', 'Internal hooks'), value: hooksFormData.value.internal.enabled ? text('开启', 'On') : text('关闭', 'Off') },
        { label: text('Hook 数量', 'Hook count'), value: String(Object.keys(hooksFormData.value.internal.entries || {}).length) },
      ];
    case 'logging':
      return [
        { label: text('当前域', 'Current domain'), value: activeTabMeta.value.label },
        { label: text('保存方式', 'Save mode'), value: saving.value ? text('保存中', 'Saving') : text('手动', 'Manual') },
        { label: text('同步时间', 'Synced'), value: loadedSummary.value ? formatConfigCheckedAt(loadedSummary.value.checkedAt) : '--' },
        { label: text('工作台', 'Workbench'), value: text('日志模块', 'Logging module') },
      ];
    case 'browser':
      return [
        { label: text('浏览器功能', 'Browser feature'), value: loadedSummary.value?.browser?.enabled ? text('开启', 'On') : text('关闭', 'Off') },
        { label: text('无头模式', 'Headless'), value: loadedSummary.value?.browser?.headless ? text('开启', 'On') : text('关闭', 'Off') },
        { label: text('默认 Profile', 'Default profile'), value: loadedSummary.value?.browser?.defaultProfile || '--' },
        { label: text('执行路径', 'Executable'), value: loadedSummary.value?.browser?.executablePath || '--' },
      ];
    default:
      return [
        { label: text('当前域', 'Current domain'), value: activeTabMeta.value.label },
        { label: text('保存方式', 'Save mode'), value: saving.value ? text('保存中', 'Saving') : text('手动', 'Manual') },
        { label: text('同步时间', 'Synced'), value: loadedSummary.value ? formatConfigCheckedAt(loadedSummary.value.checkedAt) : '--' },
        { label: text('配置分组', 'Config groups'), value: String(tabs.value.length) },
      ];
  }
});

const dirtyDomains = computed<ConfigDirtyDomain[]>(() => {
  const baseline = baselineDomainFingerprints.value;
  const current = currentDomainFingerprints();
  return tabs.value
    .filter((tab) => baseline[tab.id] !== undefined && baseline[tab.id] !== current[tab.id])
    .map((tab) => ({
      id: tab.id,
      label: tab.label,
      detail: tab.copy,
    }));
});

const hasUnsavedChanges = computed(() => dirtyDomains.value.length > 0);

const saveReadiness = computed(() => {
  if (saving.value) {
    return {
      canSave: false,
      label: text('正在保存配置', 'Saving configuration'),
      description: text('正在写入 openclaw.json；请等待完成。', 'Writing openclaw.json; wait for completion.'),
    };
  }
  if (loading.value) {
    return {
      canSave: false,
      label: text('正在读取配置', 'Loading configuration'),
      description: text('配置摘要加载完成后才能保存。', 'Saving is available after the config summary loads.'),
    };
  }
  if (!loadedSummary.value) {
    return {
      canSave: false,
      label: text('配置尚未加载', 'Configuration not loaded'),
      description: text('请先刷新并确认配置来源。', 'Refresh first and confirm the config source.'),
    };
  }
  if (!hasUnsavedChanges.value) {
    return {
      canSave: true,
      label: text('没有未保存修改', 'No unsaved changes'),
      description: text('当前草稿与最近一次读取的配置一致。', 'The draft matches the latest loaded configuration.'),
    };
  }
  return {
    canSave: true,
    label: text(`有 ${dirtyDomains.value.length} 个配置域待保存`, `${dirtyDomains.value.length} config domain(s) changed`),
    description: text(
      '保存会写入 openclaw.json；Gateway、插件、浏览器和工具策略类变更可能需要重启或开启新会话。',
      'Saving writes openclaw.json; Gateway, plugin, browser, and tool policy changes may require restart or new sessions.',
    ),
  };
});

const saveDockState = computed(() => {
  if (saveFeedbackVisible.value && !hasUnsavedChanges.value && !saving.value) {
    return {
      canSave: true,
      label: text('配置已保存', 'Configuration saved'),
      description: text('改动已写入 openclaw.json，当前页面不会刷新。', 'Changes were written to openclaw.json without refreshing this page.'),
    };
  }
  return saveReadiness.value;
});

function toProviderModelForm(model: ConfigProviderSummary['models'][number]): ProviderModelFormState {
  return {
    uid: createUuid('provider-model'),
    id: model.id,
    capText: model.input.includes('text'),
    capImage: model.input.includes('image'),
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

function toProviderForm(provider: ConfigProviderSummary): ProviderFormState {
  return {
    uid: `${provider.id}-${createUuid('provider')}`,
    id: provider.id,
    api: provider.api || '',
    baseUrl: provider.baseUrl || '',
    apiKey: '',
    hasApiKey: provider.hasApiKey,
    apiKeyLoaded: false,
    apiKeyVisible: false,
    apiKeyLoading: false,
    models: provider.models.map((model) => toProviderModelForm(model)),
  };
}

function providerApiKeyDisplay(provider: ProviderFormState): string {
  if (provider.apiKeyLoaded) return provider.apiKey;
  return provider.hasApiKey ? '••••••••••' : '';
}

function readStudioChatExecConfigFlag(summary: ConfigSummaryPayload): boolean {
  const studioConfig = summary.plugins?.entries?.studio?.config as Record<string, unknown> | undefined;
  const chatConfig = studioConfig?.chat as Record<string, unknown> | undefined;
  return chatConfig?.allowHostManagementExecInStudioChat === true;
}

async function toggleProviderApiKey(provider: ProviderFormState): Promise<void> {
  if (!provider.apiKeyLoaded && provider.hasApiKey && provider.id.trim()) {
    provider.apiKeyLoading = true;
    try {
      const payload = await fetchProviderSecret(provider.id.trim());
      provider.apiKey = payload.apiKey;
      provider.apiKeyLoaded = true;
    } finally {
      provider.apiKeyLoading = false;
    }
  }
  provider.apiKeyVisible = !provider.apiKeyVisible;
}

function onProviderApiKeyInput(provider: ProviderFormState, value: string): void {
  provider.apiKey = value;
  provider.apiKeyLoaded = true;
}

function resolveProviderDisplayName(providerId: string, index: number): string {
  return providerId || text(`供应商 ${index + 1}`, `Provider ${index + 1}`);
}

function toApprovalAgentForm(agent: ConfigSummaryPayload['execApprovals']['agents'][number]): ApprovalAgentFormState {
  return {
    uid: `${agent.agentId}-${createUuid('approval-agent')}`,
    agentId: agent.agentId,
    security: agent.security || '',
    ask: agent.ask || '',
    askFallback: agent.askFallback || '',
    autoAllowSkills: agent.autoAllowSkills === true,
    allowlist: agent.allowlist.map((entry) => ({
      uid: createUuid('allowlist'),
      pattern: entry.pattern,
      lastUsedAt: entry.lastUsedAt,
      lastUsedCommand: entry.lastUsedCommand,
      lastResolvedPath: entry.lastResolvedPath,
    })),
  };
}

function hydrateForm(summary: ConfigSummaryPayload) {
  form.defaults.model = summary.defaults.model;
  form.defaults.modelFallback = [...summary.defaults.modelFallback];
  form.defaults.imageModel = summary.defaults.imageModel;
  form.defaults.imageModelFallback = [...summary.defaults.imageModelFallback];
  form.defaults.imageGenerationModel = summary.defaults.imageGenerationModel;
  form.defaults.imageGenerationModelFallback = [...summary.defaults.imageGenerationModelFallback];
  form.defaults.videoGenerationModel = summary.defaults.videoGenerationModel;
  form.defaults.videoGenerationModelFallback = [...summary.defaults.videoGenerationModelFallback];
  form.defaults.musicGenerationModel = summary.defaults.musicGenerationModel;
  form.defaults.musicGenerationModelFallback = [...summary.defaults.musicGenerationModelFallback];
  form.defaults.mediaGenerationAutoProviderFallback = summary.defaults.mediaGenerationAutoProviderFallback !== false;
  form.defaults.pdfModel = summary.defaults.pdfModel;
  form.defaults.pdfModelFallback = [...summary.defaults.pdfModelFallback];
  form.defaults.thinking = summary.defaults.thinking || 'high';
  form.defaults.verbose = summary.defaults.verbose || '';
  form.defaults.timeoutSeconds = summary.defaults.timeoutSeconds;
  form.defaults.maxConcurrent = summary.defaults.maxConcurrent;
  form.defaults.subagentMaxConcurrent = summary.defaults.subagentMaxConcurrent;
  form.defaults.subagentModel = summary.defaults.subagentModel || '';
  form.defaults.subagentThinking = summary.defaults.subagentThinking || '';
  form.defaults.subagentRunTimeoutSeconds = summary.defaults.subagentRunTimeoutSeconds ?? null;
  form.defaults.subagentMaxSpawnDepth = summary.defaults.subagentMaxSpawnDepth ?? null;
  form.defaults.subagentMaxChildrenPerAgent = summary.defaults.subagentMaxChildrenPerAgent ?? null;
  form.defaults.subagentArchiveAfterMinutes = summary.defaults.subagentArchiveAfterMinutes ?? null;
  form.defaults.subagentAnnounceTimeoutMs = summary.defaults.subagentAnnounceTimeoutMs ?? null;
  form.defaults.workspace = summary.defaults.workspace;
  form.defaults.repoRoot = summary.defaults.repoRoot;
  form.defaults.skipBootstrap = summary.defaults.skipBootstrap === true;
  form.defaults.bootstrapMaxChars = summary.defaults.bootstrapMaxChars ?? null;
  form.defaults.bootstrapTotalMaxChars = summary.defaults.bootstrapTotalMaxChars ?? null;
  form.defaults.systemPromptOverride = summary.defaults.systemPromptOverride || '';
  form.defaults.skillsText = Array.isArray(summary.defaults.skills) ? summary.defaults.skills.join('\n') : '';
  form.defaults.contextInjection = summary.defaults.contextInjection || '';
  form.defaults.bootstrapPromptTruncationWarning = summary.defaults.bootstrapPromptTruncationWarning || '';
  form.defaults.userTimezone = summary.defaults.userTimezone || '';
  form.defaults.timeFormat = summary.defaults.timeFormat || '';
  form.defaults.envelopeTimezone = summary.defaults.envelopeTimezone || '';
  form.defaults.envelopeTimestamp = summary.defaults.envelopeTimestamp || '';
  form.defaults.envelopeElapsed = summary.defaults.envelopeElapsed || '';
  form.defaults.contextTokens = summary.defaults.contextTokens ?? null;
  form.defaults.typingMode = summary.defaults.typingMode || '';
  form.defaults.elevated = summary.defaults.elevated || '';
  form.defaults.blockStreaming = summary.defaults.blockStreaming || '';
  form.defaults.blockStreamingBreak = summary.defaults.blockStreamingBreak || '';
  form.defaults.blockStreamingChunkJson = formatJsonEditor(summary.defaults.blockStreamingChunk);
  form.defaults.blockStreamingCoalesceJson = formatJsonEditor(summary.defaults.blockStreamingCoalesce);
  form.defaults.mediaMaxMb = summary.defaults.mediaMaxMb ?? null;
  form.defaults.imageMaxDimensionPx = summary.defaults.imageMaxDimensionPx ?? null;
  form.defaults.typingIntervalSeconds = summary.defaults.typingIntervalSeconds ?? null;
  form.defaults.pdfMaxBytesMb = summary.defaults.pdfMaxBytesMb ?? null;
  form.defaults.pdfMaxPages = summary.defaults.pdfMaxPages ?? null;
  form.defaults.embeddedPiProjectSettingsPolicy = summary.defaults.embeddedPiProjectSettingsPolicy || 'sanitize';
  form.defaults.memorySearchJson = formatJsonEditor(summary.defaults.memorySearch);
  form.defaults.humanDelayJson = formatJsonEditor(summary.defaults.humanDelay);
  form.defaults.heartbeatMode = resolveHeartbeatMode(summary.defaults.heartbeat);
  form.defaults.heartbeatEvery = resolveHeartbeatEvery(summary.defaults.heartbeat);
  form.defaults.heartbeatJson = formatJsonEditor(summary.defaults.heartbeat);
  form.defaults.paramsJson = formatJsonEditor(summary.defaults.params);
  form.defaults.cliBackendsJson = formatJsonEditor(summary.defaults.cliBackends);
  form.defaults.contextPruningJson = formatJsonEditor(summary.defaults.contextPruning);
  form.defaults.modelsJson = formatJsonEditor(summary.defaults.models);
  form.compaction.mode = summary.compaction.mode;
  form.compaction.reserveTokensFloor = summary.compaction.reserveTokensFloor;
  form.compaction.identifierPolicy = summary.compaction.identifierPolicy;
  form.compaction.identifierInstructions = summary.compaction.identifierInstructions;
  form.compaction.postCompactionSectionsText = summary.compaction.postCompactionSections.join(', ');
  form.compaction.model = summary.compaction.model;
  form.compaction.memoryFlush.enabled = summary.compaction.memoryFlush.enabled;
  form.compaction.memoryFlush.softThresholdTokens = summary.compaction.memoryFlush.softThresholdTokens;
  form.sandbox.mode = summary.sandbox.mode;
  form.sandbox.workspaceAccess = summary.sandbox.workspaceAccess;
  form.sandbox.scope = summary.sandbox.scope;
  form.sandbox.sessionToolsVisibility = summary.sandbox.sessionToolsVisibility;
  form.sandbox.prune.idleHours = summary.sandbox.prune.idleHours;
  form.sandbox.prune.maxAgeDays = summary.sandbox.prune.maxAgeDays;
  form.tools.profile = summary.tools.profile;
  form.tools.elevatedEnabled = summary.tools.elevatedEnabled;
  form.tools.execHost = summary.tools.execHost;
  form.tools.execNode = summary.tools.execNode;
  form.tools.execAsk = summary.tools.execAsk;
  form.tools.execSecurity = summary.tools.execSecurity;
  form.tools.execTimeoutSec = summary.tools.execTimeoutSec;
  form.tools.fsWorkspaceOnly = summary.tools.fsWorkspaceOnly;
  form.studioChat.allowHostManagementExecInStudioChat = readStudioChatExecConfigFlag(summary);
  form.execApprovals.security = summary.execApprovals.defaults.security;
  form.execApprovals.ask = summary.execApprovals.defaults.ask;
  form.execApprovals.askFallback = summary.execApprovals.defaults.askFallback;
  form.execApprovals.autoAllowSkills = summary.execApprovals.defaults.autoAllowSkills;
  form.execApprovals.agents = summary.execApprovals.agents.map((agent) => toApprovalAgentForm(agent));
  form.session.dmScope = summary.session.dmScope;
  form.session.threadBindings.enabled = summary.session.threadBindings.enabled;
  form.session.threadBindings.idleHours = summary.session.threadBindings.idleHours;
  form.session.threadBindings.maxAgeHours = summary.session.threadBindings.maxAgeHours;
  form.messages.responsePrefix = summary.messages.responsePrefix;
  form.messages.ackReaction = summary.messages.ackReaction;
  form.messages.ackReactionScope = summary.messages.ackReactionScope;
  form.messages.removeAckAfterReply = summary.messages.removeAckAfterReply;
  form.messages.queue.mode = summary.messages.queue.mode;
  form.messages.queue.debounceMs = summary.messages.queue.debounceMs;
  form.messages.queue.cap = summary.messages.queue.cap;
  form.messages.queue.drop = summary.messages.queue.drop;
  form.messages.queue.byChannel = Object.entries(summary.messages.queue.byChannel).map(([channelId, mode]) => ({
    uid: createUuid('queue-channel'),
    channelId,
    mode,
  }));
  form.providers = summary.providers.map((provider) => toProviderForm(provider));
  activeProviderUid.value = form.providers[0]?.uid || '';
  form.mcpSkills.mcpSessionIdleTtlMs = summary.mcp?.sessionIdleTtlMs ?? null;
  form.mcpSkills.mcpServersJson = formatJsonEditor(summary.mcp?.servers || {});
  form.mcpSkills.skillsAllowBundledText = Array.isArray(summary.skills?.allowBundled)
    ? summary.skills.allowBundled.join('\n')
    : '';
  form.mcpSkills.skillsExtraDirsText = Array.isArray(summary.skills?.load?.extraDirs)
    ? summary.skills.load.extraDirs.join('\n')
    : '';
  form.mcpSkills.skillsLoadWatch = summary.skills?.load?.watch === true;
  form.mcpSkills.skillsWatchDebounceMs = summary.skills?.load?.watchDebounceMs ?? null;
  form.mcpSkills.skillsPreferBrew = summary.skills?.install?.preferBrew === true;
  form.mcpSkills.skillsNodeManager = summary.skills?.install?.nodeManager || '';
  form.mcpSkills.skillsMaxCandidatesPerRoot = summary.skills?.limits?.maxCandidatesPerRoot ?? null;
  form.mcpSkills.skillsMaxLoadedPerSource = summary.skills?.limits?.maxSkillsLoadedPerSource ?? null;
  form.mcpSkills.skillsMaxInPrompt = summary.skills?.limits?.maxSkillsInPrompt ?? null;
  form.mcpSkills.skillsMaxPromptChars = summary.skills?.limits?.maxSkillsPromptChars ?? null;
  form.mcpSkills.skillsMaxSkillFileBytes = summary.skills?.limits?.maxSkillFileBytes ?? null;
  form.mcpSkills.skillsEntriesJson = formatJsonEditor(summary.skills?.entries || {});
  form.sessionReset.mode = summary.sessionReset?.mode || 'idle';
  form.sessionReset.atHour = summary.sessionReset?.atHour ?? 4;
  form.sessionReset.idleMinutes = summary.sessionReset?.idleMinutes ?? 60;
  form.sessionReset.resetByType = { ...(summary.sessionReset?.resetByType || {}) };
  form.sessionReset.resetByChannelList = Object.entries(summary.sessionReset?.resetByChannel || {}).map(([channelId, mode]) => ({
    uid: createUuid('reset-channel'),
    channelId,
    mode,
  }));
  commandsFormData.value = { ...(summary.commands || { native: 'auto', nativeSkills: 'auto', restart: true, ownerDisplay: 'raw' }) };
  hooksFormData.value = {
    internal: {
      enabled: summary.hooks?.internal?.enabled !== false,
      entries: Object.fromEntries(
        Object.entries(summary.hooks?.internal?.entries || {}).map(([id, entry]) => [id, { ...entry }])
      ),
    },
  };
}

function normalizeModelList(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeStringListFromText(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeOptionalInteger(value: unknown, min = 0): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= min ? normalized : null;
}

function formatJsonEditor(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  return JSON.stringify(value, null, 2);
}

function parseOptionalJsonObject(label: string, value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(text(`${label} 不是合法 JSON。`, `${label} is not valid JSON.`));
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(text(`${label} 必须是 JSON 对象。`, `${label} must be a JSON object.`));
  }
  return parsed as Record<string, unknown>;
}

function buildProviderModels(models: ProviderModelFormState[]) {
  return models.reduce<Array<Record<string, unknown>>>((items, model) => {
    const id = model.id.trim();
    if (!id) return items;
    const input = [
      ...(model.capText ? ['text'] : []),
      ...(model.capImage ? ['image'] : []),
    ];
    items.push({
      id,
      name: id,
      ...(input.length ? { input } : {}),
      ...(model.reasoning ? { reasoning: true } : {}),
      ...(model.contextWindow && model.contextWindow > 0 ? { contextWindow: model.contextWindow } : {}),
      ...(model.maxTokens && model.maxTokens > 0 ? { maxTokens: model.maxTokens } : {}),
    });
    return items;
  }, []);
}

function buildPayload(): ConfigUpdatePayload {
  const memorySearch = parseOptionalJsonObject('Memory Search JSON', form.defaults.memorySearchJson);
  const humanDelay = parseOptionalJsonObject('Human Delay JSON', form.defaults.humanDelayJson);
  const heartbeatRaw = parseOptionalJsonObject('Heartbeat JSON', form.defaults.heartbeatJson);
  const heartbeat = buildHeartbeatConfig(heartbeatRaw, form.defaults.heartbeatMode, form.defaults.heartbeatEvery);
  const modelParams = parseOptionalJsonObject('Global Model Params JSON', form.defaults.paramsJson);
  const blockStreamingChunk = parseOptionalJsonObject('Block Streaming Chunk JSON', form.defaults.blockStreamingChunkJson);
  const blockStreamingCoalesce = parseOptionalJsonObject('Block Streaming Coalesce JSON', form.defaults.blockStreamingCoalesceJson);
  const cliBackends = parseOptionalJsonObject('CLI Backends JSON', form.defaults.cliBackendsJson);
  const contextPruning = parseOptionalJsonObject('Context Pruning JSON', form.defaults.contextPruningJson);
  const modelRegistry = parseOptionalJsonObject('Model Registry JSON', form.defaults.modelsJson);
  const mcpServers = parseOptionalJsonObject('MCP Servers JSON', form.mcpSkills.mcpServersJson) || {};
  const skillEntries = parseOptionalJsonObject('Skill Entries JSON', form.mcpSkills.skillsEntriesJson) || {};
  const providers: ConfigProviderInput[] = form.providers.map((provider) => {
    const providerId = provider.id.trim();
    if (!providerId) throw new Error(text('Provider ID 不能为空', 'Provider ID is required'));
    const models = buildProviderModels(provider.models);
    if (!models.length) throw new Error(text(`Provider "${providerId}" 至少需要一个模型`, `Provider "${providerId}" must define at least one model`));

    return {
      id: providerId,
      api: provider.api.trim() || null,
      baseUrl: provider.baseUrl.trim() || null,
      ...(provider.apiKeyLoaded && provider.apiKey.trim() ? { apiKey: provider.apiKey.trim() } : {}),
      models,
    };
  });
  const gatewayPayload = buildSparseGatewayPatch();

  const payload: ConfigUpdatePayload = {
    defaults: {
      model: form.defaults.model.trim(),
      modelFallback: normalizeModelList(form.defaults.modelFallback),
      imageModel: form.defaults.imageModel.trim(),
      imageModelFallback: normalizeModelList(form.defaults.imageModelFallback),
      imageGenerationModel: form.defaults.imageGenerationModel.trim(),
      imageGenerationModelFallback: normalizeModelList(form.defaults.imageGenerationModelFallback),
      videoGenerationModel: form.defaults.videoGenerationModel.trim(),
      videoGenerationModelFallback: normalizeModelList(form.defaults.videoGenerationModelFallback),
      musicGenerationModel: form.defaults.musicGenerationModel.trim(),
      musicGenerationModelFallback: normalizeModelList(form.defaults.musicGenerationModelFallback),
      mediaGenerationAutoProviderFallback: form.defaults.mediaGenerationAutoProviderFallback === true,
      pdfModel: form.defaults.pdfModel.trim(),
      pdfModelFallback: normalizeModelList(form.defaults.pdfModelFallback),
      thinking: form.defaults.thinking,
      verbose: form.defaults.verbose,
      timeoutSeconds: Number(form.defaults.timeoutSeconds),
      maxConcurrent: Number(form.defaults.maxConcurrent),
      subagentMaxConcurrent: Number(form.defaults.subagentMaxConcurrent),
      subagentModel: form.defaults.subagentModel.trim(),
      subagentThinking: form.defaults.subagentThinking,
      subagentRunTimeoutSeconds: form.defaults.subagentRunTimeoutSeconds != null && Number(form.defaults.subagentRunTimeoutSeconds) >= 0
        ? Number(form.defaults.subagentRunTimeoutSeconds)
        : null,
      subagentMaxSpawnDepth: form.defaults.subagentMaxSpawnDepth != null && Number(form.defaults.subagentMaxSpawnDepth) > 0
        ? Number(form.defaults.subagentMaxSpawnDepth)
        : null,
      subagentMaxChildrenPerAgent: form.defaults.subagentMaxChildrenPerAgent != null && Number(form.defaults.subagentMaxChildrenPerAgent) > 0
        ? Number(form.defaults.subagentMaxChildrenPerAgent)
        : null,
      subagentArchiveAfterMinutes: form.defaults.subagentArchiveAfterMinutes != null && Number(form.defaults.subagentArchiveAfterMinutes) >= 0
        ? Number(form.defaults.subagentArchiveAfterMinutes)
        : null,
      subagentAnnounceTimeoutMs: form.defaults.subagentAnnounceTimeoutMs != null && Number(form.defaults.subagentAnnounceTimeoutMs) > 0
        ? Number(form.defaults.subagentAnnounceTimeoutMs)
        : null,
      workspace: form.defaults.workspace.trim(),
      repoRoot: form.defaults.repoRoot.trim(),
      skipBootstrap: form.defaults.skipBootstrap === true,
      bootstrapMaxChars: form.defaults.bootstrapMaxChars != null && Number(form.defaults.bootstrapMaxChars) > 0 ? Number(form.defaults.bootstrapMaxChars) : null,
      bootstrapTotalMaxChars: form.defaults.bootstrapTotalMaxChars != null && Number(form.defaults.bootstrapTotalMaxChars) > 0 ? Number(form.defaults.bootstrapTotalMaxChars) : null,
      systemPromptOverride: form.defaults.systemPromptOverride.trim(),
      skills: normalizeStringListFromText(form.defaults.skillsText),
      contextInjection: form.defaults.contextInjection,
      bootstrapPromptTruncationWarning: form.defaults.bootstrapPromptTruncationWarning,
      userTimezone: form.defaults.userTimezone.trim(),
      timeFormat: form.defaults.timeFormat,
      envelopeTimezone: form.defaults.envelopeTimezone.trim(),
      envelopeTimestamp: form.defaults.envelopeTimestamp,
      envelopeElapsed: form.defaults.envelopeElapsed,
      contextTokens: form.defaults.contextTokens != null && Number(form.defaults.contextTokens) > 0 ? Number(form.defaults.contextTokens) : null,
      typingMode: form.defaults.typingMode,
      elevated: form.defaults.elevated,
      blockStreaming: form.defaults.blockStreaming,
      blockStreamingBreak: form.defaults.blockStreamingBreak,
      blockStreamingChunk,
      blockStreamingCoalesce,
      mediaMaxMb: form.defaults.mediaMaxMb != null && Number(form.defaults.mediaMaxMb) > 0 ? Number(form.defaults.mediaMaxMb) : null,
      imageMaxDimensionPx: form.defaults.imageMaxDimensionPx != null && Number(form.defaults.imageMaxDimensionPx) > 0 ? Number(form.defaults.imageMaxDimensionPx) : null,
      typingIntervalSeconds: form.defaults.typingIntervalSeconds != null && Number(form.defaults.typingIntervalSeconds) > 0 ? Number(form.defaults.typingIntervalSeconds) : null,
      pdfMaxBytesMb: form.defaults.pdfMaxBytesMb != null && Number(form.defaults.pdfMaxBytesMb) > 0 ? Number(form.defaults.pdfMaxBytesMb) : null,
      pdfMaxPages: form.defaults.pdfMaxPages != null && Number(form.defaults.pdfMaxPages) > 0 ? Number(form.defaults.pdfMaxPages) : null,
      embeddedPiProjectSettingsPolicy: form.defaults.embeddedPiProjectSettingsPolicy,
      memorySearch,
      humanDelay,
      heartbeat,
      params: modelParams,
      cliBackends,
      contextPruning,
      models: modelRegistry,
    },
    compaction: {
      mode: form.compaction.mode,
      reserveTokensFloor: Number(form.compaction.reserveTokensFloor),
      identifierPolicy: form.compaction.identifierPolicy,
      identifierInstructions: form.compaction.identifierInstructions.trim(),
      postCompactionSections: form.compaction.postCompactionSectionsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      model: form.compaction.model.trim(),
      memoryFlush: {
        enabled: form.compaction.memoryFlush.enabled,
        softThresholdTokens: Number(form.compaction.memoryFlush.softThresholdTokens),
      },
    },
    sandbox: {
      mode: form.sandbox.mode,
      workspaceAccess: form.sandbox.workspaceAccess,
      scope: form.sandbox.scope,
      sessionToolsVisibility: form.sandbox.sessionToolsVisibility,
      prune: {
        idleHours: Number(form.sandbox.prune.idleHours),
        maxAgeDays: Number(form.sandbox.prune.maxAgeDays),
      },
    },
    tools: {
      profile: form.tools.profile,
      elevatedEnabled: form.tools.elevatedEnabled,
      execHost: form.tools.execHost,
      execNode: form.tools.execNode.trim(),
      execAsk: form.tools.execAsk,
      execSecurity: form.tools.execSecurity,
      execTimeoutSec: Number(form.tools.execTimeoutSec),
      fsWorkspaceOnly: form.tools.fsWorkspaceOnly,
    },
    plugins: {
      entries: {
        studio: {
          enabled: true,
          config: {
            chat: {
              allowHostManagementExecInStudioChat: form.studioChat.allowHostManagementExecInStudioChat === true,
            },
          },
        },
      },
    },
    execApprovals: {
      defaults: {
        security: form.execApprovals.security,
        ask: form.execApprovals.ask,
        askFallback: form.execApprovals.askFallback,
        autoAllowSkills: form.execApprovals.autoAllowSkills,
      },
      agents: form.execApprovals.agents.map((agent) => ({
        agentId: agent.agentId,
        security: agent.security,
        ask: agent.ask,
        askFallback: agent.askFallback,
        autoAllowSkills: agent.autoAllowSkills,
        allowlistCount: agent.allowlist.filter((entry) => entry.pattern.trim()).length,
        allowlist: agent.allowlist
          .filter((entry) => entry.pattern.trim())
          .map((entry) => ({
            pattern: entry.pattern.trim(),
            lastUsedAt: entry.lastUsedAt,
            lastUsedCommand: entry.lastUsedCommand,
            lastResolvedPath: entry.lastResolvedPath,
          })),
      })),
    },
    session: {
      dmScope: form.session.dmScope,
      threadBindings: {
        enabled: form.session.threadBindings.enabled,
        idleHours: Number(form.session.threadBindings.idleHours),
        maxAgeHours: Number(form.session.threadBindings.maxAgeHours),
      },
    },
    messages: {
      responsePrefix: form.messages.responsePrefix.trim(),
      ackReaction: form.messages.ackReaction.trim(),
      ackReactionScope: form.messages.ackReactionScope,
      removeAckAfterReply: form.messages.removeAckAfterReply,
      queue: {
        mode: form.messages.queue.mode,
        debounceMs: Number(form.messages.queue.debounceMs),
        cap: Number(form.messages.queue.cap),
        drop: form.messages.queue.drop,
        byChannel: Object.fromEntries(
          form.messages.queue.byChannel
            .map((entry) => [entry.channelId.trim(), entry.mode] as const)
            .filter(([channelId, mode]) => Boolean(channelId) && Boolean(mode))
        ),
      },
    },
    providers,
    ...(gatewayPayload ? {
      gateway: gatewayPayload,
    } : {}),
    commands: commandsFormData.value,
    hooks: hooksFormData.value,
    sessionReset: {
      mode: form.sessionReset.mode,
      atHour: form.sessionReset.mode === 'daily' ? Number(form.sessionReset.atHour) : null,
      idleMinutes: form.sessionReset.mode === 'idle'
        ? Math.max(1, Number(form.sessionReset.idleMinutes) || 60)
        : null,
      resetByType: { ...form.sessionReset.resetByType },
      resetByChannel: Object.fromEntries(
        form.sessionReset.resetByChannelList
          .filter((entry) => entry.channelId.trim() && entry.mode)
          .map((entry) => [entry.channelId.trim(), entry.mode])
      ),
    },
  };

  const mcpSessionIdleTtlMs = normalizeOptionalInteger(form.mcpSkills.mcpSessionIdleTtlMs, 0);
  const skillsAllowBundled = normalizeStringListFromText(form.mcpSkills.skillsAllowBundledText);
  const skillsExtraDirs = normalizeStringListFromText(form.mcpSkills.skillsExtraDirsText);
  const skillsWatchDebounceMs = normalizeOptionalInteger(form.mcpSkills.skillsWatchDebounceMs, 0);
  const skillsMaxCandidatesPerRoot = normalizeOptionalInteger(form.mcpSkills.skillsMaxCandidatesPerRoot, 1);
  const skillsMaxLoadedPerSource = normalizeOptionalInteger(form.mcpSkills.skillsMaxLoadedPerSource, 1);
  const skillsMaxInPrompt = normalizeOptionalInteger(form.mcpSkills.skillsMaxInPrompt, 0);
  const skillsMaxPromptChars = normalizeOptionalInteger(form.mcpSkills.skillsMaxPromptChars, 0);
  const skillsMaxSkillFileBytes = normalizeOptionalInteger(form.mcpSkills.skillsMaxSkillFileBytes, 0);
  const shouldSendMcp = Boolean(loadedSummary.value?.mcp)
    || mcpSessionIdleTtlMs != null
    || Object.keys(mcpServers).length > 0;
  const shouldSendAllowBundled = Array.isArray(loadedSummary.value?.skills?.allowBundled)
    || skillsAllowBundled.length > 0;
  const shouldSendSkills = Boolean(loadedSummary.value?.skills)
    || shouldSendAllowBundled
    || skillsExtraDirs.length > 0
    || form.mcpSkills.skillsLoadWatch === true
    || skillsWatchDebounceMs != null
    || form.mcpSkills.skillsPreferBrew === true
    || Boolean(form.mcpSkills.skillsNodeManager.trim())
    || skillsMaxCandidatesPerRoot != null
    || skillsMaxLoadedPerSource != null
    || skillsMaxInPrompt != null
    || skillsMaxPromptChars != null
    || skillsMaxSkillFileBytes != null
    || Object.keys(skillEntries).length > 0;
  if (shouldSendMcp) {
    payload.mcp = {
      sessionIdleTtlMs: mcpSessionIdleTtlMs,
      servers: mcpServers,
    };
  }
  if (shouldSendSkills) {
    const existingSkills = loadedSummary.value?.skills;
    const skillsPayload: NonNullable<ConfigUpdatePayload['skills']> = {};
    const loadPayload: NonNullable<NonNullable<ConfigUpdatePayload['skills']>['load']> = {};
    const installPayload: NonNullable<NonNullable<ConfigUpdatePayload['skills']>['install']> = {};
    const limitsPayload: NonNullable<NonNullable<ConfigUpdatePayload['skills']>['limits']> = {};
    if (existingSkills?.load || skillsExtraDirs.length > 0) {
      loadPayload.extraDirs = skillsExtraDirs;
    }
    if (existingSkills?.load?.watch != null || form.mcpSkills.skillsLoadWatch === true) {
      loadPayload.watch = form.mcpSkills.skillsLoadWatch === true;
    }
    if (existingSkills?.load?.watchDebounceMs != null || skillsWatchDebounceMs != null) {
      loadPayload.watchDebounceMs = skillsWatchDebounceMs;
    }
    if (existingSkills?.install?.preferBrew != null || form.mcpSkills.skillsPreferBrew === true) {
      installPayload.preferBrew = form.mcpSkills.skillsPreferBrew === true;
    }
    if (existingSkills?.install?.nodeManager || form.mcpSkills.skillsNodeManager.trim()) {
      installPayload.nodeManager = form.mcpSkills.skillsNodeManager.trim();
    }
    if (existingSkills?.limits?.maxCandidatesPerRoot != null || skillsMaxCandidatesPerRoot != null) {
      limitsPayload.maxCandidatesPerRoot = skillsMaxCandidatesPerRoot;
    }
    if (existingSkills?.limits?.maxSkillsLoadedPerSource != null || skillsMaxLoadedPerSource != null) {
      limitsPayload.maxSkillsLoadedPerSource = skillsMaxLoadedPerSource;
    }
    if (existingSkills?.limits?.maxSkillsInPrompt != null || skillsMaxInPrompt != null) {
      limitsPayload.maxSkillsInPrompt = skillsMaxInPrompt;
    }
    if (existingSkills?.limits?.maxSkillsPromptChars != null || skillsMaxPromptChars != null) {
      limitsPayload.maxSkillsPromptChars = skillsMaxPromptChars;
    }
    if (existingSkills?.limits?.maxSkillFileBytes != null || skillsMaxSkillFileBytes != null) {
      limitsPayload.maxSkillFileBytes = skillsMaxSkillFileBytes;
    }
    if (Object.keys(loadPayload).length > 0) skillsPayload.load = loadPayload;
    if (Object.keys(installPayload).length > 0) skillsPayload.install = installPayload;
    if (Object.keys(limitsPayload).length > 0) skillsPayload.limits = limitsPayload;
    if (existingSkills?.entries || Object.keys(skillEntries).length > 0) {
      skillsPayload.entries = skillEntries;
    }
    if (shouldSendAllowBundled) {
      skillsPayload.allowBundled = skillsAllowBundled;
    }
    payload.skills = skillsPayload;
  }

  if (loggingTabRef.value) {
    (payload as any).logging = loggingTabRef.value.buildLoggingPayload();
  }
  if (browserTabRef.value) {
    payload.browser = browserTabRef.value.buildBrowserPayload();
  }
  if (acpTabRef.value) {
    payload.acp = acpTabRef.value.buildAcpPayload();
    const pluginsPayload = acpTabRef.value.buildPluginsPayload?.();
    if (pluginsPayload) {
      payload.plugins = {
        ...(payload.plugins || {}),
        ...pluginsPayload,
        entries: {
          ...((payload.plugins || {}).entries || {}),
          ...(pluginsPayload.entries || {}),
        },
      };
    }
  }

  return payload;
}

const modelOptions = computed(() => {
  const values = form.providers.flatMap((provider) =>
    provider.models
      .map((model) => model.id.trim())
      .filter(Boolean)
      .map((modelId) => `${provider.id.trim()}/${modelId}`)
  );

  const merged = [
    ...values,
    form.defaults.model,
    form.defaults.imageModel,
    form.defaults.imageGenerationModel,
    form.defaults.videoGenerationModel,
    form.defaults.musicGenerationModel,
    form.defaults.pdfModel,
    ...form.defaults.modelFallback,
    ...form.defaults.imageModelFallback,
    ...form.defaults.imageGenerationModelFallback,
    ...form.defaults.videoGenerationModelFallback,
    ...form.defaults.musicGenerationModelFallback,
    ...form.defaults.pdfModelFallback,
  ].filter(Boolean);

  return Array.from(new Set(merged)).sort();
});

const imageCapableModels = computed(() => {
  const values = form.providers.flatMap((provider) =>
    provider.models
      .filter((model) => model.id.trim() && model.capImage)
      .map((model) => `${provider.id.trim()}/${model.id.trim()}`)
  );
  return Array.from(new Set(values)).sort();
});

const imageModelOptions = computed(() => {
  return Array.from(new Set([...imageCapableModels.value, ...modelOptions.value])).sort();
});

function toSelectOptions(values: string[]): GlassSelectOption[] {
  return values.map((value) => ({ value, label: value }));
}

function choiceToSelectOptions(options: ChoiceOption[]): GlassSelectOption[] {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

const pluginSummary = computed(() => {
  const entries = loadedSummary.value?.pluginEntries || [];
  if (!entries.length) return text('当前没有 plugin entries。', 'There are currently no plugin entries.');
  const enabledCount = entries.filter((entry) => entry.enabled).length;
  return text(
    `共 ${entries.length} 个 plugin entry，其中 ${enabledCount} 个启用。`,
    `${entries.length} plugin entries in total, ${enabledCount} enabled.`
  );
});

function withCurrentOption(options: ChoiceOption[], current: string): ChoiceOption[] {
  if (!current || options.some((option) => option.value === current)) return options;
  return [...options, { value: current, label: text(`${current}（当前）`, `${current} (Current)`) }];
}

const effectiveExecAskOptions = computed(() => withCurrentOption(execAskOptions.value, form.tools.execAsk));
const effectiveExecSecurityOptions = computed(() => withCurrentOption(execSecurityOptions.value, form.tools.execSecurity));
const effectiveApprovalsSecurityOptions = computed(() => withCurrentOption(execSecurityOptions.value, form.execApprovals.security));
const effectiveApprovalsAskOptions = computed(() => withCurrentOption(execAskOptions.value, form.execApprovals.ask));
const effectiveApprovalsAskFallbackOptions = computed(() => withCurrentOption(askFallbackOptions.value, form.execApprovals.askFallback));
const effectiveDmScopeOptions = computed(() => withCurrentOption(dmScopeOptions.value, form.session.dmScope));
const effectiveAckScopeOptions = computed(() => withCurrentOption(ackScopeOptions.value, form.messages.ackReactionScope));
const effectiveQueueModeOptions = computed(() => withCurrentOption(queueModeOptions.value, form.messages.queue.mode));
const effectiveQueueDropOptions = computed(() => withCurrentOption(queueDropOptions.value, form.messages.queue.drop));
const effectiveCompactionOptions = computed(() => withCurrentOption(compactionOptions.value, form.compaction.mode));
const effectiveIdentifierPolicyOptions = computed(() => withCurrentOption(identifierPolicyOptions.value, form.compaction.identifierPolicy));
const effectiveSandboxModeOptions = computed(() => withCurrentOption(sandboxModeOptions.value, form.sandbox.mode));
const effectiveWorkspaceAccessOptions = computed(() => withCurrentOption(workspaceAccessOptions.value, form.sandbox.workspaceAccess));
const effectiveSandboxScopeOptions = computed(() => withCurrentOption(sandboxScopeOptions.value, form.sandbox.scope));
const effectiveVisibilityOptions = computed(() => withCurrentOption(visibilityOptions.value, form.sandbox.sessionToolsVisibility));
const effectiveToolProfileOptions = computed(() => withCurrentOption(toolProfileOptions.value, form.tools.profile));
const effectiveExecHostOptions = computed(() => withCurrentOption(execHostOptions.value, form.tools.execHost));
const missingApprovalAgents = computed(() => {
  const configured = new Set(form.execApprovals.agents.map((agent) => agent.agentId));
  return (loadedSummary.value?.execApprovals.availableAgentIds || []).filter((agentId) => !configured.has(agentId));
});
const modelSelectOptions = computed(() => toSelectOptions(modelOptions.value));
const imageModelSelectOptions = computed(() => toSelectOptions(imageModelOptions.value));
function queueChannelSelectOptions(currentValue = ''): GlassSelectOption[] {
  const base = Array.from(new Set([...loadedChannelIds.value, currentValue].filter(Boolean))).sort();
  return base.map((value) => ({
    value,
    label: value,
  }));
}

function filteredFallbackOptions(baseModel: string, currentList: string[], index: number, source: string[]): string[] {
  return source.filter((option) => {
    if (option === baseModel) return false;
    return currentList.every((item, itemIndex) => itemIndex === index || item !== option);
  });
}

function openAdvancedSheet(): void {
  if (!activeAdvancedSheetMeta.value) return;
  advancedSheetOpen.value = true;
}

function closeAdvancedSheet(): void {
  advancedSheetOpen.value = false;
}

function persistActiveConfigTab(nextTab: ConfigTabId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONFIG_ACTIVE_TAB_STORAGE_KEY, nextTab);
  } catch {
    // Ignore storage failures in private or restricted browsing modes.
  }
}

function getRouteScrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('.main-content.standard-scroll-route');
}

function getRouteScrollTop(): number {
  const container = getRouteScrollContainer();
  if (container) return container.scrollTop;
  return typeof window !== 'undefined' ? window.scrollY : 0;
}

function setRouteScrollTop(top: number): void {
  const container = getRouteScrollContainer();
  if (container) {
    container.scrollTo({ top, behavior: 'auto' });
    return;
  }
  if (typeof window !== 'undefined') {
    window.scrollTo({ top, behavior: 'auto' });
  }
}

function mergeConfigSummaryInPlace(nextSummary: ConfigSummaryPayload): void {
  if (!loadedSummary.value) {
    loadedSummary.value = nextSummary;
    return;
  }
  const target = loadedSummary.value as unknown as Record<string, unknown>;
  const source = nextSummary as unknown as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  Object.assign(target, source);
}

function acceptSavedConfigSummary(nextSummary: ConfigSummaryPayload): void {
  mergeConfigSummaryInPlace(nextSummary);
  gatewayFormData.value = null;
  gatewayBaselineData.value = null;
  hydrateForm(nextSummary);
  captureConfigBaseline();
}

function applyActiveTab(nextTab: ConfigTabId): void {
  activeTab.value = nextTab;
  closeAdvancedSheet();
  persistActiveConfigTab(nextTab);
}

function setActiveTab(nextTab: ConfigTabId): void {
  applyActiveTab(nextTab);
  void nextTick(() => setRouteScrollTop(0));
  if (!isConfigRouteActive.value) return;
  const query = { ...route.query, tab: nextTab };
  delete query.section;
  if (route.query.tab === nextTab && route.query.section == null) return;
  void router.replace({ path: route.path, query });
}

function openGlobalConfig(): void {
  setActiveTab('model');
  void nextTick(() => {
    if (typeof document !== 'undefined') {
      document.getElementById('global-config')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });
}

async function loadConfig() {
  if (!isConfigRouteActive.value) return;
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const [summary, channels] = await Promise.all([
      fetchConfigSummary(),
      fetchConfigChannelSummary().catch(() => null),
    ]);
    if (!isConfigRouteActive.value) return;
    loadedSummary.value = summary;
    loadedChannelIds.value = channels?.channels.map((channel) => channel.type).sort() || [];
    gatewayFormData.value = null;
    gatewayBaselineData.value = null;
    hydrateForm(summary);
    captureConfigBaseline();
  } catch (error) {
    if (!isConfigRouteActive.value) return;
    errorMessage.value = error instanceof Error ? error.message : text('配置加载失败', 'Failed to load configuration');
  } finally {
    loading.value = false;
  }
}

async function refreshConfigWithDirtyCheck(): Promise<void> {
  if (hasUnsavedChanges.value && typeof window !== 'undefined') {
    const shouldDiscard = window.confirm(text(
      `当前有 ${dirtyDomains.value.length} 个配置域有未保存修改。刷新会丢弃这些修改，是否继续？`,
      `There are ${dirtyDomains.value.length} config domain(s) with unsaved changes. Refreshing will discard them. Continue?`,
    ));
    if (!shouldDiscard) return;
  }
  await loadConfig();
}

function showSaveFeedback(): void {
  if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
  saveFeedbackVisible.value = true;
  saveFeedbackTimer = setTimeout(() => {
    saveFeedbackVisible.value = false;
    saveFeedbackTimer = null;
  }, 2800);
}

async function saveChanges() {
  if (!saveReadiness.value.canSave) return;
  const tabBeforeSave = activeTab.value;
  const scrollBeforeSave = getRouteScrollTop();
  persistActiveConfigTab(tabBeforeSave);
  saving.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const payload = buildPayload();
    const response = await saveConfig(payload);
    acceptSavedConfigSummary(response.config);
    successMessage.value = response.message || text('配置已保存。', 'Configuration saved.');
    showSaveFeedback();
    await nextTick();
    setRouteScrollTop(scrollBeforeSave);
  } catch (error) {
    if (saveFeedbackTimer) {
      clearTimeout(saveFeedbackTimer);
      saveFeedbackTimer = null;
    }
    saveFeedbackVisible.value = false;
    errorMessage.value = error instanceof Error ? error.message : text('配置保存失败', 'Failed to save configuration');
  } finally {
    saving.value = false;
  }
}

function addFallback(kind: 'model' | 'image' | 'imageGeneration' | 'videoGeneration' | 'musicGeneration' | 'pdf') {
  const source = kind === 'image' ? imageModelOptions.value : modelOptions.value;
  if (!source.length) return;
  const target =
    kind === 'model' ? form.defaults.modelFallback
      : kind === 'image' ? form.defaults.imageModelFallback
        : kind === 'imageGeneration' ? form.defaults.imageGenerationModelFallback
          : kind === 'videoGeneration' ? form.defaults.videoGenerationModelFallback
            : kind === 'musicGeneration' ? form.defaults.musicGenerationModelFallback
              : form.defaults.pdfModelFallback;
  const base =
    kind === 'model' ? form.defaults.model
      : kind === 'image' ? form.defaults.imageModel
        : kind === 'imageGeneration' ? form.defaults.imageGenerationModel
          : kind === 'videoGeneration' ? form.defaults.videoGenerationModel
            : kind === 'musicGeneration' ? form.defaults.musicGenerationModel
              : form.defaults.pdfModel;
  const nextOption = source.find((option) => option !== base && !target.includes(option));
  if (nextOption) target.push(nextOption);
}

function removeFallback(kind: 'model' | 'image' | 'imageGeneration' | 'videoGeneration' | 'musicGeneration' | 'pdf', index: number) {
  if (kind === 'model') form.defaults.modelFallback.splice(index, 1);
  else if (kind === 'image') form.defaults.imageModelFallback.splice(index, 1);
  else if (kind === 'imageGeneration') form.defaults.imageGenerationModelFallback.splice(index, 1);
  else if (kind === 'videoGeneration') form.defaults.videoGenerationModelFallback.splice(index, 1);
  else if (kind === 'musicGeneration') form.defaults.musicGenerationModelFallback.splice(index, 1);
  else form.defaults.pdfModelFallback.splice(index, 1);
}

function addProvider() {
  const provider = {
    uid: createUuid('provider'),
    id: '',
    api: '',
    baseUrl: '',
    apiKey: '',
    hasApiKey: false,
    apiKeyLoaded: false,
    apiKeyVisible: false,
    apiKeyLoading: false,
    models: [],
  };
  form.providers.push(provider);
  activeProviderUid.value = provider.uid;
}

function removeProvider(index: number) {
  const removedUid = form.providers[index]?.uid;
  form.providers.splice(index, 1);
  if (removedUid === activeProviderUid.value) {
    activeProviderUid.value = form.providers[Math.max(0, index - 1)]?.uid || form.providers[0]?.uid || '';
  }
}

function addProviderModel(providerIndex: number) {
  form.providers[providerIndex].models.push({
    uid: createUuid('provider-model'),
    id: '',
    capText: true,
    capImage: false,
    reasoning: false,
    contextWindow: null,
    maxTokens: null,
  });
}

function removeProviderModel(providerIndex: number, modelIndex: number) {
  form.providers[providerIndex].models.splice(modelIndex, 1);
}

function addApprovalAgent(agentId?: string) {
  const nextId = agentId || missingApprovalAgents.value[0] || '';
  if (!nextId) return;
  if (form.execApprovals.agents.some((agent) => agent.agentId === nextId)) return;
  form.execApprovals.agents.push({
    uid: `${nextId}-${createUuid('approval-agent')}`,
    agentId: nextId,
    security: '',
    ask: '',
    askFallback: '',
    autoAllowSkills: false,
    allowlist: [],
  });
}

function removeApprovalAgent(index: number) {
  form.execApprovals.agents.splice(index, 1);
}

function addAllowlistEntry(agentIndex: number) {
  form.execApprovals.agents[agentIndex].allowlist.push({
    uid: createUuid('allowlist'),
    pattern: '',
    lastUsedAt: 0,
    lastUsedCommand: '',
    lastResolvedPath: '',
  });
}

function removeAllowlistEntry(agentIndex: number, entryIndex: number) {
  form.execApprovals.agents[agentIndex].allowlist.splice(entryIndex, 1);
}

function addQueueChannelMode() {
  form.messages.queue.byChannel.push({
    uid: createUuid('queue-channel'),
    channelId: '',
    mode: form.messages.queue.mode || 'collect',
  });
}

function removeQueueChannelMode(index: number) {
  form.messages.queue.byChannel.splice(index, 1);
}

function activateConfigPage(): void {
  if (!isConfigRouteActive.value) return;
  if (configPageBootstrapped && loadedSummary.value) return;
  configPageBootstrapped = true;
  if (configLoadPromise) return;
  configLoadPromise = loadConfig().finally(() => {
    configLoadPromise = null;
  });
}

onMounted(activateConfigPage);
onActivated(activateConfigPage);
onBeforeUnmount(() => {
  if (saveFeedbackTimer) {
    clearTimeout(saveFeedbackTimer);
    saveFeedbackTimer = null;
  }
});

watch(
  () => [route.query.tab, route.query.section],
  ([tabValue, sectionValue]) => {
    if (!isConfigRouteActive.value) return;
    applyActiveTab(
      sectionValue
        ? resolveConfigTabFromSection(sectionValue)
        : normalizeConfigTabId(tabValue),
    );
  }
);
</script>

<style scoped>
.config-page-shell {
  gap: 16px;
}

.config-overview-ribbon {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.config-overview-card {
  display: grid;
  gap: 5px;
  padding: 14px 15px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.035));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.config-overview-card span {
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.config-overview-card strong {
  color: var(--text);
  font-size: 16px;
  line-height: 1.4;
  word-break: break-word;
}

.config-overview-card p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.config-page-shell .config-workbench {
  grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.config-page-shell .config-sidebar {
  position: sticky;
  top: 0;
  gap: 14px;
  padding: 16px;
  align-self: start;
}

.config-sidebar-callout {
  display: grid;
  gap: 8px;
  padding: 14px 15px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.035));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.config-sidebar-callout__eyebrow {
  color: var(--acc);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.config-sidebar-callout strong {
  color: var(--text);
  font-size: 17px;
  line-height: 1.35;
}

.config-sidebar-callout p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.config-tabs-grouped {
  gap: 12px;
}

.config-tab-group {
  display: grid;
  gap: 7px;
}

.config-tab-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.config-tab-group__head strong {
  min-width: 22px;
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.2;
  text-align: center;
}

.config-page-shell .config-tab {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 3px;
  align-items: center;
  padding: 10px 11px;
}

.config-page-shell .config-tab-icon {
  grid-row: span 2;
  width: 30px;
  height: 30px;
  margin: 0;
  border-radius: 9px;
  font-size: 15px;
}

.config-page-shell .config-tab-title,
.config-page-shell .config-tab-copy {
  min-width: 0;
}

.config-page-shell .config-tab-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-page-shell .config-tab-copy {
  min-height: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.config-page-shell .config-main {
  gap: 16px;
}

.config-page-shell .config-active-tab-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.config-advanced-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 15px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03));
}

.config-advanced-entry__copy {
  display: grid;
  gap: 5px;
}

.config-advanced-entry__eyebrow {
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.config-advanced-entry__copy strong {
  color: var(--text);
  font-size: 15px;
}

.config-advanced-entry__copy p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.config-active-tab-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.config-active-tab-fact {
  display: grid;
  gap: 4px;
  padding: 12px 13px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.06);
}

.config-active-tab-fact span {
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.config-active-tab-fact strong {
  color: var(--text);
  font-size: 14px;
  line-height: 1.45;
  word-break: break-word;
}

.config-save-dock {
  position: sticky;
  bottom: 16px;
  z-index: 12;
  display: grid;
  grid-template-areas:
    "status actions"
    "changes actions";
  grid-template-columns: minmax(240px, 1fr) auto;
  align-items: center;
  gap: 10px 14px;
  width: min(780px, calc(100% - 8px));
  margin: 6px 0 0 auto;
  padding: 13px;
  border: 1px solid color-mix(in srgb, var(--line-strong) 72%, var(--modal-border));
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--modal-panel-bg-strong) 92%, var(--acc) 8%), var(--modal-panel-bg));
  box-shadow:
    0 18px 48px color-mix(in srgb, black 24%, transparent),
    0 2px 10px color-mix(in srgb, black 10%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
  isolation: isolate;
}

.config-save-dock.is-dirty {
  border-color: color-mix(in srgb, var(--acc) 48%, var(--line-strong));
  background:
    radial-gradient(220px 80px at 0% 0%, color-mix(in srgb, var(--acc) 16%, transparent), transparent 72%),
    linear-gradient(180deg, color-mix(in srgb, var(--modal-panel-bg-strong) 88%, var(--acc) 12%), var(--modal-panel-bg));
  box-shadow:
    0 20px 54px color-mix(in srgb, black 26%, transparent),
    0 0 0 1px color-mix(in srgb, var(--acc) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent);
}

.config-save-dock.is-saved {
  border-color: color-mix(in srgb, #26d69a 55%, var(--line-strong));
  background:
    radial-gradient(240px 90px at 0% 0%, color-mix(in srgb, #26d69a 18%, transparent), transparent 72%),
    linear-gradient(180deg, color-mix(in srgb, var(--modal-panel-bg-strong) 90%, #26d69a 10%), var(--modal-panel-bg));
  box-shadow:
    0 20px 54px color-mix(in srgb, black 24%, transparent),
    0 0 0 1px color-mix(in srgb, #26d69a 24%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent);
}

.config-save-dock__status {
  grid-area: status;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}

.config-save-dock__indicator {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--muted-soft);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--muted-soft) 12%, transparent);
}

.config-save-dock__indicator.active {
  background: var(--acc);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--acc) 16%, transparent);
}

.config-save-dock__indicator.saved {
  background: #26d69a;
  box-shadow:
    0 0 0 4px color-mix(in srgb, #26d69a 18%, transparent),
    0 0 18px color-mix(in srgb, #26d69a 44%, transparent);
}

.config-save-dock__status strong {
  color: var(--text);
  font-size: 14px;
  line-height: 1.35;
}

.config-save-dock__status p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.config-save-dock__changes,
.config-save-dock__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.config-save-dock__changes {
  grid-area: changes;
  justify-content: flex-start;
}

.config-save-dock__actions {
  grid-area: actions;
  justify-content: flex-end;
  padding-left: 4px;
}

.config-save-dock__saved-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, #26d69a 38%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, #26d69a 13%, var(--modal-panel-bg));
  color: color-mix(in srgb, #26d69a 78%, var(--text));
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.primary-button.is-saved {
  border-color: color-mix(in srgb, #26d69a 62%, var(--acc-strong));
  background:
    linear-gradient(135deg, color-mix(in srgb, #26d69a 92%, #ffffff 8%), color-mix(in srgb, #12a876 82%, #07111f 18%));
  color: #04120d;
  box-shadow:
    0 12px 26px color-mix(in srgb, #26d69a 24%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 32%, transparent);
}

.config-change-chip {
  display: inline-flex;
  align-items: center;
  max-width: 140px;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--acc) 32%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--acc) 12%, transparent);
  color: var(--text);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-change-chip.muted {
  border-color: var(--line);
  background: color-mix(in srgb, var(--surface-base) 90%, transparent);
  color: var(--muted);
}

.config-page-shell :deep(.config-sheet) {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03));
}

.config-page-shell :deep(.config-sheet > .config-block) {
  padding: 20px 20px 22px;
}

.config-page-shell :deep(.config-sheet > .config-block + .config-block) {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.config-page-shell :deep(.config-subsection) {
  border-radius: 10px;
}

.config-page-shell :deep(.config-subsection-head h4) {
  font-size: 15px;
}

.config-core-baseline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.config-core-baseline__item,
.config-guard-summary {
  display: grid;
  gap: 4px;
  padding: 12px 13px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.05);
}

.config-core-baseline__item span,
.config-guard-summary span {
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.config-core-baseline__item strong,
.config-guard-summary strong {
  color: var(--text);
  font-size: 14px;
}

.config-core-baseline__item p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.config-core-hint {
  margin: 0;
}

.config-guard-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.config-advanced-sheet-layout {
  display: grid;
  gap: 16px;
}

.config-advanced-sheet-block {
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.025));
}

.config-advanced-sheet-block + .config-advanced-sheet-block {
  border-top: 1px solid var(--line);
}

.config-advanced-sheet-block :deep(.config-subsection-grid) {
  gap: 14px;
}

@media (max-width: 1180px) {
  .config-overview-ribbon,
  .config-active-tab-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .config-core-baseline,
  .config-guard-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .config-save-dock {
    width: min(680px, 100%);
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "status"
      "changes"
      "actions";
  }

  .config-save-dock__changes,
  .config-save-dock__actions {
    justify-content: flex-start;
  }

  .config-page-shell .config-workbench {
    grid-template-columns: 1fr;
  }

  .config-page-shell .config-sidebar {
    position: static;
  }
}

@media (max-width: 720px) {
  .config-overview-ribbon,
  .config-active-tab-facts,
  .config-core-baseline,
  .config-guard-summary-grid {
    grid-template-columns: 1fr;
  }

  .config-advanced-entry {
    flex-direction: column;
    align-items: stretch;
  }

  .config-save-dock {
    bottom: max(8px, env(safe-area-inset-bottom, 0px));
    width: 100%;
    padding: 10px;
    border-radius: 15px;
  }

  .config-save-dock__actions .compact-button {
    flex: 1 1 140px;
  }
}
</style>
