import { AlertCircle, CheckCircle2, Circle, Eraser, Info, Lightbulb, TriangleAlert } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
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
      <div className="flex min-h-9 items-center gap-2 border-b border-line bg-panel-2 px-3 text-xs text-muted">
        <span className="font-medium text-ink-strong">Problems</span>
        <ProblemCount severity="error" count={counts.error} />
        <ProblemCount severity="warning" count={counts.warning} />
        <ProblemCount severity="info" count={counts.info + counts.hint} />
        <Button variant="ghost" size="sm" className="ml-auto h-7 min-h-0 px-2 text-xs" onClick={clearWorkbenchProblems} disabled={!problems.length} data-ide-problems-clear>
          <Eraser />
          清空
        </Button>
      </div>
      {problems.length ? (
        <div className="min-h-0 overflow-auto p-2" data-ide-problems-list>
          {problems.map((problem) => (
            <button
              key={problem.id}
              type="button"
              className="grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
              onClick={() => onOpenProblem(problem)}
              data-ide-problem-row
              data-ide-problem-severity={problem.severity}
              data-ide-problem-path={problem.path ?? ""}
            >
              <ProblemIcon severity={problem.severity} />
              <span className="min-w-0">
                <span className="block truncate text-ink">{problem.message}</span>
                <span className="block truncate font-mono text-2xs text-subtle">
                  {problem.path ? `${problem.path}${formatProblemRange(problem)}` : "workspace"} · {problem.source}{problem.code ? ` · ${problem.code}` : ""}
                </span>
              </span>
              <span className="font-mono text-2xs text-subtle">{formatProblemTime(problem.createdAt)}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          className="min-h-0"
          icon={<CheckCircle2 />}
          title="当前没有 Problems"
          description="语言服务、搜索、Git 或调试产生的问题会显示在这里。"
          data-ide-problems-empty
        />
      )}
    </section>
  );
}

function ProblemCount({ severity, count }: { severity: WorkbenchProblemSeverity; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-line bg-canvas px-1.5 py-0.5" data-ide-problems-count={severity}>
      <ProblemIcon severity={severity} />
      {count}
    </span>
  );
}

function ProblemIcon({ severity }: { severity: WorkbenchProblemSeverity }) {
  const className = cn(
    "size-3.5 shrink-0",
    severity === "error" && "text-danger",
    severity === "warning" && "text-warning",
    severity === "info" && "text-primary",
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
