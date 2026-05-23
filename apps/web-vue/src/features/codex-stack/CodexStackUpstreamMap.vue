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

defineProps<{
  defaultModel: string;
  compactProxyBaseUrl: string;
  providerName: string;
  providerBaseUrl: string;
  providerModel: string;
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.cs-upstream-map {
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--success) 12%, transparent), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface) 92%, #101820 8%), var(--surface));
}

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

.cs-upstream-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.cs-upstream-grid > div {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 14px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
}

.cs-upstream-grid span {
  display: block;
  color: var(--muted);
  font-size: 0.8rem;
  margin-bottom: 8px;
}

.cs-upstream-grid strong {
  display: block;
  color: var(--text);
  word-break: break-word;
}

.cs-upstream-grid p {
  margin: 8px 0 0;
  color: var(--text-soft);
  font-size: 0.88rem;
}

@media (max-width: 960px) {
  .cs-upstream-grid {
    grid-template-columns: 1fr;
  }
}
</style>
