<template>
  <section
    class="chat-shell"
    data-context-policy="local-inspector"
    :class="{
      'inspect-mode': inspectPinned,
      'theme-light': resolvedTheme === 'light',
      'theme-dark': resolvedTheme === 'dark',
    }"
  >
    <div class="chat-shell-layout chat-focused-workspace">
      <aside class="chat-shell-sidebar chat-session-rail chat-session-rail-context">
        <SessionListPanel
          :organizer="organizerState"
          :active-sessions="activeStudioManagedSessions"
          :archived-sessions="archivedStudioManagedSessions"
          :observed-sessions="observedSessions"
          :selected-session-key="selectedSessionKey"
          :loading="sessionsLoading || agentsLoading"
          :inspect-mode="inspectPinned"
          :agents="agentRows"
          :theme="resolvedTheme"
          @select-session="openSession"
          @new-chat="newChatOpen = true"
          @create-folder="handleCreateFolder"
          @toggle-inspect="toggleInspectRoute"
          @session-action="handleSessionAction"
          @folder-action="handleFolderAction"
          @assign-sessions="handleAssignSessions"
          @batch-action="handleBatchAction"
        />
      </aside>

      <main class="chat-shell-main chat-main-stage chat-main-stage-focus">
        <ConversationPane
          :selected-session="selectedSession"
          :title="conversationTitle"
          :subtitle="conversationSubtitle"
          :agent-name="agentName"
          :agent-avatar="agentAvatar"
          :agent-emoji="agentEmoji"
          :agent-initial="agentInitial"
          :timeline-items="renderTimelineItems"
          :timeline-version="timelineVersion"
          :overlay-tool-call-ids="overlayToolCallIds"
          :show-tool-previews="showToolPreviews"
          :show-thinking-blocks="showThinkingBlocks"
          :history-loading-initial="historyLoadingInitial"
          :history-loading-before="historyLoadingBefore"
          :has-more-before="historyPageInfo.hasMoreBefore"
          :has-more-after="historyPageInfo.hasMoreAfter"
          :history-loading-after="historyLoadingAfter"
          :viewing-historical-position="viewingHistoricalPosition"
          :auto-fill-history-before-enabled="historyMode === 'history' && !selectedHistoryDay"
          :force-eager-history-render="historyRenderStabilizing"
          :history-prepend-anchor-message-id="historyPrependAnchorMessageId"
          :history-error-message="historyErrorMessage"
          :access-error="accessError"
          :gateway-warning="gatewayWarning"
          :slash-feedback="selectedSlashFeedback"
          :latest-jump-token="latestJumpToken"
          :composer-document="composerDocument"
          :composer-attachments="composerAttachments"
          :placeholder="composerPlaceholder"
          :composer-disabled="composerDisabled"
          :can-send="canSend"
          :can-abort="canAbort"
          :can-reset="canReset"
          :can-refresh="canRefresh"
          :send-busy="sendBusy"
          :abort-busy="abortBusy"
          :refresh-busy="refreshBusy"
          :slash-arg-options-overrides="slashArgOptionsOverrides"
          :inspect-pinned="inspectPinned"
          :active-run-id="activeRuntime?.activeRunId || null"
          :active-streaming-message-id="activeStreamingMessageId"
          :queued-items="selectedQueuedItems"
          :queue-rail-expanded="queueRailExpanded"
          :mobile-queue-sheet-open="mobileQueueSheetOpen"
          :sound-cues-enabled="soundCuesEnabled"
          :global-host-management-exec-enabled="globalHostManagementExecEnabled"
          :session-host-management-exec-enabled="selectedSessionControls.allowHostManagementExec"
          :can-toggle-host-management-exec="canToggleHostManagementExec"
          :host-management-exec-toggle-busy="hostManagementExecToggleBusy"
          :record-browser-open="recordBrowserOpen"
          :record-browser-has-active-filters="recordBrowserHasActiveFilters"
          :queue-mutating-entry-id="queueMutatingEntryId"
          @update:composer-document="handleComposerDocumentUpdate"
          @send="sendMessage($event)"
          @abort="abortCurrentRun"
          @composer-files="handleComposerFiles"
          @composer-remove-attachment="removeComposerAttachment"
          @composer-retry-attachment="retryComposerAttachment"
          @composer-draft-flush="flushComposerDraftSave($event)"
          @patch-queued-item="patchQueuedMessage"
          @retry-queued-item="retryQueuedMessage"
          @delete-queued-item="removeQueuedMessage"
          @reset="resetCurrentSession"
          @new-chat="newChatOpen = true"
          @toggle-inspect="toggleInspectRoute"
          @toggle-host-management-exec="toggleSessionHostManagementExec"
          @toggle-sound-cues="soundCuesEnabled = $event"
          @toggle-tool-previews="showToolPreviews = !showToolPreviews"
          @toggle-thinking-blocks="showThinkingBlocks = !showThinkingBlocks"
          @open-record-browser="toggleRecordBrowser"
          @open-session-list="mobileSessionDrawerOpen = true"
          @update:queue-rail-expanded="queueRailExpanded = $event"
          @update:mobile-queue-sheet-open="mobileQueueSheetOpen = $event"
          @refresh-session="refreshSelectedConversation"
          @composer-keydown="handleComposerKeydown"
          @load-more-before="loadMoreHistoryBefore"
          @prefetch-more-before="prefetchMoreHistoryBefore"
          @prefetch-more-after="prefetchMoreHistoryAfter"
          @load-more-after="loadMoreHistoryAfter"
          @history-before-render-settled="handleHistoryBeforeRenderSettled"
          @jump-to-live="jumpToLive"
          @jump-to-message="handleSearchResultJump"
          @dismiss-slash-feedback="dismissSelectedSlashFeedback"
        />
        <ChatRecordBrowserPanel
          v-if="recordBrowserOpen"
          :open="recordBrowserOpen"
          :theme="resolvedTheme"
          :session-title="conversationTitle"
          :session-subtitle="conversationSubtitle"
          :query="recordBrowserQuery"
          :role-filter="recordBrowserRoleFilter"
          :content-filter="recordBrowserContentFilter"
          :available-days="historyDays"
          :selected-day="recordBrowserSelectedDay"
          :loading="recordBrowserLoading"
          :error-message="recordBrowserErrorMessage"
          :has-active-filters="recordBrowserHasActiveFilters"
          :match-count="recordBrowserMatchCount"
          :visible-matches="recordBrowserVisibleMatches"
          :grouped-visible-matches="recordBrowserGroupedVisibleMatches"
          :selected-result-message-id="recordBrowserSelectedResultMessageId"
          @close="closeRecordBrowser"
          @update:open="recordBrowserOpen = $event"
          @update:query="recordBrowserQuery = $event"
          @update:role-filter="recordBrowserRoleFilter = $event"
          @update:content-filter="recordBrowserContentFilter = $event"
          @update:selected-day="updateRecordBrowserSelectedDay"
          @search="runRecordBrowserSearch"
          @clear="clearRecordBrowserState"
          @select-result="recordBrowserSelectResult"
          @jump-to-message="handleRecordBrowserJump"
          @jump-to-day="handleRecordBrowserDayJump"
        />
        <Transition name="chat-shell-toast">
          <div
            v-if="activeToast"
            :key="`${activeToast.kind}:${activeToast.text}`"
            class="chat-shell-toast-layer"
            :class="resolvedTheme === 'light' ? 'theme-light' : 'theme-dark'"
          >
            <div
              class="chat-shell-toast"
              :class="activeToast.kind === 'error' ? 'chat-shell-toast-error' : 'chat-shell-toast-success'"
              :role="activeToast.kind === 'error' ? 'alert' : 'status'"
              :aria-live="activeToast.kind === 'error' ? 'assertive' : 'polite'"
            >
              <span class="chat-shell-toast-icon" aria-hidden="true">
                <AlertTriangle v-if="activeToast.kind === 'error'" class="drawer-close-icon" />
                <Check v-else class="drawer-close-icon" />
              </span>
              <span class="chat-shell-toast-text">{{ activeToast.text }}</span>
              <button
                type="button"
                class="chat-shell-toast-close"
                :aria-label="text('关闭提示', 'Dismiss notice')"
                @click="dismissToast"
              >
                <X class="drawer-close-icon" aria-hidden="true" />
              </button>
            </div>
          </div>
        </Transition>
      </main>
    </div>

    <DialogRoot v-model:open="mobileSessionDrawerOpen">
      <DialogPortal>
        <DialogOverlay
          class="chat-mobile-drawer-mask"
          :class="resolvedTheme === 'light' ? 'theme-light' : 'theme-dark'"
        />
        <DialogContent
          as-child
          @open-auto-focus.prevent
          @close-auto-focus.prevent
        >
          <aside class="chat-mobile-drawer chat-mobile-session-rail" :class="resolvedTheme === 'light' ? 'theme-light' : 'theme-dark'">
          <DialogTitle as-child>
            <span class="sr-only">{{ text('移动端会话列表', 'Mobile session list') }}</span>
          </DialogTitle>
          <DialogDescription as-child>
            <span class="sr-only">{{ text('浏览、创建和管理聊天会话。', 'Browse, create, and manage chat sessions.') }}</span>
          </DialogDescription>
          <SessionListPanel
            :organizer="organizerState"
            :active-sessions="activeStudioManagedSessions"
            :archived-sessions="archivedStudioManagedSessions"
            :observed-sessions="observedSessions"
            :selected-session-key="selectedSessionKey"
            :loading="sessionsLoading || agentsLoading"
            :inspect-mode="inspectPinned"
            :agents="agentRows"
            :theme="resolvedTheme"
            @select-session="selectSessionFromMobile"
            @new-chat="openNewChatFromMobile"
            @create-folder="handleCreateFolder"
            @toggle-inspect="toggleInspectFromMobile"
            @session-action="handleSessionAction"
            @folder-action="handleFolderAction"
            @assign-sessions="handleAssignSessions"
            @batch-action="handleBatchAction"
          />
          </aside>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot
      :open="inspectPinned && inspectorDrawerOpen"
      :modal="chatShellCompactViewport"
      @update:open="handleInspectorDrawerOpenChange"
    >
      <DialogPortal>
        <DialogOverlay
          class="chat-inspector-mask"
          :class="resolvedTheme === 'light' ? 'theme-light' : 'theme-dark'"
        />
        <DialogContent
          as-child
          @open-auto-focus.prevent
          @close-auto-focus.prevent
          @interact-outside="handleInspectorInteractOutside"
        >
          <aside class="chat-inspector-sheet chat-side-inspector chat-mobile-inspector-sheet" :class="resolvedTheme === 'light' ? 'theme-light' : 'theme-dark'">
          <DialogTitle as-child>
            <span class="sr-only">{{ text('会话调试台', 'Session inspector') }}</span>
          </DialogTitle>
          <DialogDescription as-child>
            <span class="sr-only">{{ text('查看当前聊天会话的运行状态、工具调用和诊断信息。', 'Review runtime state, tool calls, and diagnostics for the current chat session.') }}</span>
          </DialogDescription>
          <InspectorPanel
            v-if="inspectPinned && inspectorDrawerOpen"
            :tab="inspectorTab"
            :session="selectedSession"
            :agent-name="agentName"
            :runtime="activeRuntime"
            :diagnostics="activeDiagnostics"
            :observability="activeObservability"
            :warning-message="gatewayWarning || accessError || activeRuntime?.lastErrorMessage || ''"
            @close="closeInspectorDrawer"
            @update:tab="inspectorTab = $event"
          />
          </aside>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <NewChatAgentPicker
      v-if="newChatOpen"
      :open="newChatOpen"
      :creating="sessionCreating"
      :agents="agentRows"
      @close="newChatOpen = false"
      @select="createSessionForAgent"
    />

    <SlashCommandHelpDialog
      v-if="slashHelpOpen"
      :open="slashHelpOpen"
      :filter="slashHelpFilter"
      @close="closeSlashHelpDialog"
      @insert-command="insertSlashCommandFromHelp"
    />

    <SlashStatusDialog
      v-if="slashStatusOpen"
      :open="slashStatusOpen"
      :title="conversationTitle"
      :session-key="selectedSession?.key || ''"
      :agent-name="agentName"
      :agent-id="selectedSession?.agentId || ''"
      :writable="Boolean(selectedSession?.permissions.writable)"
      :runtime="activeRuntime"
      :queue-length="selectedQueuedItems.length"
      :realtime-ready="selectedSessionRealtimeReady"
      :global-host-management-exec-enabled="globalHostManagementExecEnabled"
      :session-host-management-exec-enabled="selectedSessionControls.allowHostManagementExec"
      :viewing-historical-position="viewingHistoricalPosition"
      :has-more-before="historyPageInfo.hasMoreBefore"
      :has-more-after="historyPageInfo.hasMoreAfter"
      :gateway-warning="gatewayWarning"
      :access-error="accessError"
      @close="closeSlashStatusDialog"
    />

    <DialogRoot :open="hostManagementExecConfirmOpen" @update:open="handleHostManagementExecConfirmOpenChange">
      <DialogPortal>
        <DialogOverlay class="chat-host-exec-confirm-mask" />
        <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
          <section v-if="hostManagementExecConfirmOpen" class="chat-host-exec-confirm-dialog">
            <header class="chat-host-exec-confirm-head">
              <div class="chat-host-exec-confirm-copy">
                <DialogTitle as-child>
                  <strong>{{ text('开启本会话宿主管理 Exec', 'Enable host-management Exec for this chat') }}</strong>
                </DialogTitle>
                <DialogDescription as-child>
                  <span>
                    {{ text(
                      '开启后，这个会话里的私聊 chat 可以直接执行宿主管理类 exec / shell / bash 命令。',
                      'Once enabled, this chat can directly run host-management exec / shell / bash commands.',
                    ) }}
                  </span>
                </DialogDescription>
              </div>
              <DialogClose as-child>
                <button
                  type="button"
                  class="chat-host-exec-confirm-close"
                  :aria-label="text('关闭确认窗口', 'Close confirmation dialog')"
                >
                  <X class="drawer-close-icon" aria-hidden="true" />
                </button>
              </DialogClose>
            </header>

            <div class="chat-host-exec-confirm-body">
              <div class="chat-host-exec-confirm-chip">
                <span class="chat-host-exec-confirm-chip-dot"></span>
                <span>{{ text('仅当前会话生效', 'Applies only to this chat session') }}</span>
              </div>
              <div class="chat-host-exec-confirm-chip">
                <span class="chat-host-exec-confirm-chip-dot warn"></span>
                <span>{{ text('刷新保留，Studio 重启后自动失效', 'Persists through refresh and auto-expires after Studio restart') }}</span>
              </div>
            </div>

            <footer class="chat-host-exec-confirm-actions">
              <button
                type="button"
                class="chat-host-exec-confirm-secondary"
                :disabled="hostManagementExecToggleBusy"
                @click="closeHostManagementExecConfirm"
              >
                {{ text('取消', 'Cancel') }}
              </button>
              <button
                type="button"
                class="chat-host-exec-confirm-primary"
                :disabled="hostManagementExecToggleBusy"
                @click="confirmSessionHostManagementExec"
              >
                {{ hostManagementExecToggleBusy
                  ? text('开启中...', 'Enabling...')
                  : text('确认开启', 'Enable now') }}
              </button>
            </footer>
          </section>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useRoute, useRouter } from 'vue-router';
import { AlertTriangle, Check, X } from '@lucide/vue';
import type { AgentSummary } from '../../../../../types/agents';
import type {
  ChatActivityItem,
  ChatAttachmentKind,
  ChatAbortResponse,
  ChatComposerDocument,
  ChatDiagnostics,
  ChatGatewayAttachResponse,
  ChatHistoryDateBucket,
  ChatHistoryPageInfo,
  ChatHistoryPayload,
  ChatMessageItem,
  ChatObservabilityState,
  ChatPatchQueueEntryRequest,
  ChatPatchSessionControlsRequest,
  ChatQueuedMessageItem,
  ChatQueuePayload,
  ChatRunOverlay,
  ChatRuntimeState,
  ChatSendAck,
  ChatSendAttachment,
  ChatSendRequest,
  ChatBootstrapPayload,
  ChatSessionControlState,
  ChatSessionControlsPayload,
  ChatSessionFolderMove,
  ChatSessionOrganizerState,
  ChatSessionRow,
  ChatStreamEvent,
  ChatToolCard,
} from '../../../../../types/chat';
import {
  STUDIO_CHAT_GATEWAY_EVENT,
  STUDIO_CHAT_GATEWAY_METHODS,
} from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import { getWebSocketBasePath, resolveStudioGatewayClientAuth } from '../../shared/api';
import { GatewayBrowserClient, type GatewayEventFrame } from '../../shared/gateway-client';
import { getStudioExposureKind, getStudioRealtimeTransport, isChatRealtimeEnabled } from '../../shared/runtime-config';
import { useThemePreference } from '../../shared/theme';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import {
  playChatCue,
  readChatSoundCuesEnabled,
  writeChatSoundCuesEnabled,
} from './chat-sound-preferences';
import {
  areComposerAttachmentsReady,
  buildComposerSendPlan,
  runLimitedComposerUploadQueue,
  type ChatComposerUploadState,
} from '../../../../../lib/chat-composer';
import {
  buildPersistableComposerDraft,
  type ChatComposerPersistedDraftAttachment,
} from '../../../../../lib/chat-composer-draft';
import {
  createEmptyComposerDocument,
  normalizeComposerDocument,
} from '../../../../../lib/composer-model';
import {
  abortChatRun,
  assignChatSessionsToFolder,
  buildChatStreamUrl,
  createChatSession,
  createChatFolder,
  deleteChatQueueEntry,
  deleteChatFolder,
  deleteChatSession,
  enqueueChatMessage,
  fetchChatBootstrap,
  fetchChatOrganizer,
  fetchChatHistoryDates,
  fetchChatHistoryPage,
  fetchAgentsSummary,
  fetchChatHealth,
  fetchChatQueue,
  fetchChatSessionControls,
  fetchChatSessions,
  patchChatQueueEntry,
  patchChatFolder,
  patchChatSession,
  patchChatSessionControls,
  requestChatSlashGateway,
  resetChatSession,
  searchChatHistory,
  sendChatMessage,
  uploadChatFileWithProgress,
} from './api';
import { fetchConfigSummary } from '../config/api';
import {
  CHAT_SESSION_LOAD_CONCURRENCY,
  mergeSessionRowsForAgent,
  prioritizeAgentsForSessionLoad,
} from '../../../../../lib/chat-session-catalog';
import {
  deriveRuntimeMessagePreview,
} from '../../../../../lib/chat-runtime-state';
import {
  mergeCanonicalSnapshotPageInfo,
} from '../../../../../lib/chat-history-page-info';
import {
  applyDerivedAutoLabelToSessionRow,
  resolveSessionEditableLabel,
} from '../../../../../lib/chat-session-auto-title';
import {
  buildGatewayDirectAbortResponse,
  buildGatewayDirectSendAck,
  compileGatewayMessageText,
} from '../../../../../lib/chat-gateway-transport';
import {
  createEmptyChatSessionOrganizerState,
  pruneOrganizerStateSessionKeys,
  removeSessionsFromOrganizer,
} from '../../../../../lib/chat-session-organizer';
import { deriveAgentIdFromChatSessionKey } from './session-ref';
import {
  readChatComposerDraft,
  readChatLastStreamSeq,
  readChatSessionViewportSnapshot,
  readLastChatAgentId,
  readLastChatSessionKey,
  clearChatLastStreamSeq,
  rememberChatComposerDraft,
  rememberChatLastStreamSeq,
  rememberChatSessionViewportSnapshot,
  rememberLastChatAgentId,
  rememberLastChatSessionKey,
} from './storage';
import {
  cloneRuntimeObservability,
  createEmptyRuntimeObservability,
  settleRuntimeToolCardsBeforeAssistant,
  upsertRuntimeTimelineItems,
  upsertRuntimeToolCards,
} from './chat-runtime-events';
import {
  buildChatRoute as buildRuntimeChatRoute,
  buildSearchHistoryPayload,
  clearChatRuntimeSnapshot,
  hydrateHistoryPayloadFromSnapshot,
  readChatRuntimeSnapshot,
  restoreRuntimeMachineStateFromSnapshot,
  resolveChatRouteSessionKey,
  resolveFallbackSessionKey as resolveRuntimeFallbackSessionKey,
  saveChatRuntimeSnapshot,
  shouldIncludeMessageInHistoryWindow,
  shouldRestoreRuntimeMachineStateFromSnapshot,
} from './chat-runtime-recovery';
import {
  applyChatSessionCanonicalMessageEvent,
  applyChatSessionCanonicalSnapshotEvent,
  applyChatSessionAbortedEvent,
  applyChatSessionDeltaEvent,
  applyChatSessionFinalEvent,
  applyChatSessionTemporaryAssistantEvent,
  applyChatSessionTemporaryToolEvent,
  applyChatSessionToolEvent,
  buildChatSessionRuntimeRenderModel,
  clearChatSessionTransientRun,
  createEmptyChatSessionRuntimeMachineState,
  injectChatSessionOptimisticMessage,
  listChatSessionRuntimeRunIds,
  appendChatSessionCanonicalMessageLedger,
  anchorChatSessionCanonicalMessageLedger,
  prependChatSessionCanonicalMessageLedger,
  replaceChatSessionCanonicalMessageLedger,
  replaceChatSessionProcessLedger,
  resetChatSessionRuntimeMachine,
  syncChatSessionCanonicalMessageLedger,
  upsertChatSessionProcessLedgerOverlay,
  type ChatSessionRuntimeMachineState,
  type WindowEvictionResult,
} from './chat-session-runtime-machine';
import { CHAT_PROTOCOL_MODE_DEFAULT } from '../../../../api/modules/chat/contract';
import {
  groupSearchMatchesByDay,
  normalizeChatRecordBrowserQuery,
  useChatRecordBrowserState,
} from './chat-record-browser-state';
import { useChatRuntimeViewModel } from './chat-runtime-view-model';
import {
  CHAT_PROCESS_VISIBILITY_DEFAULTS,
  CHAT_PROCESS_VISIBILITY_STORAGE_KEYS,
} from '../../../../../lib/chat-process-visibility';
import { isSelectedChatSessionRealtimeReady } from '../../../../../lib/chat-realtime-ready';
import {
  clearChatRealtimeRecoveryState,
  createChatRealtimeRecoveryState,
  markChatRealtimeDisconnected,
  resolveChatRealtimeRecoverySyncDecision,
} from '../../../../../lib/chat-realtime-recovery';
import ConversationPane from './ConversationPane.vue';
import SessionListPanel from './SessionListPanel.vue';
import { parseStudioSlashCommand, type StudioSlashCommandDef } from './slash-commands';
import './chat-shell-workspace.css';
import {
  applyRuntimeToStudioSlashExecutionFeedback,
  createStudioSlashExecutionFeedback,
  isStudioSlashExecutionFeedbackTerminal,
  type StudioSlashExecutionFeedback,
} from './slash-feedback';

type NoticeMessage = {
  kind: 'success' | 'error';
  text: string;
};

type PendingQueuedSlashCommand = {
  entryId: string | null;
  clientRequestId: string;
  commandName: string;
  args: string;
  queuedAt: string;
};

const ChatRecordBrowserPanel = defineAsyncComponent(() => import('./ChatRecordBrowserPanel.vue'));
const InspectorPanel = defineAsyncComponent(() => import('./InspectorPanel.vue'));
const NewChatAgentPicker = defineAsyncComponent(() => import('./NewChatAgentPicker.vue'));
const SlashCommandHelpDialog = defineAsyncComponent(() => import('./SlashCommandHelpDialog.vue'));
const SlashStatusDialog = defineAsyncComponent(() => import('./SlashStatusDialog.vue'));

type ComposerImageAttachment = ChatSendAttachment & {
  id: string;
  dataUrl: string;
  downloadUrl?: string | null;
  size?: number;
  progress?: number;
  relativePath?: string | null; // Workspace-relative path for @path reference
  uploadState: ChatComposerUploadState;
};

type ComposerDraftAttachmentSnapshot = {
  id: string;
  type: ChatAttachmentKind;
  fileName?: string;
  mimeType: string;
  content?: string;
  dataUrl?: string;
  downloadUrl?: string | null;
  size?: number;
  progress?: number;
  relativePath?: string | null;
  uploadState?: ChatComposerUploadState;
};

type ComposerDocumentUpdatePayload = {
  sessionKey: string;
  document: ChatComposerDocument;
};

type ComposerDraftLifecycleExitPayload = {
  sessionKey: string;
  document: ChatComposerDocument;
  attachments?: ComposerDraftAttachmentSnapshot[];
};

type PreparedComposerUpload = {
  id: string;
  fileName: string;
  mimeType: string;
  file?: File;
  content?: string;
};

type PendingComposerUpload = {
  id: string;
  file: File;
  fileName: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  size: number;
};

type ChatComposerSessionDraft = {
  document: ChatComposerDocument;
  attachments: ComposerImageAttachment[];
  updatedAt: string;
};

const COMPOSER_UPLOAD_CONCURRENCY = 3;

const props = withDefaults(defineProps<{
  shellMode?: 'chat' | 'inspect';
}>(), {
  shellMode: 'chat',
});

const chatProtocolMode = CHAT_PROTOCOL_MODE_DEFAULT;

const route = useRoute();
const router = useRouter();
const { locale, text } = useLocalePreference();
const { resolvedTheme } = useThemePreference();
const { confirm } = useConfirmDialog();

const agentRows = ref<AgentSummary[]>([]);
const organizerState = ref<ChatSessionOrganizerState>(createEmptyChatSessionOrganizerState());
const sessionRows = ref<ChatSessionRow[]>([]);
const selectedSessionKey = ref('');
const historyPayload = ref<ChatHistoryPayload | null>(null);
const runtimeMachineState = ref<ChatSessionRuntimeMachineState>(createEmptyChatSessionRuntimeMachineState());
const historyPageInfo = ref<ChatHistoryPageInfo>({
  hasMoreBefore: false,
  beforeCursor: null,
  hasMoreAfter: false,
  afterCursor: null,
});
const historyDays = ref<ChatHistoryDateBucket[]>([]);
const chatHealth = ref<ChatDiagnostics | null>(null);
const agentsLoading = ref(false);
const sessionsLoading = ref(false);
const historyLoadingInitial = ref(false);
const historyLoadingBefore = ref(false);
const historyLoadingAfter = ref(false);
const latestJumpToken = ref(0);
let historyBeforeMaterializeInFlight = false;
let historyBeforeMaterializeReleaseTimer: number | null = null;
const sessionCreating = ref(false);
const sendBusy = ref(false);
const abortBusy = ref(false);
const refreshBusy = ref(false);
const resetBusy = ref(false);
const hostManagementExecToggleBusy = ref(false);
const queueMutatingEntryId = ref<string | null>(null);
const composerDocument = ref<ChatComposerDocument>(createEmptyComposerDocument());
const composerAttachments = ref<ComposerImageAttachment[]>([]);
const composerUploadSourceFiles = new Map<string, File>();
const queuedItemsBySession = ref<Record<string, ChatQueuedMessageItem[]>>({});
const sessionControlsBySession = ref<Record<string, ChatSessionControlState>>({});
const globalHostManagementExecEnabled = ref(false);
const slashFeedbackBySession = ref<Record<string, StudioSlashExecutionFeedback | null>>({});
const pendingQueuedSlashCommandsBySession = ref<Record<string, PendingQueuedSlashCommand[]>>({});
const errorMessage = ref('');
const historyErrorMessage = ref('');
const noticeMessage = ref<NoticeMessage | null>(null);
const wsConnected = ref(false);
const newChatOpen = ref(false);
const mobileSessionDrawerOpen = ref(false);
const queueRailExpanded = ref(false);
const mobileQueueSheetOpen = ref(false);
const inspectorTab = ref<'overview' | 'tools' | 'activity' | 'diagnostics'>('overview');
const inspectorDrawerOpen = ref(true);
const chatShellCompactViewport = ref(false);
const hostManagementExecConfirmOpen = ref(false);
const pendingHostManagementExecValue = ref<boolean | null>(null);
const pendingHostManagementExecSessionKey = ref<string | null>(null);
const soundCuesEnabled = ref(true);
const showToolPreviews = ref(CHAT_PROCESS_VISIBILITY_DEFAULTS.showToolPreviews);
const showThinkingBlocks = ref(CHAT_PROCESS_VISIBILITY_DEFAULTS.showThinkingBlocks);
const slashHelpOpen = ref(false);
const slashHelpFilter = ref('');
const slashStatusOpen = ref(false);
const slashArgOptionsOverrides = ref<Record<string, string[]>>({});

let chatSocket: WebSocket | null = null;
let chatSocketSessionKey = '';
let chatEventSource: EventSource | null = null;
let chatEventSourceSessionKey = '';
let gatewayClient: GatewayBrowserClient | null = null;
let gatewayChatSessionKey = '';
let chatShellCompactViewportMediaQuery: MediaQueryList | null = null;
let chatShellCompactViewportListener: ((event: MediaQueryListEvent) => void) | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let gatewayHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let wsReconnectAttempt = 0;
let standaloneChatRealtimeFallback: 'eventsource' | null = null;
const WS_RECONNECT_BASE_MS = 1000;
const WS_RECONNECT_MAX_MS = 30000;
const WS_RECONNECT_MAX_ATTEMPTS = 20;
const STANDALONE_EVENTSOURCE_FALLBACK_THRESHOLD = 2;
const CHAT_REALTIME_RECOVERY_SYNC_DELAY_MS = 180;
const CHAT_REALTIME_RECOVERY_SYNC_MIN_INTERVAL_MS = 1500;
let historyLoadVersion = 0;
let sessionsLoadVersion = 0;
let recordBrowserSearchVersion = 0;
let recordBrowserSearchController: AbortController | null = null;
let liveHistorySyncTimer: number | null = null;
let runSettlementSyncTimer: number | null = null;
let realtimeRecoveryRetryTimer: number | null = null;
let realtimeRecoveryRetrySessionKey = '';
let deferredInitialHistoryLoadTimer: number | null = null;
let deferredSessionHydrationTimer: number | null = null;
let historyReplaceRequestController: AbortController | null = null;
let historyDatesRequestController: AbortController | null = null;
let historyBeforePrefetchController: AbortController | null = null;
let historyBeforePrefetchKey: ChatHistoryBeforePrefetchKey | null = null;
let historyBeforePrefetchPromise: Promise<void> | null = null;
let historyBeforePrefetchTimer: number | null = null;
let historyBeforePrefetchIdleHandle: number | null = null;
let historyAfterPrefetchController: AbortController | null = null;
let historyAfterPrefetchKey: ChatHistoryAfterPrefetchKey | null = null;
let historyAfterPrefetchPromise: Promise<void> | null = null;
let historyAfterPrefetchTimer: number | null = null;
let historyAfterPrefetchIdleHandle: number | null = null;
let historyRenderStabilizeTimer: number | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
const suppressedRunIds = new Set<string>();
const terminalRunFenceBySession = new Map<string, Set<string>>();
const locallyActiveRunIdBySession = new Map<string, string>();
const lastStreamSeqBySession = new Map<string, number>();
const lastStreamSeqLoadedFromStorageBySession = new Set<string>();
const playedChatSentCueIds = new Set<string>();
const playedChatReceivedCueIds = new Set<string>();
const historyMode = ref<'history' | 'search'>('history');
const searchQuery = ref('');
const selectedHistoryDay = ref<string | null>(null);
const organizerSourceState = ref<ChatSessionOrganizerState>(createEmptyChatSessionOrganizerState());
const recordBrowser = useChatRecordBrowserState();
const recordBrowserOpen = recordBrowser.open;
const recordBrowserQuery = recordBrowser.query;
const recordBrowserRoleFilter = recordBrowser.roleFilter;
const recordBrowserContentFilter = recordBrowser.contentFilter;
const recordBrowserSelectedDay = recordBrowser.selectedDay;
const recordBrowserSelectedResultMessageId = recordBrowser.selectedResultMessageId;
const recordBrowserLoading = recordBrowser.loading;
const recordBrowserErrorMessage = recordBrowser.errorMessage;
const recordBrowserPayload = recordBrowser.payload;
const recordBrowserHasActiveFilters = recordBrowser.hasActiveFilters;
const recordBrowserClearResults = recordBrowser.clearResults;
const recordBrowserSetPayload = recordBrowser.setPayload;
const recordBrowserSelectResult = recordBrowser.selectResult;
const resetRecordBrowserState = recordBrowser.reset;
const recordBrowserVisibleMatches = computed(() => recordBrowserPayload.value?.matches || []);
const recordBrowserGroupedVisibleMatches = computed(() => groupSearchMatchesByDay(recordBrowserVisibleMatches.value));
const recordBrowserMatchCount = computed(() => recordBrowserVisibleMatches.value.length);
const NOTICE_TIMEOUT_MS: Record<NoticeMessage['kind'], number> = {
  success: 2400,
  error: 5600,
};
const CHAT_HISTORY_BOOTSTRAP_WINDOW_LIMIT = 12;
const CHAT_HISTORY_INITIAL_WINDOW_LIMIT = 24;
const CHAT_HISTORY_PAGE_LIMIT = 12;
const CHAT_HISTORY_AUTO_FILL_PAGE_LIMIT = 24;
const CHAT_HISTORY_DEFER_MS = 320;
const CHAT_TOOL_STREAM_THROTTLE_MS = 80;
const CHAT_DEBUG_TRACE_STORAGE_KEY = 'openclaw-studio.chat.debug-stream-trace';
const CHAT_DEBUG_TRACE_LIMIT = 300;
const CHAT_SESSION_BOOTSTRAP_AGENT_LIMIT = 1;
const CHAT_SESSION_DEFERRED_HYDRATION_DELAY_MS = 180;
const CHAT_SESSION_BOOTSTRAP_ROW_LIMIT = 40;
const CHAT_COMPOSER_DRAFT_SAVE_DELAY_MS = 320;
const CHAT_SESSION_BOOTSTRAP_LOCAL_FETCH_OPTIONS = {
  limit: CHAT_SESSION_BOOTSTRAP_ROW_LIMIT,
  includeDerivedTitles: false,
  includeLastMessage: false,
  localOnly: true,
} as const;
const SESSION_ROW_PROTECTION_TTL_MS = 20_000;
const SESSION_CREATE_SEND_GUARD_MS = 1_200;
const protectedSessionRowDeadlines = new Map<string, number>();
const sessionSendGuardDeadlines = new Map<string, number>();
const sessionSendGuardVersion = ref(0);
const historyDatesLoadedSessionKey = ref('');
const historyDatesLoading = ref(false);
const historyRenderStabilizing = ref(false);
const historyPrependAnchorMessageId = ref<string | null>(null);
const optimisticStartupSessionKey = ref('');
const bootstrapPrimedSessionKey = ref('');
const bootstrapLoading = ref(true);
const prefetchedHistoryBefore = ref<{
  sessionKey: string;
  mode: 'history' | 'search';
  beforeCursor: string;
  day: string | null;
  query: string;
  payload: ChatHistoryPayload;
} | null>(null);
const prefetchedHistoryAfter = ref<{
  sessionKey: string;
  afterCursor: string;
  day: string | null;
  payload: ChatHistoryPayload;
} | null>(null);
type ChatHistoryBeforePrefetchKey = {
  sessionKey: string;
  mode: 'history' | 'search';
  beforeCursor: string;
  day: string | null;
  query: string;
};
type ChatHistoryAfterPrefetchKey = {
  sessionKey: string;
  afterCursor: string;
  day: string | null;
};
const bootstrapHistorySyncSkipSessionKeys = new Set<string>();
type ChatTemporaryToolStreamEvent = Extract<ChatStreamEvent, { kind: 'temporary.tool' }>;
const pendingTemporaryToolEvents = new Map<string, ChatTemporaryToolStreamEvent>();
let temporaryToolFlushTimer: number | null = null;
type ChatDebugTraceEntry = {
  at: string;
  source: 'stream' | 'send' | 'session';
  kind: string;
  sessionKey: string | null;
  runId: string | null;
  note?: string;
};
let chatDebugTraceEnabled = false;
const chatDebugTraceBuffer: ChatDebugTraceEntry[] = [];

type ChatShellWarmCacheSnapshot = {
  capturedAt: number;
  agentRows: AgentSummary[];
  sessionRows: ChatSessionRow[];
  organizer: ChatSessionOrganizerState;
  chatHealth: ChatDiagnostics | null;
  globalHostManagementExecEnabled: boolean;
  slashModelOptions: string[];
};

const CHAT_SHELL_WARM_CACHE_TTL_MS = 45_000;
const CHAT_SHELL_WARM_CACHE_STORAGE_KEY = 'openclaw-studio.chat.shell-warm-cache';
let chatShellWarmCache: ChatShellWarmCacheSnapshot | null = null;
const exhaustedHistoryBeforeCursorBySession = new Map<string, string>();
const exhaustedHistoryAfterCursorBySession = new Map<string, string>();
const composerDraftsBySession = new Map<string, ChatComposerSessionDraft>();
let composerDraftSaveTimer: number | null = null;
const realtimeRecoveryState = createChatRealtimeRecoveryState();
let shellViewportSnapshotInterval: number | null = null;

declare global {
  interface Window {
    __OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE?: () => void;
    __OPENCLAW_STUDIO_CHAT_TRACE__?: ChatDebugTraceEntry[];
  }
}

const routeSessionKey = computed(() => resolveChatRouteSessionKey({
  routeParamSessionRef: typeof route.params.sessionRef === 'string' ? route.params.sessionRef : '',
  routeQuerySessionRef: typeof route.query.sessionRef === 'string' ? route.query.sessionRef : '',
  legacyQuerySession: typeof route.query.session === 'string' ? route.query.session : '',
}));

const runtimeRenderModel = computed(() => buildChatSessionRuntimeRenderModel(runtimeMachineState.value));
const renderMessages = computed(() => runtimeRenderModel.value.messages);
const renderOverlays = computed(() => runtimeRenderModel.value.overlays);
const selectedSessionRealtimeReady = computed(() => {
  const activeRealtimeSessionKey = usesChatEventSource()
    ? chatEventSourceSessionKey
    : chatSocketSessionKey;
  return isSelectedChatSessionRealtimeReady({
    selectedSessionKey: selectedSessionKey.value,
    connected: wsConnected.value,
    activeRealtimeSessionKey,
  });
});

const runtimeView = useChatRuntimeViewModel({
  shellMode: computed(() => props.shellMode),
  sessionRows: computed(() => sessionRows.value),
  selectedSessionKey: computed(() => selectedSessionKey.value),
  historyPayload: computed(() => historyPayload.value),
  renderMessages,
  renderOverlays,
  routeSessionKey,
  agentRows: computed(() => agentRows.value),
  chatHealth: computed(() => chatHealth.value),
  wsConnected: computed(() => selectedSessionRealtimeReady.value),
  text,
});

const inspectPinned = runtimeView.inspectPinned;
const selectedSession = runtimeView.selectedSession;
const studioManagedSessions = runtimeView.studioManagedSessions;
const activeStudioManagedSessions = runtimeView.activeStudioManagedSessions;
const archivedStudioManagedSessions = runtimeView.archivedStudioManagedSessions;
const observedSessions = runtimeView.observedSessions;
const activeRuntime = runtimeView.activeRuntime;
const activeDiagnostics = runtimeView.activeDiagnostics;
const activeObservability = runtimeView.activeObservability;
const selectedAgentId = runtimeView.selectedAgentId;
const agentName = runtimeView.agentName;
const agentAvatar = runtimeView.agentAvatar;
const agentEmoji = runtimeView.agentEmoji;
const agentInitial = runtimeView.agentInitial;
const overlayToolCallIds = runtimeView.overlayToolCallIds;
const conversationTitle = runtimeView.conversationTitle;
const conversationSubtitle = runtimeView.conversationSubtitle;
const gatewayWarning = runtimeView.gatewayWarning;
const accessError = runtimeView.accessError;
const activeStreamingMessageId = runtimeView.activeStreamingMessageId;
const renderTimelineItems = runtimeView.renderTimelineItems;
const timelineVersion = runtimeView.timelineVersion;
const activeToast = computed<NoticeMessage | null>(() => {
  if (errorMessage.value) {
    return {
      kind: 'error',
      text: errorMessage.value,
    };
  }
  return noticeMessage.value;
});
const selectedQueuedItems = computed(() => (
  selectedSessionKey.value
    ? (queuedItemsBySession.value[selectedSessionKey.value] || [])
    : []
));
const selectedSlashFeedback = computed<StudioSlashExecutionFeedback | null>(() => (
  selectedSessionKey.value
    ? (slashFeedbackBySession.value[selectedSessionKey.value] || null)
    : null
));
const selectedSessionControls = computed<ChatSessionControlState>(() => (
  selectedSessionKey.value
    ? (
      sessionControlsBySession.value[selectedSessionKey.value]
      || { allowHostManagementExec: false, updatedAt: null }
    )
    : { allowHostManagementExec: false, updatedAt: null }
));
const canToggleHostManagementExec = computed(() => Boolean(
  selectedSession.value?.permissions.writable
  && !accessError.value,
));

const composerPlaceholder = computed(() => {
  if (!selectedSession.value) return text('先从左侧选择一个会话，或新建一个会话。', 'Choose a chat from the left, or start a new one.');
  if (activeRuntime.value?.activeRunId) {
    return text(
      '当前回复生成中；现在继续发送会先进入待发送队列。',
      'A reply is still running. New sends will go into the queue first.',
    );
  }
  if (isSessionSendGuardActive(selectedSession.value.key)) return text('新会话正在初始化，请稍候…', 'Initializing the new chat…');
  if (accessError.value || !selectedSession.value.permissions.canSend) return text('当前会话只读，不允许发送消息。', 'This session is read-only and cannot send messages.');
  return text('继续这段对话…', 'Continue the conversation…');
});

const composerDisabled = computed(() => (
  !selectedSession.value
  || Boolean(accessError.value)
  || !selectedSession.value.permissions.canSend
  || isSessionSendGuardActive(selectedSession.value.key)
  || historyLoadingInitial.value
  || sendBusy.value
  || resetBusy.value
));
const attachmentsReady = computed(() => areComposerAttachmentsReady(composerAttachments.value));
const canSend = computed(() => Boolean(
  selectedSession.value?.permissions.canSend
  && attachmentsReady.value
  && !isSessionSendGuardActive(selectedSession.value.key)
  && !historyLoadingInitial.value
  && !sendBusy.value
  && selectedSessionRealtimeReady.value
  && !accessError.value,
));
const canAbort = computed(() => Boolean(selectedSession.value?.permissions.canAbort && activeRuntime.value?.activeRunId && !abortBusy.value && !accessError.value));
const canReset = computed(() => Boolean(
  selectedSession.value?.permissions.canReset
  && !activeRuntime.value?.activeRunId
  && !resetBusy.value
  && !accessError.value,
));
const canRefresh = computed(() => Boolean(selectedSession.value && !refreshBusy.value && !accessError.value));

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function inferAttachmentKind(mimeType: string, fileName: string): ChatAttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function shouldReadComposerPreview(kind: ChatAttachmentKind, mimeType: string): boolean {
  return kind === 'image' || kind === 'video' || mimeType.startsWith('image/') || mimeType.startsWith('video/');
}

function cloneComposerDocument(documentValue: ChatComposerDocument): ChatComposerDocument {
  return normalizeComposerDocument(documentValue, { editorSurface: true })
    .map((node) => ({ ...node }));
}

function firstComposerNonWhitespaceIndex(value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index]?.trim()) {
      return index;
    }
  }
  return -1;
}

function normalizedComposerDocumentHasContent(documentValue: ChatComposerDocument): boolean {
  for (const node of documentValue) {
    if (node.type === 'resource-ref') {
      return true;
    }
    if (firstComposerNonWhitespaceIndex(node.text || '') !== -1) {
      return true;
    }
  }
  return false;
}

function readNormalizedSlashCommandText(documentValue: ChatComposerDocument): string {
  let slashTextParts: string[] | null = null;
  for (const node of documentValue) {
    if (node.type === 'resource-ref') {
      return '';
    }
    const textValue = node.text || '';
    if (slashTextParts) {
      slashTextParts.push(textValue);
      continue;
    }
    const contentIndex = firstComposerNonWhitespaceIndex(textValue);
    if (contentIndex === -1) {
      continue;
    }
    if (textValue[contentIndex] !== '/') {
      return '';
    }
    slashTextParts = [textValue.slice(contentIndex)];
  }
  return slashTextParts ? slashTextParts.join('').trimEnd() : '';
}

function cloneComposerAttachment(attachment: ComposerImageAttachment): ComposerImageAttachment {
  return { ...attachment };
}

function normalizeComposerDraftAttachmentSnapshot(
  attachment: ComposerDraftAttachmentSnapshot,
): ComposerImageAttachment {
  return {
    id: attachment.id,
    type: attachment.type,
    mimeType: attachment.mimeType || 'application/octet-stream',
    fileName: attachment.fileName,
    content: attachment.content || '',
    dataUrl: attachment.dataUrl || '',
    downloadUrl: attachment.downloadUrl,
    size: attachment.size,
    progress: attachment.progress,
    relativePath: attachment.relativePath,
    uploadState: attachment.uploadState || 'uploading',
  };
}

function restoreDraftAttachment(
  attachment: ChatComposerPersistedDraftAttachment,
): ComposerImageAttachment {
  return {
    ...attachment,
    content: '',
    progress: 100,
    uploadState: 'ready',
  };
}

function currentComposerDraftHasContent(
  documentValue: ChatComposerDocument,
  attachments: ComposerImageAttachment[],
): boolean {
  return normalizedComposerDocumentHasContent(documentValue) || attachments.length > 0;
}

function rememberComposerDraftNow(sessionKey: string | null | undefined = selectedSessionKey.value): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return;
  }
  const documentValue = cloneComposerDocument(composerDocument.value);
  const attachments = composerAttachments.value.map(cloneComposerAttachment);
  if (!currentComposerDraftHasContent(documentValue, attachments)) {
    clearComposerDraftForSession(normalizedSessionKey);
    return;
  }

  const updatedAt = new Date().toISOString();
  composerDraftsBySession.set(normalizedSessionKey, {
    document: documentValue,
    attachments,
    updatedAt,
  });
  rememberChatComposerDraft(
    normalizedSessionKey,
    buildPersistableComposerDraft({
      document: documentValue,
      attachments,
      updatedAt,
    }),
  );
}

function clearComposerDraftForSession(sessionKey: string | null | undefined): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return;
  }
  composerDraftsBySession.delete(normalizedSessionKey);
  rememberChatComposerDraft(normalizedSessionKey, null);
}

function clearLocalSessionCaches(sessionKey: string | null | undefined): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return;
  }
  clearComposerDraftForSession(normalizedSessionKey);
  clearLastStreamSeqForSession(normalizedSessionKey);
  clearChatRuntimeSnapshot(normalizedSessionKey);
  rememberChatSessionViewportSnapshot(normalizedSessionKey, null);
}

function repairLastSessionPointerAfterDelete(sessionKeys: string[]): void {
  const deleted = new Set(sessionKeys);
  const rememberedSessionKey = readLastChatSessionKey();
  if (!rememberedSessionKey || !deleted.has(rememberedSessionKey)) {
    return;
  }
  const selectedSurvivor = selectedSessionKey.value && !deleted.has(selectedSessionKey.value)
    ? selectedSessionKey.value
    : '';
  const nextSessionKey = selectedSurvivor || resolveNextSessionKeyAfterDeleteMany(sessionKeys);
  rememberLastChatSessionKey(nextSessionKey || null);
  rememberLastChatAgentId(nextSessionKey ? deriveAgentIdFromChatSessionKey(nextSessionKey) : null);
}

function handleComposerDocumentUpdate(payload: ComposerDocumentUpdatePayload): void {
  const normalizedSessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : '';
  const documentValue = cloneComposerDocument(payload.document);
  if (!normalizedSessionKey || normalizedSessionKey === selectedSessionKey.value) {
    composerDocument.value = documentValue;
    return;
  }
  const draft = composerDraftsBySession.get(normalizedSessionKey);
  persistComposerDraftSnapshot(normalizedSessionKey, documentValue, draft?.attachments || []);
}

function persistComposerDraftLifecycleSnapshot(payload: ComposerDraftLifecycleExitPayload): void {
  const normalizedSessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return;
  }
  const documentValue = cloneComposerDocument(payload.document);
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments.map(normalizeComposerDraftAttachmentSnapshot)
    : (
      normalizedSessionKey === selectedSessionKey.value
        ? composerAttachments.value.map(cloneComposerAttachment)
        : (composerDraftsBySession.get(normalizedSessionKey)?.attachments.map(cloneComposerAttachment) || [])
    );
  persistComposerDraftSnapshot(normalizedSessionKey, documentValue, attachments);
  if (normalizedSessionKey === selectedSessionKey.value) {
    composerDocument.value = documentValue;
    composerAttachments.value = attachments.map(cloneComposerAttachment);
  }
}

function clearComposerDraftSaveTimer(): void {
  if (composerDraftSaveTimer === null || typeof window === 'undefined') {
    composerDraftSaveTimer = null;
    return;
  }
  window.clearTimeout(composerDraftSaveTimer);
  composerDraftSaveTimer = null;
}

function flushComposerDraftSave(
  sessionOrPayload: string | ComposerDraftLifecycleExitPayload | null | undefined = selectedSessionKey.value,
): void {
  clearComposerDraftSaveTimer();
  if (typeof sessionOrPayload === 'object' && sessionOrPayload !== null) {
    persistComposerDraftLifecycleSnapshot(sessionOrPayload);
    return;
  }
  rememberComposerDraftNow(sessionOrPayload);
}

function scheduleComposerDraftSave(): void {
  if (!selectedSessionKey.value || typeof window === 'undefined') {
    rememberComposerDraftNow();
    return;
  }
  clearComposerDraftSaveTimer();
  composerDraftSaveTimer = window.setTimeout(() => {
    composerDraftSaveTimer = null;
    rememberComposerDraftNow();
  }, CHAT_COMPOSER_DRAFT_SAVE_DELAY_MS);
}

function restoreComposerDraftForSession(sessionKey: string): void {
  const memoryDraft = composerDraftsBySession.get(sessionKey);
  if (memoryDraft) {
    composerDocument.value = cloneComposerDocument(memoryDraft.document);
    composerAttachments.value = memoryDraft.attachments.map(cloneComposerAttachment);
    return;
  }

  const persistedDraft = readChatComposerDraft(sessionKey);
  if (persistedDraft) {
    composerDocument.value = cloneComposerDocument(persistedDraft.document);
    composerAttachments.value = persistedDraft.attachments.map(restoreDraftAttachment);
    composerDraftsBySession.set(sessionKey, {
      document: cloneComposerDocument(persistedDraft.document),
      attachments: composerAttachments.value.map(cloneComposerAttachment),
      updatedAt: persistedDraft.updatedAt,
    });
    return;
  }

  composerDocument.value = createEmptyComposerDocument();
  composerAttachments.value = [];
}

function patchComposerAttachment(
  attachmentId: string,
  update: (attachment: ComposerImageAttachment) => ComposerImageAttachment,
): boolean {
  const idx = composerAttachments.value.findIndex((attachment) => attachment.id === attachmentId);
  if (idx === -1) {
    return false;
  }
  const attachment = composerAttachments.value[idx] as ComposerImageAttachment;
  composerAttachments.value = [
    ...composerAttachments.value.slice(0, idx),
    update(attachment),
    ...composerAttachments.value.slice(idx + 1),
  ];
  return true;
}

function hasComposerAttachment(attachmentId: string): boolean {
  return composerAttachments.value.some((attachment) => attachment.id === attachmentId);
}

function persistComposerDraftSnapshot(
  sessionKey: string,
  documentValue: ChatComposerDocument,
  attachments: ComposerImageAttachment[],
  updatedAt = new Date().toISOString(),
): void {
  const normalizedSessionKey = sessionKey.trim();
  if (!normalizedSessionKey) {
    return;
  }
  const documentSnapshot = cloneComposerDocument(documentValue);
  const attachmentSnapshots = attachments.map(cloneComposerAttachment);
  if (!currentComposerDraftHasContent(documentSnapshot, attachmentSnapshots)) {
    clearComposerDraftForSession(normalizedSessionKey);
    return;
  }
  composerDraftsBySession.set(normalizedSessionKey, {
    document: documentSnapshot,
    attachments: attachmentSnapshots,
    updatedAt,
  });
  rememberChatComposerDraft(
    normalizedSessionKey,
    buildPersistableComposerDraft({
      document: documentSnapshot,
      attachments: attachmentSnapshots,
      updatedAt,
    }),
  );
}

function patchComposerAttachmentForSession(
  sessionKey: string,
  attachmentId: string,
  update: (attachment: ComposerImageAttachment) => ComposerImageAttachment,
): boolean {
  if (selectedSessionKey.value === sessionKey) {
    return patchComposerAttachment(attachmentId, update);
  }

  const draft = composerDraftsBySession.get(sessionKey);
  if (!draft) {
    return false;
  }
  let patched = false;
  const nextAttachments = draft.attachments.map((attachment) => {
    if (attachment.id !== attachmentId) {
      return attachment;
    }
    patched = true;
    return update(attachment);
  });
  if (!patched) {
    return false;
  }
  persistComposerDraftSnapshot(sessionKey, draft.document, nextAttachments);
  return true;
}

function hasComposerAttachmentForSession(sessionKey: string, attachmentId: string): boolean {
  if (selectedSessionKey.value === sessionKey) {
    return hasComposerAttachment(attachmentId);
  }
  return Boolean(composerDraftsBySession.get(sessionKey)?.attachments.some((attachment) => attachment.id === attachmentId));
}

async function prepareComposerUploadPayload(pendingUpload: PendingComposerUpload): Promise<PreparedComposerUpload & { dataUrl: string }> {
  if (shouldReadComposerPreview(pendingUpload.kind, pendingUpload.mimeType)) {
    const dataUrl = await readFileAsDataUrl(pendingUpload.file);
    return {
      id: pendingUpload.id,
      fileName: pendingUpload.fileName,
      mimeType: pendingUpload.mimeType,
      file: pendingUpload.file,
      dataUrl,
    };
  }

  return {
    id: pendingUpload.id,
    fileName: pendingUpload.fileName,
    mimeType: pendingUpload.mimeType,
    file: pendingUpload.file,
    dataUrl: '',
  };
}

async function uploadPreparedComposerAttachment(
  sessionKey: string,
  prepared: PreparedComposerUpload,
): Promise<void> {
  try {
    const uploadResult = await uploadChatFileWithProgress(
      sessionKey,
      {
        fileName: prepared.fileName,
        content: prepared.content || '',
        mimeType: prepared.mimeType,
        file: prepared.file,
      },
      (progress) => {
        patchComposerAttachmentForSession(sessionKey, prepared.id, (attachment) => ({
          ...attachment,
          progress,
          uploadState: 'uploading',
        }));
      },
    );

    patchComposerAttachmentForSession(sessionKey, prepared.id, (attachment) => {
      const resource = uploadResult.resource;
      return {
        ...attachment,
        content: '',
        dataUrl: resource?.url || attachment.dataUrl,
        downloadUrl: resource?.downloadUrl || attachment.downloadUrl,
        progress: 100,
        relativePath: uploadResult.relativePath,
        uploadState: 'ready',
      };
    });
    composerUploadSourceFiles.delete(prepared.id);
    if (
      selectedSessionKey.value === sessionKey
      &&
      noticeMessage.value?.kind === 'error'
      && !composerAttachments.value.some((attachment) => attachment.uploadState === 'failed')
    ) {
      clearNotice();
    }
  } catch (uploadError) {
    if (!hasComposerAttachmentForSession(sessionKey, prepared.id)) {
      return;
    }
    console.warn('Failed to upload file to workspace:', uploadError);
    patchComposerAttachmentForSession(sessionKey, prepared.id, (attachment) => ({
      ...attachment,
      progress: undefined,
      relativePath: undefined,
      uploadState: 'failed',
    }));
    if (selectedSessionKey.value === sessionKey) {
      setNotice(
        'error',
        uploadError instanceof Error
          ? uploadError.message
          : text('文件上传失败，可重试或移除。', 'File upload failed. Retry or remove it.'),
      );
    }
  }
}

async function prepareAndUploadComposerAttachment(
  sessionKey: string,
  pendingUpload: PendingComposerUpload,
): Promise<void> {
  if (!hasComposerAttachmentForSession(sessionKey, pendingUpload.id)) {
    return;
  }

  try {
    const prepared = await prepareComposerUploadPayload(pendingUpload);
    if (!hasComposerAttachmentForSession(sessionKey, pendingUpload.id)) {
      return;
    }

    patchComposerAttachmentForSession(sessionKey, pendingUpload.id, (attachment) => ({
      ...attachment,
      content: '',
      dataUrl: prepared.dataUrl || attachment.dataUrl,
      progress: 0,
      uploadState: 'uploading',
    }));
    await uploadPreparedComposerAttachment(sessionKey, prepared);
  } catch (uploadError) {
    if (!hasComposerAttachmentForSession(sessionKey, pendingUpload.id)) {
      return;
    }
    console.warn('Failed to prepare file for upload:', uploadError);
    patchComposerAttachmentForSession(sessionKey, pendingUpload.id, (attachment) => ({
      ...attachment,
      content: '',
      progress: undefined,
      relativePath: undefined,
      uploadState: 'failed',
    }));
    if (selectedSessionKey.value === sessionKey) {
      setNotice(
        'error',
        uploadError instanceof Error
          ? uploadError.message
          : text('文件上传失败，可重试或移除。', 'File upload failed. Retry or remove it.'),
      );
    }
  }
}

async function handleComposerFiles(files: File[]): Promise<void> {
  if (!files.length || !selectedSessionKey.value) {
    return;
  }

  const sessionKey = selectedSessionKey.value;
  const pendingUploads: PendingComposerUpload[] = files.map((file) => {
    const id = `composer-file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const mimeType = file.type || 'application/octet-stream';
    const kind = inferAttachmentKind(mimeType, file.name);
    return {
      id,
      file,
      fileName: file.name,
      mimeType,
      kind,
      size: file.size,
    };
  });
  for (const pendingUpload of pendingUploads) {
    composerUploadSourceFiles.set(pendingUpload.id, pendingUpload.file);
  }

  composerAttachments.value = [
    ...composerAttachments.value,
    ...pendingUploads.map((pendingUpload) => ({
      id: pendingUpload.id,
      type: pendingUpload.kind,
      mimeType: pendingUpload.mimeType,
      fileName: pendingUpload.fileName,
      content: '',
      dataUrl: '',
      size: pendingUpload.size,
      progress: 0,
      relativePath: undefined,
      uploadState: 'uploading' as const,
    })),
  ];

  await runLimitedComposerUploadQueue(
    pendingUploads,
    COMPOSER_UPLOAD_CONCURRENCY,
    (pendingUpload) => prepareAndUploadComposerAttachment(sessionKey, pendingUpload),
  );
}

function removeComposerAttachment(attachmentId: string): void {
  composerUploadSourceFiles.delete(attachmentId);
  composerAttachments.value = composerAttachments.value.filter((attachment) => attachment.id !== attachmentId);
}

async function retryComposerAttachment(attachmentId: string): Promise<void> {
  const sessionKey = selectedSessionKey.value;
  const attachment = composerAttachments.value.find((item) => item.id === attachmentId);
  if (!sessionKey || !attachment || attachment.uploadState !== 'failed') {
    return;
  }
  const sourceFile = composerUploadSourceFiles.get(attachmentId);
  if (sourceFile) {
    patchComposerAttachment(attachmentId, (current) => ({
      ...current,
      progress: 0,
      relativePath: undefined,
      uploadState: 'uploading',
    }));
    await prepareAndUploadComposerAttachment(sessionKey, {
      id: attachment.id,
      file: sourceFile,
      fileName: attachment.fileName || sourceFile.name || `file-${attachment.id}`,
      mimeType: attachment.mimeType || sourceFile.type || 'application/octet-stream',
      kind: attachment.type,
      size: attachment.size || sourceFile.size,
    });
    return;
  }

  if (!attachment.content) {
    setNotice(
      'error',
      text(
        '这个附件缺少本地上传缓存，请移除后重新选择文件。',
        'This attachment no longer has a local upload cache. Remove it and select the file again.',
      ),
    );
    return;
  }

  patchComposerAttachment(attachmentId, (current) => ({
    ...current,
    progress: 0,
    relativePath: undefined,
    uploadState: 'uploading',
  }));
  await uploadPreparedComposerAttachment(sessionKey, {
    id: attachment.id,
    fileName: attachment.fileName || `file-${attachment.id}`,
    mimeType: attachment.mimeType,
    content: attachment.content,
  });
}

function shouldIncludeMessageInCurrentWindow(message: ChatMessageItem): boolean {
  return Boolean(message);
}

function trimCueHistory(set: Set<string>): void {
  if (set.size < 200) {
    return;
  }
  set.clear();
}

function playChatCueSafely(kind: 'sent' | 'received', cueId: string | null = null): void {
  if (!soundCuesEnabled.value) {
    return;
  }
  const bucket = kind === 'sent' ? playedChatSentCueIds : playedChatReceivedCueIds;
  if (cueId) {
    if (bucket.has(cueId)) {
      return;
    }
    bucket.add(cueId);
    trimCueHistory(bucket);
  }
  void playChatCue(kind);
}

function resolveConversationMessageAnchorId(messageId: string): string | null {
  for (const item of renderTimelineItems.value) {
    if (item.type !== 'message_group') {
      continue;
    }
    if (!item.group.messages.some((message) => message.id === messageId)) {
      continue;
    }
    return item.group.messages[0]?.id || null;
  }
  return null;
}

function currentConversationWindowIncludesMessage(messageId: string, day: string | null = null): boolean {
  if (!selectedSessionKey.value) {
    return false;
  }
  if (day && selectedHistoryDay.value && selectedHistoryDay.value !== day) {
    return false;
  }
  return Boolean(resolveConversationMessageAnchorId(messageId));
}

async function revealConversationMessage(messageId: string): Promise<boolean> {
  const anchorMessageId = resolveConversationMessageAnchorId(messageId);
  if (!anchorMessageId) {
    return false;
  }
  await nextTick();
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }
  const targetEl = document.getElementById(`msg-${anchorMessageId}`);
  if (!targetEl) {
    return false;
  }
  targetEl.scrollIntoView({ behavior: 'auto', block: 'center' });
  targetEl.classList.add('chat-message-highlight');
  window.setTimeout(() => targetEl.classList.remove('chat-message-highlight'), 2000);
  return true;
}

function setNotice(kind: NoticeMessage['kind'], message: string): void {
  clearNoticeTimer();
  noticeMessage.value = { kind, text: message };
  if (typeof window === 'undefined') return;
  noticeTimer = window.setTimeout(() => {
    if (noticeMessage.value?.kind === kind && noticeMessage.value.text === message) {
      noticeMessage.value = null;
    }
    noticeTimer = null;
  }, NOTICE_TIMEOUT_MS[kind]);
}

function refreshChatDebugTraceFlag(): void {
  if (typeof window === 'undefined') {
    chatDebugTraceEnabled = false;
    return;
  }
  try {
    chatDebugTraceEnabled = window.localStorage.getItem(CHAT_DEBUG_TRACE_STORAGE_KEY) === '1';
  } catch {
    chatDebugTraceEnabled = false;
  }
  if (!chatDebugTraceEnabled) {
    chatDebugTraceBuffer.length = 0;
    delete window.__OPENCLAW_STUDIO_CHAT_TRACE__;
  }
}

function recordChatDebugTrace(entry: ChatDebugTraceEntry): void {
  if (!chatDebugTraceEnabled || typeof window === 'undefined') {
    return;
  }
  chatDebugTraceBuffer.push(entry);
  while (chatDebugTraceBuffer.length > CHAT_DEBUG_TRACE_LIMIT) {
    chatDebugTraceBuffer.shift();
  }
  window.__OPENCLAW_STUDIO_CHAT_TRACE__ = [...chatDebugTraceBuffer];
}

function clearNotice(): void {
  clearNoticeTimer();
  noticeMessage.value = null;
}

function clearNoticeTimer(): void {
  if (noticeTimer === null) return;
  clearTimeout(noticeTimer);
  noticeTimer = null;
}

function dismissToast(): void {
  if (errorMessage.value) {
    errorMessage.value = '';
    return;
  }
  clearNotice();
}

function setComposerPlainText(value: string): void {
  composerDocument.value = normalizeComposerDocument([
    {
      type: 'text',
      id: `composer-slash-help-${Date.now()}`,
      text: value,
    },
  ], { editorSurface: true });
}

function openSlashHelpDialog(filter = ''): void {
  slashHelpFilter.value = filter.trim();
  slashHelpOpen.value = true;
}

function closeSlashHelpDialog(): void {
  slashHelpOpen.value = false;
}

function openSlashStatusDialog(): void {
  slashStatusOpen.value = true;
}

function closeSlashStatusDialog(): void {
  slashStatusOpen.value = false;
}

function insertSlashCommandFromHelp(command: StudioSlashCommandDef): void {
  setComposerPlainText(command.args ? `/${command.name} ` : `/${command.name}`);
  composerAttachments.value = [];
  closeSlashHelpDialog();
}

function syncSessionRow(sessionKey: string, patch: Partial<ChatSessionRow>): void {
  const index = sessionRows.value.findIndex((row) => row.key === sessionKey);
  if (index === -1) return;
  const current = sessionRows.value[index];
  sessionRows.value[index] = {
    ...current,
    ...patch,
    runtime: patch.runtime || current.runtime,
    source: patch.source || current.source,
    deliveryContext: patch.deliveryContext || current.deliveryContext,
    permissions: patch.permissions || current.permissions,
  };
  rememberChatShellWarmCache();
}

function deriveHistoryBackedSessionRow(session: ChatSessionRow, messages: ChatMessageItem[]): ChatSessionRow {
  const nextSession = applyDerivedAutoLabelToSessionRow(session, messages);
  const lastMessage = messages[messages.length - 1] || null;
  if (!lastMessage) {
    return nextSession;
  }
  return {
    ...nextSession,
    updatedAt: lastMessage.createdAt || nextSession.updatedAt,
    lastMessagePreview: deriveRuntimeMessagePreview(lastMessage, nextSession.lastMessagePreview),
  };
}

function ensureSessionRow(row: ChatSessionRow): void {
  const index = sessionRows.value.findIndex((current) => current.key === row.key);
  if (index === -1) {
    sessionRows.value = [row, ...sessionRows.value];
    rememberChatShellWarmCache();
    return;
  }
  sessionRows.value[index] = row;
  rememberChatShellWarmCache();
}

function enrichIncomingSessionRowFromProtectedCurrent(row: ChatSessionRow, current: ChatSessionRow | null): ChatSessionRow {
  if (!current || !isProtectedSessionRow(row.key)) {
    return row;
  }
  return {
    ...row,
    derivedTitle: row.derivedTitle || current.derivedTitle,
    lastMessagePreview: row.lastMessagePreview || current.lastMessagePreview,
    updatedAt: row.updatedAt || current.updatedAt,
    presentation: {
      ...row.presentation,
      customLabel: row.presentation.customLabel || current.presentation.customLabel,
      autoLabel: row.presentation.autoLabel || current.presentation.autoLabel,
    },
  };
}

function applyQueueState(sessionKey: string, items: ChatQueuedMessageItem[]): void {
  queuedItemsBySession.value = {
    ...queuedItemsBySession.value,
    [sessionKey]: items.slice(),
  };
  if (sessionKey === selectedSessionKey.value && items.length === 0) {
    queueRailExpanded.value = false;
    mobileQueueSheetOpen.value = false;
  }
}

function applyOptimisticQueueItem(sessionKey: string, item: ChatQueuedMessageItem): void {
  const currentItems = queuedItemsBySession.value[sessionKey] || [];
  const existingIndex = currentItems.findIndex((current) => (
    current.id === item.id
    || (Boolean(current.clientRequestId) && current.clientRequestId === item.clientRequestId)
  ));
  const nextItems = existingIndex === -1
    ? [...currentItems, item]
    : currentItems.map((current, index) => (index === existingIndex ? item : current));
  applyQueueState(sessionKey, nextItems);
}

function removeOptimisticQueueItem(sessionKey: string, itemId: string): void {
  const currentItems = queuedItemsBySession.value[sessionKey] || [];
  if (!currentItems.some((item) => item.id === itemId)) {
    return;
  }
  applyQueueState(sessionKey, currentItems.filter((item) => item.id !== itemId));
}

function buildOptimisticQueuedMessageItem(params: {
  sessionKey: string;
  requestId: string;
  payload: ChatSendRequest;
  previewText: string;
  createdAt: string;
}): ChatQueuedMessageItem {
  const fileRefs = params.payload.fileRefs?.map((item) => ({ ...item }));
  const attachments = params.payload.attachments?.map((item) => ({ ...item }));
  const previewText = params.previewText
    || params.payload.text
    || fileRefs?.[0]?.fileName
    || attachments?.[0]?.fileName
    || '';
  return {
    id: `ui-queue-${params.requestId}`,
    sessionKey: params.sessionKey,
    clientRequestId: params.requestId,
    deliveryRequestId: params.requestId,
    text: params.payload.text,
    previewText,
    composerDocument: params.payload.composerDocument?.map((node) => ({ ...node })),
    fileRefs,
    attachments,
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
    status: 'queued',
    blockedReason: null,
  };
}

function applySessionControlsState(sessionKey: string, controls: ChatSessionControlState): void {
  sessionControlsBySession.value = {
    ...sessionControlsBySession.value,
    [sessionKey]: {
      allowHostManagementExec: controls.allowHostManagementExec === true,
      updatedAt: controls.updatedAt || null,
    },
  };
}

function applySessionControlsPayload(sessionKey: string, payload: ChatSessionControlsPayload): void {
  if (typeof payload.globalHostManagementExecEnabled === 'boolean') {
    globalHostManagementExecEnabled.value = payload.globalHostManagementExecEnabled;
  }
  applySessionControlsState(sessionKey, payload.controls);
  rememberChatShellWarmCache();
}

function setSlashFeedbackState(sessionKey: string, feedback: StudioSlashExecutionFeedback | null): void {
  slashFeedbackBySession.value = {
    ...slashFeedbackBySession.value,
    [sessionKey]: feedback,
  };
}

function dismissSelectedSlashFeedback(): void {
  if (!selectedSessionKey.value) {
    return;
  }
  setSlashFeedbackState(selectedSessionKey.value, null);
}

function buildSlashFeedback(
  sessionKey: string,
  commandName: string,
  args: string,
  mode: 'local' | 'send',
  phase: StudioSlashExecutionFeedback['phase'],
  options: {
    startedAt?: string;
    updatedAt?: string;
    runId?: string | null;
    requestId?: string | null;
    detail?: string | null;
  } = {},
): StudioSlashExecutionFeedback {
  const now = new Date().toISOString();
  return createStudioSlashExecutionFeedback({
    sessionKey,
    commandName,
    args,
    mode,
    phase,
    startedAt: options.startedAt || now,
    updatedAt: options.updatedAt || options.startedAt || now,
    runId: options.runId || null,
    requestId: options.requestId || null,
    detail: options.detail || null,
  });
}

function setSlashFeedbackFromCommand(
  sessionKey: string,
  commandText: string,
  mode: 'local' | 'send',
  phase: StudioSlashExecutionFeedback['phase'],
  options: {
    startedAt?: string;
    updatedAt?: string;
    runId?: string | null;
    requestId?: string | null;
    detail?: string | null;
  } = {},
): StudioSlashExecutionFeedback | null {
  const resolved = resolveSlashFeedbackCommand(commandText);
  if (!resolved) {
    return null;
  }
  const feedback = buildSlashFeedback(
    sessionKey,
    resolved.commandName,
    resolved.args,
    mode,
    phase,
    options,
  );
  setSlashFeedbackState(sessionKey, feedback);
  return feedback;
}

function resolveSlashFeedbackCommand(commandText: string): { commandName: string; args: string } | null {
  const parsed = parseStudioSlashCommand(commandText);
  if (parsed) {
    return {
      commandName: parsed.command.name,
      args: parsed.args,
    };
  }
  const normalized = typeof commandText === 'string' ? commandText.trim() : '';
  if (!normalized.startsWith('/')) {
    return null;
  }
  const withoutPrefix = normalized.slice(1).trim();
  if (!withoutPrefix) {
    return null;
  }
  const [commandName, ...argParts] = withoutPrefix.split(/\s+/);
  const normalizedCommandName = commandName.trim();
  if (!normalizedCommandName) {
    return null;
  }
  return {
    commandName: normalizedCommandName,
    args: argParts.join(' ').trim(),
  };
}

function updateSlashFeedbackFromRuntime(
  sessionKey: string,
  runtime: ChatRuntimeState,
  options: {
    requestId?: string | null;
    runId?: string | null;
  } = {},
): void {
  const feedback = slashFeedbackBySession.value[sessionKey];
  if (!feedback || isStudioSlashExecutionFeedbackTerminal(feedback.phase)) {
    return;
  }
  if (feedback.runId) {
    if (options.runId && feedback.runId !== options.runId) {
      return;
    }
  } else if (feedback.requestId) {
    if (options.requestId !== feedback.requestId) {
      return;
    }
  } else {
    return;
  }
  setSlashFeedbackState(sessionKey, applyRuntimeToStudioSlashExecutionFeedback(feedback, runtime, {
    runId: options.runId ?? feedback.runId,
  }));
}

function markSlashFeedbackError(
  sessionKey: string,
  errorDetail: string,
  options: {
    requestId?: string | null;
    runId?: string | null;
  } = {},
): void {
  const feedback = slashFeedbackBySession.value[sessionKey];
  if (!feedback) {
    return;
  }
  if (options.requestId && feedback.requestId && feedback.requestId !== options.requestId) {
    return;
  }
  if (options.runId && feedback.runId && feedback.runId !== options.runId) {
    return;
  }
  setSlashFeedbackState(sessionKey, {
    ...feedback,
    phase: 'error',
    updatedAt: new Date().toISOString(),
    runId: options.runId ?? feedback.runId,
    detail: errorDetail,
  });
}

function trackQueuedSlashCommand(
  sessionKey: string,
  clientRequestId: string,
  commandText: string,
  queueItems: ChatQueuedMessageItem[],
): void {
  const resolved = resolveSlashFeedbackCommand(commandText);
  if (!resolved) {
    return;
  }
  const matchedEntry = queueItems.find((item) => item.clientRequestId === clientRequestId) || null;
  const current = pendingQueuedSlashCommandsBySession.value[sessionKey] || [];
  const nextEntry: PendingQueuedSlashCommand = {
    entryId: matchedEntry?.id || null,
    clientRequestId,
    commandName: resolved.commandName,
    args: resolved.args,
    queuedAt: new Date().toISOString(),
  };
  const existingIndex = current.findIndex((item) => item.clientRequestId === clientRequestId);
  const next = existingIndex === -1
    ? [...current, nextEntry]
    : current.map((item, index) => (index === existingIndex ? nextEntry : item));
  pendingQueuedSlashCommandsBySession.value = {
    ...pendingQueuedSlashCommandsBySession.value,
    [sessionKey]: next,
  };
}

function consumeQueuedSlashCommand(sessionKey: string, clientRequestId: string): PendingQueuedSlashCommand | null {
  const current = pendingQueuedSlashCommandsBySession.value[sessionKey] || [];
  const index = current.findIndex((item) => item.clientRequestId === clientRequestId);
  if (index === -1) {
    return null;
  }
  const matched = current[index] || null;
  const next = [...current.slice(0, index), ...current.slice(index + 1)];
  pendingQueuedSlashCommandsBySession.value = {
    ...pendingQueuedSlashCommandsBySession.value,
    [sessionKey]: next,
  };
  return matched;
}

function updateTrackedQueuedSlashEntry(sessionKey: string, entryId: string, nextText: string | null): void {
  const current = pendingQueuedSlashCommandsBySession.value[sessionKey] || [];
  const index = current.findIndex((item) => item.entryId === entryId);
  if (index === -1) {
    return;
  }
  if (!nextText) {
    pendingQueuedSlashCommandsBySession.value = {
      ...pendingQueuedSlashCommandsBySession.value,
      [sessionKey]: [...current.slice(0, index), ...current.slice(index + 1)],
    };
    return;
  }
  const parsed = parseStudioSlashCommand(nextText);
  if (!parsed) {
    pendingQueuedSlashCommandsBySession.value = {
      ...pendingQueuedSlashCommandsBySession.value,
      [sessionKey]: [...current.slice(0, index), ...current.slice(index + 1)],
    };
    return;
  }
  const next = current.map((item, itemIndex) => (
    itemIndex === index
      ? {
        ...item,
        commandName: parsed.command.name,
        args: parsed.args,
      }
      : item
  ));
  pendingQueuedSlashCommandsBySession.value = {
    ...pendingQueuedSlashCommandsBySession.value,
    [sessionKey]: next,
  };
}

function readStudioChatGlobalExecEnabled(summary: Awaited<ReturnType<typeof fetchConfigSummary>> | null | undefined): boolean {
  const studioConfig = summary?.plugins?.entries?.studio?.config as Record<string, unknown> | undefined;
  const chatConfig = studioConfig?.chat as Record<string, unknown> | undefined;
  return chatConfig?.allowHostManagementExecInStudioChat === true;
}

function deriveSlashModelOptionsFromConfigSummary(
  summary: Awaited<ReturnType<typeof fetchConfigSummary>> | null | undefined,
): string[] {
  const options: string[] = [];
  const seen = new Set<string>();
  const pushOption = (value: unknown): void => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    options.push(normalized);
  };

  pushOption(summary?.defaults?.model);
  if (Array.isArray(summary?.defaults?.modelFallback)) {
    summary?.defaults?.modelFallback.forEach(pushOption);
  }
  pushOption(summary?.defaults?.subagentModel);
  (summary?.providers || []).forEach((provider) => {
    (provider.models || []).forEach((model) => pushOption(model.id));
  });

  return options;
}

async function loadStudioChatGlobalExecConfig(): Promise<void> {
  try {
    const summary = await fetchConfigSummary();
    globalHostManagementExecEnabled.value = readStudioChatGlobalExecEnabled(summary);
    slashArgOptionsOverrides.value = {
      ...slashArgOptionsOverrides.value,
      model: deriveSlashModelOptionsFromConfigSummary(summary),
    };
    rememberChatShellWarmCache();
  } catch {
    slashArgOptionsOverrides.value = {
      ...slashArgOptionsOverrides.value,
      model: [],
    };
  }
}

function isRecoverableSessionSurfaceError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /\b404\b/i.test(error.message) || /\bsession_not_found\b/i.test(error.message);
}

async function loadSessionSurfaceState(sessionKey: string): Promise<void> {
  let queuePayload: ChatQueuePayload | null = null;
  let controlsPayload: ChatSessionControlsPayload | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [queueResult, controlsResult] = await Promise.allSettled([
      fetchChatQueue(sessionKey),
      fetchChatSessionControls(sessionKey),
    ]);
    if (selectedSessionKey.value !== sessionKey) {
      return;
    }
    queuePayload = queueResult.status === 'fulfilled' ? queueResult.value : null;
    controlsPayload = controlsResult.status === 'fulfilled' ? controlsResult.value : null;

    const shouldRetry = attempt === 0 && (
      (queueResult.status === 'rejected' && isRecoverableSessionSurfaceError(queueResult.reason))
      || (controlsResult.status === 'rejected' && isRecoverableSessionSurfaceError(controlsResult.reason))
    );
    if (!shouldRetry) {
      break;
    }

    try {
      await loadSessions({ deferRemainingAgents: true });
    } catch {
      // Best-effort self-heal for sessions discovered from Gateway before their
      // local Studio registry entry has been reconstructed.
    }
    if (selectedSessionKey.value !== sessionKey) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 140));
  }

  if (selectedSessionKey.value !== sessionKey) {
    return;
  }
  applyQueueState(sessionKey, queuePayload?.items || []);
  if (controlsPayload) {
    applySessionControlsPayload(sessionKey, controlsPayload);
  } else if (!sessionControlsBySession.value[sessionKey]) {
    applySessionControlsState(sessionKey, {
      allowHostManagementExec: false,
      updatedAt: null,
    });
  }
}

function protectSessionRow(sessionKey: string, ttlMs = SESSION_ROW_PROTECTION_TTL_MS): void {
  if (!sessionKey) {
    return;
  }
  protectedSessionRowDeadlines.set(sessionKey, Date.now() + ttlMs);
}

function pruneProtectedSessionRows(now = Date.now()): void {
  for (const [sessionKey, deadline] of protectedSessionRowDeadlines.entries()) {
    if (deadline <= now) {
      protectedSessionRowDeadlines.delete(sessionKey);
    }
  }
}

function isProtectedSessionRow(sessionKey: string, now = Date.now()): boolean {
  const deadline = protectedSessionRowDeadlines.get(sessionKey) || 0;
  return deadline > now;
}

function collectPreservedAgentRows(
  currentRows: ChatSessionRow[],
  agentId: string,
  incomingRows: ChatSessionRow[],
  options: {
    preserveAllMissing?: boolean;
  } = {},
): ChatSessionRow[] {
  const now = Date.now();
  pruneProtectedSessionRows(now);
  const incomingKeys = new Set(incomingRows.map((row) => row.key));
  for (const sessionKey of incomingKeys) {
    protectedSessionRowDeadlines.delete(sessionKey);
  }
  return currentRows.filter((row) => (
    row.agentId === agentId
    && !incomingKeys.has(row.key)
    && (
      options.preserveAllMissing
      || row.kind !== 'studio_managed'
      || Boolean(row.runtime.activeRunId)
      || isProtectedSessionRow(row.key, now)
    )
  ));
}

function armSessionSendGuard(sessionKey: string, ttlMs = SESSION_CREATE_SEND_GUARD_MS): void {
  if (!sessionKey) {
    return;
  }
  const deadline = Date.now() + ttlMs;
  sessionSendGuardDeadlines.set(sessionKey, deadline);
  sessionSendGuardVersion.value += 1;
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      const currentDeadline = sessionSendGuardDeadlines.get(sessionKey) || 0;
      if (currentDeadline === deadline && currentDeadline <= Date.now()) {
        sessionSendGuardDeadlines.delete(sessionKey);
        sessionSendGuardVersion.value += 1;
      }
    }, ttlMs + 50);
  }
}

function isSessionSendGuardActive(sessionKey: string): boolean {
  sessionSendGuardVersion.value;
  if (!sessionKey) {
    return false;
  }
  const deadline = sessionSendGuardDeadlines.get(sessionKey) || 0;
  if (deadline <= Date.now()) {
    if (deadline) {
      sessionSendGuardDeadlines.delete(sessionKey);
      sessionSendGuardVersion.value += 1;
    }
    return false;
  }
  return true;
}

function resolveConversationDiagnosticsFallback(): ChatDiagnostics {
  return historyPayload.value?.diagnostics || activeDiagnostics.value || {
    gatewayReachable: false,
    gatewayWsUrl: '',
    transport: 'studio_bff',
    authMode: 'studio_backend_token',
    rawGatewayFramesExposed: false,
    rawGatewayMethodsExposed: false,
    sameOriginRequired: true,
    historyTruncated: false,
    truncationMode: 'none',
    notes: [],
  };
}

function primeEmptyConversationShell(
  session: ChatSessionRow,
  runtime: ChatRuntimeState,
): void {
  const nextSession = {
    ...session,
    runtime,
  };
  historyErrorMessage.value = '';
  historyPayload.value = {
    checkedAt: new Date().toISOString(),
    session: nextSession,
    messages: [],
    overlays: [],
    runtime,
    observability: createEmptyRuntimeObservability(),
    diagnostics: resolveConversationDiagnosticsFallback(),
      pageInfo: {
        hasMoreBefore: false,
        beforeCursor: null,
        hasMoreAfter: false,
        afterCursor: null,
      },
      day: null,
    };
  historyPageInfo.value = {
    hasMoreBefore: false,
    beforeCursor: null,
    hasMoreAfter: false,
    afterCursor: null,
  };
  runtimeMachineState.value = resetChatSessionRuntimeMachine(nextSession.key);
}

function syncSessionAutoLabel(sessionKey: string, messages: ChatMessageItem[]): void {
  const current = sessionRows.value.find((row) => row.key === sessionKey) || null;
  if (!current) return;
  const nextRow = applyDerivedAutoLabelToSessionRow(current, messages);
  if (nextRow === current) {
    return;
  }
  syncSessionRow(sessionKey, {
    presentation: nextRow.presentation,
  });
  if (historyPayload.value?.session.key === sessionKey) {
    historyPayload.value = {
      ...historyPayload.value,
      session: {
        ...historyPayload.value.session,
        presentation: nextRow.presentation,
      },
    };
  }
}

function replaceSessionRow(row: ChatSessionRow): void {
  syncSessionRow(row.key, row);
  if (historyPayload.value?.session.key === row.key) {
    historyPayload.value = {
      ...historyPayload.value,
      session: row,
      runtime: row.runtime,
    };
  }
}

function clearConversationState(): void {
  clearDeferredInitialHistoryLoad();
  clearDeferredSessionHydration();
  optimisticStartupSessionKey.value = '';
  bootstrapPrimedSessionKey.value = '';
  clearLiveHistorySyncTimer();
  clearRunSettlementSyncTimer();
  abortReplaceHistoryRequest();
  abortHistoryDatesRequest();
  clearHistoryBeforePrefetch();
  clearHistoryAfterPrefetch();
  clearHistoryBeforeMaterializeReleaseTimer();
  clearPendingTemporaryToolEvents();
  clearTerminalRunFence();
  clearWsReconnectTimer();
  if (selectedSessionKey.value) {
    clearRealtimeRecoveryState(selectedSessionKey.value);
    clearChatRuntimeSnapshot(selectedSessionKey.value);
    exhaustedHistoryBeforeCursorBySession.delete(selectedSessionKey.value);
    exhaustedHistoryAfterCursorBySession.delete(selectedSessionKey.value);
  }
  historyPayload.value = null;
  historyPrependAnchorMessageId.value = null;
  runtimeMachineState.value = resetChatSessionRuntimeMachine();
  historyPageInfo.value = { hasMoreBefore: false, beforeCursor: null, hasMoreAfter: false, afterCursor: null };
  historyDays.value = [];
  historyDatesLoadedSessionKey.value = '';
  historyLoadingInitial.value = false;
  historyLoadingBefore.value = false;
  historyLoadingAfter.value = false;
  historyBeforeMaterializeInFlight = false;
  historyDatesLoading.value = false;
  historyErrorMessage.value = '';
  abortRecordBrowserSearch();
  resetRecordBrowserState();
  if (chatSocket) {
    try { chatSocket.close(); } catch {}
    chatSocket = null;
    chatSocketSessionKey = '';
    wsConnected.value = false;
  }
  if (gatewayClient) {
    disconnectGatewayClient();
  }
}

function primeConversationStateFromSnapshot(sessionKey: string): boolean {
  if (!sessionKey || historyMode.value !== 'history') {
    return false;
  }
  const snapshot = readChatRuntimeSnapshot(sessionKey);
  if (!snapshot || snapshot.sessionKey !== sessionKey) {
    return false;
  }
  if (!snapshot.messages.length && !snapshot.overlays.length) {
    return false;
  }
  const payload = {
    ...snapshot.payload,
    messages: snapshot.messages,
    overlays: snapshot.overlays,
  };
  applyHistoryPagePayload(payload, 'replace');
  const restoredRuntimeMachine = restoreRuntimeMachineStateFromSnapshot(sessionKey, snapshot);
  if (restoredRuntimeMachine) {
    runtimeMachineState.value = restoredRuntimeMachine;
  }
  historyLoadingInitial.value = false;
  historyErrorMessage.value = '';
  return true;
}

function availableSessionsForCurrentMode(): ChatSessionRow[] {
  return inspectPinned.value ? [...studioManagedSessions.value, ...observedSessions.value] : studioManagedSessions.value;
}

function persistHistorySnapshot(sessionKey: string | null | undefined = selectedSessionKey.value): void {
  if (!sessionKey || !historyPayload.value || historyPayload.value.session.key !== sessionKey) {
    return;
  }
  saveChatRuntimeSnapshot(
    sessionKey,
    historyPayload.value,
    runtimeMachineState.value.canonicalMessageLedger,
    Object.values(runtimeMachineState.value.processLedger),
    runtimeMachineState.value,
  );
}

function resolveMessageIdFromViewportAnchorItemId(anchorItemId: string | null | undefined): string {
  const normalized = typeof anchorItemId === 'string' ? anchorItemId.trim() : '';
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('msg-')) {
    return normalized.slice(4).trim();
  }
  const groupSuffixIndex = normalized.lastIndexOf(':');
  if (groupSuffixIndex > 0 && /^\d+$/.test(normalized.slice(groupSuffixIndex + 1))) {
    return normalized.slice(0, groupSuffixIndex).trim();
  }
  return '';
}

function resolvePersistedViewportAnchorMessageId(sessionKey: string): string {
  if (
    !sessionKey
    || historyMode.value !== 'history'
    || selectedHistoryDay.value
    || searchQuery.value.trim()
  ) {
    return '';
  }
  const snapshot = readChatSessionViewportSnapshot(sessionKey);
  return (
    snapshot?.anchorMessageId?.trim()
    || resolveMessageIdFromViewportAnchorItemId(snapshot?.anchorItemId)
  );
}

function clearShellViewportSnapshotInterval(): void {
  if (shellViewportSnapshotInterval != null && typeof window !== 'undefined') {
    window.clearInterval(shellViewportSnapshotInterval);
  }
  shellViewportSnapshotInterval = null;
}

function readVisibleShellMessageAnchor(thread: HTMLElement): { itemId: string; messageId: string; offset: number } | null {
  const threadRect = thread.getBoundingClientRect();
  const elements = Array.from(thread.querySelectorAll<HTMLElement>('.chat-conversation-thread__item-shell[id^="msg-"]'));
  let partiallyVisibleAnchor: { itemId: string; messageId: string; offset: number } | null = null;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= threadRect.top || rect.top >= threadRect.bottom) {
      continue;
    }
    const messageId = element.id.slice(4).trim();
    if (!messageId) {
      continue;
    }
    const anchor = {
      itemId: element.id,
      messageId,
      offset: Math.round(rect.top - threadRect.top),
    };
    if (rect.top >= threadRect.top) {
      return anchor;
    }
    partiallyVisibleAnchor = partiallyVisibleAnchor || anchor;
  }
  return partiallyVisibleAnchor;
}

function captureShellViewportSnapshot(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const sessionKey = selectedSessionKey.value;
  if (!sessionKey) {
    return false;
  }
  const thread = document.querySelector<HTMLElement>('.chat-conversation-thread');
  if (!thread) {
    return false;
  }
  const bottomDistance = Math.max(0, Math.round(thread.scrollHeight - thread.scrollTop - thread.clientHeight));
  const shouldRememberViewport = Boolean(viewingHistoricalPosition.value || bottomDistance > 80);
  if (!shouldRememberViewport) {
    rememberChatSessionViewportSnapshot(sessionKey, null);
    return false;
  }
  const anchor = readVisibleShellMessageAnchor(thread);
  if (!anchor) {
    return false;
  }
  rememberChatSessionViewportSnapshot(sessionKey, {
    anchorItemId: anchor.itemId,
    anchorMessageId: anchor.messageId,
    anchorOffset: anchor.offset,
    bottomDistance,
    timelineItemCount: renderTimelineItems.value.length,
    timelineVersion: timelineVersion.value,
    capturedAtMs: Date.now(),
  });
  return true;
}

function startShellViewportSnapshotInterval(): void {
  if (typeof window === 'undefined' || shellViewportSnapshotInterval != null) {
    return;
  }
  shellViewportSnapshotInterval = window.setInterval(captureShellViewportSnapshot, 1200);
}

function collectCurrentRunIds(): string[] {
  const runIds = new Set<string>();
  if (activeRuntime.value?.activeRunId) runIds.add(activeRuntime.value.activeRunId);
  for (const runId of listChatSessionRuntimeRunIds(runtimeMachineState.value)) {
    if (runId) {
      runIds.add(runId);
    }
  }
  return [...runIds];
}

function suppressRunIds(runIds: string[]): void {
  for (const runId of runIds) suppressedRunIds.add(runId);
}

function unsuppressRunIds(runIds: string[]): void {
  for (const runId of runIds) suppressedRunIds.delete(runId);
}

function applyRuntime(runtime: ChatRuntimeState): void {
  if (!selectedSession.value) return;
  syncSessionRow(selectedSession.value.key, { runtime });
  if (historyPayload.value?.session.key === selectedSession.value.key) {
    historyPayload.value = {
      ...historyPayload.value,
      runtime,
      session: {
        ...historyPayload.value.session,
        runtime,
      },
    };
  }
}

function markSessionRunLocallyActive(sessionKey: string, runId: string | null | undefined): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  const normalizedRunId = typeof runId === 'string' ? runId.trim() : '';
  if (!normalizedSessionKey || !normalizedRunId) {
    return;
  }
  locallyActiveRunIdBySession.set(normalizedSessionKey, normalizedRunId);
  markRunAsActive(normalizedSessionKey, normalizedRunId);
}

function clearSessionRunLocallyActive(sessionKey: string, runId?: string | null): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return;
  }
  const currentRunId = locallyActiveRunIdBySession.get(normalizedSessionKey);
  const normalizedRunId = typeof runId === 'string' ? runId.trim() : '';
  if (!normalizedRunId || !currentRunId || currentRunId === normalizedRunId) {
    locallyActiveRunIdBySession.delete(normalizedSessionKey);
  }
}

function hasSessionRunLocallyActive(sessionKey: string): boolean {
  return Boolean(locallyActiveRunIdBySession.get(sessionKey));
}

function ensureObservabilityState(): ChatObservabilityState {
  const current = historyPayload.value?.observability;
  return current ? cloneRuntimeObservability(current) : createEmptyRuntimeObservability();
}

function applyObservability(next: ChatObservabilityState): void {
  if (!historyPayload.value || !selectedSession.value) return;
  historyPayload.value = {
    ...historyPayload.value,
    observability: next,
  };
}

function settleObservabilityToolsForAssistantStream(runId: string | null | undefined, emittedAt: string): void {
  const observability = ensureObservabilityState();
  const toolCards = settleRuntimeToolCardsBeforeAssistant(observability.toolCards, runId, emittedAt);
  if (toolCards === observability.toolCards) {
    return;
  }
  observability.toolCards = toolCards;
  applyObservability(observability);
}

function applySideResultEvent(event: Extract<ChatStreamEvent, { kind: 'side_result' }>, isSelectedSession: boolean): void {
  const existing = slashFeedbackBySession.value[event.sessionKey];
  const previous = existing && existing.commandName === 'btw' && (!existing.runId || existing.runId === event.runId)
    ? existing
    : null;
  setSlashFeedbackState(event.sessionKey, buildSlashFeedback(
    event.sessionKey,
    'btw',
    previous?.args || event.result.question,
    'send',
    event.result.isError ? 'error' : 'completed',
    {
      startedAt: previous?.startedAt || event.emittedAt,
      updatedAt: event.emittedAt,
      requestId: previous?.requestId || null,
      runId: event.runId,
      detail: event.result.text,
    },
  ));
  if (isSelectedSession && event.result.isError) {
    setNotice('error', event.result.text);
  }
}

function temporaryToolEventKey(event: ChatTemporaryToolStreamEvent): string {
  return `${event.sessionKey}:${event.runId || 'none'}:${event.tool.toolCallId}`;
}

function clearTemporaryToolFlushTimer(): void {
  if (temporaryToolFlushTimer == null) {
    return;
  }
  window.clearTimeout(temporaryToolFlushTimer);
  temporaryToolFlushTimer = null;
}

function clearPendingTemporaryToolEvents(): void {
  clearTemporaryToolFlushTimer();
  pendingTemporaryToolEvents.clear();
}

function applyTemporaryToolStreamEvent(event: ChatTemporaryToolStreamEvent): void {
  const isSelectedSession = selectedSession.value?.key === event.sessionKey;
  const terminalToolEvent = isTerminalToolStatus(event.tool.status);
  const shouldIgnoreLateRunningEvent = Boolean(
    event.runId
    && event.tool.status === 'running'
    && isRunTerminal(event.sessionKey, event.runId),
  );
  if (shouldIgnoreLateRunningEvent) {
    return;
  }
  if (event.runId && event.tool.status === 'running') {
    markRunAsActive(event.sessionKey, event.runId);
  }
  if (isSelectedSession && event.runId) {
    runtimeMachineState.value = applyChatSessionTemporaryToolEvent(runtimeMachineState.value, {
      runId: event.runId,
      emittedAt: event.emittedAt,
      partial: event.partial,
      tool: event.tool,
    });
  }
  if (!isSelectedSession) {
    return;
  }
  const observability = ensureObservabilityState();
  observability.toolCards = upsertRuntimeToolCards(observability.toolCards, event.tool);
  if (terminalToolEvent) {
    observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
      id: `tool-result-${event.tool.toolCallId}-${event.emittedAt}`,
      kind: 'tool_result',
      runId: event.runId,
      toolCallId: event.tool.toolCallId,
      emittedAt: event.emittedAt,
      title: text(`Tool result · ${event.tool.name}`, `Tool result · ${event.tool.name}`),
      detail: event.tool.resultPreview,
      level: event.tool.isError ? 'error' : 'success',
    });
  }
  applyObservability(observability);
  persistHistorySnapshot(event.sessionKey);
  if (terminalToolEvent) {
    scheduleRunSettlementHistorySync(event.sessionKey, event.runId, {
      delayMs: 220,
      attempts: 8,
    });
  }
}

function flushPendingTemporaryToolEvents(): void {
  clearTemporaryToolFlushTimer();
  if (!pendingTemporaryToolEvents.size) {
    return;
  }
  const events = [...pendingTemporaryToolEvents.values()];
  pendingTemporaryToolEvents.clear();
  for (const event of events) {
    applyTemporaryToolStreamEvent(event);
  }
}

function scheduleTemporaryToolStreamEvent(event: ChatTemporaryToolStreamEvent): void {
  pendingTemporaryToolEvents.set(temporaryToolEventKey(event), event);
  if (temporaryToolFlushTimer != null) {
    return;
  }
  temporaryToolFlushTimer = window.setTimeout(() => {
    flushPendingTemporaryToolEvents();
  }, CHAT_TOOL_STREAM_THROTTLE_MS);
}

function handleTemporaryToolStreamEvent(event: ChatTemporaryToolStreamEvent): void {
  const terminalToolEvent = isTerminalToolStatus(event.tool.status);
  if (terminalToolEvent) {
    pendingTemporaryToolEvents.delete(temporaryToolEventKey(event));
    applyTemporaryToolStreamEvent(event);
    return;
  }
  if (event.partial) {
    scheduleTemporaryToolStreamEvent(event);
    return;
  }
  applyTemporaryToolStreamEvent(event);
}

function handleLegacyStreamEvent(event: ChatStreamEvent): void {
  if (event.runId && suppressedRunIds.has(event.runId) && event.kind !== 'ack') return;

  const isSelectedSession = selectedSession.value?.key === event.sessionKey;

  if (event.kind === 'side_result') {
    applySideResultEvent(event, isSelectedSession);
    return;
  }

  if (event.kind === 'ack') {
    markSessionRunLocallyActive(event.sessionKey, event.runId || event.runtime.activeRunId);
    const queuedSlash = consumeQueuedSlashCommand(event.sessionKey, event.requestId);
    if (queuedSlash) {
      setSlashFeedbackState(event.sessionKey, buildSlashFeedback(
        event.sessionKey,
        queuedSlash.commandName,
        queuedSlash.args,
        'send',
        'accepted',
        {
          startedAt: queuedSlash.queuedAt,
          updatedAt: event.emittedAt,
          requestId: event.requestId,
          runId: event.runId,
        },
      ));
    }
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    updateSlashFeedbackFromRuntime(event.sessionKey, event.runtime, {
      requestId: event.requestId,
      runId: event.runId,
    });
    if (isSelectedSession) {
      applyRuntime(event.runtime);
      playChatCueSafely('sent', event.requestId || event.runId || null);
      setNotice('success', text('消息已发送。', 'Message sent.'));
    }
    return;
  }

  if (event.kind === 'delta') {
    flushPendingTemporaryToolEvents();
    markSessionRunLocallyActive(event.sessionKey, event.runId);
    const currentRuntime = activeRuntime.value;
    const runtime = {
      ...(currentRuntime || {}),
      gatewayConnected: true,
      sessionWritable: Boolean(selectedSession.value?.permissions.writable),
      activeRunId: event.runId,
      state: 'streaming',
      lastEventAt: event.emittedAt,
      lastAckAt: currentRuntime?.lastAckAt || null,
      lastErrorCode: null,
      lastErrorMessage: null,
    } as ChatRuntimeState;
    syncSessionRow(event.sessionKey, { runtime });
    if (isSelectedSession) {
      applyRuntime(runtime);
      settleObservabilityToolsForAssistantStream(event.runId, event.emittedAt);
      playChatCueSafely('received', event.runId ? `${event.sessionKey}:${event.runId}` : null);
      runtimeMachineState.value = applyChatSessionDeltaEvent(runtimeMachineState.value, {
        runId: event.runId,
        accumulatedText: event.accumulatedText,
        emittedAt: event.emittedAt,
        textDelta: event.textDelta,
        message: event.message,
      });
    }
    return;
  }

  if (event.kind === 'run_overlay') {
    if (event.runId && event.overlay.lifecycle === 'running' && isRunTerminal(event.sessionKey, event.runId)) {
      return;
    }
    if (event.runId && isSettledOverlay(event.overlay)) {
      markRunAsTerminal(event.sessionKey, event.runId);
    } else if (event.runId && event.overlay.lifecycle === 'running') {
      markRunAsActive(event.sessionKey, event.runId);
    }
    syncSessionRow(event.sessionKey, {
      updatedAt: event.overlay.updatedAt || event.emittedAt,
      lastMessagePreview: event.overlay.previewText.slice(0, 160)
        || event.overlay.toolCalls[event.overlay.toolCalls.length - 1]?.name
        || selectedSession.value?.lastMessagePreview
        || null,
    });
    if (isSelectedSession) {
      runtimeMachineState.value = upsertChatSessionProcessLedgerOverlay(runtimeMachineState.value, event.overlay);
      persistHistorySnapshot(event.sessionKey);
    }
    return;
  }

  if (event.kind === 'final') {
    flushPendingTemporaryToolEvents();
    clearSessionRunLocallyActive(event.sessionKey, event.runId);
    syncSessionRow(event.sessionKey, {
      runtime: event.runtime,
      updatedAt: event.message.createdAt || event.emittedAt,
      lastMessagePreview: deriveRuntimeMessagePreview(event.message),
    });
    updateSlashFeedbackFromRuntime(event.sessionKey, event.runtime, {
      runId: event.runId,
    });
    if (isSelectedSession) {
      applyRuntime(event.runtime);
      playChatCueSafely('received', event.runId ? `${event.sessionKey}:${event.runId}` : event.message.id || null);
      if (event.usage) {
        const observability = ensureObservabilityState();
        observability.usage = event.usage;
        observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
          id: `usage-${event.runId}`,
          kind: 'usage',
          runId: event.runId,
          toolCallId: null,
          emittedAt: event.emittedAt,
          title: text(`Usage · ${event.usage.totalTokens} tokens`, `Usage · ${event.usage.totalTokens} tokens`),
          detail: text(`输入 ${event.usage.inputTokens} / 输出 ${event.usage.outputTokens}`, `in ${event.usage.inputTokens} / out ${event.usage.outputTokens}`),
          level: 'info',
        });
        applyObservability(observability);
      }
      runtimeMachineState.value = applyChatSessionFinalEvent(runtimeMachineState.value, event.message);
      syncSessionAutoLabel(event.sessionKey, runtimeMachineState.value.canonicalMessageLedger);
      persistHistorySnapshot(event.sessionKey);
    }
    return;
  }

  if (event.kind === 'aborted') {
    clearSessionRunLocallyActive(event.sessionKey, event.runId);
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    updateSlashFeedbackFromRuntime(event.sessionKey, event.runtime, {
      runId: event.runId,
    });
    if (isSelectedSession) {
      applyRuntime(event.runtime);
      runtimeMachineState.value = applyChatSessionAbortedEvent(runtimeMachineState.value, {
        runId: event.runId,
        partialMessage: event.partialMessage || undefined,
      });
      syncSessionAutoLabel(event.sessionKey, runtimeMachineState.value.canonicalMessageLedger);
      persistHistorySnapshot(event.sessionKey);
      setNotice('success', text('当前运行已中止。', 'The current run has been aborted.'));
    }
    return;
  }

  if (event.kind === 'error') {
    clearSessionRunLocallyActive(event.sessionKey, event.runId);
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    updateSlashFeedbackFromRuntime(event.sessionKey, event.runtime, {
      runId: event.runId,
    });
    if (isSelectedSession) {
      applyRuntime(event.runtime);
      setNotice('error', event.error.message);
    }
    return;
  }

  if (event.kind === 'runtime') {
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    updateSlashFeedbackFromRuntime(event.sessionKey, event.runtime, {
      runId: event.runId,
    });
    if (isSelectedSession) applyRuntime(event.runtime);
    return;
  }

  if (event.kind === 'assistant_delivery') {
    return;
  }

  if (!isSelectedSession) return;

  if (event.kind === 'agent_lifecycle') {
    const observability = ensureObservabilityState();
    observability.lifecycle = event.lifecycle;
    observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
      id: `lifecycle-${event.runId || 'none'}-${event.lifecycle.phase}-${event.emittedAt}`,
      kind: 'lifecycle',
      runId: event.runId,
      toolCallId: null,
      emittedAt: event.emittedAt,
      title: text(`Lifecycle · ${event.lifecycle.phase}`, `Lifecycle · ${event.lifecycle.phase}`),
      detail: event.lifecycle.errorMessage,
      level: event.lifecycle.phase === 'error' ? 'error' : event.lifecycle.phase === 'end' ? 'success' : 'info',
    });
    applyObservability(observability);
    return;
  }

  if (event.kind === 'agent_assistant') {
    flushPendingTemporaryToolEvents();
    const observability = ensureObservabilityState();
    observability.toolCards = settleRuntimeToolCardsBeforeAssistant(observability.toolCards, event.runId, event.emittedAt);
    observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
      id: `assistant-${event.runId}`,
      kind: 'assistant',
      runId: event.runId,
      toolCallId: null,
      emittedAt: event.emittedAt,
      title: text('Assistant stream', 'Assistant stream'),
      detail: event.textPreview,
      level: 'info',
    });
    applyObservability(observability);
    return;
  }

  if (event.kind === 'agent_tool_call') {
    if (event.runId) {
      runtimeMachineState.value = applyChatSessionToolEvent(runtimeMachineState.value, {
        runId: event.runId,
        emittedAt: event.emittedAt,
        tool: event.tool,
      });
    }
    const observability = ensureObservabilityState();
    observability.toolCards = upsertRuntimeToolCards(observability.toolCards, event.tool);
    observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
      id: `tool-call-${event.tool.toolCallId}-${event.emittedAt}`,
      kind: 'tool_call',
      runId: event.runId,
      toolCallId: event.tool.toolCallId,
      emittedAt: event.emittedAt,
      title: text(`Tool start · ${event.tool.name}`, `Tool start · ${event.tool.name}`),
      detail: event.tool.argsPreview,
      level: 'info',
    });
    applyObservability(observability);
    return;
  }

  if (event.kind === 'agent_tool_result') {
    if (event.runId) {
      runtimeMachineState.value = applyChatSessionToolEvent(runtimeMachineState.value, {
        runId: event.runId,
        emittedAt: event.emittedAt,
        tool: event.tool,
      });
    }
    const observability = ensureObservabilityState();
    observability.toolCards = upsertRuntimeToolCards(observability.toolCards, event.tool);
    if (!event.partial) {
      observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
        id: `tool-result-${event.tool.toolCallId}-${event.emittedAt}`,
        kind: 'tool_result',
        runId: event.runId,
        toolCallId: event.tool.toolCallId,
        emittedAt: event.emittedAt,
        title: text(`Tool result · ${event.tool.name}`, `Tool result · ${event.tool.name}`),
        detail: event.tool.resultPreview,
        level: event.tool.isError ? 'error' : 'success',
      });
    }
    applyObservability(observability);
  }
}

function handleCanonicalStreamEvent(event: ChatStreamEvent): void {
  if (event.runId && suppressedRunIds.has(event.runId) && event.kind !== 'ack') return;

  const isSelectedSession = selectedSession.value?.key === event.sessionKey;

  if (event.kind === 'side_result') {
    applySideResultEvent(event, isSelectedSession);
    return;
  }

  if (event.kind === 'ack') {
    markSessionRunLocallyActive(event.sessionKey, event.runId || event.runtime.activeRunId);
    const queuedSlash = consumeQueuedSlashCommand(event.sessionKey, event.requestId);
    if (queuedSlash) {
      setSlashFeedbackState(event.sessionKey, buildSlashFeedback(
        event.sessionKey,
        queuedSlash.commandName,
        queuedSlash.args,
        'send',
        'accepted',
        {
          startedAt: queuedSlash.queuedAt,
          updatedAt: event.emittedAt,
          requestId: event.requestId,
          runId: event.runId,
        },
      ));
    }
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    updateSlashFeedbackFromRuntime(event.sessionKey, event.runtime, {
      requestId: event.requestId,
      runId: event.runId,
    });
    if (isSelectedSession) {
      applyRuntime(event.runtime);
      playChatCueSafely('sent', event.requestId || event.runId || null);
      setNotice('success', text('消息已发送。', 'Message sent.'));
    }
    return;
  }

  if (event.kind === 'canonical.snapshot') {
    const lastMessage = event.messages[event.messages.length - 1];
    const shouldApplySnapshotWindow = !viewingHistoricalPosition.value || event.messages.length === 0;
    const currentPageInfo = historyPayload.value?.pageInfo || historyPageInfo.value;
    const snapshotPageInfo = event.pageInfo && shouldApplySnapshotWindow
      ? mergeCanonicalSnapshotPageInfo(currentPageInfo, event.pageInfo, {
        snapshotMessageCount: event.messages.length,
      })
      : event.pageInfo || currentPageInfo;
    syncSessionRow(event.sessionKey, {
      runtime: event.runtime,
      updatedAt: lastMessage?.createdAt || event.emittedAt,
      lastMessagePreview: deriveRuntimeMessagePreview(lastMessage),
    });
    if (isSelectedSession) {
      applyRuntime(event.runtime);
      if (shouldApplySnapshotWindow) {
        runtimeMachineState.value = applyChatSessionCanonicalSnapshotEvent(runtimeMachineState.value, {
          version: event.version,
          messages: event.messages,
          overlays: event.overlays,
        });
      }
      if (event.pageInfo && shouldApplySnapshotWindow) {
        if (
          historyPageInfo.value.beforeCursor !== event.pageInfo.beforeCursor
          || historyPageInfo.value.afterCursor !== event.pageInfo.afterCursor
        ) {
          clearHistoryBeforePrefetch();
          clearHistoryAfterPrefetch();
        }
        historyPageInfo.value = snapshotPageInfo;
      }
      if (historyPayload.value?.session.key === event.sessionKey && shouldApplySnapshotWindow) {
        historyPayload.value = {
          ...historyPayload.value,
          messages: event.messages,
          overlays: event.overlays,
          runtime: event.runtime,
          pageInfo: snapshotPageInfo,
          session: {
            ...historyPayload.value.session,
            runtime: event.runtime,
            updatedAt: lastMessage?.createdAt || event.emittedAt,
            lastMessagePreview: deriveRuntimeMessagePreview(lastMessage),
          },
        };
      }
      syncSessionAutoLabel(event.sessionKey, event.messages);
      if (shouldApplySnapshotWindow) {
        persistHistorySnapshot(event.sessionKey);
      }
    }
    return;
  }

  if (event.kind === 'canonical.message') {
    if (event.message.role === 'assistant') {
      flushPendingTemporaryToolEvents();
    }
    syncSessionRow(event.sessionKey, {
      updatedAt: event.message.createdAt || event.emittedAt,
      lastMessagePreview: deriveRuntimeMessagePreview(event.message),
    });
    if (isSelectedSession) {
      if (event.message.role === 'assistant') {
        playChatCueSafely('received', `${event.sessionKey}:${event.runId || event.messageId}`);
      }
      runtimeMachineState.value = applyChatSessionCanonicalMessageEvent(runtimeMachineState.value, {
        version: event.version,
        message: event.message,
        messageId: event.messageId,
        messageSeq: event.messageSeq,
        emittedAt: event.emittedAt,
      });
      if (historyPayload.value?.session.key === event.sessionKey) {
        historyPayload.value = {
          ...historyPayload.value,
          session: {
            ...historyPayload.value.session,
            updatedAt: event.message.createdAt || event.emittedAt,
            lastMessagePreview: deriveRuntimeMessagePreview(event.message),
          },
        };
      }
      syncSessionAutoLabel(event.sessionKey, runtimeMachineState.value.canonicalMessageLedger);
      persistHistorySnapshot(event.sessionKey);
      // Recovery safety net: canonical.message carries messages only, not overlay/tool-call
      // completion state. Debounced history fetch picks up the remaining authoritative state.
      scheduleLiveHistorySync(event.sessionKey, 90);
    }
    return;
  }

  if (event.kind === 'temporary.assistant') {
    flushPendingTemporaryToolEvents();
    markSessionRunLocallyActive(event.sessionKey, event.runId);
    markRunAsActive(event.sessionKey, event.runId);
    const currentRuntime = activeRuntime.value;
    const runtime = {
      ...(currentRuntime || {}),
      gatewayConnected: true,
      sessionWritable: Boolean(selectedSession.value?.permissions.writable),
      activeRunId: event.runId,
      state: 'streaming',
      lastEventAt: event.emittedAt,
      lastAckAt: currentRuntime?.lastAckAt || null,
      lastErrorCode: null,
      lastErrorMessage: null,
    } as ChatRuntimeState;
    syncSessionRow(event.sessionKey, { runtime });
    if (isSelectedSession) {
      applyRuntime(runtime);
      settleObservabilityToolsForAssistantStream(event.runId, event.emittedAt);
      playChatCueSafely('received', event.runId ? `${event.sessionKey}:${event.runId}` : null);
      runtimeMachineState.value = applyChatSessionTemporaryAssistantEvent(runtimeMachineState.value, {
        runId: event.runId,
        emittedAt: event.emittedAt,
        textDelta: event.textDelta,
        accumulatedText: event.accumulatedText,
      });
    }
    return;
  }

  if (event.kind === 'temporary.tool') {
    handleTemporaryToolStreamEvent(event);
    return;
  }

  if (event.kind === 'runtime.state') {
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    updateSlashFeedbackFromRuntime(event.sessionKey, event.runtime, {
      runId: event.runId,
    });
    if (isSelectedSession) {
      const transientRunId = event.runId || activeRuntime.value?.activeRunId || null;
      if (event.runtime.state === 'aborted' && transientRunId) {
        runtimeMachineState.value = clearChatSessionTransientRun(runtimeMachineState.value, transientRunId);
        persistHistorySnapshot(event.sessionKey);
        setNotice('success', text('当前运行已中止。', 'The current run has been aborted.'));
      }
      applyRuntime(event.runtime);
      if (
        event.runId
        && (
          event.runtime.state === 'completed'
          || event.runtime.state === 'aborted'
          || event.runtime.state === 'error'
        )
      ) {
        clearSessionRunLocallyActive(event.sessionKey, event.runId);
        markRunAsTerminal(event.sessionKey, event.runId);
        // Recovery safety net: ensure full history sync after run reaches terminal state.
        scheduleLiveHistorySync(event.sessionKey, 260);
        scheduleRunSettlementHistorySync(event.sessionKey, event.runId, {
          delayMs: 260,
          attempts: 10,
        });
      } else if (
        event.runId
        && (
          event.runtime.state === 'running'
          || event.runtime.state === 'streaming'
        )
      ) {
        markSessionRunLocallyActive(event.sessionKey, event.runId);
        markRunAsActive(event.sessionKey, event.runId);
      }
    }
    return;
  }

  if (!isSelectedSession) return;

  if (event.kind === 'agent_lifecycle') {
    const observability = ensureObservabilityState();
    observability.lifecycle = event.lifecycle;
    observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
      id: `lifecycle-${event.runId || 'none'}-${event.lifecycle.phase}-${event.emittedAt}`,
      kind: 'lifecycle',
      runId: event.runId,
      toolCallId: null,
      emittedAt: event.emittedAt,
      title: text(`Lifecycle · ${event.lifecycle.phase}`, `Lifecycle · ${event.lifecycle.phase}`),
      detail: event.lifecycle.errorMessage,
      level: event.lifecycle.phase === 'error' ? 'error' : event.lifecycle.phase === 'end' ? 'success' : 'info',
    });
    applyObservability(observability);
    return;
  }

  if (event.kind === 'agent_assistant') {
    flushPendingTemporaryToolEvents();
    const observability = ensureObservabilityState();
    observability.toolCards = settleRuntimeToolCardsBeforeAssistant(observability.toolCards, event.runId, event.emittedAt);
    observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
      id: `assistant-${event.runId}`,
      kind: 'assistant',
      runId: event.runId,
      toolCallId: null,
      emittedAt: event.emittedAt,
      title: text('Assistant stream', 'Assistant stream'),
      detail: event.textPreview,
      level: 'info',
    });
    applyObservability(observability);
    return;
  }

  if (event.kind === 'agent_tool_call' || event.kind === 'agent_tool_result') {
    const observability = ensureObservabilityState();
    observability.toolCards = upsertRuntimeToolCards(observability.toolCards, event.tool);
    if (event.kind === 'agent_tool_call' || !event.partial) {
      observability.timeline = upsertRuntimeTimelineItems(observability.timeline, {
        id: event.kind === 'agent_tool_call'
          ? `tool-call-${event.tool.toolCallId}-${event.emittedAt}`
          : `tool-result-${event.tool.toolCallId}-${event.emittedAt}`,
        kind: event.kind === 'agent_tool_call' ? 'tool_call' : 'tool_result',
        runId: event.runId,
        toolCallId: event.tool.toolCallId,
        emittedAt: event.emittedAt,
        title: event.kind === 'agent_tool_call'
          ? text(`Tool start · ${event.tool.name}`, `Tool start · ${event.tool.name}`)
          : text(`Tool result · ${event.tool.name}`, `Tool result · ${event.tool.name}`),
        detail: event.kind === 'agent_tool_call' ? event.tool.argsPreview : event.tool.resultPreview,
        level: event.tool.isError ? 'error' : event.kind === 'agent_tool_result' ? 'success' : 'info',
      });
    }
    applyObservability(observability);
    return;
  }

  if (event.kind === 'error') {
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    updateSlashFeedbackFromRuntime(event.sessionKey, event.runtime, {
      runId: event.runId,
    });
    applyRuntime(event.runtime);
    setNotice('error', event.error.message);
  }
}

function handleStreamEvent(event: ChatStreamEvent): void {
  rememberStreamSeq(event);
  recordChatDebugTrace({
    at: new Date().toISOString(),
    source: 'stream',
    kind: event.kind,
    sessionKey: event.sessionKey || null,
    runId: 'runId' in event ? (event.runId || null) : null,
  });
  if (event.kind === 'queue.state') {
    applyQueueState(event.sessionKey, event.items);
    return;
  }

  if (event.kind === 'session.controls') {
    if (typeof event.globalHostManagementExecEnabled === 'boolean') {
      globalHostManagementExecEnabled.value = event.globalHostManagementExecEnabled;
      rememberChatShellWarmCache();
    }
    applySessionControlsState(event.sessionKey, event.controls);
    return;
  }

  if (chatProtocolMode === 'canonical_v1') {
    handleCanonicalStreamEvent(event);
    return;
  }
  handleLegacyStreamEvent(event);
}

function clearWsReconnectTimer(): void {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
}

function clearRealtimeRecoveryRetryTimer(sessionKey: string | null | undefined = null): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (
    normalizedSessionKey
    && realtimeRecoveryRetrySessionKey
    && realtimeRecoveryRetrySessionKey !== normalizedSessionKey
  ) {
    return;
  }
  if (realtimeRecoveryRetryTimer != null) {
    window.clearTimeout(realtimeRecoveryRetryTimer);
    realtimeRecoveryRetryTimer = null;
  }
  realtimeRecoveryRetrySessionKey = '';
}

function normalizeStreamSeq(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.floor(numeric);
}

function lastStreamSeqForSession(sessionKey: string): number | null {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return null;
  }
  const current = lastStreamSeqBySession.get(normalizedSessionKey);
  if (current != null) {
    return current;
  }
  const stored = readChatLastStreamSeq(normalizedSessionKey);
  if (stored == null) {
    return null;
  }
  lastStreamSeqBySession.set(normalizedSessionKey, stored);
  lastStreamSeqLoadedFromStorageBySession.add(normalizedSessionKey);
  return stored;
}

function clearLastStreamSeqForSession(sessionKey: string | null | undefined): void {
  const normalizedSessionKey = typeof sessionKey === 'string' ? sessionKey.trim() : '';
  if (!normalizedSessionKey) {
    return;
  }
  lastStreamSeqBySession.delete(normalizedSessionKey);
  lastStreamSeqLoadedFromStorageBySession.delete(normalizedSessionKey);
  clearChatLastStreamSeq(normalizedSessionKey);
}

function rememberStreamSeq(event: ChatStreamEvent): void {
  const sessionKey = typeof event.sessionKey === 'string' ? event.sessionKey.trim() : '';
  const streamSeq = normalizeStreamSeq(event.streamSeq);
  if (!sessionKey || streamSeq == null) {
    return;
  }
  const current = lastStreamSeqForSession(sessionKey);
  const loadedFromStorage = lastStreamSeqLoadedFromStorageBySession.has(sessionKey);
  if (current == null || streamSeq > current || (streamSeq < current && loadedFromStorage)) {
    lastStreamSeqBySession.set(sessionKey, streamSeq);
    lastStreamSeqLoadedFromStorageBySession.delete(sessionKey);
    rememberChatLastStreamSeq(sessionKey, streamSeq);
    return;
  }
  if (streamSeq === current && loadedFromStorage) {
    lastStreamSeqLoadedFromStorageBySession.delete(sessionKey);
    rememberChatLastStreamSeq(sessionKey, streamSeq);
  }
}

function markRealtimeDisconnectedForRecovery(sessionKey: string | null | undefined): void {
  markChatRealtimeDisconnected(realtimeRecoveryState, sessionKey);
}

function clearRealtimeRecoveryState(sessionKey?: string | null): void {
  clearRealtimeRecoveryRetryTimer(sessionKey);
  clearChatRealtimeRecoveryState(realtimeRecoveryState, sessionKey);
}

function scheduleRealtimeRecoveryHistorySync(sessionKey: string | null | undefined): void {
  if (!sessionKey || selectedSessionKey.value !== sessionKey || historyMode.value !== 'history') {
    return;
  }
  const decision = resolveChatRealtimeRecoverySyncDecision(realtimeRecoveryState, {
    sessionKey,
    nowMs: Date.now(),
    minIntervalMs: CHAT_REALTIME_RECOVERY_SYNC_MIN_INTERVAL_MS,
  });
  if (decision.shouldSync) {
    clearRealtimeRecoveryRetryTimer(sessionKey);
    scheduleLiveHistorySync(sessionKey, CHAT_REALTIME_RECOVERY_SYNC_DELAY_MS);
    return;
  }
  if (decision.retryAfterMs == null || typeof window === 'undefined') {
    return;
  }
  clearRealtimeRecoveryRetryTimer(sessionKey);
  realtimeRecoveryRetrySessionKey = sessionKey;
  realtimeRecoveryRetryTimer = window.setTimeout(() => {
    realtimeRecoveryRetryTimer = null;
    const retrySessionKey = realtimeRecoveryRetrySessionKey;
    realtimeRecoveryRetrySessionKey = '';
    scheduleRealtimeRecoveryHistorySync(retrySessionKey);
  }, Math.max(CHAT_REALTIME_RECOVERY_SYNC_DELAY_MS, decision.retryAfterMs));
}

function cloneChatShellWarmValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rememberChatShellWarmCache(): void {
  chatShellWarmCache = {
    capturedAt: Date.now(),
    agentRows: cloneChatShellWarmValue(agentRows.value),
    sessionRows: cloneChatShellWarmValue(sessionRows.value),
    organizer: cloneChatShellWarmValue(organizerSourceState.value),
    chatHealth: cloneChatShellWarmValue(chatHealth.value),
    globalHostManagementExecEnabled: globalHostManagementExecEnabled.value,
    slashModelOptions: [...(slashArgOptionsOverrides.value.model || [])],
  };
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        CHAT_SHELL_WARM_CACHE_STORAGE_KEY,
        JSON.stringify(chatShellWarmCache),
      );
    } catch {}
  }
}

function canUseChatShellWarmCache(expectedSessionKey: string | null = null): boolean {
  const snapshot = (() => {
    if (chatShellWarmCache) {
      return chatShellWarmCache;
    }
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      const raw = window.sessionStorage.getItem(CHAT_SHELL_WARM_CACHE_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as ChatShellWarmCacheSnapshot;
      chatShellWarmCache = parsed;
      return parsed;
    } catch {
      return null;
    }
  })();
  if (!snapshot) {
    return false;
  }
  if (Date.now() - snapshot.capturedAt > CHAT_SHELL_WARM_CACHE_TTL_MS) {
    return false;
  }
  if (!snapshot.agentRows.length || !snapshot.sessionRows.length) {
    return false;
  }
  if (expectedSessionKey && !snapshot.sessionRows.some((row) => row.key === expectedSessionKey)) {
    return false;
  }
  return true;
}

function restoreChatShellWarmCache(expectedSessionKey: string | null = null): boolean {
  if (!canUseChatShellWarmCache(expectedSessionKey) || !chatShellWarmCache) {
    return false;
  }
  agentRows.value = cloneChatShellWarmValue(chatShellWarmCache.agentRows);
  sessionRows.value = cloneChatShellWarmValue(chatShellWarmCache.sessionRows);
  applyOrganizer(cloneChatShellWarmValue(chatShellWarmCache.organizer));
  chatHealth.value = cloneChatShellWarmValue(chatShellWarmCache.chatHealth);
  globalHostManagementExecEnabled.value = chatShellWarmCache.globalHostManagementExecEnabled;
  slashArgOptionsOverrides.value = {
    ...slashArgOptionsOverrides.value,
    model: [...chatShellWarmCache.slashModelOptions],
  };
  return true;
}

function usesGatewayRpc(): boolean {
  return false;
}

function usesChatEventSource(): boolean {
  return getStudioExposureKind() === 'gateway' || standaloneChatRealtimeFallback === 'eventsource';
}

function clearStandaloneChatRealtimeFallback(): void {
  if (getStudioExposureKind() === 'gateway') {
    standaloneChatRealtimeFallback = null;
    return;
  }
  standaloneChatRealtimeFallback = null;
}

function enableStandaloneChatEventSourceFallback(sessionKey: string): void {
  if (!sessionKey || getStudioExposureKind() === 'gateway' || standaloneChatRealtimeFallback === 'eventsource') {
    return;
  }
  standaloneChatRealtimeFallback = 'eventsource';
  clearWsReconnectTimer();
  if (chatSocket) {
    try { chatSocket.close(); } catch {}
    chatSocket = null;
    chatSocketSessionKey = '';
  }
  connectChatEventSource(sessionKey);
  setNotice(
    'success',
    text(
      '检测到 standalone WebSocket 实时链路不稳定，已自动切换到 SSE 持续流。',
      'Standalone WebSocket realtime looked unstable, so chat switched to the SSE stream automatically.',
    ),
  );
}

function stopGatewayHeartbeat(): void {
  if (!gatewayHeartbeatTimer) {
    return;
  }
  clearInterval(gatewayHeartbeatTimer);
  gatewayHeartbeatTimer = null;
}

async function requestGatewayChat<T>(method: string, params: unknown): Promise<T> {
  const client = gatewayClient;
  if (!client) {
    throw new Error(text('聊天 Gateway 连接尚未初始化。', 'Chat Gateway client is not initialized.'));
  }
  return client.request<T>(method, params);
}

async function requestStudioSlashGatewayChat<T>(
  sessionKey: string,
  method: string,
  params: unknown,
): Promise<T> {
  return await requestChatSlashGateway<T>(sessionKey, {
    method,
    params: params && typeof params === 'object' && !Array.isArray(params)
      ? params as Record<string, unknown>
      : {},
  });
}

function shouldFallbackToCoreGatewayWrite(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return message.includes('pairing required') || message.includes('missing scope');
}

async function attachGatewayChat(sessionKey: string): Promise<void> {
  gatewayChatSessionKey = sessionKey;
  const response = await requestGatewayChat<ChatGatewayAttachResponse>(
    STUDIO_CHAT_GATEWAY_METHODS.attach,
    {
      sessionKey,
      bootstrapSnapshot: false,
      lastStreamSeq: lastStreamSeqForSession(sessionKey),
    },
  );
  wsConnected.value = true;
  for (const event of response.events || []) {
    handleStreamEvent(event);
  }
  if (bootstrapHistorySyncSkipSessionKeys.delete(sessionKey)) {
    return;
  }
  if (selectedSessionKey.value === sessionKey && historyMode.value === 'history') {
    scheduleLiveHistorySync(sessionKey, 40);
  }
}

function startGatewayHeartbeat(): void {
  stopGatewayHeartbeat();
  gatewayHeartbeatTimer = window.setInterval(() => {
    const sessionKey = gatewayChatSessionKey || selectedSessionKey.value;
    if (!sessionKey || !gatewayClient?.connected) {
      return;
    }
    void requestGatewayChat(
      STUDIO_CHAT_GATEWAY_METHODS.heartbeat,
      { sessionKey },
    ).catch(() => {
      wsConnected.value = false;
    });
  }, 10_000);
}

function disconnectGatewayClient(): void {
  stopGatewayHeartbeat();
  gatewayClient?.stop();
  gatewayClient = null;
  gatewayChatSessionKey = '';
  wsConnected.value = false;
}

function disconnectChatEventSource(): void {
  if (chatEventSource) {
    try { chatEventSource.close(); } catch {}
    chatEventSource = null;
  }
  chatEventSourceSessionKey = '';
  wsConnected.value = false;
}

function connectChatEventSource(sessionKey: string): void {
  if (
    chatEventSource
    && chatEventSourceSessionKey === sessionKey
  ) {
    return;
  }

  disconnectChatEventSource();
  clearWsReconnectTimer();

  const source = new EventSource(buildChatStreamUrl(sessionKey, {
    bootstrapSnapshot: false,
    lastStreamSeq: lastStreamSeqForSession(sessionKey),
  }), {
    withCredentials: true,
  });
  chatEventSource = source;
  chatEventSourceSessionKey = sessionKey;

  source.onopen = () => {
    if (chatEventSource !== source) return;
    wsConnected.value = true;
    wsReconnectAttempt = 0;
    scheduleRealtimeRecoveryHistorySync(sessionKey);
  };
  source.onerror = () => {
    if (chatEventSource !== source) return;
    wsConnected.value = false;
    markRealtimeDisconnectedForRecovery(sessionKey);
  };
  source.addEventListener('chat-stream', (event) => {
    if (chatEventSource !== source) return;
    const data = event instanceof MessageEvent ? event.data : null;
    try {
      handleStreamEvent(JSON.parse(String(data)) as ChatStreamEvent);
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : text('无法解析 stream 事件。', 'Failed to parse stream event.'));
    }
  });
}

function connectGatewayClient(sessionKey: string, options: { force?: boolean } = {}): void {
  const auth = resolveStudioGatewayClientAuth();
  if (!auth.gatewayUrl) {
    wsConnected.value = false;
    setNotice(
      'error',
      text(
        '未找到 Gateway 鉴权配置，无法建立聊天实时链路。',
        'No Gateway auth configuration was found for chat realtime.',
      ),
    );
    return;
  }

  gatewayChatSessionKey = sessionKey;

  if (gatewayClient && !options.force) {
    if (gatewayClient.connected) {
      void attachGatewayChat(sessionKey).catch((error) => {
        wsConnected.value = false;
        setNotice('error', error instanceof Error ? error.message : text('聊天重连失败。', 'Failed to reattach chat.'));
      });
      return;
    }
    disconnectGatewayClient();
  }

  disconnectGatewayClient();
  clearWsReconnectTimer();

  const client = new GatewayBrowserClient({
    url: auth.gatewayUrl,
    token: auth.token,
    password: auth.password,
    clientVersion: 'openclaw-studio-chat',
    mode: 'webchat',
    instanceId: `studio-chat-${sessionKey}`,
    onHello: () => {
      if (gatewayClient !== client) return;
      wsReconnectAttempt = 0;
      startGatewayHeartbeat();
      const targetSessionKey = selectedSessionKey.value || gatewayChatSessionKey;
      if (!targetSessionKey) {
        wsConnected.value = true;
        return;
      }
      void attachGatewayChat(targetSessionKey).catch((error) => {
        wsConnected.value = false;
        setNotice('error', error instanceof Error ? error.message : text('聊天附着失败。', 'Failed to attach chat.'));
      });
      scheduleRealtimeRecoveryHistorySync(targetSessionKey);
    },
    onEvent: (event: GatewayEventFrame) => {
      if (gatewayClient !== client) return;
      if (event.event !== STUDIO_CHAT_GATEWAY_EVENT) return;
      if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return;
      handleStreamEvent(event.payload as ChatStreamEvent);
    },
    onClose: () => {
      if (gatewayClient !== client) return;
      wsConnected.value = false;
      markRealtimeDisconnectedForRecovery(gatewayChatSessionKey || selectedSessionKey.value);
      stopGatewayHeartbeat();
    },
    onGap: () => {
      if (gatewayClient !== client) return;
      const targetSessionKey = selectedSessionKey.value || gatewayChatSessionKey;
      if (!targetSessionKey) return;
      void attachGatewayChat(targetSessionKey).catch(() => {
        wsConnected.value = false;
      });
    },
  });

  gatewayClient = client;
  client.start();
}

function scheduleWsReconnect(sessionKey: string): void {
  if (usesChatEventSource()) return;
  clearWsReconnectTimer();
  if (
    getStudioExposureKind() !== 'gateway'
    && wsReconnectAttempt >= STANDALONE_EVENTSOURCE_FALLBACK_THRESHOLD
  ) {
    enableStandaloneChatEventSourceFallback(sessionKey);
    return;
  }
  if (wsReconnectAttempt >= WS_RECONNECT_MAX_ATTEMPTS) return;
  const delay = Math.min(
    WS_RECONNECT_BASE_MS * Math.pow(2, wsReconnectAttempt),
    WS_RECONNECT_MAX_MS,
  );
  wsReconnectAttempt += 1;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    // Only reconnect if we're still on the same session.
    if (chatSocketSessionKey === sessionKey || (!chatSocket && selectedSessionKey.value === sessionKey)) {
      connectChatSocket(sessionKey);
    }
  }, delay);
}

function connectChatSocket(sessionKey: string): void {
  if (!isChatRealtimeEnabled()) {
    wsConnected.value = false;
    return;
  }
  if (usesChatEventSource()) {
    connectChatEventSource(sessionKey);
    return;
  }
  if (
    chatSocket
    && chatSocketSessionKey === sessionKey
    && (chatSocket.readyState === WebSocket.OPEN || chatSocket.readyState === WebSocket.CONNECTING)
  ) return;

  if (chatSocket) {
    try { chatSocket.close(); } catch {}
    chatSocket = null;
    chatSocketSessionKey = '';
    wsConnected.value = false;
  }
  clearWsReconnectTimer();

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = getWebSocketBasePath();
  const wsPath = basePath ? `${basePath}/ws/chat` : '/ws/chat';
  const lastStreamSeq = lastStreamSeqForSession(sessionKey);
  const streamSeqParam = lastStreamSeq == null
    ? ''
    : `&lastStreamSeq=${encodeURIComponent(String(lastStreamSeq))}`;
  const socket = new WebSocket(
    `${protocol}//${window.location.host}${wsPath}?sessionKey=${encodeURIComponent(sessionKey)}&bootstrapSnapshot=0${streamSeqParam}`,
  );
  chatSocket = socket;
  chatSocketSessionKey = sessionKey;

  socket.onopen = () => {
    if (chatSocket !== socket) return;
    clearStandaloneChatRealtimeFallback();
    wsConnected.value = true;
    wsReconnectAttempt = 0;
    scheduleRealtimeRecoveryHistorySync(sessionKey);
  };
  socket.onclose = () => {
    if (chatSocket !== socket) return;
    wsConnected.value = false;
    markRealtimeDisconnectedForRecovery(sessionKey);
    scheduleWsReconnect(sessionKey);
  };
  socket.onerror = () => {
    if (chatSocket !== socket) return;
    wsConnected.value = false;
    markRealtimeDisconnectedForRecovery(sessionKey);
  };
  socket.onmessage = (raw) => {
    if (chatSocket !== socket) return;
    try {
      handleStreamEvent(JSON.parse(String(raw.data)) as ChatStreamEvent);
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : text('无法解析 stream 事件。', 'Failed to parse stream event.'));
    }
  };
}

function forceCloseChatSocketForTest(): void {
  const sessionKey = selectedSessionKey.value;
  markRealtimeDisconnectedForRecovery(sessionKey);
  wsConnected.value = false;
  if (sessionKey) {
    setNotice(
      'error',
      text(
        '实时连接正在恢复，消息和工具过程可能短暂延迟。',
        'Realtime connection is recovering. Messages and tool progress may briefly lag.',
      ),
    );
  }
  if (usesChatEventSource()) {
    disconnectChatEventSource();
    return;
  }
  if (!chatSocket) {
    chatSocketSessionKey = '';
    return;
  }
  clearWsReconnectTimer();
  try { chatSocket.close(); } catch {}
  chatSocket = null;
  chatSocketSessionKey = '';
  wsConnected.value = false;
}

async function loadAgents(): Promise<void> {
  agentsLoading.value = true;
  try {
    const payload = await fetchAgentsSummary();
    agentRows.value = payload.agents || [];
    rememberChatShellWarmCache();
  } catch (error) {
    clearNotice();
    errorMessage.value = error instanceof Error ? error.message : text('读取 Agent 失败。', 'Failed to load agents.');
  } finally {
    agentsLoading.value = false;
  }
}

async function loadHealth(): Promise<void> {
  try {
    chatHealth.value = await fetchChatHealth();
  } catch {
    // keep shell usable without health details
  }
}

function applyOrganizer(next: ChatSessionOrganizerState): void {
  organizerSourceState.value = next;
  organizerState.value = pruneOrganizerStateSessionKeys(
    next,
    sessionRows.value
      .filter((row) => row.kind === 'studio_managed')
      .map((row) => row.key),
  );
  rememberChatShellWarmCache();
}

async function loadOrganizer(): Promise<void> {
  try {
    const payload = await fetchChatOrganizer();
    applyOrganizer(payload.organizer);
  } catch {
    applyOrganizer(createEmptyChatSessionOrganizerState());
  }
}

function applyBootstrapPayload(payload: ChatBootstrapPayload): void {
  applyOrganizer(payload.organizer || createEmptyChatSessionOrganizerState());
  chatHealth.value = payload.diagnostics || null;
  sessionRows.value = payload.sessions || [];
  const bootstrapSessionKey = payload.selectedSessionKey || '';
  if (bootstrapSessionKey) {
    if (payload.queue) {
      applyQueueState(bootstrapSessionKey, payload.queue.items || []);
    }
    if (payload.controls) {
      applySessionControlsPayload(bootstrapSessionKey, payload.controls);
    }
    if (payload.history) {
      applyHistoryPagePayload(payload.history, 'replace');
      historyLoadingInitial.value = false;
      historyErrorMessage.value = '';
      bootstrapHistorySyncSkipSessionKeys.add(bootstrapSessionKey);
    }
    bootstrapPrimedSessionKey.value = (
      payload.history && payload.queue && payload.controls ? bootstrapSessionKey : ''
    );
    selectSessionKeyLocally(bootstrapSessionKey);
  }
  rememberChatShellWarmCache();
}

async function loadChatBootstrap(sessionKey: string | null = null): Promise<ChatBootstrapPayload> {
  const bootstrapHistoryLimit = sessionKey
    ? CHAT_HISTORY_INITIAL_WINDOW_LIMIT
    : CHAT_HISTORY_BOOTSTRAP_WINDOW_LIMIT;
  const payload = await fetchChatBootstrap({
    sessionKey,
    recentLimit: CHAT_SESSION_BOOTSTRAP_ROW_LIMIT,
    historyLimit: bootstrapHistoryLimit,
  });
  applyBootstrapPayload(payload);
  return payload;
}

async function loadSessionRowsForAgents(
  agents: AgentSummary[],
  loadVersion: number,
  seedRows: ChatSessionRow[],
  fetchOptions: Parameters<typeof fetchChatSessions>[1] = {},
): Promise<ChatSessionRow[]> {
  if (!agents.length) {
    sessionRows.value = seedRows;
    return seedRows;
  }

  let mergedRows = seedRows;
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const agent = agents[currentIndex];
      if (!agent) {
        return;
      }
      try {
        const payload = await fetchChatSessions(agent.id, fetchOptions);
        if (loadVersion !== sessionsLoadVersion) {
          return;
        }
        const incomingRows = (payload.sessions || []).map((row) => (
          enrichIncomingSessionRowFromProtectedCurrent(
            row,
            mergedRows.find((current) => current.key === row.key) || null,
          )
        ));
        const preservedRows = collectPreservedAgentRows(mergedRows, agent.id, incomingRows, {
          preserveAllMissing: fetchOptions.localOnly === true,
        });
        mergedRows = mergeSessionRowsForAgent(mergedRows, agent.id, incomingRows, {
          preserveMissingRows: preservedRows,
        });
        sessionRows.value = mergedRows;
      } catch {
        if (loadVersion !== sessionsLoadVersion) {
          return;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CHAT_SESSION_LOAD_CONCURRENCY, agents.length) }, () => worker()),
  );
  return mergedRows;
}

function scheduleDeferredSessionHydration(
  agents: AgentSummary[],
  loadVersion: number,
  seedRows: ChatSessionRow[],
): void {
  clearDeferredSessionHydration();
  deferredSessionHydrationTimer = window.setTimeout(async () => {
    deferredSessionHydrationTimer = null;
    if (loadVersion !== sessionsLoadVersion) {
      return;
    }
    try {
      await loadSessionRowsForAgents(agents, loadVersion, seedRows);
    } finally {
      if (loadVersion === sessionsLoadVersion) {
        sessionsLoading.value = false;
      }
    }
  }, CHAT_SESSION_DEFERRED_HYDRATION_DELAY_MS);
}

async function loadSessions(options: { deferRemainingAgents?: boolean } = {}): Promise<void> {
  const loadVersion = ++sessionsLoadVersion;
  clearDeferredSessionHydration();
  sessionsLoading.value = true;
  try {
    const prioritizedAgentId = deriveAgentIdFromChatSessionKey(
      routeSessionKey.value
      || optimisticStartupSessionKey.value
      || selectedSessionKey.value
      || readLastChatSessionKey()
      || '',
    );
    const agents = prioritizeAgentsForSessionLoad(agentRows.value.slice(), {
      selectedAgentId: prioritizedAgentId || selectedAgentId.value,
      recentAgentId: readLastChatAgentId(),
    });
    if (!agents.length) {
      sessionRows.value = [];
      return;
    }

    const allowedAgentIds = new Set(agents.map((agent) => agent.id));
    let mergedRows = sessionRows.value.filter((row) => allowedAgentIds.has(row.agentId));
    sessionRows.value = mergedRows;
    const immediateAgentCount = options.deferRemainingAgents
      ? Math.min(CHAT_SESSION_BOOTSTRAP_AGENT_LIMIT, agents.length)
      : agents.length;
    const immediateAgents = agents.slice(0, immediateAgentCount);
    const deferredAgents = options.deferRemainingAgents
      ? agents
      : agents.slice(immediateAgentCount);
    mergedRows = await loadSessionRowsForAgents(
      immediateAgents,
      loadVersion,
      mergedRows,
      options.deferRemainingAgents ? CHAT_SESSION_BOOTSTRAP_LOCAL_FETCH_OPTIONS : {},
    );
    if (loadVersion === sessionsLoadVersion) {
      rememberChatShellWarmCache();
    }
    if (loadVersion !== sessionsLoadVersion) {
      return;
    }
    if (options.deferRemainingAgents && deferredAgents.length) {
      scheduleDeferredSessionHydration(deferredAgents, loadVersion, mergedRows);
      return;
    }
  } finally {
    if (loadVersion === sessionsLoadVersion && deferredSessionHydrationTimer == null) {
      sessionsLoading.value = false;
    }
  }
}

function applyHistoryPagePayload(
  payload: ChatHistoryPayload,
  mode: 'replace' | 'prepend' = 'replace',
  options: {
    preserveAfterCursor?: boolean;
  } = {},
): void {
  const nextSession = deriveHistoryBackedSessionRow(payload.session, payload.messages);
  ensureSessionRow(nextSession);
  if (payload.messages.length) {
    protectSessionRow(nextSession.key);
  }
  if (optimisticStartupSessionKey.value === nextSession.key) {
    optimisticStartupSessionKey.value = '';
  }
  historyPayload.value = {
    ...payload,
    session: nextSession,
  };
  const previousPageInfo = historyPageInfo.value;
  historyPageInfo.value = mode === 'prepend' && options.preserveAfterCursor
    ? {
      ...payload.pageInfo,
      hasMoreAfter: previousPageInfo.hasMoreAfter,
      afterCursor: previousPageInfo.afterCursor,
    }
    : payload.pageInfo;
  const exhaustedCursor = exhaustedHistoryBeforeCursorBySession.get(nextSession.key);
  if (!payload.pageInfo.beforeCursor || exhaustedCursor !== payload.pageInfo.beforeCursor) {
    exhaustedHistoryBeforeCursorBySession.delete(nextSession.key);
  }
  const exhaustedAfterCursor = exhaustedHistoryAfterCursorBySession.get(nextSession.key);
  if (!payload.pageInfo.afterCursor || exhaustedAfterCursor !== payload.pageInfo.afterCursor) {
    exhaustedHistoryAfterCursorBySession.delete(nextSession.key);
  }
  runtimeMachineState.value = {
    ...runtimeMachineState.value,
    sessionKey: nextSession.key,
  };
  if (mode === 'prepend') {
    historyPrependAnchorMessageId.value = payload.messages[payload.messages.length - 1]?.id || null;
    const result = prependChatSessionCanonicalMessageLedger(runtimeMachineState.value, payload.messages);
    runtimeMachineState.value = result.state;
    if (result.eviction.evictedBottom > 0) {
      historyPageInfo.value = { ...historyPageInfo.value, hasMoreAfter: true };
    }
  } else {
    historyPrependAnchorMessageId.value = null;
    runtimeMachineState.value = replaceChatSessionCanonicalMessageLedger(runtimeMachineState.value, payload.messages, {
      preserveLocalMessages: historyMode.value === 'history',
    });
  }
  runtimeMachineState.value = replaceChatSessionProcessLedger(runtimeMachineState.value, payload.overlays);
  rememberLastChatSessionKey(nextSession.key);
  rememberLastChatAgentId(nextSession.agentId);
  persistHistorySnapshot(nextSession.key);
}

function clearLiveHistorySyncTimer(): void {
  if (liveHistorySyncTimer != null) {
    window.clearTimeout(liveHistorySyncTimer);
    liveHistorySyncTimer = null;
  }
}

function clearRunSettlementSyncTimer(): void {
  if (runSettlementSyncTimer != null) {
    window.clearTimeout(runSettlementSyncTimer);
    runSettlementSyncTimer = null;
  }
}

function clearDeferredInitialHistoryLoad(): void {
  if (deferredInitialHistoryLoadTimer != null) {
    window.clearTimeout(deferredInitialHistoryLoadTimer);
    deferredInitialHistoryLoadTimer = null;
  }
}

function clearDeferredSessionHydration(): void {
  if (deferredSessionHydrationTimer != null) {
    window.clearTimeout(deferredSessionHydrationTimer);
    deferredSessionHydrationTimer = null;
  }
}

function abortReplaceHistoryRequest(): void {
  if (historyReplaceRequestController) {
    historyReplaceRequestController.abort();
    historyReplaceRequestController = null;
  }
}

function abortHistoryDatesRequest(): void {
  if (historyDatesRequestController) {
    historyDatesRequestController.abort();
    historyDatesRequestController = null;
  }
}

function abortHistoryBeforePrefetch(): void {
  if (historyBeforePrefetchController) {
    historyBeforePrefetchController.abort();
    historyBeforePrefetchController = null;
  }
  historyBeforePrefetchKey = null;
  historyBeforePrefetchPromise = null;
}

function abortHistoryAfterPrefetch(): void {
  if (historyAfterPrefetchController) {
    historyAfterPrefetchController.abort();
    historyAfterPrefetchController = null;
  }
  historyAfterPrefetchKey = null;
  historyAfterPrefetchPromise = null;
}

function clearHistoryBeforePrefetch(): void {
  if (historyBeforePrefetchTimer != null) {
    window.clearTimeout(historyBeforePrefetchTimer);
    historyBeforePrefetchTimer = null;
  }
  if (historyBeforePrefetchIdleHandle != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(historyBeforePrefetchIdleHandle);
    historyBeforePrefetchIdleHandle = null;
  }
  abortHistoryBeforePrefetch();
  prefetchedHistoryBefore.value = null;
}

function clearHistoryAfterPrefetch(): void {
  if (historyAfterPrefetchTimer != null) {
    window.clearTimeout(historyAfterPrefetchTimer);
    historyAfterPrefetchTimer = null;
  }
  if (historyAfterPrefetchIdleHandle != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(historyAfterPrefetchIdleHandle);
    historyAfterPrefetchIdleHandle = null;
  }
  abortHistoryAfterPrefetch();
  prefetchedHistoryAfter.value = null;
}

function finishHistoryRenderStabilization(): void {
  if (historyRenderStabilizeTimer != null) {
    window.clearTimeout(historyRenderStabilizeTimer);
    historyRenderStabilizeTimer = null;
  }
  historyRenderStabilizing.value = false;
}

function armHistoryRenderStabilization(timeoutMs = 2600): void {
  historyRenderStabilizing.value = true;
  if (historyRenderStabilizeTimer != null) {
    window.clearTimeout(historyRenderStabilizeTimer);
  }
  historyRenderStabilizeTimer = window.setTimeout(() => {
    historyRenderStabilizeTimer = null;
    historyRenderStabilizing.value = false;
  }, timeoutMs);
}

function clearHistoryBeforeMaterializeReleaseTimer(): void {
  if (historyBeforeMaterializeReleaseTimer != null) {
    window.clearTimeout(historyBeforeMaterializeReleaseTimer);
    historyBeforeMaterializeReleaseTimer = null;
  }
}

function releaseHistoryBeforeMaterializeLock(options: { schedulePrefetch?: boolean } = {}): void {
  clearHistoryBeforeMaterializeReleaseTimer();
  historyBeforeMaterializeInFlight = false;
  if (options.schedulePrefetch) {
    const sessionKey = selectedSessionKey.value;
    if (sessionKey && !historyLoadingInitial.value && historyPageInfo.value.hasMoreBefore) {
      void scheduleHistoryBeforePrefetch(sessionKey, 120);
    }
  }
}

function holdHistoryBeforeMaterializeLockUntilRenderSettles(timeoutMs = 2600): void {
  clearHistoryBeforeMaterializeReleaseTimer();
  historyBeforeMaterializeReleaseTimer = window.setTimeout(() => {
    historyBeforeMaterializeReleaseTimer = null;
    releaseHistoryBeforeMaterializeLock({ schedulePrefetch: true });
  }, timeoutMs);
}

function handleHistoryBeforeRenderSettled(): void {
  finishHistoryRenderStabilization();
  releaseHistoryBeforeMaterializeLock({ schedulePrefetch: true });
}

function currentHistoryBeforePrefetchKey(sessionKey: string): ChatHistoryBeforePrefetchKey | null {
  const beforeCursor = historyPageInfo.value.beforeCursor;
  if (!sessionKey || !historyPageInfo.value.hasMoreBefore || !beforeCursor) {
    return null;
  }
  if (exhaustedHistoryBeforeCursorBySession.get(sessionKey) === beforeCursor) {
    return null;
  }
  return {
    sessionKey,
    mode: historyMode.value,
    beforeCursor,
    day: selectedHistoryDay.value,
    query: historyMode.value === 'search' ? searchQuery.value.trim() : '',
  };
}

function sameHistoryBeforePrefetchKey(
  left: ChatHistoryBeforePrefetchKey | null,
  right: ChatHistoryBeforePrefetchKey | null,
): boolean {
  return Boolean(
    left
    && right
    && left.sessionKey === right.sessionKey
    && left.mode === right.mode
    && left.beforeCursor === right.beforeCursor
    && left.day === right.day
    && left.query === right.query,
  );
}

function matchesHistoryBeforePrefetch(
  expected: ChatHistoryBeforePrefetchKey | null,
): boolean {
  if (!expected) {
    return prefetchedHistoryBefore.value == null;
  }
  const current = prefetchedHistoryBefore.value;
  return Boolean(
    current
    && current.sessionKey === expected.sessionKey
    && current.mode === expected.mode
    && current.beforeCursor === expected.beforeCursor
    && current.day === expected.day
    && current.query === expected.query,
  );
}

function readMatchedHistoryBeforePrefetchPayload(
  expected: ChatHistoryBeforePrefetchKey | null,
): ChatHistoryPayload | null {
  return matchesHistoryBeforePrefetch(expected)
    ? prefetchedHistoryBefore.value?.payload || null
    : null;
}

async function waitForHistoryBeforePrefetch(
  expected: ChatHistoryBeforePrefetchKey | null,
  timeoutMs = 900,
): Promise<ChatHistoryPayload | null> {
  if (!expected || !historyBeforePrefetchController) {
    return readMatchedHistoryBeforePrefetchPayload(expected);
  }
  if (historyBeforePrefetchPromise && sameHistoryBeforePrefetchKey(historyBeforePrefetchKey, expected)) {
    await historyBeforePrefetchPromise;
    return readMatchedHistoryBeforePrefetchPayload(expected);
  }
  const deadline = Date.now() + timeoutMs;
  while (historyBeforePrefetchController && Date.now() < deadline) {
    const payload = readMatchedHistoryBeforePrefetchPayload(expected);
    if (payload) {
      return payload;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return readMatchedHistoryBeforePrefetchPayload(expected);
}

async function runHistoryBeforePrefetch(sessionKey: string): Promise<void> {
  const key = currentHistoryBeforePrefetchKey(sessionKey);
  if (!key) {
    clearHistoryBeforePrefetch();
    return;
  }
  if (matchesHistoryBeforePrefetch(key)) {
    return;
  }
  if (historyBeforePrefetchPromise && sameHistoryBeforePrefetchKey(historyBeforePrefetchKey, key)) {
    await historyBeforePrefetchPromise;
    return;
  }
  abortHistoryBeforePrefetch();
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  historyBeforePrefetchController = controller;
  historyBeforePrefetchKey = key;
  const prefetchPromise = (async () => {
    try {
      const requestLimit = key.mode === 'history' && !key.day
        ? CHAT_HISTORY_AUTO_FILL_PAGE_LIMIT
        : CHAT_HISTORY_PAGE_LIMIT;
      const payload = key.mode === 'search' && key.query
        ? await searchChatHistory(sessionKey, {
          query: key.query,
          before: key.beforeCursor,
          limit: requestLimit,
          signal: controller?.signal,
        }).then((result): ChatHistoryPayload => buildSearchHistoryPayload(
          result,
          historyPayload.value?.observability || createEmptyRuntimeObservability(),
        ))
        : await fetchChatHistoryPage(sessionKey, {
          before: key.beforeCursor,
          limit: requestLimit,
          day: key.day,
          signal: controller?.signal,
        });
      const currentKey = currentHistoryBeforePrefetchKey(sessionKey);
      if (
        historyBeforePrefetchController !== controller
        || !currentKey
        || currentKey.sessionKey !== key.sessionKey
        || currentKey.mode !== key.mode
        || currentKey.beforeCursor !== key.beforeCursor
        || currentKey.day !== key.day
        || currentKey.query !== key.query
      ) {
        return;
      }
      prefetchedHistoryBefore.value = {
        ...key,
        payload,
      };
    } catch (error) {
      if (!isAbortError(error)) {
        prefetchedHistoryBefore.value = null;
      }
    } finally {
      if (historyBeforePrefetchController === controller) {
        historyBeforePrefetchController = null;
        historyBeforePrefetchKey = null;
        historyBeforePrefetchPromise = null;
      }
    }
  })();
  historyBeforePrefetchPromise = prefetchPromise;
  await prefetchPromise;
}

function scheduleHistoryBeforePrefetch(sessionKey: string, delayMs = 180): void {
  const key = currentHistoryBeforePrefetchKey(sessionKey);
  if (!key) {
    clearHistoryBeforePrefetch();
    return;
  }
  if (matchesHistoryBeforePrefetch(key) || historyBeforePrefetchController != null) {
    return;
  }
  if (historyBeforePrefetchTimer != null) {
    window.clearTimeout(historyBeforePrefetchTimer);
    historyBeforePrefetchTimer = null;
  }
  if (historyBeforePrefetchIdleHandle != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(historyBeforePrefetchIdleHandle);
    historyBeforePrefetchIdleHandle = null;
  }
  const run = () => {
    if (historyBeforePrefetchTimer != null) {
      window.clearTimeout(historyBeforePrefetchTimer);
    }
    if (historyBeforePrefetchIdleHandle != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(historyBeforePrefetchIdleHandle);
    }
    historyBeforePrefetchTimer = null;
    historyBeforePrefetchIdleHandle = null;
    void runHistoryBeforePrefetch(sessionKey);
  };
  if (delayMs <= 0) {
    historyBeforePrefetchTimer = window.setTimeout(run, 0);
    return;
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    historyBeforePrefetchIdleHandle = window.requestIdleCallback(() => {
      run();
    }, { timeout: Math.max(250, delayMs + 420) });
    historyBeforePrefetchTimer = window.setTimeout(() => {
      if (historyBeforePrefetchIdleHandle != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(historyBeforePrefetchIdleHandle);
        historyBeforePrefetchIdleHandle = null;
      }
      run();
    }, delayMs);
    return;
  }
  historyBeforePrefetchTimer = window.setTimeout(run, delayMs);
}

function currentHistoryAfterPrefetchKey(sessionKey: string): ChatHistoryAfterPrefetchKey | null {
  const afterCursor = historyPageInfo.value.afterCursor;
  if (!sessionKey || historyMode.value !== 'history' || !historyPageInfo.value.hasMoreAfter || !afterCursor) {
    return null;
  }
  if (exhaustedHistoryAfterCursorBySession.get(sessionKey) === afterCursor) {
    return null;
  }
  return {
    sessionKey,
    afterCursor,
    day: selectedHistoryDay.value,
  };
}

function sameHistoryAfterPrefetchKey(
  left: ChatHistoryAfterPrefetchKey | null,
  right: ChatHistoryAfterPrefetchKey | null,
): boolean {
  return Boolean(
    left
    && right
    && left.sessionKey === right.sessionKey
    && left.afterCursor === right.afterCursor
    && left.day === right.day,
  );
}

function matchesHistoryAfterPrefetch(expected: ChatHistoryAfterPrefetchKey | null): boolean {
  if (!expected) {
    return prefetchedHistoryAfter.value == null;
  }
  const current = prefetchedHistoryAfter.value;
  return Boolean(
    current
    && current.sessionKey === expected.sessionKey
    && current.afterCursor === expected.afterCursor
    && current.day === expected.day,
  );
}

function readMatchedHistoryAfterPrefetchPayload(
  expected: ChatHistoryAfterPrefetchKey | null,
): ChatHistoryPayload | null {
  return matchesHistoryAfterPrefetch(expected)
    ? prefetchedHistoryAfter.value?.payload || null
    : null;
}

async function waitForHistoryAfterPrefetch(
  expected: ChatHistoryAfterPrefetchKey | null,
  timeoutMs = 900,
): Promise<ChatHistoryPayload | null> {
  if (!expected || !historyAfterPrefetchController) {
    return readMatchedHistoryAfterPrefetchPayload(expected);
  }
  if (historyAfterPrefetchPromise && sameHistoryAfterPrefetchKey(historyAfterPrefetchKey, expected)) {
    await historyAfterPrefetchPromise;
    return readMatchedHistoryAfterPrefetchPayload(expected);
  }
  const deadline = Date.now() + timeoutMs;
  while (historyAfterPrefetchController && Date.now() < deadline) {
    const payload = readMatchedHistoryAfterPrefetchPayload(expected);
    if (payload) {
      return payload;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return readMatchedHistoryAfterPrefetchPayload(expected);
}

async function runHistoryAfterPrefetch(sessionKey: string): Promise<void> {
  const key = currentHistoryAfterPrefetchKey(sessionKey);
  if (!key) {
    clearHistoryAfterPrefetch();
    return;
  }
  if (matchesHistoryAfterPrefetch(key)) {
    return;
  }
  if (historyAfterPrefetchPromise && sameHistoryAfterPrefetchKey(historyAfterPrefetchKey, key)) {
    await historyAfterPrefetchPromise;
    return;
  }
  abortHistoryAfterPrefetch();
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  historyAfterPrefetchController = controller;
  historyAfterPrefetchKey = key;
  const prefetchPromise = (async () => {
    try {
      const payload = await fetchChatHistoryPage(sessionKey, {
        after: key.afterCursor,
        limit: CHAT_HISTORY_PAGE_LIMIT,
        day: key.day,
        signal: controller?.signal,
      });
      const currentKey = currentHistoryAfterPrefetchKey(sessionKey);
      if (
        historyAfterPrefetchController !== controller
        || !currentKey
        || currentKey.sessionKey !== key.sessionKey
        || currentKey.afterCursor !== key.afterCursor
        || currentKey.day !== key.day
      ) {
        return;
      }
      prefetchedHistoryAfter.value = {
        ...key,
        payload,
      };
    } catch (error) {
      if (!isAbortError(error)) {
        prefetchedHistoryAfter.value = null;
      }
    } finally {
      if (historyAfterPrefetchController === controller) {
        historyAfterPrefetchController = null;
        historyAfterPrefetchKey = null;
        historyAfterPrefetchPromise = null;
      }
    }
  })();
  historyAfterPrefetchPromise = prefetchPromise;
  await prefetchPromise;
}

function scheduleHistoryAfterPrefetch(sessionKey: string, delayMs = 120): void {
  const key = currentHistoryAfterPrefetchKey(sessionKey);
  if (!key) {
    clearHistoryAfterPrefetch();
    return;
  }
  if (matchesHistoryAfterPrefetch(key) || historyAfterPrefetchController != null) {
    return;
  }
  if (historyAfterPrefetchTimer != null) {
    window.clearTimeout(historyAfterPrefetchTimer);
    historyAfterPrefetchTimer = null;
  }
  if (historyAfterPrefetchIdleHandle != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(historyAfterPrefetchIdleHandle);
    historyAfterPrefetchIdleHandle = null;
  }
  const run = () => {
    if (historyAfterPrefetchTimer != null) {
      window.clearTimeout(historyAfterPrefetchTimer);
    }
    if (historyAfterPrefetchIdleHandle != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(historyAfterPrefetchIdleHandle);
    }
    historyAfterPrefetchTimer = null;
    historyAfterPrefetchIdleHandle = null;
    void runHistoryAfterPrefetch(sessionKey);
  };
  if (delayMs <= 0) {
    historyAfterPrefetchTimer = window.setTimeout(run, 0);
    return;
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    historyAfterPrefetchIdleHandle = window.requestIdleCallback(() => {
      run();
    }, { timeout: Math.max(220, delayMs + 360) });
    historyAfterPrefetchTimer = window.setTimeout(() => {
      if (historyAfterPrefetchIdleHandle != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(historyAfterPrefetchIdleHandle);
        historyAfterPrefetchIdleHandle = null;
      }
      run();
    }, delayMs);
    return;
  }
  historyAfterPrefetchTimer = window.setTimeout(run, delayMs);
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError');
}

function isTerminalToolStatus(status: ChatToolCard['status'] | null | undefined): boolean {
  return status === 'completed' || status === 'error';
}

function isSettledOverlay(overlay: ChatRunOverlay | null | undefined): boolean {
  if (!overlay) return false;
  if (overlay.lifecycle === 'aborted' || overlay.lifecycle === 'error') {
    return true;
  }
  if (overlay.lifecycle !== 'completed') {
    return false;
  }
  return !overlay.toolCalls.length || overlay.toolCalls.every((toolCall) => isTerminalToolStatus(toolCall.status));
}

function isRunPendingSettlement(runId: string): boolean {
  if (!runId) return false;
  if (runtimeMachineState.value.transientRunState[runId]) {
    return true;
  }
  const overlay = runtimeMachineState.value.processLedger[runId];
  if (!overlay) {
    return false;
  }
  return !isSettledOverlay(overlay);
}

function ensureTerminalRunFence(sessionKey: string): Set<string> {
  const existing = terminalRunFenceBySession.get(sessionKey);
  if (existing) {
    return existing;
  }
  const created = new Set<string>();
  terminalRunFenceBySession.set(sessionKey, created);
  return created;
}

function markRunAsTerminal(sessionKey: string, runId: string | null | undefined): void {
  if (!sessionKey || !runId) return;
  ensureTerminalRunFence(sessionKey).add(runId);
}

function markRunAsActive(sessionKey: string, runId: string | null | undefined): void {
  if (!sessionKey || !runId) return;
  const fence = terminalRunFenceBySession.get(sessionKey);
  if (!fence) return;
  fence.delete(runId);
  if (!fence.size) {
    terminalRunFenceBySession.delete(sessionKey);
  }
}

function isRunTerminal(sessionKey: string, runId: string | null | undefined): boolean {
  if (!sessionKey || !runId) return false;
  return terminalRunFenceBySession.get(sessionKey)?.has(runId) || false;
}

function clearTerminalRunFence(sessionKey?: string): void {
  if (sessionKey) {
    terminalRunFenceBySession.delete(sessionKey);
    return;
  }
  terminalRunFenceBySession.clear();
}

function applyLiveHistorySyncPayload(payload: ChatHistoryPayload): void {
  const nextSession = deriveHistoryBackedSessionRow(payload.session, payload.messages);
  ensureSessionRow(nextSession);
  if (payload.messages.length) {
    protectSessionRow(nextSession.key);
  }
  historyPayload.value = {
    ...payload,
    session: nextSession,
  };
  historyPageInfo.value = payload.pageInfo;
  runtimeMachineState.value = {
    ...runtimeMachineState.value,
    sessionKey: nextSession.key,
  };
  runtimeMachineState.value = syncChatSessionCanonicalMessageLedger(runtimeMachineState.value, payload.messages, {
    preserveLocalMessages: historyMode.value === 'history',
  });
  runtimeMachineState.value = replaceChatSessionProcessLedger(runtimeMachineState.value, payload.overlays);
  persistHistorySnapshot(nextSession.key);
}

function scheduleRunSettlementHistorySync(
  sessionKey: string,
  runId: string | null | undefined,
  options: {
    delayMs?: number;
    attempts?: number;
  } = {},
): void {
  if (!runId) return;
  if (historyMode.value !== 'history' || !selectedSession.value || selectedSession.value.key !== sessionKey) {
    return;
  }
  if (historyLoadingInitial.value || historyLoadingBefore.value || historyLoadingAfter.value) {
    return;
  }
  const delayMs = options.delayMs ?? 240;
  const attempts = options.attempts ?? 8;
  if (attempts <= 0) return;
  clearRunSettlementSyncTimer();
  runSettlementSyncTimer = window.setTimeout(async () => {
    runSettlementSyncTimer = null;
    if (historyMode.value !== 'history' || selectedSessionKey.value !== sessionKey) {
      return;
    }
    if (!isRunPendingSettlement(runId)) {
      return;
    }
    try {
      const payload = await fetchChatHistoryPage(sessionKey, {
        limit: CHAT_HISTORY_INITIAL_WINDOW_LIMIT,
        day: selectedHistoryDay.value,
      });
      if (selectedSessionKey.value !== sessionKey || historyMode.value !== 'history') {
        return;
      }
      applyLiveHistorySyncPayload(payload);
    } catch {}
    if (historyMode.value !== 'history' || selectedSessionKey.value !== sessionKey) {
      return;
    }
    if (!isRunPendingSettlement(runId)) {
      return;
    }
    if (attempts > 1) {
      scheduleRunSettlementHistorySync(sessionKey, runId, {
        delayMs: Math.min(delayMs + 80, 560),
        attempts: attempts - 1,
      });
    }
  }, delayMs);
}

function scheduleLiveHistorySync(sessionKey: string, delayMs = 140): void {
  if (historyMode.value !== 'history' || !selectedSession.value || selectedSession.value.key !== sessionKey) {
    return;
  }
  if (historyLoadingInitial.value || historyLoadingBefore.value || historyLoadingAfter.value) {
    return;
  }
  clearLiveHistorySyncTimer();
  liveHistorySyncTimer = window.setTimeout(async () => {
    liveHistorySyncTimer = null;
    if (historyMode.value !== 'history' || selectedSessionKey.value !== sessionKey) {
      return;
    }
    try {
      const payload = await fetchChatHistoryPage(sessionKey, {
        limit: CHAT_HISTORY_INITIAL_WINDOW_LIMIT,
        day: selectedHistoryDay.value,
      });
      if (selectedSessionKey.value !== sessionKey || historyMode.value !== 'history') {
        return;
      }
      applyLiveHistorySyncPayload(payload);
    } catch {}
  }, delayMs);
}

function scheduleDeferredInitialConversationLoad(sessionKey: string): void {
  clearDeferredInitialHistoryLoad();
  deferredInitialHistoryLoadTimer = window.setTimeout(() => {
    deferredInitialHistoryLoadTimer = null;
    if (selectedSessionKey.value !== sessionKey) {
      return;
    }
    void loadConversationWindowInitial(sessionKey, {
      limit: CHAT_HISTORY_INITIAL_WINDOW_LIMIT,
    });
  }, CHAT_HISTORY_DEFER_MS);
}

async function ensureSessionDatesLoaded(sessionKey: string, force = false): Promise<void> {
  if (!sessionKey) {
    return;
  }
  if (!force && historyDatesLoadedSessionKey.value === sessionKey) {
    return;
  }
  abortHistoryDatesRequest();
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  historyDatesRequestController = controller;
  historyDatesLoading.value = true;
  try {
    const payload = await fetchChatHistoryDates(sessionKey, controller?.signal);
    if (sessionKey !== selectedSessionKey.value) {
      return;
    }
    historyDays.value = payload.days;
    historyDatesLoadedSessionKey.value = sessionKey;
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    if (sessionKey === selectedSessionKey.value) {
      historyDays.value = [];
      historyDatesLoadedSessionKey.value = '';
    }
  } finally {
    if (historyDatesRequestController === controller) {
      historyDatesRequestController = null;
      historyDatesLoading.value = false;
    }
  }
}

async function loadConversationWindowInitial(
  sessionKey: string,
  options: { limit?: number; force?: boolean } = {},
): Promise<void> {
  const requestedLimit = options.limit ?? CHAT_HISTORY_INITIAL_WINDOW_LIMIT;
  const viewportAnchorMessageId = resolvePersistedViewportAnchorMessageId(sessionKey);
  const canReusePrimedWindow = (
    !options.force
    && !viewportAnchorMessageId
    && historyMode.value === 'history'
    && !selectedHistoryDay.value
    && !searchQuery.value.trim()
    && historyPayload.value?.session.key === sessionKey
    && historyPayload.value.messages.length >= requestedLimit
    && !historyLoadingBefore.value
    && !historyLoadingAfter.value
  );
  if (canReusePrimedWindow) {
    historyLoadingInitial.value = false;
    historyErrorMessage.value = '';
    return;
  }
  const loadVersion = ++historyLoadVersion;
  clearDeferredInitialHistoryLoad();
  abortReplaceHistoryRequest();
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  historyReplaceRequestController = controller;
  historyLoadingInitial.value = true;
  historyErrorMessage.value = '';
  try {
    const snapshot = historyMode.value === 'history' ? readChatRuntimeSnapshot(sessionKey) : null;
    const payload = historyMode.value === 'search' && searchQuery.value.trim()
      ? await searchChatHistory(sessionKey, {
        query: searchQuery.value.trim(),
        limit: requestedLimit,
        signal: controller?.signal,
      }).then((result): ChatHistoryPayload => buildSearchHistoryPayload(
        result,
        historyPayload.value?.observability || createEmptyRuntimeObservability(),
      ))
      : await fetchChatHistoryPage(sessionKey, {
        anchor: viewportAnchorMessageId || null,
        limit: requestedLimit,
        day: selectedHistoryDay.value,
        signal: controller?.signal,
      });
    if (loadVersion !== historyLoadVersion || sessionKey !== selectedSessionKey.value) {
      return;
    }
    const hydratedPayload = historyMode.value === 'history'
      ? hydrateHistoryPayloadFromSnapshot(payload, snapshot)
      : payload;
    armHistoryRenderStabilization();
    applyHistoryPagePayload(hydratedPayload, 'replace');
    const restoredRuntimeMachine = shouldRestoreRuntimeMachineStateFromSnapshot({
      sessionKey,
      snapshot,
      serverPayload: payload,
    })
      ? restoreRuntimeMachineStateFromSnapshot(sessionKey, snapshot)
      : null;
    if (restoredRuntimeMachine && historyMode.value === 'history') {
      runtimeMachineState.value = restoredRuntimeMachine;
    }
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    if (loadVersion !== historyLoadVersion || sessionKey !== selectedSessionKey.value) return;
    historyPayload.value = null;
    runtimeMachineState.value = resetChatSessionRuntimeMachine(sessionKey);
    historyPageInfo.value = { hasMoreBefore: false, beforeCursor: null, hasMoreAfter: false, afterCursor: null };
    historyDays.value = [];
    historyDatesLoadedSessionKey.value = '';
    historyErrorMessage.value = error instanceof Error ? error.message : text('读取对话失败。', 'Failed to load conversation.');
  } finally {
    if (historyReplaceRequestController === controller) {
      historyReplaceRequestController = null;
    }
    if (loadVersion === historyLoadVersion) {
      historyLoadingInitial.value = false;
    }
  }
}

async function loadConversationWindowAnchor(
  sessionKey: string,
  anchorMessageId: string,
  day?: string | null,
): Promise<void> {
  const loadVersion = ++historyLoadVersion;
  clearDeferredInitialHistoryLoad();
  abortReplaceHistoryRequest();
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  historyReplaceRequestController = controller;
  historyLoadingInitial.value = true;
  historyErrorMessage.value = '';
  try {
    const payload = await fetchChatHistoryPage(sessionKey, {
      anchor: anchorMessageId,
      limit: CHAT_HISTORY_PAGE_LIMIT,
      day: day || null,
      signal: controller?.signal,
    });
    if (loadVersion !== historyLoadVersion || sessionKey !== selectedSessionKey.value) {
      return;
    }
    armHistoryRenderStabilization();
    historyPayload.value = payload;
    historyPageInfo.value = payload.pageInfo;
    runtimeMachineState.value = {
      ...runtimeMachineState.value,
      sessionKey: payload.session.key,
    };
    runtimeMachineState.value = anchorChatSessionCanonicalMessageLedger(
      runtimeMachineState.value,
      payload.messages,
      payload.overlays,
    );
    rememberLastChatSessionKey(payload.session.key);
    rememberLastChatAgentId(payload.session.agentId);
    persistHistorySnapshot(payload.session.key);
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    if (loadVersion !== historyLoadVersion || sessionKey !== selectedSessionKey.value) return;
    historyErrorMessage.value = error instanceof Error ? error.message : text('跳转到指定位置失败。', 'Failed to jump to anchor.');
  } finally {
    if (historyReplaceRequestController === controller) {
      historyReplaceRequestController = null;
    }
    if (loadVersion === historyLoadVersion) {
      historyLoadingInitial.value = false;
    }
  }
}

async function loadMoreHistoryBefore(mode: 'browse' | 'autofill' | 'continuation' = 'browse'): Promise<void> {
  const sessionKey = selectedSessionKey.value;
  if (
    !sessionKey
    || historyBeforeMaterializeInFlight
    || historyLoadingBefore.value
    || historyLoadingInitial.value
    || !historyPageInfo.value.hasMoreBefore
    || !historyPageInfo.value.beforeCursor
  ) {
    return;
  }
  historyBeforeMaterializeInFlight = true;
  clearHistoryBeforeMaterializeReleaseTimer();
  const requestCursor = historyPageInfo.value.beforeCursor;
  if (requestCursor && exhaustedHistoryBeforeCursorBySession.get(sessionKey) === requestCursor) {
    historyPageInfo.value = { ...historyPageInfo.value, hasMoreBefore: false, beforeCursor: null };
    clearHistoryBeforePrefetch();
    releaseHistoryBeforeMaterializeLock();
    return;
  }
  const existingIds = new Set((historyPayload.value?.messages || []).map((message) => message.id));
  const useWideHistoryPage = historyMode.value === 'history' && !selectedHistoryDay.value;
  const requestLimit = mode === 'autofill' || mode === 'continuation' || useWideHistoryPage
    ? CHAT_HISTORY_AUTO_FILL_PAGE_LIMIT
    : CHAT_HISTORY_PAGE_LIMIT;
  const prefetchKey = currentHistoryBeforePrefetchKey(sessionKey);
  let prefetchedPayload = readMatchedHistoryBeforePrefetchPayload(prefetchKey);
  const shouldShowLoadingState = !prefetchedPayload;
  if (shouldShowLoadingState) {
    historyLoadingBefore.value = true;
  }
  let holdLockUntilRenderSettles = false;
  try {
    if (!prefetchedPayload && historyBeforePrefetchController) {
      prefetchedPayload = await waitForHistoryBeforePrefetch(prefetchKey);
    }
    if (!prefetchedPayload) {
      clearHistoryBeforePrefetch();
    }
    const payload = prefetchedPayload
      ? prefetchedPayload
      : historyMode.value === 'search' && searchQuery.value.trim()
        ? await searchChatHistory(sessionKey, {
          query: searchQuery.value.trim(),
          before: requestCursor,
          limit: requestLimit,
        }).then((result): ChatHistoryPayload => buildSearchHistoryPayload(
          result,
          historyPayload.value?.observability || createEmptyRuntimeObservability(),
        ))
        : await fetchChatHistoryPage(sessionKey, {
          before: requestCursor,
          limit: requestLimit,
          day: selectedHistoryDay.value,
        });
    prefetchedHistoryBefore.value = null;
    if (sessionKey !== selectedSessionKey.value) {
      return;
    }
    const noProgress = (
      !payload.messages.length
      || (requestCursor != null && payload.pageInfo.beforeCursor === requestCursor)
      || payload.messages.every((message) => existingIds.has(message.id))
    );
    if (noProgress) {
      if (requestCursor) {
        exhaustedHistoryBeforeCursorBySession.set(sessionKey, requestCursor);
      }
      historyPageInfo.value = { ...historyPageInfo.value, hasMoreBefore: false, beforeCursor: null };
      return;
    }
    armHistoryRenderStabilization();
    applyHistoryPagePayload(payload, 'prepend', {
      preserveAfterCursor: mode === 'autofill' && !viewingHistoricalPosition.value,
    });
    holdLockUntilRenderSettles = true;
    holdHistoryBeforeMaterializeLockUntilRenderSettles();
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('加载更早消息失败。', 'Failed to load older messages.'));
  } finally {
    if (!holdLockUntilRenderSettles) {
      releaseHistoryBeforeMaterializeLock();
    }
    if (shouldShowLoadingState) {
      historyLoadingBefore.value = false;
    }
    if (!holdLockUntilRenderSettles && mode !== 'autofill' && sessionKey === selectedSessionKey.value) {
      void scheduleHistoryBeforePrefetch(sessionKey, 0);
    }
  }
}

function prefetchMoreHistoryBefore(): void {
  const sessionKey = selectedSessionKey.value;
  if (!sessionKey || historyLoadingInitial.value || historyLoadingBefore.value || historyBeforeMaterializeInFlight) {
    return;
  }
  void scheduleHistoryBeforePrefetch(sessionKey, 0);
}

async function loadMoreHistoryAfter(): Promise<void> {
  const sessionKey = selectedSessionKey.value;
  if (
    !sessionKey
    || historyLoadingAfter.value
    || historyLoadingInitial.value
    || !historyPageInfo.value.hasMoreAfter
    || !historyPageInfo.value.afterCursor
  ) {
    return;
  }
  const requestCursor = historyPageInfo.value.afterCursor;
  if (requestCursor && exhaustedHistoryAfterCursorBySession.get(sessionKey) === requestCursor) {
    historyPageInfo.value = { ...historyPageInfo.value, hasMoreAfter: false, afterCursor: null };
    clearHistoryAfterPrefetch();
    return;
  }
  const existingIds = new Set(runtimeMachineState.value.canonicalMessageLedger.map((message) => message.id));
  const prefetchKey = currentHistoryAfterPrefetchKey(sessionKey);
  let prefetchedPayload = readMatchedHistoryAfterPrefetchPayload(prefetchKey);
  const shouldShowLoadingState = !prefetchedPayload;
  if (shouldShowLoadingState) {
    historyLoadingAfter.value = true;
  }
  try {
    if (!prefetchedPayload && historyAfterPrefetchController) {
      prefetchedPayload = await waitForHistoryAfterPrefetch(prefetchKey);
    }
    if (!prefetchedPayload) {
      clearHistoryAfterPrefetch();
    }
    const payload = prefetchedPayload
      ? prefetchedPayload
      : await fetchChatHistoryPage(sessionKey, {
        after: requestCursor,
        limit: CHAT_HISTORY_PAGE_LIMIT,
        day: selectedHistoryDay.value,
      });
    prefetchedHistoryAfter.value = null;
    if (sessionKey !== selectedSessionKey.value) {
      return;
    }
    const noProgress = (
      !payload.messages.length
      || (requestCursor != null && payload.pageInfo.afterCursor === requestCursor)
      || payload.messages.every((message) => existingIds.has(message.id))
    );
    if (noProgress) {
      if (requestCursor) {
        exhaustedHistoryAfterCursorBySession.set(sessionKey, requestCursor);
      }
      historyPageInfo.value = { ...historyPageInfo.value, hasMoreAfter: false, afterCursor: null };
      clearHistoryAfterPrefetch();
      return;
    }
    armHistoryRenderStabilization();
    applyHistoryPagePayloadAppend(payload);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('加载更新消息失败。', 'Failed to load newer messages.'));
  } finally {
    if (shouldShowLoadingState) {
      historyLoadingAfter.value = false;
    }
  }
}

function applyHistoryPagePayloadAppend(payload: ChatHistoryPayload): void {
  historyPrependAnchorMessageId.value = null;
  historyPayload.value = payload;
  historyPageInfo.value = {
    ...historyPageInfo.value,
    hasMoreAfter: payload.pageInfo.hasMoreAfter,
    afterCursor: payload.pageInfo.afterCursor,
  };
  runtimeMachineState.value = { ...runtimeMachineState.value, sessionKey: payload.session.key };
  const result = appendChatSessionCanonicalMessageLedger(runtimeMachineState.value, payload.messages, payload.overlays);
  runtimeMachineState.value = result.state;
  if (result.eviction.evictedTop > 0) {
    historyPageInfo.value = { ...historyPageInfo.value, hasMoreBefore: true };
  }
  persistHistorySnapshot(payload.session.key);
}

function prefetchMoreHistoryAfter(): void {
  const sessionKey = selectedSessionKey.value;
  if (!sessionKey || historyLoadingInitial.value || historyLoadingAfter.value || historyMode.value !== 'history') {
    return;
  }
  void scheduleHistoryAfterPrefetch(sessionKey, 0);
}

async function jumpToLive(): Promise<void> {
  const sessionKey = selectedSessionKey.value;
  if (!sessionKey) return;
  clearDeferredInitialHistoryLoad();
  abortReplaceHistoryRequest();
  clearHistoryBeforePrefetch();
  clearHistoryAfterPrefetch();
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  historyReplaceRequestController = controller;
  selectedHistoryDay.value = null;
  searchQuery.value = '';
  historyMode.value = 'history';
  historyLoadingInitial.value = true;
  try {
    const payload = await fetchChatHistoryPage(sessionKey, {
      limit: CHAT_HISTORY_INITIAL_WINDOW_LIMIT,
      signal: controller?.signal,
    });
    if (sessionKey !== selectedSessionKey.value) return;
    applyHistoryPagePayload(payload, 'replace');
    latestJumpToken.value += 1;
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    setNotice('error', error instanceof Error ? error.message : text('跳转到最新失败。', 'Failed to jump to latest.'));
  } finally {
    if (historyReplaceRequestController === controller) {
      historyReplaceRequestController = null;
    }
    historyLoadingInitial.value = false;
  }
}

const viewingHistoricalPosition = computed(() => historyPageInfo.value.hasMoreAfter);

function toggleRecordBrowser(): void {
  if (!selectedSession.value) {
    return;
  }
  const nextOpen = !recordBrowserOpen.value;
  recordBrowserOpen.value = nextOpen;
  if (nextOpen && !historyDatesLoading.value) {
    void ensureSessionDatesLoaded(selectedSession.value.key);
  }
}

function closeRecordBrowser(): void {
  abortRecordBrowserSearch();
  recordBrowserOpen.value = false;
}

function clearRecordBrowserState(): void {
  abortRecordBrowserSearch();
  recordBrowserQuery.value = '';
  recordBrowserRoleFilter.value = 'all';
  recordBrowserContentFilter.value = 'all';
  recordBrowserSelectedDay.value = null;
  recordBrowserErrorMessage.value = '';
  recordBrowserClearResults();
}

function updateRecordBrowserSelectedDay(nextDay: string | null): void {
  recordBrowserSelectedDay.value = nextDay;
  const hasCriteria = Boolean(
    normalizeChatRecordBrowserQuery(recordBrowserQuery.value)
    || recordBrowserRoleFilter.value !== 'all'
    || recordBrowserContentFilter.value !== 'all'
    || recordBrowserSelectedDay.value,
  );
  if (hasCriteria) {
    void runRecordBrowserSearch();
  }
}

function abortRecordBrowserSearch(): void {
  recordBrowserSearchVersion += 1;
  if (recordBrowserSearchController) {
    recordBrowserSearchController.abort();
    recordBrowserSearchController = null;
  }
  recordBrowserLoading.value = false;
}

async function runRecordBrowserSearch(): Promise<void> {
  const sessionKey = selectedSessionKey.value;
  const query = normalizeChatRecordBrowserQuery(recordBrowserQuery.value);
  abortRecordBrowserSearch();
  const requestVersion = ++recordBrowserSearchVersion;
  if (!sessionKey) {
    return;
  }
  const hasCriteria = Boolean(query || recordBrowserRoleFilter.value !== 'all' || recordBrowserContentFilter.value !== 'all' || recordBrowserSelectedDay.value);
  if (!hasCriteria) {
    recordBrowserQuery.value = '';
    recordBrowserErrorMessage.value = '';
    recordBrowserClearResults();
    return;
  }
  recordBrowserQuery.value = query;
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  recordBrowserSearchController = controller;
  recordBrowserLoading.value = true;
  recordBrowserErrorMessage.value = '';
  try {
    const payload = await searchChatHistory(sessionKey, {
      query,
      role: recordBrowserRoleFilter.value,
      content: recordBrowserContentFilter.value,
      day: recordBrowserSelectedDay.value,
      limit: 50,
      signal: controller?.signal,
    });
    if (selectedSessionKey.value !== sessionKey || recordBrowserSearchVersion !== requestVersion) {
      return;
    }
    recordBrowserSetPayload(payload);
    recordBrowserSelectResult(payload.matches[0]?.messageId || null);
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    if (selectedSessionKey.value !== sessionKey || recordBrowserSearchVersion !== requestVersion) {
      return;
    }
    recordBrowserClearResults();
    recordBrowserErrorMessage.value = error instanceof Error
      ? error.message
      : text('读取聊天记录失败。', 'Failed to load chat records.');
  } finally {
    if (selectedSessionKey.value === sessionKey && recordBrowserSearchVersion === requestVersion) {
      recordBrowserLoading.value = false;
    }
    if (recordBrowserSearchController === controller) {
      recordBrowserSearchController = null;
    }
  }
}

async function handleRecordBrowserJump(messageId: string): Promise<void> {
  recordBrowserSelectResult(messageId);
  closeRecordBrowser();
  const matchedDay = recordBrowserVisibleMatches.value.find((match) => match.messageId === messageId)?.day || null;
  await handleSearchResultJump(messageId, matchedDay);
}


async function handleRecordBrowserDayJump(day: string): Promise<void> {
  const sessionKey = selectedSessionKey.value;
  if (!sessionKey) {
    return;
  }
  if (!historyDatesLoadedSessionKey.value || historyDatesLoadedSessionKey.value !== sessionKey) {
    await ensureSessionDatesLoaded(sessionKey);
  }
  const bucket = historyDays.value.find((entry) => entry.day === day);
  if (!bucket) {
    setNotice('error', text('这一天没有可跳转的聊天记录。', 'No jump target was found for this day.'));
    return;
  }
  closeRecordBrowser();
  historyMode.value = 'history';
  selectedHistoryDay.value = day;
  await loadConversationWindowAnchor(sessionKey, bucket.firstMessageId, day);
  await revealConversationMessage(bucket.firstMessageId);
}

async function handleSearchResultJump(messageId: string, day: string | null = null): Promise<void> {
  const sessionKey = selectedSessionKey.value;
  if (!sessionKey) return;
  historyMode.value = 'history';
  const alreadyVisible = currentConversationWindowIncludesMessage(messageId, day);
  if (!alreadyVisible) {
    selectedHistoryDay.value = day;
    await loadConversationWindowAnchor(sessionKey, messageId, day);
  }
  const revealed = await revealConversationMessage(messageId);
  if (!revealed && alreadyVisible) {
    selectedHistoryDay.value = day;
    await loadConversationWindowAnchor(sessionKey, messageId, day);
    await revealConversationMessage(messageId);
  }
}

function applySearch(): void {
  selectedHistoryDay.value = null;
  historyMode.value = searchQuery.value.trim() ? 'search' : 'history';
  if (selectedSessionKey.value) {
    void loadConversationWindowInitial(selectedSessionKey.value);
  }
}

function applyDayFilter(day: string | null): void {
  selectedHistoryDay.value = day;
  if (day) {
    searchQuery.value = '';
    historyMode.value = 'history';
  }
  const sessionKey = selectedSessionKey.value;
  if (!sessionKey) return;
  if (!day) {
    // Clearing day filter — jump to live
    void jumpToLive();
    return;
  }
  // Find the date bucket to get the anchor message
  const bucket = historyDays.value.find((d) => d.day === day);
  if (bucket) {
    void loadConversationWindowAnchor(sessionKey, bucket.firstMessageId, day);
  } else {
    void ensureSessionDatesLoaded(sessionKey).then(() => {
      if (selectedSessionKey.value !== sessionKey || selectedHistoryDay.value !== day) {
        return;
      }
      const refreshedBucket = historyDays.value.find((d) => d.day === day);
      if (refreshedBucket) {
        void loadConversationWindowAnchor(sessionKey, refreshedBucket.firstMessageId, day);
        return;
      }
      void loadConversationWindowInitial(sessionKey);
    });
  }
}

function clearHistoryFilters(): void {
  searchQuery.value = '';
  selectedHistoryDay.value = null;
  historyMode.value = 'history';
  if (selectedSessionKey.value) {
    void jumpToLive();
  }
}

function resolveFallbackSessionKey(): string {
  return resolveRuntimeFallbackSessionKey({
    availableSessions: availableSessionsForCurrentMode(),
    storedSessionKey: readLastChatSessionKey(),
  });
}

function resolveBootstrapSessionKey(): string {
  return routeSessionKey.value || readLastChatSessionKey() || '';
}

function selectSessionKeyLocally(nextKey: string): void {
  selectedSessionKey.value = nextKey;
  if (nextKey) {
    rememberLastChatSessionKey(nextKey);
    rememberLastChatAgentId(deriveAgentIdFromChatSessionKey(nextKey));
  }
}

function primeConversationForImmediateSessionSwitch(sessionKey: string): void {
  if (!sessionKey || historyPayload.value?.session.key === sessionKey) {
    return;
  }
  if (primeConversationStateFromSnapshot(sessionKey)) {
    return;
  }
  const targetSession = sessionRows.value.find((row) => row.key === sessionKey) || null;
  if (targetSession) {
    primeEmptyConversationShell(targetSession, targetSession.runtime);
    return;
  }
  historyPayload.value = null;
  runtimeMachineState.value = resetChatSessionRuntimeMachine(sessionKey);
}

function buildChatRoute(sessionKey: string | null, mode: 'chat' | 'inspect' = props.shellMode): { path: string; query?: Record<string, string> } {
  return buildRuntimeChatRoute({
    currentPath: route.path,
    shellMode: mode,
    sessionKey,
  });
}

function openSession(sessionKey: string, mode: 'chat' | 'inspect' = props.shellMode): void {
  if (sessionKey !== selectedSessionKey.value) {
    primeConversationForImmediateSessionSwitch(sessionKey);
  }
  selectSessionKeyLocally(sessionKey);
  mobileSessionDrawerOpen.value = false;
  const target = buildChatRoute(sessionKey, mode);
  if (route.path === target.path && JSON.stringify(route.query) === JSON.stringify(target.query || {})) return;
  router.push(target);
}

function closeInspectorDrawer(): void {
  inspectorDrawerOpen.value = false;
  if (!inspectPinned.value) return;
  if (selectedSession.value?.kind === 'studio_managed') {
    router.push(buildChatRoute(selectedSession.value.key, 'chat'));
    return;
  }
  router.push('/chat');
}

function handleInspectorDrawerOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    if (!chatShellCompactViewport.value) {
      inspectorDrawerOpen.value = true;
      return;
    }
    closeInspectorDrawer();
  }
}

function handleInspectorInteractOutside(event: Event): void {
  if (!chatShellCompactViewport.value) {
    event.preventDefault();
  }
}

function toggleInspectRoute(): void {
  if (inspectPinned.value) {
    closeInspectorDrawer();
    return;
  }
  if (selectedSession.value) {
    router.push(buildChatRoute(selectedSession.value.key, 'inspect'));
    return;
  }
  router.push('/chat/workbench');
}

function selectSessionFromMobile(sessionKey: string): void {
  mobileSessionDrawerOpen.value = false;
  openSession(sessionKey);
}

function openNewChatFromMobile(): void {
  mobileSessionDrawerOpen.value = false;
  newChatOpen.value = true;
}

function toggleInspectFromMobile(): void {
  mobileSessionDrawerOpen.value = false;
  toggleInspectRoute();
}

async function createSessionForAgent(agentId: string): Promise<string | null> {
  sessionCreating.value = true;
  clearNotice();
  try {
    const payload = await createChatSession(agentId, {});
    const session = {
      ...payload.session,
      runtime: payload.runtime || payload.session.runtime,
    };
    ensureSessionRow(session);
    protectSessionRow(session.key);
    armSessionSendGuard(session.key);
    primeEmptyConversationShell(session, session.runtime);
    newChatOpen.value = false;
    openSession(session.key, 'chat');
    void loadSessions();
    return session.key;
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('创建会话失败。', 'Failed to create chat.'));
    return null;
  } finally {
    sessionCreating.value = false;
  }
}

function resolveSlashCommandAgentId(): string | null {
  return selectedSession.value?.agentId
    || readLastChatAgentId()
    || agentRows.value[0]?.id
    || null;
}

function slashLocalActionSupportsArgs(action: StudioSlashCommandDef['localAction']): boolean {
  return action === 'help'
    || action === 'forwardSlash'
    || action === 'allowlist'
    || action === 'approve'
    || action === 'queue'
    || action === 'skill'
    || action === 'bash'
    || action === 'acp'
    || action === 'debug'
    || action === 'context'
    || action === 'session'
    || action === 'focus'
    || action === 'compact'
    || action === 'tts'
    || action === 'config'
    || action === 'plugins'
    || action === 'mcp'
    || action === 'subagents'
    || action === 'model'
    || action === 'think'
    || action === 'reasoning'
    || action === 'verbose'
    || action === 'fast'
    || action === 'usage'
    || action === 'elevated'
    || action === 'exec'
    || action === 'exportSession'
    || action === 'activation'
    || action === 'send'
    || action === 'kill'
    || action === 'steer'
    || action === 'redirect';
}

async function executeLocalSlashCommand(commandText: string): Promise<boolean> {
  const parsed = parseStudioSlashCommand(commandText);
  if (
    !parsed
    || (parsed.command.executeMode !== 'local' && parsed.command.executeMode !== 'hybrid')
    || !parsed.command.localAction
  ) {
    return false;
  }
  const sessionKey = selectedSession.value?.key || selectedSessionKey.value;
  const startedAt = new Date().toISOString();

  if (!slashLocalActionSupportsArgs(parsed.command.localAction) && parsed.args.trim()) {
    setNotice(
      'error',
      text(
        `/${parsed.command.name} 当前不支持额外参数。`,
        `/${parsed.command.name} does not currently accept extra arguments here.`,
      ),
    );
    if (sessionKey) {
      setSlashFeedbackState(sessionKey, buildSlashFeedback(
        sessionKey,
        parsed.command.name,
        parsed.args,
        'local',
        'error',
        {
          startedAt,
          detail: text(
            `/${parsed.command.name} 当前不支持额外参数。`,
            `/${parsed.command.name} does not currently accept extra arguments here.`,
          ),
        },
      ));
    }
    return true;
  }

  try {
    if (
      sessionKey
      && parsed.command.localAction !== 'help'
      && parsed.command.localAction !== 'status'
      && parsed.command.localAction !== 'tasks'
      && parsed.command.localAction !== 'queue'
      && parsed.command.localAction !== 'skill'
      && parsed.command.localAction !== 'allowlist'
      && parsed.command.localAction !== 'forwardSlash'
      && parsed.command.localAction !== 'acp'
      && parsed.command.localAction !== 'debug'
      && parsed.command.localAction !== 'bash'
      && parsed.command.localAction !== 'restart'
      && parsed.command.localAction !== 'context'
      && parsed.command.localAction !== 'config'
      && parsed.command.localAction !== 'plugins'
      && parsed.command.localAction !== 'mcp'
      && parsed.command.localAction !== 'subagents'
      && parsed.command.localAction !== 'exportSession'
    ) {
      setSlashFeedbackState(sessionKey, buildSlashFeedback(
        sessionKey,
        parsed.command.name,
        parsed.args,
        'local',
        'running',
        { startedAt },
      ));
    }

    switch (parsed.command.localAction) {
      case 'stop':
        if (await abortCurrentRun()) {
          if (sessionKey) {
            setSlashFeedbackState(sessionKey, buildSlashFeedback(
              sessionKey,
              parsed.command.name,
              parsed.args,
              'local',
              'completed',
              {
                startedAt,
                detail: text('当前运行停止请求已发出。', 'The stop request was sent for the active run.'),
              },
            ));
          }
        } else if (sessionKey) {
          setSlashFeedbackState(sessionKey, buildSlashFeedback(
            sessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            'error',
            {
              startedAt,
              detail: text('当前没有可停止的运行，或停止请求失败。', 'There was no active run to stop, or the stop request failed.'),
            },
          ));
        }
        return true;
      case 'help':
        openSlashHelpDialog(parsed.args);
        if (sessionKey) {
          setSlashFeedbackState(sessionKey, buildSlashFeedback(
            sessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            'completed',
            {
              startedAt,
              detail: text('本地命令帮助面板已打开。', 'The local slash command help panel is open.'),
            },
          ));
        }
        return true;
      case 'status':
        openSlashStatusDialog();
        if (sessionKey) {
          setSlashFeedbackState(sessionKey, buildSlashFeedback(
            sessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            'completed',
            {
              startedAt,
              detail: text('当前会话状态面板已打开。', 'The local session status panel is open.'),
            },
          ));
        }
        return true;
      case 'reset':
      case 'clear':
        if (await resetCurrentSession()) {
          if (sessionKey) {
            setSlashFeedbackState(sessionKey, buildSlashFeedback(
              sessionKey,
              parsed.command.name,
              parsed.args,
              'local',
              'completed',
              {
                startedAt,
                detail: text('当前 Session 已重置。', 'The current session was reset.'),
              },
            ));
          }
        } else if (sessionKey) {
          setSlashFeedbackState(sessionKey, buildSlashFeedback(
            sessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            'error',
            {
              startedAt,
              detail: text('Session 重置失败。', 'The session reset failed.'),
            },
          ));
        }
        return true;
      case 'new': {
        const agentId = resolveSlashCommandAgentId();
        if (!agentId) {
          setNotice(
            'error',
            text('当前无法确定用于新会话的 Agent。', 'Unable to determine which agent to use for the new session.'),
          );
          if (sessionKey) {
            setSlashFeedbackState(sessionKey, buildSlashFeedback(
              sessionKey,
              parsed.command.name,
              parsed.args,
              'local',
              'error',
              {
                startedAt,
                detail: text('当前无法确定用于新会话的 Agent。', 'Unable to determine which agent to use for the new session.'),
              },
            ));
          }
          return true;
        }
        const createdSessionKey = await createSessionForAgent(agentId);
        if (createdSessionKey) {
          setSlashFeedbackState(createdSessionKey, buildSlashFeedback(
            createdSessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            'completed',
            {
              startedAt,
              detail: text('新的聊天会话已经创建。', 'A new chat session is ready.'),
            },
          ));
        } else if (sessionKey) {
          setSlashFeedbackState(sessionKey, buildSlashFeedback(
            sessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            'error',
            {
              startedAt,
              detail: text('新会话创建失败。', 'Failed to create a new chat session.'),
            },
          ));
        }
        return true;
      }
      case 'compact':
      case 'forwardSlash':
      case 'skill':
      case 'tasks':
      case 'queue':
      case 'context':
      case 'tools':
      case 'tts':
      case 'allowlist':
      case 'approve':
      case 'whoami':
      case 'session':
      case 'focus':
      case 'unfocus':
      case 'config':
      case 'plugins':
      case 'mcp':
      case 'subagents':
      case 'acp':
      case 'model':
      case 'think':
      case 'reasoning':
      case 'verbose':
      case 'fast':
      case 'usage':
      case 'elevated':
      case 'exec':
      case 'activation':
      case 'send':
      case 'models':
      case 'agents':
      case 'debug':
      case 'kill':
      case 'steer':
      case 'redirect': {
        const { executeStudioSlashLocalGatewayCommand } = await import('./slash-local-executor');
        const result = await executeStudioSlashLocalGatewayCommand(
          { request: (method, params) => requestStudioSlashGatewayChat(sessionKey, method, params) },
          sessionKey,
          parsed.command.name,
          parsed.args,
          {
            usage: historyPayload.value?.observability.usage || null,
            modelCandidates: slashArgOptionsOverrides.value.model || [],
            activeRunId: activeRuntime.value?.activeRunId || null,
            messageCount: renderMessages.value.length,
            queueLength: selectedQueuedItems.value.length,
            realtimeReady: selectedSessionRealtimeReady.value,
            transportMode: getStudioRealtimeTransport(),
            exposureKind: getStudioExposureKind(),
          },
        );
        if (!result) {
          return false;
        }

        if (result.refresh === 'conversation') {
          await loadSessions();
          if (selectedSessionKey.value === sessionKey) {
            await loadConversationWindowInitial(sessionKey);
            await loadSessionSurfaceState(sessionKey);
          }
        } else if (result.refresh === 'sessions') {
          await loadSessions();
        }

        if (result.phase === 'error') {
          setNotice('error', text(result.detail.zh, result.detail.en));
        }

        setSlashFeedbackState(sessionKey, buildSlashFeedback(
          sessionKey,
          parsed.command.name,
          parsed.args,
          'local',
          result.phase,
          {
            startedAt,
            runId: result.runId || null,
            detail: text(result.detail.zh, result.detail.en),
          },
        ));
        return true;
      }
      case 'bash': {
        const { resolveStudioBashSlashHandling } = await import('./slash-bash-policy');
        const decision = resolveStudioBashSlashHandling({
          args: parsed.args,
          globalHostManagementExecEnabled: globalHostManagementExecEnabled.value,
          sessionHostManagementExecEnabled: selectedSessionControls.value.allowHostManagementExec,
        });
        if (decision.kind === 'fallback') {
          return false;
        }
        if (decision.kind === 'blocked') {
          setNotice('error', text(decision.detail.zh, decision.detail.en));
        }
        if (sessionKey) {
          setSlashFeedbackState(sessionKey, buildSlashFeedback(
            sessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            decision.kind === 'blocked' ? 'error' : 'completed',
            {
              startedAt,
              detail: text(decision.detail.zh, decision.detail.en),
            },
          ));
        }
        return true;
      }
      case 'restart': {
        const { resolveStudioBashSlashHandling } = await import('./slash-bash-policy');
        const decision = resolveStudioBashSlashHandling({
          args: 'openclaw gateway restart',
          globalHostManagementExecEnabled: globalHostManagementExecEnabled.value,
          sessionHostManagementExecEnabled: selectedSessionControls.value.allowHostManagementExec,
        });
        if (decision.kind === 'fallback') {
          return false;
        }
        setNotice('error', text(decision.detail.zh, decision.detail.en));
        if (sessionKey) {
          setSlashFeedbackState(sessionKey, buildSlashFeedback(
            sessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            'error',
            {
              startedAt,
              detail: text(decision.detail.zh, decision.detail.en),
            },
          ));
        }
        return true;
      }
      case 'exportSession': {
        if (parsed.args.trim()) {
          return false;
        }
        if (!selectedSession.value) {
          if (sessionKey) {
            setSlashFeedbackState(sessionKey, buildSlashFeedback(
              sessionKey,
              parsed.command.name,
              parsed.args,
              'local',
              'error',
              {
                startedAt,
                detail: text('当前没有可导出的会话。', 'There is no active session to export.'),
              },
            ));
          }
          return true;
        }
        const { buildSlashSessionExportDocument } = await import('./slash-export-session');
        const exportDocument = buildSlashSessionExportDocument({
          locale: locale.value,
          session: selectedSession.value,
          messages: renderMessages.value,
          exportedAt: new Date().toISOString(),
          title: conversationTitle.value,
        });
        downloadBlob(
          new Blob([exportDocument.html], { type: 'text/html;charset=utf-8' }),
          exportDocument.filename,
        );
        setNotice(
          'success',
          text(
            `已导出当前可见会话为 ${exportDocument.filename}。`,
            `Exported the current visible session as ${exportDocument.filename}.`,
          ),
        );
        if (sessionKey) {
          setSlashFeedbackState(sessionKey, buildSlashFeedback(
            sessionKey,
            parsed.command.name,
            parsed.args,
            'local',
            'completed',
            {
              startedAt,
              detail: text(
                `已下载当前可见会话 HTML 导出：${exportDocument.filename}。`,
                `Downloaded the visible session HTML export: ${exportDocument.filename}.`,
              ),
            },
          ));
        }
        return true;
      }
      default:
        return false;
    }
  } catch (error) {
    if (sessionKey) {
      setSlashFeedbackState(sessionKey, buildSlashFeedback(
        sessionKey,
        parsed.command.name,
        parsed.args,
        'local',
        'error',
        {
          startedAt,
          detail: error instanceof Error ? error.message : text('本地命令执行失败。', 'The local command failed.'),
        },
      ));
    }
    throw error;
  }
}

function generateSlashGatewayRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `studio-slash-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function dispatchSlashCommandViaBackend(commandText: string): Promise<boolean> {
  const session = selectedSession.value;
  const sessionKey = session?.key || selectedSessionKey.value;
  const startedAt = new Date().toISOString();

  if (!sessionKey || !session) {
    setNotice(
      'error',
      text(
        '当前没有可用于执行斜杠命令的会话。',
        'There is no active chat session available to execute this slash command.',
      ),
    );
    return true;
  }

  if (accessError.value) {
    setNotice('error', accessError.value);
    setSlashFeedbackFromCommand(sessionKey, commandText, 'send', 'error', {
      startedAt,
      detail: accessError.value,
    });
    return true;
  }

  if (!session.permissions.canSend) {
    const detail = text(
      '当前会话不可发送，斜杠命令未执行。',
      'This session cannot send right now, so the slash command was not executed.',
    );
    setNotice('error', detail);
    setSlashFeedbackFromCommand(sessionKey, commandText, 'send', 'error', {
      startedAt,
      detail,
    });
    return true;
  }

  const requestId = generateSlashGatewayRequestId();
  try {
    const response = await requestStudioSlashGatewayChat<{ runId?: string | null }>(
      sessionKey,
      'chat.send',
      {
        sessionKey,
        message: commandText,
        deliver: true,
        idempotencyKey: requestId,
      },
    );
    const runId = typeof response?.runId === 'string' ? response.runId.trim() : '';
    setSlashFeedbackFromCommand(
      sessionKey,
      commandText,
      'send',
      runId ? 'accepted' : 'completed',
      {
        startedAt,
        requestId,
        runId: runId || null,
        detail: text(
          '命令已通过 Studio 后端提交，等待宿主处理。',
          'The command was submitted through the Studio backend and is waiting for the host.',
        ),
      },
    );
    return true;
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : text('斜杠命令提交失败。', 'Failed to submit the slash command.');
    setNotice('error', detail);
    setSlashFeedbackFromCommand(sessionKey, commandText, 'send', 'error', {
      startedAt,
      requestId,
      detail,
    });
    return true;
  }
}

async function sendMessage(documentOverride?: ChatComposerDocument): Promise<void> {
  if (sendBusy.value) {
    return;
  }
  const session = selectedSession.value;
  let sessionKeyForRollback = session?.key || selectedSessionKey.value || null;
  let parsedSlashCommandForRollback: ReturnType<typeof parseStudioSlashCommand> = null;
  let rollbackHistoryPayload: ChatHistoryPayload | null = null;
  let rollbackRuntimeMachineState: ChatSessionRuntimeMachineState | null = null;
  let rollbackSessionRow: ChatSessionRow | null = null;
  let rollbackComposerDocument: ChatComposerDocument | null = null;
  let rollbackComposerAttachments: ComposerImageAttachment[] | null = null;
  let rollbackOptimisticQueueItem: { sessionKey: string; itemId: string } | null = null;
  let directSendPendingRunId: string | null = null;
  let requestId: string | null = null;
  sendBusy.value = true;
  clearNotice();
  try {
    const documentValue = normalizeComposerDocument(documentOverride || composerDocument.value);
    composerDocument.value = documentValue;
    const attachments = composerAttachments.value.slice();
    if (!normalizedComposerDocumentHasContent(documentValue) && attachments.length === 0) {
      return;
    }
    if (!areComposerAttachmentsReady(attachments)) {
      setNotice('error', text('仍有附件上传中或上传失败，请处理后再发送。', 'Some attachments are still uploading or failed. Resolve them before sending.'));
      return;
    }

    const slashCommandText = readNormalizedSlashCommandText(documentValue);
    const parsedSlashCommand = slashCommandText ? parseStudioSlashCommand(slashCommandText) : null;
    parsedSlashCommandForRollback = parsedSlashCommand;
    if (parsedSlashCommand && attachments.length > 0) {
      setNotice(
        'error',
        text(
          '第一版 slash 命令暂不支持与附件一起发送，请先移除附件。',
          'Slash commands do not yet support attachments in Studio. Remove attachments first.',
        ),
      );
      return;
    }
    if (parsedSlashCommand?.command.executeMode === 'local') {
      const handled = await executeLocalSlashCommand(slashCommandText);
      if (handled) {
        composerDocument.value = createEmptyComposerDocument();
        composerAttachments.value = [];
      } else {
        const detail = text(
          'Studio 尚未接通这个本地斜杠命令，请更新 Studio 或稍后重试。',
          'Studio has not wired this local slash command yet. Update Studio or try again later.',
        );
        setNotice('error', detail);
        if (session?.key) {
          setSlashFeedbackFromCommand(session.key, slashCommandText, 'local', 'error', {
            startedAt: new Date().toISOString(),
            detail,
          });
        }
      }
      return;
    }
    if (parsedSlashCommand?.command.executeMode === 'hybrid') {
      const handled = await executeLocalSlashCommand(slashCommandText);
      if (handled) {
        composerDocument.value = createEmptyComposerDocument();
        composerAttachments.value = [];
        return;
      }
    }

    const shouldForwardSlashViaBackend = Boolean(
      slashCommandText.startsWith('/')
      && (!parsedSlashCommand || parsedSlashCommand.command.executeMode === 'hybrid'),
    );
    if (shouldForwardSlashViaBackend) {
      const forwarded = await dispatchSlashCommandViaBackend(slashCommandText);
      if (forwarded) {
        composerDocument.value = createEmptyComposerDocument();
        composerAttachments.value = [];
        return;
      }
    }

    if (!session?.permissions.canSend || accessError.value || !selectedSessionRealtimeReady.value) {
      if (parsedSlashCommand) {
        if (accessError.value) {
          setNotice('error', accessError.value);
        } else if (!session?.permissions.canSend) {
          setNotice(
            'error',
            text(
              '当前会话不可发送，斜杠命令未执行。',
              'This session cannot send right now, so the slash command was not executed.',
            ),
          );
        } else {
          setNotice(
            'error',
            text(
              '该斜杠命令依赖聊天发送链路，当前尚未就绪。',
              'This slash command depends on the chat transport, which is not ready yet.',
            ),
          );
        }
      }
      return;
    }
    const sessionKey = session.key;
    sessionKeyForRollback = sessionKey;

    requestId = `ui-${Date.now()}`;
    const sendPlan = buildComposerSendPlan({
      document: documentValue,
      attachments,
      clientRequestId: requestId,
      normalizedDocument: true,
    });

    const createdAt = new Date().toISOString();
    const sendPayload = sendPlan.payload;
    const hadActiveRun = Boolean(activeRuntime.value?.activeRunId) || hasSessionRunLocallyActive(sessionKey);
    if (hadActiveRun) {
      const optimisticQueueItem = buildOptimisticQueuedMessageItem({
        sessionKey,
        requestId,
        payload: sendPayload,
        previewText: sendPlan.previewText,
        createdAt,
      });
      rollbackComposerDocument = documentValue;
      rollbackComposerAttachments = attachments.map((attachment) => ({ ...attachment }));
      rollbackOptimisticQueueItem = {
        sessionKey,
        itemId: optimisticQueueItem.id,
      };
      applyOptimisticQueueItem(sessionKey, optimisticQueueItem);
      composerDocument.value = createEmptyComposerDocument();
      composerAttachments.value = [];
      const queuedSendPayload: ChatSendRequest = {
        ...sendPayload,
        flushWhenIdle: true,
      };
      const queuePayload: ChatQueuePayload = await enqueueChatMessage(sessionKey, queuedSendPayload);
      applyQueueState(sessionKey, queuePayload.items);
      rollbackComposerDocument = null;
      rollbackComposerAttachments = null;
      rollbackOptimisticQueueItem = null;
      if (parsedSlashCommand) {
        trackQueuedSlashCommand(sessionKey, requestId, slashCommandText, queuePayload.items);
        setSlashFeedbackFromCommand(sessionKey, slashCommandText, 'send', 'accepted', {
          startedAt: createdAt,
          requestId,
          detail: text(
            '命令已进入待发送队列，当前运行结束后会自动发送。',
            'The command is queued and will be sent automatically after the current run settles.',
          ),
        });
      }
      setNotice(
        'success',
        text(
          '消息已加入待发送队列，当前运行结束后会自动发送。',
          'Message queued. It will send automatically after the current run settles.',
        ),
      );
      return;
    }

    rollbackHistoryPayload = historyPayload.value?.session.key === sessionKey
      ? JSON.parse(JSON.stringify(historyPayload.value)) as ChatHistoryPayload
      : null;
    rollbackRuntimeMachineState = JSON.parse(JSON.stringify(runtimeMachineState.value)) as ChatSessionRuntimeMachineState;
    rollbackSessionRow = JSON.parse(JSON.stringify(
      sessionRows.value.find((row) => row.key === sessionKey) || null,
    )) as ChatSessionRow | null;
    rollbackComposerDocument = documentValue;
    rollbackComposerAttachments = attachments.map((attachment) => ({ ...attachment }));
    protectSessionRow(sessionKey);
    const previewText = sendPlan.previewText;
    const optimisticUserMessage: ChatMessageItem = {
      id: `ui-user-${requestId}`,
      role: 'user',
      text: sendPlan.text,
      createdAt,
      source: 'inject',
      runId: requestId,
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
      blocks: sendPlan.blocks.length ? sendPlan.blocks : undefined,
      resources: sendPlan.resources,
    };
    recordChatDebugTrace({
      at: createdAt,
      source: 'send',
      kind: 'optimistic.user',
      sessionKey,
      runId: requestId,
      note: previewText.slice(0, 120) || null || undefined,
    });
    if (historyPayload.value?.session.key === sessionKey) {
      historyPayload.value = {
        ...historyPayload.value,
        session: {
          ...historyPayload.value.session,
          updatedAt: createdAt,
          lastMessagePreview: previewText.slice(0, 160) || attachments[0]?.fileName || historyPayload.value.session.lastMessagePreview,
        },
      };
    }
    if (shouldIncludeMessageInCurrentWindow(optimisticUserMessage)) {
      runtimeMachineState.value = injectChatSessionOptimisticMessage(runtimeMachineState.value, optimisticUserMessage);
      persistHistorySnapshot(sessionKey);
    }
    syncSessionRow(sessionKey, {
      updatedAt: createdAt,
      lastMessagePreview: previewText.slice(0, 160) || attachments[0]?.fileName || null,
    });
    syncSessionAutoLabel(sessionKey, runtimeMachineState.value.canonicalMessageLedger);
    composerDocument.value = createEmptyComposerDocument();
    composerAttachments.value = [];

    if (parsedSlashCommand) {
      setSlashFeedbackFromCommand(sessionKey, slashCommandText, 'send', 'accepted', {
        startedAt: createdAt,
        requestId,
      });
    }

    directSendPendingRunId = requestId;
    markSessionRunLocallyActive(sessionKey, directSendPendingRunId);
    const ack: ChatSendAck = await sendChatMessage(sessionKey, sendPayload);
    const ackActiveRunId = ack.runtime.activeRunId || (ack.status === 'duplicate_completed' ? null : ack.runId);
    if (ackActiveRunId) {
      markSessionRunLocallyActive(sessionKey, ackActiveRunId);
    } else {
      clearSessionRunLocallyActive(sessionKey, directSendPendingRunId);
    }
    directSendPendingRunId = null;
    applyRuntime(ack.runtime);
    playChatCueSafely('sent', requestId || ack.runId || null);
    if (parsedSlashCommand) {
      updateSlashFeedbackFromRuntime(sessionKey, ack.runtime, {
        requestId,
        runId: ack.runId,
      });
    }
  } catch (error) {
    if (directSendPendingRunId && sessionKeyForRollback) {
      clearSessionRunLocallyActive(sessionKeyForRollback, directSendPendingRunId);
      directSendPendingRunId = null;
    }
    if (rollbackOptimisticQueueItem) {
      removeOptimisticQueueItem(rollbackOptimisticQueueItem.sessionKey, rollbackOptimisticQueueItem.itemId);
    }
    if (sessionKeyForRollback && rollbackHistoryPayload && historyPayload.value?.session.key === sessionKeyForRollback) {
      historyPayload.value = rollbackHistoryPayload;
    }
    if (sessionKeyForRollback && rollbackRuntimeMachineState && selectedSessionKey.value === sessionKeyForRollback) {
      runtimeMachineState.value = rollbackRuntimeMachineState;
    }
    if (sessionKeyForRollback && rollbackSessionRow) {
      syncSessionRow(sessionKeyForRollback, rollbackSessionRow);
    }
    if (rollbackComposerDocument) {
      composerDocument.value = rollbackComposerDocument;
    }
    if (rollbackComposerAttachments) {
      composerAttachments.value = rollbackComposerAttachments;
    }
    if (sessionKeyForRollback && parsedSlashCommandForRollback) {
      markSlashFeedbackError(
        sessionKeyForRollback,
        error instanceof Error ? error.message : text('发送失败。', 'Failed to send message.'),
        { requestId },
      );
    }
    setNotice('error', error instanceof Error ? error.message : text('发送失败。', 'Failed to send message.'));
  } finally {
    sendBusy.value = false;
  }
}

async function patchQueuedMessage(payload: { entryId: string; text: string }): Promise<void> {
  if (!selectedSession.value?.permissions.canSend || accessError.value) return;
  const currentItem = selectedQueuedItems.value.find((item) => item.id === payload.entryId) || null;
  queueMutatingEntryId.value = payload.entryId;
  clearNotice();
  try {
    const request: ChatPatchQueueEntryRequest = {
      text: payload.text,
      flushWhenIdle: currentItem?.status === 'blocked',
    };
    const queuePayload = await patchChatQueueEntry(selectedSession.value.key, payload.entryId, request);
    applyQueueState(selectedSession.value.key, queuePayload.items);
    updateTrackedQueuedSlashEntry(selectedSession.value.key, payload.entryId, payload.text);
    setNotice(
      'success',
      currentItem?.status === 'blocked'
        ? text('队列消息已更新，并会在可发送时重试。', 'Queued message updated and will retry when sending is available.')
        : text('队列消息已更新。', 'Queued message updated.'),
    );
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('更新队列消息失败。', 'Failed to update queued message.'));
  } finally {
    queueMutatingEntryId.value = null;
  }
}

async function retryQueuedMessage(entryId: string): Promise<void> {
  if (!selectedSession.value?.permissions.canSend || accessError.value) return;
  const currentItem = selectedQueuedItems.value.find((item) => item.id === entryId) || null;
  if (!currentItem) return;
  queueMutatingEntryId.value = entryId;
  clearNotice();
  try {
    const request: ChatPatchQueueEntryRequest = {
      text: currentItem.text,
      clientRequestId: currentItem.clientRequestId || undefined,
      composerDocument: currentItem.composerDocument,
      fileRefs: currentItem.fileRefs,
      attachments: currentItem.attachments,
      flushWhenIdle: true,
    };
    const queuePayload = await patchChatQueueEntry(selectedSession.value.key, entryId, request);
    applyQueueState(selectedSession.value.key, queuePayload.items);
    setNotice('success', text('已重新加入待发送队列。', 'Queued message retry scheduled.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('重试队列消息失败。', 'Failed to retry queued message.'));
  } finally {
    queueMutatingEntryId.value = null;
  }
}

async function removeQueuedMessage(entryId: string): Promise<void> {
  if (!selectedSession.value?.permissions.canSend || accessError.value) return;
  queueMutatingEntryId.value = entryId;
  clearNotice();
  try {
    const queuePayload = await deleteChatQueueEntry(selectedSession.value.key, entryId);
    applyQueueState(selectedSession.value.key, queuePayload.items);
    updateTrackedQueuedSlashEntry(selectedSession.value.key, entryId, null);
    setNotice('success', text('已从待发送队列移除。', 'Removed from the queue.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('移除队列消息失败。', 'Failed to remove queued message.'));
  } finally {
    queueMutatingEntryId.value = null;
  }
}

async function refreshHostManagementExecState(sessionKey: string): Promise<boolean> {
  try {
    const controls = await fetchChatSessionControls(sessionKey);
    applySessionControlsPayload(sessionKey, controls);
    return controls.globalHostManagementExecEnabled === true;
  } catch {
    await loadStudioChatGlobalExecConfig();
    return globalHostManagementExecEnabled.value;
  }
}

async function toggleSessionHostManagementExec(nextValue: boolean): Promise<void> {
  if (!selectedSession.value || !canToggleHostManagementExec.value) {
    return;
  }
  if (nextValue && !globalHostManagementExecEnabled.value) {
    const refreshedGlobalExecEnabled = await refreshHostManagementExecState(selectedSession.value.key);
    if (refreshedGlobalExecEnabled) {
      await toggleSessionHostManagementExec(nextValue);
      return;
    }
    setNotice(
      'error',
      text(
        '请先在 Config > 沙盒与安全 中打开“允许在 Studio Chat 中启用宿主管理 Exec”。',
        'Enable “Allow host-management Exec in Studio Chat” in Config > Sandbox & Security first.',
      ),
    );
    return;
  }
  if (nextValue) {
    pendingHostManagementExecValue.value = true;
    pendingHostManagementExecSessionKey.value = selectedSession.value.key;
    hostManagementExecConfirmOpen.value = true;
    return;
  }
  await commitSessionHostManagementExecToggle(selectedSession.value.key, nextValue);
}

function handleHostManagementExecConfirmOpenChange(nextOpen: boolean): void {
  hostManagementExecConfirmOpen.value = nextOpen;
  if (!nextOpen) {
    pendingHostManagementExecValue.value = null;
    pendingHostManagementExecSessionKey.value = null;
  }
}

function closeHostManagementExecConfirm(): void {
  hostManagementExecConfirmOpen.value = false;
  pendingHostManagementExecValue.value = null;
  pendingHostManagementExecSessionKey.value = null;
}

async function confirmSessionHostManagementExec(): Promise<void> {
  const sessionKey = pendingHostManagementExecSessionKey.value;
  const targetSession = sessionKey
    ? sessionRows.value.find((session) => session.key === sessionKey) || null
    : null;
  if (pendingHostManagementExecValue.value !== true || !targetSession || !targetSession.permissions.writable) {
    closeHostManagementExecConfirm();
    return;
  }
  closeHostManagementExecConfirm();
  await commitSessionHostManagementExecToggle(targetSession.key, true);
}

async function commitSessionHostManagementExecToggle(sessionKey: string, nextValue: boolean): Promise<void> {
  hostManagementExecToggleBusy.value = true;
  clearNotice();
  try {
    const request: ChatPatchSessionControlsRequest = {
      allowHostManagementExec: nextValue,
    };
    const response: ChatSessionControlsPayload = await patchChatSessionControls(sessionKey, request);
    applySessionControlsPayload(sessionKey, response);
    setNotice(
      'success',
      nextValue
        ? text('当前会话已允许宿主管理 Exec。', 'Host-management Exec is now enabled for this chat.')
        : text('当前会话已关闭宿主管理 Exec。', 'Host-management Exec is now disabled for this chat.'),
    );
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('更新会话执行权限失败。', 'Failed to update chat execution controls.'));
  } finally {
    hostManagementExecToggleBusy.value = false;
  }
}

async function abortCurrentRun(): Promise<boolean> {
  if (!selectedSession.value?.permissions.canAbort || accessError.value) return false;
  abortBusy.value = true;
  clearNotice();
  try {
    const payload: ChatAbortResponse = await abortChatRun(selectedSession.value.key);
    applyRuntime(payload.runtime);
    clearSessionRunLocallyActive(selectedSession.value.key, payload.runtime.activeRunId);
    if (!payload.hadActiveRun) {
      setNotice('error', text('当前没有可中止的运行。', 'There is no active run to abort.'));
      return false;
    }
    return true;
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('停止失败。', 'Failed to stop the run.'));
    return false;
  } finally {
    abortBusy.value = false;
  }
}

async function resetCurrentSession(): Promise<boolean> {
  if (!selectedSession.value?.permissions.canReset || accessError.value) return false;
  if (activeRuntime.value?.activeRunId) {
    setNotice('warning', text('请先停止当前回复，再重置 Session。', 'Stop the current reply before resetting the session.'));
    return false;
  }
  const currentSession = selectedSession.value;
  const previousHistoryPayload = historyPayload.value
    ? JSON.parse(JSON.stringify(historyPayload.value)) as ChatHistoryPayload
    : null;
  const previousRuntimeMachineState = JSON.parse(JSON.stringify(runtimeMachineState.value)) as ChatSessionRuntimeMachineState;
  const previousSessionRow = JSON.parse(JSON.stringify(currentSession)) as ChatSessionRow;
  const suppressedIds = collectCurrentRunIds();
  const now = new Date().toISOString();
  resetBusy.value = true;
  clearNotice();
  try {
    suppressRunIds(suppressedIds);
    clearSessionRunLocallyActive(currentSession.key);
    clearLastStreamSeqForSession(currentSession.key);
    const optimisticRuntime: ChatRuntimeState = {
      gatewayConnected: activeRuntime.value?.gatewayConnected ?? chatHealth.value?.gatewayReachable ?? false,
      sessionWritable: true,
      activeRunId: null,
      state: 'idle',
      lastEventAt: null,
      lastAckAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    };
    syncSessionRow(currentSession.key, {
      updatedAt: now,
      lastMessagePreview: null,
      runtime: optimisticRuntime,
    });
    historyPayload.value = {
      checkedAt: now,
      session: {
        ...currentSession,
        updatedAt: now,
        lastMessagePreview: null,
        runtime: optimisticRuntime,
      },
      messages: [],
      overlays: [],
      runtime: optimisticRuntime,
      observability: createEmptyRuntimeObservability(),
      diagnostics: resolveConversationDiagnosticsFallback(),
      pageInfo: {
        hasMoreBefore: false,
        beforeCursor: null,
        hasMoreAfter: false,
        afterCursor: null,
      },
      day: selectedHistoryDay.value,
    };
    runtimeMachineState.value = resetChatSessionRuntimeMachine(currentSession.key);
    historyPageInfo.value = { hasMoreBefore: false, beforeCursor: null, hasMoreAfter: false, afterCursor: null };
    clearChatRuntimeSnapshot(currentSession.key);

    const payload = await resetChatSession(currentSession.key);
    syncSessionRow(payload.session.key, payload.session);
    historyPayload.value = {
      checkedAt: new Date().toISOString(),
      session: payload.session,
      messages: [],
      overlays: [],
      runtime: payload.runtime,
      observability: createEmptyRuntimeObservability(),
      diagnostics: resolveConversationDiagnosticsFallback(),
      pageInfo: {
        hasMoreBefore: false,
        beforeCursor: null,
        hasMoreAfter: false,
        afterCursor: null,
      },
      day: selectedHistoryDay.value,
    };
    runtimeMachineState.value = resetChatSessionRuntimeMachine(payload.session.key);
    historyPageInfo.value = { hasMoreBefore: false, beforeCursor: null, hasMoreAfter: false, afterCursor: null };
    setNotice('success', text('Session 已重置。', 'Session reset.'));
    return true;
  } catch (error) {
    unsuppressRunIds(suppressedIds);
    syncSessionRow(previousSessionRow.key, previousSessionRow);
    historyPayload.value = previousHistoryPayload;
    runtimeMachineState.value = previousRuntimeMachineState;
    historyPageInfo.value = previousHistoryPayload?.pageInfo || { hasMoreBefore: false, beforeCursor: null, hasMoreAfter: false, afterCursor: null };
    setNotice('error', error instanceof Error ? error.message : text('重置失败。', 'Failed to reset session.'));
    return false;
  } finally {
    resetBusy.value = false;
  }
}

function resolveNextSessionKeyAfterDeleteMany(sessionKeys: string[]): string {
  const deleted = new Set(sessionKeys);
  const available = availableSessionsForCurrentMode();
  const currentIndex = available.findIndex((session) => session.key === selectedSessionKey.value);
  const remaining = available.filter((session) => !deleted.has(session.key));
  if (!remaining.length) {
    return '';
  }
  if (currentIndex < 0) {
    return remaining[0]?.key || '';
  }
  return remaining[Math.min(currentIndex, remaining.length - 1)]?.key || '';
}

async function applyDeleteSelectionFallback(sessionKeys: string[]): Promise<void> {
  if (!selectedSessionKey.value || !sessionKeys.includes(selectedSessionKey.value)) {
    return;
  }
  const nextSessionKey = resolveNextSessionKeyAfterDeleteMany(sessionKeys);
  clearConversationState();
  selectedSessionKey.value = nextSessionKey;
  if (nextSessionKey) {
    rememberLastChatSessionKey(nextSessionKey);
    rememberLastChatAgentId(deriveAgentIdFromChatSessionKey(nextSessionKey));
  }
  await router.replace(nextSessionKey ? buildChatRoute(nextSessionKey, props.shellMode) : '/chat');
}

function applyDeletedSessionsLocally(sessionKeys: string[]): void {
  const deleted = new Set(sessionKeys);
  for (const sessionKey of deleted) {
    clearLocalSessionCaches(sessionKey);
  }
  repairLastSessionPointerAfterDelete(sessionKeys);
  sessionRows.value = sessionRows.value.filter((row) => !deleted.has(row.key));
  queuedItemsBySession.value = Object.fromEntries(
    Object.entries(queuedItemsBySession.value).filter(([sessionKey]) => !deleted.has(sessionKey)),
  );
  sessionControlsBySession.value = Object.fromEntries(
    Object.entries(sessionControlsBySession.value).filter(([sessionKey]) => !deleted.has(sessionKey)),
  );
  applyOrganizer(removeSessionsFromOrganizer(organizerSourceState.value, sessionKeys));
}

async function deleteSessionKeys(sessionKeys: string[]): Promise<{ deletedKeys: string[]; failedKeys: string[] }> {
  const settled = await Promise.allSettled(
    sessionKeys.map(async (sessionKey) => {
      await deleteChatSession(sessionKey);
      return sessionKey;
    }),
  );
  const deletedKeys = settled
    .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
    .map((result) => result.value);
  const failedKeys = settled
    .map((result, index) => ({ result, sessionKey: sessionKeys[index]! }))
    .filter(({ result }) => result.status === 'rejected')
    .map(({ sessionKey }) => sessionKey);
  if (deletedKeys.length) {
    applyDeletedSessionsLocally(deletedKeys);
    await applyDeleteSelectionFallback(deletedKeys);
  }
  return {
    deletedKeys,
    failedKeys,
  };
}

async function handleCreateFolder(payload: { parentId: string | null; title: string }): Promise<void> {
  const title = String(payload.title || '').trim();
  if (!title) {
    setNotice('error', text('文件夹名称不能为空。', 'Folder name cannot be empty.'));
    return;
  }
  clearNotice();
  try {
    const response = await createChatFolder({
      title,
      parentId: payload.parentId,
    });
    applyOrganizer(response.organizer);
    setNotice('success', text('文件夹已创建。', 'Folder created.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('创建文件夹失败。', 'Failed to create folder.'));
  }
}

async function handleFolderAction(payload: {
  action: 'rename' | 'move_up' | 'move_down' | 'move_top' | 'delete';
  folderId: string;
  title?: string;
}): Promise<void> {
  clearNotice();
  try {
    if (payload.action === 'rename') {
      const currentFolder = organizerState.value.folders.find((folder) => folder.id === payload.folderId) || null;
      if (!currentFolder) {
        throw new Error(text('文件夹不存在。', 'Folder does not exist.'));
      }
      const title = String(payload.title || '').trim();
      if (!title) {
        setNotice('error', text('文件夹名称不能为空。', 'Folder name cannot be empty.'));
        return;
      }
      if (title === currentFolder.title) {
        return;
      }
      const response = await patchChatFolder(payload.folderId, { title });
      applyOrganizer(response.organizer);
      setNotice('success', text('文件夹名称已更新。', 'Folder renamed.'));
      return;
    }

    if (payload.action === 'delete') {
      const confirmed = await confirm({
        title: text('删除文件夹', 'Delete folder'),
        message: text('删除文件夹后，其中会话会自动回到根目录。确认继续？', 'Delete this folder and return its chats to root?'),
        confirmText: text('确认', 'Confirm'),
        cancelText: text('取消', 'Cancel'),
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }
      const response = await deleteChatFolder(payload.folderId);
      applyOrganizer(response.organizer);
      setNotice('success', text('文件夹已删除。', 'Folder deleted.'));
      return;
    }

    const response = await patchChatFolder(payload.folderId, {
      move: payload.action === 'move_up'
        ? 'up'
        : payload.action === 'move_down'
          ? 'down'
          : 'top',
    });
    applyOrganizer(response.organizer);
    setNotice('success', text('文件夹顺序已更新。', 'Folder order updated.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('文件夹操作失败。', 'Folder action failed.'));
  }
}

async function handleAssignSessions(payload: { sessionKeys: string[]; folderId: string | null }): Promise<void> {
  if (!payload.sessionKeys.length) {
    return;
  }
  clearNotice();
  try {
    const response = await assignChatSessionsToFolder(payload);
    applyOrganizer(response.organizer);
    setNotice(
      'success',
      payload.folderId
        ? text('会话已移入文件夹。', 'Chats moved to folder.')
        : text('会话已移回根目录。', 'Chats moved back to root.')
    );
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('整理会话失败。', 'Failed to organize chats.'));
  }
}

async function handleBatchAction(payload: {
  action: 'archive' | 'unarchive' | 'delete';
  sessionKeys: string[];
}): Promise<void> {
  const sessionKeys = [...new Set(payload.sessionKeys)];
  if (!sessionKeys.length) {
    return;
  }
  clearNotice();

  try {
    if (payload.action === 'archive') {
      const patchedSessions = await Promise.all(
        sessionKeys.map(async (sessionKey) => (await patchChatSession(sessionKey, { archived: true })).session),
      );
      for (const session of patchedSessions) {
        replaceSessionRow(session);
      }
      setNotice('success', text('已归档所选会话。', 'Selected chats archived.'));
      return;
    }

    if (payload.action === 'unarchive') {
      const patchedSessions = await Promise.all(
        sessionKeys.map(async (sessionKey) => (await patchChatSession(sessionKey, { archived: false })).session),
      );
      for (const session of patchedSessions) {
        replaceSessionRow(session);
      }
      setNotice('success', text('已取消归档所选会话。', 'Selected chats unarchived.'));
      return;
    }

    const confirmed = await confirm({
      title: text('批量删除会话', 'Batch delete chats'),
      message: text(`将删除 ${sessionKeys.length} 个会话，并清理本地与远端记录。确认继续？`, `Delete ${sessionKeys.length} chats from Studio and the gateway?`),
      confirmText: text('确认', 'Confirm'),
      cancelText: text('取消', 'Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    const result = await deleteSessionKeys(sessionKeys);
    if (result.failedKeys.length) {
      throw new Error(
        text(
          `批量删除部分失败。成功 ${result.deletedKeys.length} 个，失败 ${result.failedKeys.length} 个：${result.failedKeys.join(', ')}`,
          `Batch delete partially failed. Deleted ${result.deletedKeys.length}, failed ${result.failedKeys.length}: ${result.failedKeys.join(', ')}`,
        ),
      );
    }
    setNotice('success', text('已删除所选会话。', 'Selected chats deleted.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('批量操作失败。', 'Batch action failed.'));
  }
}

async function handleSessionAction(payload: { action: 'rename' | 'archive' | 'delete'; sessionKey: string; title?: string }): Promise<void> {
  const session = sessionRows.value.find((row) => row.key === payload.sessionKey) || null;
  if (!session) {
    setNotice('error', text('会话不存在或已被删除。', 'The chat no longer exists.'));
    return;
  }
  if (session.kind !== 'studio_managed' || !session.permissions.writable) {
    setNotice('error', text('当前会话只读，不能执行该操作。', 'This chat is read-only and cannot be changed.'));
    return;
  }

  clearNotice();

  try {
    if (payload.action === 'rename') {
      const label = String(payload.title || '').trim();
      if (!label) {
        setNotice('error', text('会话标题不能为空。', 'Chat title cannot be empty.'));
        return;
      }
      if (label === resolveSessionEditableLabel(session)) {
        return;
      }

      const response = await patchChatSession(session.key, { label });
      replaceSessionRow(response.session);
      setNotice('success', text('会话标题已更新。', 'Chat title updated.'));
      return;
    }

    if (payload.action === 'archive') {
      const nextArchived = !session.presentation.archived;
      const response = await patchChatSession(session.key, { archived: nextArchived });
      replaceSessionRow(response.session);
      setNotice(
        'success',
        nextArchived
          ? text('会话已归档。', 'Chat archived.')
          : text('会话已移回活跃列表。', 'Chat moved back to Active.')
      );
      return;
    }

    const confirmed = await confirm({
      title: text('删除会话', 'Delete chat'),
      message: text('删除后会同时清理本地和远端会话记录，确认继续？', 'Delete this chat from both local Studio state and the gateway?'),
      confirmText: text('确认', 'Confirm'),
      cancelText: text('取消', 'Cancel'),
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }

    const result = await deleteSessionKeys([session.key]);
    if (result.failedKeys.length) {
      throw new Error(
        text(
          `删除会话失败：${result.failedKeys.join(', ')}`,
          `Failed to delete chat: ${result.failedKeys.join(', ')}`,
        ),
      );
    }
    setNotice('success', text('会话已删除。', 'Chat deleted.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('会话操作失败。', 'Chat action failed.'));
  }
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void sendMessage();
  }
}

async function refreshSelectedConversation(): Promise<void> {
  const sessionKey = selectedSessionKey.value;
  if (!sessionKey || refreshBusy.value) {
    return;
  }
  refreshBusy.value = true;
  clearNotice();
  historyErrorMessage.value = '';
  try {
    await Promise.all([loadHealth(), loadSessions(), loadStudioChatGlobalExecConfig()]);
    await Promise.all([
      loadConversationWindowInitial(sessionKey, { force: true }),
      loadSessionSurfaceState(sessionKey),
    ]);
    if (usesChatEventSource()) {
      disconnectChatEventSource();
      connectChatEventSource(sessionKey);
    } else {
      connectChatSocket(sessionKey);
    }
    setNotice('success', text('对话已刷新。', 'Conversation refreshed.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('刷新对话失败。', 'Failed to refresh conversation.'));
  } finally {
    refreshBusy.value = false;
  }
}

async function refreshAll(): Promise<void> {
  clearNotice();
  errorMessage.value = '';
  await Promise.all([
    loadAgents(),
    loadHealth(),
    loadOrganizer(),
    loadStudioChatGlobalExecConfig(),
  ]);
  await loadSessions();
}

async function bootstrapChatSurface(): Promise<void> {
  clearNotice();
  errorMessage.value = '';
  const bootstrapSessionKey = resolveBootstrapSessionKey();
  const restoredWarmCache = restoreChatShellWarmCache(bootstrapSessionKey || null);
  if (restoredWarmCache) {
    bootstrapLoading.value = false;
    return;
  }
  let bootstrapPayload: ChatBootstrapPayload | null = null;
  try {
    bootstrapPayload = await loadChatBootstrap(bootstrapSessionKey);
  } catch {}
  bootstrapLoading.value = false;
  void loadAgents().then(() => loadSessions({ deferRemainingAgents: true }));
  if (!bootstrapPayload?.diagnostics) {
    void loadHealth();
  }
  if (!bootstrapPayload?.organizer) {
    void loadOrganizer();
  }
  void loadStudioChatGlobalExecConfig();
}

watch(
  [routeSessionKey, () => props.shellMode, studioManagedSessions, observedSessions, sessionsLoading, bootstrapLoading],
  async () => {
    const requested = routeSessionKey.value;
    const available = inspectPinned.value ? [...studioManagedSessions.value, ...observedSessions.value] : studioManagedSessions.value;
    if (requested) {
      optimisticStartupSessionKey.value = requested;
      if (bootstrapLoading.value) {
        return;
      }
      if (!selectedSessionKey.value) {
        primeConversationStateFromSnapshot(requested);
      }
      selectSessionKeyLocally(requested);
      return;
    }
    if (!selectedSessionKey.value) {
      const rememberedSessionKey = resolveBootstrapSessionKey();
      if (rememberedSessionKey) {
        if (bootstrapLoading.value) {
          return;
        }
        const rememberedSessionKnown = (
          available.some((session) => session.key === rememberedSessionKey)
          || historyPayload.value?.session.key === rememberedSessionKey
        );
        if (!rememberedSessionKnown) {
          optimisticStartupSessionKey.value = '';
        } else {
        optimisticStartupSessionKey.value = rememberedSessionKey;
        primeConversationStateFromSnapshot(rememberedSessionKey);
        selectSessionKeyLocally(rememberedSessionKey);
        return;
        }
      }
    }
    const fallback = resolveFallbackSessionKey();
    const hasPendingOptimisticStartup = (
      optimisticStartupSessionKey.value
      && selectedSessionKey.value === optimisticStartupSessionKey.value
      && sessionsLoading.value
      && historyPayload.value?.session.key !== optimisticStartupSessionKey.value
      && !available.some((session) => session.key === optimisticStartupSessionKey.value)
    );
    if (hasPendingOptimisticStartup) {
      return;
    }
    if (!selectedSessionKey.value || !available.some((session) => session.key === selectedSessionKey.value)) {
      optimisticStartupSessionKey.value = '';
      selectSessionKeyLocally(fallback);
    }
  },
  { immediate: true },
);

watch(selectedSessionKey, async (sessionKey, previousKey) => {
  clearDeferredInitialHistoryLoad();
  clearLiveHistorySyncTimer();
  clearRunSettlementSyncTimer();
  abortReplaceHistoryRequest();
  abortHistoryDatesRequest();
  closeHostManagementExecConfirm();
  if (previousKey) {
    if (sessionRows.value.some((row) => row.key === previousKey)) {
      flushComposerDraftSave(previousKey);
    } else {
      clearComposerDraftForSession(previousKey);
    }
    clearTerminalRunFence(previousKey);
    exhaustedHistoryBeforeCursorBySession.delete(previousKey);
  }
  historyPrependAnchorMessageId.value = null;
  queueRailExpanded.value = false;
  mobileQueueSheetOpen.value = false;
  if (!sessionKey) {
    composerDocument.value = createEmptyComposerDocument();
    composerAttachments.value = [];
    const requestedSessionKey = routeSessionKey.value;
    if (requestedSessionKey) {
      selectSessionKeyLocally(requestedSessionKey);
      return;
    }
    clearConversationState();
    return;
  }
  restoreComposerDraftForSession(sessionKey);
  exhaustedHistoryBeforeCursorBySession.delete(sessionKey);
  const hasPrimedConversationState = (
    historyPayload.value?.session.key === sessionKey
    && runtimeMachineState.value.sessionKey === sessionKey
  );
  if (sessionKey !== previousKey) {
    searchQuery.value = '';
    selectedHistoryDay.value = null;
    historyMode.value = 'history';
    historyDays.value = [];
    historyDatesLoadedSessionKey.value = '';
    historyDatesLoading.value = false;
    abortRecordBrowserSearch();
    resetRecordBrowserState();
    if (!hasPrimedConversationState) {
      runtimeMachineState.value = resetChatSessionRuntimeMachine(sessionKey);
    }
  }
  const primedConversationState = hasPrimedConversationState || primeConversationStateFromSnapshot(sessionKey);
  const primedByBootstrap = bootstrapPrimedSessionKey.value === sessionKey;
  if (!primedConversationState && selectedSession.value) {
    primeEmptyConversationShell(selectedSession.value, selectedSession.value.runtime);
  }
  if (sessionKey === previousKey && historyPayload.value?.session.key === sessionKey) return;
  if (!primedByBootstrap) {
    void loadSessionSurfaceState(sessionKey);
  }
  connectChatSocket(sessionKey);
  if (primedByBootstrap) {
    bootstrapPrimedSessionKey.value = '';
    if (historyPayload.value?.session.key === sessionKey) {
      return;
    }
  }
  const shouldDeferInitialRootHistoryLoad = (
    !previousKey
    && !routeSessionKey.value
    && props.shellMode === 'chat'
    && historyMode.value === 'history'
  );
  if (shouldDeferInitialRootHistoryLoad) {
    if (primedByBootstrap) return;
    if (!primedConversationState) {
      historyLoadingInitial.value = true;
    }
    scheduleDeferredInitialConversationLoad(sessionKey);
    return;
  }
  void loadConversationWindowInitial(sessionKey);
}, { immediate: true });

watch(
  () => props.shellMode,
  () => {
    inspectorDrawerOpen.value = props.shellMode === 'inspect';
  },
  { immediate: true },
);

watch(sessionRows, () => {
  organizerState.value = pruneOrganizerStateSessionKeys(
    organizerSourceState.value,
    sessionRows.value
      .filter((row) => row.kind === 'studio_managed')
      .map((row) => row.key),
  );
});

watch([composerDocument, composerAttachments], () => {
  scheduleComposerDraftSave();
});

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (mobileSessionDrawerOpen.value) {
    mobileSessionDrawerOpen.value = false;
    return;
  }
  if (inspectPinned.value && inspectorDrawerOpen.value) {
    closeInspectorDrawer();
  }
}

function syncChatShellCompactViewport(): void {
  chatShellCompactViewport.value = Boolean(chatShellCompactViewportMediaQuery?.matches);
}

function bindChatShellCompactViewport(): void {
  if (typeof window === 'undefined') {
    chatShellCompactViewport.value = false;
    return;
  }
  chatShellCompactViewportMediaQuery = window.matchMedia('(max-width: 920px)');
  chatShellCompactViewportListener = () => {
    syncChatShellCompactViewport();
  };
  syncChatShellCompactViewport();
  if ('addEventListener' in chatShellCompactViewportMediaQuery) {
    chatShellCompactViewportMediaQuery.addEventListener('change', chatShellCompactViewportListener);
  } else {
    chatShellCompactViewportMediaQuery.addListener(chatShellCompactViewportListener);
  }
}

function unbindChatShellCompactViewport(): void {
  if (chatShellCompactViewportMediaQuery && chatShellCompactViewportListener) {
    if ('removeEventListener' in chatShellCompactViewportMediaQuery) {
      chatShellCompactViewportMediaQuery.removeEventListener('change', chatShellCompactViewportListener);
    } else {
      chatShellCompactViewportMediaQuery.removeListener(chatShellCompactViewportListener);
    }
  }
  chatShellCompactViewportMediaQuery = null;
  chatShellCompactViewportListener = null;
  chatShellCompactViewport.value = false;
}

function handleComposerDraftLifecycleExit(): void {
  flushComposerDraftSave();
  rememberChatShellWarmCache();
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    refreshChatDebugTraceFlag();
    try {
      const stored = window.localStorage.getItem(CHAT_PROCESS_VISIBILITY_STORAGE_KEYS.showToolPreviews);
      if (stored === '0') showToolPreviews.value = false;
      const storedThinking = window.localStorage.getItem(CHAT_PROCESS_VISIBILITY_STORAGE_KEYS.showThinkingBlocks);
      if (storedThinking === '1') showThinkingBlocks.value = true;
    } catch {}
    soundCuesEnabled.value = readChatSoundCuesEnabled();
    window.__OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE = forceCloseChatSocketForTest;
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('pagehide', handleComposerDraftLifecycleExit);
    window.addEventListener('beforeunload', handleComposerDraftLifecycleExit);
    bindChatShellCompactViewport();
    startShellViewportSnapshotInterval();
  }
  await bootstrapChatSurface();
});

watch(showToolPreviews, (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAT_PROCESS_VISIBILITY_STORAGE_KEYS.showToolPreviews, value ? '1' : '0');
  } catch {}
});

watch(showThinkingBlocks, (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAT_PROCESS_VISIBILITY_STORAGE_KEYS.showThinkingBlocks, value ? '1' : '0');
  } catch {}
});

watch(soundCuesEnabled, (value) => {
  writeChatSoundCuesEnabled(value);
});

onBeforeUnmount(() => {
  flushComposerDraftSave();
  rememberChatShellWarmCache();
  clearDeferredInitialHistoryLoad();
  clearDeferredSessionHydration();
  clearLiveHistorySyncTimer();
  clearRunSettlementSyncTimer();
  clearNoticeTimer();
  abortReplaceHistoryRequest();
  abortHistoryDatesRequest();
  abortRecordBrowserSearch();
  clearHistoryBeforePrefetch();
  clearHistoryAfterPrefetch();
  clearHistoryBeforeMaterializeReleaseTimer();
  clearShellViewportSnapshotInterval();
  clearPendingTemporaryToolEvents();
  clearTerminalRunFence();
  clearWsReconnectTimer();
  clearRealtimeRecoveryRetryTimer();
  clearRealtimeRecoveryState();
  if (typeof window !== 'undefined') {
    delete window.__OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE;
    delete window.__OPENCLAW_STUDIO_CHAT_TRACE__;
    window.removeEventListener('keydown', handleGlobalKeydown);
    window.removeEventListener('pagehide', handleComposerDraftLifecycleExit);
    window.removeEventListener('beforeunload', handleComposerDraftLifecycleExit);
  }
  unbindChatShellCompactViewport();
  if (chatSocket) {
    try { chatSocket.close(); } catch {}
    chatSocket = null;
    chatSocketSessionKey = '';
    wsConnected.value = false;
  }
  if (chatEventSource) {
    disconnectChatEventSource();
  }
  if (gatewayClient) {
    disconnectGatewayClient();
  }
});
</script>
