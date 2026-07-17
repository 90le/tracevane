import { AlertCircle, CheckCircle2, Circle, Eraser, Info, Lightbulb, TriangleAlert } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { PanelHeader, PanelHeaderChip } from "../panelHeader";
import { clearWorkbenchProblems, type WorkbenchProblem, type WorkbenchProblemSeverity, useWorkbenchProblems } from "./problemStore";

export function IdeProblemsPanel({
  rootId,
  onOpenProblem,
}: {
  rootId: string;
  onOpenProblem: (problem: WorkbenchProblem) => void;
}) {
  const allProblems = useWorkbenchProblems();
  const problems = allProblems.filter((problem) => !rootId || problem.rootId === rootId);
  const counts = countBySeverity(problems);

  return (
    <section className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-panel text-sm" data-ide-problems-panel>
      <PanelHeader
        title="问题"
        icon={<AlertCircle />}
        actions={(
          <Button variant="ghost" size="sm" className="h-7 min-h-0 px-2 text-xs" onClick={clearWorkbenchProblems} disabled={!problems.length} data-ide-problems-clear>
            <Eraser />
            清空
          </Button>
        )}
      >
        <ProblemCount severity="error" count={counts.error} />
        <ProblemCount severity="warning" count={counts.warning} />
        <ProblemCount severity="info" count={counts.info + counts.hint} />
      </PanelHeader>
      {problems.length ? (
        <div className="min-h-0 overflow-auto py-1" data-ide-problems-list>
          {problems.map((problem) => (
            <button
              key={problem.id}
              type="button"
              className="group grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 border-b border-line/50 px-3 py-1.5 text-left outline-none last:border-b-0 hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
              onClick={() => onOpenProblem(problem)}
              data-ide-problem-row
              data-ide-problem-severity={problem.severity}
              data-ide-problem-path={problem.path ?? ""}
            >
              <ProblemIcon severity={problem.severity} />
              <span className="min-w-0">
                <span className="block truncate text-xs text-ink-strong group-hover:text-primary">{problem.message}</span>
                <span className="block truncate font-mono text-2xs text-subtle">
                  {problem.path ? `${problem.path}${formatProblemRange(problem)}` : "workspace"} · {problem.source}{problem.code ? ` · ${problem.code}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-mono text-2xs tabular-nums text-subtle">{formatProblemTime(problem.createdAt)}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          className="min-h-0"
          icon={<CheckCircle2 />}
          title="当前没有发现问题"
          description="语言服务、搜索、Git 或调试产生的问题会汇总在这里；点击条目可直接跳转到对应文件位置。"
          data-ide-problems-empty
        />
      )}
    </section>
  );
}

function ProblemCount({ severity, count }: { severity: WorkbenchProblemSeverity; count: number }) {
  const tone = count > 0
    ? severity === "error" ? "danger" : severity === "warning" ? "warning" : "info"
    : "default";
  return (
    <PanelHeaderChip tone={tone} data-ide-problems-count={severity}>
      <ProblemIcon severity={severity} />
      {count}
    </PanelHeaderChip>
  );
}

function ProblemIcon({ severity }: { severity: WorkbenchProblemSeverity }) {
  const className = cn(
    "size-3.5 shrink-0",
    severity === "error" && "text-danger",
    severity === "warning" && "text-warning",
    severity === "info" && "text-info",
    severity === "hint" && "text-subtle",
  );
  if (severity === "error") return <AlertCircle className={className} aria-hidden />;
  if (severity === "warning") return <TriangleAlert className={className} aria-hidden />;
  if (severity === "info") return <Info className={className} aria-hidden />;
  if (severity === "hint") return <Lightbulb className={className} aria-hidden />;
  return <Circle className={className} aria-hidden />;
}

function countBySeverity(problems: WorkbenchProblem[]) {
  return problems.reduce((counts, problem) => {
    counts[problem.severity] += 1;
    return counts;
  }, { error: 0, warning: 0, info: 0, hint: 0 } as Record<WorkbenchProblemSeverity, number>);
}

function formatProblemRange(problem: WorkbenchProblem) {
  if (!problem.startLine) return "";
  return `:${problem.startLine}${problem.startColumn ? `:${problem.startColumn}` : ""}`;
}

function formatProblemTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
