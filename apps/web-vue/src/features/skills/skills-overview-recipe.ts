export interface SkillsOverviewRecipe {
  pageEyebrow: string;
  pageTitle: string;
  pageCopy: string;
  installedHeadline: string;
  installedCopy: string;
  marketplaceHeadline: string;
  marketplaceCopy: string;
  pluginsHeadline: string;
  pluginsCopy: string;
}

export function buildDefaultSkillsOverviewRecipe(
  text: (zh: string, en: string) => string,
): SkillsOverviewRecipe {
  return {
    pageEyebrow: "Skills",
    pageTitle: text("技能管理", "Skills"),
    pageCopy: text(
      "把技能列表、配置、风险预检和安装动作拆成清晰的上下工作区：先在上面找技能，再在下面处理详情。",
      "Split skills into a clearer stacked workspace: find items in the upper board, then work on details below.",
    ),
    installedHeadline: text("本地技能索引", "Local skill index"),
    installedCopy: text(
      "优先读取本地技能状态，不预加载市场，减少首屏等待。",
      "Load local skill status first and keep marketplace loading lazy.",
    ),
    marketplaceHeadline: text("市场检索", "Marketplace search"),
    marketplaceCopy: text(
      "源切换、搜索、排序和分类都收在同一行工具栏里，不再单独占一列。",
      "Source switching, search, sort, and category filtering now live in one toolbar instead of a dedicated column.",
    ),
    pluginsHeadline: text("插件管理", "Plugin Settings"),
    pluginsCopy: text(
      "在这里管理插件白名单、加载路径和已注册插件的启用状态与额外配置。",
      "Manage plugin allowlist, load paths, and registered plugin settings here.",
    ),
  };
}
