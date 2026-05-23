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
import "./codex-stack-settings.css";

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
