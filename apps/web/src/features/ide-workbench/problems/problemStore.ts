import * as React from "react";

export type WorkbenchProblemSeverity = "error" | "warning" | "info" | "hint";
export type WorkbenchProblemSource = "search" | "task" | "custom" | "watcher" | "lsp-placeholder" | "lsp";

export interface WorkbenchProblem {
  id: string;
  rootId: string;
  path?: string;
  severity: WorkbenchProblemSeverity;
  source: WorkbenchProblemSource;
  message: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  code?: string;
  createdAt: string;
}

export type WorkbenchProblemInput = Omit<WorkbenchProblem, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

const PROBLEM_EVENT = "tracevane:ide-problem";
let problems: WorkbenchProblem[] = [];
const listeners = new Set<() => void>();
let browserListenerInstalled = false;

export function appendWorkbenchProblem(input: WorkbenchProblemInput): WorkbenchProblem {
  const problem = normalizeProblem(input);
  problems = [...problems.filter((item) => item.id !== problem.id), problem]
    .sort((left, right) => severityWeight(left.severity) - severityWeight(right.severity) || left.message.localeCompare(right.message));
  emitProblemsChanged();
  return problem;
}


export function replaceWorkbenchProblemsForFileSource({
  rootId,
  path,
  source,
  problems: nextProblems,
}: {
  rootId: string;
  path: string;
  source: WorkbenchProblemSource;
  problems: WorkbenchProblemInput[];
}) {
  const normalizedPath = normalizeOptionalPath(path);
  const normalizedNext = nextProblems.map((problem) => normalizeProblem(problem));
  problems = [
    ...problems.filter((problem) => !(problem.rootId === rootId && problem.path === normalizedPath && problem.source === source)),
    ...normalizedNext,
  ].sort((left, right) => severityWeight(left.severity) - severityWeight(right.severity) || left.message.localeCompare(right.message));
  emitProblemsChanged();
}

export function removeWorkbenchProblem(id: string) {
  const next = problems.filter((problem) => problem.id !== id);
  if (next.length === problems.length) return;
  problems = next;
  emitProblemsChanged();
}

export function clearWorkbenchProblems() {
  if (!problems.length) return;
  problems = [];
  emitProblemsChanged();
}

export function getWorkbenchProblemsSnapshot() {
  return problems;
}

export function subscribeWorkbenchProblems(listener: () => void) {
  installBrowserProblemListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkbenchProblems() {
  installBrowserProblemListener();
  return React.useSyncExternalStore(
    subscribeWorkbenchProblems,
    getWorkbenchProblemsSnapshot,
    getWorkbenchProblemsSnapshot,
  );
}

function emitProblemsChanged() {
  for (const listener of listeners) listener();
}

function normalizeProblem(input: WorkbenchProblemInput): WorkbenchProblem {
  const path = normalizeOptionalPath(input.path);
  return {
    ...input,
    id: input.id ?? problemId(input.rootId, path, input.source, input.message, input.startLine, input.startColumn),
    path,
    createdAt: input.createdAt ?? new Date().toISOString(),
    startLine: normalizePositiveInteger(input.startLine),
    startColumn: normalizePositiveInteger(input.startColumn),
    endLine: normalizePositiveInteger(input.endLine),
    endColumn: normalizePositiveInteger(input.endColumn),
  };
}

function normalizeOptionalPath(value: string | undefined) {
  const normalized = String(value ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalized || undefined;
}

function normalizePositiveInteger(value: number | undefined) {
  if (!Number.isFinite(value) || value == null) return undefined;
  return Math.max(1, Math.floor(value));
}

function problemId(rootId: string, path: string | undefined, source: WorkbenchProblemSource, message: string, line?: number, column?: number) {
  return ["problem", rootId, path ?? "workspace", source, line ?? 0, column ?? 0, message].join(":");
}

function severityWeight(severity: WorkbenchProblemSeverity) {
  switch (severity) {
    case "error": return 0;
    case "warning": return 1;
    case "info": return 2;
    case "hint": return 3;
    default: return 4;
  }
}

function installBrowserProblemListener() {
  if (browserListenerInstalled || typeof window === "undefined") return;
  browserListenerInstalled = true;
  window.addEventListener(PROBLEM_EVENT, (event) => {
    const detail = (event as CustomEvent<WorkbenchProblemInput>).detail;
    if (!detail || typeof detail !== "object") return;
    if (!detail.rootId || !detail.message || !detail.severity || !detail.source) return;
    appendWorkbenchProblem(detail);
  });
}

installBrowserProblemListener();
