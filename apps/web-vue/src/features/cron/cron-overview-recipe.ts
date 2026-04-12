export interface CronOverviewRecipe {
  pageEyebrow: string;
  pageTitle: string;
  pageCopy: string;
  jobListTitle: string;
  jobListEmptyCopy: string;
  workspaceTabs: {
    overview: string;
    config: string;
    runs: string;
  };
}

export function buildDefaultCronOverviewRecipe(
  text: (zh: string, en: string) => string,
): CronOverviewRecipe {
  return {
    pageEyebrow: "Cron",
    pageTitle: text("定时任务", "Cron Jobs"),
    pageCopy: text(
      "重新改成“左侧任务列表 + 右侧工作区”的布局。列表只负责选择任务，右侧统一处理计划、投递、运行和历史，不再堆很多卡片。",
      "The page has been reworked into a “job list on the left + workspace on the right” layout. The list only selects the job while the right side manages scheduling, delivery, runs, and history without a card wall.",
    ),
    jobListTitle: text("任务列表", "Job List"),
    jobListEmptyCopy: text(
      "先从这里选择一个任务。",
      "Select a job here first.",
    ),
    workspaceTabs: {
      overview: text("概览", "Overview"),
      config: text("配置", "Configuration"),
      runs: text("运行记录", "Runs"),
    },
  };
}
