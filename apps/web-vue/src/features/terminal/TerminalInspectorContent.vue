<template>
  <div class="terminal-inspector-content">
    <section class="terminal-inspector-command-pane">
      <div class="terminal-inspector-section-header">
        <div>
          <h3>{{ text('终端控制塔', 'Terminal Control Tower') }}</h3>
          <p>{{ text('快速启动 CLI、查看技能依赖缺口，并把常用动作落到独立终端标签里。', 'Launch CLIs quickly, inspect missing dependencies, and route common actions into dedicated terminal tabs.') }}</p>
        </div>
        <div class="terminal-inspector-summary-actions">
          <button
            v-if="compactMode"
            type="button"
            class="secondary-button compact-button"
            @click="$emit('toggleSummary')"
          >
            {{ summaryExpanded ? text('收起摘要', 'Collapse Summary') : text('展开摘要', 'Expand Summary') }}
          </button>
          <button type="button" class="secondary-button compact-button" :disabled="inspectorBusy" @click="$emit('refresh')">
            {{ text('刷新状态', 'Refresh Status') }}
          </button>
        </div>
      </div>

      <div v-if="showExpandedSummary" class="terminal-inspector-summary-grid">
        <div class="terminal-summary-stat">
          <span class="terminal-summary-stat__label">{{ text('当前会话', 'Current Session') }}</span>
          <strong>{{ activeSessionTitle }}</strong>
        </div>
        <div class="terminal-summary-stat">
          <span class="terminal-summary-stat__label">{{ text('运行实例', 'Live Instances') }}</span>
          <strong>{{ sessionCount }}</strong>
        </div>
        <div class="terminal-summary-stat">
          <span class="terminal-summary-stat__label">{{ text('缺失依赖', 'Missing Deps') }}</span>
          <strong>{{ missingBinaryCount }}</strong>
        </div>
        <div class="terminal-summary-stat">
          <span class="terminal-summary-stat__label">{{ text('待配置技能', 'Needs Setup') }}</span>
          <strong>{{ needsSetupCount }}</strong>
        </div>
        <div class="terminal-summary-stat">
          <span class="terminal-summary-stat__label">{{ text('阻塞技能', 'Blocked Skills') }}</span>
          <strong>{{ blockedCount }}</strong>
        </div>
        <div class="terminal-summary-stat">
          <span class="terminal-summary-stat__label">{{ text('默认模型', 'Default Model') }}</span>
          <strong>{{ runtimeModelLabel }}</strong>
        </div>
      </div>
      <div v-else class="terminal-summary-inline">
        <span class="terminal-summary-inline__chip">{{ text('会话', 'Session') }} {{ activeSessionTitle }}</span>
        <span class="terminal-summary-inline__chip">{{ text('依赖', 'Deps') }} {{ missingBinaryCount }}</span>
        <span class="terminal-summary-inline__chip">{{ text('实例', 'Instances') }} {{ sessionCount }}</span>
      </div>

      <div v-if="showExpandedSummary" class="terminal-inspector-tooling-actions">
        <button type="button" class="secondary-button compact-button" :disabled="!launchableCliIds.includes('claude')" @click="$emit('launchCli', 'claude')">Claude</button>
        <button type="button" class="secondary-button compact-button" :disabled="!launchableCliIds.includes('codex')" @click="$emit('launchCli', 'codex')">Codex</button>
        <button type="button" class="secondary-button compact-button" :disabled="!launchableCliIds.includes('opencode')" @click="$emit('launchCli', 'opencode')">OpenCode</button>
        <button type="button" class="secondary-button compact-button" :disabled="!launchableCliIds.includes('bash')" @click="$emit('launchCli', 'bash')">{{ text('终端', 'Shell') }}</button>
      </div>
    </section>

    <nav class="terminal-inspector-switcher" aria-label="Terminal inspector sections">
      <button
        v-for="item in inspectorSections"
        :key="item.key"
        type="button"
        class="terminal-inspector-switcher__button"
        :class="{ active: inspectorSection === item.key }"
        @click="$emit('selectSection', item.key)"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.count }}</strong>
      </button>
    </nav>

    <section v-if="inspectorSection === 'tools'" class="terminal-inspector-tooling">
      <div class="terminal-inspector-section-header">
        <div>
          <h3>{{ text('Agent CLI / 技能', 'Agent CLI / Skills') }}</h3>
          <p>{{ text('Agent CLI、技能市场工具和缺失技能依赖都在这里处理。', 'Manage agent CLIs, marketplace tools, and missing skill dependencies here.') }}</p>
        </div>
      </div>

      <div v-if="visibleBinaries.length" class="terminal-binary-list">
        <section
          v-for="binary in visibleBinaries"
          :key="binary.id"
          class="terminal-binary-row"
          :data-installed="binary.installed ? 'true' : 'false'"
        >
          <div class="terminal-binary-row__head">
            <div class="terminal-binary-row__title-wrap">
              <strong>{{ binary.label }}</strong>
              <span class="terminal-binary-row__category">{{ resolveBinaryCategoryLabel(binary.category) }}</span>
            </div>
            <span class="terminal-tooling-status-chip" :data-installed="binary.installed ? 'true' : 'false'">
              {{ binary.installed ? text('已安装', 'Installed') : text('未安装', 'Missing') }}
            </span>
          </div>

          <div class="terminal-binary-row__meta">
            <span v-if="binary.path">{{ text('路径', 'Path') }}: {{ binary.path }}</span>
            <span v-else>{{ text('命令', 'Command') }}: {{ binary.binary }}</span>
            <span v-if="binary.version">{{ text('版本', 'Version') }}: {{ binary.version }}</span>
            <span v-if="binary.packageName">{{ text('包', 'Package') }}: {{ binary.packageName }}</span>
          </div>

          <div class="terminal-binary-row__actions">
            <button
              type="button"
              class="secondary-button compact-button"
              :disabled="!openableBinaryIds.includes(binary.id)"
              @click="$emit('openBinary', binary.id)"
            >
              {{ text('新标签打开', 'Open In New Tab') }}
            </button>
            <button
              v-if="installableBinaryIds.includes(binary.id)"
              type="button"
              class="secondary-button compact-button"
              @click="$emit('installBinary', binary.id)"
            >
              {{ text('注入安装命令', 'Inject Install Command') }}
            </button>
          </div>
        </section>
      </div>

      <div v-else class="terminal-empty-state">{{ text('尚未检测到可展示的 CLI 工具状态。', 'No CLI tool status is available yet.') }}</div>

      <div v-if="installFeedback.message || installFeedback.logs.length" class="terminal-install-feedback" :data-kind="installFeedback.kind">
        <div class="terminal-install-feedback__summary">
          <div>
            <strong>{{ installFeedback.message || text('安装反馈', 'Install feedback') }}</strong>
            <p>
              {{
                installFeedback.logs.length
                  ? text('完整命令和输出已放入浮动窗口，避免终端面板被日志挤满。', 'Full commands and output are available in the floating window so the terminal panel stays focused.')
                  : text('安装动作已记录。', 'Install action recorded.')
              }}
            </p>
            <span v-if="installFeedback.logs.length">{{ installOutputMeta }}</span>
          </div>
          <button
            v-if="installFeedback.logs.length"
            type="button"
            class="secondary-button compact-button"
            @click="openInstallOutputSheet"
          >
            <Terminal class="terminal-install-output-button-icon" aria-hidden="true" />
            {{ text('打开输出', 'Open output') }}
          </button>
        </div>
      </div>
    </section>

    <section v-else-if="inspectorSection === 'dependencies'" class="terminal-missing-deps-panel">
      <div v-if="missingDependencyRows.length" class="terminal-missing-deps">
        <div class="terminal-inspector-section-header terminal-inspector-section-header--compact">
          <div>
            <h3>{{ text('缺失技能依赖', 'Missing Skill Dependencies') }}</h3>
            <p>{{ text('下面列出具体缺失的二进制及受影响技能，不再只显示数量。', 'This panel lists each missing binary and the affected skills instead of only showing a count.') }}</p>
          </div>
        </div>

        <ul class="terminal-missing-deps__list">
          <li v-for="item in missingDependencyRows" :key="item.binary" class="terminal-missing-deps__item">
            <div class="terminal-missing-deps__head">
              <strong>{{ item.label }}</strong>
              <button
                v-if="item.binaryId && installableBinaryIds.includes(item.binaryId)"
                type="button"
                class="secondary-button compact-button"
                @click="$emit('installBinary', item.binaryId)"
              >
                {{ text('安装', 'Install') }}
              </button>
            </div>
            <div class="terminal-missing-deps__binary">{{ text('命令', 'Command') }}: {{ item.binary }}</div>
            <div class="terminal-missing-deps__skills">
              <span v-for="skill in item.skills" :key="`${item.binary}-${skill}`" class="terminal-skill-chip">
                {{ skill }}
              </span>
            </div>
          </li>
        </ul>
      </div>

      <section v-else class="terminal-missing-deps terminal-missing-deps--ok">
        <strong>{{ text('技能依赖已就绪', 'Skill Dependencies Ready') }}</strong>
        <div>{{ text('当前没有检测到缺失的技能二进制依赖。', 'No missing skill binaries were detected.') }}</div>
      </section>
    </section>

    <TerminalActionPanel
      v-else-if="inspectorSection === 'actions'"
      :action-layers="actionLayers"
      @trigger="$emit('triggerAction', $event)"
    />

    <section v-else class="terminal-inspector-session-panel">
      <TerminalSessionExplorer
        :open-sessions="openSessions"
        :recent-sessions="recentSessions"
        :ended-sessions="endedSessions"
        :active-session-id="activeSessionId"
        @select="$emit('selectSession', $event)"
        @end-session="$emit('endSession', $event)"
        @delete-session="$emit('deleteSession', $event)"
      />
    </section>

    <Teleport v-if="installOutputOpen && installFeedback.logs.length" to="body">
      <div class="terminal-install-output-dock">
        <section
          class="terminal-install-output-sheet"
          role="dialog"
          aria-live="polite"
          aria-modal="false"
          :aria-label="text('安装输出窗口', 'Install output window')"
        >
          <header class="terminal-install-output-head">
            <div>
              <p class="eyebrow">{{ text('安装输出', 'Install Output') }}</p>
              <h3>{{ installFeedback.message || text('安装反馈', 'Install feedback') }}</h3>
              <span>{{ installOutputMeta }}</span>
            </div>
            <div class="terminal-install-output-actions">
              <button type="button" class="secondary-button compact-button" @click="copyInstallOutput">
                <Copy class="terminal-install-output-button-icon" aria-hidden="true" />
                {{ installOutputCopied ? text('已复制', 'Copied') : text('复制输出', 'Copy output') }}
              </button>
              <button type="button" class="secondary-button compact-button" @click="closeInstallOutputSheet">
                <X class="terminal-install-output-button-icon" aria-hidden="true" />
                {{ text('关闭', 'Close') }}
              </button>
            </div>
          </header>
          <pre class="terminal-install-output-log">{{ installOutputText }}</pre>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Copy, Terminal, X } from '@lucide/vue';
import type {
  TerminalBinaryId,
  TerminalBinaryStatus,
  TerminalLaunchCli,
} from '../../../../../types/terminal';
import { copyTextToClipboard } from '../../shared/clipboard';
import { useLocalePreference } from '../../shared/locale';
import TerminalActionPanel from './TerminalActionPanel.vue';
import TerminalSessionExplorer from './TerminalSessionExplorer.vue';
import type { TerminalActionLayer } from './terminal-action-catalog';
import type { TerminalSessionDescriptor } from './terminal-session-registry';

type InspectorSectionKey = 'tools' | 'dependencies' | 'actions' | 'sessions';
const { text } = useLocalePreference();

defineEmits<{
  (e: 'toggleSummary'): void;
  (e: 'refresh'): void;
  (e: 'selectSection', section: InspectorSectionKey): void;
  (e: 'launchCli', cli: TerminalLaunchCli): void;
  (e: 'openBinary', binaryId: TerminalBinaryId): void;
  (e: 'installBinary', binaryId: TerminalBinaryId): void;
  (e: 'triggerAction', actionKey: string): void;
  (e: 'selectSession', sessionId: string): void;
  (e: 'endSession', sessionId: string): void;
  (e: 'deleteSession', sessionId: string): void;
}>();

function resolveBinaryCategoryLabel(category: TerminalBinaryStatus['category']): string {
  if (category === 'marketplace') return text('技能市场', 'Marketplace');
  if (category === 'shell') return 'Shell';
  return 'Agent CLI';
}

const props = defineProps<{
  compactMode: boolean;
  summaryExpanded: boolean;
  inspectorBusy: boolean;
  activeSessionTitle: string;
  sessionCount: number;
  missingBinaryCount: number;
  needsSetupCount: number;
  blockedCount: number;
  runtimeModelLabel: string;
  launchableCliIds: TerminalLaunchCli[];
  inspectorSections: Array<{ key: InspectorSectionKey; label: string; count: number }>;
  inspectorSection: InspectorSectionKey;
  visibleBinaries: TerminalBinaryStatus[];
  openableBinaryIds: TerminalBinaryId[];
  installableBinaryIds: TerminalBinaryId[];
  missingDependencyRows: Array<{
    binary: string;
    label: string;
    binaryId: TerminalBinaryId | null;
    skills: string[];
  }>;
  installFeedback: {
    kind: 'info' | 'success' | 'error';
    message: string;
    logs: string[];
  };
  actionLayers: TerminalActionLayer[];
  openSessions: TerminalSessionDescriptor[];
  recentSessions: TerminalSessionDescriptor[];
  endedSessions: TerminalSessionDescriptor[];
  activeSessionId: string | null;
}>();

const showExpandedSummary = computed(() => !props.compactMode || props.summaryExpanded);
const installOutputOpen = ref(false);
const installOutputCopied = ref(false);
const installOutputText = computed(() => stripAnsi(props.installFeedback.logs.join('\n')));
const installOutputMeta = computed(() => {
  const lineCount = props.installFeedback.logs.length;
  const charCount = installOutputText.value.length;
  return text(
    `${lineCount} 行 · ${charCount} 字符`,
    `${lineCount} lines · ${charCount} chars`,
  );
});

watch(
  () => props.installFeedback.logs.join('\n'),
  (next, previous) => {
    installOutputCopied.value = false;
    if (next && next !== previous) {
      installOutputOpen.value = true;
    } else if (!next) {
      installOutputOpen.value = false;
    }
  },
);

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function openInstallOutputSheet(): void {
  installOutputCopied.value = false;
  installOutputOpen.value = true;
}

function closeInstallOutputSheet(): void {
  installOutputOpen.value = false;
}

async function copyInstallOutput(): Promise<void> {
  const copied = await copyTextToClipboard(installOutputText.value);
  if (!copied) return;
  installOutputCopied.value = true;
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      installOutputCopied.value = false;
    }, 1400);
  }
}
</script>
