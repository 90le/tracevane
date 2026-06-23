import { Folder, Search, GitBranch, Sparkles } from "lucide-react";

import type { IdeActivity } from "@/features/ide/panels/ActivityBar";

interface SidePanelProps {
  activity: IdeActivity;
}

const HEADERS: Record<IdeActivity, { title: string; hint: string; icon: typeof Folder }> = {
  files: { title: "资源管理器", hint: "文件树将在此呈现", icon: Folder },
  search: { title: "搜索", hint: "跨文件搜索将在此呈现", icon: Search },
  git: { title: "源代码管理", hint: "Git 变更将在此呈现", icon: GitBranch },
  agent: { title: "Agent", hint: "AI 代理（规划中）", icon: Sparkles },
};

/**
 * Left-side panel that switches its placeholder body per active IDE view.
 * Real content (explorer tree / search form / git changes list) is filled in
 * by later P1 tasks; here it renders Aurora-styled chrome — header row with
 * icon + title, and a muted empty hint body.
 */
export function SidePanel({ activity }: SidePanelProps) {
  const meta = HEADERS[activity];
  const Icon = meta.icon;
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-2xs font-semibold uppercase tracking-[.1em] text-subtle">
        <Icon className="size-3.5 text-muted" />
        <span className="truncate text-ink-strong">{meta.title}</span>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center px-4 py-6 text-center">
        <div className="max-w-[200px]">
          <div className="mx-auto mb-2 grid size-8 place-items-center rounded-md bg-panel-2 text-subtle">
            <Icon className="size-4" />
          </div>
          <p className="text-sm text-muted">{meta.hint}</p>
          <p className="mt-1 text-2xs text-subtle">P1 占位 · 后续任务接入真实数据</p>
        </div>
      </div>
    </aside>
  );
}
