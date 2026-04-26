<template>
  <section class="chat-conversation-pane">
    <header class="chat-conversation-pane__header">
      <div class="chat-conversation-pane__head">
        <div class="chat-conversation-pane__avatar">
          <AgentAvatarContent
            :avatar="agentAvatar"
            :emoji="agentEmoji"
            :fallback="agentInitial"
            :alt="agentName"
          />
        </div>
        <div class="chat-conversation-pane__copy">
          <strong>{{ title }}</strong>
          <div class="chat-conversation-pane__head-meta">
            <span class="chat-conversation-pane__subtitle">{{ subtitle }}</span>
            <span v-if="activeRunId" class="chat-conversation-pane__status">
              <span class="chat-conversation-pane__status-dot"></span>
              {{ text('生成中', 'Streaming') }}
            </span>
            <span v-else-if="selectedSession && !selectedSession.permissions.writable" class="chat-conversation-pane__status muted">
              {{ text('只读', 'Read-only') }}
            </span>
          </div>
          <div v-if="headerSummaryItems.length" class="chat-conversation-pane__summary">
            <span
              v-for="item in headerSummaryItems"
              :key="item.key"
              class="chat-conversation-pane__summary-chip"
              :class="`tone-${item.tone}`"
            >
              <span
                v-if="item.dot"
                class="chat-conversation-pane__summary-dot"
                :class="`tone-${item.tone}`"
              ></span>
              <span class="chat-conversation-pane__summary-text">{{ item.label }}</span>
            </span>
          </div>
        </div>
      </div>

      <div class="chat-conversation-pane__actions">
        <button
          v-if="selectedSession"
          type="button"
          class="chat-conversation-pane__exec-toggle"
          :class="{
            active: globalHostManagementExecEnabled && sessionHostManagementExecEnabled,
            unavailable: !globalHostManagementExecEnabled,
          }"
          :title="hostManagementExecToggleTitle"
          :disabled="!canToggleHostManagementExec || hostManagementExecToggleBusy"
          @click="$emit('toggle-host-management-exec', !sessionHostManagementExecEnabled)"
        >
          <span class="chat-conversation-pane__exec-toggle-dot"></span>
          <span>Exec</span>
        </button>

        <button
          type="button"
          class="chat-conversation-pane__icon-btn chat-conversation-pane__icon-btn--desktop-secondary"
          :class="{ active: showToolPreviews }"
          :title="showToolPreviews ? text('隐藏工具过程', 'Hide tool previews') : text('显示工具过程', 'Show tool previews')"
          @click="$emit('toggle-tool-previews')"
        >
          ⌘
        </button>

        <button
          type="button"
          class="chat-conversation-pane__icon-btn chat-conversation-pane__icon-btn--desktop-secondary"
          :class="{ active: showThinkingBlocks }"
          :title="showThinkingBlocks ? text('隐藏思考块', 'Hide thinking blocks') : text('显示思考块', 'Show thinking blocks')"
          @click="$emit('toggle-thinking-blocks')"
        >
          ⋯
        </button>

        <button
          v-if="selectedSession"
          type="button"
          class="chat-conversation-pane__icon-btn chat-conversation-pane__icon-btn--desktop-secondary"
          :class="{ active: refreshBusy }"
          :title="text('刷新对话', 'Refresh conversation')"
          :disabled="!canRefresh"
          @click="$emit('refresh-session')"
        >
          ↻
        </button>

        <button
          v-if="selectedSession"
          type="button"
          class="chat-conversation-pane__icon-btn"
          :class="{ active: recordBrowserOpen || recordBrowserHasActiveFilters }"
          :title="text('聊天记录', 'Chat records')"
          @click="$emit('open-record-browser')"
        >
          ☰
        </button>

        <DropdownMenuRoot v-model:open="conversationMenuOpen">
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              class="chat-conversation-pane__ghost"
              :aria-expanded="String(conversationMenuOpen)"
            >
              {{ text('更多', 'More') }}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              class="chat-session-menu-popover"
              side="bottom"
              align="end"
              :side-offset="8"
              :collision-padding="16"
              @close-auto-focus.prevent
            >
              <DropdownMenuItem class="chat-session-menu-item" @select="triggerMenuAction('new-chat')">
                {{ text('新建会话', 'New chat') }}
              </DropdownMenuItem>
              <DropdownMenuItem class="chat-session-menu-item" @select="triggerMenuAction('toggle-inspect')">
                {{ inspectPinned ? text('关闭调试', 'Close inspect') : text('打开调试台', 'Open workbench') }}
              </DropdownMenuItem>
              <DropdownMenuItem class="chat-session-menu-item" @select="openRenderingSettings">
                {{ text('渲染设置', 'Rendering settings') }}
              </DropdownMenuItem>
              <DropdownMenuItem class="chat-session-menu-item" @select="triggerMenuAction('toggle-tool-previews')">
                {{ showToolPreviews ? text('隐藏工具过程', 'Hide tool previews') : text('显示工具过程', 'Show tool previews') }}
              </DropdownMenuItem>
              <DropdownMenuItem class="chat-session-menu-item" @select="triggerMenuAction('toggle-thinking-blocks')">
                {{ showThinkingBlocks ? text('隐藏思考块', 'Hide thinking blocks') : text('显示思考块', 'Show thinking blocks') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="selectedSession"
                class="chat-session-menu-item"
                :disabled="!canRefresh"
                @select="triggerMenuAction('refresh-session')"
              >
                {{ text('刷新对话', 'Refresh conversation') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="selectedSession"
                class="chat-session-menu-item"
                @select="triggerMenuAction('open-record-browser')"
              >
                {{ text('聊天记录', 'Chat records') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="selectedSession"
                class="chat-session-menu-item"
                :disabled="!canToggleHostManagementExec || hostManagementExecToggleBusy || !globalHostManagementExecEnabled"
                @select="toggleHostManagementExecFromMenu"
              >
                {{ sessionHostManagementExecEnabled
                  ? text('关闭本会话 Exec', 'Disable Exec for this chat')
                  : text('开启本会话 Exec', 'Enable Exec for this chat') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="chat-session-menu-item"
                :disabled="!canReset"
                @select="triggerMenuAction('reset')"
              >
                {{ text('重置 Session', 'Reset Session') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </header>

    <DialogRoot v-model:open="mobileActionSheetOpen">
      <DialogPortal>
        <DialogOverlay class="chat-conversation-pane__mobile-sheet-mask" />
        <DialogContent as-child @close-auto-focus.prevent>
          <div class="chat-conversation-pane__mobile-sheet">
            <header class="chat-conversation-pane__mobile-sheet-head">
              <div class="chat-conversation-pane__mobile-sheet-copy">
                <DialogTitle as-child>
                  <strong>{{ text('会话操作', 'Conversation actions') }}</strong>
                </DialogTitle>
                <DialogDescription as-child>
                  <span>{{ text('把次级操作收进底部操作表，避免继续挤压聊天顶部。', 'Secondary actions live in a bottom sheet so the header stays clean.') }}</span>
                </DialogDescription>
              </div>
              <DialogClose as-child>
                <button
                  type="button"
                  class="chat-conversation-pane__mobile-sheet-close"
                  :aria-label="text('关闭更多操作', 'Close more actions')"
                >
                  ×
                </button>
              </DialogClose>
            </header>

            <div class="chat-conversation-pane__mobile-sheet-grid">
              <button type="button" class="chat-conversation-pane__mobile-sheet-action" @click="triggerMenuAction('new-chat')">
                <span class="chat-conversation-pane__mobile-sheet-action-icon">＋</span>
                <span class="chat-conversation-pane__mobile-sheet-action-copy">
                  <strong>{{ text('新建会话', 'New chat') }}</strong>
                  <span>{{ text('立即开始新的对话线程。', 'Start a new conversation thread right away.') }}</span>
                </span>
              </button>
              <button type="button" class="chat-conversation-pane__mobile-sheet-action" @click="triggerMenuAction('toggle-inspect')">
                <span class="chat-conversation-pane__mobile-sheet-action-icon">⌘</span>
                <span class="chat-conversation-pane__mobile-sheet-action-copy">
                  <strong>{{ inspectPinned ? text('关闭调试台', 'Close workbench') : text('打开调试台', 'Open workbench') }}</strong>
                  <span>{{ text('查看运行细节和调试信息。', 'Open runtime details and diagnostics.') }}</span>
                </span>
              </button>
              <button
                v-if="selectedSession"
                type="button"
                class="chat-conversation-pane__mobile-sheet-action"
                @click="triggerMenuAction('open-record-browser')"
              >
                <span class="chat-conversation-pane__mobile-sheet-action-icon">☰</span>
                <span class="chat-conversation-pane__mobile-sheet-action-copy">
                  <strong>{{ text('聊天记录', 'Chat records') }}</strong>
                  <span>{{ text('打开当前会话的独立记录浏览器。', 'Open the dedicated record browser for this chat.') }}</span>
                </span>
              </button>
              <button type="button" class="chat-conversation-pane__mobile-sheet-action" @click="openRenderingSettings">
                <span class="chat-conversation-pane__mobile-sheet-action-icon">◫</span>
                <span class="chat-conversation-pane__mobile-sheet-action-copy">
                  <strong>{{ text('渲染设置', 'Rendering settings') }}</strong>
                  <span>{{ text('调整 Mermaid / HTML / SVG 的默认渲染方式。', 'Adjust Mermaid / HTML / SVG defaults.') }}</span>
                </span>
              </button>
              <button
                type="button"
                class="chat-conversation-pane__mobile-sheet-action"
                :disabled="!canReset"
                @click="triggerMenuAction('reset')"
              >
                <span class="chat-conversation-pane__mobile-sheet-action-icon">↺</span>
                <span class="chat-conversation-pane__mobile-sheet-action-copy">
                  <strong>{{ text('重置 Session', 'Reset Session') }}</strong>
                  <span>{{ text('清理当前会话状态并重新开始。', 'Reset the current session state and start clean.') }}</span>
                </span>
              </button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <div v-if="gatewayWarning" class="chat-conversation-pane__notice chat-conversation-pane__notice-error">
      {{ gatewayWarning }}
    </div>

    <div v-if="slashFeedback" class="chat-conversation-pane__slash-feedback">
      <SlashCommandFeedbackBar
        :feedback="slashFeedback"
        @dismiss="$emit('dismiss-slash-feedback')"
      />
    </div>

    <div v-if="accessError" class="chat-conversation-pane__blocked">
      <h3>{{ text('这个会话不属于开放聊天面', 'This session is not part of the open chat surface') }}</h3>
      <p>{{ accessError }}</p>
      <button type="button" class="secondary-button compact-button" @click="$emit('toggle-inspect')">
        {{ text('切到调试台查看', 'Open in workbench') }}
      </button>
    </div>

    <div v-else class="chat-conversation-pane__body">
      <section class="chat-conversation-thread" ref="threadBody" @scroll="handleThreadScroll" @wheel.passive="handleThreadWheel">
        <div ref="historyTopSentinel" class="chat-conversation-thread__top-sentinel" aria-hidden="true"></div>
        <div
          v-if="showHistoryLoadingBeforeIndicator"
          class="chat-conversation-thread__loading-indicator chat-conversation-thread__loading-indicator--before"
        >
          <span class="chat-conversation-thread__spinner"></span>
        </div>
        <div v-if="viewingHistoricalPosition && !historyLoadingInitial" class="chat-conversation-thread__history-banner">
          <span class="chat-conversation-thread__history-banner-icon">↑</span>
          <span>{{ text('正在查看历史消息', 'Viewing historical messages') }}</span>
          <button type="button" class="chat-conversation-thread__history-banner-action" @click="$emit('jump-to-live')">
            {{ text('返回最新', 'Return to latest') }}
          </button>
        </div>
        <div
          v-if="showActiveRunPlaceholder"
          class="chat-conversation-thread__live-placeholder"
          role="status"
          aria-live="polite"
        >
          <span class="chat-conversation-thread__live-placeholder-dot" aria-hidden="true"></span>
          <span>{{ text('正在处理中，等待实时消息或工具过程返回。', 'Processing. Waiting for live assistant or tool updates.') }}</span>
        </div>
        <div v-if="!selectedSession" class="chat-conversation-empty">
          <h3>{{ text('开始新的聊天', 'Start a new chat') }}</h3>
          <p>{{ text('左侧保留你的会话列表，新的会话会在这里展开。', 'Your conversations stay on the left, and new chats open right here.') }}</p>
          <button type="button" class="primary-button compact-button" @click="$emit('new-chat')">
            {{ text('新建会话', 'New chat') }}
          </button>
        </div>
        <div v-else-if="showInitialLoadingState" class="chat-conversation-empty">
          {{ text('正在读取对话...', 'Loading conversation...') }}
        </div>
        <div v-else-if="historyErrorMessage" class="chat-conversation-empty chat-conversation-empty-error">
          {{ historyErrorMessage }}
        </div>
        <div v-else-if="!timelineItems.length" class="chat-conversation-empty">
          <h3>{{ text('这里还没有消息', 'No messages yet') }}</h3>
          <p>{{ text('从底部输入框开始，新的对话会在这里自然展开。', 'Use the composer below and the conversation will unfold here.') }}</p>
        </div>
        <div v-else class="chat-conversation-groups">
          <div
            v-for="(item, itemIndex) in timelineItems"
            :id="timelineItemAnchorId(item) || undefined"
            :key="item.id"
            class="chat-conversation-thread__item-shell"
            :style="timelineItemShellStyle(item, itemIndex)"
            :ref="(el) => setTimelineItemShellRef(item.id, el as HTMLElement | null)"
          >
            <div
              v-if="dateSeparatorLabel(item, itemIndex)"
              class="chat-conversation-thread__date-separator"
            >
              <span>{{ dateSeparatorLabel(item, itemIndex) }}</span>
            </div>
            <MessageBubble
              v-if="isTimelineItemVisible(itemIndex)"
              v-memo="timelineItemMemoKey(item)"
              :group="item.type === 'message_group' ? item.group : null"
              :overlay="item.type === 'run_overlay' ? item.overlay : null"
              :overlay-anchor-message-ids="item.type === 'run_overlay' ? item.anchorMessageIds : []"
              :overlay-process-blocks="item.type === 'run_overlay' ? item.processBlocks : []"
              :covered-tool-call-ids="overlayToolCallIds"
              :show-tool-previews="showToolPreviews"
              :show-thinking-blocks="showThinkingBlocks"
              :agent-name="agentName"
              :agent-avatar="agentAvatar"
              :agent-emoji="agentEmoji"
              :agent-initial="agentInitial"
              :active-run-id="activeRunId"
              :active-streaming-message-id="activeStreamingMessageId"
              :session-key="selectedSession?.key || null"
              :force-eager-render="shouldForceEagerTimelineItem(itemIndex)"
            />
            <div
              v-else
              class="chat-conversation-thread__item-placeholder"
              aria-hidden="true"
            ></div>
          </div>
        </div>
        <div
          v-if="showHistoryLoadingAfterIndicator"
          class="chat-conversation-thread__loading-indicator chat-conversation-thread__loading-indicator--after"
        >
          <span class="chat-conversation-thread__spinner"></span>
        </div>
        <div v-if="hasMoreAfter" ref="historyBottomSentinel" class="chat-conversation-thread__bottom-sentinel" aria-hidden="true"></div>
        <button
          v-if="showJumpToBottom"
          type="button"
          class="chat-conversation-thread__jump-fab"
          :class="{ 'has-text': viewingHistoricalPosition }"
          @click="jumpToBottom"
        >
          <span v-if="viewingHistoricalPosition" class="chat-conversation-thread__jump-text">{{ text('返回最新', 'Return to latest') }}</span>
          <span class="chat-conversation-thread__jump-arrow">↓</span>
          <span
            v-if="pendingUnreadCount > 0 && !viewingHistoricalPosition"
            class="chat-conversation-thread__jump-badge"
          >{{ pendingUnreadCount > 99 ? '99+' : pendingUnreadCount }}</span>
        </button>
      </section>

      <footer
        class="chat-conversation-pane__composer"
        :style="{ '--chat-mobile-composer-lift': `${mobileComposerLift}px` }"
      >
        <div class="chat-conversation-pane__mobile-dock">
          <button
            type="button"
            class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--nav"
            :aria-label="text('打开会话列表', 'Open session list')"
            @click="$emit('open-session-list')"
          >
            <span class="chat-conversation-pane__mobile-dock-icon">☰</span>
            <span class="chat-conversation-pane__mobile-dock-label">{{ text('会话', 'Chats') }}</span>
          </button>
          <button
            type="button"
            class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--refresh"
            :disabled="!canRefresh"
            @click="$emit('refresh-session')"
          >
            <span class="chat-conversation-pane__mobile-dock-icon">↻</span>
            <span class="chat-conversation-pane__mobile-dock-label">{{ text('刷新', 'Refresh') }}</span>
          </button>
          <button
            type="button"
            class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--exec"
            :class="{
              active: globalHostManagementExecEnabled && sessionHostManagementExecEnabled,
              unavailable: !globalHostManagementExecEnabled,
            }"
            :title="hostManagementExecToggleTitle"
            :disabled="!canToggleHostManagementExec || hostManagementExecToggleBusy"
            @click="$emit('toggle-host-management-exec', !sessionHostManagementExecEnabled)"
          >
            <span class="chat-conversation-pane__mobile-dock-dot"></span>
            <span class="chat-conversation-pane__mobile-dock-label">Exec</span>
          </button>
          <button
            type="button"
            class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--tools"
            :class="{ active: showToolPreviews }"
            :title="showToolPreviews ? text('隐藏工具过程', 'Hide tool previews') : text('显示工具过程', 'Show tool previews')"
            @click="$emit('toggle-tool-previews')"
          >
            <span class="chat-conversation-pane__mobile-dock-icon">⌘</span>
            <span class="chat-conversation-pane__mobile-dock-label">{{ text('工具', 'Tools') }}</span>
          </button>
          <button
            type="button"
            class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--thinking"
            :class="{ active: showThinkingBlocks }"
            :title="showThinkingBlocks ? text('隐藏思考块', 'Hide thinking blocks') : text('显示思考块', 'Show thinking blocks')"
            @click="$emit('toggle-thinking-blocks')"
          >
            <span class="chat-conversation-pane__mobile-dock-icon">⋯</span>
            <span class="chat-conversation-pane__mobile-dock-label">{{ text('思考', 'Thinking') }}</span>
          </button>
          <button
            type="button"
            class="chat-conversation-pane__mobile-dock-btn"
            :class="{ active: mobileActionSheetOpen }"
            :aria-expanded="String(mobileActionSheetOpen)"
            @click="mobileActionSheetOpen = true"
          >
            <span class="chat-conversation-pane__mobile-dock-icon">＋</span>
            <span class="chat-conversation-pane__mobile-dock-label">{{ text('更多', 'More') }}</span>
          </button>
        </div>
        <QueuedMessageRail
          v-if="selectedSession && queuedItems.length"
          :items="queuedItems"
          :mutating-entry-id="queueMutatingEntryId"
          :summary-expanded="queueRailExpanded"
          :compact-viewport="isCompactViewport"
          @update:summary-expanded="$emit('update:queue-rail-expanded', $event)"
          @open-sheet="openQueueSheet"
          @patch-item="$emit('patch-queued-item', $event)"
          @delete-item="$emit('delete-queued-item', $event)"
        />
        <ComposerBar
          :document="composerDocument"
          :attachments="composerAttachments"
          :placeholder="placeholder"
          :disabled="composerDisabled"
          :can-send="canSend"
          :can-abort="canAbort"
          :send-busy="sendBusy"
          :abort-busy="abortBusy"
          :slash-arg-options-overrides="slashArgOptionsOverrides"
          @update:document="$emit('update:composer-document', $event)"
          @send="$emit('send', $event)"
          @abort="$emit('abort')"
          @select-files="$emit('composer-files', $event)"
          @remove-attachment="$emit('composer-remove-attachment', $event)"
          @keydown="$emit('composer-keydown', $event)"
          @viewport-lift="handleComposerViewportLift"
        />
      </footer>
    </div>
  </section>

  <DialogRoot
    :open="Boolean(selectedSession && isCompactViewport && mobileQueueSheetOpen && queuedItems.length)"
    @update:open="handleQueueSheetOpenChange"
  >
    <DialogPortal>
      <DialogOverlay class="chat-conversation-pane__queue-sheet-mask" />
      <DialogContent as-child @close-auto-focus.prevent>
        <div
          v-if="selectedSession && isCompactViewport && mobileQueueSheetOpen && queuedItems.length"
          class="chat-conversation-pane__queue-sheet"
        >
          <header class="chat-conversation-pane__queue-sheet-head">
            <div class="chat-conversation-pane__queue-sheet-copy">
              <DialogTitle as-child>
                <strong>{{ text('待发送队列', 'Queued messages') }}</strong>
              </DialogTitle>
              <DialogDescription as-child>
                <span>{{ text('这里展示当前已经排队但还没发送的消息。', 'This sheet shows messages that are queued but not sent yet.') }}</span>
              </DialogDescription>
            </div>
            <DialogClose as-child>
              <button
                type="button"
                class="chat-conversation-pane__queue-sheet-close"
                :aria-label="text('关闭待发送队列', 'Close queued messages')"
              >
                ×
              </button>
            </DialogClose>
          </header>

          <div class="chat-conversation-pane__queue-sheet-body">
            <QueuedMessageRail
              :items="queuedItems"
              :mutating-entry-id="queueMutatingEntryId"
              :summary-expanded="true"
              :compact-viewport="false"
              :presentation-mode="'sheet'"
              @patch-item="$emit('patch-queued-item', $event)"
              @delete-item="$emit('delete-queued-item', $event)"
            />
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot v-model:open="renderingSettingsOpen">
    <DialogPortal>
      <DialogOverlay class="chat-rendering-settings-mask" />
      <DialogContent as-child @close-auto-focus.prevent>
        <div class="chat-rendering-settings-dialog">
        <header class="chat-rendering-settings-head">
          <div class="chat-rendering-settings-copy">
            <DialogTitle as-child>
              <strong>{{ text('渲染设置', 'Rendering settings') }}</strong>
            </DialogTitle>
            <DialogDescription as-child>
              <span>{{ text('控制 Mermaid / HTML / SVG 在消息气泡中的默认内联渲染方式。', 'Control the default inline rendering behavior for Mermaid, HTML, and SVG blocks inside message bubbles.') }}</span>
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <button
              type="button"
              class="chat-rendering-settings-close"
              :aria-label="text('关闭渲染设置', 'Close rendering settings')"
            >
              ×
            </button>
          </DialogClose>
        </header>

        <div class="chat-rendering-settings-toolbar">
          <div class="chat-rendering-settings-scope">
            <button
              type="button"
              class="chat-rendering-settings-scope-btn"
              :class="{ active: renderingSettingsScope === 'global' }"
              @click="renderingSettingsScope = 'global'"
            >
              {{ text('全局默认', 'Global default') }}
            </button>
            <button
              type="button"
              class="chat-rendering-settings-scope-btn"
              :class="{ active: renderingSettingsScope === 'session' }"
              :disabled="!selectedSession"
              @click="renderingSettingsScope = 'session'"
            >
              {{ text('当前会话', 'Current session') }}
            </button>
            <button
              v-if="renderingSettingsScope === 'session' && selectedSession"
              type="button"
              class="chat-rendering-settings-scope-btn warn"
              :disabled="!hasSessionPreviewOverrides"
              @click="resetSessionInlinePreviewOverrides"
            >
              {{ text('重置会话覆盖', 'Reset session overrides') }}
            </button>
          </div>

          <div class="chat-rendering-settings-summary">
            <span v-if="renderingSettingsScope === 'global'">
              {{ text(
                `预览：Mermaid ${globalInlinePreviewPrefs.mermaid ? '开' : '关'} · HTML ${globalInlinePreviewPrefs.html ? '开' : '关'} · SVG ${globalInlinePreviewPrefs.svg ? '开' : '关'} · 内联HTML ${globalInlinePreviewPrefs.inlineHtml ? '开' : '关'} · 内联SVG ${globalInlinePreviewPrefs.inlineSvg ? '开' : '关'} · 脚本 ${globalInlinePreviewPrefs.inlineScript ? '开' : '关'} · 提示音 ${soundCuesEnabled ? '开' : '关'} · 安全：${sanitizeLevelLabel(globalSanitizeLevel)}`,
                `Previews: Mermaid ${globalInlinePreviewPrefs.mermaid ? 'On' : 'Off'} · HTML ${globalInlinePreviewPrefs.html ? 'On' : 'Off'} · SVG ${globalInlinePreviewPrefs.svg ? 'On' : 'Off'} · Inline HTML ${globalInlinePreviewPrefs.inlineHtml ? 'On' : 'Off'} · Inline SVG ${globalInlinePreviewPrefs.inlineSvg ? 'On' : 'Off'} · Script ${globalInlinePreviewPrefs.inlineScript ? 'On' : 'Off'} · Sound cues ${soundCuesEnabled ? 'On' : 'Off'} · Security: ${sanitizeLevelLabel(globalSanitizeLevel)}`,
              ) }}
            </span>
            <span v-else-if="selectedSession">
              {{ text(
                `会话生效值：Mermaid ${effectiveSessionPreviewPrefs.mermaid ? '开' : '关'} · HTML ${effectiveSessionPreviewPrefs.html ? '开' : '关'} · SVG ${effectiveSessionPreviewPrefs.svg ? '开' : '关'} · 内联HTML ${effectiveSessionPreviewPrefs.inlineHtml ? '开' : '关'} · 内联SVG ${effectiveSessionPreviewPrefs.inlineSvg ? '开' : '关'} · 提示音 ${soundCuesEnabled ? '开' : '关'}`,
                `Effective: Mermaid ${effectiveSessionPreviewPrefs.mermaid ? 'On' : 'Off'} · HTML ${effectiveSessionPreviewPrefs.html ? 'On' : 'Off'} · SVG ${effectiveSessionPreviewPrefs.svg ? 'On' : 'Off'} · Inline HTML ${effectiveSessionPreviewPrefs.inlineHtml ? 'On' : 'Off'} · Inline SVG ${effectiveSessionPreviewPrefs.inlineSvg ? 'On' : 'Off'} · Sound cues ${soundCuesEnabled ? 'On' : 'Off'}`,
              ) }}
            </span>
          </div>
        </div>

        <div class="chat-rendering-settings-body">
          <div class="chat-rendering-settings-grid">
            <h4 class="chat-rendering-settings-section-title">{{ text('交互反馈', 'Interaction feedback') }}</h4>
            <section class="chat-rendering-settings-row">
              <div class="chat-rendering-settings-row-copy">
                <strong>{{ text('消息提示音', 'Message sound cues') }}</strong>
                <span>{{ text('发送成功和助手开始回复时播放短提示音。默认开启，可随时关闭。', 'Play a short cue when a message is sent and when the assistant starts replying. Enabled by default and can be turned off anytime.') }}</span>
                <div class="chat-rendering-settings-inline-status">
                  <span class="chat-rendering-settings-state-pill" :class="{ active: soundCuesEnabled }">
                    {{ soundCuesEnabled ? text('当前：开启', 'On now') : text('当前：关闭', 'Off now') }}
                  </span>
                  <span class="chat-rendering-settings-state-note">
                    {{ text('适合希望保持聊天手感但不想增加噪音的场景。', 'Useful when you want chat feedback without extra noise.') }}
                  </span>
                </div>
              </div>
              <div class="chat-rendering-settings-row-actions chat-rendering-settings-row-actions--toggle">
                <button
                  type="button"
                  class="chat-rendering-settings-chip"
                  :class="{ active: soundCuesEnabled }"
                  @click="$emit('toggle-sound-cues', true)"
                >
                  {{ text('开启', 'Enable') }}
                </button>
                <button
                  type="button"
                  class="chat-rendering-settings-chip"
                  :class="{ active: !soundCuesEnabled }"
                  @click="$emit('toggle-sound-cues', false)"
                >
                  {{ text('关闭', 'Disable') }}
                </button>
              </div>
            </section>

            <!-- Section: Code block previews -->
            <h4 class="chat-rendering-settings-section-title">{{ text('代码块预览', 'Code Block Previews') }}</h4>
            <section
              v-for="kind in codeBlockPreviewKinds"
              :key="kind"
              class="chat-rendering-settings-row"
            >
              <div class="chat-rendering-settings-row-copy">
                <strong>{{ previewLabel(kind) }}</strong>
                <span v-if="renderingSettingsScope === 'global'">{{ text('控制代码块内联预览；关闭后回退为高亮代码块。', 'Controls code block inline preview; when disabled, falls back to highlighted code blocks.') }}</span>
                <span v-else>{{ sessionScopeHint(kind) }}</span>
              </div>

              <div v-if="renderingSettingsScope === 'global'" class="chat-rendering-settings-row-actions">
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: globalInlinePreviewPrefs[kind] }" @click="setGlobalInlinePreviewPreference(kind, true)">{{ text('开', 'On') }}</button>
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: !globalInlinePreviewPrefs[kind] }" @click="setGlobalInlinePreviewPreference(kind, false)">{{ text('关', 'Off') }}</button>
              </div>

              <div v-else class="chat-rendering-settings-row-actions">
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: sessionInlinePreviewOverrides[kind] == null }" @click="setSessionInlinePreviewOverride(kind, null)">{{ text('跟随默认', 'Follow default') }}</button>
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: sessionInlinePreviewOverrides[kind] === true }" @click="setSessionInlinePreviewOverride(kind, true)">{{ text('开', 'On') }}</button>
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: sessionInlinePreviewOverrides[kind] === false }" @click="setSessionInlinePreviewOverride(kind, false)">{{ text('关', 'Off') }}</button>
              </div>
            </section>

            <!-- Section: Inline content -->
            <h4 class="chat-rendering-settings-section-title">{{ text('内联内容', 'Inline Content') }}</h4>
            <section
              v-for="kind in inlineContentPreviewKinds"
              :key="kind"
              class="chat-rendering-settings-row"
            >
              <div class="chat-rendering-settings-row-copy">
                <strong>{{ previewLabel(kind) }}</strong>
                <span v-if="kind === 'inlineScript'" class="chat-rendering-settings-warn-badge">{{ text('安全风险', 'Security risk') }}</span>
                <span v-if="renderingSettingsScope === 'global'">{{ text('控制 Markdown 内嵌内容的直接渲染。', 'Controls direct rendering of inline content in Markdown.') }}</span>
                <span v-else>{{ sessionScopeHint(kind) }}</span>
              </div>

              <div v-if="renderingSettingsScope === 'global'" class="chat-rendering-settings-row-actions">
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: globalInlinePreviewPrefs[kind] }" @click="setGlobalInlinePreviewPreference(kind, true)">{{ text('开', 'On') }}</button>
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: !globalInlinePreviewPrefs[kind] }" @click="setGlobalInlinePreviewPreference(kind, false)">{{ text('关', 'Off') }}</button>
              </div>

              <div v-else class="chat-rendering-settings-row-actions">
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: sessionInlinePreviewOverrides[kind] == null }" @click="setSessionInlinePreviewOverride(kind, null)">{{ text('跟随默认', 'Follow default') }}</button>
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: sessionInlinePreviewOverrides[kind] === true }" @click="setSessionInlinePreviewOverride(kind, true)">{{ text('开', 'On') }}</button>
                <button type="button" class="chat-rendering-settings-chip" :class="{ active: sessionInlinePreviewOverrides[kind] === false }" @click="setSessionInlinePreviewOverride(kind, false)">{{ text('关', 'Off') }}</button>
              </div>
            </section>

            <!-- Section: Sanitize level -->
            <template v-if="renderingSettingsScope === 'global'">
              <h4 class="chat-rendering-settings-section-title">{{ text('安全级别', 'Security Level') }}</h4>
              <section class="chat-rendering-settings-row">
                <div class="chat-rendering-settings-row-copy">
                  <strong>{{ text('HTML/SVG 净化级别', 'HTML/SVG Sanitization') }}</strong>
                  <span v-if="sanitizeLevelWarning(globalSanitizeLevel)" class="chat-rendering-settings-warn-text">{{ sanitizeLevelWarning(globalSanitizeLevel) }}</span>
                </div>
                <div class="chat-rendering-settings-row-actions">
                  <button
                    v-for="level in sanitizeLevels"
                    :key="level"
                    type="button"
                    class="chat-rendering-settings-chip"
                    :class="{ active: globalSanitizeLevel === level, warn: level === 'permissive' }"
                    @click="setGlobalSanitizeLevelAction(level)"
                  >
                    {{ sanitizeLevelLabel(level) }}
                  </button>
                </div>
              </section>
            </template>

            <!-- Section: Role-based rendering -->
            <template v-if="renderingSettingsScope === 'global'">
              <h4 class="chat-rendering-settings-section-title">{{ text('角色渲染', 'Role-based Rendering') }}</h4>
              <section class="chat-rendering-settings-row">
                <div class="chat-rendering-settings-row-copy">
                  <strong>{{ text('按角色区分渲染', 'Differentiate by role') }}</strong>
                  <span>{{ text('开启后可为用户消息和 AI 回复设置不同的渲染行为。', 'When enabled, set different rendering behavior for user messages vs AI replies.') }}</span>
                </div>
                <div class="chat-rendering-settings-row-actions">
                  <button type="button" class="chat-rendering-settings-chip" :class="{ active: roleBasedEnabled }" @click="setRoleBasedEnabledAction(true)">{{ text('开', 'On') }}</button>
                  <button type="button" class="chat-rendering-settings-chip" :class="{ active: !roleBasedEnabled }" @click="setRoleBasedEnabledAction(false)">{{ text('关', 'Off') }}</button>
                </div>
              </section>

              <template v-if="roleBasedEnabled">
                <section
                  v-for="role in renderingRoles"
                  :key="role"
                  class="chat-rendering-settings-role-group"
                >
                  <h5 class="chat-rendering-settings-role-title">
                    {{ role === 'assistant' ? text('助手消息', 'Assistant Messages') : text('用户消息', 'User Messages') }}
                  </h5>
                  <section
                    v-for="kind in allPreviewKinds"
                    :key="`${role}-${kind}`"
                    class="chat-rendering-settings-row chat-rendering-settings-row--indented"
                  >
                    <div class="chat-rendering-settings-row-copy">
                      <strong>{{ previewLabel(kind) }}</strong>
                    </div>
                    <div class="chat-rendering-settings-row-actions">
                      <button type="button" class="chat-rendering-settings-chip" :class="{ active: rolePreviewPrefs[role][kind] }" @click="setRolePreviewPrefAction(role, kind, true)">{{ text('开', 'On') }}</button>
                      <button type="button" class="chat-rendering-settings-chip" :class="{ active: !rolePreviewPrefs[role][kind] }" @click="setRolePreviewPrefAction(role, kind, false)">{{ text('关', 'Off') }}</button>
                    </div>
                  </section>
                </section>
              </template>
            </template>
          </div>
        </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, reactive, ref, watch } from 'vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui';
import type { ChatComposerDocument, ChatQueuedMessageItem, ChatSessionRow } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import ComposerBar from './ComposerBar.vue';
import MessageBubble from './MessageBubble.vue';
import QueuedMessageRail from './QueuedMessageRail.vue';
import SlashCommandFeedbackBar from './SlashCommandFeedbackBar.vue';
import type { ChatRenderableItem } from '../../../../../lib/chat-run-overlay';
import type { StudioSlashExecutionFeedback } from './slash-feedback';
import {
  clearSessionInlinePreviewOverrides,
  listenInlinePreviewPreferenceChange,
  readGlobalInlinePreviewPreferences,
  readGlobalSanitizeLevel,
  readRoleBasedEnabled,
  readRolePreviewPreferences,
  readSessionInlinePreviewOverrides,
  type InlinePreviewKind,
  type SanitizeLevel,
  type RenderingRole,
  SANITIZE_LEVELS,
  RENDERING_ROLES,
  writeGlobalInlinePreviewPreference,
  writeGlobalSanitizeLevel,
  writeRoleBasedEnabled,
  writeRolePreviewPreference,
  writeSessionInlinePreviewOverride,
} from './inline-preview-preferences';
import {
  applyChatSessionManualScroll,
  beginChatSessionScrollRestore,
  captureChatSessionAppendAnchor,
  captureChatSessionPrependAnchor,
  createChatSessionScrollState,
  markChatSessionUserBrowseIntent,
  preserveChatSessionHistoryBrowsePosition,
  resolveChatSessionJumpToBottom,
  resolveChatSessionTimelineMutation,
  shouldObserveChatSessionBottomSentinel,
  shouldObserveChatSessionTopSentinel,
  syncChatSessionPinnedState,
  type ChatSessionScrollMetrics,
} from './chat-session-scroll-state';
import { shouldShowInitialConversationLoading } from '../../../../../lib/chat-conversation-pane-state';

const props = defineProps<{
  selectedSession: ChatSessionRow | null;
  title: string;
  subtitle: string;
  agentName: string;
  agentAvatar: string;
  agentEmoji: string;
  agentInitial: string;
  timelineItems: ChatRenderableItem[];
  overlayToolCallIds: string[];
  timelineVersion?: string;
  showToolPreviews: boolean;
  showThinkingBlocks: boolean;
  historyLoadingInitial: boolean;
  historyLoadingBefore: boolean;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  historyLoadingAfter: boolean;
  viewingHistoricalPosition: boolean;
  autoFillHistoryBeforeEnabled?: boolean;
  forceEagerHistoryRender: boolean;
  historyPrependAnchorMessageId?: string | null;
  historyErrorMessage: string;
  accessError: string;
  gatewayWarning: string;
  slashFeedback: StudioSlashExecutionFeedback | null;
  latestJumpToken?: number;
  composerDocument: ChatComposerDocument;
  composerAttachments: Array<{
    id: string;
    type: 'image' | 'video' | 'file';
    fileName?: string;
    mimeType: string;
    dataUrl: string;
    size?: number;
    progress?: number;
    uploadState?: 'uploading' | 'ready' | 'failed';
  }>;
  placeholder: string;
  composerDisabled: boolean;
  canSend: boolean;
  canAbort: boolean;
  canReset: boolean;
  canRefresh: boolean;
  sendBusy: boolean;
  abortBusy: boolean;
  refreshBusy: boolean;
  slashArgOptionsOverrides: Record<string, string[]>;
  inspectPinned: boolean;
  activeRunId: string | null;
  activeStreamingMessageId: string | null;
  queuedItems: ChatQueuedMessageItem[];
  queueRailExpanded: boolean;
  mobileQueueSheetOpen: boolean;
  soundCuesEnabled: boolean;
  globalHostManagementExecEnabled: boolean;
  sessionHostManagementExecEnabled: boolean;
  canToggleHostManagementExec: boolean;
  hostManagementExecToggleBusy: boolean;
  recordBrowserOpen: boolean;
  recordBrowserHasActiveFilters: boolean;
  queueMutatingEntryId: string | null;
}>();

const emit = defineEmits<{
  (event: 'update:composer-document', value: ChatComposerDocument): void;
  (event: 'send', value: ChatComposerDocument): void;
  (event: 'abort'): void;
  (event: 'composer-files', payload: File[]): void;
  (event: 'composer-remove-attachment', attachmentId: string): void;
  (event: 'reset'): void;
  (event: 'new-chat'): void;
  (event: 'toggle-inspect'): void;
  (event: 'toggle-tool-previews'): void;
  (event: 'toggle-thinking-blocks'): void;
  (event: 'open-session-list'): void;
  (event: 'refresh-session'): void;
  (event: 'composer-keydown', payload: KeyboardEvent): void;
  (event: 'patch-queued-item', payload: { entryId: string; text: string }): void;
  (event: 'delete-queued-item', entryId: string): void;
  (event: 'toggle-host-management-exec', nextValue: boolean): void;
  (event: 'toggle-sound-cues', value: boolean): void;
  (event: 'load-more-before', mode?: 'browse' | 'autofill' | 'continuation'): void;
  (event: 'prefetch-more-before'): void;
  (event: 'prefetch-more-after'): void;
  (event: 'load-more-after'): void;
  (event: 'history-before-render-settled'): void;
  (event: 'jump-to-live'): void;
  (event: 'jump-to-message', messageId: string): void;
  (event: 'open-record-browser'): void;
  (event: 'update:queue-rail-expanded', value: boolean): void;
  (event: 'update:mobile-queue-sheet-open', value: boolean): void;
  (event: 'dismiss-slash-feedback'): void;
}>();

const { text } = useLocalePreference();
type HeaderSummaryItem = {
  key: string;
  label: string;
  tone: 'neutral' | 'accent' | 'muted' | 'pending' | 'identity';
  dot?: boolean;
};
const hostManagementExecToggleTitle = computed(() => {
  if (!props.selectedSession) {
    return text('当前没有可配置的会话。', 'No active chat to configure.');
  }
  if (!props.globalHostManagementExecEnabled) {
    return text(
      '全局开关未开启。前往 Config > 沙盒与安全，打开“允许在 Studio Chat 中启用宿主管理 Exec”。',
      'The global switch is off. Go to Config > Sandbox & Security and enable “Allow host-management Exec in Studio Chat”.',
    );
  }
  return props.sessionHostManagementExecEnabled
    ? text(
      '当前会话已允许宿主管理 Exec；刷新保留，Studio 重启后失效。',
      'Host-management Exec is enabled for this chat; it survives refresh and resets after Studio restarts.',
    )
    : text(
      '点击为当前会话开启宿主管理 Exec。',
      'Click to enable host-management Exec for this chat.',
    );
});
const headerSummaryItems = computed<HeaderSummaryItem[]>(() => {
  const items: HeaderSummaryItem[] = [];
  const agentName = props.agentName.trim();
  if (agentName) {
    items.push({
      key: 'agent',
      label: agentName,
      tone: 'identity',
    });
  }
  if (props.selectedSession) {
    items.push({
      key: 'session-mode',
      label: props.selectedSession.permissions.writable
        ? text('对话', 'Chat')
        : text('观察', 'Inspect'),
      tone: props.selectedSession.permissions.writable ? 'neutral' : 'muted',
    });
  }
  if (props.activeRunId) {
    items.push({
      key: 'runtime',
      label: text('生成中', 'Streaming'),
      tone: 'accent',
      dot: true,
    });
  } else if (props.selectedSession && !props.selectedSession.permissions.writable) {
    items.push({
      key: 'runtime',
      label: text('只读', 'Read-only'),
      tone: 'muted',
    });
  } else if (props.selectedSession) {
    items.push({
      key: 'runtime',
      label: text('空闲', 'Idle'),
      tone: 'neutral',
    });
  }
  if (props.queuedItems.length > 0) {
    items.push({
      key: 'queue',
      label: text(`${props.queuedItems.length} 条待发送`, `${props.queuedItems.length} queued`),
      tone: 'pending',
    });
  }
  return items;
});
const threadBody = ref<HTMLElement | null>(null);
const historyTopSentinel = ref<HTMLElement | null>(null);
const historyBottomSentinel = ref<HTMLElement | null>(null);
const conversationMenuOpen = ref(false);
const mobileActionSheetOpen = ref(false);
const isCompactViewport = ref(false);
const mobileComposerLift = ref(0);
const renderingSettingsOpen = ref(false);
const renderingSettingsScope = ref<'global' | 'session'>('global');
const codeBlockPreviewKinds: InlinePreviewKind[] = ['mermaid', 'html', 'svg'];
const inlineContentPreviewKinds: InlinePreviewKind[] = ['inlineHtml', 'inlineSvg', 'inlineScript'];
const allPreviewKinds: InlinePreviewKind[] = [...codeBlockPreviewKinds, ...inlineContentPreviewKinds];
const sanitizeLevels = SANITIZE_LEVELS;
const renderingRoles = RENDERING_ROLES;
const globalInlinePreviewPrefs = ref(readGlobalInlinePreviewPreferences());
const globalSanitizeLevel = ref<SanitizeLevel>(readGlobalSanitizeLevel());
const roleBasedEnabled = ref(readRoleBasedEnabled());
const rolePreviewPrefs = ref<Record<RenderingRole, Record<InlinePreviewKind, boolean>>>({
  user: readRolePreviewPreferences('user'),
  assistant: readRolePreviewPreferences('assistant'),
});
const sessionInlinePreviewOverrides = ref(readSessionInlinePreviewOverrides(props.selectedSession?.key || null));
let stopInlinePreviewPrefListener: (() => void) | null = null;
const effectiveSessionPreviewPrefs = computed(() => ({
  mermaid: sessionInlinePreviewOverrides.value.mermaid ?? globalInlinePreviewPrefs.value.mermaid,
  html: sessionInlinePreviewOverrides.value.html ?? globalInlinePreviewPrefs.value.html,
  svg: sessionInlinePreviewOverrides.value.svg ?? globalInlinePreviewPrefs.value.svg,
  inlineHtml: sessionInlinePreviewOverrides.value.inlineHtml ?? globalInlinePreviewPrefs.value.inlineHtml,
  inlineSvg: sessionInlinePreviewOverrides.value.inlineSvg ?? globalInlinePreviewPrefs.value.inlineSvg,
  inlineScript: sessionInlinePreviewOverrides.value.inlineScript ?? globalInlinePreviewPrefs.value.inlineScript,
}));
const hasSessionPreviewOverrides = computed(() => {
  return allPreviewKinds.some((kind) => sessionInlinePreviewOverrides.value[kind] != null);
});

const scrollState = ref(createChatSessionScrollState());
const pendingUnreadCount = computed(() => scrollState.value.pendingUnreadCount);
const showHistoryLoadingBeforeIndicator = ref(false);
const showHistoryLoadingAfterIndicator = ref(false);
const showJumpToBottom = computed(() => (
  scrollState.value.pendingUnreadCount > 0 || scrollState.value.autoScrollLockedByUser || props.viewingHistoricalPosition
));
const showInitialLoadingState = computed(() => shouldShowInitialConversationLoading({
  selectedSession: Boolean(props.selectedSession),
  historyLoadingInitial: props.historyLoadingInitial,
  timelineItemCount: props.timelineItems.length,
}));
const showActiveRunPlaceholder = computed(() => {
  if (!props.selectedSession || !props.activeRunId || props.historyLoadingInitial || props.historyErrorMessage) {
    return false;
  }
  return !props.timelineItems.some((item) => (
    item.type === 'message_group'
      ? item.group.messages.some((message) => message.runId === props.activeRunId || message.id === props.activeStreamingMessageId)
      : item.overlay.runId === props.activeRunId
  ));
});
let topSentinelObserver: IntersectionObserver | null = null;
let bottomSentinelObserver: IntersectionObserver | null = null;
let ignoreScrollEvents = false;
let prependRestoreAnchorItemId: string | null = null;
let prependRestoreAnchorOffset = 0;
let prependRestoreBoundaryMessageId: string | null = null;
let prependRestoreToken = 0;
let stableRestoreAnchorItemId: string | null = null;
let stableRestoreAnchorOffset = 0;
let stableRestoreBottomDistance: number | null = null;
let stableRestoreUntil = 0;
let stableRestoreFrame: number | null = null;
let initialLatestAnchorPending = true;
let initialLatestAnchorSettleUntil = 0;
let initialLatestAnchorTimer: number | null = null;
let latestBottomScrollToken = 0;
let historyBeforeAutoFillTimer: number | null = null;
let historyBeforeContinuationTimer: number | null = null;
let historyBeforeIndicatorTimer: number | null = null;
let historyAfterIndicatorTimer: number | null = null;
let historyBeforeContinuationArmed = false;
let historyBrowseGuardUntil = 0;
let historyBeforeAutoFillSuppressedUntil = 0;
let historyPrependMutationPending = false;
let historyPrependPendingBottomDistance: number | null = null;
let stableRestoreAnchorRefreshFrame: number | null = null;
let stableRestoreResumeTimer: number | null = null;
let lastThreadUserScrollAt = 0;
let lastThreadScrollDirection: 'up' | 'down' | null = null;
let compactViewportMediaQuery: MediaQueryList | null = null;
let compactViewportListener: ((event: MediaQueryListEvent) => void) | null = null;
const HISTORY_BEFORE_PREFETCH_TRIGGER_PX = 1800;
const HISTORY_BEFORE_MATERIALIZE_TRIGGER_PX = 1100;
const HISTORY_AFTER_PREFETCH_TRIGGER_PX = 1800;
const HISTORY_AFTER_MATERIALIZE_TRIGGER_PX = 900;
const HISTORY_BEFORE_PREFETCH_VIEWPORTS = 6;
const HISTORY_BEFORE_MATERIALIZE_VIEWPORTS = 3.5;
const HISTORY_AFTER_PREFETCH_VIEWPORTS = 5;
const HISTORY_AFTER_MATERIALIZE_VIEWPORTS = 2.5;
const HISTORY_BEFORE_AUTO_FILL_TARGET_MULTIPLIER = 5.5;
const HISTORY_PREPEND_ANCHOR_STABILIZE_MS = 1200;
const HISTORY_PREPEND_USER_SCROLL_GRACE_MS = 260;
const HISTORY_BROWSE_GUARD_MS = 6000;
const HISTORY_LATEST_BOTTOM_ANCHOR_STABILIZE_MS = 1400;
const HISTORY_LOADING_INDICATOR_DELAY_MS = 650;
const TIMELINE_VIRTUALIZE_MIN_ITEMS = 160;
const TIMELINE_VIRTUALIZE_OVERSCAN_PX = 3600;
const TIMELINE_ITEM_DEFAULT_HEIGHT = 280;
const timelineViewport = ref({
  scrollTop: 0,
  clientHeight: 0,
});
const timelineItemHeights = reactive<Record<string, number>>({});
const timelineItemShellRefs = new Map<string, HTMLElement>();
let timelineMeasureFrame: number | null = null;

function readScrollMetrics(): ChatSessionScrollMetrics | null {
  const container = threadBody.value;
  if (!container) {
    return null;
  }
  return {
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  };
}

function syncTimelineViewport(metrics: ChatSessionScrollMetrics | null = readScrollMetrics()): void {
  if (!metrics) {
    timelineViewport.value = {
      scrollTop: 0,
      clientHeight: 0,
    };
    return;
  }
  timelineViewport.value = {
    scrollTop: metrics.scrollTop,
    clientHeight: metrics.clientHeight,
  };
}

function scrollBottomDistance(metrics: ChatSessionScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

function extendHistoryBrowseGuard(nowMs = Date.now()): void {
  historyBrowseGuardUntil = Math.max(historyBrowseGuardUntil, nowMs + HISTORY_BROWSE_GUARD_MS);
}

function isHistoryBrowseGuardActive(nowMs = Date.now()): boolean {
  return historyBrowseGuardUntil > nowMs;
}

function clearHistoryBrowseGuard(): void {
  historyBrowseGuardUntil = 0;
}

function cancelPendingPrependVisualRestore(): void {
  prependRestoreToken += 1;
  prependRestoreAnchorItemId = null;
  prependRestoreAnchorOffset = 0;
  prependRestoreBoundaryMessageId = null;
}

function markThreadUserScrollActivity(
  nowMs = Date.now(),
  direction: 'up' | 'down' | null = null,
): void {
  lastThreadUserScrollAt = nowMs;
  if (direction) {
    lastThreadScrollDirection = direction;
  }
}

function isThreadUserScrollRecent(nowMs = Date.now()): boolean {
  return nowMs - lastThreadUserScrollAt <= HISTORY_PREPEND_USER_SCROLL_GRACE_MS;
}

function isRecentThreadDownwardScroll(nowMs = Date.now()): boolean {
  return lastThreadScrollDirection === 'down' && isThreadUserScrollRecent(nowMs);
}

function setTimelineItemShellRef(itemId: string, element: HTMLElement | null): void {
  if (!element) {
    timelineItemShellRefs.delete(itemId);
    return;
  }
  timelineItemShellRefs.set(itemId, element);
}

function readVisibleTimelineAnchor(): { itemId: string; offset: number } | null {
  const container = threadBody.value;
  if (!container) {
    return null;
  }
  const containerRect = container.getBoundingClientRect();
  for (const item of props.timelineItems) {
    const element = timelineItemShellRefs.get(item.id);
    if (!element) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) {
      continue;
    }
    return {
      itemId: item.id,
      offset: rect.top - containerRect.top,
    };
  }
  return null;
}

function captureVisibleTimelineAnchor(): void {
  const anchor = readVisibleTimelineAnchor();
  if (anchor) {
    prependRestoreAnchorItemId = anchor.itemId;
    prependRestoreAnchorOffset = anchor.offset;
    return;
  }
  prependRestoreAnchorItemId = null;
  prependRestoreAnchorOffset = 0;
}

function escapeCssAttributeValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

function resolveMessageBubbleElement(messageId: string): HTMLElement | null {
  if (!messageId) {
    return null;
  }
  const selector = `[data-chat-message-id="${escapeCssAttributeValue(messageId)}"]`;
  for (const shell of timelineItemShellRefs.values()) {
    const found = shell.querySelector<HTMLElement>(selector);
    if (found) {
      return found;
    }
  }
  return null;
}

function restoreTimelineItemAnchor(itemId: string | null, offset: number): boolean {
  const container = threadBody.value;
  const anchorElement = itemId ? timelineItemShellRefs.get(itemId) : null;
  if (!container || !anchorElement) {
    return false;
  }
  const containerRect = container.getBoundingClientRect();
  const anchorRect = anchorElement.getBoundingClientRect();
  container.scrollTop += (anchorRect.top - containerRect.top) - offset;
  return true;
}

function restorePrependVisualAnchor(
  anchorItemId: string | null,
  anchorOffset: number,
  boundaryMessageId: string | null,
): boolean {
  const container = threadBody.value;
  if (!container) {
    return false;
  }
  if (anchorItemId && restoreTimelineItemAnchor(anchorItemId, anchorOffset)) {
    return true;
  }
  if (!boundaryMessageId) {
    return false;
  }
  const boundaryElement = resolveMessageBubbleElement(boundaryMessageId);
  const containerRect = container.getBoundingClientRect();
  const boundaryRect = boundaryElement?.getBoundingClientRect();
  if (!boundaryRect) {
    return false;
  }
  const desiredBottomOffset = Math.min(
    Math.max(20, Math.floor(container.clientHeight * 0.18)),
    120,
  );
  container.scrollTop += (boundaryRect.bottom - containerRect.top) - desiredBottomOffset;
  return true;
}

function restoreHistoryBrowseFallbackBottomDistance(bottomDistance: number | null): boolean {
  const container = threadBody.value;
  if (!container || bottomDistance == null) {
    return false;
  }
  const nextTop = Math.max(0, container.scrollHeight - container.clientHeight - bottomDistance);
  container.scrollTop = nextTop;
  return true;
}

function restorePendingPrependBottomClipIfNeeded(): boolean {
  if (!historyPrependMutationPending || historyPrependPendingBottomDistance == null) {
    return false;
  }
  const metrics = readScrollMetrics();
  if (!metrics) {
    return false;
  }
  const currentBottomDistance = scrollBottomDistance(metrics);
  const clippedThreshold = Math.max(300, historyPrependPendingBottomDistance * 0.5);
  if (currentBottomDistance > clippedThreshold) {
    return false;
  }
  ignoreScrollEvents = true;
  restoreHistoryBrowseFallbackBottomDistance(historyPrependPendingBottomDistance);
  requestAnimationFrame(() => {
    ignoreScrollEvents = false;
  });
  const restoredMetrics = readScrollMetrics();
  if (restoredMetrics) {
    scrollState.value = preserveChatSessionHistoryBrowsePosition(scrollState.value, restoredMetrics);
    syncTimelineViewport(restoredMetrics);
  }
  return true;
}

function emitHistoryBeforeRenderSettledIfNeeded(hadPrependPending: boolean): void {
  if (hadPrependPending) {
    emit('history-before-render-settled');
  }
}

function clearStableRestoreAnchor(options: { clearPrependPending?: boolean } = {}): void {
  const clearPrependPending = options.clearPrependPending ?? true;
  if (!clearPrependPending && historyPrependMutationPending) {
    return;
  }
  if (clearPrependPending) {
    cancelPendingPrependVisualRestore();
  }
  const hadPrependPending = historyPrependMutationPending || historyPrependPendingBottomDistance != null;
  if (stableRestoreFrame != null) {
    window.cancelAnimationFrame(stableRestoreFrame);
    stableRestoreFrame = null;
  }
  if (stableRestoreAnchorRefreshFrame != null) {
    window.cancelAnimationFrame(stableRestoreAnchorRefreshFrame);
    stableRestoreAnchorRefreshFrame = null;
  }
  if (stableRestoreResumeTimer != null) {
    window.clearTimeout(stableRestoreResumeTimer);
    stableRestoreResumeTimer = null;
  }
  stableRestoreAnchorItemId = null;
  stableRestoreAnchorOffset = 0;
  stableRestoreBottomDistance = null;
  stableRestoreUntil = 0;
  if (clearPrependPending) {
    historyPrependMutationPending = false;
    historyPrependPendingBottomDistance = null;
    emitHistoryBeforeRenderSettledIfNeeded(hadPrependPending);
  }
}

function updateStableRestoreAnchorFromCurrentViewport(metrics: ChatSessionScrollMetrics | null = readScrollMetrics()): boolean {
  if (!historyPrependMutationPending || !metrics) {
    return false;
  }
  const anchor = readVisibleTimelineAnchor();
  if (anchor) {
    stableRestoreAnchorItemId = anchor.itemId;
    stableRestoreAnchorOffset = anchor.offset;
  }
  const bottomDistance = scrollBottomDistance(metrics);
  stableRestoreBottomDistance = bottomDistance;
  historyPrependPendingBottomDistance = bottomDistance;
  scrollState.value = preserveChatSessionHistoryBrowsePosition(scrollState.value, metrics);
  syncTimelineViewport(metrics);
  return true;
}

function scheduleStableRestoreAnchorResume(delayMs: number): void {
  if (stableRestoreResumeTimer != null) {
    return;
  }
  stableRestoreResumeTimer = window.setTimeout(() => {
    stableRestoreResumeTimer = null;
    scheduleStableRestoreAnchorTick();
  }, Math.max(24, Math.ceil(delayMs)));
}

function scheduleStableRestoreAnchorTick(): void {
  if (stableRestoreFrame != null || (!stableRestoreAnchorItemId && stableRestoreBottomDistance == null)) {
    return;
  }
  stableRestoreFrame = window.requestAnimationFrame(() => {
    stableRestoreFrame = null;
    const nowMs = Date.now();
    if ((!stableRestoreAnchorItemId && stableRestoreBottomDistance == null) || nowMs > stableRestoreUntil) {
      clearStableRestoreAnchor();
      return;
    }
    const currentMetrics = readScrollMetrics();
    const clippedTowardLatestBeforeRestore = Boolean(
      stableRestoreBottomDistance != null
      && currentMetrics
      && scrollBottomDistance(currentMetrics) < Math.max(300, stableRestoreBottomDistance * 0.5),
    );
    if (isThreadUserScrollRecent(nowMs) && !clippedTowardLatestBeforeRestore) {
      updateStableRestoreAnchorFromCurrentViewport(currentMetrics);
      scheduleStableRestoreAnchorResume(HISTORY_PREPEND_USER_SCROLL_GRACE_MS - (nowMs - lastThreadUserScrollAt));
      return;
    }
    ignoreScrollEvents = true;
    const restoredItemAnchor = restoreTimelineItemAnchor(stableRestoreAnchorItemId, stableRestoreAnchorOffset);
    const restoredMetrics = readScrollMetrics();
    const clippedTowardLatest = Boolean(
      stableRestoreBottomDistance != null
      && restoredMetrics
      && scrollBottomDistance(restoredMetrics) < Math.max(300, stableRestoreBottomDistance * 0.5),
    );
    if (!restoredItemAnchor || clippedTowardLatest) {
      restoreHistoryBrowseFallbackBottomDistance(stableRestoreBottomDistance);
    }
    requestAnimationFrame(() => {
      ignoreScrollEvents = false;
      const nextMetrics = readScrollMetrics();
      if (nextMetrics) {
        scrollState.value = preserveChatSessionHistoryBrowsePosition(scrollState.value, nextMetrics);
        syncTimelineViewport(nextMetrics);
      }
      scheduleStableRestoreAnchorTick();
    });
  });
}

function startStableRestoreAnchor(itemId: string | null, offset: number, bottomDistance: number | null): void {
  if (!itemId && bottomDistance == null) {
    clearStableRestoreAnchor();
    return;
  }
  stableRestoreAnchorItemId = itemId;
  stableRestoreAnchorOffset = offset;
  stableRestoreBottomDistance = bottomDistance;
  historyPrependMutationPending = true;
  historyPrependPendingBottomDistance = bottomDistance;
  stableRestoreUntil = Date.now() + HISTORY_PREPEND_ANCHOR_STABILIZE_MS;
  scheduleStableRestoreAnchorTick();
}

function refreshStableRestoreAnchorFromCurrentViewport(): void {
  if (!historyPrependMutationPending) {
    return;
  }
  const metrics = readScrollMetrics();
  if (!metrics) {
    return;
  }
  updateStableRestoreAnchorFromCurrentViewport(metrics);
  stableRestoreUntil = Math.max(stableRestoreUntil, Date.now() + HISTORY_PREPEND_ANCHOR_STABILIZE_MS);
  scheduleStableRestoreAnchorTick();
}

function scheduleStableRestoreAnchorRefreshFromCurrentViewport(): void {
  if (!historyPrependMutationPending || stableRestoreAnchorRefreshFrame != null) {
    return;
  }
  stableRestoreAnchorRefreshFrame = window.requestAnimationFrame(() => {
    stableRestoreAnchorRefreshFrame = null;
    refreshStableRestoreAnchorFromCurrentViewport();
  });
}

function scheduleTimelineItemMeasurement(): void {
  if (timelineMeasureFrame != null) {
    window.cancelAnimationFrame(timelineMeasureFrame);
  }
  timelineMeasureFrame = window.requestAnimationFrame(() => {
    timelineMeasureFrame = null;
    const container = threadBody.value;
    const shouldCompensateMeasuredHeights = Boolean(
      container
      && !ignoreScrollEvents
      && !props.historyLoadingInitial
      && !initialLatestAnchorPending
      && !historyPrependMutationPending
      && !stableRestoreAnchorItemId
      && stableRestoreBottomDistance == null
      && (scrollState.value.autoScrollLockedByUser || isHistoryBrowseGuardActive()),
    );
    const containerRect = shouldCompensateMeasuredHeights
      ? container!.getBoundingClientRect()
      : null;
    const itemIndexById = shouldCompensateMeasuredHeights
      ? new Map(props.timelineItems.map((item, index) => [item.id, index] as const))
      : null;
    let heightDeltaAboveViewport = 0;
    let changed = false;
    for (const [itemId, element] of timelineItemShellRefs.entries()) {
      const nextHeight = Math.ceil(element.getBoundingClientRect().height || element.offsetHeight || 0);
      if (nextHeight > 0 && timelineItemHeights[itemId] !== nextHeight) {
        if (shouldCompensateMeasuredHeights && containerRect && itemIndexById) {
          const index = itemIndexById.get(itemId);
          const item = typeof index === 'number' ? props.timelineItems[index] : null;
          const previousHeight = item
            ? (timelineItemHeights[itemId] || timelineItemEstimatedHeight(item, index))
            : (timelineItemHeights[itemId] || 0);
          const itemRect = element.getBoundingClientRect();
          const delta = nextHeight - previousHeight;
          if (previousHeight > 0 && Math.abs(delta) >= 1 && itemRect.bottom <= containerRect.top) {
            heightDeltaAboveViewport += delta;
          }
        }
        timelineItemHeights[itemId] = nextHeight;
        changed = true;
      }
    }
    if (heightDeltaAboveViewport !== 0 && container && !isRecentThreadDownwardScroll()) {
      ignoreScrollEvents = true;
      container.scrollTop += heightDeltaAboveViewport;
      requestAnimationFrame(() => {
        ignoreScrollEvents = false;
        const nextMetrics = readScrollMetrics();
        if (nextMetrics) {
          scrollState.value = preserveChatSessionHistoryBrowsePosition(scrollState.value, nextMetrics);
          syncTimelineViewport(nextMetrics);
        }
      });
    }
    if (changed && initialLatestAnchorPending) {
      scheduleInitialLatestAnchorRetry(1);
    }
    if (changed && stableRestoreAnchorItemId) {
      scheduleStableRestoreAnchorTick();
    }
  });
}

function timelineItemDateLabel(item: ChatRenderableItem, index: number): string | null {
  const day = extractItemDay(item);
  if (!day) return null;
  if (index > 0) {
    const prevDay = extractItemDay(props.timelineItems[index - 1]);
    if (prevDay === day) return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (day === today) return text('今天', 'Today');
  if (day === yesterday) return text('昨天', 'Yesterday');
  return day;
}

function dateSeparatorLabel(item: ChatRenderableItem, index: number): string | null {
  return timelineItemDateLabel(item, index);
}

function timelineItemEstimatedHeight(item: ChatRenderableItem, index: number): number {
  const measured = timelineItemHeights[item.id];
  if (measured) {
    return measured;
  }
  const hasDateSeparator = Boolean(timelineItemDateLabel(item, index));
  const base = item.type === 'run_overlay'
    ? estimateRunOverlayHeight(item)
    : estimateMessageGroupHeight(item);
  return base + (hasDateSeparator ? 44 : 0);
}

function estimateTextBlockHeight(text: string): number {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return 0;
  }
  const hardLineCount = normalized.split(/\r?\n/).length;
  const softLineCount = Math.ceil(normalized.length / 86);
  const codeFenceCount = (normalized.match(/```/g) || []).length;
  const tableLineCount = (normalized.match(/^\s*\|.+\|\s*$/gm) || []).length;
  return Math.min(
    7200,
    48
      + Math.max(hardLineCount, softLineCount) * 22
      + codeFenceCount * 42
      + tableLineCount * 10,
  );
}

function estimateMessageGroupHeight(item: Extract<ChatRenderableItem, { type: 'message_group' }>): number {
  let height = 96;
  for (const message of item.group.messages) {
    height += Math.max(120, estimateTextBlockHeight(message.text || ''));
    height += (message.toolCalls?.length || 0) * 76;
    height += (message.processBlocks?.length || 0) * 88;
    height += (message.resources?.length || 0) * 96;
    height += (message.media?.length || 0) * 128;
  }
  return Math.min(8400, Math.max(TIMELINE_ITEM_DEFAULT_HEIGHT, height));
}

function estimateRunOverlayHeight(item: Extract<ChatRenderableItem, { type: 'run_overlay' }>): number {
  return Math.min(
    4200,
    180
      + estimateTextBlockHeight(item.overlay.previewText || '') * 0.55
      + item.overlay.toolCalls.length * 74
      + item.processBlocks.length * 86,
  );
}

const timelineVirtualWindow = computed(() => {
  const total = props.timelineItems.length;
  if (props.forceEagerHistoryRender || total <= TIMELINE_VIRTUALIZE_MIN_ITEMS) {
    return {
      start: 0,
      end: total,
    };
  }
  const top = Math.max(0, timelineViewport.value.scrollTop - TIMELINE_VIRTUALIZE_OVERSCAN_PX);
  const bottom = timelineViewport.value.scrollTop + timelineViewport.value.clientHeight + TIMELINE_VIRTUALIZE_OVERSCAN_PX;
  let offset = 0;
  let start = 0;
  let end = total;
  let foundStart = false;
  for (let index = 0; index < total; index += 1) {
    const item = props.timelineItems[index]!;
    const itemHeight = timelineItemEstimatedHeight(item, index) + (index < total - 1 ? 18 : 0);
    const itemTop = offset;
    const itemBottom = offset + itemHeight;
    if (!foundStart && itemBottom >= top) {
      start = Math.max(0, index - 2);
      foundStart = true;
    }
    if (foundStart && itemTop > bottom) {
      end = Math.min(total, index + 2);
      break;
    }
    offset = itemBottom;
  }
  return { start, end };
});

watch(
  () => props.historyPrependAnchorMessageId || null,
  (messageId) => {
    prependRestoreBoundaryMessageId = messageId;
  },
);

function isTimelineItemVisible(index: number): boolean {
  return index >= timelineVirtualWindow.value.start && index < timelineVirtualWindow.value.end;
}

function shouldForceEagerTimelineItem(index: number): boolean {
  return props.forceEagerHistoryRender || isTimelineItemVisible(index);
}

function timelineItemAnchorId(item: ChatRenderableItem): string | null {
  if (item.type !== 'message_group') {
    return null;
  }
  return item.group.messages[0]?.id ? `msg-${item.group.messages[0].id}` : null;
}

function timelineItemShellStyle(item: ChatRenderableItem, index: number): Record<string, string> | undefined {
  const measured = timelineItemHeights[item.id];
  if (isTimelineItemVisible(index) && measured) {
    return undefined;
  }
  return {
    minHeight: `${timelineItemEstimatedHeight(item, index)}px`,
  };
}

watch(
  () => [props.timelineVersion || '', props.historyLoadingBefore, props.historyLoadingAfter] as const,
  async ([signature, loadingBefore, loadingAfter], [previousSignature]) => {
    await nextTick();
    const container = threadBody.value;
    const metrics = readScrollMetrics();
    if (!container || !metrics) {
      return;
    }
    const resolved = resolveChatSessionTimelineMutation(scrollState.value, {
      hasSignature: Boolean(signature),
      hadPreviousSignature: Boolean(previousSignature),
      loadingBefore,
      loadingAfter,
      metrics,
    });
    scrollState.value = resolved.state;
    if (resolved.resolution.kind === 'restore-prepend') {
      extendHistoryBrowseGuard();
      ignoreScrollEvents = true;
      const restoreToken = ++prependRestoreToken;
      const restoreDuringDownwardRead = lastThreadScrollDirection === 'down';
      const anchorItemId = prependRestoreAnchorItemId;
      const anchorOffset = prependRestoreAnchorOffset;
      const boundaryMessageId = prependRestoreBoundaryMessageId;
      const targetTop = restoreDuringDownwardRead
        ? Math.max(resolved.resolution.top, container.scrollTop)
        : resolved.resolution.top;
      const targetBottomDistance = scrollBottomDistance({
        ...metrics,
        scrollTop: targetTop,
      });
      container.scrollTop = targetTop;
      if (!restoreDuringDownwardRead) {
        restorePrependVisualAnchor(anchorItemId, anchorOffset, boundaryMessageId);
      }
      requestAnimationFrame(() => {
        if (restoreToken !== prependRestoreToken) {
          ignoreScrollEvents = false;
          return;
        }
        if (!restoreDuringDownwardRead) {
          restorePrependVisualAnchor(anchorItemId, anchorOffset, boundaryMessageId);
        }
        prependRestoreBoundaryMessageId = null;
        prependRestoreAnchorItemId = null;
        prependRestoreAnchorOffset = 0;
        ignoreScrollEvents = false;
        const nextMetrics = readScrollMetrics();
        if (nextMetrics) {
          scrollState.value = preserveChatSessionHistoryBrowsePosition(scrollState.value, nextMetrics);
          syncTimelineViewport(nextMetrics);
        }
        if (restoreDuringDownwardRead) {
          clearStableRestoreAnchor();
          return;
        }
        startStableRestoreAnchor(anchorItemId, anchorOffset, targetBottomDistance);
      });
      return;
    }
    if (resolved.resolution.kind === 'restore-append') {
      ignoreScrollEvents = true;
      const targetTop = lastThreadScrollDirection === 'down'
        ? Math.max(resolved.resolution.top, container.scrollTop)
        : resolved.resolution.top;
      container.scrollTop = targetTop;
      requestAnimationFrame(() => {
        ignoreScrollEvents = false;
        const nextMetrics = readScrollMetrics();
        if (nextMetrics) {
          scrollState.value = syncChatSessionPinnedState(scrollState.value, nextMetrics);
          syncTimelineViewport(nextMetrics);
        }
        scheduleTimelineItemMeasurement();
      });
      return;
    }
    if (resolved.resolution.kind === 'scroll-bottom') {
      if (isHistoryBrowseGuardActive() || historyPrependMutationPending || scrollState.value.prependAnchor) {
        scrollState.value = preserveChatSessionHistoryBrowsePosition(scrollState.value, metrics);
        syncTimelineViewport(metrics);
        return;
      }
      armLatestBottomAnchorStabilizer();
      scrollToBottom('auto');
      if (initialLatestAnchorPending) {
        scheduleInitialLatestAnchorRetry(1);
      }
    }
    syncTimelineViewport(metrics);
    scheduleTimelineItemMeasurement();
    scheduleHistoryBeforeAutoFill();
  },
);

watch(isCompactViewport, (compactViewport) => {
  if (compactViewport) {
    if (props.queueRailExpanded) {
      emit('update:queue-rail-expanded', false);
    }
    return;
  }
  mobileComposerLift.value = 0;
  if (props.mobileQueueSheetOpen) {
    emit('update:mobile-queue-sheet-open', false);
  }
});

function resetScrollLocksForLatestJump(): void {
  clearHistoryBrowseGuard();
  clearStableRestoreAnchor();
  prependRestoreAnchorItemId = null;
  prependRestoreAnchorOffset = 0;
  prependRestoreBoundaryMessageId = null;
  historyBeforeContinuationArmed = false;
  scrollState.value = {
    ...resolveChatSessionJumpToBottom(scrollState.value).state,
    userBrowseLockUntil: 0,
    prependAnchor: null,
    appendAnchor: null,
  };
}

function scrollToBottom(behavior: ScrollBehavior, options: { force?: boolean } = {}): void {
  const container = threadBody.value;
  if (!container) {
    return;
  }
  const force = Boolean(options.force);
  const token = ++latestBottomScrollToken;
  ignoreScrollEvents = true;
  container.scrollTo({
    top: container.scrollHeight,
    behavior,
  });
  requestAnimationFrame(() => {
    if (token !== latestBottomScrollToken || (!force && (scrollState.value.autoScrollLockedByUser || isHistoryBrowseGuardActive()))) {
      ignoreScrollEvents = false;
      return;
    }
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (token !== latestBottomScrollToken || (!force && (scrollState.value.autoScrollLockedByUser || isHistoryBrowseGuardActive()))) {
          ignoreScrollEvents = false;
          return;
        }
        container.scrollTop = container.scrollHeight;
        ignoreScrollEvents = false;
        const metrics = readScrollMetrics();
        if (metrics) {
          scrollState.value = syncChatSessionPinnedState(scrollState.value, metrics);
        }
        if (initialLatestAnchorPending && !scrollState.value.autoScrollLockedByUser) {
          scheduleInitialLatestAnchorRetry(1);
        }
      }, 80);
    });
  });
}

function forceScrollToLatest(behavior: ScrollBehavior = 'auto'): void {
  historyBeforeAutoFillSuppressedUntil = Date.now() + 2500;
  resetScrollLocksForLatestJump();
  armLatestBottomAnchorStabilizer();
  scrollToBottom(behavior, { force: true });
  nextTick(() => {
    scrollToBottom('auto', { force: true });
    scheduleInitialLatestAnchorRetry(1);
  });
}

function armLatestBottomAnchorStabilizer(): void {
  initialLatestAnchorPending = true;
  initialLatestAnchorSettleUntil = Math.max(
    initialLatestAnchorSettleUntil,
    Date.now() + HISTORY_LATEST_BOTTOM_ANCHOR_STABILIZE_MS,
  );
}

async function restoreLatestBottomAnchorIfNeeded(): Promise<void> {
  if (
    !props.selectedSession
    || props.autoFillHistoryBeforeEnabled === false
    || props.historyLoadingInitial
    || props.historyLoadingBefore
    || props.historyLoadingAfter
    || props.viewingHistoricalPosition
    || props.hasMoreAfter
    || historyPrependMutationPending
    || scrollState.value.prependAnchor
    || stableRestoreAnchorItemId
    || stableRestoreBottomDistance != null
    || scrollState.value.autoScrollLockedByUser
    || isHistoryBrowseGuardActive()
    || !props.timelineItems.length
  ) {
    return;
  }
  await nextTick();
  const container = threadBody.value;
  const metrics = readScrollMetrics();
  if (!container || !metrics) {
    return;
  }
  const bottomDistance = Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
  const settling = Date.now() < initialLatestAnchorSettleUntil;
  if (bottomDistance <= 40 && !settling) {
    initialLatestAnchorPending = false;
    initialLatestAnchorSettleUntil = 0;
    return;
  }
  if (bottomDistance <= 40) {
    scrollState.value = {
      ...scrollState.value,
      isPinnedToBottom: true,
      autoScrollLockedByUser: false,
      pendingUnreadCount: 0,
    };
    scheduleInitialLatestAnchorRetry(1);
    return;
  }
  scrollState.value = {
    ...scrollState.value,
    awaitingInitialBottomAnchor: false,
    isPinnedToBottom: true,
    autoScrollLockedByUser: false,
    pendingUnreadCount: 0,
  };
  scrollToBottom('auto');
  scheduleInitialLatestAnchorRetry(1);
}

function clearInitialLatestAnchorTimer(): void {
  if (initialLatestAnchorTimer != null) {
    window.clearTimeout(initialLatestAnchorTimer);
    initialLatestAnchorTimer = null;
  }
}

function cancelLatestBottomAnchorRetry(): void {
  latestBottomScrollToken += 1;
  initialLatestAnchorPending = false;
  initialLatestAnchorSettleUntil = 0;
  clearInitialLatestAnchorTimer();
}

function markThreadUserBrowseIntent(): void {
  const metrics = readScrollMetrics();
  markThreadUserScrollActivity(Date.now(), 'up');
  extendHistoryBrowseGuard();
  cancelLatestBottomAnchorRetry();
  historyBeforeContinuationArmed = Boolean(
    metrics
    && metrics.scrollTop <= historyBeforeContinuationTriggerPx(metrics)
    && props.hasMoreBefore
    && !historyPrependMutationPending
    && !scrollState.value.prependAnchor,
  );
  scrollState.value = markChatSessionUserBrowseIntent(scrollState.value, metrics);
  scheduleStableRestoreAnchorRefreshFromCurrentViewport();
  if (props.hasMoreBefore && !props.historyLoadingBefore && !props.historyLoadingInitial) {
    emit('prefetch-more-before');
  }
  reconnectBottomObserver();
  if (historyBeforeContinuationArmed) {
    scheduleHistoryBeforeContinuation();
  }
}

function clearHistoryBeforeIndicatorTimer(): void {
  if (historyBeforeIndicatorTimer != null) {
    window.clearTimeout(historyBeforeIndicatorTimer);
    historyBeforeIndicatorTimer = null;
  }
}

function clearHistoryAfterIndicatorTimer(): void {
  if (historyAfterIndicatorTimer != null) {
    window.clearTimeout(historyAfterIndicatorTimer);
    historyAfterIndicatorTimer = null;
  }
}

function scheduleHistoryLoadingIndicator(kind: 'before' | 'after', loading: boolean): void {
  const clearTimer = kind === 'before'
    ? clearHistoryBeforeIndicatorTimer
    : clearHistoryAfterIndicatorTimer;
  const visibleRef = kind === 'before'
    ? showHistoryLoadingBeforeIndicator
    : showHistoryLoadingAfterIndicator;
  clearTimer();
  if (!loading) {
    visibleRef.value = false;
    return;
  }
  if (kind === 'before') {
    historyBeforeIndicatorTimer = window.setTimeout(() => {
      historyBeforeIndicatorTimer = null;
      visibleRef.value = true;
    }, HISTORY_LOADING_INDICATOR_DELAY_MS);
    return;
  }
  historyAfterIndicatorTimer = window.setTimeout(() => {
    historyAfterIndicatorTimer = null;
    visibleRef.value = true;
  }, HISTORY_LOADING_INDICATOR_DELAY_MS);
}

function clearHistoryBeforeAutoFillTimer(): void {
  if (historyBeforeAutoFillTimer != null) {
    window.clearTimeout(historyBeforeAutoFillTimer);
    historyBeforeAutoFillTimer = null;
  }
}

function clearHistoryBeforeContinuationTimer(): void {
  if (historyBeforeContinuationTimer != null) {
    window.clearTimeout(historyBeforeContinuationTimer);
    historyBeforeContinuationTimer = null;
  }
}

function scheduleInitialLatestAnchorRetry(attempt = 0): void {
  clearInitialLatestAnchorTimer();
  if (attempt > 8 || !initialLatestAnchorPending || scrollState.value.autoScrollLockedByUser) {
    return;
  }
  initialLatestAnchorTimer = window.setTimeout(async () => {
    initialLatestAnchorTimer = null;
    await restoreLatestBottomAnchorIfNeeded();
    if (initialLatestAnchorPending) {
      scheduleInitialLatestAnchorRetry(attempt + 1);
    }
  }, attempt === 0 ? 0 : Math.min(800, 120 * attempt));
}

function shouldAutoFillHistoryBefore(metrics: ChatSessionScrollMetrics | null = readScrollMetrics()): boolean {
  if (
    !props.selectedSession
    || props.autoFillHistoryBeforeEnabled === false
    || !props.hasMoreBefore
    || props.historyLoadingInitial
    || props.historyLoadingBefore
    || props.viewingHistoricalPosition
    || Date.now() < historyBeforeAutoFillSuppressedUntil
    || scrollState.value.autoScrollLockedByUser
    || !metrics
  ) {
    return false;
  }
  return metrics.scrollHeight <= metrics.clientHeight * HISTORY_BEFORE_AUTO_FILL_TARGET_MULTIPLIER;
}

function requestMoreBeforeForAutoFill(): void {
  const metrics = readScrollMetrics();
  if (!shouldAutoFillHistoryBefore(metrics)) {
    return;
  }
  armLatestBottomAnchorStabilizer();
  emit('load-more-before', 'autofill');
}

function scheduleHistoryBeforeContinuation(): void {
  clearHistoryBeforeContinuationTimer();
  if (
    !props.selectedSession
    || !props.hasMoreBefore
    || props.historyLoadingInitial
    || historyPrependMutationPending
    || scrollState.value.prependAnchor
    || !historyBeforeContinuationArmed
  ) {
    return;
  }
  const metrics = readScrollMetrics();
  if (!metrics || metrics.scrollTop > historyBeforeContinuationTriggerPx(metrics)) {
    historyBeforeContinuationArmed = false;
    return;
  }
  historyBeforeContinuationTimer = window.setTimeout(() => {
    historyBeforeContinuationTimer = null;
    const nextMetrics = readScrollMetrics();
    if (
      !nextMetrics
      || nextMetrics.scrollTop > historyBeforeContinuationTriggerPx(nextMetrics)
      || !props.hasMoreBefore
      || props.historyLoadingInitial
      || !historyBeforeContinuationArmed
    ) {
      if (!nextMetrics || nextMetrics.scrollTop > historyBeforeContinuationTriggerPx(nextMetrics) || !props.hasMoreBefore) {
        historyBeforeContinuationArmed = false;
      }
      return;
    }
    if (props.historyLoadingBefore) {
      scheduleHistoryBeforeContinuation();
      return;
    }
    extendHistoryBrowseGuard();
    captureVisibleTimelineAnchor();
    historyPrependMutationPending = true;
    historyPrependPendingBottomDistance = scrollBottomDistance(nextMetrics);
    scrollState.value = captureChatSessionPrependAnchor(scrollState.value, nextMetrics);
    historyBeforeContinuationArmed = false;
    emit('load-more-before', 'continuation');
  }, 90);
}

function scheduleHistoryBeforeAutoFill(): void {
  clearHistoryBeforeAutoFillTimer();
  if (!shouldAutoFillHistoryBefore()) {
    return;
  }
  historyBeforeAutoFillTimer = window.setTimeout(() => {
    historyBeforeAutoFillTimer = null;
    requestMoreBeforeForAutoFill();
  }, 40);
}

function historyBeforePrefetchTriggerPx(metrics: ChatSessionScrollMetrics): number {
  return Math.max(HISTORY_BEFORE_PREFETCH_TRIGGER_PX, Math.floor(metrics.clientHeight * HISTORY_BEFORE_PREFETCH_VIEWPORTS));
}

function historyBeforeMaterializeTriggerPx(metrics: ChatSessionScrollMetrics): number {
  return Math.max(HISTORY_BEFORE_MATERIALIZE_TRIGGER_PX, Math.floor(metrics.clientHeight * HISTORY_BEFORE_MATERIALIZE_VIEWPORTS));
}

function historyBeforeContinuationTriggerPx(metrics: ChatSessionScrollMetrics): number {
  return historyBeforeMaterializeTriggerPx(metrics);
}

function historyAfterMaterializeTriggerPx(metrics: ChatSessionScrollMetrics): number {
  return Math.max(HISTORY_AFTER_MATERIALIZE_TRIGGER_PX, Math.floor(metrics.clientHeight * HISTORY_AFTER_MATERIALIZE_VIEWPORTS));
}

function historyAfterPrefetchTriggerPx(metrics: ChatSessionScrollMetrics): number {
  return Math.max(HISTORY_AFTER_PREFETCH_TRIGGER_PX, Math.floor(metrics.clientHeight * HISTORY_AFTER_PREFETCH_VIEWPORTS));
}

function handleThreadWheel(event: WheelEvent): void {
  if (event.deltaY < -4) {
    const container = threadBody.value;
    const metrics = readScrollMetrics();
    markThreadUserBrowseIntent();
    if (container && metrics && scrollBottomDistance(metrics) <= 80) {
      container.scrollTop = Math.max(0, metrics.scrollTop + event.deltaY);
      const nudgedMetrics = readScrollMetrics();
      if (nudgedMetrics) {
        scrollState.value = preserveChatSessionHistoryBrowsePosition(scrollState.value, nudgedMetrics);
        syncTimelineViewport(nudgedMetrics);
      }
    }
    return;
  }
  if (event.deltaY > 4) {
    markThreadUserScrollActivity(Date.now(), 'down');
    historyBeforeContinuationArmed = false;
    cancelPendingPrependVisualRestore();
    if (scrollState.value.prependAnchor) {
      scrollState.value = {
        ...scrollState.value,
        prependAnchor: null,
      };
    }
    if (historyPrependMutationPending || stableRestoreAnchorItemId || stableRestoreBottomDistance != null) {
      clearStableRestoreAnchor();
    }
  }
}

function handleThreadScroll(): void {
  if (ignoreScrollEvents) {
    return;
  }
  let metrics = readScrollMetrics();
  if (metrics) {
    const previousScrollState = scrollState.value;
    const bottomDistance = scrollBottomDistance(metrics);
    const lastScrollTop = previousScrollState.lastScrollTop;
    const downwardIntent = lastScrollTop != null && metrics.scrollTop > lastScrollTop + 4;
    const upwardIntent = lastScrollTop != null && metrics.scrollTop < lastScrollTop - 4;
    if (scrollState.value.autoScrollLockedByUser || bottomDistance > 80) {
      markThreadUserScrollActivity(Date.now(), downwardIntent ? 'down' : upwardIntent ? 'up' : null);
    }
    syncTimelineViewport(metrics);
    if (downwardIntent) {
      historyBeforeContinuationArmed = false;
      cancelPendingPrependVisualRestore();
      if (scrollState.value.prependAnchor) {
        scrollState.value = {
          ...scrollState.value,
          prependAnchor: null,
        };
      }
      if (
        historyPrependMutationPending
        || stableRestoreAnchorItemId
        || stableRestoreBottomDistance != null
        || previousScrollState.prependAnchor
      ) {
        clearStableRestoreAnchor();
      }
    }
    if (initialLatestAnchorPending && !scrollState.value.autoScrollLockedByUser) {
      return;
    }
    if (
      downwardIntent
      && !props.historyLoadingBefore
      && metrics.scrollTop > historyBeforeContinuationTriggerPx(metrics)
      && (
        historyPrependMutationPending
        || stableRestoreAnchorItemId
        || stableRestoreBottomDistance != null
      )
    ) {
      clearStableRestoreAnchor();
      historyBeforeContinuationArmed = false;
    }
    const prependMutationPending = historyPrependMutationPending || Boolean(previousScrollState.prependAnchor);
    if (
      prependMutationPending
      && historyPrependPendingBottomDistance != null
      && bottomDistance <= 80
      && metrics.scrollHeight > (previousScrollState.prependAnchor?.scrollHeight || 0)
    ) {
      if (restorePendingPrependBottomClipIfNeeded()) {
        return;
      }
    }
    const preserveHistoryBrowse = Boolean(
      isHistoryBrowseGuardActive()
      && (previousScrollState.autoScrollLockedByUser || prependMutationPending)
      && !(bottomDistance <= 80 && downwardIntent && !prependMutationPending)
    );
    scrollState.value = preserveHistoryBrowse
      ? preserveChatSessionHistoryBrowsePosition(scrollState.value, metrics)
      : applyChatSessionManualScroll(scrollState.value, metrics);
    if (!scrollState.value.autoScrollLockedByUser && bottomDistance <= 80 && !prependMutationPending) {
      clearHistoryBrowseGuard();
    }
    if (
      scrollState.value.autoScrollLockedByUser
      && (
        !previousScrollState.autoScrollLockedByUser
        || Math.abs(metrics.scrollTop - (previousScrollState.lastScrollTop ?? metrics.scrollTop)) > 4
      )
    ) {
      extendHistoryBrowseGuard();
      cancelLatestBottomAnchorRetry();
      refreshStableRestoreAnchorFromCurrentViewport();
    }
    if (
      metrics.scrollTop <= historyBeforeContinuationTriggerPx(metrics)
      && props.hasMoreBefore
      && scrollState.value.autoScrollLockedByUser
      && !prependMutationPending
      && !downwardIntent
    ) {
      historyBeforeContinuationArmed = true;
    }
    if (downwardIntent || metrics.scrollTop > historyBeforeContinuationTriggerPx(metrics)) {
      historyBeforeContinuationArmed = false;
    }
    if (
      metrics.scrollTop <= historyBeforePrefetchTriggerPx(metrics)
      && props.hasMoreBefore
      && !props.historyLoadingBefore
      && !props.historyLoadingInitial
      && scrollState.value.autoScrollLockedByUser
      && !downwardIntent
    ) {
      emit('prefetch-more-before');
    }
    if (
      metrics.scrollTop <= historyBeforeMaterializeTriggerPx(metrics)
      && props.hasMoreBefore
      && !props.historyLoadingBefore
      && !props.historyLoadingInitial
      && scrollState.value.autoScrollLockedByUser
      && !downwardIntent
    ) {
      requestMoreBefore();
      return;
    }
    if (
      downwardIntent
      && scrollBottomDistance(metrics) <= historyAfterPrefetchTriggerPx(metrics)
      && props.hasMoreAfter
      && !props.historyLoadingAfter
      && !props.historyLoadingInitial
      && !scrollState.value.appendAnchor
    ) {
      emit('prefetch-more-after');
    }
    if (
      downwardIntent
      && scrollBottomDistance(metrics) <= historyAfterMaterializeTriggerPx(metrics)
      && props.hasMoreAfter
      && !props.historyLoadingAfter
      && !props.historyLoadingInitial
      && !scrollState.value.appendAnchor
    ) {
      requestMoreAfter({ allowDuringBrowseLock: true, metrics });
      return;
    }
    if (!scrollState.value.autoScrollLockedByUser) {
      scheduleHistoryBeforeAutoFill();
    } else {
      scheduleHistoryBeforeContinuation();
    }
  }
}

function handleComposerViewportLift(value: number): void {
  mobileComposerLift.value = Math.max(0, Math.round(value || 0));
}

function requestMoreBefore(): void {
  const metrics = readScrollMetrics();
  if (!metrics || !shouldObserveChatSessionTopSentinel({
    state: scrollState.value,
    hasMoreBefore: props.hasMoreBefore,
    historyLoadingBefore: props.historyLoadingBefore,
    historyLoadingInitial: props.historyLoadingInitial,
  })) {
    return;
  }
  extendHistoryBrowseGuard();
  historyPrependMutationPending = true;
  historyPrependPendingBottomDistance = scrollBottomDistance(metrics);
  scrollState.value = {
    ...scrollState.value,
    isPinnedToBottom: false,
    autoScrollLockedByUser: true,
  };
  historyBeforeContinuationArmed = false;
  captureVisibleTimelineAnchor();
  scrollState.value = captureChatSessionPrependAnchor(scrollState.value, metrics);
  emit('load-more-before', 'browse');
}

function requestMoreAfter(options: { allowDuringBrowseLock?: boolean; metrics?: ChatSessionScrollMetrics } = {}): void {
  const metrics = options.metrics ?? readScrollMetrics();
  if (
    !metrics
    || !props.hasMoreAfter
    || props.historyLoadingAfter
    || props.historyLoadingInitial
    || scrollState.value.appendAnchor
  ) {
    return;
  }
  if (!options.allowDuringBrowseLock && !shouldObserveChatSessionBottomSentinel({
    state: scrollState.value,
    hasMoreAfter: props.hasMoreAfter,
    historyLoadingAfter: props.historyLoadingAfter,
    historyLoadingInitial: props.historyLoadingInitial,
  })) {
    return;
  }
  scrollState.value = captureChatSessionAppendAnchor(scrollState.value, metrics);
  emit('load-more-after');
}

function jumpToBottom(): void {
  if (props.viewingHistoricalPosition) {
    resetScrollLocksForLatestJump();
    emit('jump-to-live');
    return;
  }
  forceScrollToLatest('smooth');
}

function extractItemDay(item: ChatRenderableItem): string | null {
  if (item.type === 'message_group') {
    const msg = item.group.messages[0];
    if (msg?.createdAt) {
      try {
        return new Date(msg.createdAt).toISOString().slice(0, 10);
      } catch {
        return null;
      }
    }
  }
  if (item.type === 'run_overlay') {
    const overlay = item.overlay;
    const ts = overlay.startedAt || overlay.updatedAt;
    if (ts) {
      try {
        return new Date(ts).toISOString().slice(0, 10);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function timelineItemMemoKey(item: ChatRenderableItem): unknown[] {
  if (item.type === 'message_group') {
    const lastMessage = item.group.messages[item.group.messages.length - 1] || null;
    return [
      item.id,
      props.showToolPreviews,
      props.showThinkingBlocks,
      item.group.messages.length,
      item.group.runId || '',
      lastMessage?.id || '',
      lastMessage?.source || '',
      lastMessage?.text.length || 0,
      lastMessage?.aborted ? 1 : 0,
      lastMessage?.omitted ? 1 : 0,
      lastMessage?.truncated ? 1 : 0,
      props.activeRunId && item.group.runId === props.activeRunId ? props.activeRunId : '',
      props.activeStreamingMessageId && item.group.messages.some((message) => message.id === props.activeStreamingMessageId)
        ? props.activeStreamingMessageId
        : '',
    ];
  }
  return [
    item.id,
    props.showToolPreviews,
    props.showThinkingBlocks,
    item.overlay.runId,
    item.overlay.updatedAt || '',
    item.overlay.lifecycle,
    item.overlay.previewText.length,
    item.overlay.toolCalls.length,
    item.overlay.toolCalls.map((toolCall) => `${toolCall.toolCallId}:${toolCall.status}:${toolCall.resultPreview?.length || 0}`).join('|'),
    props.activeRunId && item.overlay.runId === props.activeRunId ? props.activeRunId : '',
  ];
}

function reconnectTopObserver(): void {
  topSentinelObserver?.disconnect();
  topSentinelObserver = null;
  if (
    typeof IntersectionObserver === 'undefined'
    || !threadBody.value
    || !historyTopSentinel.value
    || historyPrependMutationPending
    || scrollState.value.prependAnchor
    || !shouldObserveChatSessionTopSentinel({
      state: scrollState.value,
      hasMoreBefore: props.hasMoreBefore,
      historyLoadingBefore: props.historyLoadingBefore,
      historyLoadingInitial: props.historyLoadingInitial,
    })
  ) {
    return;
  }
  const metrics = readScrollMetrics();
  const preloadRootMargin = metrics
    ? historyBeforeMaterializeTriggerPx(metrics)
    : Math.max(HISTORY_BEFORE_MATERIALIZE_TRIGGER_PX, Math.floor(threadBody.value.clientHeight * HISTORY_BEFORE_MATERIALIZE_VIEWPORTS));
  topSentinelObserver = new IntersectionObserver((entries) => {
    if (
      entries.some((entry) => entry.isIntersecting)
      && !historyPrependMutationPending
      && !scrollState.value.prependAnchor
    ) {
      requestMoreBefore();
    }
  }, {
    root: threadBody.value,
    rootMargin: `${preloadRootMargin}px 0px 0px 0px`,
    threshold: 0.1,
  });
  topSentinelObserver.observe(historyTopSentinel.value);
}

function reconnectBottomObserver(): void {
  bottomSentinelObserver?.disconnect();
  bottomSentinelObserver = null;
  if (
    typeof IntersectionObserver === 'undefined'
    || !threadBody.value
    || !historyBottomSentinel.value
    || scrollState.value.appendAnchor
    || !shouldObserveChatSessionBottomSentinel({
      state: scrollState.value,
      hasMoreAfter: props.hasMoreAfter,
      historyLoadingAfter: props.historyLoadingAfter,
      historyLoadingInitial: props.historyLoadingInitial,
    })
  ) {
    return;
  }
  const metrics = readScrollMetrics();
  const preloadRootMargin = metrics
    ? historyAfterMaterializeTriggerPx(metrics)
    : Math.max(HISTORY_AFTER_MATERIALIZE_TRIGGER_PX, Math.floor(threadBody.value.clientHeight * HISTORY_AFTER_MATERIALIZE_VIEWPORTS));
  bottomSentinelObserver = new IntersectionObserver((entries) => {
    const metrics = readScrollMetrics();
    if (
      entries.some((entry) => entry.isIntersecting)
      && metrics
      && !scrollState.value.appendAnchor
      && lastThreadScrollDirection === 'down'
      && scrollBottomDistance(metrics) <= historyAfterMaterializeTriggerPx(metrics)
    ) {
      requestMoreAfter({ allowDuringBrowseLock: true, metrics });
    }
  }, {
    root: threadBody.value,
    rootMargin: `0px 0px ${preloadRootMargin}px 0px`,
    threshold: 0.01,
  });
  bottomSentinelObserver.observe(historyBottomSentinel.value);
}

function closeMenu(): void {
  conversationMenuOpen.value = false;
  mobileActionSheetOpen.value = false;
}

function openQueueSheet(): void {
  emit('update:mobile-queue-sheet-open', true);
}

function handleQueueSheetOpenChange(open: boolean): void {
  emit('update:mobile-queue-sheet-open', open);
}

function triggerMenuAction(
  action: 'new-chat' | 'toggle-inspect' | 'reset' | 'toggle-tool-previews' | 'toggle-thinking-blocks' | 'refresh-session' | 'open-record-browser',
): void {
  closeMenu();
  emit(action);
}

function toggleHostManagementExecFromMenu(): void {
  closeMenu();
  emit('toggle-host-management-exec', !props.sessionHostManagementExecEnabled);
}

function syncCompactViewport(): void {
  if (!compactViewportMediaQuery) {
    isCompactViewport.value = false;
    return;
  }
  isCompactViewport.value = compactViewportMediaQuery.matches;
}

function bindCompactViewport(): void {
  if (typeof window === 'undefined') {
    return;
  }
  compactViewportMediaQuery = window.matchMedia('(max-width: 920px)');
  compactViewportListener = () => {
    syncCompactViewport();
  };
  syncCompactViewport();
  if ('addEventListener' in compactViewportMediaQuery) {
    compactViewportMediaQuery.addEventListener('change', compactViewportListener);
  } else {
    compactViewportMediaQuery.addListener(compactViewportListener);
  }
}

function unbindCompactViewport(): void {
  if (!compactViewportMediaQuery || !compactViewportListener) {
    return;
  }
  if ('removeEventListener' in compactViewportMediaQuery) {
    compactViewportMediaQuery.removeEventListener('change', compactViewportListener);
  } else {
    compactViewportMediaQuery.removeListener(compactViewportListener);
  }
  compactViewportMediaQuery = null;
  compactViewportListener = null;
}

function refreshInlinePreviewPrefs(): void {
  globalInlinePreviewPrefs.value = readGlobalInlinePreviewPreferences();
  globalSanitizeLevel.value = readGlobalSanitizeLevel();
  roleBasedEnabled.value = readRoleBasedEnabled();
  rolePreviewPrefs.value = {
    user: readRolePreviewPreferences('user'),
    assistant: readRolePreviewPreferences('assistant'),
  };
  sessionInlinePreviewOverrides.value = readSessionInlinePreviewOverrides(props.selectedSession?.key || null);
}

function openRenderingSettings(): void {
  closeMenu();
  renderingSettingsScope.value = props.selectedSession ? 'session' : 'global';
  refreshInlinePreviewPrefs();
  renderingSettingsOpen.value = true;
}

function closeRenderingSettings(): void {
  renderingSettingsOpen.value = false;
}

function previewLabel(kind: InlinePreviewKind): string {
  if (kind === 'mermaid') return 'Mermaid';
  if (kind === 'html') return 'HTML';
  if (kind === 'svg') return 'SVG';
  if (kind === 'inlineHtml') return text('内联 HTML', 'Inline HTML');
  if (kind === 'inlineSvg') return text('内联 SVG', 'Inline SVG');
  return text('内联脚本', 'Inline Script');
}

function sanitizeLevelLabel(level: SanitizeLevel): string {
  if (level === 'strict') return text('严格', 'Strict');
  if (level === 'moderate') return text('适中', 'Moderate');
  return text('宽松', 'Permissive');
}

function sanitizeLevelWarning(level: SanitizeLevel): string {
  if (level === 'moderate') return text('允许内联 HTML/SVG 样式和更多交互元素', 'Allows inline HTML/SVG styles and more interactive elements');
  if (level === 'permissive') return text('⚠ 仅允许 iframe 被拦截，脚本由内联脚本开关控制', '⚠ Only iframe is blocked; script execution controlled by Inline Script toggle');
  return '';
}

function setGlobalSanitizeLevelAction(level: SanitizeLevel): void {
  globalSanitizeLevel.value = level;
  writeGlobalSanitizeLevel(level);
}

function setRoleBasedEnabledAction(enabled: boolean): void {
  roleBasedEnabled.value = enabled;
  writeRoleBasedEnabled(enabled);
}

function setRolePreviewPrefAction(role: RenderingRole, kind: InlinePreviewKind, enabled: boolean): void {
  rolePreviewPrefs.value = {
    ...rolePreviewPrefs.value,
    [role]: { ...rolePreviewPrefs.value[role], [kind]: enabled },
  };
  writeRolePreviewPreference(role, kind, enabled);
}

function sessionScopeHint(kind: InlinePreviewKind): string {
  const override = sessionInlinePreviewOverrides.value[kind];
  if (override == null) {
    return text(
      `当前会话跟随全局默认：${globalInlinePreviewPrefs.value[kind] ? '开' : '关'}`,
      `This session follows the global default: ${globalInlinePreviewPrefs.value[kind] ? 'On' : 'Off'}`,
    );
  }
  return text(
    `当前会话已覆盖为：${override ? '开' : '关'}`,
    `This session override is set to: ${override ? 'On' : 'Off'}`,
  );
}

function setGlobalInlinePreviewPreference(kind: InlinePreviewKind, enabled: boolean): void {
  globalInlinePreviewPrefs.value = {
    ...globalInlinePreviewPrefs.value,
    [kind]: enabled,
  };
  writeGlobalInlinePreviewPreference(kind, enabled);
}

function setSessionInlinePreviewOverride(kind: InlinePreviewKind, enabled: boolean | null): void {
  const sessionKey = props.selectedSession?.key;
  if (!sessionKey) {
    return;
  }
  sessionInlinePreviewOverrides.value = {
    ...sessionInlinePreviewOverrides.value,
    [kind]: enabled,
  };
  writeSessionInlinePreviewOverride(sessionKey, kind, enabled);
}

function resetSessionInlinePreviewOverrides(): void {
  const sessionKey = props.selectedSession?.key;
  if (!sessionKey) {
    return;
  }
  sessionInlinePreviewOverrides.value = {
    mermaid: null,
    html: null,
    svg: null,
    inlineHtml: null,
    inlineSvg: null,
    inlineScript: null,
  };
  clearSessionInlinePreviewOverrides(sessionKey);
}

onMounted(() => {
  bindCompactViewport();
  refreshInlinePreviewPrefs();
  stopInlinePreviewPrefListener = listenInlinePreviewPreferenceChange(({ scope, sessionKey }) => {
    if (scope === 'session' && sessionKey && sessionKey !== props.selectedSession?.key) {
      return;
    }
    refreshInlinePreviewPrefs();
  });
  syncTimelineViewport();
  scheduleTimelineItemMeasurement();
  reconnectTopObserver();
  reconnectBottomObserver();
});

onUpdated(() => {
  restorePendingPrependBottomClipIfNeeded();
});

watch(
  () => props.selectedSession?.key || null,
  () => {
    clearHistoryBrowseGuard();
    armLatestBottomAnchorStabilizer();
    clearInitialLatestAnchorTimer();
    clearStableRestoreAnchor();
    historyBeforeAutoFillSuppressedUntil = 0;
    refreshInlinePreviewPrefs();
    scrollState.value = beginChatSessionScrollRestore(scrollState.value);
    Object.keys(timelineItemHeights).forEach((key) => {
      delete timelineItemHeights[key];
    });
    timelineItemShellRefs.clear();
    if (renderingSettingsScope.value === 'session' && !props.selectedSession) {
      renderingSettingsScope.value = 'global';
    }
    nextTick(() => {
      syncTimelineViewport();
      scheduleTimelineItemMeasurement();
      reconnectTopObserver();
      reconnectBottomObserver();
      if (!props.timelineItems.length) {
        scrollState.value = {
          ...scrollState.value,
          awaitingInitialBottomAnchor: false,
        };
        scrollToBottom('auto');
      }
      scheduleInitialLatestAnchorRetry();
      scheduleHistoryBeforeAutoFill();
    });
  },
);

watch(
  () => [props.hasMoreBefore, props.historyLoadingBefore, props.hasMoreAfter, props.historyLoadingAfter, props.historyLoadingInitial],
  () => {
    reconnectTopObserver();
    reconnectBottomObserver();
    scheduleHistoryBeforeContinuation();
  },
);

watch(
  () => props.historyLoadingBefore,
  (loading) => {
    scheduleHistoryLoadingIndicator('before', loading);
  },
  { immediate: true },
);

watch(
  () => props.historyLoadingAfter,
  (loading) => {
    scheduleHistoryLoadingIndicator('after', loading);
  },
  { immediate: true },
);

watch(
  () => [timelineVirtualWindow.value.start, timelineVirtualWindow.value.end, props.timelineVersion || ''] as const,
  async () => {
    await nextTick();
    scheduleTimelineItemMeasurement();
    scheduleHistoryBeforeAutoFill();
  },
);

watch(
  () => [props.historyLoadingInitial, props.historyLoadingBefore, props.historyLoadingAfter, props.timelineVersion || '', props.viewingHistoricalPosition, props.hasMoreAfter] as const,
  () => {
    void restoreLatestBottomAnchorIfNeeded();
    scheduleHistoryBeforeAutoFill();
  },
);

watch(
  () => props.latestJumpToken || 0,
  (token, previousToken) => {
    if (!token || token === previousToken) {
      return;
    }
    forceScrollToLatest('auto');
  },
);

onBeforeUnmount(() => {
  clearInitialLatestAnchorTimer();
  clearHistoryBeforeAutoFillTimer();
  clearHistoryBeforeContinuationTimer();
  clearHistoryBeforeIndicatorTimer();
  clearHistoryAfterIndicatorTimer();
  clearStableRestoreAnchor();
  topSentinelObserver?.disconnect();
  topSentinelObserver = null;
  bottomSentinelObserver?.disconnect();
  bottomSentinelObserver = null;
  if (timelineMeasureFrame != null) {
    window.cancelAnimationFrame(timelineMeasureFrame);
    timelineMeasureFrame = null;
  }
  timelineItemShellRefs.clear();
  unbindCompactViewport();
  stopInlinePreviewPrefListener?.();
  stopInlinePreviewPrefListener = null;
});
</script>

<style scoped>
.chat-conversation-pane {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--chat-thread-bg);
}

.chat-rendering-settings-mask {
  position: fixed;
  inset: 0;
  z-index: 1260;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 8, 15, 0.62);
  backdrop-filter: blur(12px);
}

.chat-rendering-settings-mask[data-state='open'] {
  animation: chat-rendering-settings-mask-in 0.2s ease;
  animation-fill-mode: both;
}

.chat-rendering-settings-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1261;
  width: min(92vw, 820px);
  max-height: calc(100vh - 40px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--chat-line-strong);
  background: var(--chat-dialog-surface);
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(16px);
  overflow: hidden;
  transform: translate(-50%, -50%);
}

.chat-rendering-settings-dialog[data-state='open'] {
  animation: chat-rendering-settings-dialog-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  animation-fill-mode: both;
}

@keyframes chat-rendering-settings-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chat-rendering-settings-dialog-in {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 12px)) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.chat-rendering-settings-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chat-rendering-settings-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.chat-rendering-settings-copy strong {
  color: var(--chat-text);
  font-size: 18px;
}

.chat-rendering-settings-copy span {
  color: var(--chat-text-soft);
  font-size: 13px;
  line-height: 1.55;
}

.chat-rendering-settings-close {
  width: 38px;
  height: 38px;
  display: inline-grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 88%, transparent);
  color: var(--chat-text);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.chat-rendering-settings-close:hover,
.chat-rendering-settings-close:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-modal-row) 70%, var(--chat-hover));
}

.chat-rendering-settings-scope {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-rendering-settings-toolbar {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 78%, transparent);
  background: color-mix(in srgb, var(--chat-modal-row) 72%, transparent);
}

.chat-rendering-settings-scope-btn,
.chat-rendering-settings-chip {
  appearance: none;
  border: 1px solid var(--chat-line);
  background: transparent;
  color: var(--chat-text-soft);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.chat-rendering-settings-scope-btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.chat-rendering-settings-scope-btn.active,
.chat-rendering-settings-chip.active {
  border-color: color-mix(in srgb, var(--chat-accent) 42%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 14%, transparent);
  color: var(--chat-text);
}

.chat-rendering-settings-scope-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.chat-rendering-settings-scope-btn.warn:not(:disabled) {
  border-color: color-mix(in srgb, #f59e0b 36%, var(--chat-line));
  color: #b45309;
}

:global(html:not([data-theme='light'])) .chat-rendering-settings-scope-btn.warn:not(:disabled) {
  color: #fbbf24;
}

.chat-rendering-settings-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.55;
}

.chat-rendering-settings-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable both-edges;
  -webkit-overflow-scrolling: touch;
  padding-right: 6px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
}

.chat-rendering-settings-grid {
  display: grid;
  gap: 12px;
}

.chat-rendering-settings-section-title {
  margin: 8px 4px 0;
  color: var(--chat-text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.chat-rendering-settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 82%, transparent);
}

.chat-rendering-settings-row-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.chat-rendering-settings-row-copy strong {
  color: var(--chat-text);
  font-size: 15px;
}

.chat-rendering-settings-row-copy span {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.chat-rendering-settings-row--indented {
  margin-left: 14px;
}

.chat-rendering-settings-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-rendering-settings-row-actions--toggle .chat-rendering-settings-chip {
  min-width: 86px;
  border-radius: 999px;
}

.chat-rendering-settings-inline-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.chat-rendering-settings-state-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 84%, transparent);
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.chat-rendering-settings-state-pill::before {
  content: '';
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.5;
}

.chat-rendering-settings-state-pill.active {
  border-color: color-mix(in srgb, var(--chat-accent) 38%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 12%, transparent);
  color: var(--chat-accent);
}

.chat-rendering-settings-state-pill.active::before {
  opacity: 1;
}

.chat-rendering-settings-state-note {
  color: var(--chat-text-soft);
  font-size: 11px;
  line-height: 1.45;
}

.chat-rendering-settings-chip {
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.chat-rendering-settings-chip.warn {
  border-color: color-mix(in srgb, #f59e0b 36%, var(--chat-line));
  color: #b45309;
}

:global(html:not([data-theme='light'])) .chat-rendering-settings-chip.warn {
  color: #fbbf24;
}

.chat-rendering-settings-warn-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 2px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #b45309;
  font-size: 11px;
  font-weight: 700;
}

:global(html:not([data-theme='light'])) .chat-rendering-settings-warn-badge {
  color: #fbbf24;
}

.chat-rendering-settings-warn-text {
  color: color-mix(in srgb, #f59e0b 78%, var(--chat-text-soft));
}

.chat-rendering-settings-role-group {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 68%, transparent);
  background: color-mix(in srgb, var(--chat-modal-row) 56%, transparent);
}

.chat-rendering-settings-role-title {
  margin: 0;
  color: var(--chat-text);
  font-size: 13px;
  font-weight: 700;
}

.chat-rendering-settings-chip:hover,
.chat-rendering-settings-chip:focus-visible,
.chat-rendering-settings-scope-btn:hover,
.chat-rendering-settings-scope-btn:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 10%, transparent);
  color: var(--chat-text);
}

.chat-conversation-pane__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px 8px;
  border-bottom: 1px solid var(--chat-line);
}

.chat-conversation-pane__head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.chat-conversation-pane__avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--chat-avatar-bg);
  color: var(--chat-avatar-text);
  font-weight: 700;
}

.chat-conversation-pane__copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.chat-conversation-pane__copy strong {
  color: var(--chat-text);
  font-size: 15px;
}

.chat-conversation-pane__head-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-conversation-pane__summary {
  display: none;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.chat-conversation-pane__summary-chip {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 90%, transparent);
  background: color-mix(in srgb, var(--chat-modal-row) 72%, transparent);
  color: var(--chat-text-soft);
}

.chat-conversation-pane__summary-chip.tone-accent {
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 10%, transparent);
  color: color-mix(in srgb, var(--chat-accent) 74%, var(--chat-text));
}

.chat-conversation-pane__summary-chip.tone-identity {
  border-color: color-mix(in srgb, var(--chat-accent) 24%, var(--chat-line));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--chat-accent) 12%, transparent),
    color-mix(in srgb, var(--chat-modal-row) 74%, transparent)
  );
  color: var(--chat-text);
}

.chat-conversation-pane__summary-chip.tone-pending {
  border-color: color-mix(in srgb, #f59e0b 24%, var(--chat-line));
  background: color-mix(in srgb, #f59e0b 10%, transparent);
  color: color-mix(in srgb, #f59e0b 78%, var(--chat-text));
}

.chat-conversation-pane__summary-chip.tone-muted {
  opacity: 0.82;
}

.chat-conversation-pane__summary-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 999px;
  background: currentColor;
}

.chat-conversation-pane__summary-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
}

.chat-conversation-pane__subtitle {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.45;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-conversation-pane__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.chat-conversation-pane__search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.chat-conversation-pane__search-input,
.chat-conversation-pane__date-select {
  height: 36px;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: transparent;
  color: var(--chat-text);
  padding: 0 12px;
  font-size: 12px;
}

.chat-conversation-pane__search-input {
  width: min(220px, 28vw);
}

.chat-conversation-pane__date-select {
  min-width: 132px;
}

.chat-conversation-pane__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-accent) 10%, transparent);
  color: var(--chat-accent);
  font-size: 11px;
  font-weight: 600;
}

.chat-conversation-pane__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--chat-accent);
  animation: status-pulse 1.5s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.chat-conversation-pane__status.muted {
  background: color-mix(in srgb, var(--chat-muted-chip) 60%, transparent);
  color: var(--chat-text-soft);
}

.chat-conversation-pane__exec-toggle {
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 88%, transparent);
  background: color-mix(in srgb, var(--chat-thread-bg) 92%, transparent);
  color: var(--chat-text-soft);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, opacity 0.18s ease;
}

.chat-conversation-pane__exec-toggle:hover,
.chat-conversation-pane__exec-toggle:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  color: var(--chat-text);
}

.chat-conversation-pane__exec-toggle:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.chat-conversation-pane__exec-toggle.active {
  border-color: color-mix(in srgb, var(--chat-accent) 42%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 14%, transparent);
  color: var(--chat-accent);
}

.chat-conversation-pane__exec-toggle.unavailable {
  border-style: dashed;
}

.chat-conversation-pane__exec-toggle-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-text-soft) 72%, transparent);
}

.chat-conversation-pane__exec-toggle.active .chat-conversation-pane__exec-toggle-dot {
  background: var(--chat-accent);
}

.chat-conversation-pane__ghost {
  list-style: none;
  height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: transparent;
  color: var(--chat-text-soft);
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.chat-conversation-pane__icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: transparent;
  color: var(--chat-text-soft);
  display: inline-grid;
  place-items: center;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.chat-conversation-pane__icon-btn:hover,
.chat-conversation-pane__icon-btn:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 8%, transparent);
  color: var(--chat-text);
}

.chat-conversation-pane__icon-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.chat-conversation-pane__icon-btn.active {
  border-color: color-mix(in srgb, var(--chat-accent) 42%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 14%, transparent);
  color: var(--chat-accent);
}

.chat-conversation-pane__ghost.compact {
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
}

.chat-session-menu-popover {
  min-width: 180px;
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--chat-line-strong);
  background: var(--chat-menu-surface);
  box-shadow: 0 18px 44px rgba(3, 8, 14, 0.28);
  backdrop-filter: blur(24px) saturate(140%);
  z-index: 1600;
  transform-origin: top right;
}

.chat-session-menu-popover[data-state='open'] {
  animation: chat-session-menu-popover-in 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.chat-session-menu-item {
  text-align: left;
  background: transparent;
  color: var(--chat-text);
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: background 0.18s ease, transform 0.18s ease;
}

.chat-session-menu-item[data-highlighted] {
  background: var(--chat-hover);
  transform: translateY(-1px);
}

.chat-session-menu-item[data-disabled] {
  color: var(--chat-text-soft);
  cursor: default;
}

.chat-session-menu-section {
  display: grid;
  gap: 6px;
  padding: 8px 2px 4px;
}

.chat-session-menu-section__label {
  padding: 0 8px;
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.chat-session-menu-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.chat-session-menu-toggle strong {
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
}

.chat-session-menu-toggle[data-active="1"] {
  background: var(--chat-hover);
}

.chat-session-menu-toggle[data-active="1"] strong {
  color: var(--chat-accent);
}

.chat-conversation-pane__notice {
  margin: 10px 18px 0;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 13px;
}

.chat-conversation-pane__notice-error {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

:global(html:not([data-theme='light'])) .chat-conversation-pane__notice-error {
  color: #fecaca;
}

.chat-conversation-pane__slash-feedback {
  padding: 0 18px 12px;
}

.chat-conversation-pane__blocked {
  flex: 1 1 auto;
  margin: 16px 18px 18px;
  padding: 22px;
  border-radius: 12px;
  border: 1px dashed var(--chat-line-strong);
  background: var(--chat-empty-bg);
  display: grid;
  gap: 10px;
  align-content: center;
}

.chat-conversation-pane__blocked h3,
.chat-conversation-empty h3 {
  margin: 0;
  color: var(--chat-text);
}

.chat-conversation-pane__blocked p,
.chat-conversation-empty p {
  margin: 0;
  color: var(--chat-text-soft);
  line-height: 1.6;
}

.chat-conversation-pane__body {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-conversation-thread {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow: auto;
  overflow-anchor: none;
  position: relative;
  padding: 18px 22px 12px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 144, 170, 0.42) transparent;
}

.chat-conversation-thread::-webkit-scrollbar {
  width: 12px;
}

.chat-conversation-thread::-webkit-scrollbar-track {
  background: transparent;
}

.chat-conversation-thread::-webkit-scrollbar-thumb {
  border-radius: 999px;
  border: 3px solid transparent;
  background: rgba(120, 144, 170, 0.22);
  background-clip: padding-box;
  transition: background 0.18s ease;
}

.chat-conversation-thread:hover::-webkit-scrollbar-thumb {
  background: rgba(86, 122, 168, 0.52);
  background-clip: padding-box;
}

.chat-conversation-groups {
  display: grid;
  gap: 18px;
}

.chat-conversation-thread__item-shell {
  min-width: 0;
}

.chat-conversation-thread__item-placeholder {
  width: 100%;
  min-height: inherit;
}

.chat-conversation-thread__top-sentinel {
  width: 100%;
  height: 1px;
  margin-top: -12px;
}

.chat-conversation-thread__loading-indicator {
  align-self: center;
  display: flex;
  justify-content: center;
  height: 0;
  margin: 0;
  padding: 0;
  pointer-events: none;
  position: sticky;
  z-index: 5;
}

.chat-conversation-thread__loading-indicator--before {
  top: 10px;
}

.chat-conversation-thread__loading-indicator--after {
  bottom: 10px;
}

.chat-conversation-thread__spinner {
  width: 22px;
  height: 22px;
  background: color-mix(in srgb, var(--chat-panel-solid) 86%, transparent);
  border: 2px solid color-mix(in srgb, var(--chat-accent) 22%, var(--chat-line));
  border-top-color: var(--chat-accent);
  border-radius: 999px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  animation: spin-loader 0.7s linear infinite;
}

@keyframes spin-loader {
  to { transform: rotate(360deg); }
}

.chat-conversation-thread__bottom-sentinel {
  width: 100%;
  height: 1px;
  margin-bottom: -12px;
}

.chat-conversation-thread__history-banner {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--chat-accent) 12%, var(--chat-thread-bg));
  border: 1px solid color-mix(in srgb, var(--chat-accent) 22%, var(--chat-line));
  border-radius: 10px;
  color: var(--chat-text);
  font-size: 12px;
  font-weight: 500;
}

.chat-conversation-thread__history-banner-icon {
  width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-accent) 18%, transparent);
  color: var(--chat-accent);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.chat-conversation-thread__history-banner-action {
  all: unset;
  cursor: pointer;
  padding: 3px 10px;
  border-radius: 8px;
  background: var(--chat-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  transition: opacity 0.18s ease;
}

.chat-conversation-thread__history-banner-action:hover {
  opacity: 0.85;
}

.chat-conversation-thread__live-placeholder {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(100%, 520px);
  padding: 8px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--chat-accent) 10%, var(--chat-thread-bg));
  border: 1px solid color-mix(in srgb, var(--chat-accent) 16%, var(--chat-line));
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.45;
}

.chat-conversation-thread__live-placeholder-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--chat-accent);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--chat-accent) 36%, transparent);
  animation: chat-thread-live-placeholder-pulse 1.4s ease-out infinite;
  flex-shrink: 0;
}

@keyframes chat-thread-live-placeholder-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--chat-accent) 36%, transparent);
  }

  70% {
    box-shadow: 0 0 0 8px transparent;
  }

  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.chat-message-highlight {
  animation: message-highlight-fade 2s ease-out;
}

@keyframes message-highlight-fade {
  0% {
    background-color: rgba(255, 220, 100, 0.3);
  }
  100% {
    background-color: transparent;
  }
}

.chat-conversation-thread__jump-fab {
  position: sticky;
  bottom: 12px;
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-accent) 28%, var(--chat-line));
  background: var(--chat-thread-bg);
  color: var(--chat-accent);
  box-shadow: 0 6px 20px rgba(8, 15, 26, 0.18);
  cursor: pointer;
  z-index: 2;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.chat-conversation-thread__jump-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(8, 15, 26, 0.22);
}

.chat-conversation-thread__jump-fab.has-text {
  width: auto;
  height: 38px;
  padding: 0 14px;
  gap: 6px;
  border-radius: 10px;
}

.chat-conversation-thread__jump-arrow {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.chat-conversation-thread__jump-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--chat-text);
}

.chat-conversation-thread__jump-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--chat-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: inline-grid;
  place-items: center;
  line-height: 1;
}

.chat-conversation-thread__date-separator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 600;
  user-select: none;
}

.chat-conversation-thread__date-separator::before,
.chat-conversation-thread__date-separator::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--chat-line);
}

.chat-conversation-empty {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 36px 28px;
  text-align: center;
  background: color-mix(in srgb, var(--chat-thread-bg) 92%, var(--chat-muted-chip));
  border: 1px dashed var(--chat-line);
  border-radius: 12px;
}

.chat-conversation-pane__composer {
  --chat-mobile-composer-lift: 0px;
  flex: 0 0 auto;
  display: grid;
  gap: 10px;
  padding: 12px 18px 18px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), var(--chat-thread-bg) 30%);
  transform: translateY(calc(var(--chat-mobile-composer-lift, 0px) * -1));
  transition: transform 180ms ease;
}

.chat-conversation-pane__mobile-dock {
  display: none;
  padding: 4px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 78%, transparent);
  background: color-mix(in srgb, var(--chat-menu-surface) 84%, transparent);
  box-shadow: 0 12px 26px rgba(4, 12, 20, 0.1);
  backdrop-filter: blur(12px);
}

.chat-conversation-pane__mobile-dock-btn {
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 88%, transparent);
  background: color-mix(in srgb, var(--chat-menu-surface) 88%, transparent);
  color: var(--chat-text-soft);
  display: grid;
  place-items: center;
  gap: 3px;
  padding: 6px 4px;
  box-shadow: 0 10px 22px rgba(4, 12, 20, 0.12);
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.chat-conversation-pane__mobile-dock-btn:hover,
.chat-conversation-pane__mobile-dock-btn:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 36%, var(--chat-line));
  color: var(--chat-text);
  transform: translateY(-1px);
}

.chat-conversation-pane__mobile-dock-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.chat-conversation-pane__mobile-dock-btn.active {
  border-color: color-mix(in srgb, var(--chat-accent) 42%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 14%, transparent);
  color: var(--chat-accent);
}

.chat-conversation-pane__mobile-dock-btn.unavailable {
  border-style: dashed;
}

.chat-conversation-pane__mobile-dock-btn--nav {
  color: var(--chat-text);
}

.chat-conversation-pane__mobile-dock-btn--refresh {
  border-color: color-mix(in srgb, var(--chat-accent) 42%, var(--chat-line));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--chat-accent) 26%, transparent),
    color-mix(in srgb, var(--chat-accent) 14%, transparent)
  );
  color: var(--chat-text);
  box-shadow: 0 14px 28px rgba(44, 120, 255, 0.16);
}

.chat-conversation-pane__mobile-dock-btn--refresh .chat-conversation-pane__mobile-dock-icon {
  color: var(--chat-accent);
}

.chat-conversation-pane__mobile-dock-btn--tools.active {
  border-color: color-mix(in srgb, #0f766e 40%, var(--chat-line));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, #14b8a6 16%, transparent),
    color-mix(in srgb, #0f766e 10%, transparent)
  );
  color: color-mix(in srgb, #0f766e 62%, var(--chat-text));
}

.chat-conversation-pane__mobile-dock-btn--thinking.active {
  border-color: color-mix(in srgb, #b45309 40%, var(--chat-line));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, #f59e0b 18%, transparent),
    color-mix(in srgb, #d97706 10%, transparent)
  );
  color: color-mix(in srgb, #b45309 64%, var(--chat-text));
}

.chat-conversation-pane__mobile-dock-btn--exec {
  border-color: color-mix(in srgb, var(--chat-accent) 26%, var(--chat-line));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--chat-accent) 10%, transparent),
    color-mix(in srgb, var(--chat-modal-row) 86%, transparent)
  );
  color: var(--chat-text);
}

.chat-conversation-pane__mobile-dock-btn--exec.active {
  border-color: color-mix(in srgb, var(--chat-accent) 52%, var(--chat-line));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--chat-accent) 20%, transparent),
    color-mix(in srgb, var(--chat-accent) 11%, transparent)
  );
  color: var(--chat-accent);
}

.chat-conversation-pane__mobile-dock-icon {
  font-size: 14px;
  line-height: 1;
  font-weight: 700;
}

.chat-conversation-pane__mobile-dock-label {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.chat-conversation-pane__mobile-dock-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-text-soft) 72%, transparent);
}

.chat-conversation-pane__mobile-dock-btn.active .chat-conversation-pane__mobile-dock-dot {
  background: var(--chat-accent);
}

.chat-conversation-pane__mobile-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 1264;
  background: rgba(6, 12, 22, 0.5);
  backdrop-filter: blur(10px);
}

.chat-conversation-pane__mobile-sheet {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: max(12px, calc(env(safe-area-inset-bottom, 0px) + 8px));
  z-index: 1265;
  display: grid;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--chat-line-strong);
  background: var(--chat-menu-surface);
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.24);
}

.chat-conversation-pane__mobile-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.chat-conversation-pane__mobile-sheet-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.chat-conversation-pane__mobile-sheet-copy strong {
  color: var(--chat-text);
  font-size: 14px;
}

.chat-conversation-pane__mobile-sheet-copy span {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.45;
}

.chat-conversation-pane__mobile-sheet-close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 88%, transparent);
  color: var(--chat-text);
  font-size: 20px;
  line-height: 1;
  display: inline-grid;
  place-items: center;
}

.chat-conversation-pane__mobile-sheet-grid {
  display: grid;
  gap: 8px;
}

.chat-conversation-pane__mobile-sheet-action {
  width: 100%;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 90%, transparent);
  background: color-mix(in srgb, var(--chat-modal-row) 86%, transparent);
  color: var(--chat-text);
  text-align: left;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 10px;
}

.chat-conversation-pane__mobile-sheet-action-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 88%, transparent);
  background: color-mix(in srgb, var(--chat-thread-bg) 72%, var(--chat-modal-row));
  color: var(--chat-text);
  display: inline-grid;
  place-items: center;
  font-size: 14px;
  font-weight: 700;
}

.chat-conversation-pane__mobile-sheet-action-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.chat-conversation-pane__mobile-sheet-action-copy strong {
  font-size: 13px;
  font-weight: 700;
}

.chat-conversation-pane__mobile-sheet-action-copy span {
  color: var(--chat-text-soft);
  font-size: 11px;
  line-height: 1.35;
}

.chat-conversation-pane__mobile-sheet-action:disabled {
  opacity: 0.5;
}

.chat-conversation-pane__queue-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 1266;
  background: rgba(6, 12, 22, 0.52);
  backdrop-filter: blur(10px);
}

.chat-conversation-pane__queue-sheet {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: max(12px, calc(env(safe-area-inset-bottom, 0px) + 8px));
  z-index: 1267;
  display: grid;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--chat-line-strong);
  background: var(--chat-dialog-surface);
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.24);
}

.chat-conversation-pane__queue-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.chat-conversation-pane__queue-sheet-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.chat-conversation-pane__queue-sheet-copy strong {
  color: var(--chat-text);
  font-size: 14px;
}

.chat-conversation-pane__queue-sheet-copy span {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.45;
}

.chat-conversation-pane__queue-sheet-close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 88%, transparent);
  color: var(--chat-text);
  font-size: 20px;
  line-height: 1;
  display: inline-grid;
  place-items: center;
}

.chat-conversation-pane__queue-sheet-body {
  display: grid;
  gap: 10px;
}

@keyframes chat-session-menu-popover-in {
  from {
    opacity: 0;
    transform: translate3d(0, -6px, 0) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@media (max-width: 920px) {
  .chat-conversation-pane__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    padding: 8px 10px 6px;
    gap: 8px;
  }

  .chat-conversation-pane__head {
    width: 100%;
    gap: 10px;
    padding-left: max(calc(env(safe-area-inset-left, 0px) + 48px), 56px);
    padding-right: 4px;
    align-items: flex-start;
  }

  .chat-conversation-pane__actions {
    display: none;
  }

  .chat-conversation-pane__head-meta {
    display: none;
  }

  .chat-conversation-pane__summary {
    display: flex;
  }

  .chat-conversation-pane__mobile-dock {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
  }

  .chat-conversation-pane__copy strong {
    font-size: 14px;
    line-height: 1.3;
  }
}

@media (max-width: 760px) {
  .chat-rendering-settings-mask {
    padding: 10px;
  }

  .chat-rendering-settings-dialog {
    width: 100%;
    max-height: calc(100dvh - 20px);
    padding: 14px;
    border-radius: 12px;
    gap: 12px;
  }

  .chat-rendering-settings-toolbar {
    padding: 12px;
    border-radius: 12px;
  }

  .chat-rendering-settings-body {
    padding-right: 2px;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }

  .chat-rendering-settings-row {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }

  .chat-rendering-settings-row--indented {
    margin-left: 0;
  }

  .chat-rendering-settings-row-actions {
    width: 100%;
  }

  .chat-rendering-settings-chip {
    flex: 1 1 auto;
    justify-content: center;
  }

  .chat-rendering-settings-row-actions--toggle .chat-rendering-settings-chip {
    min-width: 0;
  }

  .chat-rendering-settings-inline-status {
    align-items: flex-start;
  }

  .chat-conversation-pane__head {
    gap: 8px;
  }

  .chat-conversation-pane__avatar {
    width: 34px;
    height: 34px;
    border-radius: 11px;
  }

  .chat-conversation-pane__copy {
    gap: 0;
  }

  .chat-conversation-pane__copy strong {
    font-size: 13px;
    line-height: 1.25;
  }

  .chat-conversation-thread {
    padding: 12px 12px 8px;
  }

  .chat-conversation-pane__composer {
    gap: 8px;
    padding: 6px 10px 8px;
  }

  .chat-conversation-pane__head-meta {
    gap: 6px;
  }

  .chat-conversation-pane__summary {
    gap: 5px;
    margin-top: 3px;
  }

  .chat-conversation-pane__summary-chip {
    min-height: 21px;
    padding: 0 7px;
  }

  .chat-conversation-pane__summary-chip.tone-identity {
    max-width: min(52vw, 220px);
  }

  .chat-conversation-pane__summary-text {
    font-size: 10px;
  }

  .chat-conversation-pane__mobile-dock {
    gap: 4px;
  }

  .chat-conversation-pane__mobile-dock-btn {
    min-height: 40px;
    border-radius: 10px;
    padding: 4px 2px;
  }

  .chat-conversation-pane__mobile-dock-label {
    font-size: 8px;
  }

  .chat-conversation-pane__slash-feedback {
    padding: 0 12px 10px;
  }

  .chat-conversation-pane__search {
    flex: 1 1 100%;
  }

  .chat-conversation-pane__search-input {
    width: 100%;
    min-width: 0;
  }

  .chat-conversation-pane__date-select {
    flex: 1 1 100%;
    min-width: 0;
  }

  .chat-conversation-thread__history-banner {
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 10px;
  }
}

@media (max-width: 480px) {
  .chat-conversation-pane__status {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-session-menu-popover[data-state='open'],
  .chat-rendering-settings-mask[data-state='open'],
  .chat-rendering-settings-dialog[data-state='open'] {
    animation: none;
  }
}
</style>

<style>
.chat-rendering-settings-mask {
  position: fixed;
  inset: 0;
  z-index: 1260;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 8, 15, 0.62);
  backdrop-filter: blur(12px);
}

.chat-rendering-settings-mask[data-state='open'] {
  animation: chat-rendering-settings-mask-in 0.2s ease;
  animation-fill-mode: both;
}

.chat-rendering-settings-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1261;
  width: min(92vw, 820px);
  max-height: calc(100vh - 40px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--chat-line-strong);
  background: var(--chat-dialog-surface);
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(16px);
  overflow: hidden;
  transform: translate(-50%, -50%);
}

.chat-rendering-settings-dialog[data-state='open'] {
  animation: chat-rendering-settings-dialog-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  animation-fill-mode: both;
}

.chat-session-menu-popover {
  min-width: 180px;
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--chat-line-strong);
  background: var(--chat-menu-surface);
  box-shadow: 0 18px 44px rgba(3, 8, 14, 0.28);
  backdrop-filter: blur(24px) saturate(140%);
  z-index: 1600;
  transform-origin: top right;
}

.chat-session-menu-popover[data-state='open'] {
  animation: chat-session-menu-popover-in 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.chat-session-menu-item {
  text-align: left;
  background: transparent;
  color: var(--chat-text);
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: background 0.18s ease, transform 0.18s ease;
}

.chat-session-menu-item[data-highlighted] {
  background: var(--chat-hover);
  transform: translateY(-1px);
}

.chat-session-menu-item[data-disabled] {
  color: var(--chat-text-soft);
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .chat-session-menu-popover[data-state='open'],
  .chat-rendering-settings-mask[data-state='open'],
  .chat-rendering-settings-dialog[data-state='open'] {
    animation: none;
  }
}
</style>
