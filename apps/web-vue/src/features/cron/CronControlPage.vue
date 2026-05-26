<template>
  <section class="page-shell cron-page operate-workspace-shell">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">{{ pageEyebrow }}</p>
        <h2 class="page-title">{{ pageTitle }}</h2>
        <p class="page-copy">{{ pageCopy }}</p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="summaryLoading" @click="refreshSummary()">
          {{ summaryLoading ? text('刷新中...', 'Refreshing...') : text('刷新数据', 'Refresh Data') }}
        </button>
        <button type="button" class="primary-button" @click="openCreateModal">
          {{ text('新增任务', 'Add Job') }}
        </button>
      </div>
    </header>

    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-else-if="noticeMessage" class="status-banner" :class="noticeMessage.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ noticeMessage.text }}
    </div>

    <section class="cron-workbench">
      <aside class="cron-sidebar operate-resource-rail mobile-resource-drawer">
        <article class="cron-sidebar-panel operate-workspace-surface">
          <div class="cron-sidebar-head">
            <div>
              <p class="eyebrow">{{ text('SCHEDULER', 'SCHEDULER') }}</p>
              <h3 class="cron-sidebar-title">{{ jobListTitle }}</h3>
              <p class="panel-muted">
                {{
                  summary
                    ? text(`当前 ${summary.count} 个任务，启用 ${summary.enabledCount} 个。`, `${summary.count} jobs configured, ${summary.enabledCount} enabled.`)
                    : jobListEmptyCopy
                }}
              </p>
            </div>
          </div>

          <div v-if="summary" class="cron-sidebar-summary">
            <span>{{ summary.scheduler.enabled ? text('调度器已启用', 'Scheduler enabled') : text('调度器已禁用', 'Scheduler disabled') }}</span>
            <span>{{ text('Store', 'Store') }} · {{ summary.scheduler.storePath }}</span>
          </div>

          <div class="cron-toolbar-grid">
            <label class="form-field">
              <span class="form-label">{{ text('搜索任务', 'Search jobs') }}</span>
              <input
                v-model="searchQuery"
                class="form-input"
                type="search"
                :placeholder="text('按名称、Agent、计划搜索', 'Search by name, agent, or schedule')"
              />
            </label>

            <label class="form-field">
              <span class="form-label">{{ text('筛选', 'Filter') }}</span>
              <GlassSelect v-model="filterMode" :options="filterOptions" :placeholder="text('全部任务', 'All jobs')" />
            </label>
          </div>

          <div v-if="filteredJobs.length" class="cron-list">
            <button
              v-for="job in filteredJobs"
              :key="job.id"
              type="button"
              class="cron-list-item"
              :class="{ active: job.id === selectedJobId }"
              @click="selectJob(job.id)"
            >
              <div class="cron-list-main">
                <div>
                  <strong>{{ job.name }}</strong>
                  <p>{{ job.id }}</p>
                </div>
                <StatusPill
                  :label="job.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled')"
                  :tone="job.enabled ? 'sage' : 'neutral'"
                />
              </div>

              <div class="cron-list-meta">
                <span>{{ job.schedule.label }}</span>
                <span>{{ job.agentId }}</span>
              </div>

              <div class="cron-list-footer">
                <span class="cron-chip operate-summary-pill">{{ sessionTargetLabel(job.sessionTargetMode) }}</span>
                <span class="cron-chip operate-summary-pill operate-badge">{{ deliveryModeLabel(job.delivery.mode) }}</span>
                <span class="cron-list-note">{{ lastStatusLabel(job.state.lastStatus) }}</span>
              </div>
            </button>
          </div>

          <div v-else-if="summaryLoading" class="empty-inline">{{ text('正在读取任务列表…', 'Loading jobs...') }}</div>
          <div v-else class="empty-inline">{{ text('当前没有匹配的任务。', 'No matching jobs.') }}</div>
        </article>
      </aside>

      <section class="cron-stage operate-stage">
        <div v-if="detailLoading" class="cron-empty-state">{{ text('正在读取任务详情…', 'Loading job details...') }}</div>

        <TabsRoot v-else-if="detail" v-model="activeTab" class="cron-stage-workspace">
          <article class="cron-stage-header operate-workspace-surface">
            <div class="cron-stage-head operate-stage-task-head">
              <div>
                <p class="eyebrow">{{ detail.job.id }}</p>
                <h3 class="cron-stage-title">{{ detail.job.name }}</h3>
                <p class="panel-muted">{{ detail.job.description || text('当前没有描述说明。', 'No description yet.') }}</p>
              </div>

              <div class="cron-stage-facts operate-fact-strip">
                <div class="cron-stage-fact">
                  <span>{{ text('计划', 'Schedule') }}</span>
                  <strong>{{ detail.job.schedule.label }}</strong>
                </div>
                <div class="cron-stage-fact">
                  <span>{{ text('下次运行', 'Next run') }}</span>
                  <strong>{{ formatDate(detail.job.state.nextRunAt) }}</strong>
                </div>
                <div class="cron-stage-fact">
                  <span>{{ text('最近状态', 'Last status') }}</span>
                  <strong>{{ lastStatusLabel(detail.job.state.lastStatus) }}</strong>
                </div>
              </div>
            </div>

            <TabsList class="cron-stage-tabs mobile-stage-tabs" aria-label="Cron workspace tabs">
              <TabsTrigger
                v-for="tab in workspaceTabs"
                :key="tab.id"
                :value="tab.id"
                class="cron-stage-tab"
              >
                <component :is="tab.icon" class="cron-stage-tab-icon" aria-hidden="true" />
                <span>{{ tab.label }}</span>
              </TabsTrigger>
            </TabsList>
          </article>

          <TabsContent value="overview" as-child>
            <article class="cron-stage-panel">
            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('调度概览', 'Scheduler Overview') }}</h3>
                  <p>{{ text('先看计划、会话目标、投递方式和最近运行结果。', 'Start with the schedule, session target, delivery mode, and recent run state.') }}</p>
                </div>
                <div class="page-actions">
                  <button type="button" class="secondary-button compact-button" :disabled="toggleBusy" @click="toggleSelectedJob(!detail.job.enabled)">
                    {{ toggleBusy ? text('处理中...', 'Working...') : detail.job.enabled ? text('禁用任务', 'Disable job') : text('启用任务', 'Enable job') }}
                  </button>
                  <button type="button" class="primary-button compact-button" :disabled="runBusy" @click="runSelectedJob">
                    {{ runBusy ? text('触发中...', 'Running...') : text('立即运行', 'Run now') }}
                  </button>
                </div>
              </div>

              <div class="cron-overview-grid">
                <div class="cron-overview-item">
                  <span>{{ text('Agent', 'Agent') }}</span>
                  <strong>{{ detail.job.agentId }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('会话目标', 'Session target') }}</span>
                  <strong>{{ detail.job.sessionTargetLabel }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('投递方式', 'Delivery') }}</span>
                  <strong>{{ detail.job.delivery.label }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('Wake 模式', 'Wake mode') }}</span>
                  <strong>{{ detail.job.wakeMode }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('最近运行', 'Last run') }}</span>
                  <strong>{{ formatDate(detail.job.state.lastRunAt) }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('连续错误', 'Consecutive errors') }}</span>
                  <strong>{{ detail.job.state.consecutiveErrors }}</strong>
                </div>
              </div>
            </section>

            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('任务内容', 'Task Payload') }}</h3>
                  <p>{{ text('当前任务会在定时触发时把下面的内容送进 Agent 或主会话系统事件。', 'This is what the scheduler sends into the agent or main-session system event when the job fires.') }}</p>
                </div>
              </div>

              <div class="cron-payload-card">
                <div class="cron-payload-meta">
                  <span class="cron-chip operate-summary-pill">{{ payloadKindLabel(detail.job.payload.kind) }}</span>
                  <span v-if="detail.job.payload.thinking" class="cron-chip operate-summary-pill">{{ detail.job.payload.thinking }}</span>
                  <span v-if="detail.job.payload.timeoutSeconds" class="cron-chip operate-summary-pill">{{ detail.job.payload.timeoutSeconds }}s</span>
                  <span v-if="detail.job.payload.model" class="cron-chip operate-summary-pill">{{ detail.job.payload.model }}</span>
                </div>
                <pre class="cron-payload-preview">{{ detail.job.payload.kind === 'systemEvent' ? detail.job.payload.systemEvent : detail.job.payload.message }}</pre>
              </div>
            </section>

            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('调度器设置', 'Scheduler Settings') }}</h3>
                  <p>{{ text('这里显示当前本地 cron store、run log 目录和 session retention。', 'This shows the current local cron store, run-log directory, and session retention settings.') }}</p>
                </div>
              </div>

              <div class="cron-overview-grid">
                <div class="cron-overview-item">
                  <span>Store</span>
                  <strong>{{ detail.scheduler.storePath }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('运行日志', 'Run logs') }}</span>
                  <strong>{{ detail.scheduler.runLogDir }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('会话保留', 'Session retention') }}</span>
                  <strong>{{ detail.scheduler.sessionRetention }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('最大并发', 'Max concurrent runs') }}</span>
                  <strong>{{ detail.scheduler.maxConcurrentRuns ?? text('默认', 'Default') }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('日志大小上限', 'Run log max bytes') }}</span>
                  <strong>{{ detail.scheduler.runLogMaxBytes ?? text('默认', 'Default') }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('日志保留行数', 'Run log keep lines') }}</span>
                  <strong>{{ detail.scheduler.runLogKeepLines ?? text('默认', 'Default') }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('调度器状态', 'Scheduler') }}</span>
                  <strong>{{ detail.scheduler.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('Live jobs', 'Live jobs') }}</span>
                  <strong>{{ detail.scheduler.live.jobs ?? text('未知', 'Unknown') }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('Next wake', 'Next wake') }}</span>
                  <strong>{{ formatDate(detail.scheduler.live.nextWakeAt) }}</strong>
                </div>
              </div>

              <div class="cron-scheduler-callout" :class="{ danger: !!detail.scheduler.live.error }">
                <strong>{{ detail.scheduler.live.source === 'cli' ? text('实时 cron status', 'Live cron status') : text('派生状态', 'Derived status') }}</strong>
                <p>
                  {{
                    detail.scheduler.live.error
                      ? text(`无法直接读取 openclaw cron status：${detail.scheduler.live.error}`, `Unable to read openclaw cron status directly: ${detail.scheduler.live.error}`)
                      : text('当前 live 状态已直接从 `openclaw cron status --json` 获取。', 'The live status was read directly from `openclaw cron status --json`.')
                  }}
                </p>
              </div>

              <div class="cron-overview-grid">
                <div class="cron-overview-item">
                  <span>{{ text('全局 failure alert', 'Global failure alert') }}</span>
                  <strong>{{ detail.scheduler.defaultFailureAlert.enabled ? `${detail.scheduler.defaultFailureAlert.mode} · after ${detail.scheduler.defaultFailureAlert.after ?? 0}` : text('未配置', 'Not configured') }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('全局 failure destination', 'Global failure destination') }}</span>
                  <strong>{{ detail.scheduler.defaultFailureDestination.enabled ? `${detail.scheduler.defaultFailureDestination.mode} · ${detail.scheduler.defaultFailureDestination.to || detail.scheduler.defaultFailureDestination.channel || 'configured'}` : text('未配置', 'Not configured') }}</strong>
                </div>
                <div class="cron-overview-item">
                  <span>{{ text('Webhook Token', 'Webhook Token') }}</span>
                  <strong>{{ detail.scheduler.failureWebhookTokenConfigured ? text('已配置', 'Configured') : text('未配置', 'Not configured') }}</strong>
                </div>
              </div>
            </section>
            </article>
          </TabsContent>

          <TabsContent value="config" as-child>
            <article class="cron-stage-panel">
            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('任务配置', 'Job Configuration') }}</h3>
                  <p>{{ text('这里集中编辑名称、Agent、计划、会话目标和投递设置。', 'Edit the name, agent, schedule, session target, and delivery settings here.') }}</p>
                </div>
                <div class="page-actions">
                  <button type="button" class="secondary-button compact-button" :disabled="saveBusy" @click="resetFormFromDetail(detail)">
                    {{ text('重置改动', 'Reset changes') }}
                  </button>
                  <button type="button" class="primary-button compact-button" :disabled="saveBusy" @click="saveJobChanges">
                    {{ saveBusy ? text('保存中...', 'Saving...') : text('保存任务', 'Save job') }}
                  </button>
                </div>
              </div>

              <div class="cron-form-grid">
                <div class="form-field">
                  <label class="form-label">{{ text('任务名称', 'Job Name') }}</label>
                  <input v-model="editorForm.name" class="form-input" :placeholder="text('例如 每日巡检', 'For example Daily health check')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('Agent', 'Agent') }}</label>
                  <GlassSelect v-model="editorForm.agentId" :options="agentOptions" :placeholder="text('选择 Agent', 'Select agent')" />
                </div>
                <div class="form-field form-field-full">
                  <label class="form-label">{{ text('描述', 'Description') }}</label>
                  <input v-model="editorForm.description" class="form-input" :placeholder="text('说明这条任务解决什么问题', 'Describe what this job is for')" />
                </div>
                <label class="toggle-card form-field-full">
                  <input v-model="editorForm.enabled" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('任务启用状态', 'Job enabled') }}</strong>
                    <span>{{ text('禁用后任务仍保留在 store 中，但不会继续自动触发。', 'Disabling keeps the job in the store but stops automatic scheduling.') }}</span>
                  </div>
                </label>
              </div>
            </section>

            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('执行计划', 'Schedule') }}</h3>
                  <p>{{ text('支持 `cron / every / at` 三种方式。', 'Supports cron expressions, fixed intervals, and one-shot schedules.') }}</p>
                </div>
              </div>

              <div class="cron-form-grid">
                <div class="form-field">
                  <label class="form-label">{{ text('计划类型', 'Schedule Kind') }}</label>
                  <GlassSelect v-model="editorForm.scheduleKind" :options="scheduleKindOptions" :placeholder="text('选择类型', 'Select kind')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('Wake 模式', 'Wake Mode') }}</label>
                  <GlassSelect v-model="editorForm.wakeMode" :options="wakeModeOptions" :placeholder="text('选择模式', 'Select mode')" />
                </div>

                <template v-if="editorForm.scheduleKind === 'cron'">
                  <div class="form-field">
                    <label class="form-label">{{ text('Cron 表达式', 'Cron Expression') }}</label>
                    <input v-model="editorForm.cronExpr" class="form-input" placeholder="0 9 * * *" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('时区', 'Timezone') }}</label>
                    <input v-model="editorForm.timezone" class="form-input" placeholder="Asia/Shanghai" />
                  </div>
                </template>

                <template v-else-if="editorForm.scheduleKind === 'every'">
                  <div class="form-field">
                    <label class="form-label">{{ text('间隔', 'Interval') }}</label>
                    <input v-model="editorForm.every" class="form-input" :placeholder="text('例如 10m / 1h', 'For example 10m / 1h')" />
                  </div>
                </template>

                <template v-else>
                  <div class="form-field">
                    <label class="form-label">{{ text('运行时间', 'Run At') }}</label>
                    <input v-model="editorForm.at" class="form-input" type="datetime-local" />
                  </div>
                </template>

                <div class="form-field">
                  <label class="form-label">{{ text('Stagger', 'Stagger') }}</label>
                  <input v-model="editorForm.stagger" class="form-input" :placeholder="text('例如 30s / 5m', 'For example 30s / 5m')" />
                </div>
              </div>
            </section>

            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('执行上下文', 'Execution Context') }}</h3>
                  <p>{{ text('决定这条任务是跑独立 cron 会话、主会话，还是复用已有会话。', 'Choose whether the job runs in an isolated cron session, the main session, or an existing session.') }}</p>
                </div>
              </div>

              <div class="cron-form-grid">
                <div class="form-field">
                  <label class="form-label">{{ text('Payload 类型', 'Payload Kind') }}</label>
                  <GlassSelect v-model="editorForm.payloadKind" :options="payloadKindOptions" :placeholder="text('选择类型', 'Select kind')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('会话目标', 'Session Target') }}</label>
                  <GlassSelect v-model="editorForm.sessionTargetMode" :options="sessionTargetOptions" :placeholder="text('选择会话', 'Select session target')" />
                </div>
                <div v-if="editorForm.sessionTargetMode === 'existing-session'" class="form-field form-field-full">
                  <label class="form-label">{{ text('已有会话', 'Existing Session') }}</label>
                  <GlassSelect v-model="editorForm.sessionTargetRef" :options="sessionRefOptions" :placeholder="text('选择会话', 'Select session')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('思考级别', 'Thinking') }}</label>
                  <GlassSelect v-model="editorForm.thinking" :options="thinkingOptions" :placeholder="text('默认', 'Default')" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('超时秒数', 'Timeout Seconds') }}</label>
                  <input v-model.number="editorForm.timeoutSeconds" class="form-input" type="number" min="1" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('模型覆盖', 'Model Override') }}</label>
                  <input v-model="editorForm.model" class="form-input" :placeholder="text('可留空跟随 Agent 默认', 'Leave empty to inherit agent defaults')" />
                </div>
                <label class="toggle-card">
                  <input v-model="editorForm.lightContext" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('轻量上下文', 'Light context') }}</strong>
                    <span>{{ text('适合不需要完整 bootstrap 文档的后台任务。', 'Useful for background chores that do not need the full bootstrap document set.') }}</span>
                  </div>
                </label>
                <label class="toggle-card">
                  <input v-model="editorForm.expectFinal" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('等待最终响应', 'Expect final response') }}</strong>
                    <span>{{ text('适合希望等待完整 Agent 收敛结果的任务。', 'Useful when you want the scheduler to wait for the full final response.') }}</span>
                  </div>
                </label>
                <label class="toggle-card">
                  <input v-model="editorForm.deleteAfterRun" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('完成后删除', 'Delete after run') }}</strong>
                    <span>{{ text('适合一次性的提醒或回拨任务。', 'Useful for one-shot reminders and callbacks.') }}</span>
                  </div>
                </label>
                <div class="form-field form-field-full">
                  <label class="form-label">{{ editorForm.payloadKind === 'systemEvent' ? text('系统事件', 'System Event') : text('Agent 消息', 'Agent Message') }}</label>
                  <textarea
                    v-model="payloadText"
                    class="form-textarea"
                    rows="6"
                    :placeholder="editorForm.payloadKind === 'systemEvent' ? text('输入系统事件内容', 'Enter the system event text') : text('输入要发给 Agent 的消息', 'Enter the agent message')"
                  />
                </div>
              </div>
            </section>

            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('结果投递', 'Delivery') }}</h3>
                  <p>{{ text('如果只想安静运行，保持 silent；如果需要把结果投递到聊天渠道，就改成 announce。', 'Keep it silent for background-only runs, or switch to announce when results should be delivered back to chat.') }}</p>
                </div>
              </div>

              <div class="cron-form-grid">
                <div class="form-field">
                  <label class="form-label">{{ text('投递模式', 'Delivery Mode') }}</label>
                  <GlassSelect v-model="editorForm.deliveryMode" :options="deliveryModeOptions" :placeholder="text('选择投递模式', 'Select delivery mode')" />
                </div>
                <template v-if="editorForm.deliveryMode === 'announce'">
                  <div class="form-field">
                    <label class="form-label">{{ text('目标类型', 'Target Type') }}</label>
                    <GlassSelect v-model="editorForm.deliveryTargetType" :options="deliveryTargetTypeOptions" :placeholder="text('选择类型', 'Select type')" />
                  </div>
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('投递目标', 'Delivery Target') }}</label>
                    <GlassSelect v-model="editorForm.deliveryTargetRef" :options="deliveryTargetOptions" :placeholder="text('选择目标', 'Select target')" />
                  </div>
                  <label class="toggle-card">
                    <input v-model="editorForm.deliveryBestEffort" class="form-checkbox" type="checkbox" />
                    <div>
                      <strong>{{ text('尽力投递', 'Best-effort delivery') }}</strong>
                      <span>{{ text('投递失败时不让整个任务判定为失败。', 'Do not fail the entire job when the delivery step fails.') }}</span>
                    </div>
                  </label>
                </template>
                <template v-else-if="editorForm.deliveryMode === 'webhook'">
                  <div class="form-field form-field-full">
                    <label class="form-label">{{ text('Webhook URL', 'Webhook URL') }}</label>
                    <input v-model="editorForm.deliveryTargetRef" class="form-input" :placeholder="text('例如 https://example.com/webhook', 'For example https://example.com/webhook')" />
                    <span class="field-hint">
                      {{
                        detail.scheduler.failureWebhookTokenConfigured
                          ? text('当前全局已配置 `cron.webhookToken`，Webhook 任务会自动带 Bearer Token。', 'A global `cron.webhookToken` is configured, so webhook jobs will automatically send a Bearer token.')
                          : text('当前没有全局 `cron.webhookToken`。如果 webhook 端点需要鉴权，请先在系统配置中补齐。', 'No global `cron.webhookToken` is configured. Add one in system config if the webhook endpoint requires auth.')
                      }}
                    </span>
                  </div>
                </template>
              </div>

              <details class="config-collapsible">
                <summary class="config-collapsible-summary">
                  <strong>{{ text('失败投递目标', 'Failure Destination') }}</strong>
                  <span class="config-collapsible-meta">{{ text('当任务本身执行失败时，允许把失败摘要投递到另一处。', 'When the job itself fails, route the failure summary to a secondary destination.') }}</span>
                </summary>

                <div class="settings-stack settings-stack-spaced">
                  <label class="toggle-card">
                    <input v-model="editorForm.failureDestinationEnabled" class="form-checkbox" type="checkbox" />
                    <div>
                      <strong>{{ text('启用失败投递目标', 'Enable failure destination') }}</strong>
                      <span>{{ text('如果当前任务没有单独设置，将回退到全局 `cron.failureDestination`。', 'When disabled, the job falls back to the global `cron.failureDestination` if configured.') }}</span>
                    </div>
                  </label>

                  <div v-if="editorForm.failureDestinationEnabled" class="cron-form-grid">
                    <div class="form-field">
                      <label class="form-label">{{ text('目标模式', 'Destination Mode') }}</label>
                      <GlassSelect v-model="editorForm.failureDestinationMode" :options="failureAlertModeOptions" :placeholder="text('选择模式', 'Select mode')" />
                    </div>

                    <template v-if="editorForm.failureDestinationMode === 'announce'">
                      <div class="form-field">
                        <label class="form-label">{{ text('频道', 'Channel') }}</label>
                        <input v-model="editorForm.failureDestinationChannel" class="form-input" :placeholder="text('例如 feishu / discord / last', 'For example feishu / discord / last')" />
                      </div>
                      <div class="form-field">
                        <label class="form-label">{{ text('账号', 'Account') }}</label>
                        <input v-model="editorForm.failureDestinationAccountId" class="form-input" :placeholder="text('例如 ops / main', 'For example ops / main')" />
                      </div>
                      <div class="form-field form-field-full">
                        <label class="form-label">{{ text('目标', 'Destination') }}</label>
                        <input v-model="editorForm.failureDestinationTo" class="form-input" :placeholder="text('例如 channel:xxx / 群组ID / 用户ID', 'For example channel:xxx / group id / user id')" />
                      </div>
                    </template>

                    <template v-else>
                      <div class="form-field form-field-full">
                        <label class="form-label">{{ text('Webhook URL', 'Webhook URL') }}</label>
                        <input v-model="editorForm.failureDestinationTo" class="form-input" :placeholder="text('例如 https://example.com/failure-hook', 'For example https://example.com/failure-hook')" />
                      </div>
                    </template>
                  </div>
                </div>
              </details>
            </section>

            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('失败告警', 'Failure Alerts') }}</h3>
                  <p>{{ text('当任务连续失败到达阈值时，额外发出告警。适合高价值的巡检、同步和提醒任务。', 'Emit an extra alert when the job has failed repeatedly. This is useful for high-value health checks, sync jobs, and reminders.') }}</p>
                </div>
              </div>

              <div class="cron-form-grid">
                <label class="toggle-card form-field-full">
                  <input v-model="editorForm.failureAlertEnabled" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('启用失败告警', 'Enable failure alerts') }}</strong>
                    <span>{{ text('默认关闭；打开后可按连续错误次数和冷却时间控制触发频率。', 'Disabled by default. When enabled you can control the alert threshold and cooldown.') }}</span>
                  </div>
                </label>

                <template v-if="editorForm.failureAlertEnabled">
                  <div class="form-field">
                    <label class="form-label">{{ text('告警模式', 'Alert Mode') }}</label>
                    <GlassSelect v-model="editorForm.failureAlertMode" :options="failureAlertModeOptions" :placeholder="text('选择模式', 'Select mode')" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('触发阈值', 'Trigger After') }}</label>
                    <input v-model.number="editorForm.failureAlertAfter" class="form-input" type="number" min="1" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('冷却时间', 'Cooldown') }}</label>
                    <input v-model="editorForm.failureAlertCooldown" class="form-input" :placeholder="text('例如 1h / 30m', 'For example 1h / 30m')" />
                  </div>
                  <template v-if="editorForm.failureAlertMode === 'announce'">
                    <div class="form-field">
                      <label class="form-label">{{ text('告警频道', 'Alert Channel') }}</label>
                      <input v-model="editorForm.failureAlertChannel" class="form-input" :placeholder="text('例如 feishu / discord / last', 'For example feishu / discord / last')" />
                    </div>
                    <div class="form-field">
                      <label class="form-label">{{ text('告警账号', 'Alert Account') }}</label>
                      <input v-model="editorForm.failureAlertAccountId" class="form-input" :placeholder="text('例如 ops / main', 'For example ops / main')" />
                    </div>
                    <div class="form-field form-field-full">
                      <label class="form-label">{{ text('告警目标', 'Alert Destination') }}</label>
                      <input v-model="editorForm.failureAlertTo" class="form-input" :placeholder="text('例如 channel:xxx / 群组ID / 用户ID', 'For example channel:xxx / group id / user id')" />
                    </div>
                  </template>
                  <template v-else>
                    <div class="form-field form-field-full">
                      <label class="form-label">{{ text('告警 Webhook URL', 'Alert Webhook URL') }}</label>
                      <input v-model="editorForm.failureAlertTo" class="form-input" :placeholder="text('例如 https://example.com/webhook', 'For example https://example.com/webhook')" />
                    </div>
                  </template>
                </template>
              </div>
            </section>

            <section class="cron-section danger-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('危险操作', 'Danger Zone') }}</h3>
                  <p>{{ text('删除会直接从 cron store 移除这条任务。', 'Deleting removes this job directly from the cron store.') }}</p>
                </div>
                <button type="button" class="danger-link" :disabled="deleteBusy" @click="confirmDeleteJob">
                  {{ deleteBusy ? text('删除中...', 'Deleting...') : text('删除任务', 'Delete Job') }}
                </button>
              </div>
            </section>
            </article>
          </TabsContent>

          <TabsContent value="runs" as-child>
            <article class="cron-stage-panel">
            <section class="cron-section">
              <div class="cron-section-head">
                <div>
                  <h3>{{ text('运行记录', 'Run History') }}</h3>
                  <p>{{ text('这里优先展示本地 run log，避免依赖 Gateway CLI 才能查看历史。', 'This view reads local run logs first so history is visible even when the Gateway CLI path is unstable.') }}</p>
                </div>
                <div class="page-actions">
                  <button type="button" class="primary-button compact-button" :disabled="runBusy" @click="runSelectedJob">
                    {{ runBusy ? text('触发中...', 'Running...') : text('立即运行', 'Run now') }}
                  </button>
                </div>
              </div>

              <div v-if="manualRunOutput" class="cron-scheduler-callout">
                <strong>{{ text('最近一次手动触发响应', 'Last manual run response') }}</strong>
                <pre class="cron-manual-output">{{ manualRunOutput }}</pre>
              </div>

              <div v-if="detail.runs.length" class="cron-runs-layout">
                <div class="cron-run-list">
                  <button
                    v-for="(run, index) in detail.runs"
                    :key="`${run.ts}-${index}`"
                    type="button"
                    class="cron-run-item"
                    :class="{ active: index === selectedRunIndex }"
                    @click="selectedRunIndex = index"
                  >
                    <div class="cron-run-main">
                      <StatusPill :label="lastStatusLabel(run.status)" :tone="run.status === 'ok' ? 'sage' : run.status === 'error' ? 'accent' : 'neutral'" />
                      <span>{{ formatDate(run.ts) }}</span>
                    </div>
                    <p>{{ run.summaryPreview || run.error || text('没有摘要。', 'No summary.') }}</p>
                  </button>
                </div>

                <div class="cron-run-detail" v-if="selectedRun">
                  <div class="cron-run-meta">
                    <span class="cron-chip operate-summary-pill">{{ lastStatusLabel(selectedRun.status) }}</span>
                    <span class="cron-chip operate-summary-pill" v-if="selectedRun.model">{{ selectedRun.model }}</span>
                    <span class="cron-chip operate-summary-pill" v-if="selectedRun.provider">{{ selectedRun.provider }}</span>
                    <span class="cron-chip operate-summary-pill" v-if="selectedRun.durationMs">{{ selectedRun.durationMs }}ms</span>
                    <span class="cron-chip operate-summary-pill" v-if="selectedRun.totalTokens !== null">{{ selectedRun.totalTokens }} tokens</span>
                  </div>

                  <div class="cron-run-fields">
                    <div class="cron-run-field">
                      <span>{{ text('Session', 'Session') }}</span>
                      <strong>{{ selectedRun.sessionId || selectedRun.sessionKey || text('未记录', 'Unknown') }}</strong>
                    </div>
                    <div class="cron-run-field">
                      <span>{{ text('Delivery', 'Delivery') }}</span>
                      <strong>{{ selectedRun.deliveryStatus || text('未知', 'Unknown') }}</strong>
                    </div>
                    <div class="cron-run-field">
                      <span>{{ text('下次运行', 'Next run') }}</span>
                      <strong>{{ formatDate(selectedRun.nextRunAt) }}</strong>
                    </div>
                  </div>

                  <div class="cron-run-output">
                    <h4>{{ selectedRun.error ? text('错误 / 输出', 'Error / Output') : text('输出摘要', 'Output Summary') }}</h4>
                    <pre>{{ selectedRun.error || selectedRun.summary || text('没有可显示的内容。', 'Nothing to display.') }}</pre>
                  </div>
                </div>
              </div>

              <div v-else class="empty-inline">
                {{ text('当前还没有运行记录。', 'No run history yet.') }}
              </div>
            </section>
            </article>
          </TabsContent>
        </TabsRoot>

        <div v-else class="cron-empty-state">
          {{ text('先在左侧选择一个任务，或者新建一个。', 'Pick a job on the left or create one to get started.') }}
        </div>
      </section>
    </section>

    <Teleport to="body">
      <div v-if="createOpen" class="cron-modal-mask" @click.self="closeCreateModal">
        <div class="cron-modal">
          <div class="cron-modal-head">
            <div>
              <h3>{{ text('新增定时任务', 'Create Cron Job') }}</h3>
              <p>{{ text('先创建一个最小可用任务，再去右侧工作区补充更细的 delivery 和运行参数。', 'Create a minimum viable job first, then refine delivery and runtime details in the main workspace.') }}</p>
            </div>
            <button type="button" class="cron-modal-close" :aria-label="text('关闭', 'Close')" @click="closeCreateModal">
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </div>

          <div class="cron-modal-body">
            <div class="cron-form-grid">
              <div class="form-field">
                <label class="form-label">{{ text('任务名称', 'Job Name') }}</label>
                <input v-model="createForm.name" class="form-input" :placeholder="text('例如 每日巡检', 'For example Daily health check')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('Agent', 'Agent') }}</label>
                <GlassSelect v-model="createForm.agentId" :options="agentOptions" :placeholder="text('选择 Agent', 'Select agent')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('计划类型', 'Schedule Kind') }}</label>
                <GlassSelect v-model="createForm.scheduleKind" :options="scheduleKindOptions" :placeholder="text('选择类型', 'Select kind')" />
              </div>
              <div class="form-field">
                <label class="form-label">{{ text('Wake 模式', 'Wake Mode') }}</label>
                <GlassSelect v-model="createForm.wakeMode" :options="wakeModeOptions" :placeholder="text('选择模式', 'Select mode')" />
              </div>

              <template v-if="createForm.scheduleKind === 'cron'">
                <div class="form-field">
                  <label class="form-label">{{ text('Cron 表达式', 'Cron Expression') }}</label>
                  <input v-model="createForm.cronExpr" class="form-input" placeholder="0 9 * * *" />
                </div>
                <div class="form-field">
                  <label class="form-label">{{ text('时区', 'Timezone') }}</label>
                  <input v-model="createForm.timezone" class="form-input" placeholder="Asia/Shanghai" />
                </div>
              </template>

              <template v-else-if="createForm.scheduleKind === 'every'">
                <div class="form-field">
                  <label class="form-label">{{ text('间隔', 'Interval') }}</label>
                  <input v-model="createForm.every" class="form-input" :placeholder="text('例如 10m / 1h', 'For example 10m / 1h')" />
                </div>
              </template>

              <template v-else>
                <div class="form-field">
                  <label class="form-label">{{ text('运行时间', 'Run At') }}</label>
                  <input v-model="createForm.at" class="form-input" type="datetime-local" />
                </div>
              </template>

              <div class="form-field form-field-full">
                <label class="form-label">{{ text('Agent 消息', 'Agent Message') }}</label>
                <textarea v-model="createForm.message" class="form-textarea" rows="5" :placeholder="text('输入要发给 Agent 的消息', 'Enter the message for the agent')" />
              </div>
            </div>

            <details class="config-collapsible">
              <summary class="config-collapsible-summary">
                <strong>{{ text('高级选项', 'Advanced Options') }}</strong>
                <span class="config-collapsible-meta">{{ text('需要 session target、delivery 或模型覆盖时再展开。', 'Expand only when you need session targets, delivery, or model overrides.') }}</span>
              </summary>

              <div class="settings-stack settings-stack-spaced">
                <div class="cron-form-grid">
                  <div class="form-field">
                    <label class="form-label">{{ text('会话目标', 'Session Target') }}</label>
                    <GlassSelect v-model="createForm.sessionTargetMode" :options="sessionTargetOptions" :placeholder="text('选择会话', 'Select session target')" />
                  </div>
                  <div v-if="createForm.sessionTargetMode === 'existing-session'" class="form-field">
                    <label class="form-label">{{ text('已有会话', 'Existing Session') }}</label>
                    <GlassSelect v-model="createForm.sessionTargetRef" :options="sessionRefOptions" :placeholder="text('选择会话', 'Select session')" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('思考级别', 'Thinking') }}</label>
                    <GlassSelect v-model="createForm.thinking" :options="thinkingOptions" :placeholder="text('默认', 'Default')" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('超时秒数', 'Timeout Seconds') }}</label>
                    <input v-model.number="createForm.timeoutSeconds" class="form-input" type="number" min="1" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('模型覆盖', 'Model Override') }}</label>
                    <input v-model="createForm.model" class="form-input" :placeholder="text('可留空', 'Optional')" />
                  </div>
                  <div class="form-field">
                    <label class="form-label">{{ text('投递模式', 'Delivery Mode') }}</label>
                    <GlassSelect v-model="createForm.deliveryMode" :options="deliveryModeOptions" :placeholder="text('选择投递模式', 'Select delivery mode')" />
                  </div>
                  <template v-if="createForm.deliveryMode === 'announce'">
                    <div class="form-field">
                      <label class="form-label">{{ text('目标类型', 'Target Type') }}</label>
                      <GlassSelect v-model="createForm.deliveryTargetType" :options="deliveryTargetTypeOptions" :placeholder="text('选择类型', 'Select type')" />
                    </div>
                    <div class="form-field form-field-full">
                      <label class="form-label">{{ text('投递目标', 'Delivery Target') }}</label>
                      <GlassSelect v-model="createForm.deliveryTargetRef" :options="deliveryTargetOptionsForCreate" :placeholder="text('选择目标', 'Select target')" />
                    </div>
                  </template>
                  <template v-else-if="createForm.deliveryMode === 'webhook'">
                    <div class="form-field form-field-full">
                      <label class="form-label">{{ text('Webhook URL', 'Webhook URL') }}</label>
                      <input v-model="createForm.deliveryTargetRef" class="form-input" :placeholder="text('例如 https://example.com/webhook', 'For example https://example.com/webhook')" />
                    </div>
                  </template>
                  <label class="toggle-card">
                    <input v-model="createForm.failureAlertEnabled" class="form-checkbox" type="checkbox" />
                    <div>
                      <strong>{{ text('启用失败告警', 'Enable failure alerts') }}</strong>
                      <span>{{ text('先开启，详细的告警字段可在创建后继续编辑。', 'Enable now and refine the alert fields after the job is created.') }}</span>
                    </div>
                  </label>
                </div>
              </div>
            </details>
          </div>

          <div class="cron-modal-foot">
            <button type="button" class="secondary-button" :disabled="createBusy" @click="closeCreateModal">
              {{ text('取消', 'Cancel') }}
            </button>
            <button type="button" class="primary-button" :disabled="createBusy" @click="submitCreateJob">
              {{ createBusy ? text('创建中...', 'Creating...') : text('创建任务', 'Create Job') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import { Activity, History, SlidersHorizontal, X } from '@lucide/vue';
import type { CronDetailPayload, CronJobInput, CronRunSummary, CronSummaryPayload } from '../../../../../types/cron';
import StatusPill from '../../components/StatusPill.vue';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import GlassSelect from '../../shared/components/GlassSelect.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  createCronJob,
  deleteCronJob,
  fetchCronDetail,
  fetchCronSummary,
  runCronJob,
  toggleCronJob,
  updateCronJob,
} from './api';
import {
  buildDefaultCronOverviewRecipe,
  type CronOverviewRecipe,
} from './cron-overview-recipe';
import '../operate/operate-workspace.css';
import './cron-workspace.css';

type CronTab = 'overview' | 'config' | 'runs';

interface NoticeMessage {
  kind: 'success' | 'error';
  text: string;
}

interface CronFormState {
  name: string;
  description: string;
  agentId: string;
  enabled: boolean;
  scheduleKind: 'cron' | 'every' | 'at';
  cronExpr: string;
  timezone: string;
  every: string;
  at: string;
  stagger: string;
  sessionTargetMode: 'isolated' | 'main' | 'existing-session';
  sessionTargetRef: string;
  wakeMode: string;
  payloadKind: 'agentTurn' | 'systemEvent';
  message: string;
  systemEvent: string;
  thinking: string;
  timeoutSeconds: number | null;
  model: string;
  lightContext: boolean;
  expectFinal: boolean;
  deliveryMode: 'silent' | 'announce' | 'webhook';
  deliveryTargetType: 'channelBinding' | 'legacyChannel' | 'directSession';
  deliveryTargetRef: string;
  deliveryBestEffort: boolean;
  failureDestinationEnabled: boolean;
  failureDestinationMode: 'announce' | 'webhook';
  failureDestinationChannel: string;
  failureDestinationAccountId: string;
  failureDestinationTo: string;
  failureAlertEnabled: boolean;
  failureAlertMode: 'announce' | 'webhook';
  failureAlertChannel: string;
  failureAlertAccountId: string;
  failureAlertTo: string;
  failureAlertAfter: number | null;
  failureAlertCooldown: string;
  deleteAfterRun: boolean;
}

const props = defineProps<{
  overviewRecipe?: CronOverviewRecipe;
}>();

const { text } = useLocalePreference();
const { confirm } = useConfirmDialog();
const route = useRoute();
const isCronRouteActive = computed(() => route.path === '/cron' || route.path.startsWith('/cron/'));
let cronPageBootstrapped = false;

const overviewRecipe = computed(() => props.overviewRecipe ?? buildDefaultCronOverviewRecipe(text));
const pageEyebrow = computed(() => overviewRecipe.value.pageEyebrow);
const pageTitle = computed(() => overviewRecipe.value.pageTitle);
const pageCopy = computed(() => overviewRecipe.value.pageCopy);
const jobListTitle = computed(() => overviewRecipe.value.jobListTitle);
const jobListEmptyCopy = computed(() => overviewRecipe.value.jobListEmptyCopy);

const summary = ref<CronSummaryPayload | null>(null);
const detail = ref<CronDetailPayload | null>(null);
const selectedJobId = ref('');
const selectedRunIndex = ref(0);
const activeTab = ref<CronTab>('overview');
const searchQuery = ref('');
const filterMode = ref<'all' | 'enabled' | 'disabled'>('all');
const summaryLoading = ref(false);
const detailLoading = ref(false);
const saveBusy = ref(false);
const createBusy = ref(false);
const toggleBusy = ref(false);
const runBusy = ref(false);
const deleteBusy = ref(false);
const createOpen = ref(false);
const errorMessage = ref('');
const noticeMessage = ref<NoticeMessage | null>(null);
const manualRunOutput = ref('');

const editorForm = reactive<CronFormState>(createBlankForm());
const createForm = reactive<CronFormState>(createBlankForm());

function createBlankForm(): CronFormState {
  return {
    name: '',
    description: '',
    agentId: '',
    enabled: true,
    scheduleKind: 'cron',
    cronExpr: '',
    timezone: 'Asia/Shanghai',
    every: '',
    at: '',
    stagger: '',
    sessionTargetMode: 'isolated',
    sessionTargetRef: '',
    wakeMode: 'now',
    payloadKind: 'agentTurn',
    message: '',
    systemEvent: '',
    thinking: '',
    timeoutSeconds: null,
    model: '',
    lightContext: false,
    expectFinal: false,
    deliveryMode: 'silent',
    deliveryTargetType: 'channelBinding',
    deliveryTargetRef: '',
    deliveryBestEffort: true,
    failureDestinationEnabled: false,
    failureDestinationMode: 'announce',
    failureDestinationChannel: '',
    failureDestinationAccountId: '',
    failureDestinationTo: '',
    failureAlertEnabled: false,
    failureAlertMode: 'announce',
    failureAlertChannel: 'last',
    failureAlertAccountId: '',
    failureAlertTo: '',
    failureAlertAfter: 2,
    failureAlertCooldown: '1h',
    deleteAfterRun: false,
  };
}

const filterOptions = computed(() => [
  { value: 'all', label: text('全部任务', 'All jobs') },
  { value: 'enabled', label: text('仅启用', 'Enabled only') },
  { value: 'disabled', label: text('仅禁用', 'Disabled only') },
]);

const workspaceTabs = computed(() => [
  { id: 'overview' as const, icon: Activity, label: overviewRecipe.value.workspaceTabs.overview },
  { id: 'config' as const, icon: SlidersHorizontal, label: overviewRecipe.value.workspaceTabs.config },
  { id: 'runs' as const, icon: History, label: overviewRecipe.value.workspaceTabs.runs },
]);

const scheduleKindOptions = computed(() => [
  { value: 'cron', label: text('Cron 表达式', 'Cron expression') },
  { value: 'every', label: text('固定间隔', 'Fixed interval') },
  { value: 'at', label: text('单次定时', 'One-shot') },
]);

const wakeModeOptions = computed(() => [
  { value: 'now', label: text('立即唤醒', 'Wake now') },
  { value: 'next-heartbeat', label: text('下次心跳', 'Next heartbeat') },
]);

const payloadKindOptions = computed(() => [
  { value: 'agentTurn', label: text('Agent 消息', 'Agent turn') },
  { value: 'systemEvent', label: text('系统事件', 'System event') },
]);

const sessionTargetOptions = computed(() => [
  { value: 'isolated', label: text('隔离会话', 'Isolated session') },
  { value: 'main', label: text('主会话', 'Main session') },
  { value: 'existing-session', label: text('复用已有会话', 'Existing session') },
]);

const deliveryModeOptions = computed(() => [
  { value: 'silent', label: text('静默运行', 'Silent') },
  { value: 'announce', label: text('投递结果', 'Announce') },
  { value: 'webhook', label: text('Webhook', 'Webhook') },
]);

const deliveryTargetTypeOptions = computed(() => [
  { value: 'channelBinding', label: text('绑定入口', 'Binding target') },
  { value: 'legacyChannel', label: text('旧版频道账号', 'Legacy channel account') },
  { value: 'directSession', label: text('已有会话', 'Existing session') },
]);

const failureAlertModeOptions = computed(() => [
  { value: 'announce', label: text('聊天告警', 'Announce') },
  { value: 'webhook', label: 'Webhook' },
]);

const thinkingOptions = computed(() => [
  { value: '', label: text('默认', 'Default') },
  { value: 'off', label: 'off' },
  { value: 'minimal', label: 'minimal' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'xhigh', label: 'xhigh' },
]);

const filteredJobs = computed(() => {
  let jobs = summary.value?.jobs || [];
  if (filterMode.value === 'enabled') jobs = jobs.filter((job) => job.enabled);
  if (filterMode.value === 'disabled') jobs = jobs.filter((job) => !job.enabled);
  const keyword = searchQuery.value.trim().toLowerCase();
  if (!keyword) return jobs;
  return jobs.filter((job) => {
    return [
      job.name,
      job.id,
      job.agentId,
      job.schedule.label,
      job.delivery.label,
    ].some((field) => String(field || '').toLowerCase().includes(keyword));
  });
});

const selectedRun = computed<CronRunSummary | null>(() => {
  if (!detail.value?.runs.length) return null;
  return detail.value.runs[selectedRunIndex.value] || detail.value.runs[0] || null;
});

const agentOptions = computed(() => {
  return (summary.value?.agents || detail.value?.agents || []).map((agent) => ({
    value: agent.id,
    label: `${agent.name} · ${agent.id}`,
  }));
});

const sessionRefOptions = computed(() => {
  return (detail.value?.sessionTargets || summary.value?.sessionTargets || []).map((session) => ({
    value: session.key,
    label: session.label,
  }));
});

const deliveryTargetOptions = computed(() => {
  return buildDeliveryTargetOptions(editorForm.deliveryTargetType);
});

const deliveryTargetOptionsForCreate = computed(() => {
  return buildDeliveryTargetOptions(createForm.deliveryTargetType);
});

const payloadText = computed({
  get() {
    return editorForm.payloadKind === 'systemEvent' ? editorForm.systemEvent : editorForm.message;
  },
  set(value: string) {
    if (editorForm.payloadKind === 'systemEvent') editorForm.systemEvent = value;
    else editorForm.message = value;
  },
});

function buildDeliveryTargetOptions(type: 'channelBinding' | 'legacyChannel' | 'directSession') {
  const items = detail.value?.deliveryTargets || summary.value?.deliveryTargets || [];
  return items
    .filter((item) => item.type === type)
    .map((item) => ({
      value: item.ref,
      label: item.label,
    }));
}

function setNotice(kind: NoticeMessage['kind'], textValue: string): void {
  noticeMessage.value = { kind, text: textValue };
}

function formatDate(value: string | null): string {
  if (!value) return text('暂无', 'None yet');
  return new Date(value).toLocaleString();
}

function lastStatusLabel(status: string | null): string {
  if (!status) return text('未知', 'Unknown');
  const normalized = status.toLowerCase();
  if (normalized === 'ok') return text('成功', 'Success');
  if (normalized === 'never-run') return text('未运行', 'Never run');
  if (normalized === 'error') return text('失败', 'Error');
  return status;
}

function sessionTargetLabel(mode: string): string {
  if (mode === 'isolated') return text('隔离', 'Isolated');
  if (mode === 'main') return text('主会话', 'Main');
  return text('已有会话', 'Existing session');
}

function deliveryModeLabel(mode: string): string {
  if (mode === 'announce') return text('投递', 'Announce');
  if (mode === 'webhook') return 'Webhook';
  return text('静默', 'Silent');
}

function payloadKindLabel(kind: string): string {
  return kind === 'systemEvent' ? text('系统事件', 'System event') : text('Agent 消息', 'Agent turn');
}

function msToDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '';
  if (ms % 86400000 === 0) return `${ms / 86400000}d`;
  if (ms % 3600000 === 0) return `${ms / 3600000}h`;
  if (ms % 60000 === 0) return `${ms / 60000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resetFormFromDetail(payload: CronDetailPayload): void {
  editorForm.name = payload.job.name;
  editorForm.description = payload.job.description;
  editorForm.agentId = payload.job.agentId;
  editorForm.enabled = payload.job.enabled;
  editorForm.scheduleKind = payload.job.schedule.kind;
  editorForm.cronExpr = payload.job.schedule.expr;
  editorForm.timezone = payload.job.schedule.timezone || 'Asia/Shanghai';
  editorForm.every = msToDuration(payload.job.schedule.everyMs);
  editorForm.at = toDateTimeLocal(payload.job.schedule.at);
  editorForm.stagger = msToDuration(payload.job.schedule.staggerMs);
  editorForm.sessionTargetMode = payload.job.sessionTargetMode;
  editorForm.sessionTargetRef = payload.job.sessionTargetRef;
  editorForm.wakeMode = payload.job.wakeMode;
  editorForm.payloadKind = payload.job.payload.kind;
  editorForm.message = payload.job.payload.message;
  editorForm.systemEvent = payload.job.payload.systemEvent;
  editorForm.thinking = payload.job.payload.thinking;
  editorForm.timeoutSeconds = payload.job.payload.timeoutSeconds;
  editorForm.model = payload.job.payload.model;
  editorForm.lightContext = payload.job.payload.lightContext;
  editorForm.expectFinal = payload.job.payload.expectFinal;
  editorForm.deliveryMode = payload.job.delivery.mode;
  editorForm.deliveryTargetType = (payload.job.delivery.targetType || 'channelBinding') as CronFormState['deliveryTargetType'];
  editorForm.deliveryTargetRef = payload.job.delivery.targetRef;
  editorForm.deliveryBestEffort = payload.job.delivery.bestEffort;
  editorForm.failureDestinationEnabled = payload.job.delivery.failureDestination.enabled;
  editorForm.failureDestinationMode = payload.job.delivery.failureDestination.mode;
  editorForm.failureDestinationChannel = payload.job.delivery.failureDestination.channel;
  editorForm.failureDestinationAccountId = payload.job.delivery.failureDestination.accountId;
  editorForm.failureDestinationTo = payload.job.delivery.failureDestination.to;
  editorForm.failureAlertEnabled = payload.job.failureAlert.enabled;
  editorForm.failureAlertMode = payload.job.failureAlert.mode;
  editorForm.failureAlertChannel = payload.job.failureAlert.channel || 'last';
  editorForm.failureAlertAccountId = payload.job.failureAlert.accountId;
  editorForm.failureAlertTo = payload.job.failureAlert.to;
  editorForm.failureAlertAfter = payload.job.failureAlert.after;
  editorForm.failureAlertCooldown = msToDuration(payload.job.failureAlert.cooldownMs);
  editorForm.deleteAfterRun = payload.job.deleteAfterRun;
}

function resetCreateForm(): void {
  const next = createBlankForm();
  Object.assign(createForm, next);
  createForm.timezone = 'Asia/Shanghai';
  createForm.agentId = (summary.value?.agents[0]?.id || 'main');
  createForm.deliveryBestEffort = true;
}

function buildInputFromForm(form: CronFormState): CronJobInput {
  return {
    name: form.name,
    description: form.description,
    agentId: form.agentId,
    enabled: form.enabled,
    scheduleKind: form.scheduleKind,
    cronExpr: form.cronExpr,
    timezone: form.timezone,
    every: form.every,
    at: form.at,
    stagger: form.stagger,
    sessionTargetMode: form.sessionTargetMode,
    sessionTargetRef: form.sessionTargetRef,
    wakeMode: form.wakeMode,
    payloadKind: form.payloadKind,
    message: form.message,
    systemEvent: form.systemEvent,
    thinking: form.thinking,
    timeoutSeconds: form.timeoutSeconds,
    model: form.model,
    lightContext: form.lightContext,
    expectFinal: form.expectFinal,
    deliveryMode: form.deliveryMode,
    deliveryTargetType: form.deliveryMode === 'announce' ? form.deliveryTargetType : '',
    deliveryTargetRef: form.deliveryMode !== 'silent' ? form.deliveryTargetRef : '',
    deliveryBestEffort: form.deliveryBestEffort,
    failureDestinationEnabled: form.failureDestinationEnabled,
    failureDestinationMode: form.failureDestinationMode,
    failureDestinationChannel: form.failureDestinationChannel,
    failureDestinationAccountId: form.failureDestinationAccountId,
    failureDestinationTo: form.failureDestinationTo,
    failureAlertEnabled: form.failureAlertEnabled,
    failureAlertMode: form.failureAlertMode,
    failureAlertChannel: form.failureAlertChannel,
    failureAlertAccountId: form.failureAlertAccountId,
    failureAlertTo: form.failureAlertTo,
    failureAlertAfter: form.failureAlertAfter,
    failureAlertCooldown: form.failureAlertCooldown,
    deleteAfterRun: form.deleteAfterRun,
  };
}

function openCreateModal(): void {
  resetCreateForm();
  createOpen.value = true;
}

function closeCreateModal(): void {
  createOpen.value = false;
}

async function refreshSummary(preferredJobId?: string): Promise<void> {
  if (!isCronRouteActive.value) return;
  summaryLoading.value = true;
  errorMessage.value = '';
  try {
    const payload = await fetchCronSummary();
    if (!isCronRouteActive.value) return;
    summary.value = payload;
    const availableIds = payload.jobs.map((job) => job.id);
    const nextId = preferredJobId && availableIds.includes(preferredJobId)
      ? preferredJobId
      : availableIds.includes(selectedJobId.value)
        ? selectedJobId.value
        : payload.jobs[0]?.id || '';
    if (!nextId) {
      selectedJobId.value = '';
      detail.value = null;
      return;
    }
    await selectJob(nextId);
  } catch (error) {
    if (!isCronRouteActive.value) return;
    errorMessage.value = error instanceof Error ? error.message : text('无法读取定时任务。', 'Failed to load cron jobs.');
  } finally {
    summaryLoading.value = false;
  }
}

async function selectJob(jobId: string): Promise<void> {
  if (!isCronRouteActive.value) return;
  selectedJobId.value = jobId;
  detailLoading.value = true;
  manualRunOutput.value = '';
  try {
    const payload = await fetchCronDetail(jobId);
    if (!isCronRouteActive.value) return;
    detail.value = payload;
    resetFormFromDetail(payload);
    selectedRunIndex.value = 0;
  } catch (error) {
    if (!isCronRouteActive.value) return;
    detail.value = null;
    errorMessage.value = error instanceof Error ? error.message : text('无法读取任务详情。', 'Failed to load cron detail.');
  } finally {
    detailLoading.value = false;
  }
}

async function saveJobChanges(): Promise<void> {
  if (!selectedJobId.value) return;
  saveBusy.value = true;
  try {
    const response = await updateCronJob(selectedJobId.value, buildInputFromForm(editorForm));
    if (response.detail) {
      detail.value = response.detail;
      resetFormFromDetail(response.detail);
      selectedRunIndex.value = 0;
    }
    await refreshSummary(selectedJobId.value);
    setNotice('success', response.message);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('保存任务失败。', 'Failed to save cron job.'));
  } finally {
    saveBusy.value = false;
  }
}

async function submitCreateJob(): Promise<void> {
  createBusy.value = true;
  try {
    const response = await createCronJob(buildInputFromForm(createForm));
    closeCreateModal();
    await refreshSummary(response.detail?.job.id || response.summary.jobs[0]?.id);
    setNotice('success', response.message);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('创建任务失败。', 'Failed to create cron job.'));
  } finally {
    createBusy.value = false;
  }
}

async function toggleSelectedJob(enabled: boolean): Promise<void> {
  if (!selectedJobId.value) return;
  toggleBusy.value = true;
  try {
    const response = await toggleCronJob(selectedJobId.value, enabled);
    if (response.detail) {
      detail.value = response.detail;
      resetFormFromDetail(response.detail);
    }
    await refreshSummary(selectedJobId.value);
    setNotice('success', response.message);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('切换任务状态失败。', 'Failed to toggle cron job.'));
  } finally {
    toggleBusy.value = false;
  }
}

async function runSelectedJob(): Promise<void> {
  if (!selectedJobId.value) return;
  runBusy.value = true;
  try {
    const response = await runCronJob(selectedJobId.value);
    await selectJob(selectedJobId.value);
    manualRunOutput.value = response.output;
    setNotice('success', response.message);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('手动运行失败。', 'Failed to run cron job.'));
  } finally {
    runBusy.value = false;
  }
}

async function confirmDeleteJob(): Promise<void> {
  if (!selectedJobId.value || !detail.value) return;
  const ok = await confirm({
    title: text('确认删除任务', 'Confirm delete job'),
    message: text(`确定删除任务 "${detail.value.job.name}" 吗？`, `Delete job "${detail.value.job.name}"?`),
    confirmText: text('删除任务', 'Delete job'),
    cancelText: text('取消', 'Cancel'),
    tone: 'danger',
  });
  if (!ok) return;
  deleteBusy.value = true;
  try {
    const response = await deleteCronJob(selectedJobId.value);
    selectedJobId.value = '';
    detail.value = null;
    await refreshSummary();
    setNotice('success', response.message);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('删除任务失败。', 'Failed to delete cron job.'));
  } finally {
    deleteBusy.value = false;
  }
}

watch(
  () => editorForm.payloadKind,
  (kind) => {
    if (kind === 'agentTurn') editorForm.systemEvent = '';
    else editorForm.message = '';
  }
);

watch(
  () => createForm.payloadKind,
  (kind) => {
    if (kind === 'agentTurn') createForm.systemEvent = '';
    else createForm.message = '';
  }
);

watch(
  () => editorForm.deliveryMode,
  (mode) => {
    if (mode === 'silent') {
      editorForm.deliveryTargetRef = '';
    }
  }
);

watch(
  () => createForm.deliveryMode,
  (mode) => {
    if (mode === 'silent') {
      createForm.deliveryTargetRef = '';
    }
  }
);

watch(
  () => editorForm.failureDestinationEnabled,
  (enabled) => {
    if (!enabled) {
      editorForm.failureDestinationTo = '';
      editorForm.failureDestinationChannel = '';
      editorForm.failureDestinationAccountId = '';
    }
  }
);

watch(
  () => createForm.failureAlertEnabled,
  (enabled) => {
    if (!enabled) {
      createForm.failureAlertTo = '';
    }
  }
);

watch(
  () => editorForm.failureAlertEnabled,
  (enabled) => {
    if (!enabled) {
      editorForm.failureAlertTo = '';
    }
  }
);

watch(
  () => editorForm.failureDestinationMode,
  (mode) => {
    if (mode === 'announce') return;
    editorForm.failureDestinationChannel = '';
    editorForm.failureDestinationAccountId = '';
  }
);

watch(
  () => editorForm.failureAlertMode,
  (mode) => {
    if (mode === 'announce') return;
    editorForm.failureAlertChannel = '';
    editorForm.failureAlertAccountId = '';
  }
);

function activateCronPage(): void {
  if (!isCronRouteActive.value) return;
  if (cronPageBootstrapped && summary.value) return;
  cronPageBootstrapped = true;
  void refreshSummary();
}

onMounted(activateCronPage);
onActivated(activateCronPage);
</script>
