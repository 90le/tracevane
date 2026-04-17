<template>
  <motion.section class="page-shell dreaming-page" v-bind="pageSurfaceReveal">
    <motion.header class="dreaming-stage" v-bind="pageMastheadReveal">
      <section class="dreaming-stage__scene">
        <div class="dreaming-stage__sky" aria-hidden="true">
          <span class="dreaming-stage__star star-1"></span>
          <span class="dreaming-stage__star star-2"></span>
          <span class="dreaming-stage__star star-3"></span>
          <span class="dreaming-stage__star star-4"></span>
          <span class="dreaming-stage__star star-5"></span>
          <span class="dreaming-stage__star star-6"></span>
          <span class="dreaming-stage__moon"></span>
          <span class="dreaming-stage__moon-ring"></span>
          <span class="dreaming-stage__haze"></span>
          <span class="dreaming-stage__tide"></span>
        </div>

        <div class="dreaming-stage__copy">
          <p class="eyebrow">Dreaming</p>
          <h2 class="page-title">{{ text('梦境记忆工作台', 'Dreaming Memory Workbench') }}</h2>
          <p class="page-copy">
            {{
              text(
                '把 dreaming 从配置卡片里解放出来。这里先看状态、阶段和日记，再决定是否修复、启停或继续扩展。',
                'Pull dreaming out of raw config editing. Start with state, phases, and the diary, then decide whether to repair, toggle, or extend it.'
              )
            }}
          </p>

          <div class="dreaming-stage__statusline" :class="{ live: dreamingEnabled }">
            <span class="dreaming-stage__statusdot" aria-hidden="true"></span>
            <strong>{{ dreamingEnabled ? text('Dreaming Active', 'Dreaming Active') : text('Dreaming Idle', 'Dreaming Idle') }}</strong>
            <span>{{ sceneHeadline }}</span>
          </div>

          <div class="dreaming-stage__band">
            <article
              v-for="stat in stageStats"
              :key="stat.label"
              class="dreaming-band-stat"
            >
              <span>{{ stat.label }}</span>
              <strong>{{ stat.value }}</strong>
            </article>
          </div>
        </div>
      </section>

      <aside class="dreaming-stage__dock">
        <div class="dreaming-stage__dock-head">
          <div>
            <p class="eyebrow">{{ text('Runtime', 'Runtime') }}</p>
            <h3>{{ text('启停与修复', 'Control and Repair') }}</h3>
          </div>
          <span class="dreaming-slot-pill">
            {{ activePluginLabel }}
          </span>
        </div>

        <div class="dreaming-stage__toggle">
          <div class="dreaming-stage__toggle-copy">
            <strong>
              {{ dreamingEnabled ? text('今晚会运行 dreaming cycle', 'Dreaming cycle is armed for tonight') : text('当前不会执行 dreaming cycle', 'Dreaming cycle is currently inactive') }}
            </strong>
            <p>
              {{
                text(
                  '开启时会原子化同步 memory slot、plugin enabled 和 dreaming.enabled，避免再写出半启用状态。',
                  'Enabling applies an atomic patch so the memory slot, plugin enabled state, and dreaming.enabled stay in sync.'
                )
              }}
            </p>
          </div>

          <button
            type="button"
            class="dreaming-toggle-button"
            :class="{ active: dreamingEnabled }"
            :disabled="busy"
            @click="toggleDreamingState(!dreamingEnabled)"
          >
            <span class="dreaming-toggle-button__dot" aria-hidden="true"></span>
            <span>
              {{
                toggleBusy
                  ? text('提交中...', 'Applying...')
                  : dreamingEnabled
                    ? text('关闭 Dreaming', 'Disable Dreaming')
                    : text('开启 Dreaming', 'Enable Dreaming')
              }}
            </span>
          </button>
        </div>

        <div class="dreaming-stage__controls">
          <button type="button" class="secondary-button" :disabled="busy" @click="refreshAll">
            {{ busy ? text('刷新中...', 'Refreshing...') : text('刷新状态', 'Refresh') }}
          </button>
          <button
            v-if="canRepair"
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="repairConfig"
          >
            {{ repairBusy ? text('修复中...', 'Repairing...') : text('自动修复', 'Repair mismatch') }}
          </button>
        </div>

        <div class="dreaming-stage__action-well">
          <div class="dreaming-pane__head compact">
            <div>
              <h4>{{ text('Grounded Replay', 'Grounded Replay') }}</h4>
              <p>
                {{
                  text(
                    '这里接的是 OpenClaw 4.9 官方 Dreams 动作：Backfill、Reset、Clear Grounded。',
                    'These controls call the official OpenClaw 4.9 Dreams actions: Backfill, Reset, and Clear Grounded.'
                  )
                }}
              </p>
            </div>
          </div>

          <div class="dreaming-stage__action-grid">
            <button
              type="button"
              class="secondary-button"
              :disabled="busy"
              @click="runGroundedAction('backfill')"
            >
              {{ groundedActionBusy === 'backfill' ? text('回填中...', 'Backfilling...') : text('Backfill 日记', 'Backfill Diary') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="busy"
              @click="runGroundedAction('reset-diary')"
            >
              {{ groundedActionBusy === 'reset-diary' ? text('重置中...', 'Resetting...') : text('Reset 回填', 'Reset Backfill') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="busy"
              @click="runGroundedAction('clear-grounded')"
            >
              {{ groundedActionBusy === 'clear-grounded' ? text('清理中...', 'Clearing...') : text('Clear Grounded', 'Clear Grounded') }}
            </button>
          </div>
        </div>

        <div class="dreaming-stage__facts">
          <div class="dreaming-stage__fact">
            <span>{{ text('Memory Slot', 'Memory Slot') }}</span>
            <strong>{{ snapshot?.config.slotValue || text('none', 'none') }}</strong>
          </div>
          <div class="dreaming-stage__fact">
            <span>{{ text('Next Sweep', 'Next Sweep') }}</span>
            <strong>{{ nextSweepLabel }}</strong>
          </div>
          <div class="dreaming-stage__fact">
            <span>{{ text('Storage', 'Storage') }}</span>
            <strong>{{ snapshot?.status?.storageMode || '--' }}</strong>
          </div>
          <div class="dreaming-stage__fact">
            <span>{{ text('Timezone', 'Timezone') }}</span>
            <strong>{{ snapshot?.status?.timezone || text('未报告', 'Not reported') }}</strong>
          </div>
        </div>

        <div v-if="feedbackMessage" class="dreaming-stage__notice" :class="{ error: feedbackTone === 'error' }">
          {{ feedbackMessage }}
        </div>
      </aside>
    </motion.header>

    <section class="dreaming-ops-strip">
      <article class="dreaming-inline-panel">
        <div class="dreaming-pane__head compact">
          <div>
            <h4>{{ text('功能操作区', 'Operations') }}</h4>
            <p>
              {{
                text(
                  '这里把当前页面能做的事情直接展开，不需要再去猜 tab 里有没有藏功能。',
                  'All available actions on this page are listed here directly so nothing is hidden behind tabs.'
                )
              }}
            </p>
          </div>
        </div>

        <div class="dreaming-ops-strip__grid">
          <button type="button" class="secondary-button" :disabled="busy" @click="refreshAll">
            {{ busy ? text('刷新中...', 'Refreshing...') : text('刷新状态', 'Refresh State') }}
          </button>
          <button type="button" class="secondary-button" :disabled="busy" @click="refreshDiary">
            {{ diaryBusy ? text('重载中...', 'Reloading...') : text('重载日记', 'Reload Diary') }}
          </button>
          <button type="button" class="secondary-button" :disabled="busy" @click="refreshRemHarnessPreview">
            {{ remHarnessBusy ? text('预览中...', 'Previewing...') : text('Preview REM', 'Preview REM') }}
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="toggleDreamingState(!dreamingEnabled)"
          >
            {{
              toggleBusy
                ? text('提交中...', 'Applying...')
                : dreamingEnabled
                  ? text('关闭 Dreaming', 'Disable Dreaming')
                  : text('开启 Dreaming', 'Enable Dreaming')
            }}
          </button>
          <button
            v-if="canRepair"
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="repairConfig"
          >
            {{ repairBusy ? text('修复中...', 'Repairing...') : text('自动修复', 'Repair Mismatch') }}
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="runGroundedAction('backfill')"
          >
            {{ groundedActionBusy === 'backfill' ? text('回填中...', 'Backfilling...') : text('Backfill 日记', 'Backfill Diary') }}
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="runGroundedAction('reset-diary')"
          >
            {{ groundedActionBusy === 'reset-diary' ? text('重置中...', 'Resetting...') : text('Reset 回填', 'Reset Backfill') }}
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="runGroundedAction('clear-grounded')"
          >
            {{ groundedActionBusy === 'clear-grounded' ? text('清理中...', 'Clearing...') : text('Clear Grounded', 'Clear Grounded') }}
          </button>
        </div>
      </article>

      <article class="dreaming-inline-panel" :class="{ warning: Boolean(currentEmptyReason) }">
        <div class="dreaming-pane__head compact">
          <div>
            <h4>{{ text('当前状态说明', 'Current State') }}</h4>
            <p>
              {{
                text(
                  '如果你感觉页面“没东西”，通常不是没接好，而是当前 memory lane 里确实没有 replay 数据。',
                  'If the page feels empty, it usually means the memory lane currently has no replay data rather than the feature being disconnected.'
                )
              }}
            </p>
          </div>
        </div>

        <div class="dreaming-readiness-facts">
          <div class="dreaming-readiness-fact">
            <span>{{ text('Dreaming', 'Dreaming') }}</span>
            <strong>{{ dreamingEnabled ? text('已开启', 'Enabled') : text('已关闭', 'Disabled') }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('Grounded 条目', 'Grounded Entries') }}</span>
            <strong>{{ groundedLaneItems.length }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('日记条目', 'Diary Entries') }}</span>
            <strong>{{ diaryEntries.length }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('Next Sweep', 'Next Sweep') }}</span>
            <strong>{{ nextSweepLabel }}</strong>
          </div>
        </div>

        <div v-if="currentEmptyReason" class="dreaming-empty-inline">
          {{ currentEmptyReason }}
        </div>

        <div v-if="lastGroundedAction" class="dreaming-readiness-list">
          <strong>{{ text('最近一次 grounded 操作结果', 'Latest grounded action result') }}</strong>
          <ul>
            <li>{{ latestActionLabel }}</li>
            <li>{{ text('扫描文件', 'Scanned files') }}: {{ lastGroundedAction.stats.scannedFiles }}</li>
            <li>{{ text('写入', 'Written') }}: {{ lastGroundedAction.stats.written }}</li>
            <li>{{ text('替换', 'Replaced') }}: {{ lastGroundedAction.stats.replaced }}</li>
            <li>{{ text('移除日记条目', 'Removed diary entries') }}: {{ lastGroundedAction.stats.removedEntries }}</li>
            <li>{{ text('移除 grounded short-term', 'Removed grounded short-term') }}: {{ lastGroundedAction.stats.removedShortTermEntries }}</li>
          </ul>
        </div>
      </article>

      <article class="dreaming-inline-panel dreaming-rem-preview" :class="{ warning: remHarnessSummary.stateTone === 'warning' }">
        <div class="dreaming-pane__head compact">
          <div>
            <h4>{{ text('REM Harness Preview', 'REM Harness Preview') }}</h4>
            <p>
              {{
                text(
                  '直接调用 OpenClaw 4.9 `memory rem-harness --json`，先看 live REM，再看 grounded historical replay 为什么有或没有内容。',
                  'Calls OpenClaw 4.9 `memory rem-harness --json` directly so you can inspect live REM and see exactly why grounded historical replay does or does not have data.'
                )
              }}
            </p>
          </div>

          <button type="button" class="secondary-button" :disabled="busy" @click="refreshRemHarnessPreview">
            {{ remHarnessBusy ? text('预览中...', 'Previewing...') : text('Preview REM', 'Preview REM') }}
          </button>
        </div>

        <div class="dreaming-rem-preview__facts dreaming-readiness-facts">
          <div class="dreaming-readiness-fact">
            <span>{{ text('状态', 'State') }}</span>
            <strong>{{ remHarnessSummary.stateLabel }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('Live 反思', 'Live Reflections') }}</span>
            <strong>{{ remHarnessSummary.liveReflectionCount }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('Candidate Truths', 'Candidate Truths') }}</span>
            <strong>{{ remHarnessSummary.liveCandidateTruthCount }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('Grounded 文件', 'Grounded Files') }}</span>
            <strong>{{ remHarnessSummary.groundedFileCount }}</strong>
          </div>
        </div>

        <div v-if="compatibility" class="dreaming-rem-preview__facts dreaming-readiness-facts">
          <div class="dreaming-readiness-fact">
            <span>{{ text('Strict Daily', 'Strict Daily') }}</span>
            <strong>{{ compatibility.strictFileCount }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('Legacy Files', 'Legacy Files') }}</span>
            <strong>{{ compatibility.legacyFileCount }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('Alias Needed', 'Alias Needed') }}</span>
            <strong>{{ compatibility.aliasNeededCount }}</strong>
          </div>
          <div class="dreaming-readiness-fact">
            <span>{{ text('Memory Dir', 'Memory Dir') }}</span>
            <strong>{{ compatibility.memoryDir }}</strong>
          </div>
        </div>

        <div class="dreaming-rem-preview__notes">
          <p>{{ remHarnessSummary.message }}</p>
          <p v-if="remHarnessSummary.groundedSourcePath">
            {{ text('Grounded Source', 'Grounded Source') }}: {{ remHarnessSummary.groundedSourcePath }}
          </p>
        </div>

        <div v-if="canApplyCompatibilityAliases" class="dreaming-readiness-list">
          <strong>{{ text('4.9 兼容修复', '4.9 Compatibility Fix') }}</strong>
          <p>
            {{
              text(
                '这些 legacy memory 文件会被按日期聚合成新的 YYYY-MM-DD.md alias，原文件不改名也不覆盖，随后 grounded replay / backfill 就能使用官方 4.9 路径。',
                'These legacy memory files will be grouped into new YYYY-MM-DD.md aliases. The original files are not renamed or overwritten, and grounded replay / backfill can then use the official 4.9 path.'
              )
            }}
          </p>
          <ul>
            <li v-for="entry in compatibilityNeededEntries" :key="entry.date">
              {{ entry.date }} · {{ entry.legacyPaths.length }} {{ text('个来源文件', 'source files') }}
            </li>
          </ul>
          <button type="button" class="secondary-button" :disabled="busy" @click="applyCompatibilityAliases">
            {{ compatibilityBusy ? text('创建中...', 'Creating...') : text('Create Daily Aliases', 'Create Daily Aliases') }}
          </button>
        </div>

        <div v-if="remHarnessReflections.length" class="dreaming-readiness-list">
          <strong>{{ text('最近的 live REM 反思', 'Latest live REM reflections') }}</strong>
          <ul>
            <li v-for="reflection in remHarnessReflections" :key="reflection">{{ reflection }}</li>
          </ul>
        </div>

        <div v-if="remHarnessPreviewFile" class="dreaming-readiness-list">
          <strong>{{ text('首个 grounded 渲染结果', 'First grounded render') }}</strong>
          <p>{{ remHarnessPreviewFile.path }}</p>
          <pre class="dreaming-rem-preview__markdown">{{ remHarnessPreviewFile.renderedMarkdown }}</pre>
        </div>
      </article>
    </section>

    <TabsRoot v-model="activeTab" class="dreaming-workbench">
      <div class="dreaming-workbench__bar">
        <div>
          <p class="eyebrow">{{ text('Workbench', 'Workbench') }}</p>
          <h3>{{ activeTabTitle }}</h3>
          <p class="dreaming-workbench__copy">{{ activeTabCopy }}</p>
        </div>

        <TabsList class="dreaming-workbench__tabs" aria-label="Dreaming workbench tabs">
          <TabsTrigger value="scene" class="dreaming-workbench__tab">
            {{ text('场景与阶段', 'Scene & Phases') }}
          </TabsTrigger>
          <TabsTrigger value="diary" class="dreaming-workbench__tab">
            {{ text('梦境日记', 'Dream Diary') }}
          </TabsTrigger>
          <TabsTrigger value="readiness" class="dreaming-workbench__tab">
            {{ text('配置与诊断', 'Readiness') }}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="scene" class="dreaming-workbench__panel">
        <motion.section class="dreaming-pane dreaming-pane--scene" v-bind="pageSurfaceReveal">
          <section class="dreaming-river">
            <div class="dreaming-river__line" aria-hidden="true"></div>
            <article
              v-for="(phase, index) in phaseCards"
              :key="phase.id"
              class="dreaming-river__phase"
              :class="{ active: phase.enabled }"
              :style="{ '--phase-index': String(index) }"
            >
              <div class="dreaming-river__phase-head">
                <div>
                  <p class="eyebrow">{{ phase.kicker }}</p>
                  <h4>{{ phase.title }}</h4>
                </div>
                <span class="dreaming-river__badge" :class="{ active: phase.enabled }">
                  {{ phase.enabled ? text('已启用', 'Enabled') : text('关闭', 'Off') }}
                </span>
              </div>

              <p class="dreaming-river__summary">{{ phase.summary }}</p>

              <div class="dreaming-river__facts">
                <div class="dreaming-river__fact">
                  <span>cron</span>
                  <strong>{{ phase.cron || '—' }}</strong>
                </div>
                <div class="dreaming-river__fact">
                  <span>{{ text('Next', 'Next') }}</span>
                  <strong>{{ phase.nextRun }}</strong>
                </div>
                <div class="dreaming-river__fact">
                  <span>{{ phase.metricLabelA }}</span>
                  <strong>{{ phase.metricValueA }}</strong>
                </div>
                <div class="dreaming-river__fact">
                  <span>{{ phase.metricLabelB }}</span>
                  <strong>{{ phase.metricValueB }}</strong>
                </div>
              </div>
            </article>
          </section>

          <section class="dreaming-signal-rack">
            <article
              v-for="metric in metricCards"
              :key="metric.label"
              class="dreaming-signal-rack__item"
            >
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
              <p>{{ metric.note }}</p>
            </article>
          </section>

          <section class="dreaming-grounded-lane">
            <div class="dreaming-pane__head compact">
              <div>
                <h4>{{ text('Grounded Scene Lane', 'Grounded Scene Lane') }}</h4>
                <p>
                  {{
                    text(
                      '用最小视图把 grounded replay 暴露出来，方便后续继续做视觉层，不把能力藏回配置页。',
                      'A minimal view of grounded replay so the capability stays visible without pushing it back into config editing.'
                    )
                  }}
                </p>
              </div>
            </div>

            <div v-if="groundedLaneItems.length" class="dreaming-grounded-lane__list">
              <article
                v-for="item in groundedLaneItems"
                :key="item.id"
                class="dreaming-grounded-lane__item"
              >
                <div class="dreaming-grounded-lane__head">
                  <div>
                    <p class="eyebrow">{{ item.kicker }}</p>
                    <h4>{{ item.title }}</h4>
                  </div>
                  <span class="dreaming-grounded-lane__badge">{{ item.stageLabel }}</span>
                </div>
                <p class="dreaming-grounded-lane__snippet">{{ item.snippet }}</p>
                <div class="dreaming-grounded-lane__facts">
                  <span>{{ item.pathLabel }}</span>
                  <span>{{ text('Grounded', 'Grounded') }} {{ item.groundedCount }}</span>
                  <span>{{ text('Recall', 'Recall') }} {{ item.recallCount }}</span>
                  <span>{{ text('Signals', 'Signals') }} {{ item.totalSignalCount }}</span>
                </div>
                <p class="dreaming-grounded-lane__hint">{{ item.hint }}</p>
              </article>
            </div>

            <div v-else class="dreaming-empty-inline">
              {{ text('当前还没有 grounded replay 条目。', 'There are no grounded replay entries right now.') }}
            </div>
          </section>
        </motion.section>
      </TabsContent>

      <TabsContent value="diary" class="dreaming-workbench__panel">
        <motion.section class="dreaming-pane dreaming-pane--diary" v-bind="pageSurfaceReveal">
          <div class="dreaming-pane__head">
            <div>
              <h4>{{ text('Dream Diary', 'Dream Diary') }}</h4>
              <p>
                {{
                  text(
                    '这里直接读取宿主 `doctor.memory.dreamDiary`。保留时间流视角，而不是把条目继续塞回表格或卡片。',
                    'This reads the host `doctor.memory.dreamDiary` directly, keeping the diary as a time-flow surface instead of another table or card stack.'
                  )
                }}
              </p>
            </div>

            <button type="button" class="secondary-button" :disabled="busy" @click="refreshDiary">
              {{ diaryBusy ? text('重载中...', 'Reloading...') : text('重载日记', 'Reload Diary') }}
            </button>
          </div>

          <div class="dreaming-diary-meta">
            <span>{{ text('文件', 'File') }}: {{ diary?.path || 'DREAMS.md' }}</span>
            <span>{{ text('条目', 'Entries') }}: {{ diaryEntries.length }}</span>
            <span>{{ text('更新时间', 'Updated') }}: {{ diaryUpdatedLabel }}</span>
          </div>

          <div v-if="diary?.error" class="dreaming-inline-panel warning">
            <strong>{{ text('日记读取失败', 'Diary read failed') }}</strong>
            <p>{{ diary.error }}</p>
          </div>

          <div v-if="diaryEntries.length" class="dreaming-diary-shell">
            <div class="dreaming-diary-shell__rail">
              <button
                v-for="entry in diaryEntries"
                :key="entry.id"
                type="button"
                class="dreaming-diary-shell__entry"
                :class="{ active: activeDiaryEntry?.id === entry.id }"
                @click="selectedDiaryEntryId = entry.id"
              >
                <strong>{{ entry.date || text('未标注时间', 'Undated') }}</strong>
                <p>{{ summarizeDiaryEntry(entry.body) }}</p>
              </button>
            </div>

            <article class="dreaming-diary-sheet">
              <div class="dreaming-diary-sheet__head">
                <p class="eyebrow">Dream Diary</p>
                <h4>{{ activeDiaryEntry?.date || text('未标注时间', 'Undated') }}</h4>
              </div>

              <pre class="dreaming-diary-sheet__body">{{ activeDiaryEntry?.body || '' }}</pre>
            </article>
          </div>

          <div v-else class="dreaming-empty-state">
            <strong>{{ text('还没有可解析的梦境条目', 'No parseable dream entries yet') }}</strong>
            <p>{{ text('等 dreaming cycle 产生日记后，这里会变成时间流视图。', 'Once the dreaming cycle writes a diary, this area becomes a time-flow view.') }}</p>
          </div>
        </motion.section>
      </TabsContent>

      <TabsContent value="readiness" class="dreaming-workbench__panel">
        <motion.section class="dreaming-pane dreaming-pane--readiness" v-bind="pageSurfaceReveal">
          <section class="dreaming-readiness-grid">
            <article class="dreaming-inline-panel">
              <div class="dreaming-pane__head compact">
                <div>
                  <h4>{{ text('配置事实', 'Configuration Facts') }}</h4>
                  <p>{{ text('这是当前 gateway / memory / dreaming 的落点，不是原始 JSON dump。', 'These are the active gateway, memory, and dreaming facts rather than a raw JSON dump.') }}</p>
                </div>
              </div>

              <div class="dreaming-readiness-facts">
                <div class="dreaming-readiness-fact">
                  <span>{{ text('配置文件', 'Config File') }}</span>
                  <strong>{{ snapshot?.configPath || '--' }}</strong>
                </div>
                <div class="dreaming-readiness-fact">
                  <span>{{ text('Resolved Plugin', 'Resolved Plugin') }}</span>
                  <strong>{{ snapshot?.config.resolvedPluginId || '--' }}</strong>
                </div>
                <div class="dreaming-readiness-fact">
                  <span>{{ text('Fallback', 'Fallback') }}</span>
                  <strong>{{ snapshot?.config.resolvedFromFallback ? text('是', 'Yes') : text('否', 'No') }}</strong>
                </div>
                <div class="dreaming-readiness-fact">
                  <span>{{ text('Entry Enabled', 'Entry Enabled') }}</span>
                  <strong>{{ snapshot?.config.selectedEntryEnabled ? text('是', 'Yes') : text('否', 'No') }}</strong>
                </div>
              </div>
            </article>

            <article class="dreaming-inline-panel" :class="{ warning: hasReadinessWarnings }">
              <div class="dreaming-pane__head compact">
                <div>
                  <h4>{{ text('自动修复判断', 'Auto Repair Assessment') }}</h4>
                  <p>{{ text('Bootstrap 和 install script 只会修安全不变量，不会擅自启用高风险 provider。', 'Bootstrap and the install script only repair safe invariants; they do not auto-enable higher-risk providers.') }}</p>
                </div>
              </div>

              <div v-if="snapshot?.config.issues.length" class="dreaming-readiness-list">
                <strong>{{ text('发现的问题', 'Detected issues') }}</strong>
                <ul>
                  <li v-for="issue in snapshot.config.issues" :key="issue">{{ issue }}</li>
                </ul>
              </div>

              <div v-if="snapshot?.config.notes.length" class="dreaming-readiness-list">
                <strong>{{ text('修复说明', 'Repair notes') }}</strong>
                <ul>
                  <li v-for="note in snapshot.config.notes" :key="note">{{ note }}</li>
                </ul>
              </div>

              <div v-if="snapshot?.statusError" class="dreaming-readiness-list">
                <strong>{{ text('宿主状态错误', 'Host status error') }}</strong>
                <p>{{ snapshot.statusError }}</p>
              </div>

              <div v-if="!hasReadinessWarnings" class="dreaming-empty-inline">
                {{ text('当前没有修复项，配置状态稳定。', 'No repair action is needed right now.') }}
              </div>
            </article>
          </section>
        </motion.section>
      </TabsContent>
    </TabsRoot>
  </motion.section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { motion } from 'motion-v';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import type {
  DreamingActionKind,
  DreamingActionResponse,
  DreamingDiaryPayload,
  DreamingMemoryCompatibilityPayload,
  DreamingRemHarnessPayload,
  DreamingSceneEntry,
  DreamingSnapshotPayload,
} from '../../../../../types/dreaming';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import { useLocalePreference } from '../../shared/locale';
import { pageMastheadReveal, pageSurfaceReveal } from '../../shared/motion';
import {
  applyDreamingMemoryCompatibility,
  backfillDreamingDiary,
  clearGroundedDreamingSignals,
  fetchDreamingMemoryCompatibility,
  fetchDreamingDiary,
  fetchDreamingRemHarnessPreview,
  fetchDreamingSnapshot,
  repairDreamingConfig,
  resetDreamingDiary,
  toggleDreamingEnabled,
} from './api';
import {
  deriveDreamingCurrentEmptyReason,
  summarizeDreamingRemHarness,
} from './view-model';

type DreamingWorkbenchTab = 'scene' | 'diary' | 'readiness';

interface DiaryEntry {
  id: string;
  date: string;
  body: string;
}

interface GroundedLaneItem {
  id: string;
  kicker: string;
  stageLabel: string;
  title: string;
  snippet: string;
  pathLabel: string;
  groundedCount: number;
  recallCount: number;
  totalSignalCount: number;
  hint: string;
}

const { text } = useLocalePreference();
const { confirm } = useConfirmDialog();

const activeTab = ref<DreamingWorkbenchTab>('scene');
const selectedDiaryEntryId = ref('');
const snapshot = ref<DreamingSnapshotPayload | null>(null);
const diary = ref<DreamingDiaryPayload | null>(null);
const compatibility = ref<DreamingMemoryCompatibilityPayload | null>(null);
const remHarnessPreview = ref<DreamingRemHarnessPayload | null>(null);
const loading = ref(false);
const toggleBusy = ref(false);
const repairBusy = ref(false);
const diaryBusy = ref(false);
const compatibilityBusy = ref(false);
const remHarnessBusy = ref(false);
const groundedActionBusy = ref<DreamingActionKind | null>(null);
const lastGroundedAction = ref<DreamingActionResponse | null>(null);
const errorMessage = ref('');
const notice = ref<{ kind: 'info' | 'error'; text: string } | null>(null);

const busy = computed(() => (
  loading.value
  || toggleBusy.value
  || repairBusy.value
  || diaryBusy.value
  || compatibilityBusy.value
  || remHarnessBusy.value
  || groundedActionBusy.value !== null
));
const dreamingEnabled = computed(() => (
  snapshot.value?.status?.enabled
  ?? snapshot.value?.config.selectedDreamingEnabled
  ?? false
));
const canRepair = computed(() => (
  snapshot.value?.config.bootstrapRepairNeeded === true
  && snapshot.value?.config.bootstrapRepairable === true
));
const hasReadinessWarnings = computed(() => Boolean(
  snapshot.value?.config.issues.length
  || snapshot.value?.config.notes.length
  || snapshot.value?.statusError
));
const activePluginLabel = computed(() => {
  if (!snapshot.value) return '--';
  if (snapshot.value.config.slotDisabled) {
    return `${snapshot.value.config.resolvedPluginId} · ${text('回退', 'fallback')}`;
  }
  return snapshot.value.config.slotValue || snapshot.value.config.resolvedPluginId;
});

const feedbackMessage = computed(() => (
  errorMessage.value
  || notice.value?.text
  || snapshot.value?.statusError
  || ''
));
const feedbackTone = computed<'error' | 'info'>(() => (
  errorMessage.value || notice.value?.kind === 'error' || snapshot.value?.statusError
    ? 'error'
    : 'info'
));

function formatTimestamp(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) {
    return text('未安排', 'Not scheduled');
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return text('未安排', 'Not scheduled');
  }
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0%';
  return `${Math.round(value * 100)}%`;
}

function parseDreamDiary(raw: string | null | undefined): DiaryEntry[] {
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }

  const startMarker = /<!--\s*openclaw:dreaming:diary:start\s*-->/;
  const endMarker = /<!--\s*openclaw:dreaming:diary:end\s*-->/;
  let content = raw;
  const startMatch = startMarker.exec(raw);
  const endMatch = endMarker.exec(raw);
  if (startMatch && endMatch && endMatch.index > startMatch.index) {
    content = raw.slice(startMatch.index + startMatch[0].length, endMatch.index);
  }

  return content
    .split(/\n---\n/)
    .map((block, index) => {
      const lines = block.trim().split('\n');
      let date = '';
      const bodyLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('<!--') || trimmed.startsWith('#')) {
          continue;
        }
        if (!date && trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 2) {
          date = trimmed.slice(1, -1);
          continue;
        }
        bodyLines.push(trimmed);
      }
      return {
        id: `${index}-${date}-${bodyLines[0] || 'entry'}`,
        date,
        body: bodyLines.join('\n'),
      };
    })
    .filter((entry) => entry.body.trim().length > 0);
}

function summarizeDiaryEntry(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 88) return collapsed;
  return `${collapsed.slice(0, 85)}...`;
}

const diaryEntries = computed(() => parseDreamDiary(diary.value?.content));
const activeDiaryEntry = computed(() => (
  diaryEntries.value.find((entry) => entry.id === selectedDiaryEntryId.value)
  || diaryEntries.value[0]
  || null
));

watch(diaryEntries, (entries) => {
  if (!entries.length) {
    selectedDiaryEntryId.value = '';
    return;
  }
  if (!entries.some((entry) => entry.id === selectedDiaryEntryId.value)) {
    selectedDiaryEntryId.value = entries[0].id;
  }
}, { immediate: true });

const nextSweepLabel = computed(() => {
  const status = snapshot.value?.status;
  if (!status) return text('未报告', 'Not reported');
  const nextRuns = [
    status.phases.light.nextRunAtMs,
    status.phases.deep.nextRunAtMs,
    status.phases.rem.nextRunAtMs,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!nextRuns.length) return text('未安排', 'Not scheduled');
  return formatTimestamp(Math.min(...nextRuns));
});

const diaryUpdatedLabel = computed(() => formatTimestamp(diary.value?.updatedAtMs));
const canApplyCompatibilityAliases = computed(() => (compatibility.value?.aliasNeededCount || 0) > 0);
const compatibilityNeededEntries = computed(() => (
  compatibility.value?.entries.filter((entry) => entry.aliasNeeded).slice(0, 5) || []
));
const remHarnessSummary = computed(() => summarizeDreamingRemHarness(remHarnessPreview.value, text));
const remHarnessPreviewFile = computed(() => remHarnessPreview.value?.grounded.groundedFiles[0] || null);
const remHarnessReflections = computed(() => remHarnessPreview.value?.live.remReflections.slice(0, 3) || []);
const latestActionLabel = computed(() => {
  if (!lastGroundedAction.value) return '';
  if (lastGroundedAction.value.action === 'backfill') {
    return text('最近执行的是 Backfill Diary。', 'The latest action was Backfill Diary.');
  }
  if (lastGroundedAction.value.action === 'reset-diary') {
    return text('最近执行的是 Reset Backfill。', 'The latest action was Reset Backfill.');
  }
  return text('最近执行的是 Clear Grounded。', 'The latest action was Clear Grounded.');
});

const sceneHeadline = computed(() => {
  const status = snapshot.value?.status;
  if (!dreamingEnabled.value) {
    return text(
      'Dreaming 目前处于 idle，直到你重新唤醒这条 memory lane。',
      'Dreaming is idle until you wake this memory lane back up.'
    );
  }
  if ((status?.promotedToday || 0) > 0) {
    return text(
      `今天已晋升 ${status?.promotedToday || 0} 条 durable memory，下一轮会继续压缩剩余信号。`,
      `${status?.promotedToday || 0} durable memories were promoted today, and the next sweep will keep compressing the remaining signal.`
    );
  }
  if ((status?.groundedSignalCount || 0) > 0) {
    return text(
      `当前有 ${status?.groundedSignalCount || 0} 条 grounded replay 正在等待 live recall 校准。`,
      `${status?.groundedSignalCount || 0} grounded replay entries are waiting for live recall to calibrate them.`
    );
  }
  if ((status?.totalSignalCount || 0) > 0) {
    return text(
      `当前累积 ${status?.totalSignalCount || 0} 条信号，等待下一次夜间 sweep 编织成记忆。`,
      `${status?.totalSignalCount || 0} signals are queued for the next nightly sweep.`
    );
  }
  return text(
    'Dreaming 已经准备好，正在等待下一次受控 sweep。',
    'Dreaming is armed and waiting for the next controlled sweep.'
  );
});

const activeTabTitle = computed(() => {
  if (activeTab.value === 'diary') {
    return text('梦境日记时间流', 'Dream Diary Timeline');
  }
  if (activeTab.value === 'readiness') {
    return text('配置健康与修复判断', 'Configuration Health and Repair');
  }
  return text('阶段流与信号概览', 'Phase River and Signal Overview');
});

const activeTabCopy = computed(() => {
  if (activeTab.value === 'diary') {
    return text(
      '把 Dream Diary 当成一条时间流来阅读，而不是另一组静态记录卡。',
      'Read the Dream Diary as a time-flow surface instead of another grid of static cards.'
    );
  }
  if (activeTab.value === 'readiness') {
    return text(
      '诊断页只回答一个问题：当前这套 dreaming 配置是否安全、完整、可持续。',
      'The readiness view answers one question: is the current dreaming configuration safe, complete, and sustainable?'
    );
  }
  return text(
    '这里不是仪表盘墙，而是把 light / deep / rem 编排成一条连续的工作流。',
    'This is not a dashboard wall; it lays out light, deep, and rem as one continuous flow.'
  );
});

const stageStats = computed(() => [
  {
    label: text('Promoted', 'Promoted'),
    value: String(snapshot.value?.status?.promotedTotal ?? 0),
  },
  {
    label: text('Signals', 'Signals'),
    value: String(snapshot.value?.status?.totalSignalCount ?? 0),
  },
  {
    label: text('Grounded', 'Grounded'),
    value: String(snapshot.value?.status?.groundedSignalCount ?? 0),
  },
  {
    label: text('Short Term', 'Short Term'),
    value: String(snapshot.value?.status?.shortTermCount ?? 0),
  },
  {
    label: text('Next Sweep', 'Next Sweep'),
    value: nextSweepLabel.value,
  },
]);

const metricCards = computed(() => [
  {
    label: text('Recall Signals', 'Recall Signals'),
    value: String(snapshot.value?.status?.recallSignalCount ?? 0),
    note: text('表示哪些内容正在从短时记忆进入可回忆层。', 'Tracks what is moving from short-term state toward recallable memory.'),
  },
  {
    label: text('Daily Signals', 'Daily Signals'),
    value: String(snapshot.value?.status?.dailySignalCount ?? 0),
    note: text('一天内聚合的 dreamable signal。', 'Daily dreamable signal grouped for nightly sweeps.'),
  },
  {
    label: text('Grounded Replay', 'Grounded Replay'),
    value: String(snapshot.value?.status?.groundedSignalCount ?? 0),
    note: text('历史 daily notes 回放进来的 grounded 条目。', 'Grounded entries replayed from historical daily notes.'),
  },
  {
    label: text('Phase Hits', 'Phase Hits'),
    value: `${snapshot.value?.status?.lightPhaseHitCount ?? 0} / ${snapshot.value?.status?.remPhaseHitCount ?? 0}`,
    note: text('左侧是 light phase 命中，右侧是 REM pattern 命中。', 'Left is light-phase hits and right is REM pattern hits.'),
  },
  {
    label: text('Storage Mode', 'Storage Mode'),
    value: snapshot.value?.status?.storageMode || '--',
    note: text('inline / separate / both 说明 dream report 的落盘方式。', 'inline / separate / both describes how dream reports are stored.'),
  },
]);

const phaseCards = computed(() => {
  const status = snapshot.value?.status;
  return [
    {
      id: 'light',
      kicker: 'Light',
      title: text('轻梦回顾', 'Light Review'),
      summary: text(
        '回扫最近两天的短时上下文，把仍有价值的片段从噪音里挑出来。',
        'Sweep the last two days of short-term context and pull the still-useful fragments out of the noise.'
      ),
      enabled: status?.phases.light.enabled ?? false,
      cron: status?.phases.light.cron ?? '',
      nextRun: formatTimestamp(status?.phases.light.nextRunAtMs),
      metricLabelA: text('Lookback', 'Lookback'),
      metricValueA: `${status?.phases.light.lookbackDays ?? 0}d`,
      metricLabelB: text('Limit', 'Limit'),
      metricValueB: String(status?.phases.light.limit ?? 0),
    },
    {
      id: 'deep',
      kicker: 'Deep',
      title: text('深层整合', 'Deep Consolidation'),
      summary: text(
        '优先处理高 recall、高重复、高新近性的线索，把它们压成 durable memory。',
        'Prioritize high-recall, repeated, recent signals and compress them into durable memory.'
      ),
      enabled: status?.phases.deep.enabled ?? false,
      cron: status?.phases.deep.cron ?? '',
      nextRun: formatTimestamp(status?.phases.deep.nextRunAtMs),
      metricLabelA: text('Min Score', 'Min Score'),
      metricValueA: formatPercent(status?.phases.deep.minScore),
      metricLabelB: text('Min Recall', 'Min Recall'),
      metricValueB: String(status?.phases.deep.minRecallCount ?? 0),
    },
    {
      id: 'rem',
      kicker: 'REM',
      title: text('模式回放', 'Pattern Replay'),
      summary: text(
        '把 recurring pattern 和 grounded signal 放回同一条梦境叙事里，观察哪些主题正在反复出现。',
        'Bring recurring patterns and grounded signals back into one dream narrative and watch which themes keep repeating.'
      ),
      enabled: status?.phases.rem.enabled ?? false,
      cron: status?.phases.rem.cron ?? '',
      nextRun: formatTimestamp(status?.phases.rem.nextRunAtMs),
      metricLabelA: text('Lookback', 'Lookback'),
      metricValueA: `${status?.phases.rem.lookbackDays ?? 0}d`,
      metricLabelB: text('Pattern', 'Pattern'),
      metricValueB: formatPercent(status?.phases.rem.minPatternStrength),
    },
  ];
});

function entryHint(entry: DreamingSceneEntry, stage: 'short-term' | 'signal' | 'promoted'): string {
  const minRecall = snapshot.value?.status?.phases.deep.minRecallCount ?? 0;
  if (stage === 'promoted') {
    return text(
      '这条 grounded replay 已经进入 durable memory，可以继续观察后续召回稳定性。',
      'This grounded replay already made it into durable memory; keep watching recall stability.'
    );
  }
  if (entry.recallCount >= minRecall || entry.totalSignalCount >= minRecall) {
    return text(
      '它已经积累到足够的 live support，下一轮 deep phase 会重新评估它。',
      'It has enough live support to be reconsidered in the next deep phase.'
    );
  }
  return text(
    '当前仍主要依赖 historical replay，还需要更多 live recall 支撑。',
    'It is still mostly driven by historical replay and needs more live recall support.'
  );
}

function buildGroundedLaneItems(entries: DreamingSceneEntry[], stage: 'short-term' | 'signal' | 'promoted'): GroundedLaneItem[] {
  const kickerMap = {
    'short-term': text('Staged', 'Staged'),
    signal: text('Signal', 'Signal'),
    promoted: text('Promoted', 'Promoted'),
  };
  return entries
    .filter((entry) => entry.groundedCount > 0)
    .map((entry) => ({
      id: `${stage}:${entry.key}:${entry.path}:${entry.startLine}`,
      kicker: 'Grounded',
      stageLabel: kickerMap[stage],
      title: entry.key,
      snippet: entry.snippet,
      pathLabel: `${entry.path}:${entry.startLine}`,
      groundedCount: entry.groundedCount,
      recallCount: entry.recallCount,
      totalSignalCount: entry.totalSignalCount,
      hint: entryHint(entry, stage),
    }));
}

const groundedLaneItems = computed(() => {
  const status = snapshot.value?.status;
  if (!status) return [];
  return [
    ...buildGroundedLaneItems(status.shortTermEntries, 'short-term'),
    ...buildGroundedLaneItems(status.signalEntries, 'signal'),
    ...buildGroundedLaneItems(status.promotedEntries, 'promoted'),
  ].slice(0, 12);
});

const currentEmptyReason = computed(() => {
  return deriveDreamingCurrentEmptyReason({
    snapshot: snapshot.value,
    dreamingEnabled: dreamingEnabled.value,
    groundedLaneCount: groundedLaneItems.value.length,
    diaryEntryCount: diaryEntries.value.length,
    remHarnessPreview: remHarnessPreview.value,
    text,
  });
});

async function refreshSnapshot(): Promise<void> {
  snapshot.value = await fetchDreamingSnapshot();
}

async function refreshDiary(): Promise<void> {
  diaryBusy.value = true;
  errorMessage.value = '';
  try {
    diary.value = await fetchDreamingDiary();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('读取 Dream Diary 失败。', 'Failed to read the Dream Diary.');
  } finally {
    diaryBusy.value = false;
  }
}

async function refreshRemHarnessPreview(): Promise<void> {
  remHarnessBusy.value = true;
  errorMessage.value = '';
  notice.value = null;
  try {
    const [preview, compatibilitySnapshot] = await Promise.all([
      fetchDreamingRemHarnessPreview(),
      fetchDreamingMemoryCompatibility(),
    ]);
    remHarnessPreview.value = preview;
    compatibility.value = compatibilitySnapshot;
    notice.value = {
      kind: 'info',
      text: text('REM 预览已更新。', 'REM preview updated.'),
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('REM 预览失败。', 'REM preview failed.');
  } finally {
    remHarnessBusy.value = false;
  }
}

async function applyCompatibilityAliases(): Promise<void> {
  compatibilityBusy.value = true;
  errorMessage.value = '';
  notice.value = null;
  try {
    const response = await applyDreamingMemoryCompatibility();
    compatibility.value = response.compatibility;
    remHarnessPreview.value = response.preview;
    notice.value = {
      kind: 'info',
      text: response.changed
        ? text(`已创建 ${response.createdFiles.length} 个 daily alias 文件。`, `Created ${response.createdFiles.length} daily alias files.`)
        : text('当前没有需要创建的 daily alias 文件。', 'No daily alias files needed to be created.'),
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('创建 daily alias 失败。', 'Failed to create daily aliases.');
  } finally {
    compatibilityBusy.value = false;
  }
}

async function refreshAll(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  notice.value = null;
  try {
    await Promise.all([refreshSnapshot(), refreshDiary()]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('加载 dreaming 状态失败。', 'Failed to load dreaming state.');
  } finally {
    loading.value = false;
  }
}

async function toggleDreamingState(enabled: boolean): Promise<void> {
  toggleBusy.value = true;
  errorMessage.value = '';
  notice.value = null;
  try {
    const response = await toggleDreamingEnabled({ enabled });
    snapshot.value = response.snapshot;
    notice.value = {
      kind: 'info',
      text: enabled
        ? text('Dreaming 已提交开启。', 'Dreaming enable was submitted.')
        : text('Dreaming 已提交关闭。', 'Dreaming disable was submitted.'),
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('更新 dreaming 开关失败。', 'Failed to update dreaming.');
  } finally {
    toggleBusy.value = false;
  }
}

async function repairConfig(): Promise<void> {
  repairBusy.value = true;
  errorMessage.value = '';
  notice.value = null;
  try {
    const response = await repairDreamingConfig();
    snapshot.value = response.snapshot;
    notice.value = {
      kind: 'info',
      text: response.changed
        ? text('已修复 dreaming / memory slot 不一致。', 'Dreaming / memory slot mismatch repaired.')
        : text('当前 dreaming 配置无需修复。', 'No dreaming repair was needed.'),
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('自动修复失败。', 'Repair failed.');
  } finally {
    repairBusy.value = false;
  }
}

async function confirmGroundedAction(action: DreamingActionKind): Promise<boolean> {
  if (action === 'reset-diary') {
    return await confirm({
      title: text('确认重置 Dream Diary 回填', 'Confirm reset Dream Diary backfill'),
      message: text(
        '这会移除 DREAMS.md 里由 grounded backfill 写入的条目。继续吗？',
        'This removes grounded backfill entries from DREAMS.md. Continue?'
      ),
      confirmText: text('继续重置', 'Continue reset'),
      cancelText: text('取消', 'Cancel'),
      tone: 'danger',
    });
  }
  if (action === 'clear-grounded') {
    return await confirm({
      title: text('确认清理 grounded 条目', 'Confirm clear grounded entries'),
      message: text(
        '这会清理仅由 grounded replay 产生、且还没有 live support 的 short-term 条目。继续吗？',
        'This clears grounded-only short-term entries that still lack live support. Continue?'
      ),
      confirmText: text('继续清理', 'Continue clear'),
      cancelText: text('取消', 'Cancel'),
      tone: 'danger',
    });
  }
  return true;
}

function buildGroundedActionNotice(response: DreamingActionResponse): string {
  if (response.action === 'backfill') {
    return text(
      `Backfill 完成：扫描 ${response.stats.scannedFiles} 个 daily files，写入 ${response.stats.written} 条，替换 ${response.stats.replaced} 条。`,
      `Backfill finished: scanned ${response.stats.scannedFiles} daily files, wrote ${response.stats.written}, replaced ${response.stats.replaced}.`
    );
  }
  if (response.action === 'reset-diary') {
    return text(
      `Dream Diary 回填已重置，移除了 ${response.stats.removedEntries} 条回填条目。`,
      `Dream Diary backfill was reset and removed ${response.stats.removedEntries} backfill entries.`
    );
  }
  return text(
    `已清理 ${response.stats.removedShortTermEntries} 条 grounded short-term 条目。`,
    `Cleared ${response.stats.removedShortTermEntries} grounded short-term entries.`
  );
}

async function runGroundedAction(action: DreamingActionKind): Promise<void> {
  if (!await confirmGroundedAction(action)) {
    return;
  }
  groundedActionBusy.value = action;
  errorMessage.value = '';
  notice.value = null;
  try {
    const response = action === 'backfill'
      ? await backfillDreamingDiary()
      : action === 'reset-diary'
        ? await resetDreamingDiary()
        : await clearGroundedDreamingSignals();
    lastGroundedAction.value = response;
    snapshot.value = response.snapshot;
    diary.value = response.diary;
    if (remHarnessPreview.value) {
      try {
        remHarnessPreview.value = await fetchDreamingRemHarnessPreview();
      } catch {
        // Keep the grounded action successful even if the optional preview refresh fails.
      }
    }
    notice.value = {
      kind: 'info',
      text: buildGroundedActionNotice(response),
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('执行 grounded dreaming 动作失败。', 'Grounded dreaming action failed.');
  } finally {
    groundedActionBusy.value = null;
  }
}

onMounted(() => {
  void refreshAll();
});
</script>

<style scoped>
.dreaming-page {
  --dream-stage-bg:
    radial-gradient(circle at 14% 8%, rgba(156, 191, 255, 0.24), transparent 28%),
    radial-gradient(circle at 85% 14%, rgba(255, 220, 171, 0.12), transparent 26%),
    linear-gradient(160deg, rgba(8, 14, 29, 0.98), rgba(13, 24, 43, 0.94) 44%, rgba(17, 31, 56, 0.9));
  --dream-stage-border: rgba(171, 197, 235, 0.18);
  --dream-dock-bg: linear-gradient(180deg, rgba(12, 21, 38, 0.78), rgba(10, 18, 30, 0.66));
  --dream-surface: rgba(13, 23, 39, 0.72);
  --dream-surface-strong: rgba(15, 28, 46, 0.86);
  --dream-surface-border: rgba(176, 201, 239, 0.12);
  --dream-surface-border-strong: rgba(176, 201, 239, 0.18);
  --dream-scene-text: #f6fbff;
  --dream-scene-muted: rgba(225, 236, 255, 0.72);
  --dream-body-text: rgba(231, 240, 252, 0.92);
  --dream-body-muted: rgba(189, 205, 227, 0.76);
  --dream-accent: #a8c8ff;
  --dream-accent-strong: #ffdaaa;
  --dream-success: #99e8c8;
  --dream-warning: #ffcf93;
  --dream-danger: #ffaba0;
  --dream-paper-bg: linear-gradient(180deg, rgba(15, 27, 43, 0.92), rgba(11, 20, 34, 0.86));
  --dream-paper-border: rgba(186, 207, 239, 0.14);
  display: grid;
  gap: 1.5rem;
}

:global(html[data-theme='light']) .dreaming-page {
  --dream-stage-bg:
    radial-gradient(circle at 12% 10%, rgba(114, 157, 232, 0.18), transparent 30%),
    radial-gradient(circle at 86% 12%, rgba(250, 205, 140, 0.14), transparent 26%),
    linear-gradient(160deg, rgba(252, 254, 255, 0.96), rgba(241, 247, 253, 0.92) 46%, rgba(231, 240, 249, 0.88));
  --dream-stage-border: rgba(56, 86, 122, 0.12);
  --dream-dock-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(244, 248, 252, 0.74));
  --dream-surface: rgba(255, 255, 255, 0.86);
  --dream-surface-strong: rgba(255, 255, 255, 0.96);
  --dream-surface-border: rgba(56, 86, 122, 0.1);
  --dream-surface-border-strong: rgba(56, 86, 122, 0.16);
  --dream-scene-text: #18324a;
  --dream-scene-muted: rgba(41, 69, 97, 0.76);
  --dream-body-text: rgba(23, 38, 56, 0.94);
  --dream-body-muted: rgba(74, 95, 117, 0.78);
  --dream-accent: #4f80eb;
  --dream-accent-strong: #c9852b;
  --dream-success: #1d9a78;
  --dream-warning: #b96f1b;
  --dream-danger: #ca5061;
  --dream-paper-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(246, 249, 252, 0.92));
  --dream-paper-border: rgba(56, 86, 122, 0.12);
}

.dreaming-stage {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.92fr);
  gap: 1rem;
  padding: 1rem;
  border-radius: 1.9rem;
  border: 1px solid var(--dream-stage-border);
  background: var(--dream-stage-bg);
  box-shadow: 0 30px 90px rgba(4, 8, 17, 0.18);
  overflow: hidden;
}

.dreaming-stage__scene,
.dreaming-stage__dock,
.dreaming-workbench {
  position: relative;
  z-index: 1;
}

.dreaming-stage__scene {
  min-height: 24rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.45rem;
  border-radius: 1.45rem;
  overflow: hidden;
}

.dreaming-stage__sky {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.dreaming-stage__moon,
.dreaming-stage__moon-ring,
.dreaming-stage__haze,
.dreaming-stage__tide,
.dreaming-stage__star {
  position: absolute;
}

.dreaming-stage__moon {
  top: 2rem;
  right: 2.6rem;
  width: 6.25rem;
  height: 6.25rem;
  border-radius: 999px;
  background: radial-gradient(circle at 34% 32%, rgba(255, 251, 238, 0.98), rgba(181, 210, 251, 0.82));
  box-shadow:
    0 0 26px rgba(171, 205, 249, 0.3),
    0 0 64px rgba(171, 205, 249, 0.18);
  animation: dreaming-moon-glow 9s ease-in-out infinite alternate;
}

.dreaming-stage__moon-ring {
  top: 1.25rem;
  right: 1.85rem;
  width: 7.7rem;
  height: 7.7rem;
  border-radius: 999px;
  border: 1px solid rgba(223, 236, 255, 0.16);
}

.dreaming-stage__haze {
  inset: auto auto 1.8rem -2rem;
  width: 18rem;
  height: 10rem;
  background: radial-gradient(ellipse, rgba(157, 194, 255, 0.18), transparent 68%);
  filter: blur(12px);
  animation: dreaming-haze-drift 16s ease-in-out infinite alternate;
}

.dreaming-stage__tide {
  inset: auto -5% -14% -5%;
  height: 9rem;
  background:
    radial-gradient(circle at 25% 18%, rgba(255, 255, 255, 0.1), transparent 11%),
    linear-gradient(180deg, transparent, rgba(82, 114, 170, 0.26));
}

.dreaming-stage__star {
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 999px;
  background: rgba(244, 249, 255, 0.88);
  box-shadow: 0 0 16px rgba(255, 255, 255, 0.3);
  animation: dreaming-star-twinkle 3.2s ease-in-out infinite alternate;
}

.star-1 { top: 2.4rem; left: 2.4rem; }
.star-2 { top: 4rem; left: 5.8rem; width: 0.24rem; height: 0.24rem; animation-delay: 0.5s; }
.star-3 { top: 6rem; left: 4.4rem; width: 0.28rem; height: 0.28rem; animation-delay: 1.2s; }
.star-4 { top: 3.5rem; right: 11.5rem; width: 0.22rem; height: 0.22rem; animation-delay: 0.8s; }
.star-5 { top: 6.8rem; right: 9.6rem; animation-delay: 1.6s; }
.star-6 { top: 9.2rem; left: 16rem; width: 0.22rem; height: 0.22rem; animation-delay: 0.2s; }

.dreaming-stage__copy {
  position: relative;
  display: grid;
  gap: 1rem;
  max-width: 42rem;
}

.dreaming-stage__copy :deep(.eyebrow),
.dreaming-stage__copy :deep(.page-title),
.dreaming-stage__copy :deep(.page-copy) {
  color: var(--dream-scene-text);
}

.dreaming-stage__copy :deep(.page-copy) {
  max-width: 36rem;
  color: var(--dream-scene-muted);
}

.dreaming-stage__statusline {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  width: fit-content;
  max-width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--dream-scene-muted);
  backdrop-filter: blur(18px);
}

.dreaming-stage__statusline strong {
  color: var(--dream-scene-text);
}

.dreaming-stage__statusline.live {
  background: rgba(147, 199, 255, 0.12);
}

.dreaming-stage__statusdot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: rgba(202, 214, 232, 0.72);
  box-shadow: 0 0 0 0 rgba(202, 214, 232, 0.2);
}

.dreaming-stage__statusline.live .dreaming-stage__statusdot {
  background: var(--dream-success);
  animation: dreaming-pulse 2.4s ease-in-out infinite;
}

.dreaming-stage__band {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.8rem;
  margin-top: auto;
}

.dreaming-band-stat {
  display: grid;
  gap: 0.3rem;
  padding: 0.95rem 1rem;
  border-radius: 1.15rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(14px);
}

.dreaming-band-stat span {
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dream-scene-muted);
}

.dreaming-band-stat strong {
  color: var(--dream-scene-text);
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
}

.dreaming-stage__dock {
  display: grid;
  gap: 1rem;
  align-content: start;
  padding: 1.2rem 1.1rem;
  border-radius: 1.45rem;
  background: var(--dream-dock-bg);
  border: 1px solid var(--dream-surface-border);
  backdrop-filter: blur(18px);
}

.dreaming-stage__dock-head {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: flex-start;
}

.dreaming-stage__dock-head h3 {
  margin: 0.2rem 0 0;
  color: var(--dream-body-text);
}

.dreaming-slot-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.42rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--dream-surface-border);
  color: var(--dream-body-text);
  font-size: 0.78rem;
  white-space: nowrap;
}

.dreaming-stage__toggle {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 1.15rem;
  background: var(--dream-surface);
  border: 1px solid var(--dream-surface-border);
}

.dreaming-stage__toggle-copy {
  display: grid;
  gap: 0.35rem;
}

.dreaming-stage__toggle-copy strong {
  color: var(--dream-body-text);
}

.dreaming-stage__toggle-copy p,
.dreaming-workbench__copy,
.dreaming-pane__head p,
.dreaming-river__summary,
.dreaming-signal-rack__item p,
.dreaming-readiness-list p {
  margin: 0;
  color: var(--dream-body-muted);
  line-height: 1.55;
}

.dreaming-toggle-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  min-height: 2.9rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--dream-surface-border-strong);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 219, 166, 0.14), rgba(166, 199, 255, 0.12));
  color: var(--dream-body-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background 160ms ease;
}

.dreaming-toggle-button:hover:not(:disabled),
.dreaming-toggle-button:focus-visible:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(209, 224, 249, 0.34);
}

.dreaming-toggle-button:disabled {
  cursor: progress;
  opacity: 0.72;
}

.dreaming-toggle-button__dot {
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 999px;
  background: rgba(188, 203, 226, 0.8);
}

.dreaming-toggle-button.active .dreaming-toggle-button__dot {
  background: var(--dream-success);
  box-shadow: 0 0 14px rgba(73, 211, 158, 0.28);
}

.dreaming-stage__controls {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.dreaming-stage__action-well {
  display: grid;
  gap: 0.8rem;
  padding: 0.95rem 1rem;
  border-radius: 1rem;
  background: var(--dream-surface);
  border: 1px solid var(--dream-surface-border);
}

.dreaming-stage__action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.dreaming-stage__facts,
.dreaming-readiness-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.dreaming-stage__fact,
.dreaming-readiness-fact {
  display: grid;
  gap: 0.28rem;
  padding: 0.85rem 0.92rem;
  border-radius: 1rem;
  background: var(--dream-surface);
  border: 1px solid var(--dream-surface-border);
}

.dreaming-stage__fact span,
.dreaming-readiness-fact span,
.dreaming-river__fact span {
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dream-body-muted);
}

.dreaming-stage__fact strong,
.dreaming-readiness-fact strong,
.dreaming-river__fact strong {
  color: var(--dream-body-text);
}

.dreaming-stage__notice,
.dreaming-inline-panel {
  display: grid;
  gap: 0.45rem;
  padding: 0.95rem 1rem;
  border-radius: 1rem;
  background: var(--dream-surface);
  border: 1px solid var(--dream-surface-border);
  color: var(--dream-body-text);
}

.dreaming-stage__notice.error,
.dreaming-inline-panel.warning {
  background: linear-gradient(180deg, rgba(255, 210, 176, 0.14), rgba(255, 182, 166, 0.08));
  border-color: rgba(255, 184, 131, 0.26);
  color: var(--dream-body-text);
}

.dreaming-workbench {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 1.7rem;
  border: 1px solid var(--dream-surface-border);
  background: linear-gradient(180deg, var(--dream-surface-strong), rgba(11, 21, 36, 0.74));
  backdrop-filter: blur(18px);
}

:global(html[data-theme='light']) .dreaming-workbench {
  background: linear-gradient(180deg, var(--dream-surface-strong), rgba(246, 249, 252, 0.88));
}

.dreaming-ops-strip {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 1rem;
}

.dreaming-ops-strip__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.dreaming-rem-preview {
  align-content: start;
}

.dreaming-rem-preview__facts {
  margin-top: 0.1rem;
}

.dreaming-rem-preview__notes {
  display: grid;
  gap: 0.45rem;
}

.dreaming-rem-preview__notes p {
  margin: 0;
  color: var(--dream-body-muted);
  line-height: 1.55;
}

.dreaming-rem-preview__markdown {
  margin: 0;
  padding: 1rem;
  border-radius: 1rem;
  background: var(--dream-paper-bg);
  border: 1px solid var(--dream-paper-border);
  white-space: pre-wrap;
  font: inherit;
  line-height: 1.68;
  color: var(--dream-body-text);
}

.dreaming-workbench__bar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-end;
}

.dreaming-workbench__bar h3,
.dreaming-pane__head h4,
.dreaming-river__phase h4,
.dreaming-diary-sheet__head h4 {
  margin: 0.2rem 0 0;
  color: var(--dream-body-text);
}

.dreaming-workbench__tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.35rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--dream-surface-border);
}

.dreaming-workbench__tab {
  appearance: none;
  border: none;
  border-radius: 999px;
  padding: 0.7rem 1rem;
  background: transparent;
  color: var(--dream-body-muted);
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease,
    transform 140ms ease;
}

.dreaming-workbench__tab[data-state='active'] {
  background: linear-gradient(135deg, rgba(168, 200, 255, 0.18), rgba(255, 214, 164, 0.12));
  color: var(--dream-body-text);
}

.dreaming-workbench__tab:hover:not([data-state='active']) {
  color: var(--dream-body-text);
  transform: translateY(-1px);
}

.dreaming-workbench__panel {
  min-width: 0;
}

.dreaming-pane {
  display: grid;
  gap: 1rem;
}

.dreaming-pane__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.dreaming-pane__head.compact {
  margin-bottom: 0.3rem;
}

.dreaming-river {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem;
}

.dreaming-river__line {
  position: absolute;
  top: 3.15rem;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(183, 207, 242, 0.22), transparent);
  pointer-events: none;
}

.dreaming-river__phase {
  position: relative;
  display: grid;
  gap: 0.85rem;
  padding: 1.1rem;
  border-radius: 1.25rem;
  background: var(--dream-surface);
  border: 1px solid var(--dream-surface-border);
}

.dreaming-river__phase::before {
  content: '';
  position: absolute;
  top: 2.78rem;
  left: 1rem;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
  background: rgba(190, 207, 230, 0.82);
  box-shadow: 0 0 0 0 rgba(190, 207, 230, 0.16);
}

.dreaming-river__phase.active::before {
  background: var(--dream-accent);
  animation: dreaming-pulse 2.6s ease-in-out infinite;
}

.dreaming-river__phase-head {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: flex-start;
}

.dreaming-river__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.72rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--dream-surface-border);
  color: var(--dream-body-muted);
  font-size: 0.78rem;
}

.dreaming-river__badge.active {
  color: var(--dream-success);
  border-color: rgba(127, 235, 194, 0.24);
}

.dreaming-river__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.dreaming-river__fact {
  display: grid;
  gap: 0.2rem;
  padding: 0.8rem 0.82rem;
  border-radius: 0.95rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.dreaming-signal-rack {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
}

.dreaming-signal-rack__item {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border-radius: 1.15rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
  border: 1px solid var(--dream-surface-border);
}

.dreaming-signal-rack__item span {
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dream-body-muted);
}

.dreaming-signal-rack__item strong {
  color: var(--dream-body-text);
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
}

.dreaming-grounded-lane {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 1.2rem;
  background: var(--dream-surface);
  border: 1px solid var(--dream-surface-border);
}

.dreaming-grounded-lane__list {
  display: grid;
  gap: 0.85rem;
}

.dreaming-grounded-lane__item {
  display: grid;
  gap: 0.55rem;
  padding: 1rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--dream-surface-border);
}

.dreaming-grounded-lane__head {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: flex-start;
}

.dreaming-grounded-lane__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.72rem;
  border-radius: 999px;
  background: rgba(168, 200, 255, 0.12);
  border: 1px solid var(--dream-surface-border);
  color: var(--dream-body-text);
  font-size: 0.78rem;
}

.dreaming-grounded-lane__snippet,
.dreaming-grounded-lane__hint {
  margin: 0;
  color: var(--dream-body-muted);
  line-height: 1.55;
}

.dreaming-grounded-lane__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  color: var(--dream-body-muted);
  font-size: 0.85rem;
}

.dreaming-diary-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  color: var(--dream-body-muted);
  font-size: 0.86rem;
}

.dreaming-diary-shell {
  display: grid;
  grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.15fr);
  gap: 1rem;
  min-height: 25rem;
}

.dreaming-diary-shell__rail {
  display: grid;
  gap: 0.7rem;
  align-content: start;
  padding-right: 0.2rem;
  max-height: 34rem;
  overflow: auto;
}

.dreaming-diary-shell__entry {
  display: grid;
  gap: 0.35rem;
  width: 100%;
  padding: 0.95rem 1rem;
  border-radius: 1rem;
  border: 1px solid var(--dream-surface-border);
  background: var(--dream-surface);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    transform 140ms ease,
    background 140ms ease;
}

.dreaming-diary-shell__entry strong {
  color: var(--dream-body-text);
}

.dreaming-diary-shell__entry p {
  margin: 0;
  color: var(--dream-body-muted);
  line-height: 1.5;
}

.dreaming-diary-shell__entry.active,
.dreaming-diary-shell__entry:hover {
  transform: translateY(-1px);
  border-color: var(--dream-surface-border-strong);
  background: linear-gradient(135deg, rgba(168, 200, 255, 0.12), rgba(255, 214, 164, 0.06));
}

.dreaming-diary-sheet {
  display: grid;
  gap: 1rem;
  align-content: start;
  padding: 1.35rem;
  border-radius: 1.35rem;
  min-height: 25rem;
  background: var(--dream-paper-bg);
  border: 1px solid var(--dream-paper-border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.dreaming-diary-sheet__head {
  display: grid;
  gap: 0.28rem;
}

.dreaming-diary-sheet__body {
  margin: 0;
  white-space: pre-wrap;
  font: inherit;
  line-height: 1.74;
  color: var(--dream-body-text);
}

.dreaming-readiness-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.dreaming-readiness-list {
  display: grid;
  gap: 0.45rem;
}

.dreaming-readiness-list strong {
  color: var(--dream-body-text);
}

.dreaming-readiness-list ul {
  margin: 0;
  padding-left: 1rem;
  display: grid;
  gap: 0.35rem;
  color: var(--dream-body-muted);
}

.dreaming-empty-state,
.dreaming-empty-inline {
  display: grid;
  gap: 0.35rem;
  padding: 1.05rem 1rem;
  border-radius: 1rem;
  background: var(--dream-surface);
  border: 1px solid var(--dream-surface-border);
  color: var(--dream-body-muted);
}

.dreaming-empty-state strong {
  color: var(--dream-body-text);
}

@keyframes dreaming-star-twinkle {
  0% {
    opacity: 0.22;
    transform: scale(0.82);
  }
  100% {
    opacity: 0.85;
    transform: scale(1.16);
  }
}

@keyframes dreaming-moon-glow {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-4px);
  }
}

@keyframes dreaming-haze-drift {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(24px);
  }
}

@keyframes dreaming-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(130, 206, 179, 0.16);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(130, 206, 179, 0);
  }
}

@media (max-width: 1180px) {
  .dreaming-stage,
  .dreaming-ops-strip,
  .dreaming-readiness-grid,
  .dreaming-diary-shell,
  .dreaming-river,
  .dreaming-signal-rack,
  .dreaming-stage__action-grid {
    grid-template-columns: 1fr;
  }

  .dreaming-stage__scene {
    min-height: 20rem;
  }
}

@media (max-width: 820px) {
  .dreaming-workbench__bar,
  .dreaming-pane__head,
  .dreaming-stage__dock-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .dreaming-stage__facts,
  .dreaming-readiness-facts,
  .dreaming-river__facts,
  .dreaming-stage__band,
  .dreaming-ops-strip__grid {
    grid-template-columns: 1fr;
  }

  .dreaming-grounded-lane__head {
    flex-direction: column;
    align-items: flex-start;
  }

  .dreaming-stage__moon {
    width: 4.8rem;
    height: 4.8rem;
    right: 1.2rem;
  }

  .dreaming-stage__moon-ring {
    width: 6rem;
    height: 6rem;
    right: 0.65rem;
    top: 1.45rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dreaming-stage__moon,
  .dreaming-stage__haze,
  .dreaming-stage__star,
  .dreaming-stage__statusdot,
  .dreaming-river__phase::before {
    animation: none !important;
  }

  .dreaming-toggle-button,
  .dreaming-workbench__tab,
  .dreaming-diary-shell__entry {
    transition: none;
  }
}
</style>
