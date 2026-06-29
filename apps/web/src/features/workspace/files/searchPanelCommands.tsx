import * as React from "react";
import { Clipboard, Eraser, Replace, Search, Sparkles } from "lucide-react";

import type { WorkspaceCommand } from "../workbench/workspaceCommands";

export interface SearchPanelCommandRegistryInput {
  query: string;
  resultCount: number;
  replaceTargetCount: number;
  replaceBusy: boolean;
  hasReplacePreview: boolean;
  hasUndoPackage: boolean;
  focusSearch: () => void;
  clearSearch: () => void;
  copySearchAiContext: () => void;
  prepareReplacePreview: () => void;
  applyReplacePreview: () => void;
  undoLastReplace: () => void;
}

export function createSearchPanelCommands({
  query,
  resultCount,
  replaceTargetCount,
  replaceBusy,
  hasReplacePreview,
  hasUndoPackage,
  focusSearch,
  clearSearch,
  copySearchAiContext,
  prepareReplacePreview,
  applyReplacePreview,
  undoLastReplace,
}: SearchPanelCommandRegistryInput): WorkspaceCommand[] {
  return [
    {
      id: "search.panel.focusInput",
      group: "导航",
      label: "搜索：聚焦搜索框",
      description: query ? `继续搜索 “${query}”` : "聚焦 Workspace 搜索输入框",
      icon: <Search />,
      run: focusSearch,
    },
    {
      id: "search.panel.copyAiContext",
      group: "AI",
      label: "搜索：复制上下文证据",
      description:
        resultCount > 0
          ? `复制当前 ${resultCount} 条搜索结果作为可审查上下文证据`
          : "当前没有可复制的搜索结果",
      icon: <Sparkles />,
      disabled: !query || resultCount === 0,
      run: copySearchAiContext,
    },
    {
      id: "search.panel.prepareReplacePreview",
      group: "编辑器",
      label: "搜索：审查跨文件替换计划",
      description:
        replaceTargetCount > 0
          ? `为 ${replaceTargetCount} 个文本文件生成可审查替换计划`
          : "当前结果内没有可替换文本文件",
      icon: <Replace />,
      disabled: !query || replaceTargetCount === 0 || replaceBusy,
      run: prepareReplacePreview,
    },
    {
      id: "search.panel.applyReplacePreview",
      group: "编辑器",
      label: "搜索：应用本次替换计划",
      description: hasReplacePreview
        ? "写入当前替换计划中勾选的文件"
        : "请先生成可审查替换计划",
      icon: <Clipboard />,
      disabled: !hasReplacePreview || replaceBusy,
      run: applyReplacePreview,
    },
    {
      id: "search.panel.undoLastReplace",
      group: "编辑器",
      label: "搜索：撤销上次跨文件替换",
      description: hasUndoPackage
        ? "恢复上次批量替换前的文件内容"
        : "当前没有可撤销的替换包",
      icon: <Eraser />,
      disabled: !hasUndoPackage || replaceBusy,
      run: undoLastReplace,
    },
    {
      id: "search.panel.clear",
      group: "导航",
      label: "搜索：清空搜索",
      description: query ? "清空搜索关键词和结果" : "搜索框已经为空",
      icon: <Eraser />,
      disabled: !query,
      run: clearSearch,
    },
  ];
}
