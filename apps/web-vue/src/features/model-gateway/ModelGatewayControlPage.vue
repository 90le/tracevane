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
              <span>{{ text('请求日志', 'Request log') }}</span>
              <strong>{{ runtimeEntries.length }}</strong>
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
                <input
                  v-model.trim="appConnectionProfile.model"
                  class="form-input"
                  list="mgw-app-connection-models"
                  :placeholder="text('从可用模型列表选择', 'Choose from available models')"
                />
                <datalist id="mgw-app-connection-models">
                  <option v-for="model in appConnectionAvailableModels" :key="model" :value="model" />
                </datalist>
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
            <section v-for="connection in appConnections" :key="connection.id" class="mgw-app-card">
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
                  <span>{{ text('最近备份', 'Latest backup') }}</span>
                  <strong>{{ connection.lastBackupPath || '-' }}</strong>
                </div>
              </div>

              <div v-if="connection.issues.length" class="mgw-app-issues">
                <span v-for="issue in connection.issues" :key="issue">{{ issue }}</span>
              </div>

              <label class="form-field mgw-app-model-field">
                <span class="form-label">{{ text('App 模型', 'App model') }}</span>
                <input
                  v-model.trim="appConnectionProfile.appModels[connection.id]"
                  class="form-input"
                  list="mgw-app-connection-models"
                  :placeholder="text('留空使用默认模型', 'Use default model')"
                />
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
                  <small>{{ apiFormatLabel(provider.apiFormat) }} / {{ provider.models.defaultModel || '-' }}</small>
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
                    <button type="button" class="secondary-button compact-button" @click="addDraftModelRow">
                      <Plus class="mgw-button-icon" />
                      <span>{{ text('添加模型', 'Add model') }}</span>
                    </button>
                  </div>
                  <div class="mgw-model-table" data-testid="gateway-model-capability-list">
                    <div class="mgw-model-table__head">
                      <span>{{ text('模型 ID', 'Model ID') }}</span>
                      <span>{{ text('显示名', 'Display name') }}</span>
                      <span>{{ text('别名', 'Aliases') }}</span>
                      <span>{{ text('能力', 'Capabilities') }}</span>
                      <span></span>
                    </div>
                    <div v-if="draft.modelRows.length === 0" class="mgw-model-empty">
                      {{ text('添加模型，或先填写 Base URL / Key 后点击识别配置。', 'Add a model, or enter Base URL / key and detect the config first.') }}
                    </div>
                    <div v-for="(model, index) in draft.modelRows" :key="model.key" class="mgw-model-row">
                      <input v-model.trim="model.id" class="form-input" placeholder="gpt-5.5" @blur="syncDefaultModelWithList" />
                      <input v-model.trim="model.label" class="form-input" :placeholder="text('可选', 'Optional')" />
                      <input v-model.trim="model.aliases" class="form-input" placeholder="alias1, alias2" />
                      <div class="mgw-model-capabilities" :aria-label="text('模型能力', 'Model capabilities')">
                        <label v-for="capability in modelCapabilityOptions" :key="capability.id" class="mgw-model-capability">
                          <input v-model="model[capability.id]" type="checkbox" />
                          <span>{{ text(capability.zh, capability.en) }}</span>
                        </label>
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
                    </div>
                  </div>
                  <span class="field-hint">{{ text('同一 Provider 内模型 ID 和别名不能重复；不同 Provider 允许同名模型，用于优先级和负载切换。', 'Model IDs and aliases must be unique inside one provider; different providers may share model names for priority and failover routing.') }}</span>
                </div>
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

              <div class="mgw-scope-picker">
                <span class="form-label">{{ text('可用范围', 'Available scopes') }}</span>
                <label v-for="scope in appScopeOptions" :key="scope.id" class="mgw-check">
                  <input v-model="draft.appScopes[scope.id]" type="checkbox" />
                  <span>{{ text(scope.zh, scope.en) }}</span>
                </label>
              </div>

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
            <button type="button" class="primary-button compact-button" :disabled="smokeBusy || !smokeProviderId" @click="runSmoke">
              {{ smokeBusy ? text('测试中...', 'Testing...') : text('运行 smoke', 'Run smoke') }}
            </button>
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

          <div v-if="smokeResult" class="mgw-smoke-result" :class="smokeResult.ok ? 'success' : 'failure'">
            <div>
              <strong>{{ smokeResult.ok ? text('通过', 'Passed') : text('失败', 'Failed') }}</strong>
              <span>{{ smokeResult.statusCode || '-' }} · {{ smokeResult.latencyMs }} ms · {{ smokeResult.route.upstreamUrl || '-' }}</span>
            </div>
            <pre>{{ smokeResult.responsePreview || smokeResult.error?.message || '-' }}</pre>
          </div>

          <div class="mgw-request-log">
            <div class="mgw-log-head">
              <strong>{{ text('最近请求', 'Recent requests') }}</strong>
              <span>{{ runtime?.runtime.updatedAt ? formatTimestamp(runtime.runtime.updatedAt) : '-' }}</span>
            </div>
            <div v-for="entry in runtimeEntries" :key="entry.id" class="mgw-log-row" :class="entry.outcome">
              <span>{{ entry.outcome }}</span>
              <strong>{{ entry.providerName || entry.providerId || '-' }}</strong>
              <small>{{ entry.requestedPath }} · {{ entry.model || '-' }} · {{ entry.durationMs }} ms</small>
            </div>
            <div v-if="!runtimeEntries.length" class="mgw-empty">
              {{ text('暂无请求记录。', 'No request log yet.') }}
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
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue';
import { Plus, Trash2, X } from '@lucide/vue';
import { MODEL_GATEWAY_APP_CONNECTION_IDS } from '../../../../../types/model-gateway';
import type {
  ModelGatewayApiFormat,
  ModelGatewayActiveRouteStatus,
  ModelGatewayAppConnection,
  ModelGatewayAppConnectionId,
  ModelGatewayAppConnectionProfile,
  ModelGatewayAppScope,
  ModelGatewayAuthStrategy,
  ModelGatewayClientAuthView,
  ModelGatewayDaemonServiceAction,
  ModelGatewayDaemonServiceResponse,
  ModelGatewayProviderDetectProtocolResult,
  ModelGatewayProviderDetectResponse,
  ModelGatewayProviderCategory,
  ModelGatewayProviderInput,
  ModelGatewayProviderModel,
  ModelGatewayProviderTestResponse,
  ModelGatewayProviderView,
  ModelGatewayProvidersResponse,
  ModelGatewayRouteId,
  ModelGatewayRuntimeRequestLogEntry,
  ModelGatewayRuntimeResponse,
  ModelGatewayStatusResponse,
  ModelGatewayUpsertProviderRequest,
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
  manageModelGatewayDaemonService,
  rollbackModelGatewayAppConnection,
  setModelGatewayActiveProvider,
  smokeModelGatewayActiveRoute,
  testModelGatewayProvider,
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
};

type ModelCapabilityId = 'text' | 'vision' | 'tools' | 'reasoning' | 'responses' | 'streaming';

type ProviderModelRow = {
  key: string;
  id: string;
  label: string;
  aliases: string;
  text: boolean;
  vision: boolean;
  tools: boolean;
  reasoning: boolean;
  responses: boolean;
  streaming: boolean;
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

type WorkspaceTabId = 'connections' | 'providers' | 'smoke';

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
  { id: 'anthropic_messages', label: 'Anthropic Messages' },
];

const workspaceTabs: Array<{ id: WorkspaceTabId; zh: string; en: string }> = [
  { id: 'connections', zh: '客户端接入', en: 'Client connections' },
  { id: 'providers', zh: 'Provider 配置', en: 'Provider configuration' },
  { id: 'smoke', zh: 'Smoke / 日志', en: 'Smoke / Logs' },
];

const modelCapabilityOptions: Array<{ id: ModelCapabilityId; zh: string; en: string }> = [
  { id: 'text', zh: '文字', en: 'Text' },
  { id: 'vision', zh: '图片', en: 'Vision' },
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
const detectBusy = ref(false);
const activeWorkspaceTab = ref<WorkspaceTabId>('connections');
const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);
const status = ref<ModelGatewayStatusResponse | null>(null);
const runtime = ref<ModelGatewayRuntimeResponse | null>(null);
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
const providers = ref<ModelGatewayProviderView[]>([]);
const activeProviders = ref<Partial<Record<ModelGatewayAppScope, string>>>({});
const activeRouteStatuses = ref<ModelGatewayActiveRouteStatus[]>([]);
const activeRouteAlerts = ref<string[]>([]);
const activeRouteSmokeBusy = ref<Partial<Record<ModelGatewayAppScope, boolean>>>({});
const activeRouteSmokeResults = ref<Partial<Record<ModelGatewayAppScope, ModelGatewayProviderTestResponse | null>>>({});
const smokeProviderId = ref('');
const smokeRouteId = ref<ModelGatewayRouteId>('openai_responses');
const smokeModel = ref('');
const smokeInput = ref('Reply with GATEWAY_OK');
const smokeResult = ref<ModelGatewayProviderTestResponse | null>(null);
const detectResult = ref<ModelGatewayProviderDetectResponse | null>(null);
const detectOverlayOpen = ref(false);
const detectError = ref<string | null>(null);
const appliedProtocolKey = ref('');

const draft = reactive<ProviderDraft>(createEmptyDraft());

const runtimeEntries = computed<ModelGatewayRuntimeRequestLogEntry[]>(() =>
  [...(runtime.value?.runtime.requestLog || [])].reverse().slice(0, 8),
);

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
  const listed = provider.models.models.map((model) => model.id).filter(Boolean);
  const fallback = provider.models.defaultModel ? [provider.models.defaultModel] : [];
  return uniqueStrings([...fallback, ...listed]);
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

function isAppConnectionBusy(appId: ModelGatewayAppConnectionId): boolean {
  return appConnectionBusy.value[appId] === true;
}

function applyProviderResponse(response: ModelGatewayProvidersResponse): void {
  providers.value = response.providers;
  activeProviders.value = response.activeProviders;
  activeRouteStatuses.value = response.activeRoutes;
  activeRouteAlerts.value = response.activeRouteAlerts;
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
}

function parsePositiveDraftInteger(value: string): number | null {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
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
  };
}

function resetDraft(): void {
  Object.assign(draft, createEmptyDraft());
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
  });
  smokeProviderId.value = provider.id;
  smokeModel.value = draft.defaultModel;
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

function createProviderModelRow(model?: ModelGatewayProviderModel): ProviderModelRow {
  const id = model?.id || '';
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id,
    label: model?.label || '',
    aliases: model?.aliases?.join(', ') || '',
    text: model?.features?.text ?? true,
    vision: model?.features?.vision ?? false,
    tools: model?.features?.tools ?? false,
    reasoning: model?.features?.reasoning ?? false,
    responses: model?.features?.responses ?? true,
    streaming: model?.features?.streaming ?? true,
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
    const [rawId, rawLabel, ...aliasParts] = parts;
    const rawAliases = aliasParts.join(',');
    const id = rawId || '';
    if (!id) continue;
    models.push({
      id,
      ...(rawLabel ? { label: rawLabel } : {}),
      ...(rawAliases ? { aliases: parseNoProxy(rawAliases) } : {}),
    });
  }
  return models;
}

function modelRowsFromText(value: string): ProviderModelRow[] {
  return parseModelLines(value).map(createProviderModelRow);
}

function modelRowsToModels(rows: ProviderModelRow[]): ModelGatewayProviderModel[] {
  return rows
    .map((row) => {
      const id = row.id.trim();
      if (!id) return null;
      const aliases = parseNoProxy(row.aliases);
      return {
        id,
        ...(row.label.trim() ? { label: row.label.trim() } : {}),
        ...(aliases.length ? { aliases } : {}),
        features: {
          text: row.text,
          vision: row.vision,
          tools: row.tools,
          reasoning: row.reasoning,
          responses: row.responses,
          streaming: row.streaming,
        },
      } satisfies ModelGatewayProviderModel;
    })
    .filter((model): model is ModelGatewayProviderModel => model !== null);
}

function syncModelTextFromRows(): void {
  draft.modelListText = modelRowsToModels(draft.modelRows).map(formatModelLine).join('\n');
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
  if (aliases) return `${model.id} | ${model.label || ''} | ${aliases}`;
  if (model.label) return `${model.id} | ${model.label}`;
  return model.id;
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
      features: {
        text: true,
        vision: false,
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
  draft.modelRows = models.map(createProviderModelRow);
  draft.modelListText = models.map(formatModelLine).join('\n');
  if (!draft.defaultModel.trim()) {
    draft.defaultModel = models[0]?.id || '';
  }
  if (!smokeModel.value) {
    smokeModel.value = draft.defaultModel;
  }
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

async function loadAll(): Promise<void> {
  loading.value = true;
  notice.value = null;
  try {
    const [nextStatus, nextProviders, nextRuntime, nextDaemon, nextClientAuth, nextAppConnections] = await Promise.all([
      fetchModelGatewayStatus(),
      fetchModelGatewayProviders(),
      fetchModelGatewayRuntime(),
      fetchModelGatewayDaemonService(),
      fetchModelGatewayClientAuth(),
      fetchModelGatewayAppConnections(),
    ]);
    status.value = nextStatus;
    runtime.value = nextRuntime;
    daemonService.value = nextDaemon;
    applyClientAuthView(nextClientAuth.clientAuth);
    appConnections.value = nextAppConnections.connections;
    assignAppConnectionProfile(nextAppConnections.profile);
    appConnectionAvailableModels.value = nextAppConnections.availableModels;
    applyProviderResponse(nextProviders);
    ensureSelectedProvider();
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

async function refreshAppConnections(): Promise<void> {
  try {
    const response = await fetchModelGatewayAppConnections();
    appConnections.value = response.connections;
    assignAppConnectionProfile(response.profile);
    appConnectionAvailableModels.value = response.availableModels;
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
    network: {
      proxyUrl: draft.proxyUrl.trim() || null,
      noProxy: parseNoProxy(draft.noProxy),
    },
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

async function loadRuntimeOnly(): Promise<void> {
  try {
    runtime.value = await fetchModelGatewayRuntime();
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

onMounted(loadAll);
onActivated(loadAll);
</script>
