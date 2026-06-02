<template>
  <div class="terminal-inspector-content">
    <div class="terminal-inspector-commandbar">
      <div class="terminal-inspector-commandbar__tools">
        <details
          v-if="profileItemCount"
          ref="profileMenuRef"
          class="terminal-inspector-profile-menu"
          :open="activeInspectorMenu === 'profiles'"
          @toggle="handleInspectorMenuToggle('profiles')"
          @keydown.esc.stop.prevent="closeInspectorMenus"
        >
          <summary
            class="secondary-button compact-button terminal-inspector-profile-menu__trigger"
            :aria-label="text('打开终端配置菜单', 'Open terminal profile menu')"
            :aria-expanded="activeInspectorMenu === 'profiles'"
            :title="text('配置', 'Profiles')"
            @click.prevent.stop="toggleInspectorMenu('profiles')"
          >
            <SlidersHorizontal class="terminal-inspector-commandbar__icon" aria-hidden="true" />
            <span class="sr-only">{{ text('配置', 'Profiles') }}</span>
            <strong>{{ profileItemCount }}</strong>
          </summary>
          <div class="terminal-inspector-profile-menu__panel" role="menu" @click.stop>
            <header class="terminal-inspector-menu-head">
              <strong>{{ text('配置', 'Profiles') }}</strong>
              <button
                type="button"
                class="terminal-inspector-menu-head__close"
                :aria-label="text('关闭菜单', 'Close menu')"
                @click="closeInspectorMenus"
              >
                <X class="terminal-inspector-commandbar__icon" aria-hidden="true" />
              </button>
            </header>
            <button
              v-for="profile in launchableTerminalProfiles"
              :key="profile.id"
              type="button"
              role="menuitem"
              class="terminal-inspector-profile-item"
              :class="{ active: profile.id === activeProfileId }"
              :data-kind="profile.kind"
              :data-color="profile.color"
              :title="text(profile.descriptionZh || profile.description, profile.description)"
              @click="launchProfileFromMenu(profile.id)"
            >
              <span class="terminal-inspector-profile-item__dot" aria-hidden="true"></span>
              <span class="terminal-inspector-profile-item__copy">
                <strong>{{ text(profile.labelZh || profile.label, profile.label) }}</strong>
                <small>{{ resolveProfileKindLabel(profile.kind) }}</small>
              </span>
            </button>
          </div>
        </details>

        <details
          v-if="actionItemCount"
          ref="actionMenuRef"
          class="terminal-inspector-command-menu"
          :open="activeInspectorMenu === 'commands'"
          @toggle="handleInspectorMenuToggle('commands')"
          @keydown.esc.stop.prevent="closeInspectorMenus"
        >
          <summary
            class="secondary-button compact-button terminal-inspector-command-menu__trigger"
            :aria-label="text('打开终端命令菜单', 'Open terminal command menu')"
            :aria-expanded="activeInspectorMenu === 'commands'"
            :title="text('命令', 'Commands')"
            @click.prevent.stop="toggleInspectorMenu('commands')"
          >
            <Command class="terminal-inspector-commandbar__icon" aria-hidden="true" />
            <span class="sr-only">{{ text('命令', 'Commands') }}</span>
            <strong>{{ actionItemCount }}</strong>
          </summary>
          <div class="terminal-inspector-command-menu__panel" role="menu" @click.stop>
            <header class="terminal-inspector-menu-head">
              <strong>{{ text('命令', 'Commands') }}</strong>
              <button
                type="button"
                class="terminal-inspector-menu-head__close"
                :aria-label="text('关闭菜单', 'Close menu')"
                @click="closeInspectorMenus"
              >
                <X class="terminal-inspector-commandbar__icon" aria-hidden="true" />
              </button>
            </header>
            <section
              v-for="layer in actionLayers"
              :key="layer.key"
              class="terminal-inspector-command-group"
            >
              <p>{{ text(layer.titleZh, layer.titleEn) }}</p>
              <button
                v-for="item in layer.items"
                :key="item.key"
                type="button"
                class="terminal-inspector-command-item"
                role="menuitem"
                @click="triggerActionFromMenu(item.key)"
              >
                <span class="terminal-inspector-command-item__copy">
                  <strong>{{ text(item.labelZh, item.labelEn) }}</strong>
                  <small>{{ text(item.descriptionZh, item.descriptionEn) }}</small>
                </span>
                <code>{{ item.command }}</code>
              </button>
            </section>
          </div>
        </details>

        <button
          type="button"
          class="secondary-button compact-button terminal-inspector-refresh"
          :disabled="inspectorBusy"
          :aria-label="text('刷新终端工具状态', 'Refresh terminal tool state')"
          :title="text('刷新', 'Refresh')"
          @click="refreshInspectorFromCommandbar"
        >
          <RefreshCw class="terminal-inspector-commandbar__icon" aria-hidden="true" />
          <span class="sr-only">{{ text('刷新', 'Refresh') }}</span>
        </button>
      </div>
    </div>

    <section class="terminal-inspector-tooling">
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
              v-if="openableBinaryIds.includes(binary.id)"
              type="button"
              class="secondary-button compact-button"
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

      <section v-if="missingDependencyRows.length" class="terminal-missing-deps">
        <div class="terminal-inspector-section-header terminal-inspector-section-header--compact">
          <div>
            <h3>{{ text('缺失技能依赖', 'Missing Skill Dependencies') }}</h3>
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
      </section>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Command,
  Copy,
  RefreshCw,
  SlidersHorizontal,
  Terminal,
  X,
} from '@lucide/vue';
import type {
  TerminalBinaryId,
  TerminalBinaryStatus,
  TerminalProfileDescriptor,
} from '../../../../../types/terminal';
import { copyTextToClipboard } from '../../shared/clipboard';
import { useLocalePreference } from '../../shared/locale';
import type { TerminalActionLayer } from './terminal-action-catalog';

type TerminalInspectorMenuKey = 'profiles' | 'commands';
const { text } = useLocalePreference();

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'launchProfile', profileId: string): void;
  (e: 'openBinary', binaryId: TerminalBinaryId): void;
  (e: 'installBinary', binaryId: TerminalBinaryId): void;
  (e: 'triggerAction', actionKey: string): void;
}>();

function resolveBinaryCategoryLabel(category: TerminalBinaryStatus['category']): string {
  if (category === 'marketplace') return text('技能市场', 'Marketplace');
  if (category === 'shell') return 'Shell';
  return 'Agent CLI';
}

function resolveProfileKindLabel(kind: TerminalProfileDescriptor['kind']): string {
  if (kind === 'agent') return 'Agent';
  if (kind === 'marketplace') return text('技能市场', 'Marketplace');
  if (kind === 'remote') return text('远程', 'Remote');
  if (kind === 'task') return text('任务', 'Task');
  return 'Shell';
}

const props = defineProps<{
  inspectorBusy: boolean;
  terminalProfiles: TerminalProfileDescriptor[];
  activeProfileId: string | null;
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
}>();

const launchableTerminalProfiles = computed(() =>
  props.terminalProfiles.filter((profile) => profile.launchable),
);
const profileMenuRef = ref<HTMLDetailsElement | null>(null);
const actionMenuRef = ref<HTMLDetailsElement | null>(null);
const activeInspectorMenu = ref<TerminalInspectorMenuKey | null>(null);
const profileItemCount = computed(() => launchableTerminalProfiles.value.length);
const actionItemCount = computed(() =>
  props.actionLayers.reduce((total, layer) => total + layer.items.length, 0),
);
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

function handleInspectorMenuToggle(menu: TerminalInspectorMenuKey): void {
  const targetMenu = getInspectorMenuRef(menu);
  if (!targetMenu) return;
  if (!targetMenu.open) {
    if (activeInspectorMenu.value === menu) {
      activeInspectorMenu.value = null;
    }
    return;
  }
  activeInspectorMenu.value = menu;
  closeOtherInspectorMenus(menu);
}

function toggleInspectorMenu(menu: TerminalInspectorMenuKey): void {
  activeInspectorMenu.value = activeInspectorMenu.value === menu ? null : menu;
}

function closeOtherInspectorMenus(openMenu: TerminalInspectorMenuKey): void {
  for (const menu of ['profiles', 'commands'] as const) {
    if (menu === openMenu) continue;
    const menuElement = getInspectorMenuRef(menu);
    if (menuElement) {
      menuElement.open = false;
    }
  }
}

function getInspectorMenuRef(menu: TerminalInspectorMenuKey): HTMLDetailsElement | null {
  if (menu === 'profiles') return profileMenuRef.value;
  return actionMenuRef.value;
}

function closeInspectorMenus(): void {
  activeInspectorMenu.value = null;
  for (const menu of ['profiles', 'commands'] as const) {
    const menuElement = getInspectorMenuRef(menu);
    if (menuElement) {
      menuElement.open = false;
    }
  }
}

function handleInspectorPointerDown(event: PointerEvent): void {
  const target = event.target instanceof Node ? event.target : null;
  if (!target) return;
  if (profileMenuRef.value?.contains(target) || actionMenuRef.value?.contains(target)) {
    return;
  }
  closeInspectorMenus();
}

function refreshInspectorFromCommandbar(): void {
  closeInspectorMenus();
  emit('refresh');
}

function launchProfileFromMenu(profileId: string): void {
  emit('launchProfile', profileId);
  closeInspectorMenus();
}

function triggerActionFromMenu(actionKey: string): void {
  emit('triggerAction', actionKey);
  closeInspectorMenus();
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

onMounted(() => {
  document.addEventListener('pointerdown', handleInspectorPointerDown);
  window.addEventListener('resize', closeInspectorMenus);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleInspectorPointerDown);
  window.removeEventListener('resize', closeInspectorMenus);
});
</script>
