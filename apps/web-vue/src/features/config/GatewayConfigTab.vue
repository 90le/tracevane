<template>
  <section class="config-tab-stage config-section-grid">
    <article class="config-sheet">
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('基础网关设置', 'Basic Gateway Settings') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection is-primary">
            <div class="config-subsection-head">
              <h4>{{ text('网络配置', 'Network Configuration') }}</h4>
              <p>{{ text('控制网关的端口、运行模式和绑定地址。', 'Control the gateway port, run mode, and bind address.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('端口', 'Port') }}</span>
                <input v-model.number="form.port" class="form-input" type="number" min="1" max="65535" />
                <span class="field-hint">{{ text('网关监听端口，默认 31879', 'Gateway listen port, default 31879') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('运行模式', 'Mode') }}</span>
                <StudioSelect v-model="form.mode" :options="modeOptions" />
                <span class="field-hint">{{ text('local 仅本机访问，remote 支持远程连接', 'local for localhost only, remote for remote connections') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('绑定地址', 'Bind') }}</span>
                <StudioSelect v-model="form.bind" :options="bindOptions" />
                <span class="field-hint">{{ text('loopback/lan/tailnet/custom 对应 OpenClaw 当前真实 bind 枚举。', 'loopback/lan/tailnet/custom map to the real current OpenClaw bind enums.') }}</span>
              </label>
              <label v-if="form.bind === 'custom'" class="form-field">
                <span class="form-label">{{ text('自定义绑定 Host', 'Custom Bind Host') }}</span>
                <input v-model="form.customBindHost" class="form-input" type="text" placeholder="0.0.0.0" />
                <span class="field-hint">{{ text('仅 bind=custom 时生效，例如 0.0.0.0 或指定网卡地址。', 'Used only when bind=custom, for example 0.0.0.0 or a specific interface address.') }}</span>
              </label>
            </div>
          </section>

          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('Tailscale 网络', 'Tailscale Network') }}</h4>
              <p>{{ text('通过 Tailscale 网络进行安全访问。', 'Secure access via Tailscale network.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('Tailscale 模式', 'Tailscale Mode') }}</span>
                <StudioSelect v-model="form.tailscaleMode" :options="tailscaleOptions" />
                <span class="field-hint">{{ text('serve 为 tailnet 内访问，funnel 为公网暴露且必须认证。', 'serve exposes to the tailnet; funnel exposes publicly and must stay authenticated.') }}</span>
              </label>
              <label class="option-row">
                <input v-model="form.authAllowTailscale" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('允许 Tailscale 身份透传', 'Allow Tailscale identity auth') }}</strong>
                  <span>{{ text('仅对 Control UI / WebSocket 有效；HTTP API 仍遵循网关自身 auth.mode。', 'Applies only to Control UI / WebSocket; HTTP API still follows the gateway auth.mode.') }}</span>
                </div>
              </label>
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('认证设置', 'Authentication Settings') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection is-risk">
            <div class="config-subsection-head">
              <h4>{{ text('认证模式与令牌', 'Auth Mode & Token') }}</h4>
              <p>{{ text('控制网关访问认证方式和令牌配置。', 'Control gateway authentication method and token configuration.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('认证模式', 'Auth Mode') }}</span>
                <StudioSelect v-model="form.authMode" :options="authModeOptions" />
                <span class="field-hint">{{ text('支持 token、password、trusted-proxy 和 none。非 loopback 绑定不应使用 none。', 'Supports token, password, trusted-proxy, and none. Non-loopback binds should not use none.') }}</span>
              </label>
              <div v-if="form.authMode === 'token'" class="form-field">
                <span class="form-label">{{ text('认证令牌', 'Auth Token') }}</span>
                <div class="token-input-wrapper">
                  <input
                    v-model="form.authToken"
                    class="form-input token-input"
                    :type="tokenVisible ? 'text' : 'password'"
                    :placeholder="form.hasToken && !form.authToken ? text('已设置（未修改）', 'Set (unchanged)') : text('输入认证令牌', 'Enter auth token')"
                  />
                  <button type="button" class="token-toggle-btn" @click="tokenVisible = !tokenVisible" :title="text('切换显示', 'Toggle visibility')">
                    {{ tokenVisible ? '🙈' : '👁️' }}
                  </button>
                </div>
                <span class="field-hint">{{ text('访问网关所需的认证令牌', 'Authentication token required for gateway access') }}</span>
              </div>
              <div v-if="form.authMode === 'password'" class="form-field">
                <span class="form-label">{{ text('认证密码', 'Auth Password') }}</span>
                <div class="token-input-wrapper">
                  <input
                    v-model="form.authPassword"
                    class="form-input token-input"
                    :type="tokenVisible ? 'text' : 'password'"
                    :placeholder="form.hasPassword && !form.authPassword ? text('已设置（未修改）', 'Set (unchanged)') : text('输入认证密码', 'Enter auth password')"
                  />
                  <button type="button" class="token-toggle-btn" @click="tokenVisible = !tokenVisible" :title="text('切换显示', 'Toggle visibility')">
                    {{ tokenVisible ? '🙈' : '👁️' }}
                  </button>
                </div>
                <span class="field-hint">{{ text('密码模式仅在 auth.mode=password 下使用。', 'Password mode is used only when auth.mode=password.') }}</span>
              </div>
              <label v-if="form.authMode === 'trusted-proxy'" class="form-field">
                <span class="form-label">{{ text('trustedProxy.userHeader', 'trustedProxy.userHeader') }}</span>
                <input v-model="form.trustedProxyUserHeader" class="form-input" type="text" placeholder="x-forwarded-user" />
                <span class="field-hint">{{ text('trusted-proxy 模式下用于识别操作者的请求头。', 'Header used to identify the operator in trusted-proxy mode.') }}</span>
              </label>
              <label v-if="form.authMode === 'trusted-proxy'" class="form-field">
                <span class="form-label">{{ text('trustedProxy.requiredHeaders', 'trustedProxy.requiredHeaders') }}</span>
                <textarea v-model="form.trustedProxyRequiredHeadersText" class="form-textarea" rows="3" :placeholder="text('每行一个，例如：x-forwarded-user', 'One per line, e.g. x-forwarded-user')" />
              </label>
              <label v-if="form.authMode === 'trusted-proxy'" class="form-field">
                <span class="form-label">{{ text('trustedProxy.allowUsers', 'trustedProxy.allowUsers') }}</span>
                <textarea v-model="form.trustedProxyAllowUsersText" class="form-textarea" rows="3" :placeholder="text('每行一个允许的用户名', 'One allowed username per line')" />
              </label>
            </div>
            <div class="settings-inline-grid">
              <label class="option-row">
                <input v-model="form.hostHeaderOriginFallback" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('Host Header Origin Fallback', 'Host Header Origin Fallback') }}</strong>
                  <span>{{ text('危险模式，仅在明确依赖 Host 头作为 origin 策略时开启。', 'Dangerous mode. Enable only when you intentionally rely on Host-header origin policy.') }}</span>
                </div>
              </label>
              <label class="option-row">
                <input v-model="form.allowInsecureAuth" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('允许不安全认证', 'Allow Insecure Auth') }}</strong>
                  <span>{{ text('仅在受控内网或本地调试中使用。', 'Use only on trusted networks or for local debugging.') }}</span>
                </div>
              </label>
              <label class="option-row">
                <input v-model="form.allowRealIpFallback" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('允许 Real-IP Fallback', 'Allow Real-IP Fallback') }}</strong>
                  <span>{{ text('仅在明确需要反代回退链路时启用。', 'Enable only when you intentionally need reverse-proxy real-ip fallback.') }}</span>
                </div>
              </label>
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('Control UI / 反向代理', 'Control UI / Reverse Proxy') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('浏览器 Origin 白名单', 'Browser Origin Allowlist') }}</h4>
              <p>{{ text('用于 Control UI / WebSocket 的 allowedOrigins 和 trustedProxies。', 'Controls allowedOrigins and trustedProxies for Control UI / WebSocket access.') }}</p>
            </div>
            <div class="form-grid">
              <label class="option-row">
                <input v-model="form.controlUiEnabled" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('启用 Control UI', 'Enable Control UI') }}</strong>
                  <span>{{ text('关闭后仅保留网关 API / WS，不提供 Control UI 页面。', 'When disabled, the gateway keeps API / WS but does not serve the Control UI.') }}</span>
                </div>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('controlUi.basePath', 'controlUi.basePath') }}</span>
                <input v-model="form.controlUiBasePath" class="form-input" type="text" placeholder="/openclaw" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('controlUi.root', 'controlUi.root') }}</span>
                <input v-model="form.controlUiRoot" class="form-input" type="text" placeholder="/path/to/control-ui" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('allowedOrigins', 'allowedOrigins') }}</span>
                <textarea v-model="form.allowedOriginsText" class="form-textarea" rows="4" :placeholder="text('每行一个，例如：http://127.0.0.1:31879', 'One per line, e.g. http://127.0.0.1:31879')" />
                <span class="field-hint">{{ text('非 loopback 浏览器来源必须显式列入。', 'Non-loopback browser origins must be explicitly listed here.') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('trustedProxies', 'trustedProxies') }}</span>
                <textarea v-model="form.trustedProxiesText" class="form-textarea" rows="4" :placeholder="text('每行一个，例如：127.0.0.1', 'One per line, e.g. 127.0.0.1')" />
                <span class="field-hint">{{ text('只填写你控制的反向代理 IP；同机 loopback 也可用于本地代理/Tailscale Serve。', 'List only proxies you control; same-host loopback is still valid for local proxy/Tailscale Serve setups.') }}</span>
              </label>
            </div>
            <div class="settings-inline-grid">
              <label class="option-row">
                <input v-model="form.dangerouslyDisableDeviceAuth" class="form-checkbox" type="checkbox" />
                <div>
                  <strong>{{ text('禁用设备认证', 'Disable Device Auth') }}</strong>
                  <span>{{ text('极高风险，仅限完全受控的内网/调试环境。', 'Very high risk. Use only on fully controlled internal/debug environments.') }}</span>
                </div>
              </label>
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('速率限制', 'Rate Limiting') }}</span></h3>
        </div>
        <details class="config-collapsible" :open="form.rateLimitMaxAttempts !== 10 || form.rateLimitWindowMs !== 60000 || form.rateLimitLockoutMs !== 600000">
          <summary class="config-collapsible-summary">
            <span>{{ text('查看 / 编辑速率限制配置', 'View / edit rate limit settings') }}</span>
            <span class="config-collapsible-meta">{{ text('最大尝试', 'max attempts') }}: {{ form.rateLimitMaxAttempts }}</span>
          </summary>
          <div class="config-subsection-grid settings-stack-spaced">
            <section class="config-subsection">
              <div class="config-subsection-head">
                <h4>{{ text('认证速率限制', 'Auth Rate Limiting') }}</h4>
                <p>{{ text('限制认证尝试频率，防止暴力破解。', 'Limit auth attempt frequency to prevent brute force.') }}</p>
              </div>
              <div class="form-grid">
                <label class="form-field">
                  <span class="form-label">{{ text('最大尝试次数', 'Max Attempts') }}</span>
                  <input v-model.number="form.rateLimitMaxAttempts" class="form-input" type="number" min="1" />
                  <span class="field-hint">{{ text('时间窗口内允许的最大认证尝试次数', 'Maximum auth attempts allowed within the time window') }}</span>
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('时间窗口 (ms)', 'Window (ms)') }}</span>
                  <input v-model.number="form.rateLimitWindowMs" class="form-input" type="number" min="0" />
                  <span class="field-hint">{{ text('计算尝试次数的时间窗口（毫秒）', 'Time window for counting attempts (milliseconds)') }}</span>
                </label>
                <label class="form-field">
                  <span class="form-label">{{ text('锁定时间 (ms)', 'Lockout (ms)') }}</span>
                  <input v-model.number="form.rateLimitLockoutMs" class="form-input" type="number" min="0" />
                  <span class="field-hint">{{ text('超出限制后的锁定时间（毫秒）', 'Lockout duration after exceeding limit (milliseconds)') }}</span>
                </label>
                <label class="option-row">
                  <input v-model="form.rateLimitExemptLoopback" class="form-checkbox" type="checkbox" />
                  <div>
                    <strong>{{ text('loopback 免限速', 'Exempt Loopback') }}</strong>
                    <span>{{ text('本机 loopback 请求是否跳过认证限速。', 'Whether local loopback requests bypass auth rate limiting.') }}</span>
                  </div>
                </label>
              </div>
            </section>
          </div>
        </details>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('Webchat / 工具', 'Webchat / Tools') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('webchat.chatHistoryMaxChars', 'webchat.chatHistoryMaxChars') }}</span>
                <input v-model.number="form.webchatChatHistoryMaxChars" class="form-input" type="number" min="1" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('channelHealthCheckMinutes', 'channelHealthCheckMinutes') }}</span>
                <input v-model.number="form.channelHealthCheckMinutes" class="form-input" type="number" min="0" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('gateway.tools.allow', 'gateway.tools.allow') }}</span>
                <textarea v-model="form.gatewayToolsAllowText" class="form-textarea" rows="3" :placeholder="text('每行一个工具名', 'One tool name per line')" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('gateway.tools.deny', 'gateway.tools.deny') }}</span>
                <textarea v-model="form.gatewayToolsDenyText" class="form-textarea" rows="3" :placeholder="text('每行一个工具名', 'One tool name per line')" />
              </label>
            </div>
          </section>
        </div>
      </section>
    </article>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import StudioSelect, { type StudioSelectOption } from '../../shared/components/StudioSelect.vue';
import type { ConfigSummaryPayload } from '../../../../../types/config';
import './config-workspace.css';

const props = defineProps<{
  summary: ConfigSummaryPayload | null;
}>();

const emit = defineEmits<{
  (e: 'update:gateway', value: GatewayFormState): void;
}>();

const { text } = useLocalePreference();
const tokenVisible = ref(false);

interface GatewayFormState {
  port: number;
  mode: string;
  bind: string;
  customBindHost: string;
  authMode: string;
  authToken: string;
  authPassword: string;
  hasToken: boolean;
  hasPassword: boolean;
  authAllowTailscale: boolean;
  trustedProxyUserHeader: string;
  trustedProxyRequiredHeadersText: string;
  trustedProxyAllowUsersText: string;
  rateLimitMaxAttempts: number;
  rateLimitWindowMs: number;
  rateLimitLockoutMs: number;
  rateLimitExemptLoopback: boolean;
  controlUiEnabled: boolean;
  controlUiBasePath: string;
  controlUiRoot: string;
  allowedOriginsText: string;
  hostHeaderOriginFallback: boolean;
  allowInsecureAuth: boolean;
  dangerouslyDisableDeviceAuth: boolean;
  allowRealIpFallback: boolean;
  trustedProxiesText: string;
  gatewayToolsAllowText: string;
  gatewayToolsDenyText: string;
  webchatChatHistoryMaxChars: number;
  channelHealthCheckMinutes: number;
  tailscaleMode: string;
}

const form = reactive<GatewayFormState>({
  port: 31879,
  mode: 'local',
  bind: 'loopback',
  customBindHost: '',
  authMode: 'token',
  authToken: '',
  authPassword: '',
  hasToken: false,
  hasPassword: false,
  authAllowTailscale: true,
  trustedProxyUserHeader: '',
  trustedProxyRequiredHeadersText: '',
  trustedProxyAllowUsersText: '',
  rateLimitMaxAttempts: 10,
  rateLimitWindowMs: 60000,
  rateLimitLockoutMs: 600000,
  rateLimitExemptLoopback: true,
  controlUiEnabled: true,
  controlUiBasePath: '',
  controlUiRoot: '',
  allowedOriginsText: '',
  hostHeaderOriginFallback: false,
  allowInsecureAuth: false,
  dangerouslyDisableDeviceAuth: false,
  allowRealIpFallback: false,
  trustedProxiesText: '',
  gatewayToolsAllowText: '',
  gatewayToolsDenyText: '',
  webchatChatHistoryMaxChars: 200000,
  channelHealthCheckMinutes: 0,
  tailscaleMode: 'off',
});

const modeOptions: StudioSelectOption[] = [
  { value: 'local', label: 'local' },
  { value: 'remote', label: 'remote' },
];

const bindOptions: StudioSelectOption[] = [
  { value: 'auto', label: 'auto' },
  { value: 'loopback', label: 'loopback (127.0.0.1)' },
  { value: 'lan', label: 'lan' },
  { value: 'tailnet', label: 'tailnet' },
  { value: 'custom', label: 'custom' },
];

const authModeOptions: StudioSelectOption[] = [
  { value: 'token', label: 'token' },
  { value: 'password', label: 'password' },
  { value: 'trusted-proxy', label: 'trusted-proxy' },
  { value: 'none', label: 'none' },
];

const tailscaleOptions: StudioSelectOption[] = [
  { value: 'off', label: 'off' },
  { value: 'serve', label: 'serve' },
  { value: 'funnel', label: 'funnel' },
];

function hydrateFromSummary(summary: ConfigSummaryPayload) {
  const gw = summary.gateway;
  if (!gw) return;
  form.port = gw.port ?? 31879;
  form.mode = gw.mode ?? 'local';
  form.bind = gw.bind ?? 'loopback';
  form.customBindHost = gw.customBindHost ?? '';
  form.authMode = gw.auth?.mode ?? 'token';
  form.authToken = '';
  form.authPassword = '';
  form.hasToken = gw.auth?.hasToken ?? false;
  form.hasPassword = gw.auth?.hasPassword ?? false;
  form.authAllowTailscale = gw.auth?.allowTailscale !== false;
  form.trustedProxyUserHeader = gw.auth?.trustedProxy?.userHeader ?? '';
  form.trustedProxyRequiredHeadersText = (gw.auth?.trustedProxy?.requiredHeaders || []).join('\n');
  form.trustedProxyAllowUsersText = (gw.auth?.trustedProxy?.allowUsers || []).join('\n');
  form.rateLimitMaxAttempts = gw.auth?.rateLimit?.maxAttempts ?? 10;
  form.rateLimitWindowMs = gw.auth?.rateLimit?.windowMs ?? 60000;
  form.rateLimitLockoutMs = gw.auth?.rateLimit?.lockoutMs ?? 600000;
  form.rateLimitExemptLoopback = gw.auth?.rateLimit?.exemptLoopback !== false;
  form.controlUiEnabled = gw.controlUi?.enabled !== false;
  form.controlUiBasePath = gw.controlUi?.basePath ?? '';
  form.controlUiRoot = gw.controlUi?.root ?? '';
  form.allowedOriginsText = (gw.controlUi?.allowedOrigins || []).join('\n');
  form.hostHeaderOriginFallback = gw.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true;
  form.allowInsecureAuth = gw.controlUi?.allowInsecureAuth === true;
  form.dangerouslyDisableDeviceAuth = gw.controlUi?.dangerouslyDisableDeviceAuth === true;
  form.allowRealIpFallback = gw.allowRealIpFallback === true;
  form.trustedProxiesText = (gw.trustedProxies || []).join('\n');
  form.gatewayToolsAllowText = (gw.tools?.allow || []).join('\n');
  form.gatewayToolsDenyText = (gw.tools?.deny || []).join('\n');
  form.webchatChatHistoryMaxChars = gw.webchat?.chatHistoryMaxChars ?? 200000;
  form.channelHealthCheckMinutes = gw.channelHealthCheckMinutes ?? 0;
  form.tailscaleMode = gw.tailscale?.mode ?? 'off';
}

watch(() => props.summary, (summary) => {
  if (summary) hydrateFromSummary(summary);
}, { immediate: true });

watch(form, () => {
  emit('update:gateway', { ...form });
}, { deep: true });

defineExpose({ hydrateFromSummary });
</script>
