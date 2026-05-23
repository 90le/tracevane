<template>
  <article class="cs-surface cs-environment-reference-card">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("参考信息", "Reference") }}</p>
        <h4>{{ text("环境与安装器信息", "Environment and Installer Info") }}</h4>
      </div>
    </div>
    <div class="cs-kv-list">
      <div class="cs-kv-row">
        <span>{{ text("Home 目录", "Home Directory") }}</span>
        <code>{{ homeDir }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("Profile 路径", "Profile Path") }}</span>
        <code>{{ profilePath }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("安装器根目录", "Installer Root") }}</span>
        <code>{{ installerRoot || "--" }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("来源类型", "Source Kind") }}</span>
        <code>{{ installerKind }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("自动安装脚本", "Auto Setup") }}</span>
        <code>{{ autoSetupScript || "--" }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("健康检查脚本", "Health Check") }}</span>
        <code>{{ healthCheckScript || "--" }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("收尾脚本", "Finalizer") }}</span>
        <code>{{ finalizerScript || "--" }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("代理密钥", "Proxy Key") }}</span>
        <code>{{ proxyKeyMasked || text("未设置", "Not set") }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("Codex auth.json", "Codex auth.json") }}</span>
        <code>{{ codexAuthStatus }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("上下文", "Context") }}</span>
        <code>{{ contextMode }} · {{ contextTokensDisplay }}</code>
      </div>
      <div class="cs-kv-row">
        <span>{{ text("CPA 看板", "CPA Dashboard") }}</span>
        <code>{{ cpaDashboardEnabled ? cpaDashboardUrl : text("未启用", "Disabled") }}</code>
      </div>
    </div>
    <div v-if="missingFiles.length" class="cs-warning-list">
      <div v-for="missingFile in missingFiles" :key="missingFile" class="cs-warning-row">
        <span class="cs-warning-icon">!</span>
        <span>{{ missingFile }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";

defineProps<{
  homeDir: string;
  profilePath: string;
  installerRoot: string;
  installerKind: string;
  autoSetupScript: string;
  healthCheckScript: string;
  finalizerScript: string;
  proxyKeyMasked: string;
  codexAuthStatus: string;
  contextMode: string;
  contextTokensDisplay: string;
  cpaDashboardEnabled: boolean;
  cpaDashboardUrl: string;
  missingFiles: string[];
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cs-card-header h4 {
  margin: 0;
}

.cs-section-kicker {
  margin: 0 0 6px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.cs-kv-list {
  display: grid;
  gap: 10px;
}

.cs-kv-row {
  display: grid;
  grid-template-columns: minmax(120px, 180px) 1fr;
  gap: 12px;
  align-items: start;
}

.cs-kv-row span {
  color: var(--muted);
  font-size: 0.9rem;
}

.cs-kv-row code {
  color: var(--text);
  background: color-mix(in srgb, var(--code-bg) 84%, transparent);
  border-radius: 10px;
  padding: 6px 10px;
  word-break: break-word;
}

.cs-warning-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.cs-warning-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--warning) 28%, var(--line));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.cs-warning-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 18%, transparent);
  color: var(--warning);
  font-weight: 700;
  flex: 0 0 auto;
}

@media (max-width: 960px) {
  .cs-card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-kv-row {
    grid-template-columns: 1fr;
  }
}
</style>
