<template>
  <section class="page-shell config-section-grid">
    <article class="panel-card config-sheet">
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('全局插件策略', 'Global Plugin Policy') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection is-primary">
            <div class="settings-stack">
              <label class="toggle-card">
                <input v-model="form.enabled" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('全局启用插件系统', 'Enable plugin loading globally') }}</strong>
                  <span>{{ text('作用：控制宿主是否在启动和重载时加载插件。关闭后，已配置的 entries 仍会保留，但不会真正加载。', 'Purpose: controls whether the host loads plugins during startup and reload. If disabled, configured entries remain but do not actually load.') }}</span>
                </div>
              </label>
            </div>
          </section>
        </div>
      </section>

      <!-- Plugin Allowlist -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('插件白名单', 'Plugin Allowlist') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('允许加载的插件 ID', 'Allowed plugin ids') }}</h4>
              <p>{{ text('作用：控制宿主只允许哪些插件被启用。配置方式：逐条填写插件 id；留空通常表示不强制限制。', 'Purpose: restricts which plugins the host is allowed to enable. How to configure: enter plugin ids one by one; leaving it empty usually means no hard allowlist is enforced.') }}</p>
            </div>
            <div v-if="form.allow.length" class="provider-stack">
              <div v-for="(item, idx) in form.allow" :key="'allow-' + idx" class="form-grid" style="align-items: center;">
                <label class="form-field" style="flex: 1;">
                  <input
                    :value="item"
                    @input="onAllowInput(idx, ($event.target as HTMLInputElement).value)"
                    class="form-input"
                    type="text"
                    :placeholder="text('插件 ID', 'Plugin ID')"
                  />
                </label>
                <button type="button" class="danger-link compact-button" @click="removeAllow(idx)">
                  {{ text('移除', 'Remove') }}
                </button>
              </div>
            </div>
            <div v-else class="empty-inline">
              {{ text('未配置插件白名单', 'No plugin allowlist configured') }}
            </div>
            <button type="button" class="secondary-button compact-button" style="margin-top: 0.5rem;" @click="addAllow">
              {{ text('添加', 'Add') }}
            </button>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('插件黑名单', 'Plugin Denylist') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('强制阻止的插件 ID', 'Force-blocked plugin ids') }}</h4>
              <p>{{ text('作用：无论白名单或扫描路径如何，黑名单里的插件都不会被加载。配置方式：逐条填写插件 id，用于紧急回滚或风险隔离。', 'Purpose: plugins in this list never load even if allowlists or scan paths would otherwise permit them. How to configure: enter plugin ids one by one for emergency rollback or risk isolation.') }}</p>
            </div>
            <div v-if="form.deny.length" class="provider-stack">
              <div v-for="(item, idx) in form.deny" :key="'deny-' + idx" class="form-grid" style="align-items: center;">
                <label class="form-field" style="flex: 1;">
                  <input
                    :value="item"
                    @input="onDenyInput(idx, ($event.target as HTMLInputElement).value)"
                    class="form-input"
                    type="text"
                    :placeholder="text('插件 ID', 'Plugin ID')"
                  />
                </label>
                <button type="button" class="danger-link compact-button" @click="removeDeny(idx)">
                  {{ text('移除', 'Remove') }}
                </button>
              </div>
            </div>
            <div v-else class="empty-inline">
              {{ text('未配置插件黑名单', 'No plugin denylist configured') }}
            </div>
            <button type="button" class="secondary-button compact-button" style="margin-top: 0.5rem;" @click="addDeny">
              {{ text('添加', 'Add') }}
            </button>
          </section>
        </div>
      </section>

      <!-- Load Paths -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('加载路径', 'Load Paths') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('额外插件搜索路径', 'Extra plugin search paths') }}</h4>
              <p>{{ text('作用：让宿主从额外目录加载插件。配置方式：填写绝对路径。不要把 `openclaw-studio.prev/.bak/.old` 这类备份目录留在扩展根下，否则会触发重复插件 ID。', 'Purpose: lets the host load plugins from additional directories. How to configure: use absolute paths. Do not leave backup folders like `openclaw-studio.prev/.bak/.old` under the extensions root, or duplicate plugin ids will be detected.') }}</p>
            </div>
            <div v-if="form.loadPaths.length" class="provider-stack">
              <div v-for="(item, idx) in form.loadPaths" :key="'path-' + idx" class="form-grid" style="align-items: center;">
                <label class="form-field" style="flex: 1;">
                  <input
                    :value="item"
                    @input="onLoadPathInput(idx, ($event.target as HTMLInputElement).value)"
                    class="form-input"
                    type="text"
                    :placeholder="text('插件加载路径', 'Plugin load path')"
                  />
                </label>
                <button type="button" class="danger-link compact-button" @click="removeLoadPath(idx)">
                  {{ text('移除', 'Remove') }}
                </button>
              </div>
            </div>
            <div v-else class="empty-inline">
              {{ text('未配置额外加载路径', 'No extra load paths configured') }}
            </div>
            <button type="button" class="secondary-button compact-button" style="margin-top: 0.5rem;" @click="addLoadPath">
              {{ text('添加', 'Add') }}
            </button>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('独占插槽', 'Exclusive Slots') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('Memory / Context Engine 插槽', 'Memory / Context Engine slots') }}</h4>
              <p>{{ text('作用：选择哪个插件独占提供 memory 或 context engine 这类只能有一个生效的能力。配置方式：填写插件 id；memory 可写 `none` 显式关闭。', 'Purpose: selects which plugin exclusively owns memory or context-engine capabilities that can only have one active provider. How to configure: enter a plugin id; memory may be set to `none` to disable it explicitly.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('Memory 插槽', 'Memory slot') }}</span>
                <input v-model="form.slots.memory" class="form-input" type="text" :placeholder="text('例如 memory-core 或 none', 'For example memory-core or none')" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('Context Engine 插槽', 'Context Engine slot') }}</span>
                <input v-model="form.slots.contextEngine" class="form-input" type="text" :placeholder="text('例如 context-engine-default', 'For example context-engine-default')" />
              </label>
            </div>
          </section>
        </div>
      </section>

      <!-- Registered Plugins -->
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('已注册插件', 'Registered Plugins') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('插件开关与额外配置', 'Plugin toggles and extra config') }}</h4>
              <p>{{ text('作用：控制 `plugins.entries.<id>` 的启用状态与插件私有配置。配置方式：关闭表示保留配置但不加载插件；JSON 区仅填写该插件文档声明的额外字段。', 'Purpose: manages `plugins.entries.<id>` enablement and plugin-specific config. How to configure: disabling keeps the config but prevents loading; only place plugin-documented extra fields in the JSON block.') }}</p>
            </div>
            <div v-if="pluginEntryIds.length" class="provider-stack">
              <article
                v-for="pluginId in pluginEntryIds"
                :key="pluginId"
                class="provider-card provider-card-visual"
              >
                <div class="provider-card-head provider-card-head-visual">
                  <div>
                    <strong>{{ pluginId }}</strong>
                  </div>
                  <label class="toggle-inline">
                    <input
                      :checked="form.entries[pluginId]?.enabled ?? true"
                      @change="onPluginEnabledChange(pluginId, ($event.target as HTMLInputElement).checked)"
                      class="form-checkbox"
                      type="checkbox"
                    />
                    <span>{{ form.entries[pluginId]?.enabled ? text('已启用', 'Enabled') : text('已禁用', 'Disabled') }}</span>
                  </label>
                </div>

                <div v-if="hasExtraConfig(pluginId)" class="settings-stack">
                  <label class="form-field">
                    <span class="form-label">{{ text('插件配置 (JSON)', 'Plugin Config (JSON)') }}</span>
                    <textarea
                      :value="pluginExtraJson(pluginId)"
                      @input="onPluginExtraJsonChange(pluginId, ($event.target as HTMLInputElement).value)"
                      class="form-textarea"
                      rows="4"
                      :placeholder="text('输入 JSON 格式的额外配置', 'Enter extra configuration in JSON format')"
                    />
                  </label>
                </div>
              </article>
            </div>
            <div v-else class="empty-inline">
              {{ text('当前没有已注册的插件。', 'No registered plugins.') }}
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('已跟踪安装记录', 'Tracked Install Records') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('CLI 管理的安装来源', 'CLI-managed install sources') }}</h4>
              <p>{{ text('作用：展示 `openclaw plugins install/update` 记录的来源和安装位置。此区域只读，避免手工改坏 CLI 更新链路。', 'Purpose: shows the sources and install paths tracked by `openclaw plugins install/update`. This area is read-only to avoid breaking the CLI update chain by manual edits.') }}</p>
            </div>
            <div v-if="form.installs.length" class="provider-stack">
              <article v-for="install in form.installs" :key="install.id" class="provider-card provider-card-visual">
                <div class="provider-card-head provider-card-head-visual">
                  <div>
                    <strong>{{ install.id }}</strong>
                    <p class="provider-caption">{{ install.source || text('未知来源', 'Unknown source') }}</p>
                  </div>
                  <span class="panel-muted">{{ install.version || install.resolvedVersion || text('无版本', 'No version') }}</span>
                </div>
                <div class="config-fact-list">
                  <div class="config-fact">
                    <span>Spec</span>
                    <strong>{{ install.resolvedSpec || install.spec || '—' }}</strong>
                  </div>
                  <div class="config-fact">
                    <span>{{ text('安装路径', 'Install path') }}</span>
                    <strong>{{ install.installPath || '—' }}</strong>
                  </div>
                  <div class="config-fact">
                    <span>{{ text('安装时间', 'Installed at') }}</span>
                    <strong>{{ install.installedAt || '—' }}</strong>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="empty-inline">
              {{ text('当前没有 CLI 跟踪的插件安装记录。', 'No CLI-tracked plugin install records are present.') }}
            </div>
          </section>
        </div>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import type { ConfigSummaryPayload } from '../../../../../types/config';

interface PluginEntry {
  enabled: boolean;
  config?: Record<string, unknown>;
}

interface PluginInstallRecord {
  id: string;
  source?: string;
  spec?: string;
  installPath?: string;
  version?: string;
  resolvedVersion?: string;
  resolvedSpec?: string;
  installedAt?: string;
}

interface PluginsFormState {
  enabled: boolean;
  allow: string[];
  deny: string[];
  loadPaths: string[];
  slots: {
    memory: string;
    contextEngine: string;
  };
  installs: PluginInstallRecord[];
  entries: Record<string, PluginEntry>;
}

const props = defineProps<{
  summary: ConfigSummaryPayload | null;
}>();

const { text } = useLocalePreference();

const form = reactive<PluginsFormState>({
  enabled: true,
  allow: [],
  deny: [],
  loadPaths: [],
  slots: {
    memory: '',
    contextEngine: '',
  },
  installs: [],
  entries: {},
});

const pluginEntryIds = computed(() => Object.keys(form.entries).sort());

function hydrateFromSummary(summary: ConfigSummaryPayload) {
  const plugins = (summary as Record<string, unknown>)?.plugins as Record<string, unknown> | undefined;
  if (!plugins) return;

  form.enabled = plugins.enabled !== false;
  form.allow = Array.isArray(plugins.allow) ? [...plugins.allow] : [];
  form.deny = Array.isArray(plugins.deny) ? [...plugins.deny] : [];
  form.loadPaths = Array.isArray(plugins.loadPaths) ? [...plugins.loadPaths] : [];
  form.slots.memory = typeof plugins.slots?.memory === 'string' ? plugins.slots.memory : '';
  form.slots.contextEngine = typeof plugins.slots?.contextEngine === 'string' ? plugins.slots.contextEngine : '';
  form.installs = Array.isArray(plugins.installs) ? [...plugins.installs as PluginInstallRecord[]] : [];

  const entries = (plugins.entries ?? {}) as Record<string, Record<string, unknown>>;
  const newEntries: Record<string, PluginEntry> = {};
  for (const [id, entry] of Object.entries(entries)) {
    const { enabled, ...rest } = entry;
    newEntries[id] = {
      enabled: enabled !== false,
      config: Object.keys(rest).length ? rest : undefined,
    };
  }
  form.entries = newEntries;
}

watch(() => props.summary, (summary) => {
  if (summary) hydrateFromSummary(summary);
}, { immediate: true });

// --- Allow list ---
function addAllow() {
  form.allow.push('');
}

function removeAllow(idx: number) {
  form.allow.splice(idx, 1);
}

function onAllowInput(idx: number, value: string) {
  form.allow[idx] = value;
}

function addDeny() {
  form.deny.push('');
}

function removeDeny(idx: number) {
  form.deny.splice(idx, 1);
}

function onDenyInput(idx: number, value: string) {
  form.deny[idx] = value;
}

// --- Load paths ---
function addLoadPath() {
  form.loadPaths.push('');
}

function removeLoadPath(idx: number) {
  form.loadPaths.splice(idx, 1);
}

function onLoadPathInput(idx: number, value: string) {
  form.loadPaths[idx] = value;
}

// --- Plugin entries ---
function onPluginEnabledChange(pluginId: string, enabled: boolean) {
  if (form.entries[pluginId]) {
    form.entries[pluginId].enabled = enabled;
  }
}

function hasExtraConfig(pluginId: string): boolean {
  const entry = form.entries[pluginId];
  return !!(entry?.config && Object.keys(entry.config).length);
}

function pluginExtraJson(pluginId: string): string {
  const entry = form.entries[pluginId];
  if (!entry?.config || !Object.keys(entry.config).length) return '';
  try {
    return JSON.stringify(entry.config, null, 2);
  } catch {
    return '';
  }
}

function onPluginExtraJsonChange(pluginId: string, jsonStr: string) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null) return;
    form.entries[pluginId] = {
      ...form.entries[pluginId],
      config: parsed,
    };
  } catch {
    // invalid JSON, silently ignore until user finishes editing
  }
}

// --- Build payload ---
function buildPluginsPayload(): {
  enabled: boolean;
  allow: string[];
  deny: string[];
  loadPaths: string[];
  slots: { memory?: string; contextEngine?: string };
  entries: Record<string, { enabled: boolean; config?: Record<string, unknown> }>;
} {
  const entries: Record<string, { enabled: boolean; config?: Record<string, unknown> }> = {};
  for (const [id, entry] of Object.entries(form.entries)) {
    const payload: { enabled: boolean; config?: Record<string, unknown> } = { enabled: entry.enabled };
    if (entry.config && Object.keys(entry.config).length) {
      payload.config = { ...entry.config };
    }
    entries[id] = payload;
  }
  return {
    enabled: form.enabled,
    allow: form.allow.filter((s) => s.trim()),
    deny: form.deny.filter((s) => s.trim()),
    loadPaths: form.loadPaths.filter((s) => s.trim()),
    slots: {
      ...(form.slots.memory.trim() ? { memory: form.slots.memory.trim() } : {}),
      ...(form.slots.contextEngine.trim() ? { contextEngine: form.slots.contextEngine.trim() } : {}),
    },
    entries,
  };
}

defineExpose({ buildPluginsPayload });
</script>
