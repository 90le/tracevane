<template>
  <section class="page-shell codex-stack-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">{{ text("CODEX STACK", "CODEX STACK") }}</p>
        <h2 class="page-title">{{ text("Codex Stack 管理中心", "Codex Stack Management Center") }}</h2>
        <p class="cs-page-subtitle">
          {{ text("按“状态判断 → 安装修复 → 模型上游 → Agent 管理 → 日志诊断”的顺序管理 codex-docs 服务。Studio 只做控制面，服务本身保持 systemd 独立运行。", "Manage codex-docs through status, install/repair, model upstreams, agent management, and diagnostics. Studio stays the control plane while services keep running independently under systemd.") }}
        </p>
      </div>
      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="loading || ccConnectLoading" @click="loadAll">
          {{ loading ? text("刷新中...", "Refreshing...") : text("刷新状态", "Refresh") }}
        </button>
      </div>
    </header>

    <div
      v-if="notice"
      class="status-banner"
      :class="notice.kind === 'error' ? 'status-banner-error' : 'status-banner-success'"
    >
      {{ notice.text }}
    </div>

    <section v-if="summary && !summary.management.enabled" class="panel-card cs-lock-card">
      <div>
        <h3>{{ text("管理动作未启用", "Management actions are disabled") }}</h3>
        <p>
          {{ text("安装、修复、保存配置和服务控制需要显式启用。", "Install, repair, config writes, and service control require explicit enablement.") }}
        </p>
      </div>
      <button type="button" class="primary-button" :disabled="busy" @click="enableManagement">
        {{ text("启用管理", "Enable Management") }}
      </button>
    </section>

    <div v-if="!summary" class="panel-card cs-empty">
      {{ text("正在读取 Codex 栈状态...", "Loading Codex Stack status...") }}
    </div>

    <template v-else>
      <CodexStackJobBanner
        v-if="activeJob"
        :title="activeJobTitle"
        :command-label="activeJob.commandLabel"
        :status="activeJob.status"
        :status-label="jobStatusLabel(activeJob.status)"
        :updated-at-label="formatTimestamp(activeJob.updatedAt)"
        :running="isCodexStackJobRunning(activeJob)"
        @open-logs="activeSection = 'logs'"
        @dismiss="activeJob = null"
      />

      <article class="panel-card cs-model-ribbon">
        <div>
          <p class="cs-section-kicker">{{ text("模型目录", "Model Catalog") }}</p>
          <h3>{{ summary.models.current || summary.profile.defaultModel || "--" }}</h3>
          <p>{{ modelSourceHelp }}</p>
        </div>
        <div class="cs-model-ribbon-side">
          <span class="cs-status-pill" :class="`tone-${modelSourceTone}`">{{ modelSourceLabel }}</span>
          <span class="cs-info-chip">{{ text("可选模型", "Available models") }} {{ modelOptions.length }}</span>
          <span class="cs-info-chip">{{ text("上下文", "Context") }} {{ contextTokensDisplay }}</span>
          <button type="button" class="secondary-button" :disabled="loading" @click="loadSummary">
            {{ text("刷新模型列表", "Refresh Models") }}
          </button>
        </div>
      </article>

      <div class="cs-workspace">
        <aside class="cs-sidebar">
          <button
            v-for="section in navSections"
            :key="section.id"
            type="button"
            class="cs-nav-button"
            :class="{ 'cs-nav-button-active': activeSection === section.id }"
            @click="activeSection = section.id"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path :d="section.icon" />
            </svg>
            <span>{{ section.label }}</span>
          </button>
        </aside>

        <div class="cs-content">
          <template v-if="activeSection === 'dashboard'">
            <section class="cs-section-stack">
              <article class="panel-card cs-hero-card">
                <div class="cs-hero-copy">
                  <p class="cs-section-kicker">{{ text("概览", "Dashboard") }}</p>
                  <div class="cs-hero-title-row">
                    <h3>{{ statusLabel }}</h3>
                    <span class="cs-status-pill" :class="`tone-${statusTone}`">{{ statusLabel }}</span>
                  </div>
                  <p class="cs-hero-description">
                    {{ text("先看当前状态，再按建议执行安装、修复或配置。CPA、Compact、cc-connect 与 watchdog 由 systemd 托管，Studio 负责观测与操作入口。", "Start from the current state, then follow suggested install, repair, or config actions. CPA, Compact, cc-connect, and watchdog are managed by systemd; Studio provides the control surface.") }}
                  </p>
                  <div class="cs-chip-row">
                    <span class="cs-info-chip">
                      {{ text("在线服务", "Active services") }} {{ activeServiceCount }}/{{ summary.services.length }}
                    </span>
                    <span class="cs-info-chip">
                      {{ text("当前模型", "Current model") }} {{ summary.models.current || "--" }}
                    </span>
                    <span class="cs-info-chip">
                      {{ text("Codex 上下文", "Codex context") }} {{ contextTokensDisplay }}
                    </span>
                    <span class="cs-info-chip">
                      {{ text("安装渠道", "Channel") }} {{ channelLabel(summary.installer.channel) }}
                    </span>
                    <span class="cs-info-chip">
                      {{ text("检查时间", "Checked") }} {{ formatTimestamp(summary.checkedAt) }}
                    </span>
                  </div>
                </div>
                <div class="cs-hero-actions">
                  <button type="button" class="primary-button" :disabled="busy" @click="runCheck">
                    {{ text("运行健康检查", "Run Health Check") }}
                  </button>
                  <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="repairRecommended">
                    {{ text("自动修复", "Auto Repair") }}
                  </button>
                  <button type="button" class="secondary-button" :disabled="loading || ccConnectLoading" @click="loadAll">
                    {{ text("重新同步", "Sync Now") }}
                  </button>
                </div>
              </article>

              <CodexStackChainMap
                :labels="chainMapLabels"
                :overall-tone="statusTone"
                :nodes="chainNodes"
                :gates="chainGates"
                :warnings="chainWarnings"
              />

              <CodexStackRunReadinessPanel
                v-if="summary.runReadiness"
                :readiness="summary.runReadiness"
                :tone="runReadinessTone"
                @check-action="runReadinessCheckAction"
              />

              <CodexStackActionOverview
                :ready-component-count="readyComponentCount"
                :component-count="summary.components.length"
                :issue-count="issueCount"
                :readiness-percent="readinessPercent"
                :next-action-title="nextActionTitle"
                :next-action-copy="nextActionCopy"
                :next-action-button="nextActionButton"
                :next-action-requires-mutation="nextActionRequiresMutation"
                :can-run-mutation="canRunMutation"
                :busy="busy"
                :model-source-label="modelSourceLabel"
                :model-source-help="modelSourceHelp"
                :model-catalog-preview="modelCatalogPreview"
                @primary="nextActionPrimary"
                @open-section="activeSection = nextActionSection"
              />

              <CodexStackServiceGrid
                :services="serviceCards"
                :can-run-mutation="canRunMutation"
                :labels="serviceGridLabels"
                @service-action="serviceAction"
              />

              <CodexStackDashboardInsights
                :labels="dashboardInsightsLabels"
                :runtime-rows="runtimeSummaryRows"
                :network-policy="networkPolicyCard"
                :smoke-matrix="smokeMatrixCard"
                :components="componentHealthCards"
              />

              <CodexStackDiagnosticsPanel
                :output="checkOutput"
                :warnings="summary.warnings"
                :busy="busy"
                @run-check="runCheck"
              />
            </section>
          </template>

          <template v-else-if="activeSection === 'install'">
            <section class="cs-section-stack">
              <article class="panel-card cs-section-intro">
                <div>
                  <p class="cs-section-kicker">{{ text("安装", "Install") }}</p>
                  <h3>{{ text("安装/修复指挥台", "Install/Repair Command Center") }}</h3>
                  <p class="cs-section-copy">
                    {{ text("安装页按“计划确认、组件策略、执行进度、修复手册”组织。用户能先看清会改什么，再决定完整安装、基础安装或只修复。", "This page is organized as plan confirmation, component strategy, progress tracking, and repair playbook. Users can see what will change before choosing full install, base install, or repair-only.") }}
                  </p>
                </div>
              </article>

              <CodexStackInstallPlanCard
                :highlights="installPlanHighlights"
                :can-run-mutation="canRunMutation"
                @install-full="installFullStack"
                @install-base="installBaseOnly"
                @repair="repairRecommended"
              />

              <div class="cs-install-shell" :class="{ 'cs-install-shell-busy': activeJob && isCodexStackJobRunning(activeJob) }">
                <CodexStackJobProgressPanel
                  v-if="activeJob"
                  :job="activeJob"
                  :title="activeJobTitle"
                  :status-label="jobStatusLabel(activeJob.status)"
                  :steps="jobProgressSteps"
                  :progress-percent="jobProgressPercent"
                  :running="isCodexStackJobRunning(activeJob)"
                  :empty-log="text('等待输出...', 'Waiting for output...')"
                  @dismiss="activeJob = null"
                />

                <CodexStackInstallConfigPanel
                  :form="installForm"
                  :model-options="modelOptions"
                  :model-source-label="modelSourceLabel"
                  :context-tokens-disabled="installContextTokensDisabled"
                  @update-field="updateInstallFormField"
                />

                <CodexStackInstallStrategyPanel
                  :components="installComponentStrategies"
                  :can-run-mutation="canRunMutation"
                  @set-component-mode="setComponentMode"
                  @install-full="installFullStack"
                  @install-base="installBaseOnly"
                  @repair="repairRecommended"
                />

                <CodexStackRepairBoard
                  :can-run-mutation="canRunMutation"
                  :can-attach-codex-cpa="canAttachCodexCpa"
                  :attach-codex-cpa-help="attachCodexCpaHelp"
                  @repair-recommended="repairRecommended"
                  @repair-conflicts="repairConflictingUnits"
                  @repair-config-only="repairConfigOnly"
                  @pause-stack="pauseStack"
                  @resume-stack="resumeStack"
                  @run-smoke-matrix="runSmokeMatrix"
                  @attach-codex-cpa="applyCodexCpaAfterSmoke"
                />

              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'cc-connect'">
            <section class="cs-section-stack">
              <article class="panel-card cs-section-intro">
                <div>
                  <p class="cs-section-kicker">cc-connect</p>
                  <h3>{{ text("Agent 工作台", "Agent Workbench") }}</h3>
                  <p class="cs-section-copy">
                    {{ text("项目、Provider、平台绑定和原始 TOML 分区管理。先选项目，再编辑 Agent 参数和渠道，避免多 Agent、多渠道配置挤在同一张表里。", "Projects, providers, platform binding, and raw TOML are separated. Pick a project first, then edit agent options and channels without crowding every multi-agent field into one table.") }}
                  </p>
                </div>
                <div class="cs-chip-row">
                  <span class="cs-info-chip">{{ text("已安装", "Installed") }} {{ yesNo(summary.ccConnect.installed) }}</span>
                  <span class="cs-info-chip">{{ text("已配置", "Configured") }} {{ yesNo(summary.ccConnect.configured) }}</span>
                  <span class="cs-info-chip">{{ text("已绑定", "Binding") }} {{ yesNo(summary.ccConnect.bindingPresent) }}</span>
                  <span class="cs-info-chip">{{ text("收尾脚本", "Finalizer") }} {{ yesNo(summary.ccConnect.finalizerAvailable) }}</span>
                  <span class="cs-info-chip">{{ text("项目", "Project") }} {{ primaryCcConnectProjectName }}</span>
                  <span class="cs-info-chip">Provider {{ ccConnectProviderDraftCount }}</span>
                  <span class="cs-info-chip">{{ text("项目数", "Projects") }} {{ ccConnectProjectDraftCount }}</span>
                </div>
              </article>

              <article class="panel-card cs-config-action-strip cs-agent-savebar">
                <div>
                  <p class="cs-section-kicker">{{ text("保存与应用", "Save and Apply") }}</p>
                  <h4>{{ text("配置保存入口固定在顶部", "Config Save Actions Stay Pinned") }}</h4>
                  <p>
                    {{ text("可视化配置负责 Provider、项目和平台；原始 TOML 负责高级字段。保存后如服务运行会自动重启。", "Visual config owns providers, projects, and platforms; raw TOML owns advanced fields. Saving restarts the service when it is running.") }}
                  </p>
                </div>
                <div class="cs-actions">
                  <span class="cs-status-pill" :class="hasCcConnectStructuredChanges ? 'tone-accent' : 'tone-sage'">
                    {{ hasCcConnectStructuredChanges ? text("可视化有修改", "Visual unsaved") : text("可视化已同步", "Visual synced") }}
                  </span>
                  <span class="cs-status-pill" :class="hasCcConnectRawChanges ? 'tone-accent' : 'tone-sage'">
                    {{ hasCcConnectRawChanges ? text("TOML 有修改", "TOML unsaved") : text("TOML 已同步", "TOML synced") }}
                  </span>
                  <button
                    type="button"
                    class="primary-button"
                    :disabled="!canRunMutation || !hasCcConnectStructuredChanges"
                    @click="saveCcConnectStructured"
                  >
                    {{ text("保存可视化配置", "Save Visual Config") }}
                  </button>
                  <button
                    type="button"
                    class="secondary-button"
                    :disabled="!canRunMutation || !hasCcConnectRawChanges"
                    @click="saveCcConnectRaw"
                  >
                    {{ text("保存 TOML", "Save TOML") }}
                  </button>
                </div>
              </article>

              <div class="cs-agent-workbench">
                <aside class="panel-card cs-agent-rail">
                  <div class="cs-agent-pane-switch">
                    <button
                      v-for="pane in agentPanes"
                      :key="pane.id"
                      type="button"
                      class="cs-agent-pane-button"
                      :class="{ 'cs-agent-pane-button-active': activeAgentPane === pane.id }"
                      @click="activeAgentPane = pane.id"
                    >
                      {{ pane.label }}
                    </button>
                  </div>
                  <div class="cs-agent-project-rail">
                    <div class="cs-agent-rail-head">
                      <strong>{{ text("项目列表", "Projects") }}</strong>
                      <button type="button" class="text-button" :disabled="busy" @click="addCcConnectProject">
                        {{ text("新增", "Add") }}
                      </button>
                    </div>
                    <button
                      v-for="project in ccConnectProjectDrafts"
                      :key="project.id"
                      type="button"
                      class="cs-agent-project-pill"
                      :class="{ 'cs-agent-project-pill-active': selectedProjectDraft?.id === project.id }"
                      @click="selectCcConnectProject(project.id)"
                    >
                      <strong>{{ project.name || text("未命名项目", "Unnamed Project") }}</strong>
                      <span>{{ project.agentOptions.model || "--" }} · {{ project.platforms.length }} {{ text("渠道", "channels") }}</span>
                    </button>
                  </div>
                </aside>

                <section class="panel-card cs-agent-stage">
                  <template v-if="activeAgentPane === 'projects'">
                    <div class="cs-card-header">
                      <div>
                        <p class="cs-section-kicker">{{ text("Agent 项目", "Agent Projects") }}</p>
                        <h4>{{ selectedProjectDraft?.name || text("选择或创建项目", "Select or Create a Project") }}</h4>
                        <p class="cs-field-hint">{{ selectedProjectSummary }}</p>
                      </div>
                      <div class="cs-actions">
                        <button type="button" class="secondary-button" :disabled="busy" @click="applyDefaultModelToCcConnectProjects">
                          {{ text("同步默认模型到全部项目", "Sync Default Model to All") }}
                        </button>
                        <button
                          v-if="selectedProjectDraft"
                          type="button"
                          class="text-button danger-text"
                          :disabled="busy"
                          @click="removeCcConnectProject(selectedProjectDraft.id)"
                        >
                          {{ text("删除当前项目", "Delete Current Project") }}
                        </button>
                      </div>
                    </div>
                    <div class="cs-agent-template-row">
                      <article v-for="preset in projectPresetCards" :key="preset.id" class="cs-agent-template-card">
                        <div>
                          <strong>{{ preset.label }}</strong>
                          <p>{{ preset.copy }}</p>
                        </div>
                        <button type="button" class="secondary-button" :disabled="busy" @click="addCcConnectProjectPreset(preset.id)">
                          {{ preset.action }}
                        </button>
                      </article>
                    </div>
                    <div v-if="ccConnectLoading && !ccConnectConfig" class="cs-empty-lite">
                      {{ text("正在读取项目配置...", "Loading project config...") }}
                    </div>
                    <div v-else-if="!selectedProjectDraft" class="cs-empty-lite">
                      <p>{{ text("当前配置没有 projects。新增项目后选择工作目录、模型和平台即可。", "No projects are declared. Add a project, then choose work directory, model, and platforms.") }}</p>
                      <button type="button" class="secondary-button" :disabled="busy" @click="addCcConnectProject">
                        {{ text("创建第一个项目", "Create First Project") }}
                      </button>
                    </div>
                    <div v-else class="cs-agent-editor-grid">
                      <section class="cs-agent-editor-main">
                        <div class="cs-form-grid cs-project-meta">
                          <label class="form-field">
                            <span class="form-label">{{ text("项目名", "Project Name") }}</span>
                            <input v-model="selectedProjectDraft.name" class="form-input" placeholder="main" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text("Agent 类型", "Agent Type") }}</span>
                            <input v-model="selectedProjectDraft.agentType" class="form-input" placeholder="codex" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text("模式", "Mode") }}</span>
                            <select v-model="selectedProjectDraft.agentOptions.mode" class="form-input">
                              <option value="suggest">suggest</option>
                              <option value="yolo">yolo</option>
                              <option value="read-only">read-only</option>
                            </select>
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text("模型", "Model") }}</span>
                            <select v-model="selectedProjectDraft.agentOptions.model" class="form-input">
                              <option v-for="model in modelOptions" :key="`${selectedProjectDraft.id}-${model}`" :value="model">{{ model }}</option>
                            </select>
                            <span class="form-help">{{ text("模型列表来自 CPA /v1/models。", "Model list comes from CPA /v1/models.") }}</span>
                          </label>
                          <label class="form-field cs-form-span-2">
                            <span class="form-label">{{ text("工作目录", "Work Directory") }}</span>
                            <input v-model="selectedProjectDraft.agentOptions.workDir" class="form-input" placeholder="/home/user/.openclaw" />
                          </label>
                          <label class="form-field cs-form-span-2">
                            <span class="form-label">{{ text("管理员来源", "Admin From") }}</span>
                            <textarea
                              v-model="selectedProjectDraft.adminFrom"
                              class="form-input cs-inline-textarea"
                              :placeholder="text('多个来源用逗号分隔；留空会禁用管理命令', 'Comma-separated sources; leave empty to disable privileged commands')"
                            />
                          </label>
                        </div>
                      </section>
                      <aside class="cs-agent-editor-side">
                        <p class="cs-section-kicker">{{ text("渠道预览", "Channel Preview") }}</p>
                        <div class="cs-platform-badges">
                          <span v-for="platform in selectedProjectDraft.platforms" :key="platform.id" class="cs-chip">
                            {{ platform.type || text("未命名平台", "Unnamed Platform") }}
                          </span>
                          <span v-if="!selectedProjectDraft.platforms.length" class="cs-chip">
                            {{ text("暂无平台", "No Platforms") }}
                          </span>
                        </div>
                        <p class="cs-field-hint">
                          {{ text("一个项目可以绑定多个平台。DMWork 通常手填 token，Feishu/Weixin 建议先保存项目再执行 setup。", "One project can bind multiple platforms. DMWork usually uses token fields; Feishu/Weixin should be saved before setup.") }}
                        </p>
                      </aside>
                    </div>

                    <div v-if="selectedProjectDraft" class="cs-subsection-header cs-subsection-header-tight">
                      <div>
                        <strong>{{ text("平台渠道", "Platform Channels") }}</strong>
                        <p>{{ text("平台参数单独成卡片，避免和 Agent 基础参数挤在一起。", "Platform options are isolated cards instead of being crowded with base agent fields.") }}</p>
                      </div>
                      <div class="cs-platform-template-actions">
                        <button
                          v-for="template in platformTemplates"
                          :key="template.id"
                          type="button"
                          class="secondary-button"
                          :disabled="busy"
                          :title="template.copy"
                          @click="addPlatformToSelectedProject(template.id)"
                        >
                          {{ text("新增", "Add") }} {{ template.label }}
                        </button>
                      </div>
                    </div>
                    <div v-if="selectedProjectDraft" class="cs-platform-grid cs-platform-grid-roomy">
                      <article
                        v-for="platform in selectedProjectDraft.platforms"
                        :key="platform.id"
                        class="cs-platform-card"
                      >
                        <div class="cs-platform-head">
                          <strong>{{ platform.type || text("未命名平台", "Unnamed Platform") }}</strong>
                          <button type="button" class="text-button danger-text" :disabled="busy" @click="removePlatformFromSelectedProject(platform.id)">
                            {{ text("删除平台", "Delete Platform") }}
                          </button>
                        </div>
                        <label class="form-field">
                          <span class="form-label">type</span>
                          <input v-model="platform.type" class="form-input" list="cc-platform-options" placeholder="octo" />
                        </label>
                        <div class="cs-option-list">
                          <div v-for="row in platform.optionRows" :key="row.id" class="cs-option-row">
                            <input v-model="row.key" class="form-input" placeholder="key" />
                            <input
                              v-model="row.value"
                              class="form-input"
                              :type="isSensitiveKey(row.key) ? 'password' : 'text'"
                              placeholder="value"
                            />
                            <button type="button" class="text-button danger-text" :disabled="busy" @click="removeCcConnectPlatformOption(platform, row.id)">
                              {{ text("删除", "Delete") }}
                            </button>
                          </div>
                          <button type="button" class="secondary-button" :disabled="busy" @click="addCcConnectPlatformOption(platform)">
                            {{ text("新增参数", "Add Option") }}
                          </button>
                        </div>
                      </article>
                    </div>
                  </template>

                  <template v-else-if="activeAgentPane === 'providers'">
                    <div class="cs-card-header">
                      <div>
                        <p class="cs-section-kicker">{{ text("Provider", "Provider") }}</p>
                        <h4>{{ text("上游 Provider 可视化编辑", "Visual Upstream Provider Editor") }}</h4>
                        <p class="cs-field-hint">
                          {{ text("cc-connect 通常不需要单独配置上游，推荐统一指向本地 Compact Proxy。", "cc-connect usually does not need a separate upstream; point providers to the local Compact Proxy.") }}
                        </p>
                      </div>
                      <div class="cs-actions">
                        <label class="cs-language-field">
                          <span>{{ text("语言", "Language") }}</span>
                          <input v-model="ccConnectLanguageDraft" class="form-input" placeholder="zh" />
                        </label>
                        <button type="button" class="secondary-button" :disabled="busy" @click="ensureCpaProviderDraft">
                          {{ text("补齐 CPA Provider", "Add CPA Provider") }}
                        </button>
                        <button type="button" class="secondary-button" :disabled="busy" @click="addCcConnectProvider">
                          {{ text("新增 Provider", "Add Provider") }}
                        </button>
                      </div>
                    </div>
                    <div v-if="ccConnectLoading && !ccConnectConfig" class="cs-empty-lite">
                      {{ text("正在读取 cc-connect 配置...", "Loading cc-connect config...") }}
                    </div>
                    <div v-else-if="!ccConnectProviderDrafts.length" class="cs-empty-lite">
                      <p>
                        {{ text("当前配置没有 providers。cc-connect 可以依赖环境变量运行，但建议显式新增 cpa provider，指向本地 Compact Proxy。", "No providers are declared. cc-connect can rely on environment variables, but adding an explicit cpa provider pointing to the local Compact Proxy is recommended.") }}
                      </p>
                      <button type="button" class="secondary-button" :disabled="busy" @click="ensureCpaProviderDraft">
                        {{ text("创建推荐 Provider", "Create Recommended Provider") }}
                      </button>
                    </div>
                    <div v-else class="cs-provider-grid cs-provider-grid-roomy">
                      <article
                        v-for="provider in ccConnectProviderDrafts"
                        :key="provider.id"
                        class="cs-provider-card"
                      >
                        <div class="cs-provider-head">
                          <strong>{{ provider.name || text("未命名 Provider", "Unnamed Provider") }}</strong>
                          <button type="button" class="text-button danger-text" :disabled="busy" @click="removeCcConnectProvider(provider.id)">
                            {{ text("删除", "Delete") }}
                          </button>
                        </div>
                        <div class="cs-form-grid cs-form-grid-compact">
                          <label class="form-field">
                            <span class="form-label">name</span>
                            <input v-model="provider.name" class="form-input" placeholder="cpa" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">codex.env_key</span>
                            <input v-model="provider.codexEnvKey" class="form-input" placeholder="OPENAI_API_KEY" />
                          </label>
                          <label class="form-field cs-form-span-2">
                            <span class="form-label">base_url</span>
                            <input v-model="provider.baseUrl" class="form-input" :placeholder="compactProxyBaseUrl" />
                          </label>
                          <label class="form-field cs-form-span-2">
                            <span class="form-label">api_key</span>
                            <input
                              v-model="provider.apiKey"
                              class="form-input"
                              type="password"
                              :placeholder="text('留空表示不写入或保留空值', 'Leave empty to write/keep an empty value')"
                            />
                          </label>
                        </div>
                      </article>
                    </div>
                  </template>

                  <template v-else-if="activeAgentPane === 'setup'">
                    <div class="cs-card-header">
                      <div>
                        <p class="cs-section-kicker">{{ text("绑定与动作", "Setup and Actions") }}</p>
                        <h4>{{ text("快速绑定命令", "Quick Setup Commands") }}</h4>
                      </div>
                    </div>
                    <p class="cs-field-hint">
                      {{ text("保存 TOML 后，如果 cc-connect.service 正在运行会自动重启。绑定完成后可直接执行 finalizer。", "Saving TOML restarts cc-connect.service if it is running. After binding, you can immediately run the finalizer.") }}
                    </p>
                    <div class="cs-actions cs-actions-wrap">
                      <button type="button" class="secondary-button" :disabled="busy" @click="copySetupCommand('feishu')">
                        {{ text("复制 Feishu Setup", "Copy Feishu Setup") }}
                      </button>
                      <button type="button" class="secondary-button" :disabled="busy" @click="copySetupCommand('weixin')">
                        {{ text("复制 Weixin Setup", "Copy Weixin Setup") }}
                      </button>
                      <button
                        v-if="summary.ccConnect.canFinalize"
                        type="button"
                        class="primary-button"
                        :disabled="!canRunMutation"
                        @click="finalizeCcConnect"
                      >
                        {{ text("完成 cc-connect 安装", "Finalize cc-connect") }}
                      </button>
                    </div>
                    <pre class="cs-code">{{ ccConnectSetupCommands.join("\n") }}</pre>
                  </template>

                  <template v-else>
                    <div class="cs-card-header">
                      <div>
                        <p class="cs-section-kicker">{{ text("原始配置", "Raw Config") }}</p>
                        <h4>{{ text("TOML 编辑器", "TOML Editor") }}</h4>
                      </div>
                    </div>
                    <textarea
                      v-model="ccConnectRawDraft"
                      class="cs-raw-editor"
                      spellcheck="false"
                      :placeholder="text('cc-connect TOML 会显示在这里。', 'The cc-connect TOML will appear here.')"
                    />
                    <div class="cs-actions">
                      <button
                        type="button"
                        class="primary-button"
                        :disabled="!canRunMutation || !hasCcConnectRawChanges"
                        @click="saveCcConnectRaw"
                      >
                        {{ text("保存 TOML 配置", "Save TOML Config") }}
                      </button>
                    </div>
                  </template>
                </section>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'settings'">
            <section class="cs-section-stack">
              <article class="panel-card cs-section-intro">
                <div>
                  <p class="cs-section-kicker">{{ text("模型与上游", "Models and Upstreams") }}</p>
                  <h3>{{ text("统一模型、端口与上游配置", "Unified Model, Port, and Upstream Config") }}</h3>
                  <p class="cs-section-copy">
                    {{ text("这里是所有模型选择器的来源。优先读取本地 Compact /v1/models；不可达时显示配置回退列表。cc-connect Provider 推荐统一指向本地 Compact。", "This is the source for every model selector. It prefers local Compact /v1/models and falls back to parsed config when unavailable. cc-connect providers should point to local Compact.") }}
                  </p>
                </div>
                <div class="cs-chip-row">
                  <span class="cs-status-pill" :class="`tone-${modelSourceTone}`">{{ modelSourceLabel }}</span>
                  <span class="cs-info-chip">{{ summary.models.endpoint }}</span>
                </div>
              </article>

              <article class="panel-card cs-model-catalog-card">
                <div class="cs-card-header">
                  <div>
                    <p class="cs-section-kicker">{{ text("CPA 模型列表", "CPA Model List") }}</p>
                    <h4>{{ text("从 /v1/models 读取的可用模型", "Models discovered from /v1/models") }}</h4>
                  </div>
                  <button type="button" class="secondary-button" :disabled="loading" @click="loadSummary">
                    {{ text("重新读取", "Reload") }}
                  </button>
                </div>
                <p class="cs-field-hint">{{ modelSourceHelp }}</p>
                <div class="cs-model-list">
                  <span v-for="model in modelOptions" :key="`catalog-${model}`" :class="{ 'cs-model-current': model === summary.models.current }">
                    {{ model }}
                  </span>
                </div>
              </article>

              <CodexStackUpstreamMap
                :default-model="configForm.defaultModel || summary.models.current || '--'"
                :compact-proxy-base-url="compactProxyBaseUrl"
                :provider-name="canonicalCcConnectProvider.name"
                :provider-base-url="canonicalCcConnectProvider.baseUrl"
                :provider-model="canonicalCcConnectProvider.model"
              />

              <div class="cs-dashboard-grid">
                <CodexStackRuntimeConfigCard
                  :form="configForm"
                  :model-options="modelOptions"
                  :context-tokens-disabled="configContextTokensDisabled"
                  :restart-required-units="restartRequiredUnits"
                  :can-run-mutation="canRunMutation"
                  :has-changes="hasConfigPatchChanges"
                  @update-field="updateConfigFormField"
                  @save="saveConfigPatch"
                />

                <article class="panel-card">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("参考信息", "Reference") }}</p>
                      <h4>{{ text("环境与安装器信息", "Environment and Installer Info") }}</h4>
                    </div>
                  </div>
                  <div class="cs-kv-list">
                    <div class="cs-kv-row">
                      <span>{{ text("Home 目录", "Home Directory") }}</span>
                      <code>{{ summary.homeDir }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("Profile 路径", "Profile Path") }}</span>
                      <code>{{ summary.profilePath }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("安装器根目录", "Installer Root") }}</span>
                      <code>{{ summary.installer.root || "--" }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("来源类型", "Source Kind") }}</span>
                      <code>{{ summary.installer.kind }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("自动安装脚本", "Auto Setup") }}</span>
                      <code>{{ summary.installer.scripts.autoSetup || "--" }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("健康检查脚本", "Health Check") }}</span>
                      <code>{{ summary.installer.scripts.healthCheck || "--" }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("收尾脚本", "Finalizer") }}</span>
                      <code>{{ summary.installer.scripts.ccConnectFinalizer || "--" }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("代理密钥", "Proxy Key") }}</span>
                      <code>{{ summary.secrets.cpaProxyKey.masked || text("未设置", "Not set") }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("Codex auth.json", "Codex auth.json") }}</span>
                      <code>{{ summary.secrets.codexAuth.hasSecret ? (summary.secrets.codexAuth.matchesProxyKey ? "ok" : "mismatch") : text("缺失", "Missing") }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("上下文", "Context") }}</span>
                      <code>{{ summary.context.mode }} · {{ contextTokensDisplay }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("CPA 看板", "CPA Dashboard") }}</span>
                      <code>{{ summary.cpaManagement.controlPanelEnabled ? summary.cpaManagement.dashboardUrl : text("未启用", "Disabled") }}</code>
                    </div>
                  </div>
                  <div v-if="summary.installer.missingFiles.length" class="cs-warning-list">
                    <div v-for="missingFile in summary.installer.missingFiles" :key="missingFile" class="cs-warning-row">
                      <span class="cs-warning-icon">!</span>
                      <span>{{ missingFile }}</span>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </template>

          <template v-else-if="activeSection === 'logs'">
            <section class="cs-section-stack">
              <article class="panel-card cs-section-intro">
                <div>
                  <p class="cs-section-kicker">{{ text("日志", "Logs") }}</p>
                  <h3>{{ text("服务日志与任务输出预览", "Service Logs and Job Output Preview") }}</h3>
                  <p class="cs-section-copy">
                    {{ text("日志读取默认轻量预览，必要时再切到完整上下文。自动刷新默认关闭，避免大日志拖慢页面。", "Log reads default to lightweight preview. Switch to deeper context only when needed. Auto-refresh is off by default to avoid large logs slowing the page.") }}
                  </p>
                </div>
              </article>

              <CodexStackLogConsole
                v-model:selected-service="selectedLogService"
                v-model:mode="logLineMode"
                v-model:auto-refresh="logAutoRefresh"
                :services="logServices"
                :options="logLineOptions"
                :mode-help="logModeHelp"
                :requested-lines="logLineLimit"
                :meta="logMeta"
                :fetched-at-label="logFetchedAtLabel"
                :output="logOutput"
                :refreshing="logRefreshing"
                :labels="logConsoleLabels"
                @load="loadLogs"
              />

              <CodexStackJobOutputCard
                v-if="activeJob"
                :job="activeJob"
                :title="activeJobTitle"
                :status-label="jobStatusLabel(activeJob.status)"
                :steps="jobProgressSteps"
                :progress-percent="jobProgressPercent"
                :empty-log="text('等待输出...', 'Waiting for output...')"
              />
            </section>
          </template>
        </div>
      </div>
    </template>

    <datalist id="cc-platform-options">
      <option value="dmwork">dmwork</option>
      <option value="octo">octo</option>
      <option value="feishu">feishu</option>
      <option value="weixin">weixin</option>
      <option value="wecom">wecom</option>
      <option value="dingtalk">dingtalk</option>
      <option value="telegram">telegram</option>
    </datalist>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { confirm } from "../../composables/useConfirmDialog";
import { copyTextToClipboard } from "../../shared/clipboard";
import { useLocalePreference } from "../../shared/locale";
import type {
  CcConnectConfig,
  CcConnectPlatform,
  CcConnectProject,
  CcConnectProvider,
  CodexStackChannel,
  CodexStackComponentId,
  CodexStackComponentStatus,
  CodexStackComponentSummary,
  CodexStackConfigPatchRequest,
  CodexStackJob,
  CodexStackLogResponse,
  CodexStackRepairAction,
  CodexStackRunReadinessCheck,
  CodexStackServiceAction,
  CodexStackServiceId,
  CodexStackSmokeMatrixResult,
  CodexStackSummaryPayload,
} from "../../../../../types/codex-stack";
import {
  controlCodexStackService,
  enableCodexStackManagement,
  fetchCcConnectConfig,
  fetchCodexStackJob,
  fetchCodexStackLogs,
  fetchCodexStackSummary,
  finalizeCodexStackCcConnect,
  patchCcConnectConfig,
  patchCodexStackConfig,
  runCodexStackCheck,
  startCodexStackInstall,
  startCodexStackRepair,
} from "./api";
import {
  buildCodexStackRepairActions,
  codexStackComponentTone,
  codexStackStatusTone,
  countActiveServices,
  isCodexStackJobRunning,
} from "./codex-stack-view-model";
import type { CodexStackTone } from "./codex-stack-view-model";
import {
  normalizeCodexStackRunReadinessCheck,
  resolveCodexStackRunReadinessAction,
} from "./readiness-action";
import CodexStackActionOverview from "./CodexStackActionOverview.vue";
import CodexStackDashboardInsights from "./CodexStackDashboardInsights.vue";
import type {
  CodexStackComponentHealthCard,
  CodexStackNetworkPolicyCard,
  CodexStackRuntimeSummaryRow,
  CodexStackSmokeMatrixCard,
} from "./CodexStackDashboardInsights.vue";
import CodexStackDiagnosticsPanel from "./CodexStackDiagnosticsPanel.vue";
import CodexStackChainMap from "./CodexStackChainMap.vue";
import type { CodexStackChainGate, CodexStackChainNode } from "./CodexStackChainMap.vue";
import CodexStackInstallPlanCard from "./CodexStackInstallPlanCard.vue";
import CodexStackInstallConfigPanel from "./CodexStackInstallConfigPanel.vue";
import type {
  CodexStackInstallConfigDraft,
  CodexStackInstallConfigField,
} from "./CodexStackInstallConfigPanel.vue";
import CodexStackInstallStrategyPanel from "./CodexStackInstallStrategyPanel.vue";
import type {
  CodexStackComponentInstallMode,
  CodexStackInstallComponentStrategy,
} from "./CodexStackInstallStrategyPanel.vue";
import CodexStackJobBanner from "./CodexStackJobBanner.vue";
import CodexStackJobOutputCard from "./CodexStackJobOutputCard.vue";
import CodexStackJobProgressPanel from "./CodexStackJobProgressPanel.vue";
import CodexStackLogConsole from "./CodexStackLogConsole.vue";
import CodexStackRepairBoard from "./CodexStackRepairBoard.vue";
import CodexStackRuntimeConfigCard from "./CodexStackRuntimeConfigCard.vue";
import type {
  CodexStackRuntimeConfigDraft,
  CodexStackRuntimeConfigField,
  CodexStackRuntimeContextMode,
} from "./CodexStackRuntimeConfigCard.vue";
import type {
  CodexStackLogLineMode,
  CodexStackLogLineOption,
  CodexStackLogServiceOption,
} from "./CodexStackLogConsole.vue";
import CodexStackRunReadinessPanel from "./CodexStackRunReadinessPanel.vue";
import CodexStackServiceGrid from "./CodexStackServiceGrid.vue";
import CodexStackUpstreamMap from "./CodexStackUpstreamMap.vue";

const { text } = useLocalePreference();

type SectionId = "dashboard" | "install" | "cc-connect" | "settings" | "logs";
type AgentPaneId = "projects" | "providers" | "setup" | "raw";
type LogLineMode = CodexStackLogLineMode;
type ComponentInstallMode = CodexStackComponentInstallMode;
type AgentProjectPreset = "admin" | "worker";
type PlatformTemplateId = "dmwork" | "octo" | "feishu" | "weixin";
type ContextMode = CodexStackRuntimeContextMode;
type CcConnectProviderDraft = CcConnectProvider & { id: string };
type CcConnectPlatformOptionDraft = { id: string; key: string; value: string };
type CcConnectPlatformDraft = {
  id: string;
  type: string;
  optionRows: CcConnectPlatformOptionDraft[];
};
type CcConnectProjectDraft = {
  id: string;
  name: string;
  adminFrom: string;
  agentType: string;
  agentOptions: {
    workDir: string;
    mode: string;
    model: string;
  };
  platforms: CcConnectPlatformDraft[];
};

type ApplySummaryOptions = {
  preserveDirtyConfigDraft?: boolean;
  preserveDirtyInstallDraft?: boolean;
};

type CcConnectLoadOptions = {
  preserveDirtyDrafts?: boolean;
};

const summary = ref<CodexStackSummaryPayload | null>(null);
const ccConnectConfig = ref<CcConnectConfig | null>(null);
const ccConnectRawDraft = ref("");
const ccConnectLanguageDraft = ref("zh");
const ccConnectProviderDrafts = ref<CcConnectProviderDraft[]>([]);
const ccConnectProjectDrafts = ref<CcConnectProjectDraft[]>([]);
const ccConnectStructuredBaseline = ref("");
const activeJob = ref<CodexStackJob | null>(null);
const checkOutput = ref("");
const logOutput = ref("");
const loading = ref(false);
const ccConnectLoading = ref(false);
const busy = ref(false);
const restartRequiredUnits = ref<CodexStackServiceId[]>([]);
const notice = ref<{ kind: "success" | "error"; text: string } | null>(null);
const activeSection = ref<SectionId>("dashboard");
const activeAgentPane = ref<AgentPaneId>("projects");
const selectedProjectDraftId = ref("");
const selectedLogService = ref<CodexStackServiceId>("cli-proxy-api.service");
const logServices = computed<CodexStackLogServiceOption[]>(() => {
  const services: CodexStackLogServiceOption[] = [
    { id: "cli-proxy-api.service", label: text("CPA", "CPA"), tone: "neutral", rawState: "--" },
    { id: "cli-proxy-api-healthcheck.timer", label: text("旧巡检", "Legacy Healthcheck"), tone: "neutral", rawState: "--" },
    { id: "cpa-compact-proxy.service", label: text("Compact", "Compact"), tone: "neutral", rawState: "--" },
    { id: "cc-connect.service", label: text("cc-connect", "cc-connect"), tone: "neutral", rawState: "--" },
    { id: "codex-stack-watchdog.timer", label: text("Watchdog", "Watchdog"), tone: "neutral", rawState: "--" },
  ];
  
  if (summary.value) {
    return services.map((service) => {
      const summaryService = summary.value!.services.find((s) => s.id === service.id);
      if (summaryService) {
        return {
          ...service,
          tone: summaryService.active ? "sage" : "danger",
          rawState: `${summaryService.rawActiveState} / ${summaryService.rawEnabledState}`,
        };
      }
      return service;
    });
  }
  return services;
});
const logMeta = ref<CodexStackLogResponse | null>(null);
const logLineMode = ref<LogLineMode>("balanced");
const logAutoRefresh = ref(false);
const logRefreshing = ref(false);
let pollTimer: number | null = null;
let logPollTimer: number | null = null;
let logRequestInFlight = false;
let queuedLogRequest: { serviceId: CodexStackServiceId; silent: boolean } | null = null;
let draftIdCounter = 0;

const navSections = computed(() => [
  {
    id: "dashboard" as const,
    label: text("控制台", "Console"),
    icon: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  },
  {
    id: "install" as const,
    label: text("安装/修复", "Install/Repair"),
    icon: "M12 3 4 8v8c0 4.42 3.58 8 8 8s8-3.58 8-8V8l-8-5Zm1 13h3l-4 4-4-4h3V9h2v7Z",
  },
  {
    id: "cc-connect" as const,
    label: text("Agent", "Agents"),
    icon: "M6 7h12v10H6zM4 5v14h16V5H4Zm4 4h8v2H8V9Zm0 4h5v2H8v-2Z",
  },
  {
    id: "settings" as const,
    label: text("模型上游", "Models"),
    icon: "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.49.49 0 0 0 13.9 2h-3.8a.49.49 0 0 0-.49.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z",
  },
  {
    id: "logs" as const,
    label: text("日志", "Logs"),
    icon: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v2h10V8H7Zm0 4v2h10v-2H7Z",
  },
]);

const installForm = reactive<CodexStackInstallConfigDraft & { skipComponents: string[]; forceComponents: string[] }>({
  model: "kimi-k2.6",
  contextMode: "default" as ContextMode,
  contextWindowTokens: 1050000,
  cpaPort: 18795,
  compactPort: 18796,
  cpaKey: "",
  upstreamBaseUrl: "",
  upstreamApiKey: "",
  providerProxyUrl: "",
  noProxy: "localhost,127.0.0.1,::1",
  skipNpm: false,
  skipCcConnect: false,
  noStart: false,
  skipExisting: false,
  forceReinstall: false,
  skipComponents: [] as string[],
  forceComponents: [] as string[],
  channel: "dmwork" as CodexStackChannel,
});

function updateInstallFormField(field: CodexStackInstallConfigField, value: string | number | boolean): void {
  switch (field) {
    case "contextWindowTokens":
    case "cpaPort":
    case "compactPort":
      installForm[field] = Number(value) || 0;
      return;
    case "skipNpm":
    case "skipCcConnect":
    case "noStart":
    case "skipExisting":
    case "forceReinstall":
      installForm[field] = Boolean(value);
      return;
    case "contextMode":
      installForm.contextMode = value === "codex-1m" || value === "custom" ? value : "default";
      return;
    case "channel":
      installForm.channel = value === "official" || value === "octo" ? value : "dmwork";
      return;
    default:
      installForm[field] = String(value);
  }
}

const configForm = reactive<CodexStackRuntimeConfigDraft>({
  defaultModel: "kimi-k2.6",
  contextMode: "default",
  contextWindowTokens: 1050000,
  cpaPort: 18795,
  compactPort: 18796,
  ccConnectProject: "main",
  cpaProxyKey: "",
  upstreamBaseUrl: "",
  upstreamApiKey: "",
  providerProxyUrl: "",
  noProxy: "localhost,127.0.0.1,::1",
});

function updateConfigFormField(field: CodexStackRuntimeConfigField, value: string | number): void {
  switch (field) {
    case "contextWindowTokens":
    case "cpaPort":
    case "compactPort":
      configForm[field] = Number(value) || 0;
      return;
    case "contextMode":
      configForm.contextMode = value === "codex-1m" || value === "custom" ? value : "default";
      return;
    default:
      configForm[field] = String(value);
  }
}

const DEFAULT_NO_PROXY = "localhost,127.0.0.1,::1";
const SMOKE_MATRIX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const serviceCatalog: Record<
  CodexStackServiceId,
  {
    labelKey: [string, string];
    blurbKey: [string, string];
  }
> = {
  "cli-proxy-api.service": {
    labelKey: ["CPA", "CPA"],
    blurbKey: ["Codex Proxy API 服务", "Codex Proxy API service"],
  },
  "cli-proxy-api-healthcheck.timer": {
    labelKey: ["旧巡检", "Legacy Healthcheck"],
    blurbKey: ["旧版 CPA 巡检定时器，应保持停用", "Legacy CPA healthcheck timer; should stay disabled"],
  },
  "cpa-compact-proxy.service": {
    labelKey: ["Compact", "Compact"],
    blurbKey: ["Compact 代理转发服务", "Compact proxy forwarding service"],
  },
  "cc-connect.service": {
    labelKey: ["cc-connect", "cc-connect"],
    blurbKey: ["即时通讯桥接服务", "Instant messaging bridge service"],
  },
  "codex-stack-watchdog.timer": {
    labelKey: ["Watchdog", "Watchdog"],
    blurbKey: ["周期巡检定时器", "Periodic watchdog timer"],
  },
};

const canMutate = computed(() => summary.value?.management.enabled === true);
const jobRunning = computed(() => activeJob.value ? isCodexStackJobRunning(activeJob.value) : false);
const canRunMutation = computed(() => canMutate.value && !busy.value && !jobRunning.value);
const statusTone = computed(() => codexStackStatusTone(summary.value?.overallStatus || "needs-setup"));
const statusLabel = computed(() => {
  const status = summary.value?.overallStatus || "needs-setup";
  const labels: Record<string, string> = {
    ready: text("运行就绪", "Ready"),
    "needs-setup": text("需要安装", "Needs Setup"),
    degraded: text("部分异常", "Degraded"),
    failed: text("运行失败", "Failed"),
    "binding-required": text("等待 cc-connect 绑定", "Binding Required"),
    "running-action": text("操作执行中", "Action Running"),
  };
  return labels[status] || status;
});
const readyComponentCount = computed(
  () => summary.value?.components.filter((component) => component.status === "ok").length || 0,
);
const issueCount = computed(
  () => summary.value?.components.filter((component) => component.status !== "ok").length || 0,
);
const readinessPercent = computed(() => {
  const total = summary.value?.components.length || 1;
  return `${Math.round((readyComponentCount.value / total) * 100)}%`;
});
const runReadinessTone = computed<CodexStackTone>(() => {
  const level = summary.value?.runReadiness.level || "blocked";
  if (level === "ready") return "sage";
  if (level === "attention") return "accent";
  return "danger";
});
const modelSourceTone = computed(() => {
  if (summary.value?.models.live) return "sage";
  return summary.value?.models.source === "config" ? "accent" : "neutral";
});
const modelSourceLabel = computed(() => {
  const source = summary.value?.models.source || "fallback";
  if (source === "live") return text("来自 CPA /v1/models", "From CPA /v1/models");
  if (source === "config") return text("使用本地配置回退", "Using config fallback");
  return text("使用默认回退", "Using default fallback");
});
const modelSourceHelp = computed(() => {
  const models = summary.value?.models;
  if (!models) return text("正在读取模型列表。", "Loading model catalog.");
  if (models.live) {
    return text(
      `已连接 ${models.endpoint}，模型选择器会跟随 CPA 实际可用列表。`,
      `Connected to ${models.endpoint}; selectors follow the actual CPA model catalog.`,
    );
  }
  return text(
    `无法读取 ${models.endpoint}，当前使用本地配置回退。原因：${models.error || "未知"}`,
    `Could not read ${models.endpoint}; using local config fallback. Reason: ${models.error || "unknown"}`,
  );
});
const modelOptions = computed(() => Array.from(new Set([
  ...(summary.value?.models.available || []),
  "kimi-k2.6",
  "glm-5.1",
  "gpt-5.5",
])));
const modelCatalogPreview = computed(() => modelOptions.value.slice(0, 6));
const activeRecommendation = computed(() => summary.value?.recommendation || null);
const nextActionSection = computed<SectionId>(() => {
  return activeRecommendation.value?.section || "dashboard";
});
const nextActionTitle = computed(() => {
  switch (activeRecommendation.value?.kind) {
    case "run-check":
      return text("运行健康检查确认状态", "Run a health check to confirm");
    case "bind-cc-connect":
      return text("完成 cc-connect 绑定", "Complete cc-connect binding");
    case "watch-job":
      return text("查看后台任务输出", "Watch background job output");
    case "repair":
      return text("执行推荐修复", "Run recommended repair");
    case "review-proxy":
      return text("检查系统代理与国内直连", "Review proxy and domestic direct access");
    case "review-smoke":
      return text("重新验证模型矩阵", "Recheck the model smoke matrix");
    default:
      return text("选择安装范围并开始", "Choose install scope and start");
  }
});
const nextActionCopy = computed(() => {
  switch (activeRecommendation.value?.kind) {
    case "run-check":
      return text("服务已就绪，建议定期运行健康检查或查看日志。", "Services are ready; run checks or inspect logs when needed.");
    case "bind-cc-connect":
      return text("cc-connect 已安装但还需要平台绑定或收尾。", "cc-connect is installed but still needs platform binding or finalization.");
    case "watch-job":
      return text("安装或修复正在执行，先跟踪输出和结果。", "An install or repair is running; track output and result first.");
    case "repair":
      return text("有组件未运行或端点不可达，推荐先执行修复。", "Some components are stopped or unreachable; run repair first.");
    case "review-proxy":
      return text("检测到系统代理，但 CPA provider 仍是 direct。国内网关应直连；若 TUN 模式劫持流量，请在模型上游页检查代理和 NO_PROXY。", "A system proxy is present while CPA providers are direct. Domestic gateways should stay direct; if TUN mode hijacks traffic, review proxy and NO_PROXY in Models.");
    case "review-smoke":
      return text("上次 glm-5.1 / kimi-k2.6 矩阵失败，Codex 不会自动切到 CPA。先在安装页重新跑 smoke gate。", "The last glm-5.1 / kimi-k2.6 matrix failed, so Codex will not attach to CPA. Re-run the smoke gate from Install.");
    default:
      return text("首次使用从 DMWork 增强版开始；已有环境可选择跳过或强制重装组件。", "Start with the DMWork enhanced channel; existing environments can skip or force reinstall components.");
  }
});
const nextActionButton = computed(() => {
  switch (activeRecommendation.value?.primaryAction) {
    case "run-check":
      return text("运行检查", "Run Check");
    case "open-cc-connect":
      return text("去绑定", "Bind Now");
    case "open-logs":
      return text("看日志", "View Logs");
    case "repair-recommended":
      return text("自动修复", "Auto Repair");
    case "open-settings":
      return text("检查模型上游", "Review Models");
    default:
      return text("打开安装页", "Open Install");
  }
});
const nextActionRequiresMutation = computed(() => {
  return activeRecommendation.value?.requiresManagement === true;
});
const activeJobTitle = computed(() => {
  if (!activeJob.value) return "";
  const labels: Record<CodexStackJob["kind"], string> = {
    install: text("安装任务", "Install Job"),
    repair: text("修复任务", "Repair Job"),
    finalize: text("cc-connect 收尾任务", "cc-connect Finalizer"),
  };
  return labels[activeJob.value.kind];
});
const activeServiceCount = computed(() => countActiveServices(summary.value?.services || []));
const ccConnectProjects = computed(() => ccConnectConfig.value?.projects || []);
const ccConnectProviderDraftCount = computed(() => ccConnectProviderDrafts.value.length);
const ccConnectProjectDraftCount = computed(() => ccConnectProjectDrafts.value.length);
const primaryCcConnectProjectName = computed(
  () => ccConnectProjectDrafts.value[0]?.name || ccConnectProjects.value[0]?.name || summary.value?.ccConnect.project || "main",
);
const compactProxyBaseUrl = computed(() => `http://127.0.0.1:${configForm.compactPort || summary.value?.ports.compact || 18796}/v1`);
const contextTokensDisplay = computed(() => {
  if (summary.value?.context.mode === "default" && !summary.value.context.tokens) {
    return text("默认", "Default");
  }
  const tokens = summary.value?.context.tokens || summary.value?.context.recommendedTokens || 1050000;
  return tokens >= 1000000 ? `${(tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 2)}M` : `${Math.round(tokens / 1000)}K`;
});
const proxyPolicyLabel = computed(() => {
  const current = summary.value;
  if (!current) return text("未知", "Unknown");
  const policy = normalizeProxyPolicy(current.proxyPolicy);
  if (!policy.noProxyLoopbackReady) {
    return text(
      `NO_PROXY 缺少 ${policy.noProxyLoopbackMissing.join(", ")}`,
      `NO_PROXY missing ${policy.noProxyLoopbackMissing.join(", ")}`,
    );
  }
  if (policy.providerMode === "proxy" && policy.providerProxyUrl) {
    return text(`海外代理 ${policy.providerProxyUrl}`, `Foreign proxy ${policy.providerProxyUrl}`);
  }
  return text("国内网关直连", "Domestic gateways direct");
});
const smokeMatrixLabel = computed(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  if (!matrix) return text("未验证", "Not verified");
  const models = matrix.models.map((item) => `${item.model}:${item.status}`).join(" ");
  if (isSmokeMatrixStale(matrix)) {
    return text(`需复验 ${models}`, `Recheck ${models}`);
  }
  return matrix.attachEligible
    ? text(`通过 ${models}`, `Passed ${models}`)
    : text(`失败 ${models}`, `Failed ${models}`);
});
const isSmokeMatrixAttachReady = computed(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  return Boolean(matrix?.attachEligible && !isSmokeMatrixStale(matrix));
});
const canAttachCodexCpa = computed(() => canRunMutation.value && isSmokeMatrixAttachReady.value);
const attachCodexCpaHelp = computed(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  if (!matrix) {
    return text("先运行“只验证”，让 glm-5.1 和 kimi-k2.6 完成完整矩阵。", "Run Verify Only first so glm-5.1 and kimi-k2.6 complete the full matrix.");
  }
  if (isSmokeMatrixStale(matrix)) {
    return text("上次矩阵已超过 24 小时，先重新只验证；切换动作仍会再次烟测。", "The last matrix is older than 24 hours; verify again first. The attach action will still rerun smoke checks.");
  }
  if (!matrix.attachEligible) {
    return text("上次矩阵未全部通过，Codex 保持官方路径；修复后重新只验证。", "The last matrix did not fully pass, so Codex stays on the official path. Fix it and verify again.");
  }
  return text("已有新鲜通过矩阵；点击后仍会重新烟测，全部通过才写入 Codex。", "A fresh passing matrix exists; clicking still reruns smoke checks before writing Codex.");
});
const dashboardInsightsLabels = computed(() => ({
  runtimeKicker: text("速览", "Quick Info"),
  runtimeTitle: text("运行摘要", "Runtime Summary"),
  componentsKicker: text("组件", "Components"),
  componentsTitle: text("组件健康", "Component Health"),
}));
const runtimeSummaryRows = computed<CodexStackRuntimeSummaryRow[]>(() => {
  const current = summary.value;
  if (!current) return [];
  return [
    {
      id: "model",
      label: text("模型", "Model"),
      value: current.models.current || current.profile.defaultModel || "--",
    },
    {
      id: "channel",
      label: text("渠道", "Channel"),
      value: channelLabel(current.installer.channel),
    },
    {
      id: "cpa",
      label: "CPA",
      value: portDisplay(current.ports.cpa, current.ports.detectedCpa),
    },
    {
      id: "compact",
      label: "Compact",
      value: portDisplay(current.ports.compact, current.ports.detectedCompact),
    },
    {
      id: "proxy",
      label: text("上游代理", "Upstream Proxy"),
      value: proxyPolicyLabel.value,
    },
    {
      id: "smoke",
      label: text("模型矩阵", "Smoke Matrix"),
      value: smokeMatrixLabel.value,
    },
    {
      id: "cc-connect",
      label: text("cc-connect 项目", "cc-connect Project"),
      value: current.ccConnect.project || "main",
    },
    {
      id: "installer",
      label: text("安装器版本", "Installer Version"),
      value: current.installer.version || "--",
    },
  ];
});
const networkPolicyCard = computed<CodexStackNetworkPolicyCard | null>(() => {
  const current = summary.value;
  if (!current) return null;
  const policy = normalizeProxyPolicy(current.proxyPolicy);
  const directWithSystemProxy = policy.providerMode === "direct" && Boolean(policy.providerProxyUrl);
  const proxyMode = policy.providerMode === "proxy" && Boolean(policy.providerProxyUrl);
  const tone: CodexStackTone = !policy.noProxyLoopbackReady
    ? "danger"
    : directWithSystemProxy || proxyMode ? "accent" : "sage";
  const modeValue = !policy.noProxyLoopbackReady
    ? text("本机绕过缺失", "Loopback bypass missing")
    : proxyMode
      ? text("海外代理", "Foreign proxy")
      : directWithSystemProxy
        ? text("国内直连 + 系统代理提示", "Domestic direct + system proxy noticed")
        : text("国内网关直连", "Domestic gateway direct");
  const modeHelp = !policy.noProxyLoopbackReady
    ? text("网卡/TUN 模式或系统代理可能截获 CPA/Compact 的本机请求，先补齐 NO_PROXY 再跑 Codex 对话、长任务和压缩上下文。", "TUN mode or a system proxy can capture local CPA/Compact calls; fix NO_PROXY before Codex chats, long jobs, and compaction.")
    : proxyMode
      ? text(`CPA provider 使用 ${policy.providerProxyUrl}；仅海外/OpenAI 上游需要这样配置。`, `CPA providers use ${policy.providerProxyUrl}; keep this for foreign/OpenAI upstreams only.`)
      : directWithSystemProxy
        ? text("检测到系统代理，但 CPA provider 仍是 direct；国内网关不会继承系统代理，若 TUN 劫持流量请在 VPN 里为国内网关配置直连。", "A system proxy is present while CPA providers stay direct; domestic gateways will not inherit it, so configure direct routing for domestic gateways if TUN captures traffic.")
        : text("国内兼容网关保持直连；OpenAI 官方 Codex 访问仍由 Codex/系统代理路径处理。", "Domestic compatible gateways stay direct; official OpenAI Codex access still follows the Codex/system proxy path.");
  const loopbackValue = policy.noProxyLoopbackReady
    ? text("localhost / 127.0.0.1 / ::1 已绕过", "localhost / 127.0.0.1 / ::1 bypassed")
    : text(`缺少 ${policy.noProxyLoopbackMissing.join(", ")}`, `Missing ${policy.noProxyLoopbackMissing.join(", ")}`);
  const loopbackHelp = policy.noProxyLoopbackReady
    ? text(`NO_PROXY=${policy.noProxy}`, `NO_PROXY=${policy.noProxy}`)
    : text("把 localhost,127.0.0.1,::1 写入 NO_PROXY，避免本机 CPA/Compact 请求被系统代理或 VPN 网卡模式转走。", "Add localhost,127.0.0.1,::1 to NO_PROXY so local CPA/Compact calls are not routed through a system proxy or VPN TUN mode.");
  const upstreamValue = policy.upstreamBaseUrl
    ? `${policy.upstreamBaseUrl} · ${policy.upstreamApiKeyConfigured ? text("密钥已配置", "key configured") : text("缺少密钥", "key missing")}`
    : text("使用安装器默认上游", "Using installer default upstream");
  return {
    kicker: text("网络策略", "Network Policy"),
    title: text("代理与直连诊断", "Proxy and Direct Routing"),
    modeValue,
    modeHelp,
    loopbackLabel: "NO_PROXY",
    loopbackValue,
    loopbackHelp,
    upstreamLabel: text("上游", "Upstream"),
    upstreamValue,
    tone,
  };
});
const chainMapLabels = computed(() => ({
  kicker: text("链路", "Chain"),
  title: text("CPA / Compact / Codex 请求链路", "CPA / Compact / Codex Request Chain"),
  copy: text(
    "把运行链路、代理策略、上下文和 smoke gate 放到同一张图里，避免安装、修改或长任务时误判当前 Codex 状态。",
    "The runtime chain, proxy policy, context, and smoke gate stay in one view so install, edits, and long jobs do not hide the current Codex state.",
  ),
  status: jobRunning.value ? text("写操作锁定", "Writes locked") : statusLabel.value,
  warningKicker: text("风险", "Risks"),
  warningTitle: text("需要先处理的链路告警", "Chain warnings to resolve first"),
}));
const chainWarnings = computed(() => summary.value?.warnings.slice(0, 3) || []);
const chainNodes = computed<CodexStackChainNode[]>(() => {
  const current = summary.value;
  if (!current) return [];
  return [
    {
      id: "cpa",
      label: "CPA",
      value: portDisplay(current.ports.cpa, current.ports.detectedCpa),
      meta: current.services.find((service) => service.id === "cli-proxy-api.service")?.active
        ? text("OpenAI 兼容入口运行中", "OpenAI-compatible ingress is running")
        : text("入口未运行或未安装", "Ingress is stopped or missing"),
      tone: current.components.find((component) => component.id === "cpa")?.status === "ok" ? "sage" : "danger",
    },
    {
      id: "compact",
      label: "Compact",
      value: `:${current.ports.compact}`,
      meta: current.models.live
        ? text("模型目录来自 /v1/models", "Model catalog comes from /v1/models")
        : text("模型目录使用本地回退", "Model catalog is using fallback data"),
      tone: current.models.live ? "sage" : "accent",
    },
    {
      id: "codex",
      label: "Codex CLI",
      value: current.models.current || current.profile.defaultModel || "--",
      meta: `${text("上下文", "Context")} ${contextTokensDisplay.value}`,
      tone: current.secrets.codexAuth.matchesProxyKey === false ? "danger" : "sage",
    },
    {
      id: "cc-connect",
      label: "cc-connect",
      value: current.ccConnect.project || "main",
      meta: current.ccConnect.bindingPresent
        ? text("平台绑定已检测", "Platform binding detected")
        : text("等待平台绑定或 finalizer", "Waiting for binding or finalizer"),
      tone: current.ccConnect.bindingPresent ? "sage" : "accent",
    },
  ];
});
const chainGates = computed<CodexStackChainGate[]>(() => {
  const current = summary.value;
  if (!current) return [];
  const matrix = current.profile.lastSmokeMatrix;
  const policy = normalizeProxyPolicy(current.proxyPolicy);
  return [
    {
      id: "proxy",
      label: text("代理策略", "Proxy Policy"),
      value: !policy.noProxyLoopbackReady
        ? text("本地绕过缺失", "Loopback bypass missing")
        : policy.providerMode === "proxy" ? text("海外代理", "Foreign proxy") : text("国内直连", "Domestic direct"),
      help: proxyPolicyLabel.value,
      tone: !policy.noProxyLoopbackReady
        ? "danger"
        : policy.providerMode === "proxy" ? "accent" : "sage",
    },
    {
      id: "smoke",
      label: text("Smoke Gate", "Smoke Gate"),
      value: matrix
        ? (isSmokeMatrixStale(matrix) ? text("需复验", "Recheck") : matrix.attachEligible ? text("可切 Codex", "Attach ready") : text("禁止切换", "Blocked"))
        : text("未验证", "Not verified"),
      help: smokeMatrixLabel.value,
      tone: matrix ? (isSmokeMatrixStale(matrix) ? "accent" : matrix.attachEligible ? "sage" : "danger") : "accent",
    },
    {
      id: "job-lock",
      label: text("后台任务锁", "Job Lock"),
      value: jobRunning.value ? text("锁定写操作", "Writes locked") : text("可操作", "Writable"),
      help: activeJob.value
        ? `${activeJob.value.commandLabel} · ${jobStatusLabel(activeJob.value.status)}`
        : text("没有安装、修复或 finalizer 正在运行", "No install, repair, or finalizer is running"),
      tone: jobRunning.value ? "accent" : "sage",
    },
    {
      id: "watchdog",
      label: "Watchdog",
      value: current.services.find((service) => service.id === "codex-stack-watchdog.timer")?.active
        ? text("巡检开启", "Enabled")
        : text("巡检暂停", "Paused"),
      help: text("暂停链路时应先停 watchdog，恢复时最后启用。", "Pause stops watchdog first; resume enables it last."),
      tone: current.services.find((service) => service.id === "codex-stack-watchdog.timer")?.active ? "sage" : "neutral",
    },
  ];
});
const smokeMatrixCard = computed<CodexStackSmokeMatrixCard | null>(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  if (!matrix) return null;
  return {
    requiredModelsLabel: text("必测模型", "Required Models"),
    requiredModels: matrix.requiredModels.join(", "),
    attachEligibleLabel: text("可切换", "Attach Eligible"),
    attachEligible: isSmokeMatrixStale(matrix) ? text("需复验", "Recheck") : matrix.attachEligible ? text("是", "Yes") : text("否", "No"),
    models: matrix.models.map((model) => {
      const passed = model.checks.filter((check) => check.status === "passed").length;
      const total = model.checks.length;
      return {
        model: model.model,
        status: model.status,
        checksLabel: text(`检查 ${passed}/${total} 通过`, `${passed}/${total} checks passed`),
        error: model.error,
      };
    }),
  };
});
const componentHealthCards = computed<CodexStackComponentHealthCard[]>(() => {
  const current = summary.value;
  if (!current) return [];
  return current.components.map((component) => ({
    id: component.id,
    label: component.label,
    statusLabel: componentStatusLabel(component),
    versionLabel: `${text("版本", "Version")} ${
      component.version || (component.installed ? text("已安装", "Installed") : text("缺失", "Missing"))
    }`,
    notes: component.notes.join(" · "),
    tone: componentTone(component.status),
  }));
});
const configContextTokensDisabled = computed(() => configForm.contextMode !== "custom");
const installContextTokensDisabled = computed(() => installForm.contextMode !== "custom");
const hasInstallDraftChanges = computed(() => {
  const current = summary.value;
  if (!current) return false;
  const policy = normalizeProxyPolicy(current.proxyPolicy);

  const currentModel = current.models.current || current.profile.defaultModel || current.models.defaultModel || "kimi-k2.6";
  if ((installForm.model || "") !== currentModel) return true;
  if (installForm.contextMode !== (current.context.mode || "default")) return true;
  if (installForm.contextMode === "custom" && Number(installForm.contextWindowTokens) !== (current.context.tokens || current.context.recommendedTokens)) return true;
  if (Number(installForm.cpaPort) !== current.ports.cpa) return true;
  if (Number(installForm.compactPort) !== current.ports.compact) return true;
  if (installForm.channel !== current.installer.channel) return true;
  if (installForm.cpaKey.trim()) return true;
  if (installForm.upstreamBaseUrl.trim() !== (policy.upstreamBaseUrl || "")) return true;
  if (installForm.upstreamApiKey.trim()) return true;
  if (installForm.providerProxyUrl.trim() !== (policy.providerProxyUrl || "")) return true;
  if ((installForm.noProxy.trim() || DEFAULT_NO_PROXY) !== (policy.noProxy || DEFAULT_NO_PROXY)) return true;
  return installForm.skipNpm
    || installForm.skipCcConnect
    || installForm.noStart
    || installForm.skipExisting
    || installForm.forceReinstall
    || installForm.skipComponents.length > 0
    || installForm.forceComponents.length > 0;
});
const configPatchPayload = computed<CodexStackConfigPatchRequest>(() => {
  const current = summary.value;
  if (!current) return {};
  const policy = normalizeProxyPolicy(current.proxyPolicy);

  const payload: CodexStackConfigPatchRequest = {};
  const nextModel = configForm.defaultModel.trim();
  const currentModel = current.models.current || current.profile.defaultModel || current.models.defaultModel || "";
  if (nextModel && nextModel !== currentModel) {
    payload.defaultModel = nextModel;
  }

  if (configForm.contextMode !== current.context.mode) {
    payload.contextMode = configForm.contextMode;
  }
  if (configForm.contextMode === "custom") {
    const nextTokens = Number(configForm.contextWindowTokens) || undefined;
    if (nextTokens && nextTokens !== (current.context.tokens || undefined)) {
      payload.contextMode = "custom";
      payload.contextWindowTokens = nextTokens;
    }
  }

  const nextCpaPort = Number(configForm.cpaPort) || undefined;
  if (nextCpaPort && nextCpaPort !== current.ports.cpa) {
    payload.cpaPort = nextCpaPort;
  }
  const nextCompactPort = Number(configForm.compactPort) || undefined;
  if (nextCompactPort && nextCompactPort !== current.ports.compact) {
    payload.compactPort = nextCompactPort;
  }

  const nextCcProject = configForm.ccConnectProject.trim();
  const currentCcProject = current.ccConnect.project || current.profile.ccConnectProject || "main";
  if (nextCcProject && nextCcProject !== currentCcProject) {
    payload.ccConnectProject = nextCcProject;
  }

  const nextCpaProxyKey = configForm.cpaProxyKey.trim();
  if (nextCpaProxyKey) {
    payload.cpaProxyKey = nextCpaProxyKey;
  }

  const nextUpstreamBaseUrl = configForm.upstreamBaseUrl.trim();
  if (nextUpstreamBaseUrl !== (policy.upstreamBaseUrl || "")) {
    payload.upstreamBaseUrl = nextUpstreamBaseUrl;
  }

  const nextUpstreamApiKey = configForm.upstreamApiKey.trim();
  if (nextUpstreamApiKey) {
    payload.upstreamApiKey = nextUpstreamApiKey;
  }

  const nextProviderProxyUrl = configForm.providerProxyUrl.trim();
  if (nextProviderProxyUrl !== (policy.providerProxyUrl || "")) {
    payload.providerProxyUrl = nextProviderProxyUrl;
  }

  const nextNoProxy = configForm.noProxy.trim() || "localhost,127.0.0.1,::1";
  if (nextNoProxy !== (policy.noProxy || "localhost,127.0.0.1,::1")) {
    payload.noProxy = nextNoProxy;
  }

  return payload;
});
const hasConfigPatchChanges = computed(() => Object.keys(configPatchPayload.value).length > 0);
const canonicalCcConnectProvider = computed(() => {
  const provider = ccConnectProviderDrafts.value.find((item) => item.name === "cpa") || ccConnectProviderDrafts.value[0];
  return {
    name: provider?.name || "cpa",
    baseUrl: provider?.baseUrl || compactProxyBaseUrl.value,
    model: configForm.defaultModel || installForm.model || summary.value?.models.current || "--",
  };
});
const ccConnectSetupCommands = computed(() => {
  const commands = summary.value?.ccConnect.setupCommands || [];
  if (commands.length) return commands;
  return [
    `cc-connect feishu setup --project ${primaryCcConnectProjectName.value}`,
    `cc-connect weixin setup --project ${primaryCcConnectProjectName.value}`,
  ];
});
const hasCcConnectRawChanges = computed(() => ccConnectRawDraft.value !== (ccConnectConfig.value?.raw || ""));
const hasCcConnectStructuredChanges = computed(
  () => serializeCcConnectStructuredDraft() !== ccConnectStructuredBaseline.value,
);
const serviceCards = computed(() => {
  if (!summary.value) return [];
  return summary.value.services.map((service) => {
    const serviceMeta = serviceCatalog[service.id];
    const label = text(serviceMeta.labelKey[0], serviceMeta.labelKey[1]);
    const blurb = text(serviceMeta.blurbKey[0], serviceMeta.blurbKey[1]);
    return {
      ...service,
      label,
      blurb,
      tone: service.active ? "sage" : "danger",
      stateLabel: service.active ? text("服务运行正常", "Service is running") : text("服务当前未运行", "Service is currently stopped"),
      enabledLabel: service.enabled ? text("已启用", "Enabled") : text("未启用", "Disabled"),
      rawState: `${service.rawActiveState} / ${service.rawEnabledState}`,
      ...serviceEndpointInfo(service.id, summary.value),
    };
  });
});
const serviceGridLabels = computed(() => ({
  running: text("运行中", "Running"),
  stopped: text("已停止", "Stopped"),
  enabled: text("启用状态", "Enabled"),
  systemd: text("systemd 状态", "Systemd"),
  start: text("启动", "Start"),
  stop: text("停止", "Stop"),
  restart: text("重启", "Restart"),
}));
const componentOptions = computed(() => [
  { id: "codex" as const, label: text("Codex CLI", "Codex CLI") },
  { id: "cpa" as const, label: text("CPA 代理", "CPA Proxy") },
  { id: "compact-proxy" as const, label: text("Compact 代理", "Compact Proxy") },
  { id: "cc-connect" as const, label: "cc-connect" },
  { id: "watchdog" as const, label: text("看门狗", "Watchdog") },
]);
const installComponentStrategies = computed<CodexStackInstallComponentStrategy[]>(() => componentOptions.value.map((component) => ({
  id: component.id,
  label: component.label,
  mode: installMode(component.id),
  modeLabel: installModeLabel(component.id),
})));
const agentPanes = computed(() => [
  { id: "projects" as const, label: text("Agent 项目", "Agent Projects") },
  { id: "providers" as const, label: "Provider" },
  { id: "setup" as const, label: text("绑定与动作", "Setup & Actions") },
  { id: "raw" as const, label: "TOML" },
]);
const platformTemplates = computed<Array<{ id: PlatformTemplateId; label: string; copy: string }>>(() => [
  {
    id: "dmwork",
    label: "DMWork",
    copy: text("token / api_url / account_id", "token / api_url / account_id"),
  },
  {
    id: "octo",
    label: "Octo",
    copy: text("token / api_url / account_id", "token / api_url / account_id"),
  },
  {
    id: "feishu",
    label: text("飞书", "Feishu"),
    copy: text("app_id / app_secret", "app_id / app_secret"),
  },
  {
    id: "weixin",
    label: text("微信", "Weixin"),
    copy: text("setup 绑定后自动补齐", "Filled by setup binding"),
  },
]);
const projectPresetCards = computed<Array<{ id: AgentProjectPreset; label: string; copy: string; action: string }>>(() => [
  {
    id: "admin",
    label: text("管理员 Agent", "Admin Agent"),
    copy: text("suggest 模式，默认工作目录指向 ~/.openclaw，适合主控 Bot。", "Suggest mode with ~/.openclaw as work dir, suitable for the primary bot."),
    action: text("新建管理员", "New Admin"),
  },
  {
    id: "worker",
    label: text("工作 Agent", "Worker Agent"),
    copy: text("yolo 模式，默认使用独立 workspace，适合多 Agent 分流。", "Yolo mode with an isolated workspace, suitable for multi-agent routing."),
    action: text("新建工作 Agent", "New Worker"),
  },
]);
const selectedProjectDraft = computed(() => {
  if (!ccConnectProjectDrafts.value.length) return null;
  return ccConnectProjectDrafts.value.find((project) => project.id === selectedProjectDraftId.value) || ccConnectProjectDrafts.value[0];
});
const selectedProjectSummary = computed(() => {
  const project = selectedProjectDraft.value;
  if (!project) return text("暂无项目", "No project");
  return `${project.agentType || "codex"} · ${project.agentOptions.mode || "--"} · ${project.agentOptions.model || "--"}`;
});
const installPlanHighlights = computed(() => {
  const skip = componentOptions.value
    .filter((component) => installMode(component.id) === "skip")
    .map((component) => component.label);
  const force = componentOptions.value
    .filter((component) => installMode(component.id) === "force")
    .map((component) => component.label);
  return [
    `${text("渠道", "Channel")}: ${channelLabel(installForm.channel)}`,
    `${text("模型", "Model")}: ${installForm.model || "--"}`,
    `${text("上下文", "Context")}: ${installForm.contextMode === "default" ? text("默认", "Default") : `${installForm.contextMode === "codex-1m" ? "1M" : installForm.contextWindowTokens} tokens`}`,
    `${text("端口", "Ports")}: CPA ${installForm.cpaPort} / Compact ${installForm.compactPort}`,
    `${text("上游代理", "Upstream Proxy")}: ${installForm.providerProxyUrl ? installForm.providerProxyUrl : text("自动；国内直连", "Auto; domestic direct")}`,
    `${text("跳过", "Skip")}: ${skip.length ? skip.join(", ") : text("无", "None")}`,
    `${text("强制", "Force")}: ${force.length ? force.join(", ") : text("无", "None")}`,
  ];
});
const logLineOptions = computed<CodexStackLogLineOption[]>(() => [
  { id: "light", label: text("轻量", "Light"), lines: 80, help: text("最快，只看最近错误。", "Fastest, recent errors only.") },
  { id: "balanced", label: text("标准", "Balanced"), lines: 160, help: text("默认预览，适合日常排障。", "Default preview for daily diagnosis.") },
  { id: "deep", label: text("完整", "Deep"), lines: 500, help: text("更多上下文，读取更慢。", "More context, slower fetch.") },
]);
const logLineLimit = computed(() => logLineOptions.value.find((option) => option.id === logLineMode.value)?.lines || 160);
const logModeHelp = computed(() => logLineOptions.value.find((option) => option.id === logLineMode.value)?.help || "");
const logFetchedAtLabel = computed(() => formatTimestamp(logMeta.value?.fetchedAt));
const logConsoleLabels = computed(() => ({
  targetService: text("目标服务", "Target Service"),
  readPerformance: text("读取性能", "Read Performance"),
  lines: text("行", "lines"),
  autoRefresh: text("自动刷新当前服务", "Auto-refresh current service"),
  requested: text("请求行数", "Requested"),
  returned: text("返回行数", "Returned"),
  sources: text("来源", "Sources"),
  fetched: text("读取时间", "Fetched"),
  truncated: text("内容已截断", "Output truncated"),
  load: text("读取日志", "Load Logs"),
  loading: text("读取中...", "Loading..."),
  empty: text("选择一个服务查看日志。", "Select a service to view logs."),
}));
const jobProgressDefinitions = computed(() => {
  const kind = activeJob.value?.kind;
  if (kind === "repair") {
    return [
      { label: text("确认修复项", "Resolve actions"), patterns: ["repair", "修复"] },
      { label: text("执行服务动作", "Run service actions"), patterns: ["systemctl", "restart", "start", "disable"] },
      { label: text("刷新状态", "Refresh status"), patterns: ["summary", "health", "检查"] },
      { label: text("完成", "Done"), patterns: ["succeeded", "completed", "完成"] },
    ];
  }
  if (kind === "finalize") {
    return [
      { label: text("读取绑定", "Read binding"), patterns: ["cc-connect", "binding", "绑定"] },
      { label: text("写入配置", "Write config"), patterns: ["config", "配置"] },
      { label: text("重启服务", "Restart service"), patterns: ["restart", "systemctl"] },
      { label: text("完成", "Done"), patterns: ["succeeded", "completed", "完成"] },
    ];
  }
  return [
    { label: text("预检环境", "Preflight"), patterns: ["node.js", "npm", "openclaw.json", "step 1/8"] },
    { label: text("安装 CLI", "Install CLI"), patterns: ["step 2/8", "codex cli", "oh-my-codex"] },
    { label: text("部署 cc-connect", "Deploy cc-connect"), patterns: ["step 3/8", "cc-connect"] },
    { label: text("部署 CPA / Compact", "Deploy CPA / Compact"), patterns: ["step 4/8", "compact proxy"] },
    { label: text("写入配置", "Write configs"), patterns: ["step 5/8", "step 6/8"] },
    { label: text("创建守护", "Create daemons"), patterns: ["step 7/8", "systemd"] },
    { label: text("启动与验证", "Start and verify"), patterns: ["step 8/8", "安装完成", "install succeeded"] },
  ];
});
const jobProgressSteps = computed(() => {
  const job = activeJob.value;
  const definitions = jobProgressDefinitions.value;
  if (!job) return [];
  const log = `${job.commandLabel}\n${job.logTail || ""}\n${job.error || ""}`.toLowerCase();
  let activeIndex = job.status === "queued" ? 0 : -1;
  definitions.forEach((step, index) => {
    if (step.patterns.some((pattern) => log.includes(pattern.toLowerCase()))) {
      activeIndex = index;
    }
  });
  if (job.status === "succeeded") activeIndex = definitions.length - 1;
  if ((job.status === "failed" || job.status === "interrupted") && activeIndex < 0) activeIndex = 0;
  return definitions.map((step, index) => {
    let state: "done" | "active" | "failed" | "pending" = "pending";
    if (job.status === "succeeded" || index < activeIndex) state = "done";
    else if (index === activeIndex && (job.status === "failed" || job.status === "interrupted")) state = "failed";
    else if (index === activeIndex) state = "active";
    return { ...step, state };
  });
});
const jobProgressPercent = computed(() => {
  const steps = jobProgressSteps.value;
  if (!steps.length) return "0%";
  const score = steps.reduce((total, step) => {
    if (step.state === "done") return total + 1;
    if (step.state === "active") return total + 0.55;
    return total;
  }, 0);
  return `${Math.max(6, Math.round((score / steps.length) * 100))}%`;
});

function nextDraftId(prefix: string): string {
  draftIdCounter += 1;
  return `${prefix}-${draftIdCounter}`;
}

function createProviderDraft(provider?: Partial<CcConnectProvider>): CcConnectProviderDraft {
  return {
    id: nextDraftId("provider"),
    name: provider?.name || "cpa",
    apiKey: provider?.apiKey || "",
    baseUrl: provider?.baseUrl || compactProxyBaseUrl.value,
    codexEnvKey: provider?.codexEnvKey || "OPENAI_API_KEY",
  };
}

function createPlatformOptionDraft(key = "", value = ""): CcConnectPlatformOptionDraft {
  return {
    id: nextDraftId("platform-option"),
    key,
    value,
  };
}

function defaultPlatformOptionRows(type: string): CcConnectPlatformOptionDraft[] {
  if (type === "feishu") {
    return [
      createPlatformOptionDraft("app_id", ""),
      createPlatformOptionDraft("app_secret", ""),
    ];
  }
  if (type === "weixin") {
    return [
      createPlatformOptionDraft("app_id", ""),
      createPlatformOptionDraft("app_secret", ""),
    ];
  }
  return [
    createPlatformOptionDraft("bot_token", ""),
    createPlatformOptionDraft("api_url", "https://im.deepminer.com.cn/api"),
    createPlatformOptionDraft("account_id", ""),
  ];
}

function createPlatformDraft(platform?: Partial<CcConnectPlatform>, preferredType: PlatformTemplateId = "octo"): CcConnectPlatformDraft {
  const options = Object.entries(platform?.options || {});
  const type = platform?.type || preferredType;
  return {
    id: nextDraftId("platform"),
    type,
    optionRows: options.length
      ? options.map(([key, value]) => createPlatformOptionDraft(key, value))
      : defaultPlatformOptionRows(type),
  };
}

function createProjectDraft(project?: Partial<CcConnectProject>): CcConnectProjectDraft {
  return {
    id: nextDraftId("project"),
    name: project?.name || "main",
    adminFrom: project?.adminFrom || "",
    agentType: project?.agentType || "codex",
    agentOptions: {
      workDir: project?.agentOptions?.workDir || summary.value?.homeDir || "",
      mode: project?.agentOptions?.mode || "suggest",
      model: project?.agentOptions?.model || configForm.defaultModel || "kimi-k2.6",
    },
    platforms: project?.platforms?.length
      ? project.platforms.map((platform) => createPlatformDraft(platform))
      : [createPlatformDraft()],
  };
}

function normalizeProviderDrafts(): CcConnectProvider[] {
  return ccConnectProviderDrafts.value
    .map((provider) => ({
      name: provider.name.trim(),
      apiKey: provider.apiKey.trim(),
      baseUrl: provider.baseUrl.trim(),
      codexEnvKey: provider.codexEnvKey.trim(),
    }))
    .filter((provider) => provider.name || provider.baseUrl || provider.apiKey || provider.codexEnvKey);
}

function normalizePlatformDraft(platform: CcConnectPlatformDraft): CcConnectPlatform {
  const options: Record<string, string> = {};
  for (const row of platform.optionRows) {
    const key = row.key.trim();
    if (!key) continue;
    options[key] = row.value.trim();
  }
  return {
    type: platform.type.trim(),
    options,
  };
}

function normalizeProjectDrafts(): CcConnectProject[] {
  return ccConnectProjectDrafts.value
    .map((project) => ({
      name: project.name.trim(),
      adminFrom: project.adminFrom.trim(),
      agentType: project.agentType.trim() || "codex",
      agentOptions: {
        workDir: project.agentOptions.workDir.trim(),
        mode: project.agentOptions.mode.trim(),
        model: project.agentOptions.model.trim(),
      },
      platforms: project.platforms
        .map((platform) => normalizePlatformDraft(platform))
        .filter((platform) => platform.type || Object.keys(platform.options).length),
    }))
    .filter((project) => project.name || project.agentOptions.workDir || project.platforms.length);
}

function serializeCcConnectStructuredDraft(): string {
  return JSON.stringify({
    language: ccConnectLanguageDraft.value.trim() || "zh",
    providers: normalizeProviderDrafts(),
    projects: normalizeProjectDrafts(),
  });
}

function hydrateCcConnectStructuredDraft(config: CcConnectConfig): void {
  ccConnectLanguageDraft.value = config.language || "zh";
  ccConnectProviderDrafts.value = config.providers.map((provider) => createProviderDraft(provider));
  ccConnectProjectDrafts.value = config.projects.map((project) => createProjectDraft(project));
  selectedProjectDraftId.value = ccConnectProjectDrafts.value[0]?.id || "";
  ccConnectStructuredBaseline.value = serializeCcConnectStructuredDraft();
}

function componentTone(status: CodexStackComponentStatus) {
  return codexStackComponentTone(status);
}

function isSensitiveKey(key: string): boolean {
  return /(api[_-]?key|bot[_-]?token|token|secret|password)/i.test(key);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function channelLabel(channel: CodexStackChannel): string {
  if (channel === "dmwork") return "DMWork";
  if (channel === "octo") return "Octo";
  return text("官方版", "Official");
}

function installChannelDefaultModel(channel: CodexStackChannel): string {
  return channel === "official" ? "glm-5.1" : "kimi-k2.6";
}

function installChannelDefaultCpaPort(channel: CodexStackChannel): number {
  return channel === "official" ? 8317 : 18795;
}

function syncInstallChannelDefaults(nextChannel: CodexStackChannel, previousChannel: CodexStackChannel): void {
  const previousDefaultModel = installChannelDefaultModel(previousChannel);
  if (!installForm.model || installForm.model === previousDefaultModel) {
    installForm.model = installChannelDefaultModel(nextChannel);
  }

  const previousDefaultPort = installChannelDefaultCpaPort(previousChannel);
  if (!Number(installForm.cpaPort) || Number(installForm.cpaPort) === previousDefaultPort) {
    installForm.cpaPort = installChannelDefaultCpaPort(nextChannel);
  }
}

function yesNo(value: boolean): string {
  return value ? text("是", "Yes") : text("否", "No");
}

function portDisplay(port: number, live: number | null): string {
  if (live && live !== port) return `:${port} (live :${live})`;
  return `:${port}`;
}

function findMissingNoProxyLoopback(noProxy: string): string[] {
  const entries = new Set(noProxy
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((entry) => [entry, entry.replace(/^\[(.*)\]$/, "$1")]));
  if (entries.has("*")) return [];
  const missing: string[] = [];
  if (!entries.has("localhost") && !entries.has(".localhost")) missing.push("localhost");
  if (!entries.has("127.0.0.1") && !entries.has("127.0.0.0/8")) missing.push("127.0.0.1");
  if (!entries.has("::1")) missing.push("::1");
  return missing;
}

function normalizeProxyPolicy(
  policy: Partial<CodexStackSummaryPayload["proxyPolicy"]> | undefined,
): CodexStackSummaryPayload["proxyPolicy"] {
  const noProxy = policy?.noProxy || DEFAULT_NO_PROXY;
  const missing = Array.isArray(policy?.noProxyLoopbackMissing)
    ? policy.noProxyLoopbackMissing
    : findMissingNoProxyLoopback(noProxy);
  return {
    providerMode: policy?.providerMode === "proxy" ? "proxy" : "direct",
    providerProxyUrl: policy?.providerProxyUrl || null,
    providerProxySource: policy?.providerProxySource || null,
    noProxy,
    noProxyLoopbackReady: typeof policy?.noProxyLoopbackReady === "boolean"
      ? policy.noProxyLoopbackReady
      : missing.length === 0,
    noProxyLoopbackMissing: missing,
    cpaConfigProxyUrls: Array.isArray(policy?.cpaConfigProxyUrls) ? policy.cpaConfigProxyUrls : [],
    upstreamBaseUrl: policy?.upstreamBaseUrl || null,
    upstreamApiKeyConfigured: Boolean(policy?.upstreamApiKeyConfigured),
  };
}

function normalizeCodexStackSummary(next: CodexStackSummaryPayload): CodexStackSummaryPayload {
  return {
    ...next,
    proxyPolicy: normalizeProxyPolicy(next.proxyPolicy),
    runReadiness: next.runReadiness
      ? {
        ...next.runReadiness,
        checks: next.runReadiness.checks.map((check) => normalizeCodexStackRunReadinessCheck(
          check,
          text("查看详情", "View details"),
        )),
      }
      : next.runReadiness,
  };
}

function isSmokeMatrixStale(matrix: CodexStackSmokeMatrixResult | null | undefined): boolean {
  if (!matrix?.attachEligible) return false;
  const checkedAt = Date.parse(matrix.checkedAt);
  if (!Number.isFinite(checkedAt)) return true;
  return Date.now() - checkedAt > SMOKE_MATRIX_MAX_AGE_MS;
}

function serviceEndpointInfo(serviceId: CodexStackServiceId, currentSummary: CodexStackSummaryPayload) {
  if (serviceId === "cli-proxy-api.service") {
    return {
      endpointLabel: text("端口", "Port"),
      endpointValue: portDisplay(currentSummary.ports.cpa, currentSummary.ports.detectedCpa),
    };
  }
  if (serviceId === "cpa-compact-proxy.service") {
    return {
      endpointLabel: text("端口", "Port"),
      endpointValue: portDisplay(currentSummary.ports.compact, currentSummary.ports.detectedCompact),
    };
  }
  if (serviceId === "cc-connect.service") {
    return {
      endpointLabel: text("套接字", "Socket"),
      endpointValue: currentSummary.ccConnect.socketPath || "--",
    };
  }
  return {
    endpointLabel: text("类型", "Type"),
    endpointValue: text("systemd 定时器", "systemd timer"),
  };
}

function isSummaryServiceActive(serviceId: CodexStackServiceId): boolean {
  return summary.value?.services.find((service) => service.id === serviceId)?.active === true;
}

function componentStatusLabel(component: CodexStackComponentSummary): string {
  const statusLabels: Record<CodexStackComponentStatus, string> = {
    ok: text("健康", "Healthy"),
    missing: text("缺失", "Missing"),
    degraded: text("降级", "Degraded"),
    failed: text("失败", "Failed"),
    unknown: text("未知", "Unknown"),
  };
  return statusLabels[component.status];
}

function jobStatusLabel(status: CodexStackJob["status"]): string {
  const labels: Record<CodexStackJob["status"], string> = {
    queued: text("排队中", "Queued"),
    running: text("执行中", "Running"),
    succeeded: text("已完成", "Succeeded"),
    failed: text("失败", "Failed"),
    interrupted: text("已中断", "Interrupted"),
  };
  return labels[status];
}

function guardMutation(): boolean {
  if (!canMutate.value) {
    notice.value = {
      kind: "error",
      text: text("请先启用管理动作。", "Enable management actions first."),
    };
    return false;
  }
  if (jobRunning.value) {
    activeSection.value = "logs";
    notice.value = {
      kind: "error",
      text: text("已有后台任务正在执行，请等待完成后再操作。", "A background job is already running. Wait for it to finish before making another change."),
    };
    return false;
  }
  return !busy.value;
}

function nextActionPrimary(): void {
  switch (activeRecommendation.value?.primaryAction) {
    case "run-check":
      void runCheck();
      return;
    case "repair-recommended":
      void repairRecommended();
      return;
    case "open-install":
      activeSection.value = "install";
      return;
    case "open-cc-connect":
      activeSection.value = "cc-connect";
      return;
    case "open-logs":
      activeSection.value = "logs";
      return;
    case "open-settings":
      activeSection.value = "settings";
      return;
    default:
      activeSection.value = nextActionSection.value;
  }
}

function runReadinessCheckAction(check: CodexStackRunReadinessCheck): void {
  const command = resolveCodexStackRunReadinessAction(check, text("查看详情", "View details"));
  if (command.type === "run-check") {
    void runCheck();
    return;
  }
  if (command.type === "repair") {
    void startRepairWithActions(command.actions, text("就绪检查修复任务已启动。", "Readiness repair job started."));
    return;
  }
  activeSection.value = command.section;
}

function hydrateConfigFormFromSummary(normalized: CodexStackSummaryPayload): void {
  configForm.defaultModel = normalized.models.current || normalized.profile.defaultModel || normalized.models.defaultModel || "kimi-k2.6";
  configForm.contextMode = normalized.context.mode || "default";
  configForm.contextWindowTokens = normalized.context.tokens || normalized.context.recommendedTokens;
  configForm.cpaPort = normalized.ports.cpa;
  configForm.compactPort = normalized.ports.compact;
  configForm.ccConnectProject = normalized.ccConnect.project || normalized.profile.ccConnectProject || "main";
  configForm.upstreamBaseUrl = normalized.proxyPolicy.upstreamBaseUrl || "";
  configForm.upstreamApiKey = "";
  configForm.providerProxyUrl = normalized.proxyPolicy.providerProxyUrl || "";
  configForm.noProxy = normalized.proxyPolicy.noProxy || DEFAULT_NO_PROXY;
}

function hydrateInstallFormFromSummary(normalized: CodexStackSummaryPayload): void {
  installForm.model = normalized.models.current || normalized.profile.defaultModel || normalized.models.defaultModel || "kimi-k2.6";
  installForm.contextMode = normalized.context.mode || "default";
  installForm.contextWindowTokens = normalized.context.tokens || normalized.context.recommendedTokens;
  installForm.cpaPort = normalized.ports.cpa;
  installForm.compactPort = normalized.ports.compact;
  installForm.channel = normalized.installer.channel;
  installForm.cpaKey = "";
  installForm.upstreamBaseUrl = normalized.proxyPolicy.upstreamBaseUrl || "";
  installForm.upstreamApiKey = "";
  installForm.providerProxyUrl = normalized.proxyPolicy.providerProxyUrl || "";
  installForm.noProxy = normalized.proxyPolicy.noProxy || DEFAULT_NO_PROXY;
  installForm.skipNpm = false;
  installForm.skipCcConnect = false;
  installForm.noStart = false;
  installForm.skipExisting = false;
  installForm.forceReinstall = false;
  installForm.skipComponents = [];
  installForm.forceComponents = [];
}

function applySummary(next: CodexStackSummaryPayload, options: ApplySummaryOptions = {}): void {
  const keepConfigDraft = (options.preserveDirtyConfigDraft ?? true)
    && Boolean(summary.value)
    && hasConfigPatchChanges.value;
  const keepInstallDraft = (options.preserveDirtyInstallDraft ?? true)
    && Boolean(summary.value)
    && hasInstallDraftChanges.value;
  const normalized = normalizeCodexStackSummary(next);
  summary.value = normalized;
  if (!keepInstallDraft) hydrateInstallFormFromSummary(normalized);
  if (!keepConfigDraft) hydrateConfigFormFromSummary(normalized);
}

async function loadSummary(): Promise<void> {
  loading.value = true;
  try {
    applySummary(await fetchCodexStackSummary());
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("读取状态失败", "Failed to load status"),
    };
  } finally {
    loading.value = false;
  }
}

async function loadCcConnectConfig(silent = false, options: CcConnectLoadOptions = {}): Promise<void> {
  const preserveDirtyDrafts = options.preserveDirtyDrafts ?? true;
  const keepRawDraft = preserveDirtyDrafts
    && Boolean(ccConnectConfig.value)
    && hasCcConnectRawChanges.value;
  const keepStructuredDraft = preserveDirtyDrafts
    && Boolean(ccConnectConfig.value)
    && hasCcConnectStructuredChanges.value;
  ccConnectLoading.value = true;
  try {
    const config = await fetchCcConnectConfig();
    ccConnectConfig.value = config;
    if (!keepRawDraft) ccConnectRawDraft.value = config.raw;
    if (!keepStructuredDraft) hydrateCcConnectStructuredDraft(config);
  } catch (error) {
    if (!silent) {
      notice.value = {
        kind: "error",
        text: error instanceof Error ? error.message : text("读取 cc-connect 配置失败", "Failed to load cc-connect config"),
      };
    }
  } finally {
    ccConnectLoading.value = false;
  }
}

async function loadAll(silent = false, ccConnectOptions: CcConnectLoadOptions = {}): Promise<void> {
  await Promise.all([loadSummary(), loadCcConnectConfig(silent, ccConnectOptions)]);
}

async function enableManagement(): Promise<void> {
  busy.value = true;
  try {
    const response = await enableCodexStackManagement();
    if (response.summary) applySummary(response.summary);
    notice.value = { kind: "success", text: text("已启用 Codex 栈管理动作。", "Codex Stack management actions enabled.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("启用失败", "Enable failed") };
  } finally {
    busy.value = false;
  }
}

function buildInstallPayload(skipCcConnect = installForm.skipCcConnect) {
  return {
    env: {
      CODEX_MODEL: installForm.model || undefined,
      CODEX_CONTEXT_MODE: installForm.contextMode,
      CODEX_CONTEXT_WINDOW: installForm.contextMode === "custom" ? Number(installForm.contextWindowTokens) || undefined : undefined,
      CPA_PORT: Number(installForm.cpaPort) || undefined,
      COMPACT_PORT: Number(installForm.compactPort) || undefined,
      CPA_PROXY_KEY: installForm.cpaKey || undefined,
      OPENCLAW_UPSTREAM_BASE_URL: installForm.upstreamBaseUrl || undefined,
      OPENCLAW_UPSTREAM_API_KEY: installForm.upstreamApiKey || undefined,
      OPENCLAW_PROVIDER_PROXY_URL: installForm.providerProxyUrl || undefined,
      OPENCLAW_NO_PROXY: installForm.noProxy || undefined,
    },
    flags: {
      skipNpm: installForm.skipNpm,
      skipCcConnect,
      noStart: installForm.noStart,
      skipExisting: installForm.skipExisting,
      forceReinstall: installForm.forceReinstall,
      skipComponents: installForm.skipComponents.length ? installForm.skipComponents : undefined,
      forceReinstallComponents: installForm.forceComponents.length ? installForm.forceComponents : undefined,
      channel: installForm.channel,
    },
  };
}

function stopPollingJob(): void {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function stopLogPolling(): void {
  if (logPollTimer) {
    window.clearInterval(logPollTimer);
    logPollTimer = null;
  }
}

function syncLogPolling(): void {
  stopLogPolling();
  if (!logAutoRefresh.value) return;
  logPollTimer = window.setInterval(() => {
    void loadLogs(selectedLogService.value, true);
  }, logLineMode.value === "deep" ? 6000 : 3500);
}

function startPollingJob(job: CodexStackJob): void {
  activeJob.value = job;
  stopPollingJob();
  pollTimer = window.setInterval(async () => {
    if (!activeJob.value) return;
    try {
      const response = await fetchCodexStackJob(activeJob.value.id);
      activeJob.value = response.job;
      if (!isCodexStackJobRunning(response.job)) {
        const finishedJob = response.job;
        stopPollingJob();
        await loadAll(true);
        if (finishedJob.kind === "install" && finishedJob.status === "succeeded" && summary.value) {
          hydrateInstallFormFromSummary(summary.value);
        }
        if (finishedJob.kind === "install" && finishedJob.status === "succeeded") {
          notice.value = {
            kind: "success",
            text: summary.value?.ccConnect.bindingPresent
              ? text("安装完成，cc-connect 已检测到绑定，可运行检查确认。", "Install completed. cc-connect binding was detected; run checks to confirm.")
              : text("安装完成。下一步在 cc-connect 面板执行 Feishu/Weixin 扫码绑定，绑定后点击 finalizer。", "Install completed. Next, run Feishu/Weixin QR binding in the cc-connect panel, then click the finalizer."),
          };
        }
      }
    } catch (error) {
      stopPollingJob();
      notice.value = {
        kind: "error",
        text: error instanceof Error ? error.message : text("任务状态轮询失败", "Failed to poll job status"),
      };
    }
  }, 2000);
}

async function installFullStack(): Promise<void> {
  if (!guardMutation()) return;
  
  if (installForm.cpaKey && installForm.cpaKey.length > 72) {
    notice.value = { kind: "error", text: text("代理密钥长度不能超过 72 个字符。", "Proxy key length cannot exceed 72 characters.") };
    return;
  }
  
  busy.value = true;
  try {
    const response = await startCodexStackInstall(buildInstallPayload(false));
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("安装任务已启动。", "Install job started.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("安装启动失败", "Install failed to start") };
  } finally {
    busy.value = false;
  }
}

async function installBaseOnly(): Promise<void> {
  if (!guardMutation()) return;
  
  if (installForm.cpaKey && installForm.cpaKey.length > 72) {
    notice.value = { kind: "error", text: text("代理密钥长度不能超过 72 个字符。", "Proxy key length cannot exceed 72 characters.") };
    return;
  }
  
  busy.value = true;
  try {
    const response = await startCodexStackInstall(buildInstallPayload(true));
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("基础安装任务已启动。", "Base install job started.") };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("安装启动失败", "Install failed to start") };
  } finally {
    busy.value = false;
  }
}

async function runCheck(): Promise<void> {
  busy.value = true;
  try {
    const response = await runCodexStackCheck();
    checkOutput.value = response.outputTail;
    notice.value = {
      kind: response.ok ? "success" : "error",
      text: response.ok ? text("检查完成。", "Check completed.") : text("检查发现失败项。", "Check found failures."),
    };
    await loadSummary();
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("检查失败", "Check failed") };
  } finally {
    busy.value = false;
  }
}

async function repairRecommended(): Promise<void> {
  if (!summary.value) return;
  await startRepairWithActions(
    buildCodexStackRepairActions(summary.value),
    text("修复任务已启动。", "Repair job started."),
  );
}

async function repairConflictingUnits(): Promise<void> {
  await startRepairWithActions(
    ["disable-conflicting-units", "restart-cpa", "restart-compact-proxy"],
    text("冲突服务清理任务已启动。", "Conflict cleanup repair job started."),
  );
}

async function repairConfigOnly(): Promise<void> {
  await startRepairWithActions(
    ["rerun-install-no-start"],
    text("配置修复任务已启动。", "Config repair job started."),
  );
}

async function pauseStack(): Promise<void> {
  await startRepairWithActions(
    ["pause-stack"],
    text("CPA 栈暂停任务已启动。", "CPA stack pause job started."),
  );
}

async function resumeStack(): Promise<void> {
  await startRepairWithActions(
    ["resume-stack"],
    text("CPA 栈恢复任务已启动。", "CPA stack resume job started."),
  );
}

async function runSmokeMatrix(): Promise<void> {
  await startRepairWithActions(
    ["run-smoke-matrix"],
    text("CPA 模型矩阵验证已启动；不会切换 Codex。", "CPA smoke matrix started; Codex will not be attached."),
  );
}

async function applyCodexCpaAfterSmoke(): Promise<void> {
  if (!canAttachCodexCpa.value) {
    notice.value = {
      kind: "error",
      text: text("请先运行“只验证”，并确认 glm-5.1 / kimi-k2.6 矩阵在 24 小时内全部通过。", "Run Verify Only first and make sure the glm-5.1 / kimi-k2.6 matrix fully passed within 24 hours."),
    };
    return;
  }
  await startRepairWithActions(
    ["apply-codex-cpa-after-smoke"],
    text("CPA smoke matrix 任务已启动；全部通过后才会切换 Codex。", "CPA smoke matrix started; Codex will attach only if every check passes."),
  );
}

async function startRepairWithActions(actions: CodexStackRepairAction[], successText: string): Promise<void> {
  if (!actions.length) return;
  if (!guardMutation()) return;
  busy.value = true;
  try {
    const response = await startCodexStackRepair({ actions });
    startPollingJob(response.job);
    notice.value = { kind: "success", text: successText };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("修复启动失败", "Repair failed to start") };
  } finally {
    busy.value = false;
  }
}

async function serviceAction(serviceId: CodexStackServiceId, action: CodexStackServiceAction): Promise<void> {
  if (!guardMutation()) return;
  if ((action === "start" || action === "restart") && serviceId === "cpa-compact-proxy.service" && !isSummaryServiceActive("cli-proxy-api.service")) {
    await resumeStack();
    return;
  }
  if ((action === "start" || action === "restart") && serviceId === "codex-stack-watchdog.timer" && (
    !isSummaryServiceActive("cli-proxy-api.service") || !isSummaryServiceActive("cpa-compact-proxy.service")
  )) {
    await resumeStack();
    return;
  }
  busy.value = true;
  try {
    const response = await controlCodexStackService(serviceId, action);
    if (response.summary) applySummary(response.summary);
    notice.value = { kind: "success", text: response.message };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("服务操作失败", "Service action failed") };
  } finally {
    busy.value = false;
  }
}

async function saveConfigPatch(): Promise<void> {
  if (!guardMutation()) return;
  const payload = configPatchPayload.value;
  if (!Object.keys(payload).length) {
    notice.value = { kind: "success", text: text("运行配置没有变化。", "Runtime config has no changes.") };
    return;
  }
  busy.value = true;
  try {
    const response = await patchCodexStackConfig(payload);
    restartRequiredUnits.value = response.restartRequiredUnits || [];
    configForm.cpaProxyKey = "";
    configForm.upstreamApiKey = "";
    if (response.summary) applySummary(response.summary, { preserveDirtyConfigDraft: false });
    notice.value = { kind: "success", text: response.message };
  } catch (error) {
    notice.value = { kind: "error", text: error instanceof Error ? error.message : text("配置保存失败", "Config save failed") };
  } finally {
    busy.value = false;
  }
}

function addCcConnectProvider(): void {
  ccConnectProviderDrafts.value.push(createProviderDraft({
    name: ccConnectProviderDrafts.value.some((provider) => provider.name === "cpa")
      ? `provider-${ccConnectProviderDrafts.value.length + 1}`
      : "cpa",
  }));
}

function removeCcConnectProvider(providerId: string): void {
  ccConnectProviderDrafts.value = ccConnectProviderDrafts.value.filter((provider) => provider.id !== providerId);
}

function addCcConnectProject(): void {
  const project = createProjectDraft({
    name: `project-${ccConnectProjectDrafts.value.length + 1}`,
  });
  ccConnectProjectDrafts.value.push(project);
  selectedProjectDraftId.value = project.id;
  activeAgentPane.value = "projects";
}

function addCcConnectProjectPreset(preset: AgentProjectPreset): void {
  const index = ccConnectProjectDrafts.value.length + 1;
  const homeDir = summary.value?.homeDir || "~";
  const project = createProjectDraft({
    name: preset === "admin" && !ccConnectProjectDrafts.value.some((item) => item.name === "main") ? "main" : `${preset}-agent-${index}`,
    adminFrom: "",
    agentType: "codex",
    agentOptions: {
      workDir: preset === "admin" ? `${homeDir}/.openclaw` : `${homeDir}/.openclaw/workspace/${preset}-agent-${index}`,
      mode: preset === "admin" ? "suggest" : "yolo",
      model: configForm.defaultModel || installForm.model || summary.value?.models.current || "kimi-k2.6",
    },
    platforms: [{ type: installForm.channel === "official" ? "dmwork" : (installForm.channel === "octo" ? "octo" : "dmwork"), options: { api_url: "https://im.deepminer.com.cn/api" } }],
  });
  ccConnectProjectDrafts.value.push(project);
  selectedProjectDraftId.value = project.id;
  activeAgentPane.value = "projects";
}

function removeCcConnectProject(projectId: string): void {
  ccConnectProjectDrafts.value = ccConnectProjectDrafts.value.filter((project) => project.id !== projectId);
  if (selectedProjectDraftId.value === projectId) {
    selectedProjectDraftId.value = ccConnectProjectDrafts.value[0]?.id || "";
  }
}

function selectCcConnectProject(projectId: string): void {
  selectedProjectDraftId.value = projectId;
  activeAgentPane.value = "projects";
}

function removeCcConnectPlatform(project: CcConnectProjectDraft, platformId: string): void {
  project.platforms = project.platforms.filter((platform) => platform.id !== platformId);
}

function addPlatformToSelectedProject(type: PlatformTemplateId = "octo"): void {
  if (!selectedProjectDraft.value) return;
  selectedProjectDraft.value.platforms.push(createPlatformDraft(undefined, type));
}

function removePlatformFromSelectedProject(platformId: string): void {
  if (!selectedProjectDraft.value) return;
  removeCcConnectPlatform(selectedProjectDraft.value, platformId);
}

function addCcConnectPlatformOption(platform: CcConnectPlatformDraft): void {
  platform.optionRows.push(createPlatformOptionDraft());
}

function removeCcConnectPlatformOption(platform: CcConnectPlatformDraft, optionId: string): void {
  platform.optionRows = platform.optionRows.filter((row) => row.id !== optionId);
}

function applyDefaultModelToCcConnectProjects(): void {
  const nextModel = configForm.defaultModel || installForm.model || summary.value?.models.current || "";
  if (!nextModel) return;
  for (const project of ccConnectProjectDrafts.value) {
    project.agentOptions.model = nextModel;
  }
}

function ensureCpaProviderDraft(): void {
  const existing = ccConnectProviderDrafts.value.find((provider) => provider.name === "cpa");
  if (existing) {
    existing.baseUrl = existing.baseUrl || compactProxyBaseUrl.value;
    existing.codexEnvKey = existing.codexEnvKey || "OPENAI_API_KEY";
    return;
  }
  ccConnectProviderDrafts.value.unshift(createProviderDraft({ name: "cpa", baseUrl: compactProxyBaseUrl.value }));
}

async function saveCcConnectStructured(): Promise<void> {
  if (!hasCcConnectStructuredChanges.value) {
    notice.value = { kind: "success", text: text("cc-connect 可视化配置没有变化。", "cc-connect visual config has no changes.") };
    return;
  }
  if (!guardMutation()) return;
  const confirmed = await confirm({
    title: text("保存 cc-connect 可视化配置", "Save cc-connect visual config"),
    message: text(
      "保存后会重写 providers/projects 区块；原始 TOML 的其它全局段会尽量保留，cc-connect.service 如在运行会自动重启。继续吗？",
      "Saving rewrites providers/projects sections while preserving other global TOML blocks where possible. cc-connect.service restarts if it is running. Continue?",
    ),
    confirmText: text("保存并应用", "Save and apply"),
    cancelText: text("取消", "Cancel"),
    tone: "safe",
  });
  if (!confirmed) return;

  busy.value = true;
  try {
    const response = await patchCcConnectConfig({
      language: ccConnectLanguageDraft.value.trim() || "zh",
      providers: normalizeProviderDrafts(),
      projects: normalizeProjectDrafts(),
    });
    restartRequiredUnits.value = response.restartRequiredUnits || [];
    if (response.summary) applySummary(response.summary);
    await loadCcConnectConfig(true, { preserveDirtyDrafts: false });
    notice.value = { kind: "success", text: response.message };
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("保存 cc-connect 可视化配置失败", "Failed to save cc-connect visual config"),
    };
  } finally {
    busy.value = false;
  }
}

async function saveCcConnectRaw(): Promise<void> {
  if (!hasCcConnectRawChanges.value) {
    notice.value = { kind: "success", text: text("cc-connect 配置没有变化。", "cc-connect config has no changes.") };
    return;
  }
  if (!guardMutation()) return;
  const confirmed = await confirm({
    title: text("保存 cc-connect 配置", "Save cc-connect config"),
    message: text(
      "保存后如果 cc-connect.service 正在运行会自动重启。继续吗？",
      "Saving will restart cc-connect.service if it is running. Continue?",
    ),
    confirmText: text("保存并应用", "Save and apply"),
    cancelText: text("取消", "Cancel"),
    tone: "safe",
  });
  if (!confirmed) return;

  busy.value = true;
  try {
    const response = await patchCcConnectConfig({ raw: ccConnectRawDraft.value });
    restartRequiredUnits.value = response.restartRequiredUnits || [];
    if (response.summary) applySummary(response.summary);
    await loadCcConnectConfig(true, { preserveDirtyDrafts: false });
    notice.value = { kind: "success", text: response.message };
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("保存 cc-connect 配置失败", "Failed to save cc-connect config"),
    };
  } finally {
    busy.value = false;
  }
}

async function copySetupCommand(platform: "feishu" | "weixin"): Promise<void> {
  const command = `cc-connect ${platform} setup --project ${primaryCcConnectProjectName.value}`;
  const copied = await copyTextToClipboard(command);
  notice.value = copied
    ? { kind: "success", text: text(`已复制命令: ${command}`, `Copied command: ${command}`) }
    : { kind: "error", text: text(`复制失败，请手动执行: ${command}`, `Copy failed. Run manually: ${command}`) };
}

async function finalizeCcConnect(): Promise<void> {
  if (!guardMutation()) return;
  busy.value = true;
  try {
    const response = await finalizeCodexStackCcConnect({ project: summary.value?.ccConnect.project || "main" });
    startPollingJob(response.job);
    notice.value = { kind: "success", text: text("cc-connect finalizer 已启动。", "cc-connect finalizer started.") };
  } catch (error) {
    notice.value = {
      kind: "error",
      text: error instanceof Error ? error.message : text("cc-connect finalizer 失败", "cc-connect finalizer failed"),
    };
  } finally {
    busy.value = false;
  }
}

async function loadLogs(serviceId: CodexStackServiceId, silent = false): Promise<void> {
  if (logRequestInFlight) {
    queuedLogRequest = { serviceId, silent };
    return;
  }
  logRequestInFlight = true;
  selectedLogService.value = serviceId;
  logRefreshing.value = true;
  try {
    const response = await fetchCodexStackLogs(serviceId, logLineLimit.value);
    logOutput.value = response.output;
    logMeta.value = response;
  } catch (error) {
    if (!silent) {
      notice.value = { kind: "error", text: error instanceof Error ? error.message : text("读取日志失败", "Failed to load logs") };
    }
  } finally {
    logRefreshing.value = false;
    logRequestInFlight = false;
    const nextRequest = queuedLogRequest;
    queuedLogRequest = null;
    if (nextRequest) {
      void loadLogs(nextRequest.serviceId, nextRequest.silent);
    }
  }
}

function installMode(componentId: CodexStackComponentId): ComponentInstallMode {
  if (installForm.skipComponents.includes(componentId)) return "skip";
  if (installForm.forceComponents.includes(componentId)) return "force";
  return "default";
}

function setComponentMode(componentId: CodexStackComponentId, mode: ComponentInstallMode): void {
  removeFromArray(installForm.skipComponents, componentId);
  removeFromArray(installForm.forceComponents, componentId);
  if (mode === "skip") installForm.skipComponents.push(componentId);
  if (mode === "force") installForm.forceComponents.push(componentId);
}

function installModeLabel(componentId: CodexStackComponentId): string {
  const mode = installMode(componentId);
  if (mode === "skip") return text("当前将跳过安装或覆盖。", "This component will be skipped.");
  if (mode === "force") return text("当前将强制重新安装。", "This component will be force reinstalled.");
  return text("保持默认安装策略。", "Default install behavior.");
}

function removeFromArray(list: string[], value: string): void {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1);
}

onMounted(() => {
  void loadAll(true);
  void loadLogs(selectedLogService.value);
});

onUnmounted(() => {
  stopPollingJob();
  stopLogPolling();
});

watch([logAutoRefresh, logLineMode, selectedLogService], () => {
  syncLogPolling();
  void loadLogs(selectedLogService.value, true);
});

watch(() => installForm.channel, (nextChannel, previousChannel) => {
  syncInstallChannelDefaults(nextChannel, previousChannel);
});
</script>

<style scoped>
.codex-stack-page {
  gap: 18px;
}

.cs-page-subtitle {
  margin: 6px 0 0;
  color: var(--text-soft);
  max-width: 980px;
}

.cs-lock-card,
.cs-hero-card,
.cs-model-ribbon {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.cs-lock-card p,
.cs-section-copy,
.cs-field-hint,
.cs-hero-description,
.cs-service-blurb {
  color: var(--text-soft);
}

.cs-workspace {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.cs-sidebar {
  position: sticky;
  top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-lg) + 4px);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 88%, #0b1018 12%), color-mix(in srgb, var(--surface) 94%, transparent)),
    var(--surface);
}

.cs-nav-button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 18px;
  padding: 12px 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.cs-nav-button svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

.cs-nav-button span {
  font-size: 0.82rem;
  line-height: 1.2;
  text-align: left;
}

.cs-nav-button:hover,
.cs-nav-button-active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--acc) 40%, var(--line));
  background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 14%, transparent), color-mix(in srgb, var(--surface) 92%, transparent));
  transform: translateY(-1px);
}

.cs-content,
.cs-section-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.cs-model-ribbon {
  align-items: flex-start;
  border-color: color-mix(in srgb, var(--acc) 22%, var(--line));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--sky) 16%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 94%, #132132 6%), var(--surface));
}

.cs-model-ribbon h3 {
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.8rem);
}

.cs-model-ribbon p {
  margin: 8px 0 0;
  color: var(--text-soft);
}

.cs-model-ribbon-side {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-hero-actions,
.cs-actions,
.cs-platform-badges {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cs-hero-card {
  align-items: flex-start;
  padding: 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--acc) 18%, transparent), transparent 36%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 92%, #071018 8%), var(--surface));
}

.cs-model-catalog-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--code-bg) 18%, transparent)),
    var(--surface);
}

.form-help {
  color: var(--text-soft);
  font-size: 0.84rem;
}

.cs-model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cs-model-list span {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 7px 10px;
  background: color-mix(in srgb, var(--code-bg) 42%, transparent);
  color: var(--text);
  font-size: 0.84rem;
}

.cs-model-list {
  margin-top: 14px;
  max-height: 220px;
  overflow: auto;
}

.cs-model-list .cs-model-current {
  border-color: color-mix(in srgb, var(--success) 48%, var(--line));
  background: color-mix(in srgb, var(--success) 18%, var(--surface));
  font-weight: 700;
}

.cs-hero-copy {
  min-width: 0;
}

.cs-hero-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cs-hero-title-row h3,
.cs-section-intro h3 {
  margin: 0;
  font-size: clamp(1.35rem, 2vw, 1.8rem);
}

.cs-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.cs-info-chip,
.cs-status-pill,
.cs-progress-badge,
.cs-chip,
.cs-restart-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--text-soft);
  font-size: 0.85rem;
}

.cs-status-pill {
  font-weight: 600;
  color: var(--text);
}

.cs-restart-hint-block {
  align-items: flex-start;
  flex-direction: column;
  border-radius: 8px;
  width: 100%;
}

.cs-restart-hint-block small {
  color: var(--text-muted);
  line-height: 1.45;
}

.cs-card-header,
.cs-provider-head,
.cs-platform-head,
.cs-project-head,
.cs-progress-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-card-header h4,
.cs-provider-head strong,
.cs-platform-head strong,
.cs-project-head h5,
.cs-progress-header h4 {
  margin: 0;
}

.cs-project-head p {
  margin: 4px 0 0;
  color: var(--text-soft);
}

.cs-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.cs-kv-list {
  display: grid;
  gap: 10px;
}

.cs-kv-row {
  display: grid;
  grid-template-columns: minmax(120px, 180px) 1fr;
  gap: 12px;
  align-items: start;
}

.cs-kv-row span {
  color: var(--muted);
  font-size: 0.9rem;
}

.cs-kv-row code {
  color: var(--text);
  background: color-mix(in srgb, var(--code-bg) 84%, transparent);
  border-radius: 10px;
  padding: 6px 10px;
  word-break: break-word;
}

.cs-project-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cs-provider-card,
.cs-platform-card,
.cs-project-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  padding: 14px;
}

.cs-warning-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cs-warning-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--warning) 28%, var(--line));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.cs-warning-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 18%, transparent);
  color: var(--warning);
  font-weight: 700;
  flex: 0 0 auto;
}

.cs-empty,
.cs-empty-lite {
  padding: 20px;
  color: var(--text-soft);
}

.cs-empty-lite {
  padding: 18px 0 0;
}

.cs-install-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cs-section-intro {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.cs-install-shell-busy > *:not(.cs-install-overlay) {
  opacity: 0.42;
}

.cs-code,
.cs-raw-editor {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  background: var(--code-bg);
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0;
}

.cs-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-form-span-2 {
  grid-column: 1 / -1;
}

.cs-config-action-strip {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--success) 12%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 92%, #101820 8%), var(--surface));
}

.cs-config-action-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.cs-config-action-strip h4 {
  margin: 0;
}

.cs-config-action-strip p:not(.cs-section-kicker) {
  margin: 6px 0 0;
  color: var(--text-soft);
}

.cs-provider-grid,
.cs-platform-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-agent-workbench {
  display: grid;
  grid-template-columns: minmax(240px, 0.34fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.cs-agent-savebar {
  position: sticky;
  top: 14px;
  z-index: 2;
}

.cs-agent-rail {
  position: sticky;
  top: 92px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cs-agent-pane-switch {
  display: grid;
  gap: 8px;
}

.cs-agent-pane-button,
.cs-agent-project-pill {
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  color: var(--text-soft);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.cs-agent-pane-button {
  border-radius: 16px;
  padding: 12px 14px;
  text-align: left;
  font-weight: 650;
}

.cs-agent-pane-button-active,
.cs-agent-project-pill-active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--acc) 44%, var(--line));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--acc) 14%, transparent), color-mix(in srgb, var(--surface) 96%, transparent)),
    var(--surface);
}

.cs-agent-pane-button:hover,
.cs-agent-project-pill:hover {
  transform: translateY(-1px);
}

.cs-agent-rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.cs-agent-project-rail {
  min-width: 0;
}

.cs-agent-project-pill {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border-radius: 16px;
  padding: 12px;
  margin-top: 8px;
  text-align: left;
}

.cs-agent-project-pill span {
  color: var(--muted);
  font-size: 0.82rem;
}

.cs-agent-stage {
  min-width: 0;
}

.cs-agent-template-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.cs-agent-template-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  border: 1px solid color-mix(in srgb, var(--acc) 22%, var(--line));
  border-radius: var(--radius-lg);
  padding: 14px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--acc) 10%, transparent), transparent 34%),
    color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-agent-template-card p {
  margin: 6px 0 0;
  color: var(--text-soft);
  font-size: 0.88rem;
}

.cs-agent-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.32fr);
  gap: 18px;
  align-items: start;
  margin-top: 16px;
}

.cs-agent-editor-main,
.cs-agent-editor-side {
  min-width: 0;
}

.cs-agent-editor-side {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--sky) 14%, transparent), transparent 36%),
    color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-subsection-header-tight {
  margin-top: 22px;
}

.cs-provider-grid-roomy,
.cs-platform-grid-roomy {
  grid-template-columns: repeat(2, minmax(280px, 1fr));
  margin-top: 16px;
}

.cs-form-grid-compact {
  margin-top: 12px;
}

.cs-language-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.86rem;
}

.cs-language-field .form-input {
  width: 84px;
}

.cs-project-head {
  align-items: flex-start;
}

.cs-project-meta {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.cs-subsection-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 18px 0 12px;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
}

.cs-subsection-header strong {
  display: block;
  color: var(--text);
}

.cs-subsection-header p {
  margin: 4px 0 0;
  color: var(--text-soft);
}

.cs-platform-template-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.cs-option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.cs-option-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) minmax(160px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.cs-inline-textarea {
  min-height: 86px;
  resize: vertical;
}

.cs-raw-editor {
  min-height: 420px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.tone-sage {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 34%, var(--line));
  background: color-mix(in srgb, var(--success) 13%, var(--surface));
}

.tone-accent {
  color: var(--acc);
  border-color: color-mix(in srgb, var(--acc) 38%, var(--line));
  background: color-mix(in srgb, var(--acc) 14%, var(--surface));
}

.tone-danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 38%, var(--line));
  background: color-mix(in srgb, var(--danger) 12%, var(--surface));
}

.tone-neutral {
  color: var(--text-soft);
  border-color: color-mix(in srgb, var(--muted) 32%, var(--line));
  background: color-mix(in srgb, var(--muted) 12%, var(--surface));
}

.cs-status-pill.tone-sage {
  color: #073b20;
  border-color: #8fd8a6;
  background: #dff8e7;
}

.cs-status-pill.tone-accent {
  color: #17335f;
  border-color: #9ec2ff;
  background: #e4efff;
}

.cs-status-pill.tone-danger {
  color: #651d19;
  border-color: #f1a9a1;
  background: #ffe4e0;
}

.cs-status-pill.tone-neutral {
  color: #263241;
  border-color: #c5ced8;
  background: #eef2f6;
}

.text-button {
  border: none;
  background: transparent;
  color: var(--acc);
  cursor: pointer;
  padding: 4px 0;
  font: inherit;
  font-size: 0.86rem;
}

.text-button:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.danger-text {
  color: var(--danger);
}

@keyframes cs-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@media (max-width: 960px) {
  .cs-workspace {
    grid-template-columns: 1fr;
  }

  .cs-sidebar {
    position: static;
    flex-direction: row;
    overflow: auto;
  }

  .cs-nav-button {
    min-width: 92px;
    justify-content: center;
  }

  .cs-dashboard-grid,
  .cs-form-grid,
  .cs-provider-grid,
  .cs-platform-grid,
  .cs-agent-workbench,
  .cs-agent-editor-grid,
  .cs-agent-template-row {
    grid-template-columns: 1fr;
  }

  .cs-agent-rail,
  .cs-agent-savebar {
    position: static;
  }

  .cs-kv-row {
    grid-template-columns: 1fr;
  }

  .cs-option-row {
    grid-template-columns: 1fr;
  }

  .cs-lock-card,
  .cs-hero-card,
  .cs-model-ribbon,
  .cs-config-action-strip,
  .cs-section-intro,
  .cs-card-header,
  .cs-provider-head,
  .cs-platform-head,
  .cs-project-head,
  .cs-agent-template-card,
  .cs-subsection-header {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-model-ribbon-side {
    justify-content: flex-start;
  }

  .cs-agent-pane-switch {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
