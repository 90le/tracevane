<template>
  <article class="cs-surface cs-upstream-map">
    <div class="cs-card-header">
      <div>
        <p class="cs-section-kicker">{{ text("配置关系", "Config Map") }}</p>
        <h4>{{ text("谁对应谁", "What Maps to What") }}</h4>
      </div>
    </div>
    <div class="cs-upstream-grid">
      <div>
        <span>{{ text("Codex 默认模型", "Codex Default Model") }}</span>
        <strong>{{ defaultModel }}</strong>
        <p>{{ text("写入 ~/.codex/config.toml，直接影响命令行 codex。", "Written to ~/.codex/config.toml and used by the codex CLI.") }}</p>
      </div>
      <div>
        <span>{{ text("本地 OpenAI 兼容入口", "Local OpenAI-Compatible Endpoint") }}</span>
        <strong>{{ compactProxyBaseUrl }}</strong>
        <p>{{ text("cc-connect Provider 推荐指向这里，而不是单独配置一套上游。", "cc-connect providers should usually point here instead of duplicating upstream settings.") }}</p>
      </div>
      <div>
        <span>{{ text("推荐 cc-connect Provider", "Recommended cc-connect Provider") }}</span>
        <strong>{{ providerName }} · {{ providerBaseUrl }}</strong>
        <p>{{ text("用于 cc-connect 启动 Codex Agent 时注入 OPENAI_API_KEY / base_url。", "Used by cc-connect to inject OPENAI_API_KEY / base_url into Codex agents.") }}</p>
      </div>
      <div>
        <span>{{ text("cc-connect Agent 模型", "cc-connect Agent Model") }}</span>
        <strong>{{ providerModel }}</strong>
        <p>{{ text("每个项目可单独设置；需要统一时在 cc-connect 面板点击同步默认模型。", "Each project can override it; use Sync Default Model in the cc-connect panel to align them.") }}</p>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { useLocalePreference } from "../../shared/locale";
import "./codex-stack-settings.css";

defineProps<{
  defaultModel: string;
  compactProxyBaseUrl: string;
  providerName: string;
  providerBaseUrl: string;
  providerModel: string;
}>();

const { text } = useLocalePreference();
</script>
