export interface ConfigOverviewSignalRecipe {
  key: 'defaultModel' | 'imageModel' | 'providers' | 'syncedAt';
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

export function buildConfigOverviewRecipe(
  text: (zh: string, en: string) => string,
): ConfigOverviewRecipe {
  return {
    signals: [
      {
        key: 'defaultModel',
        label: text('默认模型', 'Default model'),
        note: text('主文本路由的当前目标', 'Current primary target for text routes'),
      },
      {
        key: 'imageModel',
        label: text('图片模型', 'Image model'),
        note: text('image / pdf 默认走这条链路', 'image / pdf flows default to this route'),
      },
      {
        key: 'providers',
        label: text('供应商', 'Providers'),
        note: text('当前已录入的模型供应商数量', 'Number of configured model providers'),
      },
      {
        key: 'syncedAt',
        label: text('同步时间', 'Synced'),
        note: text('最后一次读取配置摘要的时间', 'Last refresh time for the config summary'),
      },
    ],
    sidebarTitle: text('先定配置域，再改参数', 'Set the domain first, then change the parameters'),
  };
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
      `当前域：${params.activeLabel}。${params.activeCopy}。先看右侧事实卡，再进入下面的分段工作台。`,
      `Current domain: ${params.activeLabel}. ${params.activeCopy}. Read the fact rail first, then move through the segmented workbench below.`,
    ),
  };
}
