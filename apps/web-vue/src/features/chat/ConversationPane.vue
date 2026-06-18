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
          <Braces class="chat-conversation-pane__button-icon" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="chat-conversation-pane__icon-btn chat-conversation-pane__icon-btn--desktop-secondary"
          :class="{ active: showThinkingBlocks }"
          :title="showThinkingBlocks ? text('隐藏思考块', 'Hide thinking blocks') : text('显示思考块', 'Show thinking blocks')"
          @click="$emit('toggle-thinking-blocks')"
        >
          <MoreHorizontal class="chat-conversation-pane__button-icon" aria-hidden="true" />
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
          <RefreshCcw class="chat-conversation-pane__button-icon" aria-hidden="true" />
        </button>

        <button
          v-if="selectedSession"
          type="button"
          class="chat-conversation-pane__icon-btn"
          :class="{ active: recordBrowserOpen || recordBrowserHasActiveFilters }"
          :title="text('聊天记录', 'Chat records')"
          @click="$emit('open-record-browser')"
        >
          <List class="chat-conversation-pane__button-icon" aria-hidden="true" />
        </button>

        <DropdownMenuRoot v-model:open="conversationMenuOpen">
          <DropdownMenuTrigger as-child>
            <button
              ref="conversationMenuTrigger"
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
                  <X class="chat-conversation-pane__close-icon" aria-hidden="true" />
                </button>
              </DialogClose>
            </header>

            <div class="chat-conversation-pane__mobile-sheet-grid">
              <button type="button" class="chat-conversation-pane__mobile-sheet-action" @click="triggerMenuAction('new-chat')">
                <Plus class="chat-conversation-pane__mobile-sheet-action-icon" aria-hidden="true" />
                <span class="chat-conversation-pane__mobile-sheet-action-copy">
                  <strong>{{ text('新建会话', 'New chat') }}</strong>
                  <span>{{ text('立即开始新的对话线程。', 'Start a new conversation thread right away.') }}</span>
                </span>
              </button>
              <button type="button" class="chat-conversation-pane__mobile-sheet-action" @click="triggerMenuAction('toggle-inspect')">
                <Braces class="chat-conversation-pane__mobile-sheet-action-icon" aria-hidden="true" />
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
                <List class="chat-conversation-pane__mobile-sheet-action-icon" aria-hidden="true" />
                <span class="chat-conversation-pane__mobile-sheet-action-copy">
                  <strong>{{ text('聊天记录', 'Chat records') }}</strong>
                  <span>{{ text('打开当前会话的独立记录浏览器。', 'Open the dedicated record browser for this chat.') }}</span>
                </span>
              </button>
              <button type="button" class="chat-conversation-pane__mobile-sheet-action" @click="openRenderingSettings">
                <Columns2 class="chat-conversation-pane__mobile-sheet-action-icon" aria-hidden="true" />
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
                <RotateCcw class="chat-conversation-pane__mobile-sheet-action-icon" aria-hidden="true" />
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
            v-if="timelineVirtualSpacerHeight('before') > 0"
            class="chat-conversation-thread__virtual-spacer"
            :style="timelineVirtualSpacerStyle('before')"
            aria-hidden="true"
          ></div>
          <div
            v-for="row in renderedTimelineRows"
            :id="timelineItemAnchorId(row.item) || undefined"
            :key="row.item.id"
            class="chat-conversation-thread__item-shell"
            :style="timelineItemShellStyle(row)"
            :ref="(el) => setTimelineItemShellRef(row.item.id, el as HTMLElement | null)"
          >
            <div
              v-if="row.dateLabel"
              class="chat-conversation-thread__date-separator"
            >
              <span>{{ row.dateLabel }}</span>
            </div>
            <MessageBubble
              v-memo="timelineItemMemoKey(row.item)"
              :group="row.item.type === 'message_group' ? row.item.group : null"
              :overlay="row.item.type === 'run_overlay' ? row.item.overlay : null"
              :overlay-anchor-message-ids="row.item.type === 'run_overlay' ? row.item.anchorMessageIds : []"
              :overlay-process-blocks="row.item.type === 'run_overlay' ? row.item.processBlocks : []"
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
              :force-eager-render="shouldForceEagerTimelineItem(row.index)"
            />
          </div>
          <div
            v-if="timelineVirtualSpacerHeight('after') > 0"
            class="chat-conversation-thread__virtual-spacer"
            :style="timelineVirtualSpacerStyle('after')"
            aria-hidden="true"
          ></div>
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
          :aria-label="jumpToBottomLabel"
          @click="jumpToBottom"
        >
          <span v-if="viewingHistoricalPosition" class="chat-conversation-thread__jump-text">{{ jumpToBottomLabel }}</span>
          <ArrowDown class="chat-conversation-thread__jump-arrow" aria-hidden="true" />
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
            <List class="chat-conversation-pane__mobile-dock-icon" aria-hidden="true" />
            <span class="chat-conversation-pane__mobile-dock-label">{{ text('会话', 'Chats') }}</span>
          </button>
          <button
            type="button"
            class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--refresh"
            :disabled="!canRefresh"
            @click="$emit('refresh-session')"
          >
            <RefreshCcw class="chat-conversation-pane__mobile-dock-icon" aria-hidden="true" />
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
            <Braces class="chat-conversation-pane__mobile-dock-icon" aria-hidden="true" />
            <span class="chat-conversation-pane__mobile-dock-label">{{ text('工具', 'Tools') }}</span>
          </button>
          <button
            type="button"
            class="chat-conversation-pane__mobile-dock-btn chat-conversation-pane__mobile-dock-btn--thinking"
            :class="{ active: showThinkingBlocks }"
            :title="showThinkingBlocks ? text('隐藏思考块', 'Hide thinking blocks') : text('显示思考块', 'Show thinking blocks')"
            @click="$emit('toggle-thinking-blocks')"
          >
            <MoreHorizontal class="chat-conversation-pane__mobile-dock-icon" aria-hidden="true" />
            <span class="chat-conversation-pane__mobile-dock-label">{{ text('思考', 'Thinking') }}</span>
          </button>
          <button
            ref="mobileActionSheetTrigger"
            type="button"
            class="chat-conversation-pane__mobile-dock-btn"
            :class="{ active: mobileActionSheetOpen }"
            :aria-expanded="String(mobileActionSheetOpen)"
            @click="mobileActionSheetOpen = true"
          >
            <Plus class="chat-conversation-pane__mobile-dock-icon" aria-hidden="true" />
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
          @retry-item="$emit('retry-queued-item', $event)"
          @delete-item="$emit('delete-queued-item', $event)"
        />
        <ComposerBar
          ref="composerBarRef"
          :key="selectedSession?.key || 'no-session'"
          :session-key="selectedSession?.key || ''"
          :document="composerDocument"
          :attachments="composerAttachments"
          :placeholder="placeholder"
          :disabled="composerDisabled"
          :can-send="canSend"
          :can-abort="canAbort"
          :send-busy="sendBusy"
          :abort-busy="abortBusy"
          :slash-arg-options-overrides="slashArgOptionsOverrides"
          @update:document="$emit('update:composer-document', { sessionKey: selectedSession?.key || '', document: $event })"
          @send="$emit('send', $event)"
          @abort="$emit('abort')"
          @select-files="$emit('composer-files', $event)"
          @remove-attachment="$emit('composer-remove-attachment', $event)"
          @retry-attachment="$emit('composer-retry-attachment', $event)"
          @keydown="$emit('composer-keydown', $event)"
          @viewport-lift="handleComposerViewportLift"
          @draft-lifecycle-exit="$emit('composer-draft-flush', $event)"
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
                <X class="chat-conversation-pane__close-icon" aria-hidden="true" />
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
              @retry-item="$emit('retry-queued-item', $event)"
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
              <X class="chat-conversation-pane__close-icon" aria-hidden="true" />
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
import './conversation-pane.css';
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, reactive, ref, watch } from 'vue';
import { ArrowDown, Braces, Columns2, List, MoreHorizontal, Plus, RefreshCcw, RotateCcw, X } from '@lucide/vue';
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
import type { TracevaneSlashExecutionFeedback } from './slash-feedback';
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
  resolveStableHistoryBrowseBottomDistance,
  resolveChatSessionJumpToBottom,
  resolveChatSessionTimelineMutation,
  shouldObserveChatSessionBottomSentinel,
  shouldObserveChatSessionTopSentinel,
  syncChatSessionPinnedState,
  type ChatSessionScrollMetrics,
  type ChatSessionScrollState,
} from './chat-session-scroll-state';
import { shouldShowInitialConversationLoading } from '../../../../../lib/chat-conversation-pane-state';
import {
  buildChatTimelineVirtualOffsetIndex,
  resolveChatTimelineVirtualWindow,
} from '../../../../../lib/chat-timeline-virtual-window';
import {
  readChatSessionViewportSnapshot,
  rememberChatSessionViewportSnapshot,
  type ChatSessionViewportSnapshotStorage,
} from './storage';
import { estimateChatTextBlockHeight } from '../../../../../lib/chat-text-estimate';

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
  slashFeedback: TracevaneSlashExecutionFeedback | null;
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

type ComposerAttachmentSnapshot = {
  id: string;
  type: 'image' | 'video' | 'file';
  fileName?: string;
  mimeType: string;
  content?: string;
  dataUrl: string;
  downloadUrl?: string | null;
  size?: number;
  progress?: number;
  relativePath?: string | null;
  uploadState?: 'uploading' | 'ready' | 'failed';
};

type ComposerDocumentUpdatePayload = {
  sessionKey: string;
  document: ChatComposerDocument;
};

type ComposerDraftLifecycleExitPayload = {
  sessionKey: string;
  document: ChatComposerDocument;
  attachments: ComposerAttachmentSnapshot[];
};

type ComposerBarPublicInstance = InstanceType<typeof ComposerBar> & {
  focusEditor: (options?: { preventScroll?: boolean; restoreSelection?: boolean }) => boolean;
};

const emit = defineEmits<{
  (event: 'update:composer-document', value: ComposerDocumentUpdatePayload): void;
  (event: 'send', value: ChatComposerDocument): void;
  (event: 'abort'): void;
  (event: 'composer-files', payload: File[]): void;
  (event: 'composer-remove-attachment', attachmentId: string): void;
  (event: 'composer-retry-attachment', attachmentId: string): void;
  (event: 'composer-draft-flush', payload: ComposerDraftLifecycleExitPayload): void;
  (event: 'reset'): void;
  (event: 'new-chat'): void;
  (event: 'toggle-inspect'): void;
  (event: 'toggle-tool-previews'): void;
  (event: 'toggle-thinking-blocks'): void;
  (event: 'open-session-list'): void;
  (event: 'refresh-session'): void;
  (event: 'composer-keydown', payload: KeyboardEvent): void;
  (event: 'patch-queued-item', payload: { entryId: string; text: string }): void;
  (event: 'retry-queued-item', entryId: string): void;
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
type TimelineItemLayoutRow = {
  id: string;
  dateLabel: string | null;
  estimatedHeight: number;
};
type RenderedTimelineRow = {
  item: ChatRenderableItem;
  index: number;
  dateLabel: string | null;
  estimatedHeight: number;
};
type SessionViewportSnapshot = {
  anchorItemId: string | null;
  anchorMessageId: string | null;
  anchorOffset: number;
  bottomDistance: number | null;
  state: ChatSessionScrollState;
  timelineItemCount: number;
  timelineVersion: string;
  capturedAtMs: number;
  persisted?: boolean;
};
const hostManagementExecToggleTitle = computed(() => {
  if (!props.selectedSession) {
    return text('当前没有可配置的会话。', 'No active chat to configure.');
  }
  if (!props.globalHostManagementExecEnabled) {
    return text(
      '全局开关未开启。前往 Config > 沙盒与安全，打开“允许在 Tracevane Chat 中启用宿主管理 Exec”。',
      'The global switch is off. Go to Config > Sandbox & Security and enable “Allow host-management Exec in Tracevane Chat”.',
    );
  }
  return props.sessionHostManagementExecEnabled
    ? text(
      '当前会话已允许宿主管理 Exec；刷新保留，Tracevane 重启后失效。',
      'Host-management Exec is enabled for this chat; it survives refresh and resets after Tracevane restarts.',
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
const composerBarRef = ref<ComposerBarPublicInstance | null>(null);
const conversationMenuOpen = ref(false);
const mobileActionSheetOpen = ref(false);
const conversationMenuTrigger = ref<HTMLButtonElement | null>(null);
const mobileActionSheetTrigger = ref<HTMLButtonElement | null>(null);
const isCompactViewport = ref(false);
const mobileComposerLift = ref(0);
const renderingSettingsOpen = ref(false);
const renderingSettingsReturnFocus = ref<HTMLElement | null>(null);
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
const pendingUnreadDisplayCount = computed(() => (pendingUnreadCount.value > 99 ? '99+' : String(pendingUnreadCount.value)));
const jumpToBottomLabel = computed(() => {
  if (props.viewingHistoricalPosition && pendingUnreadCount.value > 0) {
    return text(
      `${pendingUnreadDisplayCount.value} 条新消息 · 返回最新`,
      `${pendingUnreadDisplayCount.value} new · Return to latest`,
    );
  }
  return props.viewingHistoricalPosition
    ? text('返回最新', 'Return to latest')
    : text('回到底部', 'Jump to bottom');
});
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
let sessionViewportSnapshotPersistTimer: number | null = null;
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
const HISTORY_BEFORE_PREFETCH_TRIGGER_PX = 2600;
const HISTORY_BEFORE_MATERIALIZE_TRIGGER_PX = 1800;
const HISTORY_AFTER_PREFETCH_TRIGGER_PX = 1800;
const HISTORY_AFTER_MATERIALIZE_TRIGGER_PX = 900;
const HISTORY_AFTER_MIN_CONTEXT_BOTTOM_DISTANCE_PX = 220;
const HISTORY_BEFORE_PREFETCH_VIEWPORTS = 8;
const HISTORY_BEFORE_MATERIALIZE_VIEWPORTS = 5;
const HISTORY_AFTER_PREFETCH_VIEWPORTS = 5;
const HISTORY_AFTER_MATERIALIZE_VIEWPORTS = 2.5;
const HISTORY_BEFORE_AUTO_FILL_TARGET_MULTIPLIER = 3.5;
const HISTORY_PREPEND_ANCHOR_STABILIZE_MS = 2200;
const HISTORY_PREPEND_USER_SCROLL_GRACE_MS = 260;
const HISTORY_BROWSE_GUARD_MS = 6000;
const HISTORY_LATEST_BOTTOM_ANCHOR_STABILIZE_MS = 3600;
const HISTORY_LOADING_INDICATOR_DELAY_MS = 650;
const SESSION_VIEWPORT_SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const SESSION_VIEWPORT_SNAPSHOT_LIMIT = 32;
const TIMELINE_VIRTUALIZE_MIN_ITEMS = 96;
const TIMELINE_ITEM_DEFAULT_HEIGHT = 280;
const TIMELINE_ITEM_GAP = 18;
const TIMELINE_VIRTUALIZE_OVERSCAN_VIEWPORTS = 2.75;
const TIMELINE_VIRTUALIZE_OVERSCAN_MIN_PX = 1400;
const TIMELINE_VIRTUALIZE_OVERSCAN_MAX_PX = 3200;
const timelineViewport = ref({
  scrollTop: 0,
  clientHeight: 0,
});
const timelineItemHeights = reactive<Record<string, number>>({});
const timelineItemShellRefs = new Map<string, HTMLElement>();
const timelineItemObservedElements = new Map<string, HTMLElement>();
const sessionViewportSnapshots = new Map<string, SessionViewportSnapshot>();
let timelineMeasureFrame: number | null = null;
let timelineViewportSyncFrame: number | null = null;
let pendingTimelineViewportMetrics: ChatSessionScrollMetrics | null = null;
let timelineItemResizeObserver: ResizeObserver | null = null;
let threadResizeObserver: ResizeObserver | null = null;
let threadResizeObserverElement: HTMLElement | null = null;
let threadViewportPersistElement: HTMLElement | null = null;
let resizeObserverFrame: number | null = null;
let resizeObserverNeedsThreadSync = false;
let resizeObserverNeedsTimelineResize = false;
let pinnedBottomRepairFrame: number | null = null;
let desktopComposerFocusFrame: number | null = null;
let desktopComposerFocusPending = false;

function resolveTimelineVirtualOverscanPx(clientHeight: number): number {
  const fallbackHeight = TIMELINE_ITEM_DEFAULT_HEIGHT * 3;
  const viewportHeight = Number.isFinite(clientHeight) && clientHeight > 0
    ? clientHeight
    : fallbackHeight;
  return Math.round(Math.min(
    TIMELINE_VIRTUALIZE_OVERSCAN_MAX_PX,
    Math.max(
      TIMELINE_VIRTUALIZE_OVERSCAN_MIN_PX,
      viewportHeight * TIMELINE_VIRTUALIZE_OVERSCAN_VIEWPORTS,
    ),
  ));
}

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

function clearDesktopComposerFocusFrame(): void {
  if (desktopComposerFocusFrame !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(desktopComposerFocusFrame);
  }
  desktopComposerFocusFrame = null;
}

function activeElementShouldKeepFocusForComposer(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const activeElement = document.activeElement;
  if (!activeElement || activeElement === document.body || activeElement === document.documentElement) {
    return false;
  }
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }
  if (activeElement.closest('.chat-composer-shell')) {
    return false;
  }
  return Boolean(
    activeElement.matches('input, textarea, select')
    || activeElement.isContentEditable
    || activeElement.closest('[role="dialog"], [role="menu"], .chat-session-filter-popover, .chat-shell-session-filter-mobile-sheet')
  );
}

function canFocusComposerForDesktopSession(): boolean {
  return Boolean(
    props.selectedSession?.permissions.canSend
    && !props.composerDisabled
    && !isCompactViewport.value
  );
}

function attemptDesktopComposerAutofocus(): void {
  if (!desktopComposerFocusPending || !canFocusComposerForDesktopSession()) {
    return;
  }
  if (activeElementShouldKeepFocusForComposer()) {
    desktopComposerFocusPending = false;
    return;
  }
  if (composerBarRef.value?.focusEditor({ preventScroll: true }) === true) {
    desktopComposerFocusPending = false;
  }
}

function scheduleDesktopComposerAutofocus(): void {
  if (!desktopComposerFocusPending || typeof window === 'undefined' || desktopComposerFocusFrame !== null) {
    return;
  }
  desktopComposerFocusFrame = window.requestAnimationFrame(() => {
    desktopComposerFocusFrame = null;
    void nextTick(() => {
      attemptDesktopComposerAutofocus();
    });
  });
}

function requestDesktopComposerAutofocus(): void {
  desktopComposerFocusPending = Boolean(props.selectedSession?.permissions.canSend);
  scheduleDesktopComposerAutofocus();
}

function applyTimelineViewport(metrics: ChatSessionScrollMetrics | null): void {
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

function syncTimelineViewport(metrics: ChatSessionScrollMetrics | null = readScrollMetrics()): void {
  if (timelineViewportSyncFrame != null) {
    window.cancelAnimationFrame(timelineViewportSyncFrame);
    timelineViewportSyncFrame = null;
    pendingTimelineViewportMetrics = null;
  }
  applyTimelineViewport(metrics);
}

function scheduleTimelineViewportSync(metrics: ChatSessionScrollMetrics | null = readScrollMetrics()): void {
  pendingTimelineViewportMetrics = metrics
    ? {
      scrollTop: metrics.scrollTop,
      scrollHeight: metrics.scrollHeight,
      clientHeight: metrics.clientHeight,
    }
    : null;
  if (timelineViewportSyncFrame != null) {
    return;
  }
  timelineViewportSyncFrame = window.requestAnimationFrame(() => {
    timelineViewportSyncFrame = null;
    const nextMetrics = pendingTimelineViewportMetrics;
    pendingTimelineViewportMetrics = null;
    applyTimelineViewport(nextMetrics);
  });
}

function scrollBottomDistance(metrics: ChatSessionScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

function cloneScrollStateSnapshot(state: ChatSessionScrollState): ChatSessionScrollState {
  return {
    ...state,
    prependAnchor: state.prependAnchor ? { ...state.prependAnchor } : null,
    appendAnchor: state.appendAnchor ? { ...state.appendAnchor } : null,
  };
}

function pruneSessionViewportSnapshots(nowMs = Date.now()): void {
  for (const [sessionKey, snapshot] of sessionViewportSnapshots.entries()) {
    if (nowMs - snapshot.capturedAtMs > SESSION_VIEWPORT_SNAPSHOT_TTL_MS) {
      sessionViewportSnapshots.delete(sessionKey);
    }
  }
  while (sessionViewportSnapshots.size > SESSION_VIEWPORT_SNAPSHOT_LIMIT) {
    const oldestSessionKey = sessionViewportSnapshots.keys().next().value as string | undefined;
    if (!oldestSessionKey) {
      break;
    }
    sessionViewportSnapshots.delete(oldestSessionKey);
  }
}

function sessionViewportSnapshotFromStorage(
  stored: ChatSessionViewportSnapshotStorage,
): SessionViewportSnapshot {
  return {
    anchorItemId: stored.anchorItemId,
    anchorMessageId: stored.anchorMessageId || null,
    anchorOffset: stored.anchorOffset,
    bottomDistance: stored.bottomDistance,
    state: cloneScrollStateSnapshot(scrollState.value),
    timelineItemCount: stored.timelineItemCount,
    timelineVersion: stored.timelineVersion,
    capturedAtMs: stored.capturedAtMs,
    persisted: true,
  };
}

function readPersistedSessionViewportSnapshot(sessionKey: string): SessionViewportSnapshot | null {
  const stored = readChatSessionViewportSnapshot(sessionKey);
  return stored ? sessionViewportSnapshotFromStorage(stored) : null;
}

function clearPersistedSessionViewportSnapshot(sessionKey: string | null | undefined): void {
  rememberChatSessionViewportSnapshot(sessionKey, null);
}

function hasRestorableSessionViewportSnapshot(sessionKey: string | null | undefined): boolean {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return false;
  }
  const snapshot = sessionViewportSnapshots.get(normalizedSessionKey);
  if (!snapshot) {
    return hasPersistedSessionViewportSnapshot(normalizedSessionKey);
  }
  if (Date.now() - snapshot.capturedAtMs > SESSION_VIEWPORT_SNAPSHOT_TTL_MS) {
    sessionViewportSnapshots.delete(normalizedSessionKey);
    return hasPersistedSessionViewportSnapshot(normalizedSessionKey);
  }
  return true;
}

function hasPersistedSessionViewportSnapshot(sessionKey: string | null | undefined): boolean {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  return Boolean(normalizedSessionKey && readChatSessionViewportSnapshot(normalizedSessionKey));
}

function captureSessionViewportSnapshot(sessionKey: string | null | undefined): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return;
  }
  const metrics = readScrollMetrics();
  if (!metrics) {
    sessionViewportSnapshots.delete(normalizedSessionKey);
    clearPersistedSessionViewportSnapshot(normalizedSessionKey);
    return;
  }
  const bottomDistance = scrollBottomDistance(metrics);
  const shouldRememberViewport = Boolean(
    props.viewingHistoricalPosition
    || scrollState.value.autoScrollLockedByUser
    || isHistoryBrowseGuardActive()
    || bottomDistance > 80,
  );
  if (!shouldRememberViewport) {
    sessionViewportSnapshots.delete(normalizedSessionKey);
    clearPersistedSessionViewportSnapshot(normalizedSessionKey);
    return;
  }
  const anchor = readVisibleTimelineAnchor() || readVisibleDomMessageAnchor();
  sessionViewportSnapshots.delete(normalizedSessionKey);
  sessionViewportSnapshots.set(normalizedSessionKey, {
    anchorItemId: anchor?.itemId || null,
    anchorMessageId: anchor?.messageId || null,
    anchorOffset: anchor?.offset || 0,
    bottomDistance,
    state: cloneScrollStateSnapshot(scrollState.value),
    timelineItemCount: props.timelineItems.length,
    timelineVersion: props.timelineVersion || '',
    capturedAtMs: Date.now(),
  });
  if (anchor?.itemId) {
    rememberChatSessionViewportSnapshot(normalizedSessionKey, {
      anchorItemId: anchor.itemId,
      anchorMessageId: anchor.messageId || null,
      anchorOffset: anchor.offset,
      bottomDistance,
      timelineItemCount: props.timelineItems.length,
      timelineVersion: props.timelineVersion || '',
      capturedAtMs: Date.now(),
    });
  } else {
    clearPersistedSessionViewportSnapshot(normalizedSessionKey);
  }
  pruneSessionViewportSnapshots();
}

function clearSessionViewportSnapshotPersistTimer(): void {
  if (sessionViewportSnapshotPersistTimer != null) {
    window.clearTimeout(sessionViewportSnapshotPersistTimer);
    sessionViewportSnapshotPersistTimer = null;
  }
}

function scheduleSessionViewportSnapshotPersist(delayMs = 220): void {
  if (sessionViewportSnapshotPersistTimer != null) {
    return;
  }
  sessionViewportSnapshotPersistTimer = window.setTimeout(() => {
    sessionViewportSnapshotPersistTimer = null;
    captureSessionViewportSnapshot(props.selectedSession?.key || null);
  }, delayMs);
}

function handleThreadViewportPersistenceEvent(): void {
  const metrics = readScrollMetrics();
  if (!metrics) {
    return;
  }
  if (
    scrollBottomDistance(metrics) > 80
    || scrollState.value.autoScrollLockedByUser
    || isHistoryBrowseGuardActive()
  ) {
    scheduleSessionViewportSnapshotPersist();
  }
}

function restoreSessionViewportSnapshot(sessionKey: string | null | undefined): boolean {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey || props.historyLoadingInitial) {
    return false;
  }
  const snapshot = sessionViewportSnapshots.get(normalizedSessionKey)
    || readPersistedSessionViewportSnapshot(normalizedSessionKey);
  if (!snapshot) {
    return false;
  }
  if (Date.now() - snapshot.capturedAtMs > SESSION_VIEWPORT_SNAPSHOT_TTL_MS) {
    sessionViewportSnapshots.delete(normalizedSessionKey);
    clearPersistedSessionViewportSnapshot(normalizedSessionKey);
    return false;
  }
  if (!props.timelineItems.length && snapshot.timelineItemCount > 0) {
    if (!props.historyLoadingInitial) {
      sessionViewportSnapshots.delete(normalizedSessionKey);
      if (snapshot.persisted) {
        clearPersistedSessionViewportSnapshot(normalizedSessionKey);
      }
    }
    return false;
  }
  const metricsBeforeRestore = readScrollMetrics();
  if (!metricsBeforeRestore) {
    return false;
  }

  cancelLatestBottomAnchorRetry();
  extendHistoryBrowseGuard();
  ignoreScrollEvents = true;
  const restoredByAnchor = snapshot.anchorItemId
    ? restoreTimelineItemAnchor(snapshot.anchorItemId, snapshot.anchorOffset)
    : false;
  const restoredByMessageAnchor = !restoredByAnchor && snapshot.anchorMessageId
    ? restoreMessageElementAnchor(snapshot.anchorMessageId, snapshot.anchorOffset)
    : false;
  const restoredByBottomDistance = restoredByAnchor || restoredByMessageAnchor || snapshot.persisted
    ? false
    : restoreHistoryBrowseFallbackBottomDistance(snapshot.bottomDistance);
  window.requestAnimationFrame(() => {
    ignoreScrollEvents = false;
  });
  if (!restoredByAnchor && !restoredByMessageAnchor && !restoredByBottomDistance) {
    if (!snapshot.persisted) {
      sessionViewportSnapshots.delete(normalizedSessionKey);
    } else if (!props.historyLoadingInitial) {
      clearPersistedSessionViewportSnapshot(normalizedSessionKey);
    }
    return false;
  }

  const restoredMetrics = readScrollMetrics() || metricsBeforeRestore;
  scrollState.value = preserveChatSessionHistoryBrowsePosition(
    {
      ...cloneScrollStateSnapshot(snapshot.state),
      awaitingInitialBottomAnchor: false,
      prependAnchor: null,
      appendAnchor: null,
    },
    restoredMetrics,
  );
  syncTimelineViewport(restoredMetrics);
  reconnectTopObserver();
  reconnectBottomObserver();
  scheduleTimelineItemMeasurement();
  sessionViewportSnapshots.delete(normalizedSessionKey);
  clearPersistedSessionViewportSnapshot(normalizedSessionKey);
  return true;
}

function preserveAfterPageHistoricalContext(
  container: HTMLElement,
  metrics: ChatSessionScrollMetrics,
): ChatSessionScrollMetrics {
  if (!props.hasMoreAfter) {
    return metrics;
  }
  const bottomDistance = scrollBottomDistance(metrics);
  if (bottomDistance > 160) {
    return metrics;
  }
  const maxBottomDistance = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const targetBottomDistance = Math.min(HISTORY_AFTER_MIN_CONTEXT_BOTTOM_DISTANCE_PX, maxBottomDistance);
  if (targetBottomDistance <= bottomDistance) {
    return metrics;
  }
  const nextScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight - targetBottomDistance);
  container.scrollTop = nextScrollTop;
  return {
    ...metrics,
    scrollTop: nextScrollTop,
  };
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
    unobserveTimelineItemShell(itemId);
    timelineItemShellRefs.delete(itemId);
    return;
  }
  const previous = timelineItemShellRefs.get(itemId);
  if (previous === element) {
    return;
  }
  timelineItemShellRefs.set(itemId, element);
  observeTimelineItemShell(itemId, element);
}

function handleObservedTimelineResize(): void {
  scheduleTimelineItemMeasurement();
  if (initialLatestAnchorPending && !scrollState.value.autoScrollLockedByUser) {
    scheduleInitialLatestAnchorRetry(1);
    return;
  }
  if (shouldRepairPinnedBottomAfterResize()) {
    schedulePinnedBottomRepair();
    return;
  }
  if (historyPrependMutationPending || stableRestoreAnchorItemId || stableRestoreBottomDistance != null) {
    scheduleStableRestoreAnchorTick();
  }
}

function scheduleResizeObserverWork(options: {
  threadSync?: boolean;
  timelineResize?: boolean;
}): void {
  resizeObserverNeedsThreadSync = resizeObserverNeedsThreadSync || Boolean(options.threadSync);
  resizeObserverNeedsTimelineResize = resizeObserverNeedsTimelineResize || Boolean(options.timelineResize);
  if (resizeObserverFrame != null) {
    return;
  }
  resizeObserverFrame = window.requestAnimationFrame(() => {
    resizeObserverFrame = null;
    const needsThreadSync = resizeObserverNeedsThreadSync;
    const needsTimelineResize = resizeObserverNeedsTimelineResize;
    resizeObserverNeedsThreadSync = false;
    resizeObserverNeedsTimelineResize = false;

    if (needsThreadSync) {
      const metrics = readScrollMetrics();
      syncTimelineViewport(metrics);
      reconnectTopObserver();
      reconnectBottomObserver();
    }
    if (needsTimelineResize || needsThreadSync) {
      handleObservedTimelineResize();
    }
  });
}

function shouldRepairPinnedBottomAfterResize(): boolean {
  return Boolean(
    !scrollState.value.autoScrollLockedByUser
    && scrollState.value.isPinnedToBottom
    && !isHistoryBrowseGuardActive()
    && !historyPrependMutationPending
    && !stableRestoreAnchorItemId
    && stableRestoreBottomDistance == null,
  );
}

function schedulePinnedBottomRepair(): void {
  if (pinnedBottomRepairFrame != null) {
    return;
  }
  pinnedBottomRepairFrame = window.requestAnimationFrame(() => {
    pinnedBottomRepairFrame = null;
    if (!shouldRepairPinnedBottomAfterResize()) {
      return;
    }
    armLatestBottomAnchorStabilizer();
    scrollToBottom('auto', { force: true });
  });
}

function ensureTimelineItemResizeObserver(): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') {
    return null;
  }
  if (!timelineItemResizeObserver) {
    timelineItemResizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) {
        return;
      }
      scheduleResizeObserverWork({ timelineResize: true });
    });
  }
  return timelineItemResizeObserver;
}

function observeTimelineItemShell(itemId: string, element: HTMLElement): void {
  const observer = ensureTimelineItemResizeObserver();
  if (!observer) {
    return;
  }
  const previous = timelineItemObservedElements.get(itemId);
  if (previous === element) {
    return;
  }
  if (previous) {
    observer.unobserve(previous);
  }
  timelineItemObservedElements.set(itemId, element);
  observer.observe(element);
}

function unobserveTimelineItemShell(itemId: string): void {
  const element = timelineItemObservedElements.get(itemId);
  if (!element) {
    return;
  }
  timelineItemResizeObserver?.unobserve(element);
  timelineItemObservedElements.delete(itemId);
}

function clearTimelineItemObservations(): void {
  timelineItemResizeObserver?.disconnect();
  timelineItemResizeObserver = null;
  timelineItemObservedElements.clear();
}

function pruneTimelineMeasurementCache(): void {
  const activeItemIds = new Set(props.timelineItems.map((item) => item.id));
  for (const itemId of Object.keys(timelineItemHeights)) {
    if (!activeItemIds.has(itemId)) {
      delete timelineItemHeights[itemId];
    }
  }
  for (const itemId of Array.from(timelineItemShellRefs.keys())) {
    if (!activeItemIds.has(itemId)) {
      unobserveTimelineItemShell(itemId);
      timelineItemShellRefs.delete(itemId);
    }
  }
}

function bindThreadResizeObserver(): void {
  if (typeof ResizeObserver === 'undefined') {
    return;
  }
  const element = threadBody.value;
  if (!element || threadResizeObserverElement === element) {
    return;
  }
  threadResizeObserver?.disconnect();
  threadResizeObserverElement = element;
  threadResizeObserver = new ResizeObserver(() => {
    scheduleResizeObserverWork({ threadSync: true, timelineResize: true });
  });
  threadResizeObserver.observe(element);
}

function bindThreadViewportPersistenceListener(): void {
  const element = threadBody.value;
  if (!element || threadViewportPersistElement === element) {
    return;
  }
  if (threadViewportPersistElement) {
    threadViewportPersistElement.removeEventListener('scroll', handleThreadViewportPersistenceEvent);
    threadViewportPersistElement.removeEventListener('wheel', handleThreadViewportPersistenceEvent);
  }
  threadViewportPersistElement = element;
  element.addEventListener('scroll', handleThreadViewportPersistenceEvent, { passive: true });
  element.addEventListener('wheel', handleThreadViewportPersistenceEvent, { passive: true });
}

function disconnectThreadViewportPersistenceListener(): void {
  if (!threadViewportPersistElement) {
    return;
  }
  threadViewportPersistElement.removeEventListener('scroll', handleThreadViewportPersistenceEvent);
  threadViewportPersistElement.removeEventListener('wheel', handleThreadViewportPersistenceEvent);
  threadViewportPersistElement = null;
}

function disconnectThreadResizeObserver(): void {
  threadResizeObserver?.disconnect();
  threadResizeObserver = null;
  threadResizeObserverElement = null;
  if (resizeObserverFrame != null) {
    window.cancelAnimationFrame(resizeObserverFrame);
    resizeObserverFrame = null;
  }
  resizeObserverNeedsThreadSync = false;
  resizeObserverNeedsTimelineResize = false;
}

function resolveTimelineItemAnchorMessageId(item: ChatRenderableItem): string | null {
  if (item.type === 'message_group') {
    return item.group.messages[0]?.id || null;
  }
  return item.anchorMessageIds[0] || null;
}

function currentTimelineAnchorCandidateRange(): { start: number; end: number } {
  const total = props.timelineItems.length;
  const virtualWindow = timelineVirtualWindow.value;
  const start = Math.max(0, Math.min(total, virtualWindow.start));
  const end = Math.max(start, Math.min(total, virtualWindow.end));
  return { start, end };
}

function readVisibleTimelineAnchor(): { itemId: string; messageId: string | null; offset: number } | null {
  const container = threadBody.value;
  if (!container) {
    return null;
  }
  const containerRect = container.getBoundingClientRect();
  let partiallyVisibleAnchor: { itemId: string; messageId: string | null; offset: number } | null = null;
  const candidateRange = currentTimelineAnchorCandidateRange();
  for (let index = candidateRange.start; index < candidateRange.end; index += 1) {
    const item = props.timelineItems[index];
    if (!item) {
      continue;
    }
    const element = timelineItemShellRefs.get(item.id);
    if (!element) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) {
      continue;
    }
    const anchor = {
      itemId: item.id,
      messageId: resolveTimelineItemAnchorMessageId(item),
      offset: rect.top - containerRect.top,
    };
    if (rect.top >= containerRect.top) {
      return anchor;
    }
    partiallyVisibleAnchor = partiallyVisibleAnchor || anchor;
  }
  return partiallyVisibleAnchor;
}

function readVisibleDomMessageAnchor(): { itemId: string; messageId: string; offset: number } | null {
  const container = threadBody.value;
  if (!container) {
    return null;
  }
  const containerRect = container.getBoundingClientRect();
  const elements = Array.from(container.querySelectorAll<HTMLElement>('.chat-conversation-thread__item-shell[id^="msg-"]'));
  let partiallyVisibleAnchor: { itemId: string; messageId: string; offset: number } | null = null;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) {
      continue;
    }
    const messageId = element.id.slice(4).trim();
    if (!messageId) {
      continue;
    }
    const anchor = {
      itemId: element.id,
      messageId,
      offset: rect.top - containerRect.top,
    };
    if (rect.top >= containerRect.top) {
      return anchor;
    }
    partiallyVisibleAnchor = partiallyVisibleAnchor || anchor;
  }
  return partiallyVisibleAnchor;
}

function captureVisibleTimelineAnchor(): void {
  const anchor = readVisibleTimelineAnchor() || readVisibleDomMessageAnchor();
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

function restoreMessageElementAnchor(messageId: string | null, offset: number): boolean {
  const container = threadBody.value;
  const anchorElement = messageId ? document.getElementById(`msg-${messageId}`) : null;
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
  const anchor = readVisibleTimelineAnchor() || readVisibleDomMessageAnchor();
  if (anchor) {
    stableRestoreAnchorItemId = anchor.itemId;
    stableRestoreAnchorOffset = anchor.offset;
  }
  const bottomDistance = scrollBottomDistance(metrics);
  const resolvedBottomDistance = resolveStableHistoryBrowseBottomDistance({
    previousBottomDistance: stableRestoreBottomDistance,
    nextBottomDistance: bottomDistance,
    direction: lastThreadScrollDirection,
  });
  stableRestoreBottomDistance = resolvedBottomDistance;
  historyPrependPendingBottomDistance = resolvedBottomDistance;
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
    if (changed && (stableRestoreAnchorItemId || stableRestoreBottomDistance != null)) {
      scheduleStableRestoreAnchorTick();
    }
  });
}

function computeTimelineItemDateLabel(item: ChatRenderableItem, index: number): string | null {
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
  return timelineLayoutRows.value[index]?.id === item.id
    ? timelineLayoutRows.value[index]!.dateLabel
    : computeTimelineItemDateLabel(item, index);
}

function timelineItemEstimatedHeight(item: ChatRenderableItem, index: number): number {
  const measured = timelineItemHeights[item.id];
  if (measured) {
    return measured;
  }
  const hasDateSeparator = Boolean(computeTimelineItemDateLabel(item, index));
  const base = item.type === 'run_overlay'
    ? estimateRunOverlayHeight(item)
    : estimateMessageGroupHeight(item);
  return base + (hasDateSeparator ? 44 : 0);
}

function estimateTextBlockHeight(text: string): number {
  return estimateChatTextBlockHeight(String(text || ''));
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

const timelineLayoutRows = computed<TimelineItemLayoutRow[]>(() =>
  props.timelineItems.map((item, index) => ({
    id: item.id,
    dateLabel: computeTimelineItemDateLabel(item, index),
    estimatedHeight: timelineItemEstimatedHeight(item, index),
  })),
);

const timelineVirtualOffsetIndex = computed(() =>
  buildChatTimelineVirtualOffsetIndex(timelineLayoutRows.value, {
    defaultHeight: TIMELINE_ITEM_DEFAULT_HEIGHT,
    itemGap: TIMELINE_ITEM_GAP,
  }),
);

const timelineVirtualWindow = computed(() => {
  const total = props.timelineItems.length;
  if (props.forceEagerHistoryRender || total <= TIMELINE_VIRTUALIZE_MIN_ITEMS) {
    return {
      start: 0,
      end: total,
    };
  }
  return resolveChatTimelineVirtualWindow({
    rows: timelineLayoutRows.value,
    offsetIndex: timelineVirtualOffsetIndex.value,
    scrollTop: timelineViewport.value.scrollTop,
    clientHeight: timelineViewport.value.clientHeight,
    overscanPx: resolveTimelineVirtualOverscanPx(timelineViewport.value.clientHeight),
    minVirtualizeItems: TIMELINE_VIRTUALIZE_MIN_ITEMS,
    forceEagerRender: props.forceEagerHistoryRender,
  });
});

const renderedTimelineRows = computed<RenderedTimelineRow[]>(() => {
  const total = props.timelineItems.length;
  const start = Math.max(0, Math.min(total, timelineVirtualWindow.value.start));
  const end = Math.max(start, Math.min(total, timelineVirtualWindow.value.end));
  const rows: RenderedTimelineRow[] = [];
  for (let index = start; index < end; index += 1) {
    const item = props.timelineItems[index];
    if (item) {
      const layoutRow = timelineLayoutRows.value[index];
      rows.push({
        item,
        index,
        dateLabel: layoutRow?.id === item.id ? layoutRow.dateLabel : computeTimelineItemDateLabel(item, index),
        estimatedHeight: layoutRow?.id === item.id ? layoutRow.estimatedHeight : timelineItemEstimatedHeight(item, index),
      });
    }
  }
  return rows;
});

function timelineVirtualSpacerHeight(position: 'before' | 'after'): number {
  const total = props.timelineItems.length;
  if (!total || props.forceEagerHistoryRender || total <= TIMELINE_VIRTUALIZE_MIN_ITEMS) {
    return 0;
  }
  const offsetIndex = timelineVirtualOffsetIndex.value;
  const start = Math.max(0, Math.min(total, timelineVirtualWindow.value.start));
  const end = Math.max(start, Math.min(total, timelineVirtualWindow.value.end));
  const rawHeight = position === 'before'
    ? offsetIndex.offsets[start] || 0
    : Math.max(0, offsetIndex.totalHeight - (offsetIndex.offsets[end] || offsetIndex.totalHeight));
  if (rawHeight <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(rawHeight - TIMELINE_ITEM_GAP));
}

function timelineVirtualSpacerStyle(position: 'before' | 'after'): Record<string, string> {
  return {
    height: `${timelineVirtualSpacerHeight(position)}px`,
  };
}

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

function timelineItemShellStyle(row: RenderedTimelineRow): Record<string, string> | undefined {
  const measured = timelineItemHeights[row.item.id];
  if (isTimelineItemVisible(row.index) && measured) {
    return undefined;
  }
  return {
    minHeight: `${row.estimatedHeight}px`,
  };
}

function unreadTailSignatureForItem(item: ChatRenderableItem | null | undefined): string | null {
  if (!item) {
    return null;
  }
  if (item.type === 'message_group') {
    const lastMessage = item.group.messages[item.group.messages.length - 1] || null;
    return lastMessage?.id ? `message:${lastMessage.id}` : `group:${item.id}`;
  }
  return item.overlay.runId
    ? `overlay:${item.overlay.runId}`
    : `overlay:${item.id}`;
}

watch(
  () => props.timelineItems.map((item) => item.id),
  () => {
    pruneTimelineMeasurementCache();
  },
  { flush: 'post' },
);

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
      tailSignature: unreadTailSignatureForItem(props.timelineItems[props.timelineItems.length - 1]),
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
          const contextMetrics = preserveAfterPageHistoricalContext(container, nextMetrics);
          scrollState.value = syncChatSessionPinnedState(scrollState.value, contextMetrics);
          syncTimelineViewport(contextMetrics);
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
    scheduleTimelineViewportSync(metrics);
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
  scheduleDesktopComposerAutofocus();
});

function resetScrollLocksForLatestJump(): void {
  const sessionKey = props.selectedSession?.key || null;
  clearSessionViewportSnapshotPersistTimer();
  if (sessionKey) {
    sessionViewportSnapshots.delete(sessionKey);
    clearPersistedSessionViewportSnapshot(sessionKey);
  }
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
    || hasRestorableSessionViewportSnapshot(props.selectedSession.key)
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
  scheduleSessionViewportSnapshotPersist();
  scheduleStableRestoreAnchorRefreshFromCurrentViewport();
  if (
    metrics
    && metrics.scrollTop <= historyBeforePrefetchTriggerPx(metrics)
    && metrics.scrollTop > historyBeforeMaterializeTriggerPx(metrics)
    && props.hasMoreBefore
    && !props.historyLoadingBefore
    && !props.historyLoadingInitial
  ) {
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
      scheduleSessionViewportSnapshotPersist();
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
    scheduleSessionViewportSnapshotPersist();
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

function handleBeforeUnload(): void {
  captureSessionViewportSnapshot(props.selectedSession?.key || null);
}

function triggerMenuAction(
  action: 'new-chat' | 'toggle-inspect' | 'reset' | 'open-record-browser',
): void {
  closeMenu();
  emit(action);
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

function renderingSettingsFallbackTrigger(): HTMLButtonElement | null {
  return isCompactViewport.value ? mobileActionSheetTrigger.value : conversationMenuTrigger.value;
}

function rememberRenderingSettingsReturnFocus(): void {
  renderingSettingsReturnFocus.value = null;
  if (typeof document !== 'undefined') {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const transientSurface = active?.closest('.chat-session-menu-popover, .chat-conversation-pane__mobile-sheet') || null;
    if (active?.isConnected && !transientSurface) {
      renderingSettingsReturnFocus.value = active;
    }
  }
  if (!renderingSettingsReturnFocus.value) {
    renderingSettingsReturnFocus.value = renderingSettingsFallbackTrigger();
  }
}

function restoreRenderingSettingsReturnFocus(): void {
  const returnTarget = renderingSettingsReturnFocus.value;
  renderingSettingsReturnFocus.value = null;
  void nextTick(() => {
    if (returnTarget?.isConnected) {
      returnTarget.focus({ preventScroll: true });
      return;
    }
    renderingSettingsFallbackTrigger()?.focus({ preventScroll: true });
  });
}

function openRenderingSettings(): void {
  rememberRenderingSettingsReturnFocus();
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
  bindThreadResizeObserver();
  bindThreadViewportPersistenceListener();
  scheduleTimelineItemMeasurement();
  reconnectTopObserver();
  reconnectBottomObserver();
  window.addEventListener('beforeunload', handleBeforeUnload);
  requestDesktopComposerAutofocus();
});

onUpdated(() => {
  bindThreadResizeObserver();
  bindThreadViewportPersistenceListener();
  restorePendingPrependBottomClipIfNeeded();
});

watch(
  () => props.selectedSession?.key || null,
  (sessionKey, previousSessionKey) => {
    captureSessionViewportSnapshot(previousSessionKey);
    requestDesktopComposerAutofocus();
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
    clearTimelineItemObservations();
    timelineItemShellRefs.clear();
    if (renderingSettingsScope.value === 'session' && !props.selectedSession) {
      renderingSettingsScope.value = 'global';
    }
    nextTick(() => {
      syncTimelineViewport();
      scheduleTimelineItemMeasurement();
      reconnectTopObserver();
      reconnectBottomObserver();
      const restoredSessionViewport = restoreSessionViewportSnapshot(sessionKey);
      if (!restoredSessionViewport && !props.timelineItems.length) {
        scrollState.value = {
          ...scrollState.value,
          awaitingInitialBottomAnchor: false,
        };
        scrollToBottom('auto');
      }
      if (!restoredSessionViewport) {
        scheduleInitialLatestAnchorRetry();
      }
      scheduleHistoryBeforeAutoFill();
      scheduleDesktopComposerAutofocus();
    });
  },
);

watch(renderingSettingsOpen, (open, previousOpen) => {
  if (!open && previousOpen) {
    restoreRenderingSettingsReturnFocus();
  }
});

watch(
  () => props.composerDisabled,
  (disabled) => {
    if (!disabled) {
      scheduleDesktopComposerAutofocus();
    }
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
    nextTick(() => {
      if (!restoreSessionViewportSnapshot(props.selectedSession?.key || null)) {
        void restoreLatestBottomAnchorIfNeeded();
      }
    });
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
  clearSessionViewportSnapshotPersistTimer();
  captureSessionViewportSnapshot(props.selectedSession?.key || null);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  clearInitialLatestAnchorTimer();
  clearHistoryBeforeAutoFillTimer();
  clearHistoryBeforeContinuationTimer();
  clearHistoryBeforeIndicatorTimer();
  clearHistoryAfterIndicatorTimer();
  clearStableRestoreAnchor();
  clearDesktopComposerFocusFrame();
  topSentinelObserver?.disconnect();
  topSentinelObserver = null;
  bottomSentinelObserver?.disconnect();
  bottomSentinelObserver = null;
  disconnectThreadViewportPersistenceListener();
  disconnectThreadResizeObserver();
  clearTimelineItemObservations();
  if (timelineMeasureFrame != null) {
    window.cancelAnimationFrame(timelineMeasureFrame);
    timelineMeasureFrame = null;
  }
  if (timelineViewportSyncFrame != null) {
    window.cancelAnimationFrame(timelineViewportSyncFrame);
    timelineViewportSyncFrame = null;
    pendingTimelineViewportMetrics = null;
  }
  if (pinnedBottomRepairFrame != null) {
    window.cancelAnimationFrame(pinnedBottomRepairFrame);
    pinnedBottomRepairFrame = null;
  }
  timelineItemShellRefs.clear();
  unbindCompactViewport();
  stopInlinePreviewPrefListener?.();
  stopInlinePreviewPrefListener = null;
});
</script>
