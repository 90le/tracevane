<template>
  <section class="page-shell config-section-grid">
    <article class="config-sheet">
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('浏览器配置', 'Browser Configuration') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('Chrome / Chromium', 'Chrome / Chromium') }}</h4>
              <p>{{ text('补齐真实 browser 顶层配置，并支持直接编辑常用 profiles。', 'Covers the real top-level browser config and supports editing common profiles directly.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('CDP URL', 'CDP URL') }}</span>
                <input v-model="form.cdpUrl" class="form-input" type="text" placeholder="ws://127.0.0.1:9222/devtools/browser/..." />
                <span class="field-hint">{{ text('远程浏览器的顶层 CDP 地址；未填写时使用本地派生端口。', 'Top-level CDP endpoint for remote browsers. Leave empty to use the local derived port.') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('默认 Profile', 'Default Profile') }}</span>
                <input v-model="form.defaultProfile" class="form-input" type="text" placeholder="user" />
                <span class="field-hint">{{ text('OpenClaw browser.defaultProfile。未填写时跟随现有配置。', 'Maps to OpenClaw browser.defaultProfile. Leave empty to preserve the current config.') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('Chrome 路径', 'Chrome Path') }}</span>
                <input v-model="form.executablePath" class="form-input" type="text" placeholder="/usr/bin/google-chrome" />
                <span class="field-hint">{{ text('Chrome 或 Chromium 可执行文件路径', 'Path to Chrome or Chromium executable') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('启动额外参数', 'Extra Launch Args') }}</span>
                <textarea v-model="form.extraArgsText" class="form-textarea" rows="4" :placeholder="text('每行一个，例如：--disable-gpu', 'One per line, e.g. --disable-gpu')" />
                <span class="field-hint">{{ text('会写入 browser.extraArgs。', 'Saved to browser.extraArgs.') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('主题色', 'Theme Color') }}</span>
                <input v-model="form.color" class="form-input" type="text" placeholder="#FF4500" />
                <span class="field-hint">{{ text('可选，用于 browser.color。', 'Optional. Maps to browser.color.') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('CDP 端口起点', 'CDP Port Range Start') }}</span>
                <input v-model.number="form.cdpPortRangeStart" class="form-input" type="number" min="1" max="65535" />
                <span class="field-hint">{{ text('本地自动分配 profile 端口的起点。', 'Starting port for auto-assigned local browser profiles.') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('远程 CDP HTTP 超时 (ms)', 'Remote CDP HTTP Timeout (ms)') }}</span>
                <input v-model.number="form.remoteCdpTimeoutMs" class="form-input" type="number" min="0" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('远程 CDP 握手超时 (ms)', 'Remote CDP Handshake Timeout (ms)') }}</span>
                <input v-model.number="form.remoteCdpHandshakeTimeoutMs" class="form-input" type="number" min="0" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('默认快照模式', 'Default Snapshot Mode') }}</span>
                <GlassSelect v-model="form.snapshotMode" :options="snapshotModeOptions" />
                <span class="field-hint">{{ text('对应 browser.snapshotDefaults.mode；留空表示跟随宿主默认。', 'Maps to browser.snapshotDefaults.mode. Leave empty to follow the host default.') }}</span>
              </label>
            </div>
            <div class="settings-stack">
              <div class="settings-inline-grid">
                <label class="toggle-card">
                  <input v-model="form.enabled" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('启用 Browser', 'Enable Browser') }}</strong>
                    <span>{{ text('关闭后相关 browser 工具不可用。', 'When disabled, browser tools are unavailable.') }}</span>
                  </div>
                </label>
                <label class="toggle-card">
                  <input v-model="form.evaluateEnabled" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('启用 Evaluate', 'Enable Evaluate') }}</strong>
                    <span>{{ text('控制 act:evaluate / wait --fn 之类的动态执行能力。', 'Controls dynamic evaluation features such as act:evaluate / wait --fn.') }}</span>
                  </div>
                </label>
                <label class="toggle-card">
                  <input v-model="form.headless" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('无头模式', 'Headless Mode') }}</strong>
                    <span>{{ text('不显示浏览器窗口', 'Run browser without visible window') }}</span>
                  </div>
                </label>
                <label class="toggle-card">
                  <input v-model="form.noSandbox" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('禁用沙盒', 'Disable Sandbox') }}</strong>
                    <span>{{ text('禁用 Chrome 沙盒（某些环境需要）', 'Disable Chrome sandbox (required in some environments)') }}</span>
                  </div>
                </label>
                <label class="toggle-card">
                  <input v-model="form.attachOnly" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('仅附着现有会话', 'Attach Only') }}</strong>
                    <span>{{ text('适合外部已存在浏览器实例的场景。', 'Useful when you want to attach to an already running browser session.') }}</span>
                  </div>
                </label>
              </div>
            </div>
          </section>

          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('标签清理', 'Tab Cleanup') }}</h4>
              <p>{{ text('对应 browser.tabCleanup.*，控制浏览器会话空闲标签的自动回收，避免长时间运行后标签堆积。', 'Maps to browser.tabCleanup.* and controls automatic cleanup of idle tabs to avoid tab buildup in long-running sessions.') }}</p>
            </div>
            <div class="settings-stack">
              <div class="settings-inline-grid">
                <label class="toggle-card">
                  <input v-model="form.tabCleanupEnabled" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('启用自动清理', 'Enable cleanup') }}</strong>
                    <span>{{ text('按空闲时间和单会话标签上限清理。', 'Clean tabs by idle time and per-session tab limit.') }}</span>
                  </div>
                </label>
              </div>
              <div class="form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('空闲分钟', 'Idle minutes') }}</span>
                  <input v-model.number="form.tabCleanupIdleMinutes" class="form-input" type="number" min="0" :placeholder="text('留空表示跟随宿主默认', 'Leave empty to follow host default')" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('每会话最大标签数', 'Max tabs per session') }}</span>
                  <input v-model.number="form.tabCleanupMaxTabsPerSession" class="form-input" type="number" min="1" :placeholder="text('留空表示跟随宿主默认', 'Leave empty to follow host default')" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('扫描间隔分钟', 'Sweep minutes') }}</span>
                  <input v-model.number="form.tabCleanupSweepMinutes" class="form-input" type="number" min="0" :placeholder="text('留空表示跟随宿主默认', 'Leave empty to follow host default')" />
                </label>
              </div>
            </div>
          </section>

          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('SSRF / 私网访问', 'SSRF / Private Network') }}</h4>
              <p>{{ text('对应 browser.ssrfPolicy；公网部署时建议按需收紧。', 'Maps to browser.ssrfPolicy; tighten it deliberately on public deployments.') }}</p>
            </div>
            <div class="settings-stack">
              <div class="settings-inline-grid">
                <label class="toggle-card">
                  <input v-model="form.allowPrivateNetwork" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('允许私网目标', 'Allow Private Networks') }}</strong>
                    <span>{{ text('关闭后只允许公网目标，除非命中显式 allowlist。', 'When disabled, only public targets are allowed unless explicitly allowlisted.') }}</span>
                  </div>
                </label>
              </div>
              <div class="form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('hostnameAllowlist', 'hostnameAllowlist') }}</span>
                  <textarea v-model="form.hostnameAllowlistText" class="form-textarea" rows="3" :placeholder="text('每行一个，例如：*.example.com', 'One per line, e.g. *.example.com')" />
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('allowedHostnames', 'allowedHostnames') }}</span>
                  <textarea v-model="form.allowedHostnamesText" class="form-textarea" rows="3" :placeholder="text('每行一个，例如：localhost', 'One per line, e.g. localhost')" />
                </label>
              </div>
            </div>
          </section>

          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('Browser Profiles', 'Browser Profiles') }}</h4>
              <p>{{ text('常用 profile 可以直接在这里维护。复杂矩阵仍可回到 raw config，但日常配置已经不需要跳出去。', 'Common profiles can be maintained directly here. Complex matrices can still live in raw config, but everyday changes no longer require leaving the page.') }}</p>
            </div>
            <div class="page-actions">
              <button type="button" class="secondary-button compact-button" @click="addProfile">
                {{ text('新增 Profile', 'Add Profile') }}
              </button>
            </div>
            <div v-if="form.profiles.length" class="settings-stack settings-stack-spaced">
              <article v-for="(profile, index) in form.profiles" :key="profile.uid" class="browser-profile-card">
                <div class="panel-head">
                  <div>
                    <h5>{{ profile.id || text(`Profile ${index + 1}`, `Profile ${index + 1}`) }}</h5>
                    <p class="panel-muted">{{ text('每个 profile 都可独立设置 driver、CDP、附着模式和 userDataDir。', 'Each profile can configure its own driver, CDP endpoint, attach mode, and userDataDir.') }}</p>
                  </div>
                  <button type="button" class="danger-link" @click="removeProfile(index)">
                    {{ text('移除', 'Remove') }}
                  </button>
                </div>
                <div class="form-grid">
                  <label class="form-field">
                    <span class="form-label">{{ text('Profile ID', 'Profile ID') }}</span>
                    <input v-model="profile.id" class="form-input" type="text" :placeholder="text('例如 chrome / user', 'For example chrome / user')" />
                    <span class="field-hint">{{ text('作用：作为 `browser.profiles.<id>` 的键，必须唯一。', 'Purpose: becomes the key under `browser.profiles.<id>` and must be unique.') }}</span>
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Driver', 'Driver') }}</span>
                    <GlassSelect v-model="profile.driver" :options="driverOptions" />
                    <span class="field-hint">{{ text('`openclaw` 由宿主管理；`existing-session` 适合接管现有浏览器。', '`openclaw` is host-managed; `existing-session` is for attaching to an existing browser.') }}</span>
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('CDP Port', 'CDP Port') }}</span>
                    <input v-model.number="profile.cdpPort" class="form-input" type="number" min="1" max="65535" :placeholder="text('留空表示不指定', 'Leave empty to omit')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('CDP URL', 'CDP URL') }}</span>
                    <input v-model="profile.cdpUrl" class="form-input" type="text" placeholder="ws://127.0.0.1:9222/devtools/browser/..." />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('User Data Dir', 'User Data Dir') }}</span>
                    <input v-model="profile.userDataDir" class="form-input" type="text" :placeholder="text('例如 ~/.config/google-chrome', 'For example ~/.config/google-chrome')" />
                  </label>
                  <label class="form-field">
                    <span class="form-label">{{ text('Profile 颜色', 'Profile Color') }}</span>
                    <input v-model="profile.color" class="form-input" type="text" placeholder="#FF4500" />
                    <span class="field-hint">{{ text('作用：用于 profile 颜色标识。建议填写十六进制颜色，例如 `#FF4500`。', 'Purpose: sets the profile accent color. Use a hex color such as `#FF4500`.') }}</span>
                  </label>
                </div>
                <div class="toggle-grid">
                  <label class="toggle-card">
                    <input v-model="profile.attachOnly" class="form-checkbox" type="checkbox" />
                    <div>
                      <strong>{{ text('仅附着', 'Attach Only') }}</strong>
                      <span>{{ text('只附着到现有浏览器，不负责启动。', 'Only attach to an existing browser session and do not launch a new browser.') }}</span>
                    </div>
                  </label>
                </div>
              </article>
            </div>
            <div v-else class="empty-inline">
              {{ text('当前还没有自定义 Browser Profiles。', 'No custom browser profiles are configured yet.') }}
            </div>
          </section>
        </div>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import GlassSelect, { type GlassSelectOption } from '../../shared/components/GlassSelect.vue';
import { createUuid } from '../../shared/uuid';
import type { ConfigSummaryPayload } from '../../../../../types/config';

const props = defineProps<{
  summary: ConfigSummaryPayload | null;
}>();

const { text } = useLocalePreference();

const form = reactive({
  enabled: true,
  evaluateEnabled: true,
  cdpUrl: '',
  remoteCdpTimeoutMs: 0,
  remoteCdpHandshakeTimeoutMs: 0,
  defaultProfile: '',
  attachOnly: false,
  cdpPortRangeStart: 0,
  executablePath: '',
  headless: false,
  noSandbox: false,
  extraArgsText: '',
  color: '',
  snapshotMode: '',
  tabCleanupEnabled: false,
  tabCleanupIdleMinutes: null as number | null,
  tabCleanupMaxTabsPerSession: null as number | null,
  tabCleanupSweepMinutes: null as number | null,
  allowPrivateNetwork: true,
  hostnameAllowlistText: '',
  allowedHostnamesText: '',
  profiles: [] as Array<{
    uid: string;
    id: string;
    driver: string;
    attachOnly: boolean;
    cdpPort: number | null;
    cdpUrl: string;
    userDataDir: string;
    color: string;
  }>,
});

const snapshotModeOptions: GlassSelectOption[] = [
  { value: '', label: text('跟随宿主默认', 'Follow host default') },
  { value: 'efficient', label: 'efficient' },
];

const driverOptions: GlassSelectOption[] = [
  { value: '', label: text('跟随宿主默认', 'Follow host default') },
  { value: 'openclaw', label: 'openclaw' },
  { value: 'clawd', label: 'clawd' },
  { value: 'existing-session', label: 'existing-session' },
];

function createEmptyProfile() {
  return {
    uid: createUuid('browser'),
    id: '',
    driver: '',
    attachOnly: false,
    cdpPort: null as number | null,
    cdpUrl: '',
    userDataDir: '',
    color: '',
  };
}

function hydrateFromSummary(summary: ConfigSummaryPayload) {
  const browser = summary.browser;
  form.enabled = browser?.enabled !== false;
  form.evaluateEnabled = browser?.evaluateEnabled !== false;
  form.cdpUrl = browser?.cdpUrl ?? '';
  form.remoteCdpTimeoutMs = browser?.remoteCdpTimeoutMs ?? 0;
  form.remoteCdpHandshakeTimeoutMs = browser?.remoteCdpHandshakeTimeoutMs ?? 0;
  form.defaultProfile = browser?.defaultProfile ?? '';
  form.attachOnly = browser?.attachOnly === true;
  form.cdpPortRangeStart = browser?.cdpPortRangeStart ?? 0;
  form.executablePath = browser?.executablePath ?? '';
  form.headless = browser?.headless ?? false;
  form.noSandbox = browser?.noSandbox ?? false;
  form.extraArgsText = (browser?.extraArgs || []).join('\n');
  form.color = browser?.color ?? '';
  form.snapshotMode = browser?.snapshotDefaults?.mode ?? '';
  form.tabCleanupEnabled = browser?.tabCleanup?.enabled === true;
  form.tabCleanupIdleMinutes = browser?.tabCleanup?.idleMinutes ?? null;
  form.tabCleanupMaxTabsPerSession = browser?.tabCleanup?.maxTabsPerSession ?? null;
  form.tabCleanupSweepMinutes = browser?.tabCleanup?.sweepMinutes ?? null;
  form.allowPrivateNetwork = browser?.ssrfPolicy?.dangerouslyAllowPrivateNetwork !== false;
  form.hostnameAllowlistText = (browser?.ssrfPolicy?.hostnameAllowlist || []).join('\n');
  form.allowedHostnamesText = (browser?.ssrfPolicy?.allowedHostnames || []).join('\n');
  form.profiles = Array.isArray(browser?.profiles)
    ? browser.profiles.map((item) => ({
        uid: createUuid('browser'),
        id: item.id,
        driver: item.driver ?? '',
        attachOnly: item.attachOnly === true,
        cdpPort: item.cdpPort ?? null,
        cdpUrl: item.cdpUrl ?? '',
        userDataDir: item.userDataDir ?? '',
        color: item.color ?? '',
      }))
    : [];
}

function addProfile() {
  form.profiles.push(createEmptyProfile());
}

function removeProfile(index: number) {
  form.profiles.splice(index, 1);
}

watch(() => props.summary, (summary) => {
  if (summary) hydrateFromSummary(summary);
}, { immediate: true });

function buildBrowserPayload() {
  return {
    enabled: form.enabled,
    evaluateEnabled: form.evaluateEnabled,
    cdpUrl: form.cdpUrl.trim() || undefined,
    remoteCdpTimeoutMs: form.remoteCdpTimeoutMs > 0 ? form.remoteCdpTimeoutMs : undefined,
    remoteCdpHandshakeTimeoutMs: form.remoteCdpHandshakeTimeoutMs > 0 ? form.remoteCdpHandshakeTimeoutMs : undefined,
    defaultProfile: form.defaultProfile.trim() || undefined,
    attachOnly: form.attachOnly,
    cdpPortRangeStart: form.cdpPortRangeStart > 0 ? form.cdpPortRangeStart : undefined,
    executablePath: form.executablePath,
    headless: form.headless,
    noSandbox: form.noSandbox,
    extraArgs: form.extraArgsText
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean),
    color: form.color.trim() || undefined,
    snapshotDefaults: {
      mode: form.snapshotMode.trim() || undefined,
    },
    tabCleanup: {
      enabled: form.tabCleanupEnabled,
      idleMinutes: form.tabCleanupIdleMinutes != null && form.tabCleanupIdleMinutes > 0 ? form.tabCleanupIdleMinutes : undefined,
      maxTabsPerSession: form.tabCleanupMaxTabsPerSession != null && form.tabCleanupMaxTabsPerSession > 0 ? form.tabCleanupMaxTabsPerSession : undefined,
      sweepMinutes: form.tabCleanupSweepMinutes != null && form.tabCleanupSweepMinutes > 0 ? form.tabCleanupSweepMinutes : undefined,
    },
    profiles: form.profiles
      .map((profile) => ({
        id: profile.id.trim(),
        driver: profile.driver.trim() || undefined,
        attachOnly: profile.attachOnly,
        cdpPort: profile.cdpPort != null && profile.cdpPort > 0 ? profile.cdpPort : undefined,
        cdpUrl: profile.cdpUrl.trim() || undefined,
        userDataDir: profile.userDataDir.trim() || undefined,
        color: profile.color.trim() || undefined,
      }))
      .filter((profile) => profile.id),
    ssrfPolicy: {
      dangerouslyAllowPrivateNetwork: form.allowPrivateNetwork,
      hostnameAllowlist: form.hostnameAllowlistText
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter(Boolean),
      allowedHostnames: form.allowedHostnamesText
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter(Boolean),
    },
  };
}

defineExpose({ buildBrowserPayload });
</script>
