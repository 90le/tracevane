<template>
  <section class="terminal-git-panel" data-testid="terminal-git-panel" @click="handleGitPanelClick">
    <header class="terminal-workspace-sidebar-head">
      <div>
        <strong>{{ text('源代码管理', 'Source Control') }}</strong>
        <span>{{ statusLabel }}</span>
      </div>
      <button
        type="button"
        class="terminal-resource-icon-button"
        :title="text('刷新 Git 状态', 'Refresh Git status')"
        :aria-label="text('刷新 Git 状态', 'Refresh Git status')"
        :disabled="loading || operationBusy"
        @click="refresh"
      >
        <RefreshCw class="terminal-resource-icon" aria-hidden="true" />
      </button>
    </header>

    <p
      v-if="operationMessage"
      class="terminal-git-panel__message"
      :class="`terminal-git-panel__message--${operationKind}`"
    >
      {{ operationMessage }}
    </p>

    <div v-if="loading" class="terminal-git-panel__state">
      {{ text('正在读取 Git 状态…', 'Reading Git status...') }}
    </div>
    <div v-else-if="!status?.available" class="terminal-git-panel__state">
      <GitBranch class="terminal-git-panel__state-icon" aria-hidden="true" />
      <strong>{{ text('未检测到 Git 仓库', 'No Git repository detected') }}</strong>
      <span>{{ status?.message || text('当前工作区不在 Git 仓库中。', 'The current workspace is not inside a Git repository.') }}</span>
      <button
        type="button"
        class="secondary-button compact-button"
        :disabled="operationBusy || !rootId"
        @click="initRepository"
      >
        <FolderGit2 class="terminal-resource-icon" aria-hidden="true" />
        {{ text('初始化仓库', 'Initialize Repository') }}
      </button>
    </div>
    <template v-else>
      <section class="terminal-git-panel__branch">
        <GitBranch class="terminal-resource-icon" aria-hidden="true" />
        <div>
          <strong>{{ status.branch || 'HEAD' }}</strong>
          <span v-if="status.upstream">{{ status.upstream }}</span>
          <span v-else>{{ text('无上游分支', 'No upstream') }}</span>
        </div>
        <small v-if="status.ahead || status.behind">
          <ArrowUp v-if="status.ahead" class="terminal-git-panel__inline-icon" aria-hidden="true" />{{ status.ahead }}
          <ArrowDown v-if="status.behind" class="terminal-git-panel__inline-icon" aria-hidden="true" />{{ status.behind }}
        </small>
      </section>

      <div class="terminal-git-panel__summary">
        <span>{{ changeSummary }}</span>
        <span v-if="status.checkedAt">{{ formatTime(status.checkedAt) }}</span>
      </div>

      <div class="terminal-git-panel__tabs" role="tablist" :aria-label="text('Git 面板', 'Git panel')">
        <button
          type="button"
          :class="{ active: activeView === 'changes' }"
          :aria-selected="activeView === 'changes'"
          role="tab"
          @click="activeView = 'changes'"
        >
          {{ text('变更', 'Changes') }}
        </button>
        <button
          type="button"
          :class="{ active: activeView === 'history' }"
          :aria-selected="activeView === 'history'"
          role="tab"
          @click="activeView = 'history'"
        >
          {{ text('历史', 'History') }}
        </button>
      </div>

      <div v-if="activeView === 'changes'" class="terminal-git-panel__changes-view">
        <form class="terminal-git-panel__commit" @submit.prevent="commitChanges">
          <textarea
            v-model="commitMessage"
            rows="2"
            :placeholder="text('提交消息', 'Commit message')"
            :disabled="operationBusy"
          ></textarea>
          <div class="terminal-git-panel__commit-actions">
            <button
              type="button"
              class="secondary-button compact-button"
              :disabled="operationBusy || !unstagedChanges.length"
              @click="stageAll"
            >
              <Plus class="terminal-resource-icon" aria-hidden="true" />
              {{ text('全部暂存', 'Stage All') }}
            </button>
            <button
              type="button"
              class="secondary-button compact-button"
              :disabled="operationBusy || !stagedChanges.length"
              @click="unstageAll"
            >
              <Undo2 class="terminal-resource-icon" aria-hidden="true" />
              {{ text('取消暂存', 'Unstage All') }}
            </button>
            <button
              type="submit"
              class="secondary-button compact-button terminal-git-panel__commit-button"
              :disabled="operationBusy || !stagedChanges.length || !commitMessage.trim()"
            >
              <Check class="terminal-resource-icon" aria-hidden="true" />
              {{ text('提交', 'Commit') }}
            </button>
          </div>
        </form>

        <div v-if="status.clean" class="terminal-git-panel__state terminal-git-panel__state--clean">
          <CheckCircle2 class="terminal-git-panel__state-icon" aria-hidden="true" />
          <strong>{{ text('工作区干净', 'Working tree clean') }}</strong>
          <span>{{ text('没有未提交的文件变更。', 'There are no uncommitted file changes.') }}</span>
        </div>

        <div v-else class="terminal-git-panel__change-sections">
          <section
            v-if="diffPreview || diffLoading || diffErrorMessage"
            class="terminal-git-panel__diff-preview"
            aria-live="polite"
          >
            <header>
              <div>
                <strong>{{ diffPreviewTitle }}</strong>
                <span>{{ diffPreviewMeta }}</span>
              </div>
              <div class="terminal-git-panel__diff-actions">
                <button
                  type="button"
                  class="terminal-resource-icon-button"
                  :title="text('打开文件', 'Open file')"
                  :aria-label="text('打开文件', 'Open file')"
                  :disabled="!diffPreviewChange || diffPreviewChange.kind === 'deleted'"
                  @click="openDiffFile"
                >
                  <FileText class="terminal-resource-icon" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="terminal-resource-icon-button"
                  :title="text('关闭变更预览', 'Close change preview')"
                  :aria-label="text('关闭变更预览', 'Close change preview')"
                  @click="closeDiffPreview"
                >
                  <X class="terminal-resource-icon" aria-hidden="true" />
                </button>
              </div>
            </header>
            <div v-if="diffLoading" class="terminal-git-panel__diff-state">
              {{ text('正在读取变更…', 'Reading change...') }}
            </div>
            <div v-else-if="diffErrorMessage" class="terminal-git-panel__diff-state terminal-git-panel__diff-state--error">
              {{ diffErrorMessage }}
            </div>
            <div v-else-if="diffPreview?.message" class="terminal-git-panel__diff-state">
              {{ diffPreview.message }}
            </div>
            <pre v-else class="terminal-git-panel__diff-code" tabindex="0"><code><span
              v-for="line in diffLines"
              :key="line.id"
              class="terminal-git-panel__diff-line"
              :class="`terminal-git-panel__diff-line--${line.kind}`"
            >{{ line.text || ' ' }}</span></code></pre>
          </section>

          <section class="terminal-git-panel__section">
            <header>
              <strong>{{ text('暂存区', 'Staged') }}</strong>
              <span>{{ stagedChanges.length }}</span>
            </header>
            <div v-if="stagedChanges.length" class="terminal-git-panel__changes" role="list">
              <div
                v-for="change in stagedChanges"
                :key="`staged:${change.status}:${change.path}`"
                class="terminal-git-panel__change"
                role="listitem"
                :title="change.path"
                @contextmenu.prevent="openChangeContextMenu($event, change, 'staged')"
                @pointerdown="startGitChangeLongPress($event, change, 'staged')"
              >
                <FileText class="terminal-resource-icon" aria-hidden="true" />
                <button
                  type="button"
                  class="terminal-git-panel__change-main"
                  :disabled="change.kind === 'deleted'"
                  @click="previewChangeFromPointer($event, change)"
                >
                  <span>
                    <strong>{{ fileNameOf(change.path) }}</strong>
                    <small>{{ change.path }}</small>
                  </span>
                </button>
                <em :class="`terminal-git-panel__status terminal-git-panel__status--${change.kind}`">
                  {{ statusCode(change) }}
                </em>
              </div>
            </div>
          </section>

          <section class="terminal-git-panel__section">
            <header>
              <strong>{{ text('工作区更改', 'Changes') }}</strong>
              <span>{{ unstagedChanges.length }}</span>
            </header>
            <div v-if="unstagedChanges.length" class="terminal-git-panel__changes" role="list">
              <div
                v-for="change in unstagedChanges"
                :key="`unstaged:${change.status}:${change.path}`"
                class="terminal-git-panel__change"
                role="listitem"
                :title="change.path"
                @contextmenu.prevent="openChangeContextMenu($event, change, 'unstaged')"
                @pointerdown="startGitChangeLongPress($event, change, 'unstaged')"
              >
                <FileText class="terminal-resource-icon" aria-hidden="true" />
                <button
                  type="button"
                  class="terminal-git-panel__change-main"
                  :disabled="change.kind === 'deleted'"
                  @click="previewChangeFromPointer($event, change)"
                >
                  <span>
                    <strong>{{ fileNameOf(change.path) }}</strong>
                    <small>{{ change.path }}</small>
                  </span>
                </button>
                <em :class="`terminal-git-panel__status terminal-git-panel__status--${change.kind}`">
                  {{ statusCode(change) }}
                </em>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div v-else class="terminal-git-panel__history-view">
        <form class="terminal-git-panel__branch-create" @submit.prevent="createBranchFromInput(true)">
          <input
            v-model="newBranchName"
            type="text"
            autocomplete="off"
            :placeholder="text('新分支名称', 'New branch name')"
            :disabled="operationBusy"
          />
          <button
            type="submit"
            class="secondary-button compact-button"
            :disabled="operationBusy || !newBranchName.trim()"
          >
            <GitBranchPlus class="terminal-resource-icon" aria-hidden="true" />
            {{ text('创建并签出', 'Create & Checkout') }}
          </button>
        </form>

        <section class="terminal-git-panel__section">
          <header>
            <strong>{{ text('分支', 'Branches') }}</strong>
            <span>{{ status.branches.length }}</span>
          </header>
          <div class="terminal-git-panel__branches" role="list">
            <button
              v-for="branch in status.branches"
              :key="branch.name"
              type="button"
              class="terminal-git-panel__branch-row"
              :class="{ active: branch.current || selectedBranchName === branch.name }"
              :disabled="operationBusy"
              role="listitem"
              :title="branch.name"
              @click="selectBranchFromPointer($event, branch.name)"
              @contextmenu.prevent="openBranchContextMenu($event, branch.name, branch.current)"
              @pointerdown="startGitBranchLongPress($event, branch.name, branch.current)"
            >
              <GitBranch class="terminal-resource-icon" aria-hidden="true" />
              <span>
                <strong>{{ branch.name }}</strong>
                <small>{{ branch.upstream || branch.subject || branch.shortHash }}</small>
              </span>
              <Check v-if="branch.current" class="terminal-git-panel__row-icon" aria-hidden="true" />
            </button>
          </div>
        </section>

        <section class="terminal-git-panel__section">
          <header>
            <strong>{{ text('提交历史', 'Commits') }}</strong>
            <span>{{ status.commits.length }}</span>
          </header>
          <div class="terminal-git-panel__commits" role="list">
            <button
              v-for="commit in status.commits"
              :key="commit.hash"
              type="button"
              class="terminal-git-panel__commit-row"
              :class="{ active: selectedCommitHash === commit.hash }"
              role="listitem"
              :title="commit.hash"
              :disabled="operationBusy"
              @click="selectCommitFromPointer($event, commit.hash)"
              @contextmenu.prevent="openCommitContextMenu($event, commit.hash)"
              @pointerdown="startGitCommitLongPress($event, commit.hash)"
              @mouseenter="showCommitHoverPreview($event, commit.hash)"
              @mousemove="moveCommitHoverPreview($event)"
              @mouseleave="hideCommitHoverPreview"
              @focus="showCommitHoverPreview($event, commit.hash)"
              @blur="hideCommitHoverPreview"
            >
              <GitCommit class="terminal-resource-icon" aria-hidden="true" />
              <span>
                <strong>{{ commit.subject || commit.shortHash }}</strong>
                <small>{{ commit.shortHash }} · {{ commit.authorName }} · {{ formatDate(commit.date) }}</small>
              </span>
              <em v-if="commit.refs">{{ commit.refs }}</em>
            </button>
          </div>
        </section>
      </div>

      <div
        v-if="commitHoverVisible"
        class="terminal-git-panel__commit-popover"
        :style="commitHoverStyle"
        role="tooltip"
        aria-live="polite"
      >
        <div v-if="commitHoverLoading" class="terminal-git-panel__diff-state">
          {{ text('正在读取提交…', 'Reading commit...') }}
        </div>
        <div v-else-if="commitHoverErrorMessage" class="terminal-git-panel__diff-state terminal-git-panel__diff-state--error">
          {{ commitHoverErrorMessage }}
        </div>
        <template v-else>
          <strong>{{ commitHoverTitle }}</strong>
          <span>{{ commitHoverMeta }}</span>
          <pre>{{ commitHoverMessage }}</pre>
        </template>
      </div>

      <div
        v-if="gitContextMenu"
        class="terminal-git-context-menu"
        role="menu"
        :style="gitContextMenuStyle"
        @click.stop
        @contextmenu.prevent
      >
        <template v-if="gitContextMenu.kind === 'change'">
          <button
            type="button"
            role="menuitem"
            @click="previewContextChange"
          >
            <FileText class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('打开变更', 'Open Change') }}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="gitContextMenu.change.kind === 'deleted'"
            @click="openContextFile"
          >
            <FileText class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('打开文件', 'Open File') }}</span>
          </button>
          <button
            v-if="gitContextMenu.change.unstaged || gitContextMenu.change.kind === 'untracked'"
            type="button"
            role="menuitem"
            :disabled="operationBusy"
            @click="stageContextChange"
          >
            <Plus class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('暂存更改', 'Stage Change') }}</span>
          </button>
          <button
            v-if="gitContextMenu.change.staged"
            type="button"
            role="menuitem"
            :disabled="operationBusy"
            @click="unstageContextChange"
          >
            <Undo2 class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('取消暂存', 'Unstage Change') }}</span>
          </button>
          <span class="terminal-git-context-menu__divider" aria-hidden="true"></span>
          <button type="button" role="menuitem" @click="copyContextPath">
            <Copy class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('复制路径', 'Copy Path') }}</span>
          </button>
        </template>
        <template v-else-if="gitContextMenu.kind === 'branch'">
          <button
            type="button"
            role="menuitem"
            :disabled="operationBusy || gitContextMenu.current"
            @click="checkoutContextBranch"
          >
            <GitBranch class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('签出分支', 'Checkout Branch') }}</span>
          </button>
          <span class="terminal-git-context-menu__divider" aria-hidden="true"></span>
          <button type="button" role="menuitem" @click="copyContextBranch">
            <Copy class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('复制分支名', 'Copy Branch Name') }}</span>
          </button>
        </template>
        <template v-else>
          <button type="button" role="menuitem" :disabled="operationBusy" @click="checkoutContextCommit">
            <GitCommit class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('分离签出提交', 'Checkout Detached') }}</span>
          </button>
          <span class="terminal-git-context-menu__divider" aria-hidden="true"></span>
          <button type="button" role="menuitem" @click="copyContextCommit">
            <Copy class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('复制提交 ID', 'Copy Commit ID') }}</span>
          </button>
          <button type="button" role="menuitem" @click="copyContextCommitMessage">
            <Copy class="terminal-git-context-menu__icon" aria-hidden="true" />
            <span>{{ text('复制提交消息', 'Copy Commit Message') }}</span>
          </button>
        </template>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  FolderGit2,
  GitBranch,
  GitBranchPlus,
  GitCommit,
  Plus,
  RefreshCw,
  Undo2,
  X,
} from '@lucide/vue';
import type { FileRootSummary } from '../../../../../types/files';
import type {
  GitCommitDetailPayload,
  GitDiffPayload,
  GitFileChange,
  GitStatusPayload,
} from '../../../../../types/git';
import { useConfirmDialog } from '../../composables/useConfirmDialog';
import { copyTextToClipboard } from '../../shared/clipboard';
import { useLocalePreference } from '../../shared/locale';
import { fetchFilesSummary } from '../files/api';
import {
  checkoutGitTarget,
  commitGitChanges,
  createGitBranch,
  fetchGitCommitDetail,
  fetchGitDiff,
  fetchGitStatus,
  initGitRepository,
  stageGitPaths,
  unstageGitPaths,
} from './git-api';
import type { TerminalResourceTransferPayload } from './terminal-resource-transfer';

const props = defineProps<{
  workspaceScopeId: string;
  workspaceFallbackCwd: string | null;
}>();

const emit = defineEmits<{
  (event: 'previewFile', payload: TerminalResourceTransferPayload): void;
  (event: 'changeCountChange', count: number): void;
}>();

const { text } = useLocalePreference();
const { confirm } = useConfirmDialog();
const roots = ref<FileRootSummary[]>([]);
const rootId = ref('');
const directoryPath = ref('');
const status = ref<GitStatusPayload | null>(null);
const loading = ref(false);
const operationBusy = ref(false);
const operationMessage = ref('');
const operationKind = ref<'info' | 'success' | 'error'>('info');
const activeView = ref<'changes' | 'history'>('changes');
const commitMessage = ref('');
const newBranchName = ref('');
const selectedBranchName = ref('');
const selectedCommitHash = ref('');
const gitContextMenu = ref<GitContextMenu | null>(null);
const commitHoverDetail = ref<GitCommitDetailPayload | null>(null);
const commitHoverHash = ref('');
const commitHoverVisible = ref(false);
const commitHoverLoading = ref(false);
const commitHoverErrorMessage = ref('');
const commitHoverRequestSeq = ref(0);
const commitHoverPosition = ref({ x: 0, y: 0 });
const diffPreview = ref<GitDiffPayload | null>(null);
const diffPreviewChange = ref<GitFileChange | null>(null);
const diffPreviewSource = ref<GitChangeSource>('unstaged');
const diffLoading = ref(false);
const diffErrorMessage = ref('');
const diffRequestSeq = ref(0);

type GitChangeSource = 'staged' | 'unstaged';
type GitDiffLineKind = 'meta' | 'hunk' | 'addition' | 'deletion' | 'context';

type GitContextMenu =
  | { kind: 'change'; change: GitFileChange; source: GitChangeSource; x: number; y: number }
  | { kind: 'branch'; branchName: string; current: boolean; x: number; y: number }
  | { kind: 'commit'; commitHash: string; x: number; y: number };

type GitLongPressTarget =
  | { kind: 'change'; change: GitFileChange; source: GitChangeSource }
  | { kind: 'branch'; branchName: string; current: boolean }
  | { kind: 'commit'; commitHash: string };

interface GitContextMenuPoint {
  clientX: number;
  clientY: number;
}

interface GitLongPressState extends GitContextMenuPoint {
  pointerId: number;
  startX: number;
  startY: number;
  target: GitLongPressTarget;
  timer: ReturnType<typeof setTimeout>;
}

const GIT_LONG_PRESS_DELAY_MS = 520;
const GIT_LONG_PRESS_MOVE_TOLERANCE = 12;
let gitLongPress: GitLongPressState | null = null;
let suppressNextGitClick = false;

const statusLabel = computed(() => {
  if (loading.value) return text('读取中', 'Loading');
  if (!status.value?.available) return text('未连接仓库', 'No repository');
  return status.value.repositoryRelativePath || text('仓库根目录', 'Repository root');
});
const stagedChanges = computed(() =>
  (status.value?.changes || []).filter((change) => change.staged),
);
const unstagedChanges = computed(() =>
  (status.value?.changes || []).filter((change) => change.unstaged || change.kind === 'untracked'),
);
const changeSummary = computed(() => {
  const count = status.value?.changes.length || 0;
  return text(`${count} 个变更`, `${count} change(s)`);
});
const commitHoverSummary = computed(() =>
  (status.value?.commits || []).find((commit) => commit.hash === commitHoverHash.value) || null,
);
const commitHoverTitle = computed(() =>
  commitHoverDetail.value?.subject || commitHoverSummary.value?.subject || text('提交说明', 'Commit message'),
);
const commitHoverMeta = computed(() => {
  const detail = commitHoverDetail.value;
  if (detail) {
    return `${detail.shortHash} · ${detail.authorName} · ${formatDate(detail.date)}`;
  }
  const summary = commitHoverSummary.value;
  return summary ? `${summary.shortHash} · ${summary.authorName} · ${formatDate(summary.date)}` : '';
});
const commitHoverMessage = computed(() =>
  commitHoverDetail.value?.message || commitHoverSummary.value?.subject || '',
);
const selectedCommitSummary = computed(() =>
  (status.value?.commits || []).find((commit) => commit.hash === selectedCommitHash.value) || null,
);
const commitHoverStyle = computed(() => ({
  left: `${commitHoverPosition.value.x}px`,
  top: `${commitHoverPosition.value.y}px`,
}));
const diffPreviewTitle = computed(() => {
  const filePath = diffPreview.value?.path || diffPreviewChange.value?.path || '';
  return filePath ? fileNameOf(filePath) : text('变更预览', 'Change preview');
});
const diffPreviewMeta = computed(() => {
  if (diffLoading.value) return text('读取中', 'Loading');
  if (diffErrorMessage.value) return text('读取失败', 'Failed');
  const preview = diffPreview.value;
  const source = diffPreviewSource.value === 'staged'
    ? text('暂存区', 'Staged')
    : text('工作区', 'Working tree');
  if (!preview) return source;
  return [
    source,
    preview.untracked ? text('未跟踪', 'Untracked') : '',
    preview.binary ? text('二进制', 'Binary') : '',
    preview.truncated ? text('已截断', 'Truncated') : '',
  ].filter(Boolean).join(' · ');
});
const diffLines = computed(() =>
  (diffPreview.value?.diff || '').split(/\r?\n/).map((line, index) => ({
    id: `${index}:${line}`,
    text: line,
    kind: classifyDiffLine(line),
  })),
);
const gitContextMenuStyle = computed(() => {
  const menu = gitContextMenu.value;
  if (!menu) return {};
  return {
    left: `${menu.x}px`,
    top: `${menu.y}px`,
  };
});

watch(
  () => [props.workspaceScopeId, props.workspaceFallbackCwd] as const,
  () => {
    syncScopeFromWorkspace();
    void refresh();
  },
);

onMounted(async () => {
  document.addEventListener('pointerdown', closeGitContextMenuFromOutside, true);
  document.addEventListener('focusin', closeGitContextMenuFromOutside, true);
  globalThis.addEventListener('keydown', handleGitPanelKeydown);
  globalThis.addEventListener('resize', closeGitContextMenu);
  await loadRoots();
  syncScopeFromWorkspace();
  await refresh();
});

onBeforeUnmount(() => {
  cancelGitLongPress();
  document.removeEventListener('pointerdown', closeGitContextMenuFromOutside, true);
  document.removeEventListener('focusin', closeGitContextMenuFromOutside, true);
  globalThis.removeEventListener('keydown', handleGitPanelKeydown);
  globalThis.removeEventListener('resize', closeGitContextMenu);
});

async function loadRoots(): Promise<void> {
  const summary = await fetchFilesSummary();
  roots.value = summary.roots || [];
  rootId.value = summary.defaultRootId || roots.value[0]?.id || '';
}

function syncScopeFromWorkspace(): void {
  if (!roots.value.length) return;
  const fallbackCwd = String(props.workspaceFallbackCwd || '').trim();
  const matchedRoot = fallbackCwd ? resolveRootForAbsolutePath(fallbackCwd) : null;
  if (matchedRoot) {
    rootId.value = matchedRoot.root.id;
    directoryPath.value = matchedRoot.relativePath;
    return;
  }
  const requestedRoot = roots.value.find((root) => root.id === props.workspaceScopeId) || null;
  rootId.value = requestedRoot?.id || rootId.value || roots.value[0]?.id || '';
  directoryPath.value = '';
}

async function refresh(): Promise<void> {
  if (!rootId.value) return;
  loading.value = true;
  try {
    setStatus(await fetchGitStatus(rootId.value, directoryPath.value));
    if (!status.value?.available && shouldFallbackToProjectRoot()) {
      rootId.value = 'project-root';
      directoryPath.value = '';
      setStatus(await fetchGitStatus(rootId.value, directoryPath.value));
    }
  } finally {
    loading.value = false;
  }
}

function setStatus(payload: GitStatusPayload): void {
  status.value = payload;
  if (selectedBranchName.value && !payload.branches.some((branch) => branch.name === selectedBranchName.value)) {
    selectedBranchName.value = '';
  }
  if (selectedCommitHash.value && !payload.commits.some((commit) => commit.hash === selectedCommitHash.value)) {
    selectedCommitHash.value = '';
  }
  if (commitHoverHash.value && !payload.commits.some((commit) => commit.hash === commitHoverHash.value)) {
    hideCommitHoverPreview();
  }
  if (diffPreviewChange.value && !payload.changes.some((change) => change.path === diffPreviewChange.value?.path)) {
    closeDiffPreview();
  }
  emit('changeCountChange', payload.changes.length);
}

function shouldFallbackToProjectRoot(): boolean {
  if (rootId.value === 'project-root' || directoryPath.value) return false;
  return roots.value.some((root) => root.id === 'project-root');
}

async function runOperation(
  action: () => Promise<GitStatusPayload>,
  successMessage: string,
): Promise<void> {
  operationBusy.value = true;
  operationMessage.value = '';
  closeGitContextMenu();
  try {
    setStatus(await action());
    operationKind.value = 'success';
    operationMessage.value = successMessage;
  } catch (error) {
    operationKind.value = 'error';
    operationMessage.value = error instanceof Error ? error.message : text('Git 操作失败', 'Git operation failed');
  } finally {
    operationBusy.value = false;
  }
}

function gitRequestBase(): { rootId: string; path: string } {
  return {
    rootId: rootId.value,
    path: directoryPath.value,
  };
}

async function initRepository(): Promise<void> {
  await runOperation(
    () => initGitRepository(gitRequestBase()),
    text('仓库已初始化。', 'Repository initialized.'),
  );
}

async function stageAll(): Promise<void> {
  await runOperation(
    () => stageGitPaths(gitRequestBase()),
    text('已暂存全部更改。', 'All changes staged.'),
  );
}

async function unstageAll(): Promise<void> {
  await runOperation(
    () => unstageGitPaths(gitRequestBase()),
    text('已取消全部暂存。', 'All staged changes restored.'),
  );
}

async function stageChange(change: GitFileChange): Promise<void> {
  await runOperation(
    () => stageGitPaths({ ...gitRequestBase(), paths: [change.path] }),
    text('文件已暂存。', 'File staged.'),
  );
}

async function unstageChange(change: GitFileChange): Promise<void> {
  await runOperation(
    () => unstageGitPaths({ ...gitRequestBase(), paths: [change.path] }),
    text('文件已取消暂存。', 'File unstaged.'),
  );
}

async function commitChanges(): Promise<void> {
  const message = commitMessage.value.trim();
  if (!message) return;
  await runOperation(
    () => commitGitChanges({ ...gitRequestBase(), message }),
    text('提交完成。', 'Commit created.'),
  );
  if (operationKind.value === 'success') {
    commitMessage.value = '';
  }
}

async function createBranchFromInput(checkout: boolean): Promise<void> {
  const name = newBranchName.value.trim();
  if (!name) return;
  await runOperation(
    () => createGitBranch({ ...gitRequestBase(), name, checkout }),
    text('分支已创建。', 'Branch created.'),
  );
  if (operationKind.value === 'success') {
    newBranchName.value = '';
  }
}

async function checkoutBranch(target: string): Promise<void> {
  await runOperation(
    () => checkoutGitTarget({ ...gitRequestBase(), target }),
    text('已签出分支。', 'Branch checked out.'),
  );
}

async function checkoutCommit(target: string): Promise<void> {
  await runOperation(
    () => checkoutGitTarget({ ...gitRequestBase(), target, detach: true }),
    text('已分离签出提交。', 'Commit checked out detached.'),
  );
}

function selectBranch(branchName: string): void {
  selectedBranchName.value = branchName;
  selectedCommitHash.value = '';
}

function selectBranchFromPointer(event: MouseEvent, branchName: string): void {
  if (consumeSuppressedGitClick(event)) return;
  selectBranch(branchName);
}

function selectCommit(commitHash: string): void {
  selectedCommitHash.value = commitHash;
  selectedBranchName.value = '';
}

function selectCommitFromPointer(event: MouseEvent, commitHash: string): void {
  if (consumeSuppressedGitClick(event)) return;
  selectCommit(commitHash);
}

function previewChangeFromPointer(event: MouseEvent, change: GitFileChange): void {
  if (consumeSuppressedGitClick(event)) return;
  previewChange(change);
}

function openChangeContextMenu(event: MouseEvent, change: GitFileChange, source: GitChangeSource): void {
  openChangeContextMenuAt(event, change, source);
}

function openBranchContextMenu(event: MouseEvent, branchName: string, current: boolean): void {
  selectBranch(branchName);
  openBranchContextMenuAt(event, branchName, current);
}

function openCommitContextMenu(event: MouseEvent, commitHash: string): void {
  selectCommit(commitHash);
  openCommitContextMenuAt(event, commitHash);
}

function openChangeContextMenuAt(point: GitContextMenuPoint, change: GitFileChange, source: GitChangeSource): void {
  gitContextMenu.value = {
    kind: 'change',
    change,
    source,
    ...contextMenuPosition(point, 248, 224),
  };
}

function openBranchContextMenuAt(point: GitContextMenuPoint, branchName: string, current: boolean): void {
  gitContextMenu.value = {
    kind: 'branch',
    branchName,
    current,
    ...contextMenuPosition(point, 240, 132),
  };
}

function openCommitContextMenuAt(point: GitContextMenuPoint, commitHash: string): void {
  gitContextMenu.value = {
    kind: 'commit',
    commitHash,
    ...contextMenuPosition(point, 260, 212),
  };
}

function contextMenuPosition(point: GitContextMenuPoint, width: number, height: number): { x: number; y: number } {
  const viewportWidth = globalThis.innerWidth || 0;
  const viewportHeight = globalThis.innerHeight || 0;
  const x = viewportWidth > 0
    ? Math.min(point.clientX, Math.max(8, viewportWidth - width - 8))
    : point.clientX;
  const y = viewportHeight > 0
    ? Math.min(point.clientY, Math.max(8, viewportHeight - height - 8))
    : point.clientY;
  return { x: Math.max(8, x), y: Math.max(8, y) };
}

function startGitChangeLongPress(event: PointerEvent, change: GitFileChange, source: GitChangeSource): void {
  startGitLongPress(event, { kind: 'change', change, source });
}

function startGitBranchLongPress(event: PointerEvent, branchName: string, current: boolean): void {
  startGitLongPress(event, { kind: 'branch', branchName, current });
}

function startGitCommitLongPress(event: PointerEvent, commitHash: string): void {
  startGitLongPress(event, { kind: 'commit', commitHash });
}

function startGitLongPress(event: PointerEvent, target: GitLongPressTarget): void {
  if (event.pointerType === 'mouse' || event.button !== 0) return;
  cancelGitLongPress();
  gitLongPress = {
    pointerId: event.pointerId,
    target,
    startX: event.clientX,
    startY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
    timer: window.setTimeout(() => {
      const pending = gitLongPress;
      if (!pending) return;
      openGitLongPressContextMenu(pending);
      suppressNextGitClick = true;
      cancelGitLongPress();
    }, GIT_LONG_PRESS_DELAY_MS),
  };
  globalThis.addEventListener('pointermove', trackGitLongPress, { passive: true });
  globalThis.addEventListener('pointerup', cancelGitLongPress, { once: true });
  globalThis.addEventListener('pointercancel', cancelGitLongPress, { once: true });
}

function openGitLongPressContextMenu(pending: GitLongPressState): void {
  const target = pending.target;
  if (target.kind === 'change') {
    openChangeContextMenuAt(pending, target.change, target.source);
    return;
  }
  if (target.kind === 'branch') {
    selectBranch(target.branchName);
    openBranchContextMenuAt(pending, target.branchName, target.current);
    return;
  }
  selectCommit(target.commitHash);
  hideCommitHoverPreview();
  openCommitContextMenuAt(pending, target.commitHash);
}

function trackGitLongPress(event: PointerEvent): void {
  const pending = gitLongPress;
  if (!pending || event.pointerId !== pending.pointerId) return;
  pending.clientX = event.clientX;
  pending.clientY = event.clientY;
  const deltaX = Math.abs(event.clientX - pending.startX);
  const deltaY = Math.abs(event.clientY - pending.startY);
  if (deltaX > GIT_LONG_PRESS_MOVE_TOLERANCE || deltaY > GIT_LONG_PRESS_MOVE_TOLERANCE) {
    cancelGitLongPress();
  }
}

function cancelGitLongPress(): void {
  if (!gitLongPress) return;
  window.clearTimeout(gitLongPress.timer);
  gitLongPress = null;
  globalThis.removeEventListener('pointermove', trackGitLongPress);
  globalThis.removeEventListener('pointerup', cancelGitLongPress);
  globalThis.removeEventListener('pointercancel', cancelGitLongPress);
}

function consumeSuppressedGitClick(event: MouseEvent): boolean {
  if (!suppressNextGitClick) return false;
  suppressNextGitClick = false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function handleGitPanelClick(event: MouseEvent): void {
  if (consumeSuppressedGitClick(event)) return;
  closeGitContextMenu();
}

function closeGitContextMenu(): void {
  gitContextMenu.value = null;
}

function closeGitContextMenuFromOutside(event: Event): void {
  if (!gitContextMenu.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest('.terminal-git-context-menu')) return;
  closeGitContextMenu();
}

function handleGitPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeGitContextMenu();
  }
}

function contextChange(): GitFileChange | null {
  const menu = gitContextMenu.value;
  return menu?.kind === 'change' ? menu.change : null;
}

function contextChangeSource(): GitChangeSource {
  const menu = gitContextMenu.value;
  return menu?.kind === 'change' ? menu.source : 'unstaged';
}

async function previewContextChange(): Promise<void> {
  const change = contextChange();
  const source = contextChangeSource();
  closeGitContextMenu();
  if (change) await loadDiffPreview(change, source);
}

function openContextFile(): void {
  const change = contextChange();
  if (change) previewChange(change);
  closeGitContextMenu();
}

async function stageContextChange(): Promise<void> {
  const change = contextChange();
  if (!change) return;
  await stageChange(change);
}

async function unstageContextChange(): Promise<void> {
  const change = contextChange();
  if (!change) return;
  await unstageChange(change);
}

async function checkoutContextBranch(): Promise<void> {
  const menu = gitContextMenu.value;
  if (!menu || menu.kind !== 'branch' || menu.current) return;
  const branchName = menu.branchName;
  closeGitContextMenu();
  if (!await confirmCheckoutBranch(branchName)) return;
  await checkoutBranch(branchName);
}

async function checkoutContextCommit(): Promise<void> {
  const menu = gitContextMenu.value;
  if (!menu || menu.kind !== 'commit') return;
  const commitHash = menu.commitHash;
  closeGitContextMenu();
  if (!await confirmCheckoutCommit(commitHash)) return;
  await checkoutCommit(commitHash);
}

async function confirmCheckoutBranch(branchName: string): Promise<boolean> {
  const changeCount = status.value?.changes.length || 0;
  return await confirm({
    title: text('确认签出分支', 'Confirm checkout branch'),
    message: changeCount > 0
      ? text(
        `当前有 ${changeCount} 个未提交变更。确认切换到 ${branchName}？`,
        `There are ${changeCount} uncommitted change(s). Checkout ${branchName}?`,
      )
      : text(`切换到 ${branchName} 分支？`, `Checkout ${branchName}?`),
    confirmText: text('签出分支', 'Checkout branch'),
    cancelText: text('取消', 'Cancel'),
    tone: changeCount > 0 ? 'danger' : 'default',
  });
}

async function confirmCheckoutCommit(commitHash: string): Promise<boolean> {
  const changeCount = status.value?.changes.length || 0;
  return await confirm({
    title: text('确认分离签出提交', 'Confirm detached checkout'),
    message: changeCount > 0
      ? text(
        `当前有 ${changeCount} 个未提交变更。确认分离签出 ${commitHash}？`,
        `There are ${changeCount} uncommitted change(s). Checkout ${commitHash} detached?`,
      )
      : text(`分离签出 ${commitHash}？`, `Checkout ${commitHash} detached?`),
    confirmText: text('分离签出', 'Checkout detached'),
    cancelText: text('取消', 'Cancel'),
    tone: 'danger',
  });
}

async function copyContextPath(): Promise<void> {
  const change = contextChange();
  if (change) await copyTextToClipboard(change.path);
  closeGitContextMenu();
}

async function copyContextBranch(): Promise<void> {
  const menu = gitContextMenu.value;
  if (menu?.kind === 'branch') await copyTextToClipboard(menu.branchName);
  closeGitContextMenu();
}

async function copyContextCommit(): Promise<void> {
  const menu = gitContextMenu.value;
  if (menu?.kind === 'commit') await copyTextToClipboard(menu.commitHash);
  closeGitContextMenu();
}

async function copyContextCommitMessage(): Promise<void> {
  const menu = gitContextMenu.value;
  if (!menu || menu.kind !== 'commit') return;
  const message = await resolveCommitMessage(menu.commitHash);
  if (message) await copyTextToClipboard(message);
  closeGitContextMenu();
}

async function loadCommitHoverDetail(commitHash: string): Promise<void> {
  const normalizedHash = String(commitHash || '').trim();
  if (!normalizedHash) return;
  const requestSeq = commitHoverRequestSeq.value + 1;
  commitHoverRequestSeq.value = requestSeq;
  commitHoverLoading.value = true;
  commitHoverErrorMessage.value = '';
  try {
    const detail = await fetchGitCommitDetail(rootId.value, directoryPath.value, normalizedHash);
    if (commitHoverRequestSeq.value !== requestSeq) return;
    commitHoverDetail.value = detail;
  } catch (error) {
    if (commitHoverRequestSeq.value !== requestSeq) return;
    commitHoverDetail.value = null;
    commitHoverErrorMessage.value = error instanceof Error
      ? error.message
      : text('提交说明读取失败', 'Unable to read commit message');
  } finally {
    if (commitHoverRequestSeq.value === requestSeq) {
      commitHoverLoading.value = false;
    }
  }
}

async function resolveCommitMessage(commitHash: string): Promise<string> {
  const normalizedHash = String(commitHash || '').trim();
  if (!normalizedHash) return '';
  if (commitHoverDetail.value?.hash === normalizedHash && commitHoverDetail.value.message) {
    return commitHoverDetail.value.message;
  }
  const detail = await fetchGitCommitDetail(rootId.value, directoryPath.value, normalizedHash);
  if (commitHoverHash.value === normalizedHash) {
    commitHoverDetail.value = detail;
  }
  return detail.message || detail.subject || normalizedHash;
}

function showCommitHoverPreview(event: MouseEvent | FocusEvent, commitHash: string): void {
  const normalizedHash = String(commitHash || '').trim();
  if (!normalizedHash) return;
  commitHoverHash.value = normalizedHash;
  commitHoverVisible.value = true;
  commitHoverDetail.value = null;
  commitHoverErrorMessage.value = '';
  updateCommitHoverPosition(event);
  void loadCommitHoverDetail(normalizedHash);
}

function moveCommitHoverPreview(event: MouseEvent): void {
  if (!commitHoverVisible.value) return;
  updateCommitHoverPosition(event);
}

function hideCommitHoverPreview(): void {
  commitHoverVisible.value = false;
  commitHoverHash.value = '';
  commitHoverDetail.value = null;
  commitHoverErrorMessage.value = '';
  commitHoverLoading.value = false;
  commitHoverRequestSeq.value += 1;
}

function updateCommitHoverPosition(event: MouseEvent | FocusEvent): void {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const rect = target?.getBoundingClientRect();
  const clientX = event instanceof MouseEvent ? event.clientX : rect?.right || 0;
  const clientY = event instanceof MouseEvent ? event.clientY : rect?.top || 0;
  commitHoverPosition.value = {
    x: clampNumber(clientX + 14, 8, Math.max(8, (globalThis.innerWidth || 0) - 388)),
    y: clampNumber(clientY + 10, 8, Math.max(8, (globalThis.innerHeight || 0) - 260)),
  };
}

async function loadDiffPreview(change: GitFileChange, source: GitChangeSource): Promise<void> {
  const requestSeq = diffRequestSeq.value + 1;
  diffRequestSeq.value = requestSeq;
  diffPreviewChange.value = change;
  diffPreviewSource.value = source;
  diffPreview.value = null;
  diffErrorMessage.value = '';
  diffLoading.value = true;
  try {
    const preview = await fetchGitDiff(rootId.value, directoryPath.value, change.path, {
      staged: source === 'staged',
      untracked: change.kind === 'untracked',
    });
    if (diffRequestSeq.value !== requestSeq) return;
    diffPreview.value = preview;
  } catch (error) {
    if (diffRequestSeq.value !== requestSeq) return;
    diffErrorMessage.value = error instanceof Error
      ? error.message
      : text('变更读取失败', 'Unable to read change');
  } finally {
    if (diffRequestSeq.value === requestSeq) {
      diffLoading.value = false;
    }
  }
}

function openDiffFile(): void {
  const change = diffPreviewChange.value;
  if (change) previewChange(change);
}

function closeDiffPreview(): void {
  diffRequestSeq.value += 1;
  diffPreview.value = null;
  diffPreviewChange.value = null;
  diffErrorMessage.value = '';
  diffLoading.value = false;
}

function classifyDiffLine(line: string): GitDiffLineKind {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
    return 'meta';
  }
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'addition';
  if (line.startsWith('-')) return 'deletion';
  return 'context';
}

function resolveRootForAbsolutePath(absolutePath: string): { root: FileRootSummary; relativePath: string } | null {
  const normalized = normalizePath(absolutePath);
  const candidates = roots.value
    .map((root) => ({
      root,
      absolutePath: normalizePath(root.absolutePath),
    }))
    .filter((item) =>
      normalized === item.absolutePath ||
      normalized.startsWith(`${item.absolutePath}/`),
    )
    .sort((left, right) => right.absolutePath.length - left.absolutePath.length);
  const match = candidates[0] || null;
  if (!match) return null;
  return {
    root: match.root,
    relativePath: normalized === match.absolutePath
      ? ''
      : normalized.slice(match.absolutePath.length + 1),
  };
}

function previewChange(change: GitFileChange): void {
  if (change.kind === 'deleted') return;
  const repositoryRoot = status.value?.repositoryRoot || '';
  emit('previewFile', {
    rootId: rootId.value,
    path: repositoryRelativeToRootPath(change.path),
    absolutePath: repositoryRoot ? joinPortablePath(repositoryRoot, change.path) : change.path,
    kind: 'file',
    name: fileNameOf(change.path),
  });
}

function repositoryRelativeToRootPath(filePath: string): string {
  const repositoryRoot = normalizePath(status.value?.repositoryRoot || '');
  const root = roots.value.find((item) => item.id === rootId.value) || null;
  const rootPath = normalizePath(root?.absolutePath || '');
  if (!repositoryRoot || !rootPath) return filePath;
  const absolutePath = joinPortablePath(repositoryRoot, filePath);
  if (absolutePath === rootPath) return '';
  if (absolutePath.startsWith(`${rootPath}/`)) {
    return absolutePath.slice(rootPath.length + 1);
  }
  return filePath;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/g, '');
}

function joinPortablePath(basePath: string, relativePath: string): string {
  const base = normalizePath(basePath);
  const relative = normalizePath(relativePath).replace(/^\/+/g, '');
  return relative ? `${base}/${relative}` : base;
}

function fileNameOf(filePath: string): string {
  return filePath.split('/').filter(Boolean).pop() || filePath;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function statusCode(change: GitFileChange): string {
  if (change.status === '??') return 'U';
  return change.status.trim() || change.kind.slice(0, 1).toUpperCase();
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return '';
  }
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return '';
  }
}
</script>
