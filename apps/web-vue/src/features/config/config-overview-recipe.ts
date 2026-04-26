export interface ConfigOverviewSignalRecipe {
  key: "defaultModel" | "imageModel" | "providers" | "syncedAt";
  label: string;
  note: string;
}

export interface ConfigOverviewRecipe {
  signals: ConfigOverviewSignalRecipe[];
  sidebarTitle: string;
}

export interface ConfigOverviewSignal {
  label: string;
  value: string;
  note: string;
}

export interface ConfigOverviewSource {
  defaultModel: string;
  imageModel: string;
  providerCount: number;
  checkedAtLabel: string;
}

export function buildConfigOverviewRecipe(
  text: (zh: string, en: string) => string,
): ConfigOverviewRecipe {
  return {
    signals: [
      {
        key: "defaultModel",
        label: text("1. 模型默认值", "1. Model defaults"),
        note: text(
          "先确认主模型、图片模型和回退链",
          "Start with primary models and fallback chains",
        ),
      },
      {
        key: "providers",
        label: text("2. 供应商", "2. Providers"),
        note: text(
          "再补 API Key、模型矩阵和请求参数",
          "Then add API keys, model matrix, and request options",
        ),
      },
      {
        key: "imageModel",
        label: text("3. 安全与集成", "3. Security & integrations"),
        note: text(
          "按需调整 Sandbox、Gateway、ACP、MCP",
          "Tune Sandbox, Gateway, ACP, and MCP only as needed",
        ),
      },
      {
        key: "syncedAt",
        label: text("同步时间", "Synced"),
        note: text(
          "保存不会刷新页面或跳回其它分组",
          "Saving keeps the page and active group in place",
        ),
      },
    ],
    sidebarTitle: text(
      "按使用频率收敛配置",
      "Configuration grouped by usage frequency",
    ),
  };
}

export function buildConfigOverviewSignals(
  recipe: ConfigOverviewRecipe,
  source: ConfigOverviewSource,
): ConfigOverviewSignal[] {
  return recipe.signals.map((signal) => ({
    label: signal.label,
    note: signal.note,
    value:
      signal.key === "defaultModel"
        ? source.defaultModel || "--"
        : signal.key === "imageModel"
          ? source.imageModel || "--"
          : signal.key === "providers"
            ? String(source.providerCount)
            : source.checkedAtLabel || "--",
  }));
}

export function buildConfigSidebarSummary(
  text: (zh: string, en: string) => string,
  params: {
    title: string;
    activeLabel: string;
    activeCopy: string;
  },
): { title: string; copy: string } {
  return {
    title: params.title,
    copy: text(
      `当前域：${params.activeLabel}。${params.activeCopy}。主题和语言用全局快捷开关，技能安装和插件维护去对应管理页。`,
      `Current domain: ${params.activeLabel}. ${params.activeCopy}. Use global quick switches for theme/language and dedicated pages for skill or plugin operations.`,
    ),
  };
}
