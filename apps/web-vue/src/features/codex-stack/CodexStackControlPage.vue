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
      <article v-if="activeJob" class="panel-card cs-job-banner" :class="jobStateClass(activeJob.status)">
        <div>
          <p class="cs-job-eyebrow">{{ text("后台任务", "Background Job") }}</p>
          <h3>{{ activeJobTitle }}</h3>
          <p class="cs-job-meta">
            {{ activeJob.commandLabel }} · {{ jobStatusLabel(activeJob.status) }} · {{ formatTimestamp(activeJob.updatedAt) }}
          </p>
        </div>
        <div class="cs-job-actions">
          <button type="button" class="secondary-button" @click="activeSection = 'logs'">
            {{ text("查看输出", "View Output") }}
          </button>
          <button
            v-if="!isCodexStackJobRunning(activeJob)"
            type="button"
            class="secondary-button"
            @click="activeJob = null"
          >
            {{ text("关闭", "Dismiss") }}
          </button>
        </div>
      </article>

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

              <div class="cs-command-grid">
                <article class="panel-card cs-readiness-card">
                  <p class="cs-section-kicker">{{ text("就绪度", "Readiness") }}</p>
                  <div class="cs-readiness-meter">
                    <strong>{{ readyComponentCount }}/{{ summary.components.length }}</strong>
                    <span>{{ text("组件健康", "healthy components") }}</span>
                  </div>
                  <div class="cs-readiness-bar">
                    <span :style="{ width: readinessPercent }"></span>
                  </div>
                  <p class="cs-field-hint">
                    {{ issueCount ? text(`还有 ${issueCount} 个组件需要处理。`, `${issueCount} components need attention.`) : text("组件和服务状态稳定。", "Components and services are stable.") }}
                  </p>
                </article>
                <article class="panel-card cs-next-card">
                  <p class="cs-section-kicker">{{ text("建议下一步", "Suggested Next Step") }}</p>
                  <h4>{{ nextActionTitle }}</h4>
                  <p>{{ nextActionCopy }}</p>
                  <div class="cs-actions">
                    <button type="button" class="primary-button" :disabled="nextActionRequiresMutation ? !canRunMutation : busy" @click="nextActionPrimary">
                      {{ nextActionButton }}
                    </button>
                    <button type="button" class="secondary-button" @click="activeSection = nextActionSection">
                      {{ text("打开对应页面", "Open Section") }}
                    </button>
                  </div>
                </article>
                <article class="panel-card cs-next-card">
                  <p class="cs-section-kicker">{{ text("模型来源", "Model Source") }}</p>
                  <h4>{{ modelSourceLabel }}</h4>
                  <p>{{ modelSourceHelp }}</p>
                  <div class="cs-model-preview">
                    <span v-for="model in modelCatalogPreview" :key="model">{{ model }}</span>
                  </div>
                </article>
              </div>

              <div class="cs-service-grid">
                <article v-for="service in serviceCards" :key="service.id" class="panel-card cs-service-card">
                  <div class="cs-service-card-head">
                    <div class="cs-service-title">
                      <span :class="`cs-dot tone-${service.tone}`"></span>
                      <div>
                        <h4>{{ service.label }}</h4>
                        <p>{{ service.stateLabel }}</p>
                      </div>
                    </div>
                    <span class="cs-service-badge" :class="service.active ? 'cs-service-badge-live' : 'cs-service-badge-off'">
                      {{ service.active ? text("运行中", "Running") : text("已停止", "Stopped") }}
                    </span>
                  </div>
                  <p class="cs-service-blurb">{{ service.blurb }}</p>
                  <dl class="cs-stat-list">
                    <div>
                      <dt>{{ service.endpointLabel }}</dt>
                      <dd>{{ service.endpointValue }}</dd>
                    </div>
                    <div>
                      <dt>{{ text("启用状态", "Enabled") }}</dt>
                      <dd>{{ service.enabledLabel }}</dd>
                    </div>
                    <div>
                      <dt>{{ text("systemd 状态", "Systemd") }}</dt>
                      <dd>{{ service.rawState }}</dd>
                    </div>
                  </dl>
                  <div class="cs-service-card-actions">
                    <button
                      type="button"
                      class="secondary-button"
                      :disabled="!canRunMutation || service.active"
                      @click="serviceAction(service.id, 'start')"
                    >
                      {{ text("启动", "Start") }}
                    </button>
                    <button
                      type="button"
                      class="secondary-button"
                      :disabled="!canRunMutation || !service.active"
                      @click="serviceAction(service.id, 'stop')"
                    >
                      {{ text("停止", "Stop") }}
                    </button>
                    <button
                      type="button"
                      class="secondary-button"
                      :disabled="!canRunMutation"
                      @click="serviceAction(service.id, 'restart')"
                    >
                      {{ text("重启", "Restart") }}
                    </button>
                  </div>
                </article>
              </div>

              <div class="cs-dashboard-grid">
                <article class="panel-card">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("速览", "Quick Info") }}</p>
                      <h4>{{ text("运行摘要", "Runtime Summary") }}</h4>
                    </div>
                  </div>
                  <dl class="cs-kv-list cs-kv-list-spacious">
                    <div class="cs-kv-row">
                      <span>{{ text("模型", "Model") }}</span>
                      <code>{{ summary.models.current || summary.profile.defaultModel || "--" }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("渠道", "Channel") }}</span>
                      <code>{{ channelLabel(summary.installer.channel) }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>CPA</span>
                      <code>{{ portDisplay(summary.ports.cpa, summary.ports.detectedCpa) }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>Compact</span>
                      <code>{{ portDisplay(summary.ports.compact, summary.ports.detectedCompact) }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("上游代理", "Upstream Proxy") }}</span>
                      <code>{{ proxyPolicyLabel }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("模型矩阵", "Smoke Matrix") }}</span>
                      <code>{{ smokeMatrixLabel }}</code>
                    </div>
                    <div v-if="summary.profile.lastSmokeMatrix" class="cs-smoke-matrix-detail">
                      <div class="cs-smoke-matrix-head">
                        <span>{{ text("必测模型", "Required Models") }}</span>
                        <strong>{{ summary.profile.lastSmokeMatrix.requiredModels.join(", ") }}</strong>
                      </div>
                      <div class="cs-smoke-matrix-head">
                        <span>{{ text("可切换", "Attach Eligible") }}</span>
                        <strong>{{ summary.profile.lastSmokeMatrix.attachEligible ? text("是", "Yes") : text("否", "No") }}</strong>
                      </div>
                      <article v-for="model in summary.profile.lastSmokeMatrix.models" :key="model.model" class="cs-smoke-model-row">
                        <div>
                          <strong>{{ model.model }} · {{ model.status }}</strong>
                          <p>{{ smokeModelChecksLabel(model) }}</p>
                          <p v-if="model.error" class="cs-smoke-error">{{ model.error }}</p>
                        </div>
                      </article>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("cc-connect 项目", "cc-connect Project") }}</span>
                      <code>{{ summary.ccConnect.project || "main" }}</code>
                    </div>
                    <div class="cs-kv-row">
                      <span>{{ text("安装器版本", "Installer Version") }}</span>
                      <code>{{ summary.installer.version || "--" }}</code>
                    </div>
                  </dl>
                </article>

                <article class="panel-card">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("组件", "Components") }}</p>
                      <h4>{{ text("组件健康", "Component Health") }}</h4>
                    </div>
                  </div>
                  <div class="cs-component-list">
                    <article v-for="component in summary.components" :key="component.id" class="cs-component-card">
                      <div class="cs-component-head">
                        <div>
                          <strong>{{ component.label }}</strong>
                          <p>{{ componentStatusLabel(component) }}</p>
                        </div>
                        <span class="cs-status-pill" :class="`tone-${componentTone(component.status)}`">
                          {{ componentStatusLabel(component) }}
                        </span>
                      </div>
                      <p class="cs-component-version">
                        {{ text("版本", "Version") }} {{ component.version || (component.installed ? text("已安装", "Installed") : text("缺失", "Missing")) }}
                      </p>
                      <p v-if="component.notes.length" class="cs-component-notes">
                        {{ component.notes.join(" · ") }}
                      </p>
                    </article>
                  </div>
                </article>
              </div>

              <div class="cs-dashboard-grid">
                <article class="panel-card">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("健康检查", "Health Check") }}</p>
                      <h4>{{ text("检查输出", "Check Output") }}</h4>
                    </div>
                    <button type="button" class="secondary-button" :disabled="busy" @click="runCheck">
                      {{ text("重新运行", "Run Again") }}
                    </button>
                  </div>
                  <pre class="cs-code">{{ checkOutput || text("尚未运行健康检查。", "Health check output will appear here after you run it.") }}</pre>
                </article>

                <article class="panel-card">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("信号", "Signals") }}</p>
                      <h4>{{ text("提醒与风险", "Warnings and Risks") }}</h4>
                    </div>
                  </div>
                  <div v-if="summary.warnings.length" class="cs-warning-list">
                    <div v-for="warning in summary.warnings" :key="warning" class="cs-warning-row">
                      <span class="cs-warning-icon">!</span>
                      <span>{{ warning }}</span>
                    </div>
                  </div>
                  <div v-else class="cs-empty-lite">
                    {{ text("当前没有额外告警。", "No additional warnings right now.") }}
                  </div>
                </article>
              </div>
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

              <article class="panel-card cs-install-plan-card">
                <div>
                  <p class="cs-section-kicker">{{ text("当前计划", "Current Plan") }}</p>
                  <h4>{{ text("执行前确认", "Preflight Confirmation") }}</h4>
                  <p class="cs-field-hint">
                    {{ text("下面是安装脚本将使用的关键参数。强制/跳过策略会直接转成 auto-setup.sh 参数。", "These are the key parameters passed to the installer. Force/skip strategy maps directly to auto-setup.sh arguments.") }}
                  </p>
                </div>
                <div class="cs-install-plan-list">
                  <span v-for="item in installPlanHighlights" :key="item">{{ item }}</span>
                </div>
                <div class="cs-install-plan-actions">
                  <button type="button" class="primary-button cs-big-button" :disabled="!canRunMutation" @click="installFullStack">
                    {{ text("一键安装全部组件", "Install Full Stack") }}
                  </button>
                  <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="installBaseOnly">
                    {{ text("仅基础组件", "Base Only") }}
                  </button>
                  <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="repairRecommended">
                    {{ text("推荐修复", "Recommended Repair") }}
                  </button>
                </div>
              </article>

              <div class="cs-install-shell" :class="{ 'cs-install-shell-busy': activeJob && isCodexStackJobRunning(activeJob) }">
                <div
                  v-if="activeJob && isCodexStackJobRunning(activeJob)"
                  class="cs-install-overlay"
                >
                  <article class="panel-card cs-install-progress">
                    <div class="cs-card-header">
                      <div>
                        <p class="cs-section-kicker">{{ text("进度", "Progress") }}</p>
                        <h4>{{ text("任务执行中", "Task Running") }}</h4>
                      </div>
                      <span class="cs-progress-badge cs-progress-running">{{ activeJobTitle }} · {{ jobStatusLabel(activeJob.status) }}</span>
                    </div>
                    <p class="cs-progress-hint">
                      {{ text("安装或修复脚本正在后台执行，日志会持续刷新。", "The install or repair job is running in the background and the log tail is updating continuously.") }}
                    </p>
                    <div class="cs-job-progress-track" :style="{ '--progress': jobProgressPercent }">
                      <span></span>
                    </div>
                    <div class="cs-job-step-list">
                      <span
                        v-for="step in jobProgressSteps"
                        :key="step.label"
                        class="cs-job-step"
                        :class="`cs-job-step-${step.state}`"
                      >
                        {{ step.label }}
                      </span>
                    </div>
                    <pre class="cs-progress-log">{{ activeJob.logTail || text("等待输出...", "Waiting for output...") }}</pre>
                  </article>
                </div>

                <article
                  v-if="activeJob && !isCodexStackJobRunning(activeJob)"
                  class="panel-card"
                  :class="activeJob.status === 'succeeded' ? 'cs-result-ok' : 'cs-result-fail'"
                >
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("结果", "Result") }}</p>
                      <h4>{{ activeJob.status === "succeeded" ? text("任务完成", "Task Succeeded") : text("任务失败", "Task Failed") }}</h4>
                    </div>
                    <span class="cs-progress-badge" :class="activeJob.status === 'succeeded' ? 'cs-progress-ok' : 'cs-progress-fail'">
                      {{ activeJobTitle }} · {{ jobStatusLabel(activeJob.status) }}
                    </span>
                  </div>
                  <div class="cs-job-progress-track" :style="{ '--progress': jobProgressPercent }">
                    <span></span>
                  </div>
                  <div class="cs-job-step-list">
                    <span
                      v-for="step in jobProgressSteps"
                      :key="step.label"
                      class="cs-job-step"
                      :class="`cs-job-step-${step.state}`"
                    >
                      {{ step.label }}
                    </span>
                  </div>
                  <pre v-if="activeJob.error || activeJob.logTail" class="cs-progress-log">{{ activeJob.error || activeJob.logTail }}</pre>
                  <div class="cs-actions">
                    <button type="button" class="secondary-button" @click="activeJob = null">
                      {{ text("关闭摘要", "Dismiss Summary") }}
                    </button>
                  </div>
                </article>

                <div class="cs-install-grid">
                  <article class="panel-card">
                    <div class="cs-card-header">
                      <div>
                        <p class="cs-section-kicker">{{ text("步骤 1", "Step 1") }}</p>
                        <h4>{{ text("选择渠道", "Choose Channel") }}</h4>
                      </div>
                    </div>
                    <p class="cs-field-hint">
                      {{ text("DMWork / Octo 版本支持多渠道；官方版通过 npm 安装 cc-connect。", "DMWork / Octo supports multi-channel, while Official installs cc-connect from npm.") }}
                    </p>
                    <div class="cs-channel-grid">
                      <label class="cs-channel-card" :class="{ 'cs-channel-card-active': installForm.channel === 'dmwork' }">
                        <input v-model="installForm.channel" type="radio" value="dmwork" />
                        <strong>DMWork</strong>
                        <span>{{ text("增强版", "Enhanced") }}</span>
                        <p>{{ text("自编译二进制，三渠道支持。", "Self-built binary with three-channel support.") }}</p>
                      </label>
                      <label class="cs-channel-card" :class="{ 'cs-channel-card-active': installForm.channel === 'octo' }">
                        <input v-model="installForm.channel" type="radio" value="octo" />
                        <strong>Octo</strong>
                        <span>{{ text("增强版（推荐）", "Enhanced (Recommended)") }}</span>
                        <p>{{ text("DMWork 品牌升级版，后续主力维护。", "Rebranded DMWork, the primary channel going forward.") }}</p>
                      </label>
                      <label class="cs-channel-card" :class="{ 'cs-channel-card-active': installForm.channel === 'official' }">
                        <input v-model="installForm.channel" type="radio" value="official" />
                        <strong>{{ text("官方版", "Official") }}</strong>
                        <span>{{ text("走 npm 分发，适合标准环境。", "Distributed via npm for standard environments.") }}</span>
                        <p>{{ text("支持飞书 / 微信。", "Supports Feishu / Weixin.") }}</p>
                      </label>
                    </div>
                  </article>

                  <article class="panel-card cs-flow-card">
                    <div class="cs-card-header">
                      <div>
                        <p class="cs-section-kicker">{{ text("统一配置", "Unified Config") }}</p>
                        <h4>{{ text("模型与上游链路", "Model and Upstream Chain") }}</h4>
                      </div>
                    </div>
                    <p class="cs-field-hint">
                    {{ text("默认选择遵循 kimi-k2.6 → glm-5.1 → openclaw.json 默认模型；用户仍可手动改成任何 CPA 支持的模型。上游 API 进入 CPA，再由 Compact 暴露给 Codex 和 cc-connect。", "The default follows kimi-k2.6 → glm-5.1 → the openclaw.json default model, while users can still choose any model supported by CPA. Upstream API enters CPA, then Compact exposes it to Codex and cc-connect.") }}
                    </p>
                    <div class="cs-flow-steps">
                      <span>{{ text("上游 API", "Upstream API") }}</span>
                      <span>CPA :{{ installForm.cpaPort }}</span>
                      <span>Compact :{{ installForm.compactPort }}</span>
                      <span>{{ installForm.model || "--" }}</span>
                      <span>cc-connect</span>
                    </div>
                  </article>

                  <article class="panel-card">
                    <div class="cs-card-header">
                      <div>
                        <p class="cs-section-kicker">{{ text("步骤 2", "Step 2") }}</p>
                        <h4>{{ text("基础参数", "Core Parameters") }}</h4>
                      </div>
                    </div>
                    <div class="cs-form-grid">
                      <label class="form-field">
                        <span class="form-label">{{ text("默认模型", "Default Model") }}</span>
                        <select v-model="installForm.model" class="form-input">
                          <option v-for="model in modelOptions" :key="`install-${model}`" :value="model">{{ model }}</option>
                        </select>
                        <span class="form-help">{{ modelSourceLabel }}</span>
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text("CPA 端口", "CPA Port") }}</span>
                        <input v-model.number="installForm.cpaPort" class="form-input" type="number" min="1" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text("Compact 端口", "Compact Port") }}</span>
                        <input v-model.number="installForm.compactPort" class="form-input" type="number" min="1" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text("代理密钥", "Proxy Key") }}</span>
                        <input v-model="installForm.cpaKey" class="form-input" type="password" :maxlength="72" />
                        <span class="form-hint">{{ text("建议使用 16-72 个字符", "Recommended 16-72 characters") }}</span>
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text("Codex 上下文", "Codex Context") }}</span>
                        <select v-model="installForm.contextMode" class="form-input">
                          <option value="default">{{ text("默认上下文", "Default context") }}</option>
                          <option value="codex-1m">{{ text("1M 上下文", "1M context") }}</option>
                          <option value="custom">{{ text("自定义 token", "Custom tokens") }}</option>
                        </select>
                        <span class="form-help">{{ text("1M 适合支持大上下文的模型；默认模式不会写 model_context_window。", "1M is for large-context models; default mode does not write model_context_window.") }}</span>
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text("上下文 tokens", "Context tokens") }}</span>
                        <input
                          v-model.number="installForm.contextWindowTokens"
                          class="form-input"
                          type="number"
                          min="1000"
                          max="1050000"
                          step="1000"
                          :disabled="installContextTokensDisabled"
                        />
                      </label>
                    </div>
                  </article>
                </div>

                <article class="panel-card">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("步骤 3", "Step 3") }}</p>
                      <h4>{{ text("组件策略", "Component Strategy") }}</h4>
                    </div>
                  </div>
                  <p class="cs-field-hint">
                    {{ text("每个组件都可以保持默认、跳过，或强制重装。", "Each component can stay default, be skipped, or be force reinstalled.") }}
                  </p>
                  <div class="cs-component-mode-list">
                    <article v-for="component in componentOptions" :key="component.id" class="cs-component-mode-card">
                      <div>
                        <strong>{{ component.label }}</strong>
                        <p>{{ installModeLabel(component.id) }}</p>
                      </div>
                      <div class="cs-segmented">
                        <button
                          type="button"
                          class="cs-segmented-button"
                          :class="{ 'cs-segmented-button-active': installMode(component.id) === 'default' }"
                          @click="setComponentMode(component.id, 'default')"
                        >
                          {{ text("默认", "Default") }}
                        </button>
                        <button
                          type="button"
                          class="cs-segmented-button"
                          :class="{ 'cs-segmented-button-active': installMode(component.id) === 'skip' }"
                          @click="setComponentMode(component.id, 'skip')"
                        >
                          {{ text("跳过", "Skip") }}
                        </button>
                        <button
                          type="button"
                          class="cs-segmented-button"
                          :class="{ 'cs-segmented-button-active': installMode(component.id) === 'force' }"
                          @click="setComponentMode(component.id, 'force')"
                        >
                          {{ text("强制", "Force") }}
                        </button>
                      </div>
                    </article>
                  </div>
                </article>

                <details class="panel-card cs-details">
                  <summary>{{ text("高级选项", "Advanced Options") }}</summary>
                  <div class="cs-details-body">
                    <div class="cs-checkbox-grid">
                      <label class="cs-switch-row"><input v-model="installForm.skipNpm" type="checkbox" /> {{ text("跳过 npm 更新", "Skip npm update") }}</label>
                      <label class="cs-switch-row"><input v-model="installForm.skipCcConnect" type="checkbox" /> {{ text("跳过 cc-connect", "Skip cc-connect") }}</label>
                      <label class="cs-switch-row"><input v-model="installForm.noStart" type="checkbox" /> {{ text("只写配置不启动服务", "Write config only") }}</label>
                      <label class="cs-switch-row"><input v-model="installForm.skipExisting" type="checkbox" /> {{ text("自动跳过已安装组件", "Auto-skip installed") }}</label>
                      <label class="cs-switch-row"><input v-model="installForm.forceReinstall" type="checkbox" /> {{ text("强制全部重新安装", "Force reinstall all") }}</label>
                    </div>
                    <div class="cs-form-grid">
                      <label class="form-field">
                        <span class="form-label">{{ text("上游 URL", "Upstream URL") }}</span>
                        <input v-model="installForm.upstreamBaseUrl" class="form-input" placeholder="https://api.example.com/v1" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text("上游 API Key", "Upstream API Key") }}</span>
                        <input v-model="installForm.upstreamApiKey" class="form-input" type="password" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text("海外上游代理", "Foreign Provider Proxy") }}</span>
                        <input v-model="installForm.providerProxyUrl" class="form-input" placeholder="http://127.0.0.1:7897" />
                        <span class="form-help">{{ text("留空则自动读取 OpenAI/海外上游代理；国内网关默认直连。", "Leave empty to auto-detect proxy for OpenAI/foreign providers; domestic gateways stay direct.") }}</span>
                      </label>
                      <label class="form-field">
                        <span class="form-label">NO_PROXY</span>
                        <input v-model="installForm.noProxy" class="form-input" placeholder="localhost,127.0.0.1,::1" />
                      </label>
                    </div>
                  </div>
                </details>

                <article class="panel-card cs-repair-board">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("修复策略", "Repair Strategy") }}</p>
                      <h4>{{ text("从轻修复到重写配置", "From Light Repair to Config Rewrite") }}</h4>
                    </div>
                  </div>
                  <div class="cs-repair-grid">
                    <article class="cs-repair-card">
                      <strong>{{ text("推荐修复", "Recommended Repair") }}</strong>
                      <p>{{ text("根据当前状态重启未运行的 CPA、Compact、watchdog 或 cc-connect。", "Restart inactive CPA, Compact, watchdog, or cc-connect based on current status.") }}</p>
                      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="repairRecommended">
                        {{ text("执行推荐修复", "Run Recommended") }}
                      </button>
                    </article>
                    <article class="cs-repair-card">
                      <strong>{{ text("清理旧守护", "Clean Old Daemons") }}</strong>
                      <p>{{ text("禁用可能抢端口的旧 cpa.service / cliproxyapi.service，再让当前服务接管。", "Disable old cpa.service / cliproxyapi.service units that may occupy ports.") }}</p>
                      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="repairConflictingUnits">
                        {{ text("清理冲突服务", "Clean Conflicts") }}
                      </button>
                    </article>
                    <article class="cs-repair-card">
                      <strong>{{ text("重写配置不启动", "Rewrite Config Only") }}</strong>
                      <p>{{ text("重新跑安装器的配置阶段但不启动服务，适合修复损坏配置后手动启动。", "Rerun the installer config phase without starting services, then start manually.") }}</p>
                      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="repairConfigOnly">
                        {{ text("只修复配置", "Repair Config Only") }}
                      </button>
                    </article>
                    <article class="cs-repair-card">
                      <strong>{{ text("暂停 CPA 栈", "Pause CPA Stack") }}</strong>
                      <p>{{ text("先停 watchdog，再停 Compact 和 CPA，避免你手动停用后又被自动拉起。", "Stop watchdog first, then Compact and CPA so manual pause stays paused.") }}</p>
                      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="pauseStack">
                        {{ text("暂停链路", "Pause Stack") }}
                      </button>
                    </article>
                    <article class="cs-repair-card">
                      <strong>{{ text("恢复 CPA 栈", "Resume CPA Stack") }}</strong>
                      <p>{{ text("按 CPA → Compact → watchdog 顺序恢复，并等待健康检查通过。", "Resume in CPA, Compact, watchdog order after health checks pass.") }}</p>
                      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="resumeStack">
                        {{ text("恢复链路", "Resume Stack") }}
                      </button>
                    </article>
                    <article class="cs-repair-card">
                      <strong>{{ text("运行模型矩阵", "Run Smoke Matrix") }}</strong>
                      <p>{{ text("只验证不切换 Codex：glm-5.1 与 kimi-k2.6 都要通过普通、非流式、流式和压缩上下文。", "Verify without attaching Codex: glm-5.1 and kimi-k2.6 must pass chat, non-stream, stream, and compact checks.") }}</p>
                      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="runSmokeMatrix">
                        {{ text("只验证", "Verify Only") }}
                      </button>
                    </article>
                    <article class="cs-repair-card">
                      <strong>{{ text("通过验证后切 Codex", "Attach Codex After Smoke") }}</strong>
                      <p>{{ text("会重新跑完整模型矩阵；全部通过才写入 Codex active provider，并在当前模型不是 glm/kimi 时切到安全的国内模型。", "Reruns the full model matrix and writes the active Codex provider only if every check passes; if the current model is not glm/kimi, it switches to a CPA-safe domestic model.") }}</p>
                      <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="applyCodexCpaAfterSmoke">
                        {{ text("验证并切换", "Smoke & Attach") }}
                      </button>
                    </article>
                  </div>
                </article>

                <article class="panel-card cs-install-cta-card">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("步骤 4", "Step 4") }}</p>
                      <h4>{{ text("执行安装", "Run Install") }}</h4>
                    </div>
                  </div>
                  <p class="cs-field-hint">
                    {{ text("完整安装会同时部署 cc-connect；基础安装只保留 Codex / CPA / Compact / watchdog。", "Full install includes cc-connect; base install keeps Codex / CPA / Compact / watchdog only.") }}
                  </p>
                  <div class="cs-install-cta-row">
                    <button type="button" class="primary-button cs-big-button" :disabled="!canRunMutation" @click="installFullStack">
                      {{ text("一键安装全部组件", "Install Full Stack") }}
                    </button>
                    <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="installBaseOnly">
                      {{ text("仅安装基础组件", "Install Base Only") }}
                    </button>
                    <button type="button" class="secondary-button" :disabled="!canRunMutation" @click="repairRecommended">
                      {{ text("执行推荐修复", "Run Recommended Repair") }}
                    </button>
                  </div>
                </article>
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

              <article class="panel-card cs-upstream-map">
                <div class="cs-card-header">
                  <div>
                    <p class="cs-section-kicker">{{ text("配置关系", "Config Map") }}</p>
                    <h4>{{ text("谁对应谁", "What Maps to What") }}</h4>
                  </div>
                </div>
                <div class="cs-upstream-grid">
                  <div>
                    <span>{{ text("Codex 默认模型", "Codex Default Model") }}</span>
                    <strong>{{ configForm.defaultModel || summary.models.current || "--" }}</strong>
                    <p>{{ text("写入 ~/.codex/config.toml，直接影响命令行 codex。", "Written to ~/.codex/config.toml and used by the codex CLI.") }}</p>
                  </div>
                  <div>
                    <span>{{ text("本地 OpenAI 兼容入口", "Local OpenAI-Compatible Endpoint") }}</span>
                    <strong>{{ compactProxyBaseUrl }}</strong>
                    <p>{{ text("cc-connect Provider 推荐指向这里，而不是单独配置一套上游。", "cc-connect providers should usually point here instead of duplicating upstream settings.") }}</p>
                  </div>
                  <div>
                    <span>{{ text("推荐 cc-connect Provider", "Recommended cc-connect Provider") }}</span>
                    <strong>{{ canonicalCcConnectProvider.name }} · {{ canonicalCcConnectProvider.baseUrl }}</strong>
                    <p>{{ text("用于 cc-connect 启动 Codex Agent 时注入 OPENAI_API_KEY / base_url。", "Used by cc-connect to inject OPENAI_API_KEY / base_url into Codex agents.") }}</p>
                  </div>
                  <div>
                    <span>{{ text("cc-connect Agent 模型", "cc-connect Agent Model") }}</span>
                    <strong>{{ canonicalCcConnectProvider.model }}</strong>
                    <p>{{ text("每个项目可单独设置；需要统一时在 cc-connect 面板点击同步默认模型。", "Each project can override it; use Sync Default Model in the cc-connect panel to align them.") }}</p>
                  </div>
                </div>
              </article>

              <div class="cs-dashboard-grid">
                <article class="panel-card">
                  <div class="cs-card-header">
                    <div>
                      <p class="cs-section-kicker">{{ text("运行时", "Runtime") }}</p>
                      <h4>{{ text("运行配置", "Runtime Config") }}</h4>
                    </div>
                  </div>
                  <div class="cs-form-grid">
                    <label class="form-field">
                      <span class="form-label">{{ text("默认模型", "Default Model") }}</span>
                      <select v-model="configForm.defaultModel" class="form-input">
                        <option v-for="model in modelOptions" :key="`config-${model}`" :value="model">{{ model }}</option>
                      </select>
                      <span class="form-help">{{ text("保存后会写入 Codex，并可同步到 cc-connect Agent。", "Saving writes to Codex and can be synced to cc-connect agents.") }}</span>
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text("Codex 上下文", "Codex Context") }}</span>
                      <select v-model="configForm.contextMode" class="form-input">
                        <option value="default">{{ text("默认上下文", "Default context") }}</option>
                        <option value="codex-1m">{{ text("1M 上下文", "1M context") }}</option>
                        <option value="custom">{{ text("自定义 token", "Custom tokens") }}</option>
                      </select>
                      <span class="form-help">{{ text("保存后会更新 ~/.codex/config.toml。", "Saving updates ~/.codex/config.toml.") }}</span>
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text("上下文 tokens", "Context tokens") }}</span>
                      <input
                        v-model.number="configForm.contextWindowTokens"
                        class="form-input"
                        type="number"
                        min="1000"
                        max="1050000"
                        step="1000"
                        :disabled="configContextTokensDisabled"
                      />
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text("CPA 端口", "CPA Port") }}</span>
                      <input v-model.number="configForm.cpaPort" class="form-input" type="number" min="1" />
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text("Compact 端口", "Compact Port") }}</span>
                      <input v-model.number="configForm.compactPort" class="form-input" type="number" min="1" />
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text("cc-connect 项目", "cc-connect Project") }}</span>
                      <input v-model="configForm.ccConnectProject" class="form-input" />
                    </label>
                    <label class="form-field cs-form-span-2">
                      <span class="form-label">{{ text("代理密钥", "Proxy Key") }}</span>
                      <input
                        v-model="configForm.cpaProxyKey"
                        class="form-input"
                        type="password"
                        :placeholder="text('留空不修改', 'Leave empty to keep current value')"
                      />
                    </label>
                  </div>
                  <div v-if="restartRequiredUnits.length" class="cs-restart-hint cs-restart-hint-block">
                    <strong>{{ text("待应用重启", "Restart pending") }}</strong>
                    <span>
                      {{ restartRequiredUnits.join(", ") }}
                    </span>
                    <small>
                      {{ text("保存配置不会拉起已暂停的 CPA 栈；需要启用时用“恢复 CPA 栈”按顺序启动。", "Saving config will not start a paused CPA stack; use Resume CPA Stack when you want to bring it back up in order.") }}
                    </small>
                  </div>
                  <div class="cs-actions">
                    <button type="button" class="primary-button" :disabled="!canRunMutation" @click="saveConfigPatch">
                      {{ text("保存配置", "Save Config") }}
                    </button>
                  </div>
                </article>

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

              <article class="panel-card cs-log-console">
                <div class="cs-log-control-grid">
                  <div>
                    <p class="cs-section-kicker">{{ text("目标服务", "Target Service") }}</p>
                    <div class="cs-log-service-list">
                      <button
                        v-for="service in logServices"
                        :key="service.id"
                        type="button"
                        class="cs-log-service-button"
                        :class="{ 'cs-log-service-button-active': selectedLogService === service.id }"
                        @click="selectedLogService = service.id"
                      >
                        <span :class="`cs-dot tone-${service.tone}`"></span>
                        <strong>{{ service.label }}</strong>
                        <small>{{ service.rawState }}</small>
                      </button>
                    </div>
                  </div>
                  <div>
                    <p class="cs-section-kicker">{{ text("读取性能", "Read Performance") }}</p>
                    <div class="cs-log-mode-list">
                      <button
                        v-for="option in logLineOptions"
                        :key="option.id"
                        type="button"
                        class="cs-log-mode-button"
                        :class="{ 'cs-log-mode-button-active': logLineMode === option.id }"
                        @click="logLineMode = option.id"
                      >
                        <strong>{{ option.label }}</strong>
                        <span>{{ option.lines }} {{ text("行", "lines") }}</span>
                      </button>
                    </div>
                    <p class="cs-field-hint">{{ logModeHelp }}</p>
                    <label class="cs-switch-row cs-log-auto">
                      <input v-model="logAutoRefresh" type="checkbox" />
                      {{ text("自动刷新当前服务", "Auto-refresh current service") }}
                    </label>
                  </div>
                </div>
                <div class="cs-log-toolbar">
                  <div class="cs-chip-row">
                    <span class="cs-info-chip">{{ text("请求行数", "Requested") }} {{ logLineLimit }}</span>
                    <span v-if="logMeta" class="cs-info-chip">{{ text("返回行数", "Returned") }} {{ logMeta.returnedLines }}</span>
                    <span v-if="logMeta" class="cs-info-chip">{{ text("来源", "Sources") }} {{ logMeta.sources.map((source) => source.label).join(" + ") }}</span>
                    <span v-if="logMeta" class="cs-info-chip">{{ text("读取时间", "Fetched") }} {{ formatTimestamp(logMeta.fetchedAt) }}</span>
                    <span v-if="logMeta?.truncated" class="cs-status-pill tone-accent">{{ text("内容已截断", "Output truncated") }}</span>
                  </div>
                  <div class="cs-actions">
                    <button type="button" class="primary-button" :disabled="logRefreshing" @click="loadLogs(selectedLogService)">
                      {{ logRefreshing ? text("读取中...", "Loading...") : text("读取日志", "Load Logs") }}
                    </button>
                  </div>
                </div>
                <pre class="cs-log">{{ logOutput || text("选择一个服务查看日志。", "Select a service to view logs.") }}</pre>
              </article>

              <article v-if="activeJob" class="panel-card cs-job-output-card">
                <div class="cs-card-header">
                  <div>
                    <p class="cs-section-kicker">{{ text("任务输出", "Job Output") }}</p>
                    <h4>{{ activeJobTitle }} · {{ jobStatusLabel(activeJob.status) }}</h4>
                  </div>
                  <span class="cs-status-pill" :class="activeJob.status === 'succeeded' ? 'tone-sage' : activeJob.status === 'failed' ? 'tone-danger' : 'tone-accent'">
                    {{ jobStatusLabel(activeJob.status) }}
                  </span>
                </div>
                <div class="cs-job-progress-track" :style="{ '--progress': jobProgressPercent }">
                  <span></span>
                </div>
                <div class="cs-job-step-list">
                  <span
                    v-for="step in jobProgressSteps"
                    :key="step.label"
                    class="cs-job-step"
                    :class="`cs-job-step-${step.state}`"
                  >
                    {{ step.label }}
                  </span>
                </div>
                <pre class="cs-log">{{ activeJob.logTail || text("等待输出...", "Waiting for output...") }}</pre>
              </article>
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
  CodexStackJob,
  CodexStackJobStatus,
  CodexStackLogResponse,
  CodexStackRepairAction,
  CodexStackServiceAction,
  CodexStackServiceId,
  CodexStackSmokeModelResult,
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

const { text } = useLocalePreference();

type SectionId = "dashboard" | "install" | "cc-connect" | "settings" | "logs";
type AgentPaneId = "projects" | "providers" | "setup" | "raw";
type LogLineMode = "light" | "balanced" | "deep";
type ComponentInstallMode = "default" | "skip" | "force";
type AgentProjectPreset = "admin" | "worker";
type PlatformTemplateId = "dmwork" | "octo" | "feishu" | "weixin";
type ContextMode = "default" | "codex-1m" | "custom";
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
const logServices = computed(() => {
  const services: Array<{ id: CodexStackServiceId; label: string; tone: string; rawState: string }> = [
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

const installForm = reactive({
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

const configForm = reactive({
  defaultModel: "kimi-k2.6",
  contextMode: "default" as ContextMode,
  contextWindowTokens: 1050000,
  cpaPort: 18795,
  compactPort: 18796,
  ccConnectProject: "main",
  cpaProxyKey: "",
});

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
const modelOptions = computed(() => summary.value?.models.available.length ? summary.value.models.available : ["kimi-k2.6", "glm-5.1", "gpt-5.5"]);
const modelCatalogPreview = computed(() => modelOptions.value.slice(0, 6));
const nextActionSection = computed<SectionId>(() => {
  const status = summary.value?.overallStatus || "needs-setup";
  if (status === "needs-setup") return "install";
  if (status === "binding-required") return "cc-connect";
  if (status === "running-action") return "logs";
  if (status === "degraded" || status === "failed") return "dashboard";
  return "logs";
});
const nextActionTitle = computed(() => {
  const status = summary.value?.overallStatus || "needs-setup";
  if (status === "ready") return text("运行健康检查确认状态", "Run a health check to confirm");
  if (status === "binding-required") return text("完成 cc-connect 绑定", "Complete cc-connect binding");
  if (status === "running-action") return text("查看后台任务输出", "Watch background job output");
  if (status === "degraded" || status === "failed") return text("执行推荐修复", "Run recommended repair");
  return text("选择安装范围并开始", "Choose install scope and start");
});
const nextActionCopy = computed(() => {
  const status = summary.value?.overallStatus || "needs-setup";
  if (status === "ready") return text("服务已就绪，建议定期运行健康检查或查看日志。", "Services are ready; run checks or inspect logs when needed.");
  if (status === "binding-required") return text("cc-connect 已安装但还需要平台绑定或收尾。", "cc-connect is installed but still needs platform binding or finalization.");
  if (status === "running-action") return text("安装或修复正在执行，先跟踪输出和结果。", "An install or repair is running; track output and result first.");
  if (status === "degraded" || status === "failed") return text("有组件未运行或端点不可达，推荐先执行修复。", "Some components are stopped or unreachable; run repair first.");
  return text("首次使用从 DMWork 增强版开始；已有环境可选择跳过或强制重装组件。", "Start with the DMWork enhanced channel; existing environments can skip or force reinstall components.");
});
const nextActionButton = computed(() => {
  const status = summary.value?.overallStatus || "needs-setup";
  if (status === "ready") return text("运行检查", "Run Check");
  if (status === "binding-required") return text("去绑定", "Bind Now");
  if (status === "running-action") return text("看日志", "View Logs");
  if (status === "degraded" || status === "failed") return text("自动修复", "Auto Repair");
  return text("开始安装", "Start Install");
});
const nextActionRequiresMutation = computed(() => {
  const status = summary.value?.overallStatus || "needs-setup";
  return status === "needs-setup" || status === "degraded" || status === "failed";
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
  const policy = summary.value?.proxyPolicy;
  if (!policy) return text("未知", "Unknown");
  if (policy.providerMode === "proxy" && policy.providerProxyUrl) {
    return text(`海外代理 ${policy.providerProxyUrl}`, `Foreign proxy ${policy.providerProxyUrl}`);
  }
  return text("国内网关直连", "Domestic gateways direct");
});
const smokeMatrixLabel = computed(() => {
  const matrix = summary.value?.profile.lastSmokeMatrix;
  if (!matrix) return text("未验证", "Not verified");
  const models = matrix.models.map((item) => `${item.model}:${item.status}`).join(" ");
  return matrix.attachEligible
    ? text(`通过 ${models}`, `Passed ${models}`)
    : text(`失败 ${models}`, `Failed ${models}`);
});

function smokeModelChecksLabel(model: CodexStackSmokeModelResult): string {
  const passed = model.checks.filter((check) => check.status === "passed").length;
  const total = model.checks.length;
  return text(`检查 ${passed}/${total} 通过`, `${passed}/${total} checks passed`);
}
const configContextTokensDisabled = computed(() => configForm.contextMode !== "custom");
const installContextTokensDisabled = computed(() => installForm.contextMode !== "custom");
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
const componentOptions = computed(() => [
  { id: "codex" as const, label: text("Codex CLI", "Codex CLI") },
  { id: "cpa" as const, label: text("CPA 代理", "CPA Proxy") },
  { id: "compact-proxy" as const, label: text("Compact 代理", "Compact Proxy") },
  { id: "cc-connect" as const, label: "cc-connect" },
  { id: "watchdog" as const, label: text("看门狗", "Watchdog") },
]);
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
const logLineOptions = computed<Array<{ id: LogLineMode; label: string; lines: number; help: string }>>(() => [
  { id: "light", label: text("轻量", "Light"), lines: 80, help: text("最快，只看最近错误。", "Fastest, recent errors only.") },
  { id: "balanced", label: text("标准", "Balanced"), lines: 160, help: text("默认预览，适合日常排障。", "Default preview for daily diagnosis.") },
  { id: "deep", label: text("完整", "Deep"), lines: 500, help: text("更多上下文，读取更慢。", "More context, slower fetch.") },
]);
const logLineLimit = computed(() => logLineOptions.value.find((option) => option.id === logLineMode.value)?.lines || 160);
const logModeHelp = computed(() => logLineOptions.value.find((option) => option.id === logLineMode.value)?.help || "");
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

function yesNo(value: boolean): string {
  return value ? text("是", "Yes") : text("否", "No");
}

function portDisplay(port: number, live: number | null): string {
  if (live && live !== port) return `:${port} (live :${live})`;
  return `:${port}`;
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

function jobStateClass(status: CodexStackJobStatus): string {
  if (status === "succeeded") return "cs-job-banner-ok";
  if (status === "failed" || status === "interrupted") return "cs-job-banner-fail";
  return "cs-job-banner-live";
}

function jobStatusLabel(status: CodexStackJobStatus): string {
  const labels: Record<CodexStackJobStatus, string> = {
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
  const status = summary.value?.overallStatus || "needs-setup";
  if (status === "ready") {
    void runCheck();
    return;
  }
  if (status === "degraded" || status === "failed") {
    void repairRecommended();
    return;
  }
  activeSection.value = nextActionSection.value;
}

function applySummary(next: CodexStackSummaryPayload): void {
  summary.value = next;
  installForm.model = next.models.current || next.profile.defaultModel || next.models.defaultModel || "kimi-k2.6";
  installForm.contextMode = next.context.mode || "default";
  installForm.contextWindowTokens = next.context.tokens || next.context.recommendedTokens;
  installForm.cpaPort = next.ports.cpa;
  installForm.compactPort = next.ports.compact;
  installForm.channel = next.installer.channel;
  installForm.providerProxyUrl = next.proxyPolicy.providerProxyUrl || "";
  installForm.noProxy = next.proxyPolicy.noProxy || "localhost,127.0.0.1,::1";
  configForm.defaultModel = next.models.current || next.profile.defaultModel || next.models.defaultModel || "kimi-k2.6";
  configForm.contextMode = next.context.mode || "default";
  configForm.contextWindowTokens = next.context.tokens || next.context.recommendedTokens;
  configForm.cpaPort = next.ports.cpa;
  configForm.compactPort = next.ports.compact;
  configForm.ccConnectProject = next.ccConnect.project || next.profile.ccConnectProject || "main";
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

async function loadCcConnectConfig(silent = false): Promise<void> {
  ccConnectLoading.value = true;
  try {
    const config = await fetchCcConnectConfig();
    ccConnectConfig.value = config;
    ccConnectRawDraft.value = config.raw;
    hydrateCcConnectStructuredDraft(config);
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

async function loadAll(silent = false): Promise<void> {
  await Promise.all([loadSummary(), loadCcConnectConfig(silent)]);
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
        await loadSummary();
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
  busy.value = true;
  try {
    const response = await patchCodexStackConfig({
      defaultModel: configForm.defaultModel,
      contextMode: configForm.contextMode,
      contextWindowTokens: configForm.contextMode === "custom" ? Number(configForm.contextWindowTokens) || undefined : undefined,
      cpaPort: Number(configForm.cpaPort) || undefined,
      compactPort: Number(configForm.compactPort) || undefined,
      ccConnectProject: configForm.ccConnectProject || undefined,
      cpaProxyKey: configForm.cpaProxyKey || undefined,
    });
    restartRequiredUnits.value = response.restartRequiredUnits || [];
    configForm.cpaProxyKey = "";
    if (response.summary) applySummary(response.summary);
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
    await loadCcConnectConfig(true);
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
    await loadCcConnectConfig(true);
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
.cs-job-banner,
.cs-hero-card,
.cs-model-ribbon {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.cs-lock-card p,
.cs-job-meta,
.cs-section-copy,
.cs-field-hint,
.cs-hero-description,
.cs-service-blurb,
.cs-component-version,
.cs-component-notes {
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

.cs-job-banner {
  border-color: color-mix(in srgb, var(--line) 72%, transparent);
}

.cs-job-banner-live {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--acc) 30%, transparent);
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

.cs-job-banner-ok {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--success) 34%, transparent);
}

.cs-job-banner-fail {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 34%, transparent);
}

.cs-job-eyebrow,
.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-job-actions,
.cs-hero-actions,
.cs-actions,
.cs-install-cta-row,
.cs-platform-badges,
.cs-log-toolbar {
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

.cs-command-grid {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(320px, 1.1fr) minmax(280px, 1fr);
  gap: 16px;
}

.cs-readiness-card,
.cs-next-card,
.cs-model-catalog-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--code-bg) 18%, transparent)),
    var(--surface);
}

.cs-readiness-meter {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cs-readiness-meter strong {
  font-size: clamp(2rem, 4vw, 3.4rem);
  line-height: 1;
}

.cs-readiness-meter span,
.form-help {
  color: var(--text-soft);
  font-size: 0.84rem;
}

.cs-readiness-bar {
  height: 12px;
  overflow: hidden;
  margin: 16px 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 52%, transparent);
}

.cs-readiness-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--success), color-mix(in srgb, var(--acc) 68%, var(--success)));
}

.cs-next-card h4 {
  margin: 0;
  font-size: 1.15rem;
}

.cs-next-card p {
  color: var(--text-soft);
}

.cs-model-preview,
.cs-model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cs-model-preview span,
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
.cs-service-badge,
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

.cs-service-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.cs-service-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), color-mix(in srgb, var(--code-bg) 22%, transparent)),
    var(--surface);
}

.cs-service-card-head,
.cs-service-title,
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

.cs-service-title {
  justify-content: flex-start;
}

.cs-service-title h4,
.cs-card-header h4,
.cs-provider-head strong,
.cs-platform-head strong,
.cs-project-head h5,
.cs-progress-header h4 {
  margin: 0;
}

.cs-service-title p,
.cs-project-head p {
  margin: 4px 0 0;
  color: var(--text-soft);
}

.cs-service-badge-live {
  border-color: color-mix(in srgb, var(--success) 36%, var(--line));
}

.cs-service-badge-off {
  border-color: color-mix(in srgb, var(--danger) 36%, var(--line));
}

.cs-stat-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.cs-stat-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
}

.cs-stat-list dt {
  color: var(--muted);
  font-size: 0.82rem;
}

.cs-stat-list dd {
  margin: 0;
  color: var(--text);
  text-align: right;
  word-break: break-word;
}

.cs-service-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}

.cs-dashboard-grid,
.cs-install-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.cs-kv-list {
  display: grid;
  gap: 10px;
}

.cs-kv-list-spacious {
  gap: 14px;
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

.cs-smoke-matrix-detail {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-smoke-matrix-head,
.cs-smoke-model-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.cs-smoke-matrix-head span,
.cs-smoke-model-row p {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
}

.cs-smoke-model-row {
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

.cs-smoke-error {
  color: var(--danger) !important;
  word-break: break-word;
}

.cs-component-list,
.cs-component-mode-list,
.cs-project-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cs-component-card,
.cs-component-mode-card,
.cs-provider-card,
.cs-platform-card,
.cs-project-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  padding: 14px;
}

.cs-component-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-component-head p {
  margin: 4px 0 0;
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

.cs-install-plan-card {
  display: grid;
  grid-template-columns: minmax(220px, 0.72fr) minmax(320px, 1fr) auto;
  gap: 18px;
  align-items: center;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--acc) 14%, transparent), transparent 35%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 94%, #0c1d20 6%), var(--surface));
}

.cs-install-plan-card h4 {
  margin: 0;
}

.cs-install-plan-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cs-install-plan-list span {
  display: inline-flex;
  border: 1px solid color-mix(in srgb, var(--acc) 24%, var(--line));
  border-radius: 14px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--code-bg) 36%, transparent);
  color: var(--text);
  font-size: 0.86rem;
}

.cs-install-plan-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}

.cs-install-shell-busy > *:not(.cs-install-overlay) {
  opacity: 0.42;
}

.cs-install-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: color-mix(in srgb, #081018 56%, transparent);
  backdrop-filter: blur(6px);
  border-radius: calc(var(--radius-lg) + 8px);
}

.cs-install-progress {
  width: min(920px, 100%);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
}

.cs-progress-running {
  background: var(--acc);
  color: #fff;
  border-color: transparent;
  animation: cs-pulse 1.5s infinite;
}

.cs-progress-ok {
  background: var(--success);
  color: #fff;
  border-color: transparent;
}

.cs-progress-fail {
  background: var(--danger);
  color: #fff;
  border-color: transparent;
}

.cs-progress-log,
.cs-code,
.cs-log,
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

.cs-log {
  min-height: 340px;
  max-height: 520px;
}

.cs-progress-log {
  max-height: 320px;
}

.cs-job-progress-track {
  --progress: 0%;
  height: 10px;
  overflow: hidden;
  margin: 12px 0;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  background: color-mix(in srgb, var(--code-bg) 58%, transparent);
}

.cs-job-progress-track span {
  display: block;
  width: var(--progress);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--acc), color-mix(in srgb, var(--success) 72%, var(--acc)));
  transition: width 0.28s ease;
}

.cs-job-step-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.cs-job-step {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 8px 10px;
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  font-size: 0.82rem;
}

.cs-job-step-done {
  color: #073b20;
  border-color: #8fd8a6;
  background: #dff8e7;
}

.cs-job-step-active {
  color: #17335f;
  border-color: #9ec2ff;
  background: #e4efff;
  font-weight: 700;
}

.cs-job-step-failed {
  color: #651d19;
  border-color: #f1a9a1;
  background: #ffe4e0;
  font-weight: 700;
}

.cs-channel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.cs-channel-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.cs-channel-card input {
  display: none;
}

.cs-channel-card p,
.cs-channel-card span {
  margin: 0;
  color: var(--text-soft);
}

.cs-channel-card-active {
  border-color: color-mix(in srgb, var(--acc) 42%, var(--line));
  background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 12%, transparent), color-mix(in srgb, var(--surface) 98%, transparent));
  transform: translateY(-1px);
}

.cs-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cs-form-span-2 {
  grid-column: 1 / -1;
}

.cs-segmented {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--code-bg) 36%, transparent);
  padding: 4px;
}

.cs-segmented-button {
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.88rem;
}

.cs-segmented-button-active {
  background: color-mix(in srgb, var(--acc) 18%, transparent);
  color: var(--text);
}

.cs-details summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text);
}

.cs-details-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.cs-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cs-switch-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-soft);
}

.cs-install-cta-card {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--acc) 16%, transparent), transparent 32%),
    var(--surface);
}

.cs-repair-board {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--warning) 12%, transparent), transparent 34%),
    var(--surface);
}

.cs-repair-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.cs-repair-card {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
}

.cs-repair-card strong {
  color: var(--text);
}

.cs-repair-card p {
  flex: 1;
  margin: 0;
  color: var(--text-soft);
}

.cs-flow-card,
.cs-upstream-map,
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

.cs-flow-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.cs-flow-steps span {
  position: relative;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--acc) 26%, var(--line));
  border-radius: 16px;
  background: color-mix(in srgb, var(--acc) 10%, var(--surface));
  color: var(--text);
  font-weight: 650;
  text-align: center;
}

.cs-flow-steps span:not(:last-child)::after {
  content: ">";
  position: absolute;
  right: -10px;
  color: var(--muted);
  font-weight: 700;
}

.cs-big-button {
  min-width: 240px;
}

.cs-result-ok {
  border-color: color-mix(in srgb, var(--success) 38%, var(--line));
}

.cs-result-fail {
  border-color: color-mix(in srgb, var(--danger) 38%, var(--line));
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
.cs-agent-project-pill,
.cs-log-service-button,
.cs-log-mode-button {
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
.cs-agent-project-pill-active,
.cs-log-service-button-active,
.cs-log-mode-button-active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--acc) 44%, var(--line));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--acc) 14%, transparent), color-mix(in srgb, var(--surface) 96%, transparent)),
    var(--surface);
}

.cs-agent-pane-button:hover,
.cs-agent-project-pill:hover,
.cs-log-service-button:hover,
.cs-log-mode-button:hover {
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

.cs-upstream-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.cs-upstream-grid > div {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

.cs-upstream-grid span {
  display: block;
  color: var(--muted);
  font-size: 0.8rem;
  margin-bottom: 8px;
}

.cs-upstream-grid strong {
  display: block;
  color: var(--text);
  word-break: break-word;
}

.cs-upstream-grid p {
  margin: 8px 0 0;
  color: var(--text-soft);
  font-size: 0.88rem;
}

.cs-raw-editor {
  min-height: 420px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.cs-log-console {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cs-log-control-grid {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(260px, 1fr);
  gap: 18px;
}

.cs-log-service-list,
.cs-log-mode-list {
  display: grid;
  gap: 8px;
}

.cs-log-service-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cs-log-mode-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cs-log-service-button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 10px;
  align-items: center;
  border-radius: 16px;
  padding: 12px;
  text-align: left;
}

.cs-log-service-button .cs-dot {
  margin: 0;
}

.cs-log-service-button small {
  grid-column: 2;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-log-mode-button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  border-radius: 16px;
  padding: 12px;
  text-align: left;
}

.cs-log-mode-button span {
  color: var(--muted);
  font-size: 0.82rem;
}

.cs-log-auto {
  margin-top: 12px;
}

.cs-log-toolbar {
  justify-content: space-between;
  margin-bottom: 0;
}

.cs-job-output-card {
  border-color: color-mix(in srgb, var(--acc) 22%, var(--line));
}

.cs-dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--muted);
  box-shadow: 0 0 14px currentColor;
  flex: 0 0 auto;
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

.cs-dot.tone-sage {
  color: var(--success);
  background: var(--success);
}

.cs-dot.tone-accent {
  color: var(--acc);
  background: var(--acc);
}

.cs-dot.tone-danger {
  color: var(--danger);
  background: var(--danger);
}

.cs-dot.tone-neutral {
  color: var(--muted);
  background: var(--muted);
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

@media (max-width: 1200px) {
  .cs-service-grid,
  .cs-command-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
  .cs-command-grid,
  .cs-install-plan-card,
  .cs-install-grid,
  .cs-channel-grid,
  .cs-form-grid,
  .cs-provider-grid,
  .cs-platform-grid,
  .cs-checkbox-grid,
  .cs-repair-grid,
  .cs-flow-steps,
  .cs-upstream-grid,
  .cs-agent-workbench,
  .cs-agent-editor-grid,
  .cs-agent-template-row,
  .cs-log-control-grid,
  .cs-log-service-list,
  .cs-log-mode-list {
    grid-template-columns: 1fr;
  }

  .cs-agent-rail,
  .cs-agent-savebar {
    position: static;
  }

  .cs-install-plan-actions {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .cs-flow-steps span:not(:last-child)::after {
    content: "v";
    right: auto;
    bottom: -13px;
  }

  .cs-kv-row {
    grid-template-columns: 1fr;
  }

  .cs-option-row {
    grid-template-columns: 1fr;
  }

  .cs-job-banner,
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
  .cs-subsection-header,
  .cs-log-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-model-ribbon-side {
    justify-content: flex-start;
  }

  .cs-service-grid {
    grid-template-columns: 1fr;
  }

  .cs-agent-pane-switch {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
