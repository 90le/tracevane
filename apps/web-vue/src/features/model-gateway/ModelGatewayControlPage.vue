<template>
  <section class="page-shell model-gateway-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">Studio Gateway</p>
        <h2 class="page-title">{{ text('模型网关', 'Model Gateway') }}</h2>
        <p class="page-copy">
          {{ text('统一管理本地 Gateway daemon、provider、路由和 smoke，供 Codex、Claude Code、OpenCode、OpenClaw 等客户端接入。', 'Manage the local Gateway daemon, providers, routing, and smoke checks for Codex, Claude Code, OpenCode, OpenClaw, and other clients.') }}
        </p>
      </div>
      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="loading" @click="loadAll">
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新状态', 'Refresh') }}
        </button>
      </div>
    </header>

    <div v-if="notice" class="status-banner" :class="notice.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ notice.message }}
    </div>
    <div v-else-if="loading && !loaded" class="status-banner">
      {{ text('正在加载 Studio Gateway 状态...', 'Loading Studio Gateway state...') }}
    </div>

    <section class="mgw-layout">
      <aside class="mgw-runtime-rail">
        <article class="mgw-panel mgw-runtime-panel">
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Runtime</p>
              <h3>{{ text('Gateway daemon', 'Gateway daemon') }}</h3>
            </div>
            <StatusPill :label="daemonStateLabel" :tone="daemonStateTone" />
          </div>

          <div class="mgw-facts">
            <div>
              <span>{{ text('CLI Endpoint', 'CLI Endpoint') }}</span>
              <strong>{{ preferredEndpoint }}</strong>
            </div>
            <div>
              <span>{{ text('Supervisor', 'Supervisor') }}</span>
              <strong>{{ supervisorLabel }}</strong>
            </div>
            <div>
              <span>{{ text('服务模板', 'Service template') }}</span>
              <strong>{{ daemonTemplateStateLabel(daemonService) }}</strong>
            </div>
            <div>
              <span>{{ text('请求 / Tokens', 'Requests / tokens') }}</span>
              <strong>{{ runtimeUsageLabel }}</strong>
            </div>
            <div v-if="runtimeMediaUsageLabel">
              <span>{{ text('媒体用量', 'Media usage') }}</span>
              <strong>{{ runtimeMediaUsageLabel }}</strong>
            </div>
          </div>

          <div class="mgw-runtime-actions">
            <button type="button" class="primary-button compact-button" :disabled="daemonBusy" @click="runDaemonAction('ensure-running')">
              {{ daemonBusy ? text('执行中...', 'Running...') : text('确保运行', 'Ensure running') }}
            </button>
            <button type="button" class="secondary-button compact-button" :disabled="daemonBusy" @click="runDaemonAction('status')">
              {{ daemonBusy ? text('执行中...', 'Running...') : text('状态', 'Status') }}
            </button>
            <details class="mgw-runtime-more">
              <summary class="secondary-button compact-button">
                {{ text('更多操作', 'More actions') }}
              </summary>
              <div class="mgw-runtime-menu">
                <button type="button" :disabled="daemonBusy" @click="runDaemonAction('preview')">
                  {{ text('预览 service', 'Preview service') }}
                </button>
                <button type="button" :disabled="daemonBusy" @click="runDaemonAction('install')">
                  {{ text('重新安装/启用自启动', 'Reinstall / enable autostart') }}
                </button>
                <button type="button" :disabled="daemonBusy" @click="runDaemonAction('start')">
                  {{ text('启动守护服务', 'Start supervised service') }}
                </button>
                <button type="button" :disabled="daemonBusy" @click="runDaemonAction('restart')">
                  {{ text('重启守护服务', 'Restart supervised service') }}
                </button>
                <button type="button" :disabled="daemonBusy" @click="runDaemonAction('stop')">
                  {{ text('停止守护服务', 'Stop supervised service') }}
                </button>
              </div>
            </details>
          </div>

          <div v-if="daemonActionResult" class="mgw-daemon-output" :class="{ failure: daemonActionHasFailure }">
            <div class="mgw-daemon-output__head">
              <strong>{{ daemonActionTitle }}</strong>
              <span>{{ formatTimestamp(daemonActionResult.checkedAt) }}</span>
            </div>
            <div class="mgw-daemon-output__grid">
              <span>{{ text('模板', 'Template') }}: {{ daemonTemplateStateLabel(daemonActionResult) }}</span>
              <span>{{ text('服务', 'Service') }}: {{ daemonActionResult.installed ? text('已安装', 'Installed') : text('未安装', 'Not installed') }}</span>
              <span>{{ text('Supervisor', 'Supervisor') }}: {{ daemonActionResult.serviceManager.checked ? serviceManagerLabel : text('未执行命令', 'No command run') }}</span>
              <span>{{ text('Bootstrap', 'Bootstrap') }}: {{ bootstrapLabel }}</span>
            </div>
            <pre v-if="daemonActionOutput">{{ daemonActionOutput }}</pre>
            <pre v-else-if="daemonActionResult.action === 'preview'">{{ daemonActionResult.plan.selectedTemplate.configPath }}</pre>
          </div>

          <p class="mgw-note">
            {{ text('正式稳定性依赖 OS/user supervisor；Studio 或 OpenClaw 崩溃时，客户端应继续直连 daemon endpoint。', 'Production stability depends on the OS/user supervisor; clients should keep using the daemon endpoint if Studio or OpenClaw crashes.') }}
          </p>
        </article>

        <article class="mgw-panel">
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Client auth</p>
              <h3>{{ text('Gateway key', 'Gateway key') }}</h3>
            </div>
            <StatusPill :label="clientAuthStateLabel" :tone="clientAuthStateTone" />
          </div>

          <div class="mgw-client-key-state">
            <span>{{ text('当前 key', 'Current key') }}</span>
            <strong>{{ clientAuth?.secret.hasSecret ? clientAuth.secret.masked : text('未设置', 'Not set') }}</strong>
            <small>{{ text('客户端可用 Authorization Bearer 或 x-api-key；该 key 不会转发给上游。', 'Clients may use Authorization Bearer or x-api-key; this key is never forwarded upstream.') }}</small>
          </div>

          <form class="mgw-client-key-form" @submit.prevent="saveClientKey">
            <label class="form-field mgw-switch-field">
              <span>
                <span class="form-label">{{ text('鉴权状态', 'Auth state') }}</span>
                <strong>{{ clientAuthEnabled ? text('启用', 'Enabled') : text('停用', 'Disabled') }}</strong>
              </span>
              <input v-model="clientAuthEnabled" type="checkbox" />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('新 Gateway key', 'New Gateway key') }}</span>
              <input v-model="clientKeyDraft" class="form-input" type="password" :placeholder="clientKeyPlaceholder" />
            </label>
            <div class="mgw-client-key-actions">
              <button type="submit" class="primary-button compact-button" :disabled="clientAuthBusy">
                {{ clientAuthBusy ? text('保存中...', 'Saving...') : text('保存 key', 'Save key') }}
              </button>
              <button type="button" class="secondary-button compact-button" :disabled="clientAuthBusy" @click="generateClientKey">
                {{ text('生成新 key', 'Generate key') }}
              </button>
              <button type="button" class="secondary-button compact-button" :disabled="clientAuthBusy || !clientAuth?.enabled" @click="disableClientKey">
                {{ text('停用鉴权', 'Disable auth') }}
              </button>
            </div>
          </form>

          <div v-if="clientAuthReveal" class="mgw-secret-output">
            <span>{{ text('本次返回的新 key', 'New key returned this time') }}</span>
            <code>{{ clientAuthReveal }}</code>
          </div>
        </article>

        <article class="mgw-panel">
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Routes</p>
              <h3>{{ text('Active routing', 'Active routing') }}</h3>
            </div>
          </div>

          <div class="mgw-route-list">
            <section v-for="scope in appScopeOptions" :key="scope.id" class="mgw-route-row">
              <span>
                <strong>{{ text(scope.zh, scope.en) }}</strong>
                <small>{{ scopeHint(scope.id) }}</small>
              </span>
              <div class="mgw-route-control">
                <select class="form-input" :value="activeProviderForScope(scope.id)" :disabled="busy" @change="updateActiveProvider(scope.id, $event)">
                  <option value="">{{ text('自动选择 / 未设置', 'Auto / unset') }}</option>
                  <option v-for="provider in providersForScope(scope.id)" :key="provider.id" :value="provider.id">
                    {{ provider.name }}
                  </option>
                </select>
                <div class="mgw-route-state">
                  <StatusPill
                    :label="activeRouteStateLabel(activeRouteStatusForScope(scope.id))"
                    :tone="activeRouteStateTone(activeRouteStatusForScope(scope.id))"
                  />
                  <small>{{ activeRouteStatusForScope(scope.id)?.message || '-' }}</small>
                </div>
                <div v-if="activeRouteSmokeResultForScope(scope.id)" class="mgw-route-smoke" :class="activeRouteSmokeResultForScope(scope.id)?.ok ? 'success' : 'failure'">
                  <small>
                    {{ activeRouteSmokeResultForScope(scope.id)?.ok ? text('Smoke 通过', 'Smoke passed') : text('Smoke 失败', 'Smoke failed') }}
                    · {{ activeRouteSmokeResultForScope(scope.id)?.latencyMs }} ms
                  </small>
                </div>
                <button
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="isActiveRouteSmokeBusy(scope.id) || !activeRouteStatusForScope(scope.id)?.resolvedProviderId"
                  @click="runActiveRouteSmoke(scope.id)"
                >
                  {{ isActiveRouteSmokeBusy(scope.id) ? text('验证中...', 'Checking...') : text('验证', 'Smoke') }}
                </button>
              </div>
            </section>
          </div>

          <div v-if="activeRouteAlerts.length" class="mgw-route-alerts">
            <span v-for="alert in activeRouteAlerts" :key="alert">{{ alert }}</span>
          </div>
        </article>
      </aside>

      <main class="mgw-main">
        <nav class="mgw-workspace-tabs" role="tablist" aria-label="Model Gateway workspace">
          <button
            v-for="tab in workspaceTabs"
            :id="`mgw-tab-${tab.id}`"
            :key="tab.id"
            type="button"
            role="tab"
            class="surface-tab mgw-workspace-tab"
            :class="{ active: activeWorkspaceTab === tab.id }"
            :aria-selected="activeWorkspaceTab === tab.id"
            :aria-controls="`mgw-panel-${tab.id}`"
            :tabindex="activeWorkspaceTab === tab.id ? 0 : -1"
            @click="activeWorkspaceTab = tab.id"
          >
            {{ text(tab.zh, tab.en) }}
          </button>
        </nav>

        <article
          v-show="activeWorkspaceTab === 'connections'"
          id="mgw-panel-connections"
          class="mgw-panel mgw-workspace-panel"
          role="tabpanel"
          aria-labelledby="mgw-tab-connections"
        >
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">App Connections</p>
              <h3>{{ text('客户端接入', 'Client connections') }}</h3>
            </div>
            <button type="button" class="secondary-button compact-button" :disabled="loading" @click="refreshAppConnections">
              {{ text('刷新', 'Refresh') }}
            </button>
          </div>

          <section class="mgw-connection-profile">
            <div class="mgw-connection-profile__head">
              <div>
                <strong>{{ text('连接 Profile', 'Connection profile') }}</strong>
                <small>{{ text('统一写入 Codex、Claude Code、OpenCode、OpenClaw 的模型和运行偏好。', 'Write the same model and runtime preferences into Codex, Claude Code, OpenCode, and OpenClaw.') }}</small>
              </div>
              <div class="mgw-connection-profile__actions">
                <button
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="appConnectionProfileBusy"
                  @click="saveAppConnectionProfile"
                >
                  {{ appConnectionProfileBusy ? text('保存中...', 'Saving...') : text('保存 Profile', 'Save profile') }}
                </button>
                <button
                  type="button"
                  class="primary-button compact-button"
                  :disabled="!canApplyAllAppConnections || appConnectionApplyAllBusy"
                  @click="applyAllAppConnectionConfigs"
                >
                  {{ appConnectionApplyAllBusy ? text('应用中...', 'Applying...') : text('应用到全部', 'Apply all') }}
                </button>
              </div>
            </div>

            <div class="mgw-profile-grid">
              <label class="form-field form-field-full">
                <span class="form-label">{{ text('默认模型', 'Default model') }}</span>
                <select v-if="appConnectionModelOptions.length" v-model="appConnectionProfile.model" class="form-input">
                  <option value="">{{ text('选择模型', 'Select a model') }}</option>
                  <option v-for="model in appConnectionModelOptions" :key="model.id" :value="model.id">{{ model.label }}</option>
                </select>
                <input v-else v-model.trim="appConnectionProfile.model" class="form-input" :placeholder="text('手动填写模型 ID', 'Enter model ID')" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('上下文大小', 'Context window') }}</span>
                <input v-model.trim="appConnectionProfile.contextWindow" class="form-input" inputmode="numeric" placeholder="128000" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('Compact 阈值', 'Compact limit') }}</span>
                <input v-model.trim="appConnectionProfile.autoCompactTokenLimit" class="form-input" inputmode="numeric" placeholder="100000" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('最大输出', 'Max output') }}</span>
                <input v-model.trim="appConnectionProfile.maxOutputTokens" class="form-input" inputmode="numeric" placeholder="8192" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('推理强度', 'Reasoning') }}</span>
                <input v-model.trim="appConnectionProfile.reasoningEffort" class="form-input" placeholder="high" />
              </label>
            </div>

            <div class="mgw-profile-budget-bar">
              <span>{{ appConnectionBudgetSummary }}</span>
              <button
                type="button"
                class="secondary-button compact-button"
                :disabled="!canApplyAppConnectionModelBudget"
                @click="applyAppConnectionModelBudget(true)"
              >
                {{ text('应用模型预算', 'Use model budget') }}
              </button>
            </div>

            <details class="mgw-profile-advanced">
              <summary>{{ text('Codex 高级', 'Codex advanced') }}</summary>
              <div class="mgw-profile-toggles">
                <label class="mgw-check">
                  <input v-model="appConnectionProfile.codexResponsesWebsockets" type="checkbox" />
                  <span>WebSocket</span>
                </label>
                <label class="mgw-check">
                  <input v-model="appConnectionProfile.codexResponsesWebsocketsV2" type="checkbox" />
                  <span>WebSocket v2</span>
                </label>
                <label class="mgw-check">
                  <input v-model="appConnectionProfile.codexRequestCompression" type="checkbox" />
                  <span>{{ text('请求压缩', 'Request compression') }}</span>
                </label>
              </div>
            </details>
          </section>

          <div class="mgw-app-grid">
            <section
              v-for="connection in appConnections"
              :id="`mgw-app-${connection.id}`"
              :key="connection.id"
              class="mgw-app-card"
              :class="{ active: routeAppConnectionId === connection.id }"
            >
              <div class="mgw-app-card__head">
                <div>
                  <strong>{{ connection.label }}</strong>
                  <small>{{ apiFormatLabel(connection.protocol) }} · {{ connection.appScope }}</small>
                </div>
                <StatusPill :label="appConnectionStateLabel(connection)" :tone="appConnectionStateTone(connection)" />
              </div>

              <div class="mgw-app-facts">
                <div>
                  <span>Endpoint</span>
                  <strong>{{ connection.endpoint }}</strong>
                </div>
                <div>
                  <span>{{ text('配置文件', 'Config file') }}</span>
                  <strong>{{ connection.target.path }}</strong>
                </div>
                <div>
                  <span>{{ text('Profile 模型', 'Profile model') }}</span>
                  <strong>{{ connection.model || '-' }}</strong>
                </div>
                <div>
                  <span>{{ text('有效预算', 'Effective budget') }}</span>
                  <strong>{{ appConnectionBudgetLabel(connection.model || appConnectionProfile.model) }}</strong>
                </div>
                <div>
                  <span>{{ text('最近备份', 'Latest backup') }}</span>
                  <strong>{{ connection.lastBackupPath || '-' }}</strong>
                </div>
              </div>

              <div v-if="connection.issues.length" class="mgw-app-issues">
                <span v-for="issue in connection.issues" :key="issue">{{ issue }}</span>
              </div>

              <label class="form-field mgw-app-model-field">
                <span class="form-label">{{ text('App 模型', 'App model') }}</span>
                <select v-if="appConnectionModelOptions.length" v-model="appConnectionProfile.appModels[connection.id]" class="form-input">
                  <option value="">{{ text('使用默认模型', 'Use default model') }}</option>
                  <option v-for="model in appConnectionModelOptions" :key="`${connection.id}-${model.id}`" :value="model.id">{{ model.label }}</option>
                </select>
                <input v-else v-model.trim="appConnectionProfile.appModels[connection.id]" class="form-input" :placeholder="text('留空使用默认模型', 'Use default model')" />
              </label>

              <details class="mgw-app-preview">
                <summary>{{ text('预览配置', 'Preview config') }}</summary>
                <pre>{{ connection.preview.content }}</pre>
              </details>

              <div class="mgw-app-actions">
                <button
                  type="button"
                  class="primary-button compact-button"
                  :disabled="!connection.canApply || isAppConnectionBusy(connection.id)"
                  @click="applyAppConnectionConfig(connection.id)"
                >
                  {{ isAppConnectionBusy(connection.id) ? text('应用中...', 'Applying...') : text('应用配置', 'Apply config') }}
                </button>
                <button
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="!connection.canRollback || isAppConnectionBusy(connection.id)"
                  @click="rollbackAppConnectionConfig(connection.id)"
                >
                  {{ text('回滚', 'Rollback') }}
                </button>
                <span v-if="connection.launchHint">{{ connection.launchHint }}</span>
              </div>
            </section>
            <div v-if="loaded && !appConnections.length" class="mgw-empty">
              {{ text('还没有可管理的客户端连接。', 'No manageable client connections yet.') }}
            </div>
          </div>
        </article>

        <article
          v-show="activeWorkspaceTab === 'providers'"
          id="mgw-panel-providers"
          class="mgw-panel mgw-workspace-panel"
          role="tabpanel"
          aria-labelledby="mgw-tab-providers"
        >
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Provider Center</p>
              <h3>{{ text('Provider 配置', 'Provider configuration') }}</h3>
            </div>
            <button type="button" class="secondary-button compact-button" @click="resetDraft">
              {{ text('新建', 'New') }}
            </button>
          </div>

          <div class="mgw-template-strip" aria-label="Native protocol templates">
            <button
              v-for="template in protocolTemplates"
              :key="template.id"
              type="button"
              class="surface-tab"
              :class="{ active: draft.templateId === template.id }"
              @click="applyProtocolTemplate(template)"
            >
              {{ template.label }}
            </button>
          </div>
          <p class="mgw-note mgw-template-note">
            {{ text('这里只选择上游原生协议。自定义服务商也是三种协议之一；不确定时先填 Base URL 和 API Key，再点识别配置。', 'Choose the upstream native protocol here. Custom providers still use one of the three protocols; if unsure, enter Base URL and API key, then detect the configuration.') }}
          </p>

          <section class="mgw-account-login-card">
            <div class="mgw-account-login-card__main">
              <div>
                <p class="eyebrow">Account provider</p>
                <h4>{{ text('登录 Codex / GPT 账户', 'Sign in to Codex / GPT account') }}</h4>
              </div>
              <p>
                {{ text('在这里登录自己的 Codex/ChatGPT 账户，Studio Gateway 会自动创建本地账户型 provider；客户端仍只使用统一 Gateway key。', 'Sign in with your own Codex/ChatGPT account here. Studio Gateway creates a local account-backed provider automatically; clients still use the single Gateway key.') }}
              </p>
              <div v-if="codexLoginStart" class="mgw-account-login-session">
                <span>{{ text('验证码', 'Code') }}</span>
                <strong>{{ codexLoginStart.userCode }}</strong>
                <a :href="codexLoginStart.verificationUrl" target="_blank" rel="noreferrer">
                  {{ codexLoginStart.verificationUrl }}
                </a>
                <a
                  class="secondary-button compact-button mgw-account-login-open"
                  :href="codexLoginStart.verificationUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ text('打开官方授权页', 'Open authorization page') }}
                </a>
                <small>{{ codexLoginStatusText }}</small>
              </div>
              <div v-if="codexLoginProviderSummary" class="mgw-account-login-provider">
                <strong>{{ codexLoginProviderSummary }}</strong>
              </div>
            </div>
            <div class="mgw-account-login-card__actions">
              <button
                type="button"
                class="primary-button compact-button"
                :disabled="codexLoginBusy"
                @click="startCodexAccountLoginFlow()"
              >
                {{ codexLoginBusy ? text('登录中...', 'Signing in...') : text('登录 Codex 账户', 'Sign in Codex') }}
              </button>
              <button
                v-if="codexLoginStart"
                type="button"
                class="secondary-button compact-button"
                :disabled="codexLoginBusy"
                @click="pollCodexAccountLoginOnce"
              >
                {{ text('检查登录', 'Check login') }}
              </button>
            </div>
          </section>

          <div class="mgw-provider-grid">
            <section class="mgw-provider-list" :aria-label="text('Provider 列表', 'Provider list')">
              <button
                v-for="provider in providers"
                :key="provider.id"
                type="button"
                class="mgw-provider-card"
                :class="{ active: draft.id === provider.id }"
                @click="editProvider(provider)"
              >
                <span class="mgw-provider-card__main">
                  <strong>{{ provider.name }}</strong>
                  <small>{{ provider.endpointProfiles.length ? `${provider.endpointProfiles.length} endpoints` : apiFormatLabel(provider.apiFormat) }} / {{ provider.models.defaultModel || '-' }}</small>
                </span>
                <span class="mgw-provider-card__meta">
                  <StatusPill :label="provider.enabled ? text('启用', 'Enabled') : text('停用', 'Disabled')" :tone="provider.enabled ? 'sage' : 'neutral'" />
                  <small>{{ provider.secret?.hasSecret ? provider.secret.masked : text('无密钥', 'No key') }}</small>
                </span>
              </button>
              <div v-if="!providers.length" class="mgw-empty">
                {{ text('还没有 provider。选择原生协议模板，填入自己的 Base URL、模型和密钥后保存。', 'No provider yet. Pick a native protocol template, enter your own base URL, models, and key, then save.') }}
              </div>
            </section>

            <form class="mgw-provider-form" @submit.prevent="saveProvider">
              <div class="mgw-provider-form-sections">
                <section class="mgw-config-section">
                  <div class="mgw-config-section__head">
                    <h4>{{ text('基础连接', 'Connection') }}</h4>
                    <span>{{ text('服务商身份、协议、主端点和路由优先级。', 'Provider identity, native protocol, primary endpoint, and routing priority.') }}</span>
                  </div>
                  <div class="mgw-form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('Provider ID', 'Provider ID') }}</span>
                  <input v-model.trim="draft.id" class="form-input" placeholder="my-provider" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('名称', 'Name') }}</span>
                  <input v-model.trim="draft.name" class="form-input" placeholder="My Provider" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('原生协议', 'Native protocol') }}</span>
                  <select v-model="draft.apiFormat" class="form-input">
                    <option v-for="format in apiFormatOptions" :key="format.id" :value="format.id">{{ format.label }}</option>
                  </select>
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('认证方式', 'Auth') }}</span>
                  <select v-model="draft.authStrategy" class="form-input">
                    <option v-for="strategy in authStrategyOptions" :key="strategy.id" :value="strategy.id">{{ strategy.label }}</option>
                  </select>
                </label>
                <label class="form-field mgw-switch-field">
                  <span>
                    <span class="form-label">{{ text('Provider 状态', 'Provider status') }}</span>
                    <strong>{{ draft.enabled ? text('启用', 'Enabled') : text('停用', 'Disabled') }}</strong>
                  </span>
                  <input v-model="draft.enabled" type="checkbox" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('路由优先级', 'Routing priority') }}</span>
                  <input v-model.number="draft.priority" class="form-input" type="number" min="0" step="1" />
                  <span class="field-hint">{{ text('数字越小越优先；同模型跨 Provider 时按优先级自动选择和切换。', 'Lower numbers win; providers sharing the same model are selected and switched by priority.') }}</span>
                </label>
                <label class="form-field form-field-full">
                  <span class="form-label">Base URL</span>
                  <input v-model.trim="draft.baseUrl" class="form-input" placeholder="https://api.example.com/v1" />
                  <span class="field-hint">{{ text('这里是上游 API 前缀，Gateway 不会自动追加 /v1。', 'This is the upstream API prefix; Gateway will not append /v1 automatically.') }}</span>
                </label>
                  </div>
                </section>

                <section v-if="selectedProviderAccounts.length" class="mgw-config-section">
                  <div class="mgw-config-section__head">
                    <h4>{{ text('账户状态', 'Accounts') }}</h4>
                    <span>{{ text('本地账户型 provider 的启停与 token 刷新。', 'Enable, disable, and refresh local account-backed providers.') }}</span>
                  </div>
                  <div class="mgw-account-routing-grid">
                    <label class="form-field">
                      <span class="form-label">{{ text('账号池策略', 'Account strategy') }}</span>
                      <select v-model="draft.accountRoutingStrategy" class="form-input">
                        <option v-for="strategy in accountRoutingStrategyOptions" :key="strategy.id" :value="strategy.id">
                          {{ text(strategy.zh, strategy.en) }}
                        </option>
                      </select>
                    </label>
                    <label class="form-field mgw-switch-field">
                      <span>
                        <span class="form-label">Sticky session</span>
                        <strong>{{ draft.accountSessionAffinity ? text('开启', 'On') : text('关闭', 'Off') }}</strong>
                      </span>
                      <input v-model="draft.accountSessionAffinity" type="checkbox" />
                    </label>
                    <label class="form-field">
                      <span class="form-label">{{ text('单账号并发', 'Per-account concurrency') }}</span>
                      <input v-model.trim="draft.accountMaxConcurrentPerAccount" class="form-input" inputmode="numeric" placeholder="auto" />
                    </label>
                  </div>
                  <div class="mgw-account-table">
                    <div
                      v-for="account in selectedProviderAccounts"
                      :key="account.id"
                      class="mgw-account-row"
                    >
                      <div class="mgw-account-row__main">
                        <strong>{{ account.emailMasked || account.accountHash || account.id }}</strong>
                        <small>{{ account.plan || account.kind }} · {{ account.credentialSource }}</small>
                      </div>
                      <StatusPill :label="accountStateLabel(account)" :tone="accountStateTone(account)" />
                      <dl class="mgw-account-row__meta">
                        <div>
                          <dt>{{ text('过期', 'Expires') }}</dt>
                          <dd>{{ formatTimestamp(account.expiresAt || '') }}</dd>
                        </div>
                        <div>
                          <dt>{{ text('上次成功', 'Last success') }}</dt>
                          <dd>{{ formatTimestamp(account.lastSuccessAt || '') }}</dd>
                        </div>
                        <div v-if="account.cooldownUntil">
                          <dt>{{ text('冷却至', 'Cooldown') }}</dt>
                          <dd>{{ formatTimestamp(account.cooldownUntil) }}</dd>
                        </div>
                        <div v-if="account.lastError" class="mgw-account-row__error">
                          <dt>{{ text('错误', 'Error') }}</dt>
                          <dd>{{ account.lastError }}</dd>
                        </div>
                      </dl>
                      <div class="mgw-account-row__actions">
                        <button
                          type="button"
                          class="secondary-button compact-button"
                          :disabled="isAccountBusy(account, 'refresh') || !account.enabled || account.state === 'disabled'"
                          @click="refreshProviderAccountNow(account)"
                        >
                          {{ isAccountBusy(account, 'refresh') ? text('刷新中...', 'Refreshing...') : text('刷新 token', 'Refresh token') }}
                        </button>
                        <button
                          type="button"
                          class="secondary-button compact-button"
                          :disabled="isAccountBusy(account, 'toggle')"
                          @click="toggleProviderAccount(account)"
                        >
                          {{ account.enabled && account.state !== 'disabled' ? text('停用', 'Disable') : text('启用', 'Enable') }}
                        </button>
                        <button
                          v-if="account.cooldownUntil || account.state === 'cooldown'"
                          type="button"
                          class="secondary-button compact-button"
                          :disabled="isAccountBusy(account, 'clear-cooldown') || !account.enabled || account.state === 'disabled'"
                          @click="clearProviderAccountCooldown(account)"
                        >
                          {{ isAccountBusy(account, 'clear-cooldown') ? text('清除中...', 'Clearing...') : text('清除冷却', 'Clear cooldown') }}
                        </button>
                        <button
                          v-if="selectedProviderView"
                          type="button"
                          class="secondary-button compact-button"
                          :disabled="codexLoginBusy"
                          @click="startCodexAccountLoginFlow({ providerId: selectedProviderView.id, providerName: selectedProviderView.name })"
                        >
                          {{ text('重新登录', 'Sign in again') }}
                        </button>
                      </div>
                      <div class="mgw-account-row__proxy">
                        <label class="form-field">
                          <span class="form-label">{{ text('账号代理', 'Account proxy') }}</span>
                          <input
                            class="form-input"
                            :value="accountProxyDraftValue(account)"
                            placeholder="http://127.0.0.1:7890"
                            @input="updateAccountProxyDraft(account, $event)"
                          />
                        </label>
                        <button
                          type="button"
                          class="secondary-button compact-button"
                          :disabled="isAccountBusy(account, 'proxy') || !isAccountProxyDirty(account)"
                          @click="saveProviderAccountProxyDraft(account)"
                        >
                          {{ isAccountBusy(account, 'proxy') ? text('保存中...', 'Saving...') : text('保存代理', 'Save proxy') }}
                        </button>
                        <button
                          type="button"
                          class="secondary-button compact-button"
                          :disabled="isAccountBusy(account, 'proxy') || (!account.proxyUrl && !accountProxyDraftValue(account).trim())"
                          @click="clearProviderAccountProxy(account)"
                        >
                          {{ text('直连', 'Direct') }}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="mgw-config-section">
                  <div class="mgw-config-section__head">
                    <h4>{{ text('端点路由', 'Endpoint routing') }}</h4>
                    <span>{{ text('一个 Provider 下管理多个协议端点和回退顺序。', 'Manage multiple protocol endpoints and fallback order under one provider.') }}</span>
                  </div>
                <div class="mgw-endpoint-profile-list form-field-full" data-testid="gateway-endpoint-profile-editor">
                  <div class="mgw-endpoint-profile-list__head">
                    <span>
                      <span class="form-label">{{ text('Endpoint profiles', 'Endpoint profiles') }}</span>
                      <small>{{ text('同一 Provider 可挂多个协议端点；客户端会优先命中原生协议，并按 endpoint 健康状态回退。', 'One provider can own multiple protocol endpoints; clients prefer native protocol and fall back by endpoint health.') }}</small>
                    </span>
                    <div class="mgw-endpoint-profile-actions">
                      <button type="button" class="secondary-button compact-button" @click="addEndpointProfileRow()">
                        <Plus class="mgw-button-icon" />
                        <span>{{ text('添加端点', 'Add endpoint') }}</span>
                      </button>
                      <button
                        type="button"
                        class="secondary-button compact-button"
                        :disabled="!detectSupportedProtocols.length"
                        @click="mergeDetectedEndpointProfiles"
                      >
                        {{ text('用识别结果生成', 'Use detect result') }}
                      </button>
                    </div>
                  </div>
                  <div v-if="!draft.endpointRows.length" class="mgw-endpoint-profile-empty">
                    {{ text('默认使用上面的单端点配置；需要同一服务商多协议、多端点或回退时再添加 endpoint profile。', 'The single endpoint above is used by default; add endpoint profiles for multi-protocol, multi-endpoint, or fallback routing.') }}
                  </div>
                  <div v-else class="mgw-endpoint-profile-grid">
                    <div
                      v-for="(profile, index) in draft.endpointRows"
                      :key="profile.key"
                      class="mgw-endpoint-profile"
                      :class="{ disabled: !profile.enabled }"
                    >
                      <label class="mgw-check mgw-endpoint-toggle">
                        <input v-model="profile.enabled" type="checkbox" />
                        <span>{{ profile.enabled ? text('启用', 'On') : text('停用', 'Off') }}</span>
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('端点 ID', 'Endpoint ID') }}</span>
                        <input v-model.trim="profile.id" class="form-input" placeholder="coding-chat" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('名称', 'Name') }}</span>
                        <input v-model.trim="profile.name" class="form-input" placeholder="Coding Chat" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('原生协议', 'Native protocol') }}</span>
                        <select v-model="profile.apiFormat" class="form-input" @change="updateEndpointProtocol(profile)">
                          <option v-for="format in apiFormatOptions" :key="`endpoint-${profile.key}-${format.id}`" :value="format.id">{{ format.label }}</option>
                        </select>
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('认证', 'Auth') }}</span>
                        <select v-model="profile.authStrategy" class="form-input">
                          <option v-for="strategy in authStrategyOptions" :key="`endpoint-${profile.key}-${strategy.id}`" :value="strategy.id">{{ strategy.label }}</option>
                        </select>
                      </label>
                      <label class="form-field form-field-wide">
                        <span class="form-label">Base URL</span>
                        <input v-model.trim="profile.baseUrl" class="form-input" placeholder="https://api.example.com/v1" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('优先级', 'Priority') }}</span>
                        <input v-model.number="profile.priority" class="form-input" type="number" min="0" step="1" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('Anthropic 路径', 'Anthropic path') }}</span>
                        <input v-model.trim="profile.anthropicEndpoint" class="form-input" placeholder="/v1/messages" />
                      </label>
                      <label class="form-field">
                        <span class="form-label">{{ text('Compact 路径', 'Compact path') }}</span>
                        <input v-model.trim="profile.compactEndpoint" class="form-input" placeholder="/v1/responses/compact" />
                      </label>
                      <div class="mgw-endpoint-scopes">
                        <span class="form-label">{{ text('范围', 'Scopes') }}</span>
                        <label v-for="scope in appScopeOptions" :key="`endpoint-${profile.key}-${scope.id}`" class="mgw-check">
                          <input v-model="profile.appScopes[scope.id]" type="checkbox" />
                          <span>{{ text(scope.zh, scope.en) }}</span>
                        </label>
                      </div>
                      <div class="mgw-endpoint-row-actions">
                        <button
                          type="button"
                          class="secondary-button compact-button"
                          :disabled="!endpointProfilesCanSmoke || !profile.id.trim() || endpointSmokeBusy[profile.id]"
                          @click="smokeEndpointProfile(profile)"
                        >
                          {{ endpointSmokeBusy[profile.id] ? text('测试中...', 'Testing...') : text('测试端点', 'Smoke') }}
                        </button>
                        <button type="button" class="mgw-icon-button" :aria-label="text('删除端点', 'Remove endpoint')" @click="removeEndpointProfileRow(index)">
                          <Trash2 class="mgw-icon-button__icon" />
                        </button>
                      </div>
                      <div
                        v-if="endpointSmokeResults[profile.id]"
                        class="mgw-endpoint-smoke-result"
                        :class="endpointSmokeResults[profile.id]?.ok ? 'success' : 'failure'"
                      >
                        <strong>{{ endpointSmokeResults[profile.id]?.ok ? text('通过', 'Passed') : text('失败', 'Failed') }}</strong>
                        <span>{{ endpointSmokeResults[profile.id]?.statusCode || '-' }} · {{ endpointSmokeResults[profile.id]?.latencyMs }} ms · {{ endpointSmokeResults[profile.id]?.route.upstreamUrl || '-' }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                </section>

                <section class="mgw-config-section">
                  <div class="mgw-config-section__head">
                    <h4>{{ text('密钥与识别', 'Key and detect') }}</h4>
                    <span>{{ text('保存上游密钥，或自动识别协议与模型。', 'Save the upstream key or detect protocols and models.') }}</span>
                  </div>
                  <div class="mgw-form-grid">
                <label class="form-field">
                  <span class="form-label">API Key</span>
                  <input v-model="draft.apiKey" class="form-input" type="password" :placeholder="secretPlaceholder" />
                </label>
                <div class="mgw-detect-card">
                  <div class="mgw-detect-card__main">
                    <span class="form-label">{{ text('连接检测', 'Connection check') }}</span>
                    <strong>{{ detectStatusTitle }}</strong>
                    <small>{{ detectStatusDetail }}</small>
                  </div>
                  <div class="mgw-detect-card__actions">
                    <button type="button" class="primary-button compact-button" :disabled="detectBusy || !draft.baseUrl.trim()" @click="detectProviderConfig">
                      {{ detectBusy ? text('识别中...', 'Detecting...') : text('识别配置', 'Detect config') }}
                    </button>
                    <button v-if="detectResult" type="button" class="secondary-button compact-button" @click="openDetectOverlay">
                      {{ text('查看结果', 'View result') }}
                    </button>
                  </div>
                </div>
                  </div>
                </section>

                <section class="mgw-config-section">
                  <div class="mgw-config-section__head">
                    <h4>{{ text('模型目录', 'Model catalog') }}</h4>
                    <span>{{ text('只维护模型名称和别名；预算和能力可批量补齐。', 'Maintain model names and aliases; budgets and capabilities can be filled in bulk.') }}</span>
                  </div>
                  <div class="mgw-form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('默认模型', 'Default model') }}</span>
                  <select v-if="draftDefaultModelOptions.length" v-model="draft.defaultModel" class="form-input">
                    <option value="">{{ text('选择默认模型', 'Select default model') }}</option>
                    <option v-for="model in draftDefaultModelOptions" :key="model" :value="model">{{ model }}</option>
                  </select>
                  <input v-else v-model.trim="draft.defaultModel" class="form-input" placeholder="model-id" />
                </label>
                <div class="form-field form-field-full">
                  <div class="mgw-model-list-head">
                    <span class="form-label">{{ text('模型列表', 'Model list') }}</span>
                    <div class="mgw-model-list-actions">
                      <button
                        type="button"
                        class="secondary-button compact-button"
                        :disabled="modelCatalogRefreshBusy || detectBusy || !draft.baseUrl.trim()"
                        @click="refreshModelCatalogFromProvider"
                      >
                        {{ modelCatalogRefreshBusy ? text('刷新中...', 'Refreshing...') : text('刷新目录', 'Refresh catalog') }}
                      </button>
                      <button type="button" class="secondary-button compact-button" @click="addDraftModelRow">
                        <Plus class="mgw-button-icon" />
                        <span>{{ text('添加模型', 'Add model') }}</span>
                      </button>
                    </div>
                  </div>
                  <details class="mgw-model-batch">
                    <summary>{{ text('批量导入 / 能力预算', 'Bulk import / capabilities') }}</summary>
                    <div class="mgw-model-batch__body">
                      <label class="form-field form-field-full">
                        <span class="form-label">{{ text('批量文本', 'Bulk text') }}</span>
                        <textarea
                          v-model="draft.modelListText"
                          class="form-input mgw-model-list-input"
                          rows="4"
                          placeholder="model-id | alias1,alias2&#10;model-b | b1,b2"
                        />
                      </label>
                      <div class="mgw-model-batch__actions">
                        <button type="button" class="secondary-button compact-button" @click="applyModelTextToRows">
                          {{ text('导入文本', 'Import text') }}
                        </button>
                        <button type="button" class="secondary-button compact-button" @click="copyModelRowsToBatchText">
                          {{ text('从表格同步', 'Sync from table') }}
                        </button>
                        <button type="button" class="secondary-button compact-button" @click="fillMissingModelMetadata">
                          {{ text('补齐空白预算/能力', 'Fill blanks') }}
                        </button>
                      </div>
                      <div class="mgw-model-batch__bulk">
                        <label class="form-field">
                          <span class="form-label">{{ text('批量上下文', 'Bulk context') }}</span>
                          <input v-model.trim="modelBulk.contextWindow" class="form-input" inputmode="numeric" placeholder="128000" />
                        </label>
                        <label class="form-field">
                          <span class="form-label">{{ text('批量输出', 'Bulk output') }}</span>
                          <input v-model.trim="modelBulk.maxOutputTokens" class="form-input" inputmode="numeric" placeholder="8192" />
                        </label>
                        <button type="button" class="secondary-button compact-button" @click="applyModelBulkBudget">
                          {{ text('应用预算到全部', 'Apply budget') }}
                        </button>
                      </div>
                      <div class="mgw-model-batch__capabilities" :aria-label="text('批量模型能力', 'Bulk model capabilities')">
                        <label v-for="capability in modelCapabilityOptions" :key="`bulk-${capability.id}`" class="mgw-model-capability">
                          <input v-model="modelBulk[capability.id]" type="checkbox" />
                          <span>{{ text(capability.zh, capability.en) }}</span>
                        </label>
                        <button type="button" class="secondary-button compact-button" @click="applyModelBulkCapabilities">
                          {{ text('应用能力到全部', 'Apply capabilities') }}
                        </button>
                      </div>
                    </div>
                  </details>
                  <div class="mgw-model-table" data-testid="gateway-model-capability-list">
                    <div class="mgw-model-table__head">
                      <span>{{ text('模型名称', 'Model name') }}</span>
                      <span>{{ text('别名', 'Aliases') }}</span>
                      <span>{{ text('上下文', 'Context') }}</span>
                      <span>{{ text('输出', 'Output') }}</span>
                      <span>{{ text('能力', 'Capabilities') }}</span>
                      <span></span>
                    </div>
                    <div v-if="draft.modelRows.length === 0" class="mgw-model-empty">
                      {{ text('添加模型，或先填写 Base URL / Key 后点击识别配置。', 'Add a model, or enter Base URL / key and detect the config first.') }}
                    </div>
                    <div v-for="(model, index) in draft.modelRows" :key="model.key" class="mgw-model-row">
                      <label class="mgw-model-cell">
                        <span class="mgw-model-cell__label">{{ text('模型名称', 'Model name') }}</span>
                        <input v-model.trim="model.id" class="form-input" placeholder="gpt-5.5" @blur="syncDefaultModelWithList" />
                      </label>
                      <label class="mgw-model-cell">
                        <span class="mgw-model-cell__label">{{ text('别名', 'Aliases') }}</span>
                        <input v-model.trim="model.aliases" class="form-input" placeholder="alias1, alias2" />
                      </label>
                      <label class="mgw-model-cell">
                        <span class="mgw-model-cell__label">{{ text('上下文', 'Context') }}</span>
                        <input v-model.trim="model.contextWindow" class="form-input" inputmode="numeric" placeholder="128000" />
                      </label>
                      <label class="mgw-model-cell">
                        <span class="mgw-model-cell__label">{{ text('输出', 'Output') }}</span>
                        <input v-model.trim="model.maxOutputTokens" class="form-input" inputmode="numeric" placeholder="8192" />
                      </label>
                      <div class="mgw-model-cell mgw-model-cell--capabilities">
                        <span class="mgw-model-cell__label">{{ text('能力', 'Capabilities') }}</span>
                        <div class="mgw-model-capabilities" :aria-label="text('模型能力', 'Model capabilities')">
                          <label v-for="capability in modelCapabilityOptions" :key="capability.id" class="mgw-model-capability">
                            <input v-model="model[capability.id]" type="checkbox" />
                            <span>{{ text(capability.zh, capability.en) }}</span>
                          </label>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="mgw-icon-button mgw-model-remove"
                        :aria-label="text('删除模型', 'Remove model')"
                        :title="text('删除模型', 'Remove model')"
                        @click="removeDraftModelRow(index)"
                      >
                        <Trash2 class="mgw-icon-button__icon" />
                      </button>
                      <details class="mgw-model-pricing">
                        <summary>{{ modelPricingSummary(model) }}</summary>
                        <div class="mgw-model-pricing__grid">
                          <label class="form-field">
                            <span class="form-label">{{ text('币种', 'Currency') }}</span>
                            <input v-model.trim="model.pricingCurrency" class="form-input" placeholder="USD" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('输入 / 1M', 'Input / 1M') }}</span>
                            <input v-model.trim="model.inputPricePer1M" class="form-input" inputmode="decimal" placeholder="0" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('输出 / 1M', 'Output / 1M') }}</span>
                            <input v-model.trim="model.outputPricePer1M" class="form-input" inputmode="decimal" placeholder="0" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('缓存读 / 1M', 'Cache read / 1M') }}</span>
                            <input v-model.trim="model.cacheReadPricePer1M" class="form-input" inputmode="decimal" placeholder="0" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('缓存写 / 1M', 'Cache write / 1M') }}</span>
                            <input v-model.trim="model.cacheCreationPricePer1M" class="form-input" inputmode="decimal" placeholder="0" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('生图 / 张', 'Image / output') }}</span>
                            <input v-model.trim="model.imageGenerationPrice" class="form-input" inputmode="decimal" placeholder="0" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('修图 / 次', 'Edit / request') }}</span>
                            <input v-model.trim="model.imageEditPrice" class="form-input" inputmode="decimal" placeholder="0" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('音频输入 / 次', 'Audio in / request') }}</span>
                            <input v-model.trim="model.audioInputPrice" class="form-input" inputmode="decimal" placeholder="0" />
                          </label>
                          <label class="form-field">
                            <span class="form-label">{{ text('音频输出 / 次', 'Audio out / request') }}</span>
                            <input v-model.trim="model.audioOutputPrice" class="form-input" inputmode="decimal" placeholder="0" />
                          </label>
                        </div>
                      </details>
                    </div>
                  </div>
                  <span class="field-hint">{{ text('同一 Provider 内模型名称和别名不能重复；不同 Provider 允许同名模型，用于优先级和负载切换。', 'Model names and aliases must be unique inside one provider; different providers may share model names for priority and failover routing.') }}</span>
                </div>
                  </div>
                </section>

                <section class="mgw-config-section">
                  <div class="mgw-config-section__head">
                    <h4>{{ text('高级覆盖', 'Advanced overrides') }}</h4>
                    <span>{{ text('只在服务商路径或网络环境特殊时配置。', 'Use only for special provider paths or network environments.') }}</span>
                  </div>
                  <div class="mgw-form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('Anthropic endpoint override', 'Anthropic endpoint override') }}</span>
                  <input v-model.trim="draft.anthropicEndpoint" class="form-input" placeholder="/messages" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('Compact endpoint override', 'Compact endpoint override') }}</span>
                  <input v-model.trim="draft.compactEndpoint" class="form-input" placeholder="/responses/compact" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('代理 URL', 'Proxy URL') }}</span>
                  <input v-model.trim="draft.proxyUrl" class="form-input" placeholder="http://127.0.0.1:7890" />
                </label>
                <label class="form-field">
                  <span class="form-label">NO_PROXY</span>
                  <input v-model.trim="draft.noProxy" class="form-input" placeholder="localhost,127.0.0.1" />
                </label>
                  </div>
                </section>
              </div>

              <section class="mgw-config-section mgw-scope-section">
                <div class="mgw-config-section__head">
                  <h4>{{ text('可用范围', 'Available scopes') }}</h4>
                  <span>{{ text('选择哪些客户端可以使用这个 Provider。', 'Choose which clients can use this provider.') }}</span>
                </div>
                <div class="mgw-scope-picker">
                  <label v-for="scope in appScopeOptions" :key="scope.id" class="mgw-check">
                    <input v-model="draft.appScopes[scope.id]" type="checkbox" />
                    <span>{{ text(scope.zh, scope.en) }}</span>
                  </label>
                </div>
              </section>

              <div class="mgw-button-row mgw-form-actions">
                <button type="submit" class="primary-button" :disabled="busy || !canSaveProvider">
                  {{ busy ? text('保存中...', 'Saving...') : text('保存 Provider', 'Save provider') }}
                </button>
                <button v-if="draft.id && providerExists(draft.id)" type="button" class="danger-link" :disabled="busy" @click="removeProvider(draft.id)">
                  {{ text('删除', 'Delete') }}
                </button>
              </div>
            </form>
          </div>
        </article>

        <article
          v-show="activeWorkspaceTab === 'usage'"
          id="mgw-panel-usage"
          class="mgw-panel mgw-workspace-panel"
          role="tabpanel"
          aria-labelledby="mgw-tab-usage"
        >
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Usage</p>
              <h3>{{ text('模型消耗', 'Model usage') }}</h3>
            </div>
            <div class="mgw-panel-actions">
              <button type="button" class="secondary-button compact-button" :disabled="!canExportUsage" @click="downloadGatewayUsageCsv">
                {{ text('导出 CSV', 'Export CSV') }}
              </button>
              <button type="button" class="secondary-button compact-button" :disabled="usageBusy" @click="refreshUsageLedger">
                {{ usageBusy ? text('刷新中...', 'Refreshing...') : text('刷新消耗', 'Refresh usage') }}
              </button>
            </div>
          </div>

          <p class="mgw-note mgw-usage-note">
            {{ text('统计来自本地脱敏 usage ledger，覆盖账号登录 provider 和普通 API-key provider；不会读取或展示上游密钥。', 'Stats come from the local redacted usage ledger and cover account-backed providers plus regular API-key providers; upstream secrets are never read or shown.') }}
          </p>

          <section class="mgw-usage-controls" aria-label="Usage filters">
            <label class="form-field">
              <span class="form-label">{{ text('时间范围', 'Time range') }}</span>
              <select v-model="usageTimeRange" class="form-input">
                <option v-for="option in usageTimeRangeOptions" :key="option.id" :value="option.id">
                  {{ text(option.zh, option.en) }}
                </option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('来源', 'Source') }}</span>
              <select v-model="usageSourceFilter" class="form-input">
                <option v-for="option in usageSourceFilterOptions" :key="option.id" :value="option.id">
                  {{ text(option.zh, option.en) }}
                </option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">Provider</span>
              <select v-model="usageProviderFilter" class="form-input">
                <option value="">{{ text('全部 Provider', 'All providers') }}</option>
                <option v-for="provider in usageProviderFilterOptions" :key="provider.id" :value="provider.id">
                  {{ provider.label }}
                </option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('模型', 'Model') }}</span>
              <select v-model="usageModelFilter" class="form-input">
                <option value="">{{ text('全部模型', 'All models') }}</option>
                <option v-for="model in usageModelFilterOptions" :key="model" :value="model">
                  {{ model }}
                </option>
              </select>
            </label>
            <div class="mgw-usage-controls__meta">
              <strong>{{ usageFilteredWindowLabel }}</strong>
              <small>{{ usageLedgerWindowLabel }}</small>
            </div>
          </section>

          <section class="mgw-usage-summary-grid" aria-label="Gateway usage summary">
            <div v-for="card in usageSummaryCards" :key="card.id" class="mgw-usage-summary-card">
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
              <small>{{ card.meta }}</small>
            </div>
          </section>

          <div class="mgw-usage-section-grid">
            <section class="mgw-usage-section">
              <div class="mgw-usage-section__head">
                <strong>{{ text('Provider 消耗', 'Provider usage') }}</strong>
                <small>{{ text('账号 provider 与 API-key provider 统一统计。', 'Account-backed and API-key providers share this view.') }}</small>
              </div>
              <div class="mgw-usage-bucket-list">
                <div v-for="bucket in usageProviderBuckets" :key="`provider-${bucket.key}`" class="mgw-usage-row">
                  <div class="mgw-usage-row__main">
                    <strong>{{ usageBucketTitle(bucket) }}</strong>
                    <small>{{ usageBucketMeta(bucket, 'provider') }}</small>
                  </div>
                  <dl class="mgw-usage-metrics">
                    <div>
                      <dt>{{ text('请求', 'Requests') }}</dt>
                      <dd>{{ formatCompactNumber(bucket.requestCount) }}</dd>
                    </div>
                    <div>
                      <dt>Tokens</dt>
                      <dd>{{ formatCompactNumber(bucket.usage.totalTokens) }}</dd>
                    </div>
                    <div>
                      <dt>{{ text('媒体', 'Media') }}</dt>
                      <dd>{{ usageMediaLabel(bucket.usage) || '-' }}</dd>
                    </div>
                    <div>
                      <dt>{{ text('估算成本', 'Estimated cost') }}</dt>
                      <dd>{{ formatUsageCostEstimate(usageBucketCostEstimate(bucket, 'provider')) }}</dd>
                    </div>
                    <div>
                      <dt>{{ text('最近', 'Latest') }}</dt>
                      <dd>{{ bucket.latestRequestAt ? formatTimestamp(bucket.latestRequestAt) : '-' }}</dd>
                    </div>
                  </dl>
                </div>
                <div v-if="!usageProviderBuckets.length" class="mgw-empty">
                  {{ text('暂无 Provider 消耗记录。', 'No provider usage yet.') }}
                </div>
              </div>
            </section>

            <section class="mgw-usage-section">
              <div class="mgw-usage-section__head">
                <strong>{{ text('模型消耗', 'Model usage') }}</strong>
                <small>{{ text('同名模型跨 Provider 会自然汇总。', 'Shared model names across providers are naturally aggregated.') }}</small>
              </div>
              <div class="mgw-usage-bucket-list">
                <div v-for="bucket in usageModelBuckets" :key="`model-${bucket.key}`" class="mgw-usage-row">
                  <div class="mgw-usage-row__main">
                    <strong>{{ usageBucketTitle(bucket) }}</strong>
                    <small>{{ usageBucketMeta(bucket, 'model') }}</small>
                  </div>
                  <dl class="mgw-usage-metrics">
                    <div>
                      <dt>{{ text('请求', 'Requests') }}</dt>
                      <dd>{{ formatCompactNumber(bucket.requestCount) }}</dd>
                    </div>
                    <div>
                      <dt>Tokens</dt>
                      <dd>{{ formatCompactNumber(bucket.usage.totalTokens) }}</dd>
                    </div>
                    <div>
                      <dt>{{ text('明细', 'Breakdown') }}</dt>
                      <dd>{{ usageTokenLabel(bucket.usage) }}</dd>
                    </div>
                    <div>
                      <dt>{{ text('媒体', 'Media') }}</dt>
                      <dd>{{ usageMediaLabel(bucket.usage) || '-' }}</dd>
                    </div>
                    <div>
                      <dt>{{ text('估算成本', 'Estimated cost') }}</dt>
                      <dd>{{ formatUsageCostEstimate(usageBucketCostEstimate(bucket, 'model')) }}</dd>
                    </div>
                  </dl>
                </div>
                <div v-if="!usageModelBuckets.length" class="mgw-empty">
                  {{ text('暂无模型消耗记录。', 'No model usage yet.') }}
                </div>
              </div>
            </section>
          </div>

          <section class="mgw-usage-section">
            <div class="mgw-usage-section__head">
              <strong>{{ text('账号消耗', 'Account usage') }}</strong>
              <small>{{ text('仅账号登录 provider 会进入这里；普通 API-key provider 已在 Provider 消耗里统计。', 'Only account-backed providers appear here; regular API-key providers are already counted under Provider usage.') }}</small>
            </div>
            <div class="mgw-usage-bucket-list">
              <div v-for="bucket in usageAccountBuckets" :key="`account-${bucket.key}`" class="mgw-usage-row">
                <div class="mgw-usage-row__main">
                  <strong>{{ usageBucketTitle(bucket) }}</strong>
                  <small>{{ usageBucketMeta(bucket, 'account') }}</small>
                </div>
                <dl class="mgw-usage-metrics">
                  <div>
                    <dt>{{ text('请求', 'Requests') }}</dt>
                    <dd>{{ formatCompactNumber(bucket.requestCount) }}</dd>
                  </div>
                  <div>
                    <dt>Tokens</dt>
                    <dd>{{ formatCompactNumber(bucket.usage.totalTokens) }}</dd>
                  </div>
                  <div>
                    <dt>{{ text('计费用', 'Metered') }}</dt>
                    <dd>{{ formatCompactNumber(bucket.meteredRequestCount) }}</dd>
                  </div>
                  <div>
                    <dt>{{ text('估算成本', 'Estimated cost') }}</dt>
                    <dd>{{ formatUsageCostEstimate(usageBucketCostEstimate(bucket, 'account')) }}</dd>
                  </div>
                  <div>
                    <dt>{{ text('最近', 'Latest') }}</dt>
                    <dd>{{ bucket.latestRequestAt ? formatTimestamp(bucket.latestRequestAt) : '-' }}</dd>
                  </div>
                </dl>
              </div>
              <div v-if="!usageAccountBuckets.length" class="mgw-empty">
                {{ text('暂无账号消耗记录；如果只配置了 API-key provider，这是正常的。', 'No account usage yet; this is expected when only API-key providers are configured.') }}
              </div>
            </div>
          </section>

          <section class="mgw-usage-section">
            <div class="mgw-usage-section__head">
              <strong>{{ text('最近消耗记录', 'Recent usage entries') }}</strong>
              <small>{{ usageLedgerWindowLabel }}</small>
            </div>
            <div class="mgw-usage-entry-list">
              <details v-for="entry in usageRecentEntries" :key="entry.id" class="mgw-usage-entry" :class="entry.outcome">
                <summary>
                  <span>{{ entry.outcome }}</span>
                  <strong>{{ usageEntryProviderLabel(entry) }}</strong>
                  <small>{{ usageRouteLabel(entry.routeId) }} · {{ entry.model || '-' }}</small>
                  <small>{{ usageEntryAccountLabel(entry) }}</small>
                  <small>{{ formatTimestamp(entry.finishedAt) }} · {{ formatCompactNumber(entry.durationMs) }} ms</small>
                </summary>
                <div class="mgw-usage-entry__detail">
                  <div>
                    <span>{{ text('路径', 'Path') }}</span>
                    <strong>{{ entry.requestedPath }}</strong>
                  </div>
                  <div>
                    <span>Endpoint</span>
                    <strong>{{ entry.upstreamUrl || '-' }}</strong>
                  </div>
                  <div>
                    <span>Tokens</span>
                    <strong>{{ entry.usage ? usageTokenLabel(entry.usage) : '-' }}</strong>
                  </div>
                  <div>
                    <span>{{ text('媒体', 'Media') }}</span>
                    <strong>{{ entry.usage ? usageMediaLabel(entry.usage) || '-' : '-' }}</strong>
                  </div>
                  <div>
                    <span>{{ text('估算成本', 'Estimated cost') }}</span>
                    <strong>{{ formatUsageCostEstimate(estimateUsageCost([entry])) }}</strong>
                  </div>
                  <div v-if="entry.errorCode || entry.errorMessage">
                    <span>{{ text('错误', 'Error') }}</span>
                    <strong>{{ [entry.errorCode, entry.errorMessage].filter(Boolean).join(' · ') }}</strong>
                  </div>
                </div>
              </details>
              <div v-if="!usageRecentEntries.length" class="mgw-empty">
                {{ text('暂无消耗记录。', 'No usage entries yet.') }}
              </div>
            </div>
          </section>
        </article>

        <article
          v-show="activeWorkspaceTab === 'smoke'"
          id="mgw-panel-smoke"
          class="mgw-panel mgw-workspace-panel"
          role="tabpanel"
          aria-labelledby="mgw-tab-smoke"
        >
          <div class="mgw-panel-head">
            <div>
              <p class="eyebrow">Smoke</p>
              <h3>{{ text('协议 smoke', 'Protocol smoke') }}</h3>
            </div>
            <div class="mgw-panel-actions">
              <button type="button" class="secondary-button compact-button" :disabled="smokeBusy || visionSmokeBusy || !smokeProviderId" @click="runVisionSmoke">
                {{ visionSmokeBusy ? text('测试中...', 'Testing...') : text('图片 smoke', 'Vision smoke') }}
              </button>
              <button type="button" class="primary-button compact-button" :disabled="smokeBusy || visionSmokeBusy || !smokeProviderId" @click="runSmoke">
                {{ smokeBusy ? text('测试中...', 'Testing...') : text('运行 smoke', 'Run smoke') }}
              </button>
            </div>
          </div>

          <div class="mgw-smoke-grid">
            <label class="form-field">
              <span class="form-label">Provider</span>
              <select v-model="smokeProviderId" class="form-input">
                <option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('客户端协议', 'Client protocol') }}</span>
              <select v-model="smokeRouteId" class="form-input">
                <option v-for="route in routeOptions" :key="route.id" :value="route.id">{{ route.label }}</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('模型', 'Model') }}</span>
              <select v-if="selectedSmokeProviderModelIds.length" v-model="smokeModel" class="form-input">
                <option v-for="model in selectedSmokeProviderModelIds" :key="model" :value="model">{{ model }}</option>
              </select>
              <input v-else v-model.trim="smokeModel" class="form-input" :placeholder="selectedSmokeProvider?.models.defaultModel || 'model-id'" />
            </label>
            <label class="form-field">
              <span class="form-label">{{ text('输入', 'Input') }}</span>
              <input v-model.trim="smokeInput" class="form-input" placeholder="Reply with GATEWAY_OK" />
            </label>
          </div>

          <section class="mgw-media-status" aria-label="Gateway media model status">
            <div class="mgw-media-status__head">
              <strong>{{ text('媒体模型状态', 'Media model status') }}</strong>
              <small>{{ text('来自已启用 Provider 的模型能力标记。', 'Based on capability flags from enabled providers.') }}</small>
            </div>
            <div class="mgw-media-status__grid">
              <div v-for="bucket in mediaCatalogBuckets" :key="bucket.id" class="mgw-media-status__item">
                <span>{{ text(bucket.zh, bucket.en) }}</span>
                <strong>{{ bucket.count }}</strong>
                <small>{{ bucket.preview || '-' }}</small>
              </div>
            </div>
          </section>

          <div v-if="smokeResult" class="mgw-smoke-result" :class="smokeResult.ok ? 'success' : 'failure'">
            <div>
              <strong>{{ smokeResult.ok ? text('通过', 'Passed') : text('失败', 'Failed') }}</strong>
              <span>{{ smokeResult.statusCode || '-' }} · {{ smokeResult.latencyMs }} ms · {{ smokeResult.route.upstreamUrl || '-' }}</span>
            </div>
            <pre>{{ smokeResult.responsePreview || smokeResult.error?.message || '-' }}</pre>
          </div>

          <div v-if="visionSmokeResult" class="mgw-smoke-result" :class="visionSmokeResult.ok ? 'success' : 'failure'">
            <div>
              <strong>{{ visionSmokeResult.ok ? text('图片通过', 'Vision passed') : text('图片失败', 'Vision failed') }}</strong>
              <span>{{ visionSmokeResult.statusCode || '-' }} · {{ visionSmokeResult.latencyMs }} ms · {{ visionSmokeResult.route.upstreamUrl || '-' }}</span>
            </div>
            <pre>{{ visionSmokeMessage(visionSmokeResult) }}</pre>
          </div>

          <div class="mgw-request-log">
            <div class="mgw-log-head">
              <div>
                <strong>{{ text('最近请求', 'Recent requests') }}</strong>
                <span>{{ runtime?.runtime.updatedAt ? formatTimestamp(runtime.runtime.updatedAt) : '-' }}</span>
              </div>
              <div class="mgw-log-filters" role="group" :aria-label="text('请求日志筛选', 'Request log filters')">
                <button
                  v-for="option in runtimeLogFilterOptions"
                  :key="option.id"
                  type="button"
                  :class="{ active: runtimeLogFilter === option.id }"
                  @click="runtimeLogFilter = option.id"
                >
                  {{ text(option.zh, option.en) }}
                </button>
              </div>
            </div>
            <details v-for="entry in runtimeEntries" :key="entry.id" class="mgw-log-row" :class="entry.outcome">
              <summary class="mgw-log-row__summary">
              <span>{{ entry.outcome }}</span>
              <strong>{{ entry.providerName || entry.providerId || '-' }}</strong>
              <div class="mgw-log-row__body">
                <small>{{ entry.requestedPath }} · {{ entry.model || '-' }} · {{ entry.durationMs }} ms</small>
                <small v-if="entry.accountRouting" class="mgw-log-row__account">
                  {{ accountRoutingSummary(entry.accountRouting) }}
                </small>
              </div>
              <small class="mgw-log-row__toggle">{{ text('详情', 'Details') }}</small>
              </summary>
              <div v-if="entry.accountRouting" class="mgw-log-routing-detail">
                <div v-for="item in accountRoutingDetailRows(entry.accountRouting)" :key="item.key">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
              <div v-else class="mgw-log-routing-detail muted">
                {{ text('此请求没有账号池诊断。', 'This request has no account pool diagnostics.') }}
              </div>
            </details>
            <div v-if="!runtimeEntries.length" class="mgw-empty">
              {{ runtimeLogFilter === 'all' ? text('暂无请求记录。', 'No request log yet.') : text('当前筛选没有请求记录。', 'No request log matches the current filter.') }}
            </div>
          </div>
        </article>
      </main>
    </section>

    <Teleport to="body">
      <div v-if="detectOverlayOpen" class="mgw-detect-overlay" @click.self="closeDetectOverlay">
        <section class="mgw-detect-popover" role="dialog" aria-modal="true" aria-labelledby="mgw-detect-title">
          <header class="mgw-detect-popover__head">
            <div>
              <p class="eyebrow">{{ text('Provider Detect', 'Provider Detect') }}</p>
              <h3 id="mgw-detect-title">{{ text('识别协议与模型', 'Detect protocol and models') }}</h3>
            </div>
            <button type="button" class="mgw-icon-button" :aria-label="text('关闭', 'Close')" @click="closeDetectOverlay">
              <X class="mgw-icon-button__icon" aria-hidden="true" />
            </button>
          </header>

          <div class="mgw-detect-target">
            <span>Base URL</span>
            <strong>{{ draft.baseUrl.trim() || '-' }}</strong>
            <small>{{ detectResult?.checkedAt ? formatTimestamp(detectResult.checkedAt) : text('等待检测', 'Waiting') }}</small>
          </div>

          <div class="mgw-detect-steps" aria-live="polite">
            <div
              v-for="step in detectSteps"
              :key="step.id"
              class="mgw-detect-step"
              :class="`is-${step.status}`"
            >
              <span class="mgw-detect-step__mark" aria-hidden="true"></span>
              <div>
                <strong>{{ step.label }}</strong>
                <small>{{ step.detail }}</small>
              </div>
            </div>
          </div>

          <div v-if="detectResult" class="mgw-detect-result">
            <div class="mgw-detect-result__head">
              <strong>{{ text('可用协议', 'Supported protocols') }}</strong>
              <span>{{ detectSupportedProtocols.length }}/3</span>
            </div>
            <div class="mgw-detect-protocols">
              <div
                v-for="protocol in detectResult.protocols"
                :key="`${protocol.apiFormat}-${protocol.authStrategy}`"
                class="mgw-detect-protocol"
                :class="{ success: protocol.ok, skipped: protocol.skipped }"
              >
                <div>
                  <strong>{{ apiFormatLabel(protocol.apiFormat) }}</strong>
                  <small>{{ protocolDetail(protocol) }}</small>
                </div>
                <button
                  v-if="protocol.ok"
                  type="button"
                  class="primary-button compact-button"
                  @click="applyDetectedProtocol(protocol)"
                >
                  {{ appliedProtocolKey === protocolKey(protocol) ? text('已应用', 'Applied') : text('应用', 'Apply') }}
                </button>
                <span v-else>{{ protocol.error?.message || '-' }}</span>
              </div>
            </div>
          </div>

          <footer class="mgw-detect-popover__foot">
            <button type="button" class="secondary-button compact-button" :disabled="detectBusy" @click="closeDetectOverlay">
              {{ text('关闭', 'Close') }}
            </button>
            <button
              type="button"
              class="secondary-button compact-button"
              :disabled="detectBusy || !detectSupportedProtocols.length"
              @click="mergeDetectedEndpointProfiles"
            >
              {{ text('同步 endpoint profiles', 'Sync endpoint profiles') }}
            </button>
            <button type="button" class="primary-button compact-button" :disabled="detectBusy || !draft.baseUrl.trim()" @click="detectProviderConfig">
              {{ detectBusy ? text('识别中...', 'Detecting...') : text('重新识别', 'Detect again') }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Plus, Trash2, X } from '@lucide/vue';
import { MODEL_GATEWAY_ACCOUNT_ROUTING_STRATEGIES, MODEL_GATEWAY_APP_CONNECTION_IDS } from '../../../../../types/model-gateway';
import type {
  ModelGatewayAccountEntry,
  ModelGatewayAccountRoutingDiagnostics,
  ModelGatewayAccountRoutingStrategy,
  ModelGatewayApiFormat,
  ModelGatewayActiveRouteStatus,
  ModelGatewayAppConnection,
  ModelGatewayAppConnectionId,
  ModelGatewayAppConnectionProfile,
  ModelGatewayAppScope,
  ModelGatewayAuthStrategy,
  ModelGatewayClientAuthView,
  ModelGatewayCodexAccountLoginPollResponse,
  ModelGatewayCodexAccountLoginStartResponse,
  ModelGatewayDaemonServiceAction,
  ModelGatewayDaemonServiceResponse,
  ModelGatewayProviderDetectProtocolResult,
  ModelGatewayProviderDetectResponse,
  ModelGatewayProviderCategory,
  ModelGatewayProviderEndpointProfileInput,
  ModelGatewayProviderInput,
  ModelGatewayProviderModelCatalog,
  ModelGatewayProviderNetwork,
  ModelGatewayProviderReasoning,
  ModelGatewayProviderModel,
  ModelGatewayProviderModelPricing,
  ModelGatewayProviderTestResponse,
  ModelGatewayProviderView,
  ModelGatewayProvidersResponse,
  ModelGatewayProviderSourceType,
  ModelGatewayRouteId,
  ModelGatewayRuntimeRequestLogEntry,
  ModelGatewayRuntimeResponse,
  ModelGatewayRuntimeUsage,
  ModelGatewayRuntimeUsageSummary,
  ModelGatewayRuntimeUsageSummaryBucket,
  ModelGatewayStatusResponse,
  ModelGatewayUpsertProviderRequest,
  ModelGatewayUsageLedgerResponse,
} from '../../../../../types/model-gateway';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  applyAllModelGatewayAppConnections,
  applyModelGatewayAppConnection,
  deleteModelGatewayProvider,
  detectModelGatewayProvider,
  fetchModelGatewayAppConnections,
  fetchModelGatewayClientAuth,
  fetchModelGatewayDaemonService,
  fetchModelGatewayProviders,
  fetchModelGatewayRuntime,
  fetchModelGatewayStatus,
  fetchModelGatewayUsageLedger,
  manageModelGatewayDaemonService,
  pollModelGatewayCodexAccountLogin,
  refreshModelGatewayProviderAccount,
  rollbackModelGatewayAppConnection,
  setModelGatewayActiveProvider,
  smokeModelGatewayActiveRoute,
  startModelGatewayCodexAccountLogin,
  testModelGatewayProvider,
  updateModelGatewayProviderAccount,
  updateModelGatewayAppConnectionProfile,
  updateModelGatewayClientAuth,
  upsertModelGatewayProvider,
} from './api';
import './model-gateway-workspace.css';

defineOptions({ name: 'ModelGatewayControlPage' });

type ProviderDraft = {
  templateId: string;
  id: string;
  name: string;
  enabled: boolean;
  category: ModelGatewayProviderCategory;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  priority: number;
  baseUrl: string;
  defaultModel: string;
  modelListText: string;
  modelRows: ProviderModelRow[];
  apiKey: string;
  anthropicEndpoint: string;
  compactEndpoint: string;
  proxyUrl: string;
  noProxy: string;
  appScopes: Record<ModelGatewayAppScope, boolean>;
  endpointRows: EndpointProfileRow[];
  accountRoutingStrategy: ModelGatewayAccountRoutingStrategy;
  accountSessionAffinity: boolean;
  accountMaxConcurrentPerAccount: string;
};

type ModelCapabilityId = 'text' | 'vision' | 'imageGeneration' | 'audioInput' | 'audioOutput' | 'tools' | 'reasoning' | 'responses' | 'streaming';

type ProviderModelRow = {
  key: string;
  id: string;
  label: string;
  aliases: string;
  contextWindow: string;
  maxOutputTokens: string;
  pricingCurrency: string;
  inputPricePer1M: string;
  outputPricePer1M: string;
  cacheReadPricePer1M: string;
  cacheCreationPricePer1M: string;
  imageGenerationPrice: string;
  imageEditPrice: string;
  audioInputPrice: string;
  audioOutputPrice: string;
  text: boolean;
  vision: boolean;
  imageGeneration: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  tools: boolean;
  reasoning: boolean;
  responses: boolean;
  streaming: boolean;
};

type UsageCostEstimate = {
  amount: number;
  currency: string | null;
  pricedEntryCount: number;
  unpricedEntryCount: number;
  mixedCurrency: boolean;
};

type ProviderModelBulkDraft = {
  contextWindow: string;
  maxOutputTokens: string;
  text: boolean;
  vision: boolean;
  imageGeneration: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  tools: boolean;
  reasoning: boolean;
  responses: boolean;
  streaming: boolean;
};

type EndpointProfileRow = {
  key: string;
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  priority: number;
  anthropicEndpoint: string;
  compactEndpoint: string;
  appScopes: Record<ModelGatewayAppScope, boolean>;
  inherited: {
    apiKeyRef?: string | null;
    models?: Partial<ModelGatewayProviderModelCatalog> | null;
    reasoning?: ModelGatewayProviderReasoning | Record<string, unknown>;
    network?: Partial<ModelGatewayProviderNetwork>;
    health?: ModelGatewayProviderEndpointProfileInput['health'];
    metadata?: ModelGatewayProviderEndpointProfileInput['metadata'];
    createdAt?: string;
    updatedAt?: string;
  };
};

type ProtocolTemplate = {
  id: string;
  label: string;
  draft: Partial<ProviderDraft>;
};

type DetectStepStatus = 'idle' | 'running' | 'success' | 'warning' | 'failure';

type DetectStep = {
  id: string;
  label: string;
  detail: string;
  status: DetectStepStatus;
};

type WorkspaceTabId = 'connections' | 'providers' | 'usage' | 'smoke';
type RuntimeLogFilterId = 'all' | 'account-routing' | 'failure' | 'cooldown-retry';
type UsageTimeRangeId = '24h' | '7d' | '30d' | 'all';
type UsageSourceFilterId = 'all' | 'account-backed' | 'api-key' | 'failure';

type AppConnectionProfileDraft = {
  model: string;
  appModels: Record<ModelGatewayAppConnectionId, string>;
  contextWindow: string;
  autoCompactTokenLimit: string;
  maxOutputTokens: string;
  reasoningEffort: string;
  codexResponsesWebsockets: boolean;
  codexResponsesWebsocketsV2: boolean;
  codexRequestCompression: boolean;
};

type AppConnectionModelOption = {
  id: string;
  label: string;
};

type AppConnectionBudgetDraft = {
  model: string;
  contextWindow: string;
  autoCompactTokenLimit: string;
  maxOutputTokens: string;
};

type MediaCatalogBucket = {
  id: string;
  zh: string;
  en: string;
  count: number;
  preview: string;
};

const route = useRoute();
const { text } = useLocalePreference();

const appScopeOptions: Array<{ id: ModelGatewayAppScope; zh: string; en: string }> = [
  { id: 'codex', zh: 'Codex', en: 'Codex' },
  { id: 'claude-code', zh: 'Claude Code', en: 'Claude Code' },
  { id: 'opencode', zh: 'OpenCode', en: 'OpenCode' },
  { id: 'openclaw', zh: 'OpenClaw', en: 'OpenClaw' },
];

const apiFormatOptions: Array<{ id: ModelGatewayApiFormat; label: string }> = [
  { id: 'openai_chat', label: 'OpenAI Chat Completions' },
  { id: 'openai_responses', label: 'OpenAI Responses API' },
  { id: 'anthropic_messages', label: 'Anthropic Messages' },
];

const authStrategyOptions: Array<{ id: ModelGatewayAuthStrategy; label: string }> = [
  { id: 'bearer', label: 'Bearer' },
  { id: 'anthropic_api_key', label: 'Anthropic x-api-key' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'oauth_proxy', label: 'OAuth proxy' },
  { id: 'none', label: 'None' },
];

const routeOptions: Array<{ id: ModelGatewayRouteId; label: string }> = [
  { id: 'openai_chat_completions', label: 'OpenAI Chat Completions' },
  { id: 'openai_responses', label: 'OpenAI Responses' },
  { id: 'openai_responses_compact', label: 'OpenAI Responses compact' },
  { id: 'openai_images_generations', label: 'OpenAI Images generation' },
  { id: 'openai_images_edits', label: 'OpenAI Images edit' },
  { id: 'openai_audio_transcriptions', label: 'OpenAI Audio transcription' },
  { id: 'openai_audio_translations', label: 'OpenAI Audio translation' },
  { id: 'openai_audio_speech', label: 'OpenAI Audio speech' },
  { id: 'anthropic_messages', label: 'Anthropic Messages' },
];

const workspaceTabs: Array<{ id: WorkspaceTabId; zh: string; en: string }> = [
  { id: 'connections', zh: '客户端接入', en: 'Client connections' },
  { id: 'providers', zh: 'Provider 配置', en: 'Provider configuration' },
  { id: 'usage', zh: '模型消耗', en: 'Usage' },
  { id: 'smoke', zh: 'Smoke / 日志', en: 'Smoke / Logs' },
];
const runtimeLogFilterOptions: Array<{ id: RuntimeLogFilterId; zh: string; en: string }> = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'account-routing', zh: '账号池', en: 'Account pool' },
  { id: 'failure', zh: '失败', en: 'Failures' },
  { id: 'cooldown-retry', zh: '冷却重试', en: 'Cooldown retry' },
];
const usageTimeRangeOptions: Array<{ id: UsageTimeRangeId; zh: string; en: string }> = [
  { id: '24h', zh: '最近 24 小时', en: 'Last 24h' },
  { id: '7d', zh: '最近 7 天', en: 'Last 7d' },
  { id: '30d', zh: '最近 30 天', en: 'Last 30d' },
  { id: 'all', zh: '全部账本窗口', en: 'Full ledger window' },
];
const usageSourceFilterOptions: Array<{ id: UsageSourceFilterId; zh: string; en: string }> = [
  { id: 'all', zh: '全部来源', en: 'All sources' },
  { id: 'account-backed', zh: '账号 provider', en: 'Account-backed' },
  { id: 'api-key', zh: 'API-key provider', en: 'API-key provider' },
  { id: 'failure', zh: '失败请求', en: 'Failures' },
];

const accountRoutingStrategyOptions: Array<{ id: ModelGatewayAccountRoutingStrategy; zh: string; en: string }> = [
  { id: 'round-robin', zh: '轮转', en: 'Round robin' },
  { id: 'fill-first', zh: '填满优先', en: 'Fill first' },
];

const modelCapabilityOptions: Array<{ id: ModelCapabilityId; zh: string; en: string }> = [
  { id: 'text', zh: '文字', en: 'Text' },
  { id: 'vision', zh: '图片', en: 'Vision' },
  { id: 'imageGeneration', zh: '生图', en: 'Image gen' },
  { id: 'audioInput', zh: '音频输入', en: 'Audio in' },
  { id: 'audioOutput', zh: '音频输出', en: 'Audio out' },
  { id: 'tools', zh: '工具', en: 'Tools' },
  { id: 'reasoning', zh: '推理', en: 'Reasoning' },
  { id: 'responses', zh: 'Responses', en: 'Responses' },
  { id: 'streaming', zh: '流式', en: 'Streaming' },
];

const protocolTemplates: ProtocolTemplate[] = [
  {
    id: 'openai-chat',
    label: 'OpenAI Chat Completions',
    draft: {
      category: 'openai-compatible',
      apiFormat: 'openai_chat',
      authStrategy: 'bearer',
      baseUrl: '',
      defaultModel: '',
      modelListText: '',
      anthropicEndpoint: '',
      compactEndpoint: '',
    },
  },
  {
    id: 'anthropic-messages',
    label: 'Anthropic Messages',
    draft: {
      category: 'openai-compatible',
      apiFormat: 'anthropic_messages',
      authStrategy: 'anthropic_api_key',
      baseUrl: '',
      defaultModel: '',
      modelListText: '',
      anthropicEndpoint: '',
      compactEndpoint: '',
    },
  },
  {
    id: 'openai-responses',
    label: 'OpenAI Responses',
    draft: {
      category: 'openai-compatible',
      apiFormat: 'openai_responses',
      authStrategy: 'bearer',
      baseUrl: '',
      defaultModel: '',
      modelListText: '',
      anthropicEndpoint: '',
      compactEndpoint: '',
    },
  },
];

const loading = ref(false);
const loaded = ref(false);
const busy = ref(false);
const daemonBusy = ref(false);
const smokeBusy = ref(false);
const visionSmokeBusy = ref(false);
const detectBusy = ref(false);
const activeWorkspaceTab = ref<WorkspaceTabId>('connections');
const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);
const status = ref<ModelGatewayStatusResponse | null>(null);
const runtime = ref<ModelGatewayRuntimeResponse | null>(null);
const usageLedger = ref<ModelGatewayUsageLedgerResponse | null>(null);
const usageBusy = ref(false);
const usageTimeRange = ref<UsageTimeRangeId>('all');
const usageSourceFilter = ref<UsageSourceFilterId>('all');
const usageProviderFilter = ref('');
const usageModelFilter = ref('');
const daemonService = ref<ModelGatewayDaemonServiceResponse | null>(null);
const daemonActionResult = ref<ModelGatewayDaemonServiceResponse | null>(null);
const clientAuth = ref<ModelGatewayClientAuthView | null>(null);
const clientAuthBusy = ref(false);
const clientAuthEnabled = ref(false);
const clientKeyDraft = ref('');
const clientAuthReveal = ref('');
const appConnections = ref<ModelGatewayAppConnection[]>([]);
const appConnectionBusy = ref<Partial<Record<ModelGatewayAppConnectionId, boolean>>>({});
const appConnectionProfile = reactive<AppConnectionProfileDraft>(createEmptyAppConnectionProfileDraft());
const appConnectionAvailableModels = ref<string[]>([]);
const appConnectionProfileBusy = ref(false);
const appConnectionApplyAllBusy = ref(false);
const lastAutoAppConnectionBudget = ref<AppConnectionBudgetDraft | null>(null);
const providers = ref<ModelGatewayProviderView[]>([]);
const accountBusy = ref<Record<string, boolean>>({});
const accountProxyDrafts = ref<Record<string, string>>({});
const activeProviders = ref<Partial<Record<ModelGatewayAppScope, string>>>({});
const activeRouteStatuses = ref<ModelGatewayActiveRouteStatus[]>([]);
const activeRouteAlerts = ref<string[]>([]);
const activeRouteSmokeBusy = ref<Partial<Record<ModelGatewayAppScope, boolean>>>({});

const routeWorkspaceTab = computed<WorkspaceTabId | null>(() => {
  const value = route.query.tab;
  if (value === 'connections' || value === 'providers' || value === 'usage' || value === 'smoke') return value;
  return null;
});

const routeAppConnectionId = computed<ModelGatewayAppConnectionId | null>(() => {
  const value = route.query.app;
  if (typeof value !== 'string') return null;
  return MODEL_GATEWAY_APP_CONNECTION_IDS.includes(value as ModelGatewayAppConnectionId)
    ? value as ModelGatewayAppConnectionId
    : null;
});
const activeRouteSmokeResults = ref<Partial<Record<ModelGatewayAppScope, ModelGatewayProviderTestResponse | null>>>({});
const endpointSmokeBusy = ref<Record<string, boolean>>({});
const endpointSmokeResults = ref<Record<string, ModelGatewayProviderTestResponse | null>>({});
const smokeProviderId = ref('');
const smokeRouteId = ref<ModelGatewayRouteId>('openai_responses');
const smokeModel = ref('');
const smokeInput = ref('Reply with GATEWAY_OK');
const smokeResult = ref<ModelGatewayProviderTestResponse | null>(null);
const visionSmokeResult = ref<ModelGatewayProviderTestResponse | null>(null);
const runtimeLogFilter = ref<RuntimeLogFilterId>('all');
const detectResult = ref<ModelGatewayProviderDetectResponse | null>(null);
const detectOverlayOpen = ref(false);
const detectError = ref<string | null>(null);
const appliedProtocolKey = ref('');
const modelCatalogRefreshBusy = ref(false);
const codexLoginBusy = ref(false);
const codexLoginStart = ref<ModelGatewayCodexAccountLoginStartResponse | null>(null);
const codexLoginPoll = ref<ModelGatewayCodexAccountLoginPollResponse | null>(null);
let codexLoginTimer: ReturnType<typeof window.setTimeout> | null = null;

const draft = reactive<ProviderDraft>(createEmptyDraft());
const modelBulk = reactive<ProviderModelBulkDraft>(createModelBulkDraft());

const selectedProviderView = computed(() =>
  providers.value.find((provider) => provider.id === draft.id) || null,
);
const selectedProviderAccounts = computed<ModelGatewayAccountEntry[]>(() =>
  selectedProviderView.value?.accountProvider?.accounts || [],
);

const endpointProfilesCanSmoke = computed(() =>
  Boolean(draft.id.trim() && providerExists(draft.id.trim())),
);

function runtimeLogEntryMatchesFilter(entry: ModelGatewayRuntimeRequestLogEntry, filter: RuntimeLogFilterId): boolean {
  if (filter === 'all') return true;
  if (filter === 'account-routing') return Boolean(entry.accountRouting);
  if (filter === 'failure') return entry.outcome !== 'success';
  if (filter === 'cooldown-retry') return entry.accountRouting?.selectedWasCooldownRetry === true;
  return true;
}

const runtimeEntries = computed<ModelGatewayRuntimeRequestLogEntry[]>(() =>
  [...(runtime.value?.runtime.requestLog || [])]
    .reverse()
    .filter((entry) => runtimeLogEntryMatchesFilter(entry, runtimeLogFilter.value))
    .slice(0, 12),
);
const runtimeUsageSummary = computed(() =>
  runtime.value?.usageSummary || status.value?.runtime.usageSummary || null,
);
const runtimeUsageLabel = computed(() => {
  const summary = runtimeUsageSummary.value;
  if (!summary) return `${runtimeEntries.value.length} / 0`;
  return `${formatCompactNumber(summary.requestCount)} / ${formatCompactNumber(summary.usage.totalTokens)}`;
});
const runtimeMediaUsageLabel = computed(() => {
  const usage = runtimeUsageSummary.value?.usage;
  if (!usage) return '';
  const parts = [
    usage.imageGenerationRequests || usage.imagesGenerated
      ? text(`生图 ${formatCompactNumber(usage.imagesGenerated)} / ${formatCompactNumber(usage.imageGenerationRequests)}`, `image gen ${formatCompactNumber(usage.imagesGenerated)} / ${formatCompactNumber(usage.imageGenerationRequests)}`)
      : '',
    usage.imageEditRequests
      ? text(`修图 ${formatCompactNumber(usage.imageEditRequests)}`, `edits ${formatCompactNumber(usage.imageEditRequests)}`)
      : '',
    usage.audioInputRequests
      ? text(`音频输入 ${formatCompactNumber(usage.audioInputRequests)}`, `audio in ${formatCompactNumber(usage.audioInputRequests)}`)
      : '',
    usage.audioOutputRequests
      ? text(`音频输出 ${formatCompactNumber(usage.audioOutputRequests)}`, `audio out ${formatCompactNumber(usage.audioOutputRequests)}`)
      : '',
  ].filter(Boolean);
  return parts.join(' · ');
});

const usageRawEntries = computed<ModelGatewayRuntimeRequestLogEntry[]>(() =>
  [...(usageLedger.value?.entries || runtime.value?.runtime.requestLog || [])],
);
const usageProviderFilterOptions = computed(() => {
  const seen = new Map<string, string>();
  for (const entry of usageRawEntries.value) {
    const key = entry.providerId || 'unknown-provider';
    seen.set(key, entry.providerName || entry.providerId || text('未知 provider', 'Unknown provider'));
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
});
const usageModelFilterOptions = computed(() => {
  const models = uniqueStrings(usageRawEntries.value.map((entry) => entry.model || '').filter(Boolean));
  return models.sort((left, right) => left.localeCompare(right));
});
const usageFilteredEntries = computed<ModelGatewayRuntimeRequestLogEntry[]>(() =>
  usageRawEntries.value.filter((entry) => usageEntryMatchesFilters(entry)),
);
const usageSummary = computed<ModelGatewayRuntimeUsageSummary>(() =>
  summarizeUsageEntries(usageFilteredEntries.value),
);
const usageProviderBuckets = computed<ModelGatewayRuntimeUsageSummaryBucket[]>(() =>
  usageSummary.value.byProvider,
);
const usageModelBuckets = computed<ModelGatewayRuntimeUsageSummaryBucket[]>(() =>
  usageSummary.value.byModel,
);
const usageAccountBuckets = computed<ModelGatewayRuntimeUsageSummaryBucket[]>(() =>
  usageSummary.value.byAccount,
);
const usageCostEstimate = computed<UsageCostEstimate>(() =>
  estimateUsageCost(usageFilteredEntries.value),
);
const usageRecentEntries = computed<ModelGatewayRuntimeRequestLogEntry[]>(() =>
  [...usageFilteredEntries.value]
    .sort((left, right) => usageEntryTime(right) - usageEntryTime(left))
    .slice(0, 24),
);
const usageLedgerWindowLabel = computed(() => {
  const ledger = usageLedger.value;
  if (!ledger) return text('正在读取账本窗口', 'Reading ledger window');
  return text(
    `${formatCompactNumber(ledger.entryCount)} 条记录 · 最近 ${formatCompactNumber(ledger.entries.length)} 条窗口${ledger.truncated ? ' · 已截断' : ''}`,
    `${formatCompactNumber(ledger.entryCount)} entries · latest ${formatCompactNumber(ledger.entries.length)} window${ledger.truncated ? ' · truncated' : ''}`,
  );
});
const usageFilteredWindowLabel = computed(() =>
  text(
    `当前筛选 ${formatCompactNumber(usageFilteredEntries.value.length)} / ${formatCompactNumber(usageRawEntries.value.length)} 条`,
    `${formatCompactNumber(usageFilteredEntries.value.length)} / ${formatCompactNumber(usageRawEntries.value.length)} entries in current filter`,
  ),
);
const canExportUsage = computed(() => usageFilteredEntries.value.length > 0);
const usageSummaryCards = computed(() => {
  const summary = usageSummary.value;
  const usage = summary.usage;
  return [
    {
      id: 'requests',
      label: text('请求', 'Requests'),
      value: formatCompactNumber(summary.requestCount),
      meta: text(`计费用 ${formatCompactNumber(summary.meteredRequestCount)}`, `${formatCompactNumber(summary.meteredRequestCount)} metered`),
    },
    {
      id: 'tokens',
      label: 'Tokens',
      value: formatCompactNumber(usage?.totalTokens || 0),
      meta: usageTokenLabel(usage),
    },
    {
      id: 'media',
      label: text('媒体单位', 'Media units'),
      value: usageMediaUnitCount(usage),
      meta: usageMediaLabel(usage) || text('暂无媒体用量', 'No media usage'),
    },
    {
      id: 'cost',
      label: text('估算成本', 'Estimated cost'),
      value: formatUsageCostEstimate(usageCostEstimate.value),
      meta: usageCostMeta(usageCostEstimate.value),
    },
    {
      id: 'latest',
      label: text('最近请求', 'Latest request'),
      value: summary.latestRequestAt ? formatTimestamp(summary.latestRequestAt) : '-',
      meta: usageFilteredWindowLabel.value,
    },
  ];
});

function usageEntryTime(entry: ModelGatewayRuntimeRequestLogEntry): number {
  const time = Date.parse(entry.finishedAt || entry.startedAt || '');
  return Number.isNaN(time) ? 0 : time;
}

function usageTimeRangeCutoff(range: UsageTimeRangeId): number | null {
  const day = 24 * 60 * 60 * 1000;
  if (range === '24h') return Date.now() - day;
  if (range === '7d') return Date.now() - (7 * day);
  if (range === '30d') return Date.now() - (30 * day);
  return null;
}

function usageEntryIsAccountBacked(entry: ModelGatewayRuntimeRequestLogEntry): boolean {
  return Boolean(entry.accountId || entry.accountHash) || providerSourceForId(entry.providerId) === 'account-backed';
}

function usageEntryMatchesFilters(entry: ModelGatewayRuntimeRequestLogEntry): boolean {
  const cutoff = usageTimeRangeCutoff(usageTimeRange.value);
  if (cutoff !== null && usageEntryTime(entry) < cutoff) return false;
  if (usageProviderFilter.value && (entry.providerId || 'unknown-provider') !== usageProviderFilter.value) return false;
  if (usageModelFilter.value && entry.model !== usageModelFilter.value) return false;
  if (usageSourceFilter.value === 'failure') return entry.outcome !== 'success';
  if (usageSourceFilter.value === 'account-backed') return usageEntryIsAccountBacked(entry);
  if (usageSourceFilter.value === 'api-key') return providerSourceForId(entry.providerId) === 'api-key';
  return true;
}

function entriesForUsageBucket(
  bucket: ModelGatewayRuntimeUsageSummaryBucket,
  kind: 'provider' | 'model' | 'account',
): ModelGatewayRuntimeRequestLogEntry[] {
  return usageFilteredEntries.value.filter((entry) => {
    const providerKey = entry.providerId || 'unknown-provider';
    if (kind === 'provider') return providerKey === bucket.key;
    if (kind === 'model') return (entry.model || 'unknown-model') === bucket.key;
    return `${providerKey}:${entry.accountHash || entry.accountId || 'unknown-account'}` === bucket.key;
  });
}

function modelMatchesUsage(model: ModelGatewayProviderModel, requestedModel: string | null | undefined): boolean {
  const key = normalizeModelKey(requestedModel || '');
  if (!key) return false;
  return normalizeModelKey(model.id) === key
    || (model.aliases || []).some((alias) => normalizeModelKey(alias) === key);
}

function pricingForUsageEntry(entry: ModelGatewayRuntimeRequestLogEntry): ModelGatewayProviderModelPricing | null {
  if (!entry.providerId || !entry.model) return null;
  const provider = providers.value.find((item) => item.id === entry.providerId);
  if (!provider) return null;
  return providerCatalogModels(provider).find((model) => modelMatchesUsage(model, entry.model))?.pricing || null;
}

function emptyCostEstimate(): UsageCostEstimate {
  return {
    amount: 0,
    currency: null,
    pricedEntryCount: 0,
    unpricedEntryCount: 0,
    mixedCurrency: false,
  };
}

function estimateUsageCost(entries: ModelGatewayRuntimeRequestLogEntry[]): UsageCostEstimate {
  const estimate = emptyCostEstimate();
  for (const entry of entries) {
    const usage = entry.usage;
    const pricing = pricingForUsageEntry(entry);
    if (!usage || !pricing) {
      estimate.unpricedEntryCount += 1;
      continue;
    }
    const currency = (pricing.currency || 'USD').trim().toUpperCase() || 'USD';
    if (!estimate.currency) {
      estimate.currency = currency;
    } else if (estimate.currency !== currency) {
      estimate.mixedCurrency = true;
    }
    estimate.amount += ((usage.inputTokens || 0) / 1_000_000) * (pricing.inputPer1M || 0);
    estimate.amount += ((usage.outputTokens || 0) / 1_000_000) * (pricing.outputPer1M || 0);
    estimate.amount += ((usage.cacheReadTokens || 0) / 1_000_000) * (pricing.cacheReadPer1M ?? pricing.inputPer1M ?? 0);
    estimate.amount += ((usage.cacheCreationTokens || 0) / 1_000_000) * (pricing.cacheCreationPer1M ?? pricing.inputPer1M ?? 0);
    estimate.amount += (usage.imagesGenerated || 0) * (pricing.imageGenerationPerImage || 0);
    estimate.amount += (usage.imageEditRequests || 0) * (pricing.imageEditPerRequest || 0);
    estimate.amount += (usage.audioInputRequests || 0) * (pricing.audioInputPerRequest || 0);
    estimate.amount += (usage.audioOutputRequests || 0) * (pricing.audioOutputPerRequest || 0);
    estimate.pricedEntryCount += 1;
  }
  return estimate;
}

function usageBucketCostEstimate(
  bucket: ModelGatewayRuntimeUsageSummaryBucket,
  kind: 'provider' | 'model' | 'account',
): UsageCostEstimate {
  return estimateUsageCost(entriesForUsageBucket(bucket, kind));
}

function formatUsageCostEstimate(estimate: UsageCostEstimate): string {
  if (!estimate.pricedEntryCount) return text('未配置价格', 'Pricing not set');
  const amount = estimate.amount;
  const formatted = amount >= 1 ? amount.toFixed(2) : amount.toFixed(4);
  if (estimate.mixedCurrency) return text(`混合币种 ${formatted}`, `mixed currency ${formatted}`);
  return `${estimate.currency || 'USD'} ${formatted}`;
}

function usageCostMeta(estimate: UsageCostEstimate): string {
  return text(
    `已计价 ${formatCompactNumber(estimate.pricedEntryCount)} · 未配置 ${formatCompactNumber(estimate.unpricedEntryCount)}`,
    `${formatCompactNumber(estimate.pricedEntryCount)} priced · ${formatCompactNumber(estimate.unpricedEntryCount)} unpriced`,
  );
}

function createEmptyRuntimeUsage(): ModelGatewayRuntimeUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    imageGenerationRequests: 0,
    imagesGenerated: 0,
    imageEditRequests: 0,
    audioInputRequests: 0,
    audioOutputRequests: 0,
  };
}

function addUsage(target: ModelGatewayRuntimeUsage, usage: ModelGatewayRuntimeUsage | null | undefined): void {
  if (!usage) return;
  target.inputTokens += usage.inputTokens || 0;
  target.outputTokens += usage.outputTokens || 0;
  target.totalTokens += usage.totalTokens || 0;
  target.cacheReadTokens += usage.cacheReadTokens || 0;
  target.cacheCreationTokens += usage.cacheCreationTokens || 0;
  target.imageGenerationRequests += usage.imageGenerationRequests || 0;
  target.imagesGenerated += usage.imagesGenerated || 0;
  target.imageEditRequests += usage.imageEditRequests || 0;
  target.audioInputRequests += usage.audioInputRequests || 0;
  target.audioOutputRequests += usage.audioOutputRequests || 0;
}

function createUsageBucket(
  key: string,
  label: string,
  entry: ModelGatewayRuntimeRequestLogEntry,
): ModelGatewayRuntimeUsageSummaryBucket {
  return {
    key,
    label,
    providerId: entry.providerId,
    providerName: entry.providerName,
    accountId: entry.accountId || null,
    accountHash: entry.accountHash || null,
    model: entry.model,
    requestCount: 0,
    meteredRequestCount: 0,
    latestRequestAt: null,
    usage: createEmptyRuntimeUsage(),
  };
}

function addUsageBucketEntry(
  map: Map<string, ModelGatewayRuntimeUsageSummaryBucket>,
  key: string,
  label: string,
  entry: ModelGatewayRuntimeRequestLogEntry,
): void {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = createUsageBucket(key, label, entry);
    map.set(key, bucket);
  } else {
    if (bucket.providerId !== entry.providerId) {
      bucket.providerId = null;
      bucket.providerName = text('多 provider', 'multi-provider');
    }
    if ((bucket.accountHash || bucket.accountId) !== (entry.accountHash || entry.accountId || null)) {
      bucket.accountId = null;
      bucket.accountHash = null;
    }
  }
  bucket.requestCount += 1;
  if (!bucket.latestRequestAt || usageEntryTime(entry) >= Date.parse(bucket.latestRequestAt)) {
    bucket.latestRequestAt = entry.finishedAt;
  }
  if (entry.usage) {
    bucket.meteredRequestCount += 1;
    addUsage(bucket.usage, entry.usage);
  }
}

function summarizeUsageEntries(entries: ModelGatewayRuntimeRequestLogEntry[]): ModelGatewayRuntimeUsageSummary {
  const summary: ModelGatewayRuntimeUsageSummary = {
    requestCount: entries.length,
    meteredRequestCount: 0,
    latestRequestAt: null,
    usage: createEmptyRuntimeUsage(),
    byProvider: [],
    byModel: [],
    byAccount: [],
  };
  const providersMap = new Map<string, ModelGatewayRuntimeUsageSummaryBucket>();
  const modelsMap = new Map<string, ModelGatewayRuntimeUsageSummaryBucket>();
  const accountsMap = new Map<string, ModelGatewayRuntimeUsageSummaryBucket>();

  for (const entry of entries) {
    if (!summary.latestRequestAt || usageEntryTime(entry) >= Date.parse(summary.latestRequestAt)) {
      summary.latestRequestAt = entry.finishedAt;
    }
    if (entry.usage) {
      summary.meteredRequestCount += 1;
      addUsage(summary.usage, entry.usage);
    }
    const providerKey = entry.providerId || 'unknown-provider';
    addUsageBucketEntry(providersMap, providerKey, entry.providerName || entry.providerId || 'unknown provider', entry);
    const modelKey = entry.model || 'unknown-model';
    addUsageBucketEntry(modelsMap, modelKey, entry.model || 'unknown model', entry);
    if (entry.accountId || entry.accountHash) {
      const accountKey = `${providerKey}:${entry.accountHash || entry.accountId || 'unknown-account'}`;
      addUsageBucketEntry(accountsMap, accountKey, entry.accountId || entry.accountHash || 'unknown account', entry);
    }
  }

  const ordered = (map: Map<string, ModelGatewayRuntimeUsageSummaryBucket>) => (
    [...map.values()]
      .sort((left, right) => (
        right.usage.totalTokens - left.usage.totalTokens
        || right.meteredRequestCount - left.meteredRequestCount
        || right.requestCount - left.requestCount
        || left.label.localeCompare(right.label)
      ))
      .slice(0, 24)
  );

  summary.byProvider = ordered(providersMap);
  summary.byModel = ordered(modelsMap);
  summary.byAccount = ordered(accountsMap);
  return summary;
}

function providerSourceForId(providerId: string | null | undefined): ModelGatewayProviderSourceType | null {
  if (!providerId) return null;
  return providers.value.find((provider) => provider.id === providerId)?.sourceType || null;
}

function providerSourceLabel(providerId: string | null | undefined): string {
  const source = providerSourceForId(providerId);
  if (source === 'account-backed') return text('账号 provider', 'Account-backed provider');
  if (source === 'external-relay') return text('外部中继 provider', 'External relay provider');
  if (source === 'api-key') return 'API-key provider';
  return text('未知来源', 'Unknown source');
}

function usageBucketTitle(bucket: ModelGatewayRuntimeUsageSummaryBucket): string {
  return bucket.label || bucket.key || '-';
}

function usageBucketMeta(bucket: ModelGatewayRuntimeUsageSummaryBucket, kind: 'provider' | 'model' | 'account'): string {
  if (kind === 'provider') {
    return [bucket.providerId, providerSourceLabel(bucket.providerId)].filter(Boolean).join(' · ');
  }
  if (kind === 'model') {
    return [bucket.model || '-', bucket.providerName || bucket.providerId || text('多 provider', 'multi-provider')].join(' · ');
  }
  return [
    bucket.accountId || bucket.accountHash || text('未知账号', 'unknown account'),
    bucket.providerName || bucket.providerId || '-',
  ].join(' · ');
}

function usageTokenLabel(usage: ModelGatewayRuntimeUsage | null | undefined): string {
  if (!usage) return text('输入 0 · 输出 0', 'input 0 · output 0');
  const cache = usage.cacheReadTokens || usage.cacheCreationTokens
    ? text(`缓存 ${formatCompactNumber(usage.cacheReadTokens + usage.cacheCreationTokens)}`, `cache ${formatCompactNumber(usage.cacheReadTokens + usage.cacheCreationTokens)}`)
    : '';
  return [
    text(`输入 ${formatCompactNumber(usage.inputTokens)}`, `input ${formatCompactNumber(usage.inputTokens)}`),
    text(`输出 ${formatCompactNumber(usage.outputTokens)}`, `output ${formatCompactNumber(usage.outputTokens)}`),
    cache,
  ].filter(Boolean).join(' · ');
}

function usageMediaUnitCount(usage: ModelGatewayRuntimeUsage | null | undefined): string {
  if (!usage) return '0';
  return formatCompactNumber(
    usage.imagesGenerated
      + usage.imageEditRequests
      + usage.audioInputRequests
      + usage.audioOutputRequests,
  );
}

function usageMediaLabel(usage: ModelGatewayRuntimeUsage | null | undefined): string {
  if (!usage) return '';
  const parts = [
    usage.imageGenerationRequests || usage.imagesGenerated
      ? text(`生图 ${formatCompactNumber(usage.imagesGenerated)} / ${formatCompactNumber(usage.imageGenerationRequests)}`, `image gen ${formatCompactNumber(usage.imagesGenerated)} / ${formatCompactNumber(usage.imageGenerationRequests)}`)
      : '',
    usage.imageEditRequests
      ? text(`修图 ${formatCompactNumber(usage.imageEditRequests)}`, `edits ${formatCompactNumber(usage.imageEditRequests)}`)
      : '',
    usage.audioInputRequests
      ? text(`音频输入 ${formatCompactNumber(usage.audioInputRequests)}`, `audio in ${formatCompactNumber(usage.audioInputRequests)}`)
      : '',
    usage.audioOutputRequests
      ? text(`音频输出 ${formatCompactNumber(usage.audioOutputRequests)}`, `audio out ${formatCompactNumber(usage.audioOutputRequests)}`)
      : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function usageRouteLabel(routeId: ModelGatewayRouteId | null): string {
  if (!routeId) return '-';
  return routeOptions.find((route) => route.id === routeId)?.label || routeId;
}

function usageEntryProviderLabel(entry: ModelGatewayRuntimeRequestLogEntry): string {
  return entry.providerName || entry.providerId || '-';
}

function usageEntryAccountLabel(entry: ModelGatewayRuntimeRequestLogEntry): string {
  if (entry.accountId) return text(`账号 ${entry.accountId}`, `account ${entry.accountId}`);
  if (entry.accountHash) return text(`账号 ${entry.accountHash}`, `account ${entry.accountHash}`);
  return providerSourceForId(entry.providerId) === 'account-backed'
    ? text('账号未记录', 'account not recorded')
    : 'API-key provider';
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function usageCsvSource(entry: ModelGatewayRuntimeRequestLogEntry): string {
  if (usageEntryIsAccountBacked(entry)) return 'account-backed';
  return providerSourceForId(entry.providerId) || 'unknown';
}

function usageCsvRows(): string[][] {
  return usageFilteredEntries.value
    .slice()
    .sort((left, right) => usageEntryTime(left) - usageEntryTime(right))
    .map((entry) => {
      const estimate = estimateUsageCost([entry]);
      return [
        entry.finishedAt,
        entry.outcome,
        usageCsvSource(entry),
        entry.providerId || '',
        entry.providerName || '',
        entry.accountId || '',
        entry.accountHash || '',
        entry.model || '',
        entry.routeId || '',
        entry.method,
        entry.requestedPath,
        entry.statusCode ?? '',
        entry.durationMs,
        entry.usage?.inputTokens || 0,
        entry.usage?.outputTokens || 0,
        entry.usage?.totalTokens || 0,
        entry.usage?.cacheReadTokens || 0,
        entry.usage?.cacheCreationTokens || 0,
        entry.usage?.imageGenerationRequests || 0,
        entry.usage?.imagesGenerated || 0,
        entry.usage?.imageEditRequests || 0,
        entry.usage?.audioInputRequests || 0,
        entry.usage?.audioOutputRequests || 0,
        estimate.currency || '',
        estimate.pricedEntryCount ? estimate.amount.toFixed(8) : '',
        estimate.pricedEntryCount ? 'priced' : 'unpriced',
        entry.errorCode || '',
        entry.errorMessage || '',
      ].map((value) => String(value));
    });
}

function downloadGatewayUsageCsv(): void {
  if (!canExportUsage.value) return;
  const header = [
    'finished_at',
    'outcome',
    'source',
    'provider_id',
    'provider_name',
    'account_id',
    'account_hash',
    'model',
    'route_id',
    'method',
    'requested_path',
    'status_code',
    'duration_ms',
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'cache_read_tokens',
    'cache_creation_tokens',
    'image_generation_requests',
    'images_generated',
    'image_edit_requests',
    'audio_input_requests',
    'audio_output_requests',
    'estimated_cost_currency',
    'estimated_cost',
    'pricing_status',
    'error_code',
    'error_message',
  ];
  const csv = [header, ...usageCsvRows()]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
  const blob = new Blob([`${csv}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `studio-gateway-usage-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function accountRoutingSummary(routing: ModelGatewayAccountRoutingDiagnostics): string {
  const selected = routing.selectedAccountId
    ? text(`账号 ${routing.selectedAccountId}`, `account ${routing.selectedAccountId}`)
    : text('未选中账号', 'no account selected');
  const reason = routing.failureReason
    ? text(`失败 ${routing.failureReason}`, `failure ${routing.failureReason}`)
    : routing.selectedReason || text('已选择', 'selected');
  const retry = routing.selectedWasCooldownRetry
    ? text('冷却后重试', 'cooldown retry')
    : null;
  const sticky = !routing.sessionAffinity
    ? text('sticky 关闭', 'sticky off')
    : routing.affinityHit
      ? text('sticky 命中', 'sticky hit')
      : routing.affinityKeyHash
        ? text('sticky 绑定', 'sticky bound')
        : text('sticky 无键', 'sticky no key');
  const skipped = routing.skipped.length
    ? routing.skipped.reduce<Record<string, number>>((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {})
    : null;
  const skippedSummary = skipped
    ? Object.entries(skipped).map(([key, count]) => `${key} ${count}`).join(', ')
    : text('无跳过', 'no skips');
  return [selected, reason, retry, sticky, skippedSummary].filter(Boolean).join(' · ');
}

function accountRoutingDetailRows(routing: ModelGatewayAccountRoutingDiagnostics): Array<{ key: string; label: string; value: string }> {
  const rows: Array<{ key: string; label: string; value: string }> = [
    {
      key: 'provider',
      label: text('Provider', 'Provider'),
      value: `${routing.providerId} · ${routing.kind} · ${routing.strategy}`,
    },
    {
      key: 'selected',
      label: text('选中账号', 'Selected account'),
      value: routing.selectedAccountId || text('未选中', 'none'),
    },
    {
      key: 'reason',
      label: text('原因', 'Reason'),
      value: routing.failureReason || routing.selectedReason || text('已选择', 'selected'),
    },
    {
      key: 'pool',
      label: text('池状态', 'Pool'),
      value: [
        text(`可路由 ${routing.readyCount}/${routing.accountCount}`, `ready ${routing.readyCount}/${routing.accountCount}`),
        text(`有容量 ${routing.capacityAvailableCount}`, `capacity ${routing.capacityAvailableCount}`),
        routing.busyCount ? text(`忙碌 ${routing.busyCount}`, `busy ${routing.busyCount}`) : '',
        routing.cooldownCount ? text(`冷却 ${routing.cooldownCount}`, `cooldown ${routing.cooldownCount}`) : '',
        routing.needsLoginCount ? text(`需登录 ${routing.needsLoginCount}`, `needs login ${routing.needsLoginCount}`) : '',
      ].filter(Boolean).join(' · '),
    },
    {
      key: 'sticky',
      label: text('Sticky', 'Sticky'),
      value: routing.sessionAffinity
        ? routing.affinityHit
          ? text('命中', 'hit')
          : routing.affinityKeyHash
            ? text(`绑定 ${routing.affinityKeyHash}`, `bound ${routing.affinityKeyHash}`)
            : text('无会话键', 'no session key')
        : text('关闭', 'off'),
    },
  ];
  if (routing.selectedWasCooldownRetry) {
    rows.push({
      key: 'cooldown-retry',
      label: text('冷却重试', 'Cooldown retry'),
      value: routing.selectedCooldownUntil
        ? formatTimestamp(routing.selectedCooldownUntil)
        : text('是', 'yes'),
    });
  }
  if (routing.cursorBefore !== null || routing.cursorAfter !== null) {
    rows.push({
      key: 'cursor',
      label: text('游标', 'Cursor'),
      value: `${routing.cursorBefore ?? '-'} -> ${routing.cursorAfter ?? '-'}`,
    });
  }
  for (const [index, item] of routing.skipped.entries()) {
    rows.push({
      key: `skip-${index}-${item.accountId}`,
      label: index === 0 ? text('跳过账号', 'Skipped accounts') : '',
      value: [
        item.accountId,
        item.reason,
        item.state,
        item.cooldownUntil ? formatTimestamp(item.cooldownUntil) : null,
        item.capacityLimit ? `${item.inFlight}/${item.capacityLimit}` : item.inFlight ? `${item.inFlight}` : null,
      ].filter(Boolean).join(' · '),
    });
  }
  if (!routing.skipped.length) {
    rows.push({
      key: 'skip-none',
      label: text('跳过账号', 'Skipped accounts'),
      value: text('无', 'none'),
    });
  }
  return rows;
}

const appConnectionModelOptions = computed<AppConnectionModelOption[]>(() =>
  appConnectionAvailableModels.value.map((model) => ({
    id: model,
    label: appConnectionModelOptionLabel(model),
  })),
);

const selectedAppConnectionBudget = computed(() =>
  appConnectionBudgetDraftForModel(appConnectionProfile.model),
);

const canApplyAppConnectionModelBudget = computed(() =>
  Boolean(selectedAppConnectionBudget.value.contextWindow || selectedAppConnectionBudget.value.maxOutputTokens),
);

const appConnectionBudgetSummary = computed(() => {
  const budget = selectedAppConnectionBudget.value;
  if (!budget.contextWindow && !budget.maxOutputTokens) {
    return text('未识别模型预算', 'No model budget detected');
  }
  return text(
    `模型预算 ${appConnectionBudgetLabel(budget.model)} · Compact ${formatCompactNumber(Number(budget.autoCompactTokenLimit || 0))}`,
    `Model budget ${appConnectionBudgetLabel(budget.model)} · Compact ${formatCompactNumber(Number(budget.autoCompactTokenLimit || 0))}`,
  );
});

const selectedSmokeProvider = computed(() =>
  providers.value.find((provider) => provider.id === smokeProviderId.value) || null,
);

const draftModelIds = computed(() => modelRowsToModels(draft.modelRows).map((model) => model.id));
const draftDefaultModelOptions = computed(() => uniqueStrings([
  draft.defaultModel,
  ...draftModelIds.value,
]));

const selectedSmokeProviderModelIds = computed(() => {
  const provider = selectedSmokeProvider.value;
  if (!provider) return [];
  return uniqueStrings(providerCatalogModels(provider).map((model) => model.id));
});

const enabledProviderCatalogModels = computed<ModelGatewayProviderModel[]>(() =>
  providers.value
    .filter((provider) => provider.enabled)
    .flatMap((provider) => providerCatalogModels(provider)),
);

const mediaCatalogBuckets = computed<MediaCatalogBucket[]>(() => {
  const models = enabledProviderCatalogModels.value;
  return [
    mediaCatalogBucket('vision', '图片理解', 'Vision', models, (model) => model.features?.vision === true),
    mediaCatalogBucket('image-generation', '生图', 'Image gen', models, (model) => model.features?.imageGeneration === true),
    mediaCatalogBucket('audio-input', '音频输入', 'Audio in', models, (model) => model.features?.audioInput === true),
    mediaCatalogBucket('audio-output', '音频输出', 'Audio out', models, (model) => model.features?.audioOutput === true),
    mediaCatalogBucket('realtime', 'Realtime', 'Realtime', models, (model) => /^gpt-realtime/i.test(model.id)),
  ];
});

const detectSupportedProtocols = computed(() =>
  detectResult.value?.protocols.filter((protocol) => protocol.ok) || [],
);

const detectStatusTitle = computed(() => {
  if (detectBusy.value) return text('正在识别配置', 'Detecting configuration');
  if (detectError.value) return text('识别失败', 'Detection failed');
  if (!draft.baseUrl.trim()) return text('先填写 Base URL', 'Enter Base URL first');
  if (!detectResult.value) return text('尚未识别', 'Not detected yet');
  const supported = detectSupportedProtocols.value.length;
  if (supported === 0) return text('未识别出可用协议', 'No supported protocol detected');
  if (supported === 1) return text(`已识别 ${apiFormatLabel(detectSupportedProtocols.value[0].apiFormat)}`, `Detected ${apiFormatLabel(detectSupportedProtocols.value[0].apiFormat)}`);
  return text(`发现 ${supported} 个可用协议`, `${supported} supported protocols found`);
});

const detectStatusDetail = computed(() => {
  if (detectBusy.value) return text('读取模型列表并探测三种原生协议。', 'Reading models and probing the three native protocols.');
  if (detectError.value) return detectError.value;
  if (!draft.baseUrl.trim()) return text('Gateway 不会自动追加 /v1。', 'Gateway will not append /v1 automatically.');
  if (!detectResult.value) {
    return draft.apiKey.trim()
      ? text('Key 已填写，可以开始识别。', 'Key is present; ready to detect.')
      : text('未填写 Key 时只能探测公开或无鉴权接口。', 'Without a key, only public or unauthenticated endpoints can be probed.');
  }
  const modelText = detectResult.value.models.length
    ? text(`${detectResult.value.models.length} 个模型`, `${detectResult.value.models.length} models`)
    : text('模型需手动填写', 'Model needs manual entry');
  return `${modelText} · ${formatTimestamp(detectResult.value.checkedAt)}`;
});

const codexLoginStatusText = computed(() => {
  if (!codexLoginStart.value) return text('尚未开始登录。', 'Login not started.');
  if (!codexLoginPoll.value) {
    return text('请在打开的官方页面输入验证码，Studio 会自动检查授权结果。', 'Enter the code on the opened official page; Studio will check authorization automatically.');
  }
  if (codexLoginPoll.value.status === 'completed') return text('登录完成，已创建账户型 provider。', 'Login completed; account-backed provider created.');
  if (codexLoginPoll.value.status === 'pending') return text('等待官方页面确认授权。', 'Waiting for approval on the official page.');
  if (codexLoginPoll.value.status === 'expired') return text('登录已过期，请重新开始。', 'Login expired; start again.');
  return codexLoginPoll.value.message || text('登录失败，请重新开始。', 'Login failed; start again.');
});

const codexLoginProviderSummary = computed(() => {
  const provider = codexLoginPoll.value?.provider;
  if (!provider) return '';
  const account = provider.accountProvider?.accounts?.[0];
  const accountText = [account?.emailMasked, account?.plan].filter(Boolean).join(' · ');
  return accountText
    ? `${provider.name} · ${accountText}`
    : provider.name;
});

const detectSteps = computed<DetectStep[]>(() => {
  if (detectError.value && !detectResult.value) {
    return [
      {
        id: 'detect-error',
        label: text('请求失败', 'Request failed'),
        detail: detectError.value,
        status: 'failure',
      },
    ];
  }

  if (detectBusy.value && !detectResult.value) {
    return [
      {
        id: 'models',
        label: text('模型列表', 'Model list'),
        detail: text('读取 /models 与候选认证。', 'Reading /models with candidate auth.'),
        status: 'running',
      },
      ...apiFormatOptions.map((format) => ({
        id: format.id,
        label: format.label,
        detail: text('等待探测返回。', 'Waiting for probe result.'),
        status: 'idle' as DetectStepStatus,
      })),
    ];
  }

  const result = detectResult.value;
  if (!result) {
    return [
      {
        id: 'models',
        label: text('模型列表', 'Model list'),
        detail: text('尚未开始。', 'Not started.'),
        status: 'idle',
      },
      ...apiFormatOptions.map((format) => ({
        id: format.id,
        label: format.label,
        detail: text('尚未开始。', 'Not started.'),
        status: 'idle' as DetectStepStatus,
      })),
    ];
  }

  const bestModelProbe = [...result.modelProbes]
    .sort((left, right) => Number(right.ok) - Number(left.ok) || left.latencyMs - right.latencyMs)[0];
  const modelStep: DetectStep = {
    id: 'models',
    label: text('模型列表', 'Model list'),
    detail: result.models.length
      ? text(`${result.models.length} 个模型 · ${bestModelProbe?.authStrategy || '-'}`, `${result.models.length} models · ${bestModelProbe?.authStrategy || '-'}`)
      : bestModelProbe?.error?.message || text('未读取到模型列表。', 'No model list found.'),
    status: result.models.length ? 'success' : 'warning',
  };

  return [
    modelStep,
    ...apiFormatOptions.map<DetectStep>((format) => {
      const protocol = result.protocols.find((entry) => entry.apiFormat === format.id);
      if (!protocol) {
        return {
          id: format.id,
          label: format.label,
          detail: text('未探测。', 'Not probed.'),
          status: 'idle',
        };
      }
      return {
        id: format.id,
        label: format.label,
        detail: protocolDetail(protocol),
        status: protocol.ok ? 'success' : protocol.skipped ? 'warning' : 'failure',
      };
    }),
  ];
});

const preferredEndpoint = computed(() =>
  status.value?.lifecycle.endpointPolicy.preferredCliEndpoint
  || daemonService.value?.lifecycle.endpointPolicy.preferredCliEndpoint
  || 'http://127.0.0.1:18796/v1',
);

const daemonState = computed(() =>
  daemonService.value?.lifecycle.localDaemon.state
  || status.value?.lifecycle.localDaemon.state
  || 'unknown',
);

const daemonStateLabel = computed(() => {
  if (daemonState.value === 'running') return text('运行中', 'Running');
  if (daemonState.value === 'not-installed') return text('未安装', 'Not installed');
  if (daemonState.value === 'stale') return text('状态过期', 'Stale');
  if (daemonState.value === 'stopped') return text('已停止', 'Stopped');
  return text('未知', 'Unknown');
});

const daemonStateTone = computed<'neutral' | 'accent' | 'sage' | 'danger'>(() => {
  if (daemonState.value === 'running') return 'sage';
  if (daemonState.value === 'not-installed' || daemonState.value === 'stopped') return 'danger';
  if (daemonState.value === 'stale') return 'accent';
  return 'neutral';
});

const supervisorLabel = computed(() =>
  daemonService.value?.plan.supervisor
  || status.value?.lifecycle.localDaemon.supervisor.expected
  || 'unknown',
);

const clientAuthStateLabel = computed(() => {
  if (!clientAuth.value?.enabled) return text('停用', 'Disabled');
  if (!clientAuth.value.secret.hasSecret) return text('缺少 key', 'Missing key');
  return text('已启用', 'Enabled');
});

const clientAuthStateTone = computed<'neutral' | 'accent' | 'sage' | 'danger'>(() => {
  if (!clientAuth.value?.enabled) return 'neutral';
  return clientAuth.value.secret.hasSecret ? 'sage' : 'danger';
});

const clientKeyPlaceholder = computed(() =>
  clientAuth.value?.secret.hasSecret
    ? text('留空保留现有本地 key', 'Leave empty to keep current local key')
    : text('输入本地 Gateway key', 'Enter local Gateway key'),
);

const daemonActionTitle = computed(() => {
  if (!daemonActionResult.value) return '';
  const labels: Record<ModelGatewayDaemonServiceAction, string> = {
    preview: text('service 预览结果', 'Service preview result'),
    install: text('service 安装结果', 'Service install result'),
    'ensure-running': text('daemon 确保运行结果', 'Ensure daemon result'),
    start: text('daemon start 结果', 'Daemon start result'),
    stop: text('daemon stop 结果', 'Daemon stop result'),
    restart: text('daemon restart 结果', 'Daemon restart result'),
    status: text('daemon status 结果', 'Daemon status result'),
  };
  return labels[daemonActionResult.value.action] || daemonActionResult.value.action;
});

const daemonActionHasFailure = computed(() => {
  const result = daemonActionResult.value;
  if (!result) return false;
  return result.commandsRun.some((command) => !command.ok) || Boolean(result.bootstrap.error);
});

const serviceManagerLabel = computed(() => {
  const manager = daemonActionResult.value?.serviceManager;
  if (!manager?.checked) return text('未执行命令', 'No command run');
  return [
    manager.reachable === null ? 'reachable:?' : `reachable:${manager.reachable ? 'yes' : 'no'}`,
    manager.active === null ? 'active:?' : `active:${manager.active ? 'yes' : 'no'}`,
    manager.enabled === null ? 'enabled:?' : `enabled:${manager.enabled ? 'yes' : 'no'}`,
  ].join(' / ');
});

const bootstrapLabel = computed(() => {
  const bootstrap = daemonActionResult.value?.bootstrap;
  if (!bootstrap) return '-';
  if (!bootstrap.attempted) return bootstrap.mode;
  return `${bootstrap.mode} / ${bootstrap.started ? 'started' : 'not-started'}`;
});

function daemonTemplateStateLabel(result: ModelGatewayDaemonServiceResponse | null | undefined): string {
  if (!result?.installed) return text('未写入', 'Not written');
  if (result.templateCurrent) return text('已同步', 'Current');
  if (result.templateWritten) return text('已更新', 'Updated');
  return text('需更新', 'Needs update');
}

const daemonActionOutput = computed(() => {
  const result = daemonActionResult.value;
  if (!result) return '';
  const commandOutput = result.commandsRun
    .map((command) => {
      const output = [command.stdout, command.stderr, command.error].filter(Boolean).join('\n').trim();
      return `${command.ok ? 'OK' : 'FAIL'} ${command.label}${output ? `\n${output}` : ''}`;
    })
    .join('\n\n');
  const bootstrapOutput = result.bootstrap.error
    ? `Bootstrap error\n${result.bootstrap.error}`
    : result.bootstrap.notes.join('\n');
  return [commandOutput, bootstrapOutput].filter(Boolean).join('\n\n').trim();
});

const canSaveProvider = computed(() => Boolean(draft.id.trim() && draft.name.trim() && draft.baseUrl.trim()));
const canApplyAllAppConnections = computed(() =>
  appConnections.value.length > 0 && appConnections.value.every((connection) => connection.canApply),
);
const secretPlaceholder = computed(() => {
  const provider = providers.value.find((entry) => entry.id === draft.id);
  return provider?.secret?.hasSecret
    ? text('留空保留现有密钥', 'Leave empty to keep current key')
    : text('粘贴 API Key', 'Paste API key');
});

function appConnectionStateLabel(connection: ModelGatewayAppConnection): string {
  if (connection.configured) return text('已配置', 'Configured');
  if (!connection.canApply) return text('待处理', 'Blocked');
  return text('可应用', 'Ready');
}

function appConnectionStateTone(connection: ModelGatewayAppConnection): 'neutral' | 'accent' | 'sage' | 'danger' {
  if (connection.configured) return 'sage';
  if (!connection.canApply) return 'danger';
  return 'accent';
}

function applyRouteWorkspaceSelection(): void {
  if (routeWorkspaceTab.value) {
    activeWorkspaceTab.value = routeWorkspaceTab.value;
    return;
  }
  if (routeAppConnectionId.value) activeWorkspaceTab.value = 'connections';
}

function isAppConnectionBusy(appId: ModelGatewayAppConnectionId): boolean {
  return appConnectionBusy.value[appId] === true;
}

function applyProviderResponse(response: ModelGatewayProvidersResponse): void {
  providers.value = response.providers;
  activeProviders.value = response.activeProviders;
  activeRouteStatuses.value = response.activeRoutes;
  activeRouteAlerts.value = response.activeRouteAlerts;
  syncAccountProxyDrafts();
}

function applyProviderView(provider: ModelGatewayProviderView): void {
  const index = providers.value.findIndex((entry) => entry.id === provider.id);
  if (index >= 0) {
    providers.value.splice(index, 1, provider);
    syncAccountProxyDrafts();
    return;
  }
  providers.value = [...providers.value, provider];
  syncAccountProxyDrafts();
}

function accountActionKey(account: ModelGatewayAccountEntry, action: string): string {
  return `${draft.id}:${account.id}:${action}`;
}

function accountProxyKey(account: ModelGatewayAccountEntry): string {
  return `${selectedProviderView.value?.id || draft.id}:${account.id}:proxy`;
}

function syncAccountProxyDrafts(): void {
  const next: Record<string, string> = {};
  for (const provider of providers.value) {
    for (const account of provider.accountProvider?.accounts || []) {
      const key = `${provider.id}:${account.id}:proxy`;
      next[key] = account.proxyUrl || '';
    }
  }
  accountProxyDrafts.value = next;
}

function accountProxyDraftValue(account: ModelGatewayAccountEntry): string {
  const key = accountProxyKey(account);
  return accountProxyDrafts.value[key] ?? account.proxyUrl ?? '';
}

function updateAccountProxyDraft(account: ModelGatewayAccountEntry, event: Event): void {
  const input = event.target as HTMLInputElement | null;
  accountProxyDrafts.value = {
    ...accountProxyDrafts.value,
    [accountProxyKey(account)]: input?.value || '',
  };
}

function isAccountProxyDirty(account: ModelGatewayAccountEntry): boolean {
  return accountProxyDraftValue(account).trim() !== (account.proxyUrl || '');
}

function isAccountBusy(account: ModelGatewayAccountEntry, action: string): boolean {
  return accountBusy.value[accountActionKey(account, action)] === true;
}

function accountStateLabel(account: ModelGatewayAccountEntry): string {
  if (!account.enabled || account.state === 'disabled') return text('停用', 'Disabled');
  if (account.state === 'ready') return text('可用', 'Ready');
  if (account.state === 'refreshing') return text('刷新中', 'Refreshing');
  if (account.state === 'needs-login') return text('需登录', 'Needs login');
  if (account.state === 'cooldown') return text('冷却中', 'Cooldown');
  return text('异常', 'Error');
}

function accountStateTone(account: ModelGatewayAccountEntry): 'neutral' | 'accent' | 'sage' | 'danger' {
  if (!account.enabled || account.state === 'disabled') return 'neutral';
  if (account.state === 'ready') return 'sage';
  if (account.state === 'refreshing' || account.state === 'cooldown') return 'accent';
  return 'danger';
}

function activeRouteStatusForScope(scope: ModelGatewayAppScope): ModelGatewayActiveRouteStatus | null {
  return activeRouteStatuses.value.find((route) => route.scope === scope) || null;
}

function activeRouteStateLabel(route: ModelGatewayActiveRouteStatus | null): string {
  if (!route) return text('未知', 'Unknown');
  if (route.state === 'fixed') return text('固定', 'Fixed');
  if (route.state === 'auto') return text('自动', 'Auto');
  if (route.state === 'fallback') return text('回退', 'Fallback');
  return text('缺失', 'Missing');
}

function activeRouteStateTone(route: ModelGatewayActiveRouteStatus | null): 'neutral' | 'accent' | 'sage' | 'danger' {
  if (!route) return 'neutral';
  if (route.state === 'fixed') return 'sage';
  if (route.state === 'auto') return 'accent';
  if (route.state === 'fallback') return 'neutral';
  return 'danger';
}

function activeRouteSmokeResultForScope(scope: ModelGatewayAppScope): ModelGatewayProviderTestResponse | null {
  return activeRouteSmokeResults.value[scope] || null;
}

function isActiveRouteSmokeBusy(scope: ModelGatewayAppScope): boolean {
  return activeRouteSmokeBusy.value[scope] === true;
}

function createEmptyAppConnectionProfileDraft(): AppConnectionProfileDraft {
  return {
    model: '',
    appModels: {
      codex: '',
      'claude-code': '',
      opencode: '',
      openclaw: '',
    },
    contextWindow: '',
    autoCompactTokenLimit: '',
    maxOutputTokens: '',
    reasoningEffort: '',
    codexResponsesWebsockets: false,
    codexResponsesWebsocketsV2: false,
    codexRequestCompression: false,
  };
}

function assignAppConnectionProfile(profile: ModelGatewayAppConnectionProfile): void {
  appConnectionProfile.model = profile.model || '';
  for (const appId of MODEL_GATEWAY_APP_CONNECTION_IDS) {
    appConnectionProfile.appModels[appId] = profile.appModels?.[appId] || '';
  }
  appConnectionProfile.contextWindow = profile.contextWindow ? String(profile.contextWindow) : '';
  appConnectionProfile.autoCompactTokenLimit = profile.autoCompactTokenLimit ? String(profile.autoCompactTokenLimit) : '';
  appConnectionProfile.maxOutputTokens = profile.maxOutputTokens ? String(profile.maxOutputTokens) : '';
  appConnectionProfile.reasoningEffort = profile.reasoningEffort || '';
  appConnectionProfile.codexResponsesWebsockets = profile.protocolOptions.codexResponsesWebsockets;
  appConnectionProfile.codexResponsesWebsocketsV2 = profile.protocolOptions.codexResponsesWebsocketsV2;
  appConnectionProfile.codexRequestCompression = profile.protocolOptions.codexRequestCompression;
  lastAutoAppConnectionBudget.value = null;
}

function parsePositiveDraftInteger(value: string): number | null {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

function parseNonNegativeDraftNumber(value: string): number | null {
  if (!value.trim()) return null;
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function appConnectionProfilePayload(): ModelGatewayAppConnectionProfile {
  return {
    model: appConnectionProfile.model.trim() || null,
    appModels: Object.fromEntries(
      MODEL_GATEWAY_APP_CONNECTION_IDS.map((appId) => [
        appId,
        appConnectionProfile.appModels[appId].trim() || null,
      ]),
    ) as Partial<Record<ModelGatewayAppConnectionId, string | null>>,
    contextWindow: parsePositiveDraftInteger(appConnectionProfile.contextWindow),
    autoCompactTokenLimit: parsePositiveDraftInteger(appConnectionProfile.autoCompactTokenLimit),
    maxOutputTokens: parsePositiveDraftInteger(appConnectionProfile.maxOutputTokens),
    reasoningEffort: appConnectionProfile.reasoningEffort.trim() || null,
    protocolOptions: {
      codexResponsesWebsockets: appConnectionProfile.codexResponsesWebsockets,
      codexResponsesWebsocketsV2: appConnectionProfile.codexResponsesWebsocketsV2,
      codexRequestCompression: appConnectionProfile.codexRequestCompression,
    },
  };
}

function createEmptyScopes(enabled = true): Record<ModelGatewayAppScope, boolean> {
  return {
    codex: enabled,
    'claude-code': enabled,
    opencode: enabled,
    openclaw: enabled,
  };
}

function scopesRecordFromList(scopes: ModelGatewayAppScope[] | undefined): Record<ModelGatewayAppScope, boolean> {
  const next = createEmptyScopes(false);
  for (const scope of scopes || []) {
    next[scope] = true;
  }
  return next;
}

function defaultAuthForApiFormat(format: ModelGatewayApiFormat): ModelGatewayAuthStrategy {
  return format === 'anthropic_messages' ? 'anthropic_api_key' : 'bearer';
}

function defaultRouteForApiFormat(format: ModelGatewayApiFormat): ModelGatewayRouteId {
  if (format === 'anthropic_messages') return 'anthropic_messages';
  if (format === 'openai_responses') return 'openai_responses';
  return 'openai_chat_completions';
}

function endpointProfileBaseId(format: ModelGatewayApiFormat): string {
  if (format === 'anthropic_messages') return 'anthropic';
  if (format === 'openai_responses') return 'responses';
  return 'chat';
}

function endpointProfileName(format: ModelGatewayApiFormat): string {
  if (format === 'anthropic_messages') return 'Anthropic Messages';
  if (format === 'openai_responses') return 'OpenAI Responses';
  return 'OpenAI Chat';
}

function nextUniqueEndpointProfileId(baseId: string, exceptKey = ''): string {
  const normalizedBase = baseId.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'endpoint';
  const existing = new Set(
    draft.endpointRows
      .filter((row) => row.key !== exceptKey)
      .map((row) => row.id.trim())
      .filter(Boolean),
  );
  if (!existing.has(normalizedBase)) return normalizedBase;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${normalizedBase}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${normalizedBase}-${Date.now()}`;
}

function createEndpointProfileRow(
  profile?: ModelGatewayProviderView['endpointProfiles'][number],
  seed: Partial<EndpointProfileRow> = {},
): EndpointProfileRow {
  const apiFormat = seed.apiFormat || profile?.apiFormat || draft.apiFormat;
  const id = seed.id || profile?.id || nextUniqueEndpointProfileId(endpointProfileBaseId(apiFormat));
  const endpoints = profile?.endpoints || {};
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id,
    name: seed.name || profile?.name || endpointProfileName(apiFormat),
    enabled: seed.enabled ?? profile?.enabled ?? true,
    baseUrl: seed.baseUrl || profile?.baseUrl || draft.baseUrl,
    apiFormat,
    authStrategy: seed.authStrategy || profile?.authStrategy || defaultAuthForApiFormat(apiFormat),
    priority: typeof seed.priority === 'number'
      ? seed.priority
      : typeof profile?.failover.priority === 'number'
        ? profile.failover.priority
        : Math.max(1, Number.isFinite(draft.priority) ? Math.floor(draft.priority) : 100),
    anthropicEndpoint: seed.anthropicEndpoint || endpoints.anthropic_messages || '',
    compactEndpoint: seed.compactEndpoint || endpoints.openai_responses_compact || '',
    appScopes: seed.appScopes || scopesRecordFromList(profile?.appScopes || selectedScopes()),
    inherited: profile
      ? {
        apiKeyRef: profile.apiKeyRef,
        models: profile.models,
        reasoning: profile.reasoning,
        network: profile.network,
        health: profile.health,
        metadata: profile.metadata,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      }
      : {},
  };
}

function endpointRowScopes(row: EndpointProfileRow): ModelGatewayAppScope[] {
  const scopes = appScopeOptions
    .filter((scope) => row.appScopes[scope.id])
    .map((scope) => scope.id);
  return scopes.length ? scopes : selectedScopes();
}

function buildEndpointOverridesForRow(row: EndpointProfileRow): Partial<Record<ModelGatewayRouteId, string>> {
  const endpoints: Partial<Record<ModelGatewayRouteId, string>> = {};
  if (row.anthropicEndpoint.trim()) endpoints.anthropic_messages = row.anthropicEndpoint.trim();
  if (row.compactEndpoint.trim()) endpoints.openai_responses_compact = row.compactEndpoint.trim();
  return endpoints;
}

function endpointRowsToInputs(rows: EndpointProfileRow[]): ModelGatewayProviderEndpointProfileInput[] {
  return rows
    .map((row) => {
      const id = row.id.trim();
      const baseUrl = row.baseUrl.trim();
      if (!id || !baseUrl) return null;
      return {
        ...row.inherited,
        id,
        name: row.name.trim() || id,
        enabled: row.enabled,
        appScopes: endpointRowScopes(row),
        baseUrl,
        apiFormat: row.apiFormat,
        authStrategy: row.authStrategy,
        endpoints: buildEndpointOverridesForRow(row),
        failover: {
          enabled: true,
          priority: Number.isFinite(row.priority) ? Math.max(0, Math.floor(row.priority)) : 100,
          maxRetries: 1,
        },
      } satisfies ModelGatewayProviderEndpointProfileInput;
    })
    .filter((profile): profile is ModelGatewayProviderEndpointProfileInput => profile !== null);
}

function addEndpointProfileRow(seed: Partial<EndpointProfileRow> = {}): void {
  const row = createEndpointProfileRow(undefined, {
    id: seed.id || nextUniqueEndpointProfileId(endpointProfileBaseId(seed.apiFormat || draft.apiFormat)),
    name: seed.name,
    baseUrl: seed.baseUrl || draft.baseUrl,
    apiFormat: seed.apiFormat || draft.apiFormat,
    authStrategy: seed.authStrategy || defaultAuthForApiFormat(seed.apiFormat || draft.apiFormat),
    priority: seed.priority ?? Math.max(1, draft.endpointRows.length + 1),
    appScopes: seed.appScopes || scopesRecordFromList(selectedScopes()),
    anthropicEndpoint: seed.anthropicEndpoint,
    compactEndpoint: seed.compactEndpoint,
  });
  draft.endpointRows.push(row);
}

function removeEndpointProfileRow(index: number): void {
  const row = draft.endpointRows[index];
  draft.endpointRows.splice(index, 1);
  if (row?.id) {
    const next = { ...endpointSmokeResults.value };
    delete next[row.id];
    endpointSmokeResults.value = next;
  }
}

function updateEndpointProtocol(row: EndpointProfileRow): void {
  row.authStrategy = defaultAuthForApiFormat(row.apiFormat);
  if (!row.name.trim() || apiFormatOptions.some((option) => option.label === row.name.trim())) {
    row.name = endpointProfileName(row.apiFormat);
  }
  if (!row.id.trim()) {
    row.id = nextUniqueEndpointProfileId(endpointProfileBaseId(row.apiFormat), row.key);
  }
}

function mergeDetectedEndpointProfiles(): void {
  const supported = detectSupportedProtocols.value;
  if (!supported.length) {
    notice.value = { kind: 'error', message: text('没有可生成 endpoint 的可用协议。', 'No supported protocol can be turned into endpoints.') };
    return;
  }
  let changed = 0;
  for (const [index, protocol] of supported.entries()) {
    const id = nextUniqueEndpointProfileId(endpointProfileBaseId(protocol.apiFormat));
    const existing = draft.endpointRows.find((row) => row.apiFormat === protocol.apiFormat && row.baseUrl.trim() === draft.baseUrl.trim());
    const target = existing || createEndpointProfileRow(undefined, {
      id,
      name: endpointProfileName(protocol.apiFormat),
      baseUrl: draft.baseUrl.trim(),
      apiFormat: protocol.apiFormat,
      authStrategy: protocol.authStrategy,
      priority: index + 1,
      appScopes: scopesRecordFromList(protocol.apiFormat === 'anthropic_messages' ? ['claude-code'] : selectedScopes()),
    });
    target.enabled = true;
    target.apiFormat = protocol.apiFormat;
    target.authStrategy = protocol.authStrategy;
    target.baseUrl = draft.baseUrl.trim();
    target.priority = existing ? target.priority : index + 1;
    if (!existing) draft.endpointRows.push(target);
    changed += 1;
  }
  notice.value = {
    kind: 'success',
    message: text(`已同步 ${changed} 个 endpoint profile。`, `${changed} endpoint profiles synced.`),
  };
}

function createEmptyDraft(): ProviderDraft {
  return {
    templateId: '',
    id: '',
    name: '',
    enabled: true,
    category: 'custom',
    apiFormat: 'openai_chat',
    authStrategy: 'bearer',
    priority: 100,
    baseUrl: '',
    defaultModel: '',
    modelListText: '',
    modelRows: [],
    apiKey: '',
    anthropicEndpoint: '',
    compactEndpoint: '',
    proxyUrl: '',
    noProxy: '',
    appScopes: createEmptyScopes(true),
    endpointRows: [],
    accountRoutingStrategy: 'round-robin',
    accountSessionAffinity: true,
    accountMaxConcurrentPerAccount: '',
  };
}

function createModelBulkDraft(): ProviderModelBulkDraft {
  return {
    contextWindow: '',
    maxOutputTokens: '',
    text: true,
    vision: false,
    imageGeneration: false,
    audioInput: false,
    audioOutput: false,
    tools: false,
    reasoning: false,
    responses: true,
    streaming: true,
  };
}

function resetDraft(): void {
  Object.assign(draft, createEmptyDraft());
  Object.assign(modelBulk, createModelBulkDraft());
  endpointSmokeResults.value = {};
}

function applyProtocolTemplate(template: ProtocolTemplate): void {
  Object.assign(draft, createEmptyDraft(), template.draft, {
    templateId: template.id,
    enabled: true,
    apiKey: '',
    appScopes: createEmptyScopes(true),
  });
  smokeRouteId.value = draft.apiFormat === 'anthropic_messages'
    ? 'anthropic_messages'
    : draft.apiFormat === 'openai_responses'
      ? 'openai_responses'
      : 'openai_chat_completions';
  Object.assign(modelBulk, createModelBulkDraft());
  syncDefaultModelWithList();
}

function editProvider(provider: ModelGatewayProviderView): void {
  Object.assign(draft, createEmptyDraft(), {
    templateId: '',
    id: provider.id,
    name: provider.name,
    enabled: provider.enabled,
    category: provider.category,
    apiFormat: provider.apiFormat,
    authStrategy: provider.authStrategy,
    priority: provider.failover.priority,
    baseUrl: provider.baseUrl,
    defaultModel: provider.models.defaultModel || provider.models.models[0]?.id || '',
    modelListText: provider.models.models.length
      ? provider.models.models.map(formatModelLine).join('\n')
      : provider.models.defaultModel || '',
    modelRows: provider.models.models.length
      ? provider.models.models.map(createProviderModelRow)
      : provider.models.defaultModel
        ? [createProviderModelRow({ id: provider.models.defaultModel })]
        : [],
    apiKey: '',
    anthropicEndpoint: provider.endpoints.anthropic_messages || '',
    compactEndpoint: provider.endpoints.openai_responses_compact || '',
    proxyUrl: provider.network.proxyUrl || '',
    noProxy: provider.network.noProxy.join(','),
    appScopes: Object.fromEntries(
      appScopeOptions.map((scope) => [scope.id, provider.appScopes.includes(scope.id)]),
    ) as Record<ModelGatewayAppScope, boolean>,
    endpointRows: provider.endpointProfiles.map(createEndpointProfileRow),
    accountRoutingStrategy: provider.accountProvider?.routing.strategy || 'round-robin',
    accountSessionAffinity: provider.accountProvider?.routing.sessionAffinity ?? true,
    accountMaxConcurrentPerAccount: provider.accountProvider?.routing.maxConcurrentPerAccount
      ? String(provider.accountProvider.routing.maxConcurrentPerAccount)
      : '',
  });
  smokeProviderId.value = provider.id;
  smokeModel.value = draft.defaultModel;
  Object.assign(modelBulk, createModelBulkDraft());
  endpointSmokeResults.value = {};
}

function providerExists(providerId: string): boolean {
  return providers.value.some((provider) => provider.id === providerId);
}

function selectedScopes(): ModelGatewayAppScope[] {
  const scopes = appScopeOptions
    .filter((scope) => draft.appScopes[scope.id])
    .map((scope) => scope.id);
  return scopes.length ? scopes : appScopeOptions.map((scope) => scope.id);
}

function buildEndpointOverrides(): Partial<Record<ModelGatewayRouteId, string>> {
  const endpoints: Partial<Record<ModelGatewayRouteId, string>> = {};
  if (draft.anthropicEndpoint.trim()) endpoints.anthropic_messages = draft.anthropicEndpoint.trim();
  if (draft.compactEndpoint.trim()) endpoints.openai_responses_compact = draft.compactEndpoint.trim();
  return endpoints;
}

function parseNoProxy(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function uniqueStrings(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function inferProviderModelCapabilities(modelId: string): Pick<ProviderModelRow, ModelCapabilityId> {
  const normalized = normalizeModelKey(modelId);
  const imageGeneration = /^gpt-image|^image-\d|dall-e|image[-_]?gen/.test(normalized);
  const audioInput = /transcribe|whisper|gpt-audio|realtime/.test(normalized);
  const audioOutput = /tts|speech|gpt-audio|realtime/.test(normalized);
  const isEmbeddingLike = /embedding|embed|rerank/.test(normalized);
  const isMediaOnly = imageGeneration || (/transcribe|whisper/.test(normalized) && !audioOutput);
  const reasoning = /gpt-5|^o[134]|claude|gemini|deepseek[-_]?r|reason|thinking|qwq|grok|glm[-_]?5/.test(normalized);
  const tools = !isEmbeddingLike && !isMediaOnly && /gpt|claude|gemini|qwen|deepseek|glm|kimi|grok|tools?/.test(normalized);
  return {
    text: !isEmbeddingLike && !imageGeneration && !/transcribe|whisper/.test(normalized),
    vision: imageGeneration,
    imageGeneration,
    audioInput,
    audioOutput,
    tools,
    reasoning,
    responses: !isMediaOnly,
    streaming: !isEmbeddingLike && !imageGeneration && !/transcribe|whisper|tts|speech/.test(normalized),
  };
}

function defaultProviderModelCapabilities(model?: ModelGatewayProviderModel): Pick<ProviderModelRow, ModelCapabilityId> {
  return {
    text: model?.features?.text ?? true,
    vision: model?.features?.vision ?? false,
    imageGeneration: model?.features?.imageGeneration ?? false,
    audioInput: model?.features?.audioInput ?? false,
    audioOutput: model?.features?.audioOutput ?? false,
    tools: model?.features?.tools ?? false,
    reasoning: model?.features?.reasoning ?? false,
    responses: model?.features?.responses ?? true,
    streaming: model?.features?.streaming ?? true,
  };
}

function providerModelRowHasDefaultCapabilities(row: ProviderModelRow): boolean {
  return row.text === true
    && row.vision === false
    && row.imageGeneration === false
    && row.audioInput === false
    && row.audioOutput === false
    && row.tools === false
    && row.reasoning === false
    && row.responses === true
    && row.streaming === true;
}

function createProviderModelRow(
  model?: ModelGatewayProviderModel,
  options: { inferMissing?: boolean } = {},
): ProviderModelRow {
  const id = model?.id || '';
  const inferredBudget = options.inferMissing ? inferAppConnectionBudget(id) : { contextWindow: null, maxOutputTokens: null };
  const capabilities = options.inferMissing && !model?.features
    ? inferProviderModelCapabilities(id)
    : defaultProviderModelCapabilities(model);
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id,
    label: model?.label || '',
    aliases: model?.aliases?.join(', ') || '',
    contextWindow: model?.contextWindow ? String(model.contextWindow) : inferredBudget.contextWindow ? String(inferredBudget.contextWindow) : '',
    maxOutputTokens: model?.maxOutputTokens ? String(model.maxOutputTokens) : inferredBudget.maxOutputTokens ? String(inferredBudget.maxOutputTokens) : '',
    pricingCurrency: model?.pricing?.currency || 'USD',
    inputPricePer1M: model?.pricing?.inputPer1M !== null && model?.pricing?.inputPer1M !== undefined ? String(model.pricing.inputPer1M) : '',
    outputPricePer1M: model?.pricing?.outputPer1M !== null && model?.pricing?.outputPer1M !== undefined ? String(model.pricing.outputPer1M) : '',
    cacheReadPricePer1M: model?.pricing?.cacheReadPer1M !== null && model?.pricing?.cacheReadPer1M !== undefined ? String(model.pricing.cacheReadPer1M) : '',
    cacheCreationPricePer1M: model?.pricing?.cacheCreationPer1M !== null && model?.pricing?.cacheCreationPer1M !== undefined ? String(model.pricing.cacheCreationPer1M) : '',
    imageGenerationPrice: model?.pricing?.imageGenerationPerImage !== null && model?.pricing?.imageGenerationPerImage !== undefined ? String(model.pricing.imageGenerationPerImage) : '',
    imageEditPrice: model?.pricing?.imageEditPerRequest !== null && model?.pricing?.imageEditPerRequest !== undefined ? String(model.pricing.imageEditPerRequest) : '',
    audioInputPrice: model?.pricing?.audioInputPerRequest !== null && model?.pricing?.audioInputPerRequest !== undefined ? String(model.pricing.audioInputPerRequest) : '',
    audioOutputPrice: model?.pricing?.audioOutputPerRequest !== null && model?.pricing?.audioOutputPerRequest !== undefined ? String(model.pricing.audioOutputPerRequest) : '',
    ...capabilities,
  };
}

function parseModelLines(value: string): ModelGatewayProviderModel[] {
  const models: ModelGatewayProviderModel[] = [];
  for (const line of value.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.includes('|')
      ? trimmed.split('|').map((part) => part.trim())
      : trimmed.split(',').map((part) => part.trim());
    const [rawId, ...aliasParts] = parts;
    const rawAliases = aliasParts.join(',');
    const id = rawId || '';
    if (!id) continue;
    models.push({
      id,
      ...(rawAliases ? { aliases: parseNoProxy(rawAliases) } : {}),
    });
  }
  return models;
}

function modelRowsFromText(value: string): ProviderModelRow[] {
  return parseModelLines(value).map((model) => createProviderModelRow(model, { inferMissing: true }));
}

function modelRowsToModels(rows: ProviderModelRow[]): ModelGatewayProviderModel[] {
  return rows
    .map((row) => {
      const id = row.id.trim();
      if (!id) return null;
      const aliases = parseNoProxy(row.aliases);
      const pricing = modelRowPricing(row);
      return {
        id,
        ...(parsePositiveDraftInteger(row.contextWindow) ? { contextWindow: parsePositiveDraftInteger(row.contextWindow) } : {}),
        ...(parsePositiveDraftInteger(row.maxOutputTokens) ? { maxOutputTokens: parsePositiveDraftInteger(row.maxOutputTokens) } : {}),
        ...(aliases.length ? { aliases } : {}),
        ...(pricing ? { pricing } : {}),
        features: {
          text: row.text,
          vision: row.vision,
          imageGeneration: row.imageGeneration,
          audioInput: row.audioInput,
          audioOutput: row.audioOutput,
          tools: row.tools,
          reasoning: row.reasoning,
          responses: row.responses,
          streaming: row.streaming,
        },
      } satisfies ModelGatewayProviderModel;
    })
    .filter((model): model is ModelGatewayProviderModel => model !== null);
}

function modelRowPricing(row: ProviderModelRow): ModelGatewayProviderModelPricing | undefined {
  const values: ModelGatewayProviderModelPricing = {};
  const currency = row.pricingCurrency.trim().toUpperCase();
  const assign = (key: keyof ModelGatewayProviderModelPricing, value: string) => {
    if (key === 'currency') return;
    const numeric = parseNonNegativeDraftNumber(value);
    if (numeric !== null) values[key] = numeric;
  };
  assign('inputPer1M', row.inputPricePer1M);
  assign('outputPer1M', row.outputPricePer1M);
  assign('cacheReadPer1M', row.cacheReadPricePer1M);
  assign('cacheCreationPer1M', row.cacheCreationPricePer1M);
  assign('imageGenerationPerImage', row.imageGenerationPrice);
  assign('imageEditPerRequest', row.imageEditPrice);
  assign('audioInputPerRequest', row.audioInputPrice);
  assign('audioOutputPerRequest', row.audioOutputPrice);
  if (!Object.keys(values).length) return undefined;
  values.currency = currency || 'USD';
  return values;
}

function modelPricingSummary(row: ProviderModelRow): string {
  const pricing = modelRowPricing(row);
  if (!pricing) return text('价格未配置', 'Pricing not set');
  const currency = pricing.currency || 'USD';
  const parts = [
    pricing.inputPer1M !== undefined && pricing.inputPer1M !== null
      ? text(`输入 ${pricing.inputPer1M}/1M`, `input ${pricing.inputPer1M}/1M`)
      : '',
    pricing.outputPer1M !== undefined && pricing.outputPer1M !== null
      ? text(`输出 ${pricing.outputPer1M}/1M`, `output ${pricing.outputPer1M}/1M`)
      : '',
    pricing.imageGenerationPerImage !== undefined && pricing.imageGenerationPerImage !== null
      ? text(`生图 ${pricing.imageGenerationPerImage}/张`, `image ${pricing.imageGenerationPerImage}/output`)
      : '',
  ].filter(Boolean);
  return [text('价格', 'Pricing'), currency, parts.join(' · ')].filter(Boolean).join(' · ');
}

function modelRowAliases(row: ProviderModelRow): string[] {
  return parseNoProxy(row.aliases);
}

function modelRowIdentityKeys(row: ProviderModelRow): string[] {
  return uniqueStrings([
    row.id,
    ...modelRowAliases(row),
  ].map(normalizeModelKey));
}

function mergeDetectedModelIntoRow(row: ProviderModelRow, model: ModelGatewayProviderModel): boolean {
  let changed = false;
  if (!row.label && model.label) {
    row.label = model.label;
    changed = true;
  }
  if (!row.contextWindow) {
    const budget = model.contextWindow || inferAppConnectionBudget(model.id).contextWindow;
    if (budget) {
      row.contextWindow = String(budget);
      changed = true;
    }
  }
  if (!row.maxOutputTokens) {
    const budget = model.maxOutputTokens || inferAppConnectionBudget(model.id).maxOutputTokens;
    if (budget) {
      row.maxOutputTokens = String(budget);
      changed = true;
    }
  }
  if (providerModelRowHasDefaultCapabilities(row)) {
    Object.assign(row, model.features ? defaultProviderModelCapabilities(model) : inferProviderModelCapabilities(model.id));
    changed = true;
  }
  const aliases = modelRowAliases(row);
  const normalizedAliases = new Set(aliases.map(normalizeModelKey));
  for (const alias of model.aliases || []) {
    const normalized = normalizeModelKey(alias);
    if (!normalized || normalized === normalizeModelKey(row.id) || normalizedAliases.has(normalized)) continue;
    aliases.push(alias);
    normalizedAliases.add(normalized);
    changed = true;
  }
  if (changed) {
    row.aliases = aliases.join(', ');
  }
  return changed;
}

function mergeDetectedModels(models: ModelGatewayProviderModel[]): { added: number; updated: number; kept: number } {
  let added = 0;
  let updated = 0;
  let kept = 0;
  for (const model of models) {
    const modelKey = normalizeModelKey(model.id);
    if (!modelKey) continue;
    const existing = draft.modelRows.find((row) => modelRowIdentityKeys(row).includes(modelKey));
    if (!existing) {
      draft.modelRows.push(createProviderModelRow(model, { inferMissing: true }));
      added += 1;
      continue;
    }
    if (mergeDetectedModelIntoRow(existing, model)) {
      updated += 1;
    } else {
      kept += 1;
    }
  }
  syncDefaultModelWithList();
  syncModelTextFromRows();
  if (!smokeModel.value) {
    smokeModel.value = draft.defaultModel;
  }
  return { added, updated, kept };
}

function syncModelTextFromRows(): void {
  draft.modelListText = modelRowsToModels(draft.modelRows).map(formatModelLine).join('\n');
}

function applyModelTextToRows(): void {
  const rows = modelRowsFromText(draft.modelListText);
  draft.modelRows = rows;
  syncDefaultModelWithList();
  syncModelTextFromRows();
  notice.value = {
    kind: rows.length ? 'success' : 'error',
    message: rows.length
      ? text(`已导入 ${rows.length} 个模型。`, `${rows.length} models imported.`)
      : text('没有可导入的模型行。', 'No model rows to import.'),
  };
}

function copyModelRowsToBatchText(): void {
  syncModelTextFromRows();
  notice.value = {
    kind: 'success',
    message: text('模型文本已从当前表格同步。', 'Model text synced from the current table.'),
  };
}

function fillMissingModelMetadata(): void {
  let changed = 0;
  for (const row of draft.modelRows) {
    const id = row.id.trim();
    if (!id) continue;
    const budget = inferAppConnectionBudget(id);
    if (!row.contextWindow && budget.contextWindow) {
      row.contextWindow = String(budget.contextWindow);
      changed += 1;
    }
    if (!row.maxOutputTokens && budget.maxOutputTokens) {
      row.maxOutputTokens = String(budget.maxOutputTokens);
      changed += 1;
    }
    if (providerModelRowHasDefaultCapabilities(row)) {
      Object.assign(row, inferProviderModelCapabilities(id));
      changed += 1;
    }
  }
  syncModelTextFromRows();
  notice.value = {
    kind: changed ? 'success' : 'error',
    message: changed
      ? text('已补齐空白预算和默认能力。', 'Missing budgets and default capabilities filled.')
      : text('没有可补齐的空白字段。', 'No empty fields to fill.'),
  };
}

function applyModelBulkBudget(): void {
  if (!draft.modelRows.length) {
    notice.value = { kind: 'error', message: text('先添加或导入模型。', 'Add or import models first.') };
    return;
  }
  const contextWindow = parsePositiveDraftInteger(modelBulk.contextWindow);
  const maxOutputTokens = parsePositiveDraftInteger(modelBulk.maxOutputTokens);
  if (!contextWindow && !maxOutputTokens) {
    notice.value = { kind: 'error', message: text('先填写上下文或输出预算。', 'Enter context or output budget first.') };
    return;
  }
  for (const row of draft.modelRows) {
    if (contextWindow) row.contextWindow = String(contextWindow);
    if (maxOutputTokens) row.maxOutputTokens = String(maxOutputTokens);
  }
  syncModelTextFromRows();
  notice.value = { kind: 'success', message: text('已把预算应用到全部模型。', 'Budget applied to all models.') };
}

function applyModelBulkCapabilities(): void {
  if (!draft.modelRows.length) {
    notice.value = { kind: 'error', message: text('先添加或导入模型。', 'Add or import models first.') };
    return;
  }
  for (const row of draft.modelRows) {
    for (const capability of modelCapabilityOptions) {
      row[capability.id] = modelBulk[capability.id];
    }
  }
  syncModelTextFromRows();
  notice.value = { kind: 'success', message: text('已把能力应用到全部模型。', 'Capabilities applied to all models.') };
}

function addDraftModelRow(model?: ModelGatewayProviderModel): void {
  draft.modelRows.push(createProviderModelRow(model));
  syncDefaultModelWithList();
  syncModelTextFromRows();
}

function removeDraftModelRow(index: number): void {
  draft.modelRows.splice(index, 1);
  if (draft.defaultModel.trim() && !draft.modelRows.some((row) => row.id.trim() === draft.defaultModel.trim())) {
    draft.defaultModel = draft.modelRows[0]?.id.trim() || '';
  }
  syncModelTextFromRows();
}

function parseModelList(value: string): string[] {
  return parseModelLines(value).map((model) => model.id);
}

function formatModelLine(model: ModelGatewayProviderModel): string {
  const aliases = model.aliases?.length ? model.aliases.join(',') : '';
  if (aliases) return `${model.id} | ${aliases}`;
  return model.id;
}

function appConnectionBudgetLabel(modelId: string): string {
  const budget = appConnectionBudgetDraftForModel(modelId);
  const context = budget.contextWindow ? `${formatCompactNumber(Number(budget.contextWindow))} ${text('上下文', 'context')}` : '-';
  const output = budget.maxOutputTokens ? `${formatCompactNumber(Number(budget.maxOutputTokens))} ${text('输出', 'output')}` : '-';
  return `${context} · ${output}`;
}

function appConnectionModelOptionLabel(modelId: string): string {
  const metadata = appConnectionModelMetadata(modelId);
  const budget = [
    metadata.contextWindow ? text(`${formatCompactNumber(metadata.contextWindow)} 上下文`, `${formatCompactNumber(metadata.contextWindow)} context`) : '',
    metadata.maxOutputTokens ? text(`${formatCompactNumber(metadata.maxOutputTokens)} 输出`, `${formatCompactNumber(metadata.maxOutputTokens)} output`) : '',
  ].filter(Boolean).join(' · ');
  const label = metadata.label && metadata.label !== modelId ? ` · ${metadata.label}` : '';
  return budget ? `${modelId}${label} · ${budget}` : `${modelId}${label}`;
}

function catalogModels(catalog: ModelGatewayProviderModelCatalog | null | undefined): ModelGatewayProviderModel[] {
  if (!catalog) return [];
  const models = [...(catalog.models || [])];
  if (catalog.defaultModel && !models.some((model) => model.id === catalog.defaultModel)) {
    models.unshift({ id: catalog.defaultModel });
  }
  return models;
}

function providerCatalogModels(provider: ModelGatewayProviderView): ModelGatewayProviderModel[] {
  return [
    ...catalogModels(provider.models),
    ...provider.endpointProfiles.flatMap((profile) => catalogModels(profile.models)),
  ];
}

function appConnectionModelMetadata(modelId: string): { label: string | null; contextWindow: number | null; maxOutputTokens: number | null } {
  const key = normalizeModelKey(modelId);
  const result: { label: string | null; contextWindow: number | null; maxOutputTokens: number | null } = {
    label: null,
    contextWindow: null,
    maxOutputTokens: null,
  };

  for (const provider of providers.value.filter((item) => item.enabled)) {
    for (const model of providerCatalogModels(provider)) {
      const aliases = model.aliases || [];
      const matches = normalizeModelKey(model.id) === key || aliases.some((alias) => normalizeModelKey(alias) === key);
      if (!matches) continue;
      result.label ||= model.label || null;
      result.contextWindow = mergeModelBudget(result.contextWindow, model.contextWindow);
      result.maxOutputTokens = mergeModelBudget(result.maxOutputTokens, model.maxOutputTokens);
    }
  }

  const fallback = inferAppConnectionBudget(modelId);
  result.contextWindow ||= fallback.contextWindow;
  result.maxOutputTokens ||= fallback.maxOutputTokens;
  return result;
}

function inferAppConnectionBudget(modelId: string): { contextWindow: number | null; maxOutputTokens: number | null } {
  const normalized = normalizeModelKey(modelId);
  if (!normalized) return { contextWindow: null, maxOutputTokens: null };
  if (/^gpt-5\.(4|5)(\b|-|_)?/.test(normalized)) return { contextWindow: 1050000, maxOutputTokens: 128000 };
  if (/^gpt-5(\b|-|_|\.)?/.test(normalized) || /^o[134](\b|-|_|\.)?/.test(normalized)) return { contextWindow: 400000, maxOutputTokens: 128000 };
  if (/^gpt-4\.1(\b|-|_)?/.test(normalized)) return { contextWindow: 1047576, maxOutputTokens: 32768 };
  if (/^gpt-4o(\b|-|_)?/.test(normalized)) return { contextWindow: 128000, maxOutputTokens: 16384 };
  if (/claude/.test(normalized) && /((opus|sonnet).*4[-.]?[678]|4[-.]?[678].*(opus|sonnet))/.test(normalized)) return { contextWindow: 1000000, maxOutputTokens: 64000 };
  if (/claude/.test(normalized)) return { contextWindow: 200000, maxOutputTokens: 64000 };
  if (/gemini-3|gemini-2\.5/.test(normalized)) return { contextWindow: 1048576, maxOutputTokens: 65536 };
  if (/gemini/.test(normalized)) return { contextWindow: 1048576, maxOutputTokens: 8192 };
  if (/deepseek/.test(normalized)) return { contextWindow: 64000, maxOutputTokens: 8000 };
  if (/^glm[-_]?5|^glm[-_]?4\.[56]/.test(normalized)) return { contextWindow: 200000, maxOutputTokens: 128000 };
  if (/qwen/.test(normalized)) return { contextWindow: /1m|long/.test(normalized) ? 1000000 : 128000, maxOutputTokens: 8192 };
  if (/grok/.test(normalized)) return { contextWindow: 256000, maxOutputTokens: 32768 };
  return { contextWindow: 64000, maxOutputTokens: 8192 };
}

function mergeModelBudget(current: number | null, next: unknown): number | null {
  const normalized = typeof next === 'number' && Number.isFinite(next) && next > 0 ? Math.floor(next) : null;
  if (!normalized) return current;
  return current === null ? normalized : Math.min(current, normalized);
}

function mediaCatalogBucket(
  id: string,
  zh: string,
  en: string,
  models: ModelGatewayProviderModel[],
  predicate: (model: ModelGatewayProviderModel) => boolean,
): MediaCatalogBucket {
  const ids = uniqueStrings(models.filter(predicate).map((model) => model.id));
  return {
    id,
    zh,
    en,
    count: ids.length,
    preview: ids.slice(0, 3).join(', '),
  };
}

function deriveAppConnectionCompactLimit(contextWindow: number | null, maxOutputTokens: number | null): number | null {
  if (!contextWindow) return null;
  const outputReserve = Math.min(
    Math.max(maxOutputTokens || 8192, 8192),
    Math.floor(contextWindow * 0.5),
  );
  return Math.max(1024, Math.floor(Math.max(1024, contextWindow - outputReserve) * 0.85));
}

function appConnectionBudgetDraftForModel(modelId: string): AppConnectionBudgetDraft {
  const metadata = appConnectionModelMetadata(modelId);
  const compact = deriveAppConnectionCompactLimit(metadata.contextWindow, metadata.maxOutputTokens);
  return {
    model: modelId || '-',
    contextWindow: metadata.contextWindow ? String(metadata.contextWindow) : '',
    autoCompactTokenLimit: compact ? String(compact) : '',
    maxOutputTokens: metadata.maxOutputTokens ? String(metadata.maxOutputTokens) : '',
  };
}

function appConnectionBudgetFieldsMatchLastAuto(): boolean {
  const last = lastAutoAppConnectionBudget.value;
  return Boolean(last)
    && appConnectionProfile.contextWindow === last.contextWindow
    && appConnectionProfile.autoCompactTokenLimit === last.autoCompactTokenLimit
    && appConnectionProfile.maxOutputTokens === last.maxOutputTokens;
}

function applyAppConnectionModelBudget(force = false): void {
  const next = selectedAppConnectionBudget.value;
  if (!next.contextWindow && !next.maxOutputTokens) return;
  const fieldsAreEmpty = !appConnectionProfile.contextWindow
    && !appConnectionProfile.autoCompactTokenLimit
    && !appConnectionProfile.maxOutputTokens;
  if (!force && !fieldsAreEmpty && !appConnectionBudgetFieldsMatchLastAuto()) return;
  appConnectionProfile.contextWindow = next.contextWindow;
  appConnectionProfile.autoCompactTokenLimit = next.autoCompactTokenLimit;
  appConnectionProfile.maxOutputTokens = next.maxOutputTokens;
  lastAutoAppConnectionBudget.value = { ...next };
}

function normalizeModelKey(value: string): string {
  return value.trim().toLowerCase();
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}m`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}k`;
  return String(value);
}

function normalizedDraftModels(): { defaultModel: string | null; models: ModelGatewayProviderModel[] } {
  let listed = modelRowsToModels(draft.modelRows);
  if (!listed.length && draft.modelListText.trim()) {
    draft.modelRows = modelRowsFromText(draft.modelListText);
    listed = modelRowsToModels(draft.modelRows);
  }
  const fallbackDefault = draft.defaultModel.trim() || listed[0]?.id || '';
  const models = [...listed];
  if (fallbackDefault && !models.some((model) => model.id === fallbackDefault)) {
    models.unshift({
      id: fallbackDefault,
      contextWindow: null,
      maxOutputTokens: null,
      features: {
        text: true,
        vision: false,
        imageGeneration: false,
        audioInput: false,
        audioOutput: false,
        tools: false,
        reasoning: false,
        responses: true,
        streaming: true,
      },
    });
  }
  draft.modelListText = models.map(formatModelLine).join('\n');
  return {
    defaultModel: fallbackDefault || null,
    models,
  };
}

function syncDefaultModelWithList(): void {
  const models = modelRowsToModels(draft.modelRows).map((model) => model.id);
  if (!draft.defaultModel.trim() && models[0]) {
    draft.defaultModel = models[0];
  }
}

function applyDetectedModels(models: ModelGatewayProviderModel[]): void {
  if (!models.length) return;
  mergeDetectedModels(models);
}

function protocolKey(protocol: ModelGatewayProviderDetectProtocolResult): string {
  return `${protocol.apiFormat}:${protocol.authStrategy}:${protocol.routeId}`;
}

function protocolDetail(protocol: ModelGatewayProviderDetectProtocolResult): string {
  const status = protocol.statusCode || '-';
  const latency = `${protocol.latencyMs} ms`;
  const model = protocol.model ? ` · ${protocol.model}` : '';
  if (protocol.ok) {
    return `${protocol.authStrategy} · ${status} · ${latency}${model}`;
  }
  const reason = protocol.error?.message || (protocol.skipped ? text('已跳过', 'Skipped') : text('失败', 'Failed'));
  return `${protocol.authStrategy} · ${status} · ${latency} · ${reason}`;
}

function openDetectOverlay(): void {
  detectOverlayOpen.value = true;
}

function closeDetectOverlay(): void {
  detectOverlayOpen.value = false;
}

function applyDetectedProtocol(protocol: ModelGatewayProviderDetectProtocolResult, showNotice = true): void {
  draft.apiFormat = protocol.apiFormat;
  draft.authStrategy = protocol.authStrategy;
  smokeRouteId.value = protocol.routeId;
  appliedProtocolKey.value = protocolKey(protocol);
  if (protocol.model) {
    draft.defaultModel = protocol.model;
    smokeModel.value = protocol.model;
  }
  if (showNotice) {
    notice.value = {
      kind: 'success',
      message: text('已应用识别出的协议配置。', 'Detected protocol configuration applied.'),
    };
  }
}

async function detectProviderConfig(): Promise<void> {
  detectBusy.value = true;
  detectResult.value = null;
  detectError.value = null;
  appliedProtocolKey.value = '';
  detectOverlayOpen.value = true;
  notice.value = null;
  try {
    const response = await detectModelGatewayProvider({
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim() || null,
      model: draft.defaultModel.trim() || draftModelIds.value[0] || undefined,
      timeoutMs: 20000,
    });
    detectResult.value = response;
    if (response.models.length) {
      applyDetectedModels(response.models);
    }
    const supported = response.protocols.filter((protocol) => protocol.ok);
    if (supported.length === 1) {
      applyDetectedProtocol(supported[0], false);
      notice.value = {
        kind: 'success',
        message: text('已识别并应用唯一可用协议。', 'Detected and applied the only supported protocol.'),
      };
    } else if (supported.length > 1) {
      notice.value = {
        kind: 'success',
        message: text('检测到多个可用协议，请在识别结果中选择一个应用。', 'Multiple supported protocols detected; choose one in the result panel.'),
      };
    } else {
      notice.value = {
        kind: 'error',
        message: response.models.length
          ? text('未识别出可用协议，请检查 Base URL、Key 或模型权限。', 'No supported protocol was detected; check Base URL, key, or model access.')
          : text('未读取到模型列表。请手动填写模型名称后再次识别。', 'No model list was found. Enter a model name and detect again.'),
      };
    }
  } catch (error) {
    detectError.value = error instanceof Error ? error.message : text('自动识别失败', 'Auto-detect failed');
    notice.value = {
      kind: 'error',
      message: detectError.value,
    };
  } finally {
    detectBusy.value = false;
  }
}

async function refreshModelCatalogFromProvider(): Promise<void> {
  if (!draft.baseUrl.trim()) {
    notice.value = { kind: 'error', message: text('先填写 Base URL。', 'Enter Base URL first.') };
    return;
  }
  modelCatalogRefreshBusy.value = true;
  notice.value = null;
  try {
    const response = await detectModelGatewayProvider({
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim() || null,
      model: draft.defaultModel.trim() || draftModelIds.value[0] || undefined,
      timeoutMs: 20000,
    });
    detectResult.value = response;
    detectError.value = null;
    if (!response.models.length) {
      notice.value = {
        kind: 'error',
        message: text('未从上游读取到模型目录，保留当前配置。', 'No upstream model catalog was found; current config was kept.'),
      };
      return;
    }
    const result = mergeDetectedModels(response.models);
    notice.value = {
      kind: 'success',
      message: text(
        `模型目录已刷新：新增 ${result.added}，补齐 ${result.updated}，保留 ${result.kept}。`,
        `Model catalog refreshed: ${result.added} added, ${result.updated} filled, ${result.kept} kept.`,
      ),
    };
  } catch (error) {
    detectError.value = error instanceof Error ? error.message : text('模型目录刷新失败', 'Model catalog refresh failed');
    notice.value = {
      kind: 'error',
      message: detectError.value,
    };
  } finally {
    modelCatalogRefreshBusy.value = false;
  }
}

async function refreshProviderAccountNow(account: ModelGatewayAccountEntry): Promise<void> {
  const provider = selectedProviderView.value;
  if (!provider) return;
  const key = accountActionKey(account, 'refresh');
  accountBusy.value = { ...accountBusy.value, [key]: true };
  try {
    const response = await refreshModelGatewayProviderAccount(provider.id, account.id);
    applyProviderView(response.provider);
    notice.value = {
      kind: 'success',
      message: text('账户 token 已刷新。', 'Account token refreshed.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('账户刷新失败', 'Failed to refresh account'),
    };
  } finally {
    accountBusy.value = { ...accountBusy.value, [key]: false };
  }
}

async function toggleProviderAccount(account: ModelGatewayAccountEntry): Promise<void> {
  const provider = selectedProviderView.value;
  if (!provider) return;
  const nextEnabled = !account.enabled || account.state === 'disabled';
  const key = accountActionKey(account, 'toggle');
  accountBusy.value = { ...accountBusy.value, [key]: true };
  try {
    const response = await updateModelGatewayProviderAccount(provider.id, account.id, {
      enabled: nextEnabled,
    });
    applyProviderView(response.provider);
    notice.value = {
      kind: 'success',
      message: nextEnabled
        ? text('账户已启用。', 'Account enabled.')
        : text('账户已停用，路由会跳过它。', 'Account disabled; routing will skip it.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('账户状态更新失败', 'Failed to update account'),
    };
  } finally {
    accountBusy.value = { ...accountBusy.value, [key]: false };
  }
}

async function clearProviderAccountCooldown(account: ModelGatewayAccountEntry): Promise<void> {
  const provider = selectedProviderView.value;
  if (!provider) return;
  const key = accountActionKey(account, 'clear-cooldown');
  accountBusy.value = { ...accountBusy.value, [key]: true };
  try {
    const response = await updateModelGatewayProviderAccount(provider.id, account.id, {
      clearCooldown: true,
    });
    applyProviderView(response.provider);
    notice.value = {
      kind: 'success',
      message: text('账户冷却已清除；下一次路由会重新尝试该账户。', 'Account cooldown cleared; routing will retry this account on the next request.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('清除账户冷却失败', 'Failed to clear account cooldown'),
    };
  } finally {
    accountBusy.value = { ...accountBusy.value, [key]: false };
  }
}

async function saveProviderAccountProxy(account: ModelGatewayAccountEntry, proxyUrl: string | null): Promise<void> {
  const provider = selectedProviderView.value;
  if (!provider) return;
  const key = accountActionKey(account, 'proxy');
  accountBusy.value = { ...accountBusy.value, [key]: true };
  try {
    const response = await updateModelGatewayProviderAccount(provider.id, account.id, {
      proxyUrl,
    });
    applyProviderView(response.provider);
    accountProxyDrafts.value = {
      ...accountProxyDrafts.value,
      [accountProxyKey(response.account)]: response.account.proxyUrl || '',
    };
    notice.value = {
      kind: 'success',
      message: response.account.proxyUrl
        ? text('账户代理已保存。', 'Account proxy saved.')
        : text('账户已切回直连/继承 provider。', 'Account switched back to direct/provider fallback.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('账户代理保存失败', 'Failed to save account proxy'),
    };
  } finally {
    accountBusy.value = { ...accountBusy.value, [key]: false };
  }
}

async function saveProviderAccountProxyDraft(account: ModelGatewayAccountEntry): Promise<void> {
  await saveProviderAccountProxy(account, accountProxyDraftValue(account).trim() || null);
}

async function clearProviderAccountProxy(account: ModelGatewayAccountEntry): Promise<void> {
  accountProxyDrafts.value = {
    ...accountProxyDrafts.value,
    [accountProxyKey(account)]: '',
  };
  await saveProviderAccountProxy(account, null);
}

function clearCodexLoginTimer(): void {
  if (!codexLoginTimer) return;
  window.clearTimeout(codexLoginTimer);
  codexLoginTimer = null;
}

function scheduleCodexLoginPoll(): void {
  clearCodexLoginTimer();
  const intervalSeconds = Math.max(1, codexLoginStart.value?.pollIntervalSeconds || 5);
  codexLoginTimer = window.setTimeout(() => {
    void pollCodexAccountLoginOnce(true);
  }, intervalSeconds * 1000);
}

async function startCodexAccountLoginFlow(options: { providerId?: string; providerName?: string } = {}): Promise<void> {
  codexLoginBusy.value = true;
  clearCodexLoginTimer();
  codexLoginPoll.value = null;
  try {
    const response = await startModelGatewayCodexAccountLogin({
      providerId: options.providerId || 'codex-account',
      providerName: options.providerName || 'Codex Account',
      setActiveScopes: ['codex', 'claude-code', 'opencode', 'openclaw'],
    });
    codexLoginStart.value = response;
    notice.value = {
      kind: 'success',
      message: text('Codex 登录已开始，请点击卡片里的官方授权按钮并输入验证码。', 'Codex login started. Use the authorization button in the card and enter the code.'),
    };
    scheduleCodexLoginPoll();
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Codex 登录启动失败', 'Failed to start Codex login'),
    };
  } finally {
    codexLoginBusy.value = false;
  }
}

async function pollCodexAccountLoginOnce(auto = false): Promise<void> {
  if (!codexLoginStart.value) return;
  codexLoginBusy.value = true;
  try {
    const response = await pollModelGatewayCodexAccountLogin({
      loginId: codexLoginStart.value.loginId,
    });
    codexLoginPoll.value = response;
    if (response.status === 'pending') {
      if (auto) scheduleCodexLoginPoll();
      return;
    }
    clearCodexLoginTimer();
    if (response.status === 'completed' && response.provider) {
      const providersResponse = await fetchModelGatewayProviders();
      applyProviderResponse(providersResponse);
      editProvider(response.provider);
      smokeProviderId.value = response.provider.id;
      smokeModel.value = response.provider.models.defaultModel || response.provider.models.models[0]?.id || '';
      notice.value = {
        kind: 'success',
        message: text('Codex 账户已接入 Gateway provider。', 'Codex account connected as a Gateway provider.'),
      };
      return;
    }
    notice.value = {
      kind: 'error',
      message: response.message || text('Codex 登录未完成，请重新开始。', 'Codex login did not complete. Start again.'),
    };
  } catch (error) {
    if (auto) scheduleCodexLoginPoll();
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Codex 登录检查失败', 'Failed to check Codex login'),
    };
  } finally {
    codexLoginBusy.value = false;
  }
}

async function loadAll(): Promise<void> {
  loading.value = true;
  notice.value = null;
  try {
    const [nextStatus, nextProviders, nextRuntime, nextUsageLedger, nextDaemon, nextClientAuth, nextAppConnections] = await Promise.all([
      fetchModelGatewayStatus(),
      fetchModelGatewayProviders(),
      fetchModelGatewayRuntime(),
      fetchModelGatewayUsageLedger(),
      fetchModelGatewayDaemonService(),
      fetchModelGatewayClientAuth(),
      fetchModelGatewayAppConnections(),
    ]);
    status.value = nextStatus;
    runtime.value = nextRuntime;
    usageLedger.value = nextUsageLedger;
    daemonService.value = nextDaemon;
    applyClientAuthView(nextClientAuth.clientAuth);
    appConnections.value = nextAppConnections.connections;
    assignAppConnectionProfile(nextAppConnections.profile);
    appConnectionAvailableModels.value = nextAppConnections.availableModels;
    applyProviderResponse(nextProviders);
    applyAppConnectionModelBudget(false);
    ensureSelectedProvider();
    applyRouteWorkspaceSelection();
    loaded.value = true;
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('加载 Studio Gateway 失败', 'Failed to load Studio Gateway'),
    };
  } finally {
    loading.value = false;
  }
}

async function refreshUsageLedger(): Promise<void> {
  usageBusy.value = true;
  notice.value = null;
  try {
    usageLedger.value = await fetchModelGatewayUsageLedger();
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('模型消耗刷新失败', 'Failed to refresh usage'),
    };
  } finally {
    usageBusy.value = false;
  }
}

async function refreshAppConnections(): Promise<void> {
  try {
    const response = await fetchModelGatewayAppConnections();
    appConnections.value = response.connections;
    assignAppConnectionProfile(response.profile);
    appConnectionAvailableModels.value = response.availableModels;
    applyAppConnectionModelBudget(false);
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('客户端连接刷新失败', 'Failed to refresh client connections'),
    };
  }
}

async function saveAppConnectionProfile(): Promise<void> {
  appConnectionProfileBusy.value = true;
  notice.value = null;
  try {
    const response = await updateModelGatewayAppConnectionProfile(appConnectionProfilePayload());
    assignAppConnectionProfile(response.profile);
    appConnections.value = response.connections;
    notice.value = {
      kind: 'success',
      message: text('连接 Profile 已保存，预览已更新。', 'Connection profile saved; previews were updated.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('连接 Profile 保存失败', 'Failed to save connection profile'),
    };
  } finally {
    appConnectionProfileBusy.value = false;
  }
}

async function applyAllAppConnectionConfigs(): Promise<void> {
  appConnectionApplyAllBusy.value = true;
  notice.value = null;
  try {
    const result = await applyAllModelGatewayAppConnections(appConnectionProfilePayload());
    await refreshAppConnections();
    notice.value = {
      kind: 'success',
      message: text(`已应用 ${result.applied.length} 个客户端配置。`, `${result.applied.length} client configs applied.`),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('全部客户端配置应用失败', 'Failed to apply all client configs'),
    };
  } finally {
    appConnectionApplyAllBusy.value = false;
  }
}

async function applyAppConnectionConfig(appId: ModelGatewayAppConnectionId): Promise<void> {
  appConnectionBusy.value = {
    ...appConnectionBusy.value,
    [appId]: true,
  };
  notice.value = null;
  try {
    const result = await applyModelGatewayAppConnection(appId, appConnectionProfilePayload());
    await refreshAppConnections();
    notice.value = {
      kind: 'success',
      message: result.backupPath
        ? text('配置已应用，原文件已备份。', 'Config applied; existing file was backed up.')
        : text('配置已应用。', 'Config applied.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('客户端连接应用失败', 'Failed to apply client connection'),
    };
  } finally {
    appConnectionBusy.value = {
      ...appConnectionBusy.value,
      [appId]: false,
    };
  }
}

async function rollbackAppConnectionConfig(appId: ModelGatewayAppConnectionId): Promise<void> {
  appConnectionBusy.value = {
    ...appConnectionBusy.value,
    [appId]: true,
  };
  notice.value = null;
  try {
    const result = await rollbackModelGatewayAppConnection(appId);
    await refreshAppConnections();
    notice.value = {
      kind: 'success',
      message: result.restoredFrom
        ? text('已回滚到最近备份。', 'Rolled back to the latest backup.')
        : text('回滚完成。', 'Rollback complete.'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('客户端配置回滚失败', 'Failed to roll back client config'),
    };
  } finally {
    appConnectionBusy.value = {
      ...appConnectionBusy.value,
      [appId]: false,
    };
  }
}

function applyClientAuthView(next: ModelGatewayClientAuthView): void {
  clientAuth.value = next;
  clientAuthEnabled.value = next.enabled;
  clientKeyDraft.value = '';
}

function ensureSelectedProvider(): void {
  if (!providers.value.length) return;
  if (!smokeProviderId.value || !providers.value.some((provider) => provider.id === smokeProviderId.value)) {
    const activeId = activeProviders.value.codex || activeProviders.value['claude-code'] || providers.value[0]?.id || '';
    smokeProviderId.value = activeId;
  }
  const provider = selectedSmokeProvider.value;
  if (provider && !smokeModel.value) {
    smokeModel.value = provider.models.defaultModel || provider.models.models[0]?.id || '';
  }
}

async function saveClientKey(): Promise<void> {
  clientAuthBusy.value = true;
  notice.value = null;
  clientAuthReveal.value = '';
  try {
    const result = await updateModelGatewayClientAuth({
      enabled: clientAuthEnabled.value,
      ...(clientKeyDraft.value.trim() ? { apiKey: clientKeyDraft.value.trim() } : {}),
    });
    applyClientAuthView(result.clientAuth);
    clientAuthReveal.value = result.revealedKey || '';
    await refreshAppConnections();
    notice.value = {
      kind: 'success',
      message: text('Gateway key 已更新', 'Gateway key updated'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Gateway key 更新失败', 'Failed to update Gateway key'),
    };
  } finally {
    clientAuthBusy.value = false;
  }
}

async function generateClientKey(): Promise<void> {
  clientAuthBusy.value = true;
  notice.value = null;
  clientAuthReveal.value = '';
  try {
    const result = await updateModelGatewayClientAuth({ enabled: true, generate: true });
    applyClientAuthView(result.clientAuth);
    clientAuthReveal.value = result.revealedKey || '';
    await refreshAppConnections();
    notice.value = {
      kind: 'success',
      message: text('已生成新的 Gateway key', 'Generated a new Gateway key'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Gateway key 生成失败', 'Failed to generate Gateway key'),
    };
  } finally {
    clientAuthBusy.value = false;
  }
}

async function disableClientKey(): Promise<void> {
  clientAuthBusy.value = true;
  notice.value = null;
  clientAuthReveal.value = '';
  try {
    const result = await updateModelGatewayClientAuth({ enabled: false });
    applyClientAuthView(result.clientAuth);
    await refreshAppConnections();
    notice.value = {
      kind: 'success',
      message: text('Gateway client 鉴权已停用', 'Gateway client auth disabled'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Gateway key 停用失败', 'Failed to disable Gateway key'),
    };
  } finally {
    clientAuthBusy.value = false;
  }
}

async function runDaemonAction(action: ModelGatewayDaemonServiceAction): Promise<void> {
  daemonBusy.value = true;
  notice.value = null;
  const shouldApply = action === 'install'
    || action === 'ensure-running'
    || action === 'start'
    || action === 'restart';
  try {
    const result = await manageModelGatewayDaemonService(action, {
      apply: shouldApply,
      runCommands: action !== 'preview',
      allowBootstrap: action === 'ensure-running',
    });
    daemonActionResult.value = result;
    daemonService.value = result;
    await loadAll();
    notice.value = {
      kind: 'success',
      message: text('daemon service 操作已返回结果', 'Daemon service action returned a result'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('daemon service 操作失败', 'Daemon service action failed'),
    };
  } finally {
    daemonBusy.value = false;
  }
}

async function saveProvider(): Promise<void> {
  if (!canSaveProvider.value) return;
  busy.value = true;
  notice.value = null;
  const models = normalizedDraftModels();
  const selectedAccountProvider = selectedProviderView.value?.accountProvider || null;
  const accountMaxConcurrentPerAccount = parsePositiveDraftInteger(draft.accountMaxConcurrentPerAccount);
  const provider: ModelGatewayProviderInput = {
    id: draft.id.trim(),
    name: draft.name.trim(),
    enabled: draft.enabled,
    category: draft.category,
    appScopes: selectedScopes(),
    baseUrl: draft.baseUrl.trim(),
    apiFormat: draft.apiFormat,
    authStrategy: draft.authStrategy,
    failover: {
      enabled: true,
      priority: Number.isFinite(draft.priority) ? Math.max(0, Math.floor(draft.priority)) : 100,
      maxRetries: 1,
    },
    models: {
      defaultModel: models.defaultModel,
      models: models.models,
      aliases: {},
    },
    endpoints: buildEndpointOverrides(),
    endpointProfiles: endpointRowsToInputs(draft.endpointRows),
    network: {
      proxyUrl: draft.proxyUrl.trim() || null,
      noProxy: parseNoProxy(draft.noProxy),
    },
    ...(selectedAccountProvider
      ? {
        sourceType: 'account-backed',
        accountProvider: {
          kind: selectedAccountProvider.kind,
          routing: {
            strategy: MODEL_GATEWAY_ACCOUNT_ROUTING_STRATEGIES.includes(draft.accountRoutingStrategy)
              ? draft.accountRoutingStrategy
              : 'round-robin',
            sessionAffinity: draft.accountSessionAffinity,
            maxConcurrentPerAccount: accountMaxConcurrentPerAccount,
          },
        },
      }
      : {}),
    metadata: {
      importedFrom: draft.templateId || undefined,
    },
  };
  const payload: ModelGatewayUpsertProviderRequest = {
    provider,
    ...(draft.apiKey.trim() ? { secret: { apiKey: draft.apiKey.trim() } } : {}),
  };
  try {
    await upsertModelGatewayProvider(payload);
    const response = await fetchModelGatewayProviders();
    const previousActiveProviders = { ...activeProviders.value };
    applyProviderResponse(response);
    smokeProviderId.value = provider.id || smokeProviderId.value;
    smokeModel.value = models.defaultModel || smokeModel.value;
    draft.apiKey = '';
    await refreshAppConnections();
    const clearedScopes = appScopeOptions
      .map((scope) => scope.id)
      .filter((scope) => previousActiveProviders[scope] === provider.id && activeProviders.value[scope] !== provider.id);
    notice.value = {
      kind: 'success',
      message: clearedScopes.length
        ? text(
          `Provider 已保存；已从 ${clearedScopes.join(', ')} 的固定路由移除并回到自动选择。`,
          `Provider saved; fixed routing was removed for ${clearedScopes.join(', ')} and now uses Auto.`,
        )
        : text('Provider 已保存', 'Provider saved'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Provider 保存失败', 'Provider save failed'),
    };
  } finally {
    busy.value = false;
  }
}

async function removeProvider(providerId: string): Promise<void> {
  if (!providerId) return;
  if (!window.confirm(text(`删除 provider ${providerId}？`, `Delete provider ${providerId}?`))) return;
  busy.value = true;
  try {
    const response = await deleteModelGatewayProvider(providerId);
    applyProviderResponse(response);
    resetDraft();
    ensureSelectedProvider();
    await refreshAppConnections();
    notice.value = {
      kind: 'success',
      message: text('Provider 已删除', 'Provider deleted'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Provider 删除失败', 'Provider delete failed'),
    };
  } finally {
    busy.value = false;
  }
}

function activeProviderForScope(scope: ModelGatewayAppScope): string {
  return activeProviders.value[scope] || '';
}

function providersForScope(scope: ModelGatewayAppScope): ModelGatewayProviderView[] {
  return providers.value.filter((provider) => provider.enabled && provider.appScopes.includes(scope));
}

async function updateActiveProvider(scope: ModelGatewayAppScope, event: Event): Promise<void> {
  const providerId = (event.target as HTMLSelectElement).value || null;
  busy.value = true;
  notice.value = null;
  try {
    const response = await setModelGatewayActiveProvider({ scope, providerId });
    applyProviderResponse(response);
    await refreshAppConnections();
    notice.value = {
      kind: 'success',
      message: text('路由已更新', 'Route updated'),
    };
    await runActiveRouteSmoke(scope, { quiet: true });
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('路由更新失败', 'Route update failed'),
    };
  } finally {
    busy.value = false;
  }
}

async function runActiveRouteSmoke(
  scope: ModelGatewayAppScope,
  options: { quiet?: boolean } = {},
): Promise<void> {
  const route = activeRouteStatusForScope(scope);
  if (!route?.resolvedProviderId) return;
  activeRouteSmokeBusy.value = {
    ...activeRouteSmokeBusy.value,
    [scope]: true,
  };
  activeRouteSmokeResults.value = {
    ...activeRouteSmokeResults.value,
    [scope]: null,
  };
  if (!options.quiet) notice.value = null;
  try {
    const response = await smokeModelGatewayActiveRoute({
      scope,
      model: route.resolvedModel || undefined,
      input: 'Reply with GATEWAY_OK',
      timeoutMs: 60000,
    });
    activeRouteSmokeResults.value = {
      ...activeRouteSmokeResults.value,
      [scope]: response,
    };
    smokeProviderId.value = route.resolvedProviderId;
    smokeRouteId.value = route.routeId;
    smokeModel.value = route.resolvedModel || smokeModel.value;
    smokeResult.value = response;
    await loadRuntimeOnly();
    if (!options.quiet) {
      notice.value = {
        kind: response.ok ? 'success' : 'error',
        message: response.ok ? text('路由 smoke 通过', 'Route smoke passed') : text('路由 smoke 失败', 'Route smoke failed'),
      };
    }
  } catch (error) {
    activeRouteSmokeResults.value = {
      ...activeRouteSmokeResults.value,
      [scope]: null,
    };
    if (!options.quiet) {
      notice.value = {
        kind: 'error',
        message: error instanceof Error ? error.message : text('路由 smoke 失败', 'Route smoke failed'),
      };
    }
  } finally {
    activeRouteSmokeBusy.value = {
      ...activeRouteSmokeBusy.value,
      [scope]: false,
    };
  }
}

async function runSmoke(): Promise<void> {
  if (!smokeProviderId.value) return;
  smokeBusy.value = true;
  smokeResult.value = null;
  notice.value = null;
  try {
    const response = await testModelGatewayProvider(smokeProviderId.value, {
      routeId: smokeRouteId.value,
      model: smokeModel.value || selectedSmokeProvider.value?.models.defaultModel || undefined,
      input: smokeInput.value,
      timeoutMs: 60000,
    });
    smokeResult.value = response;
    await loadRuntimeOnly();
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Smoke 运行失败', 'Smoke failed'),
    };
  } finally {
    smokeBusy.value = false;
  }
}

async function smokeEndpointProfile(profile: EndpointProfileRow): Promise<void> {
  const providerId = draft.id.trim();
  const endpointProfileId = profile.id.trim();
  if (!providerId || !endpointProfileId) return;
  endpointSmokeBusy.value = {
    ...endpointSmokeBusy.value,
    [endpointProfileId]: true,
  };
  endpointSmokeResults.value = {
    ...endpointSmokeResults.value,
    [endpointProfileId]: null,
  };
  notice.value = null;
  try {
    const response = await testModelGatewayProvider(providerId, {
      endpointProfileId,
      routeId: defaultRouteForApiFormat(profile.apiFormat),
      model: draft.defaultModel.trim() || draftModelIds.value[0] || undefined,
      input: smokeInput.value || 'Reply with GATEWAY_OK',
      timeoutMs: 60000,
    });
    endpointSmokeResults.value = {
      ...endpointSmokeResults.value,
      [endpointProfileId]: response,
    };
    smokeProviderId.value = providerId;
    smokeRouteId.value = defaultRouteForApiFormat(profile.apiFormat);
    smokeModel.value = draft.defaultModel || smokeModel.value;
    smokeResult.value = response;
    await loadRuntimeOnly();
    notice.value = {
      kind: response.ok ? 'success' : 'error',
      message: response.ok ? text('Endpoint smoke 通过', 'Endpoint smoke passed') : text('Endpoint smoke 失败', 'Endpoint smoke failed'),
    };
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('Endpoint smoke 失败', 'Endpoint smoke failed'),
    };
  } finally {
    endpointSmokeBusy.value = {
      ...endpointSmokeBusy.value,
      [endpointProfileId]: false,
    };
  }
}

async function runVisionSmoke(): Promise<void> {
  if (!smokeProviderId.value) return;
  visionSmokeBusy.value = true;
  visionSmokeResult.value = null;
  notice.value = null;
  try {
    const response = await testModelGatewayProvider(smokeProviderId.value, {
      kind: 'vision',
      routeId: smokeRouteId.value,
      model: smokeModel.value || selectedSmokeProvider.value?.models.defaultModel || undefined,
      timeoutMs: 60000,
    });
    visionSmokeResult.value = response;
    await loadRuntimeOnly();
  } catch (error) {
    notice.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : text('图片 smoke 运行失败', 'Vision smoke failed'),
    };
  } finally {
    visionSmokeBusy.value = false;
  }
}

function visionSmokeMessage(result: ModelGatewayProviderTestResponse): string {
  if (result.ok) {
    const observed = result.responsePreview ? `\n${result.responsePreview}` : '';
    return `${text('识别通过。需要启用图片输入时，再到模型能力里勾选“图片”并保存。', 'Vision verified. Enable the Vision capability on this model only if you want image input enabled.')}${observed}`;
  }
  return result.error?.message
    || text('图片能力未通过；不要写回 vision，请检查所选协议、endpoint 或模型。', 'Vision failed; do not write back vision. Check the selected protocol, endpoint, or model.');
}

async function loadRuntimeOnly(): Promise<void> {
  try {
    const [nextRuntime, nextUsageLedger] = await Promise.all([
      fetchModelGatewayRuntime(),
      fetchModelGatewayUsageLedger(),
    ]);
    runtime.value = nextRuntime;
    usageLedger.value = nextUsageLedger;
  } catch {
    // Runtime refresh is secondary to the smoke result.
  }
}

function apiFormatLabel(format: ModelGatewayApiFormat): string {
  return apiFormatOptions.find((item) => item.id === format)?.label || format;
}

function scopeHint(scope: ModelGatewayAppScope): string {
  if (scope === 'codex') return '/v1/responses';
  if (scope === 'claude-code') return '/v1/messages';
  if (scope === 'opencode') return '/v1/chat/completions';
  return '/v1/chat/completions';
}

function formatTimestamp(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

watch(selectedSmokeProvider, (provider) => {
  if (!provider) return;
  if (!smokeModel.value) {
    smokeModel.value = provider.models.defaultModel || provider.models.models[0]?.id || '';
  }
});

watch(() => appConnectionProfile.model, () => {
  applyAppConnectionModelBudget(false);
});

watch(
  () => [route.query.tab, route.query.app],
  () => {
    applyRouteWorkspaceSelection();
  },
);

onMounted(loadAll);
onActivated(loadAll);
onUnmounted(clearCodexLoginTimer);
</script>
