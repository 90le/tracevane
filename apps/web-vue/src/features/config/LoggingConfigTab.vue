<template>
  <section class="config-tab-stage config-section-grid">
    <article class="config-sheet">
      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('日志级别', 'Log Levels') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection is-primary">
            <div class="config-subsection-head">
              <h4>{{ text('运行日志阈值', 'Runtime log thresholds') }}</h4>
              <p>{{ text('作用：控制宿主输出多少运行细节。配置方式：生产环境通常使用 `info/warn`，排障时再临时提升到 `debug/trace`。', 'Purpose: controls how much runtime detail the host emits. How to configure: production usually stays at `info/warn`; raise to `debug/trace` only during diagnostics.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('日志级别', 'Log Level') }}</span>
                <TracevaneSelect v-model="form.level" :options="levelOptions" />
                <span class="field-hint">{{ text('控制日志输出的最低级别', 'Minimum log level for output') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('控制台级别', 'Console Level') }}</span>
                <TracevaneSelect v-model="form.consoleLevel" :options="levelOptions" />
                <span class="field-hint">{{ text('控制台输出的最低级别', 'Minimum level for console output') }}</span>
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('控制台样式', 'Console Style') }}</span>
                <TracevaneSelect v-model="form.consoleStyle" :options="consoleStyleOptions" />
                <span class="field-hint">{{ text('控制台日志的显示格式', 'Display format for console logs') }}</span>
              </label>
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('日志文件', 'Log File') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('文件输出与滚动控制', 'File output and rotation bounds') }}</h4>
              <p>{{ text('作用：把日志写到指定文件并限制文件体积。配置方式：在需要长期留存排障日志时填写路径；不需要文件日志可留空。', 'Purpose: writes logs to a file and limits file growth. How to configure: set a path when you need long-lived diagnostics; leave it empty if file logging is unnecessary.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('日志文件路径', 'Log file path') }}</span>
                <input v-model="form.file" class="form-input" type="text" placeholder="/var/log/openclaw.log" />
              </label>
              <label class="form-field">
                <span class="form-label">{{ text('最大文件大小（字节）', 'Max file size (bytes)') }}</span>
                <input v-model.number="form.maxFileBytes" class="form-input" type="number" min="0" />
                <span class="field-hint">{{ text('0 表示不限制', '0 means no limit') }}</span>
              </label>
            </div>
          </section>
        </div>
      </section>

      <section class="config-block">
        <div class="panel-head">
          <h3 class="panel-heading-emph"><span class="panel-heading-mark" aria-hidden="true"></span><span>{{ text('数据脱敏', 'Data Redaction') }}</span></h3>
        </div>
        <div class="config-subsection-grid">
          <section class="config-subsection">
            <div class="config-subsection-head">
              <h4>{{ text('敏感字段保护', 'Sensitive field protection') }}</h4>
              <p>{{ text('作用：避免工具调用和日志里直接暴露敏感参数。配置方式：共享环境建议至少开启 `tools`。', 'Purpose: prevents sensitive parameters from appearing verbatim in logs and tool traces. How to configure: shared environments should usually enable at least `tools`.') }}</p>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span class="form-label">{{ text('脱敏模式', 'Redaction Mode') }}</span>
                <TracevaneSelect v-model="form.redactSensitive" :options="redactOptions" />
                <span class="field-hint">{{ text('控制是否对敏感数据进行脱敏处理', 'Control whether sensitive data is redacted') }}</span>
              </label>
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
import TracevaneSelect, { type TracevaneSelectOption } from '../../shared/components/TracevaneSelect.vue';
import type { ConfigSummaryPayload } from '../../../../../types/config';
import './config-workspace.css';

const props = defineProps<{
  summary: ConfigSummaryPayload | null;
}>();

const { text } = useLocalePreference();

interface LoggingFormState {
  level: string;
  file: string;
  maxFileBytes: number;
  consoleLevel: string;
  consoleStyle: string;
  redactSensitive: string;
}

const form = reactive<LoggingFormState>({
  level: 'info',
  file: '',
  maxFileBytes: 0,
  consoleLevel: 'info',
  consoleStyle: 'pretty',
  redactSensitive: 'off',
});

const levelOptions: TracevaneSelectOption[] = [
  { value: 'silent', label: 'silent' },
  { value: 'fatal', label: 'fatal' },
  { value: 'error', label: 'error' },
  { value: 'warn', label: 'warn' },
  { value: 'info', label: 'info' },
  { value: 'debug', label: 'debug' },
  { value: 'trace', label: 'trace' },
];

const consoleStyleOptions: TracevaneSelectOption[] = [
  { value: 'pretty', label: 'pretty' },
  { value: 'compact', label: 'compact' },
  { value: 'json', label: 'json' },
];

const redactOptions: TracevaneSelectOption[] = [
  { value: 'off', label: 'off' },
  { value: 'tools', label: 'tools' },
];

function hydrateFromSummary(summary: ConfigSummaryPayload) {
  const log = (summary as any)?.logging;
  if (!log) return;
  form.level = log?.level ?? 'info';
  form.file = log?.file ?? '';
  form.maxFileBytes = log?.maxFileBytes ?? 0;
  form.consoleLevel = log?.consoleLevel ?? 'info';
  form.consoleStyle = log?.consoleStyle ?? 'pretty';
  form.redactSensitive = log?.redactSensitive ?? 'off';
}

watch(() => props.summary, (summary) => {
  if (summary) hydrateFromSummary(summary);
}, { immediate: true });

function buildLoggingPayload() {
  return {
    level: form.level,
    file: form.file,
    maxFileBytes: form.maxFileBytes,
    consoleLevel: form.consoleLevel,
    consoleStyle: form.consoleStyle,
    redactSensitive: form.redactSensitive,
  };
}

defineExpose({ buildLoggingPayload, hydrateFromSummary });
</script>
