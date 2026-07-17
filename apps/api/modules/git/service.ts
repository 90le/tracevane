import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type { ModelGatewayService } from "../model-gateway/service.js";
import type {
  GitBranchSummary,
  GitCommitDetailPayload,
  GitCommitMessagePayload,
  GitBlamePayload,
  GitCommitSummary,
  GitDiffPayload,
  GitGraphCommit,
  GitGraphPayload,
  GitFileChange,
  GitStashEntry,
  GitStashListPayload,
  GitFileChangeKind,
  GitStatusPayload,
} from "../../../../types/git.js";

const GIT_STATUS_CHANGE_LIMIT = 500;
const GIT_HISTORY_LIMIT = 80;
const GIT_GRAPH_LIMIT = 120;
const GIT_BLAME_LINE_LIMIT = 2000;
const GIT_BRANCH_LIMIT = 120;
const GIT_DIFF_MAX_CHARS = 220_000;
const GIT_DIFF_CONTENT_MAX_CHARS = 1_000_000;
const GIT_DIFF_MAX_BUFFER = 4 * 1024 * 1024;
const GIT_COMMIT_MESSAGE_DIFF_MAX_CHARS = 80_000;
const GIT_COMMIT_MESSAGE_UNTRACKED_FILE_MAX_CHARS = 20_000;
const GIT_COMMIT_MESSAGE_PROMPT_VERSION = "tracevane-git-commit-message-v1";

interface GitRootContext {
  id: string;
  absolutePath: string;
  realPath: string;
}

export interface GitService {
  getStatus(rootId: string, directoryPath?: string): GitStatusPayload;
  getDiff(rootId: string, directoryPath: string | undefined, filePath?: string, staged?: boolean, untracked?: boolean, previousFilePath?: string): GitDiffPayload;
  getCommit(rootId: string, directoryPath: string | undefined, hash?: string): GitCommitDetailPayload;
  getGraph(rootId: string, directoryPath: string | undefined, limit?: number, includeAll?: boolean, filePath?: string): GitGraphPayload;
  getBlame(rootId: string, directoryPath: string | undefined, filePath?: string): GitBlamePayload;
  generateCommitMessage(rootId: string, directoryPath: string | undefined, staged?: boolean, model?: string): Promise<GitCommitMessagePayload>;
  initRepository(rootId: string, directoryPath?: string): GitStatusPayload;
  stagePaths(rootId: string, directoryPath: string | undefined, paths?: string[]): GitStatusPayload;
  unstagePaths(rootId: string, directoryPath: string | undefined, paths?: string[]): GitStatusPayload;
  discardPaths(rootId: string, directoryPath: string | undefined, paths?: string[]): GitStatusPayload;
  commit(rootId: string, directoryPath: string | undefined, message?: string): GitStatusPayload;
  createBranch(rootId: string, directoryPath: string | undefined, name?: string, checkout?: boolean, from?: string): GitStatusPayload;
  checkout(rootId: string, directoryPath: string | undefined, target?: string, detach?: boolean): GitStatusPayload;
  revertCommit(rootId: string, directoryPath: string | undefined, hash?: string): GitStatusPayload;
  deleteBranch(rootId: string, directoryPath: string | undefined, name?: string, force?: boolean): GitStatusPayload;
  renameBranch(rootId: string, directoryPath: string | undefined, oldName?: string, newName?: string): GitStatusPayload;
  setBranchUpstream(rootId: string, directoryPath: string | undefined, branch?: string, upstream?: string, unset?: boolean): GitStatusPayload;
  fetch(rootId: string, directoryPath: string | undefined, remote?: string, branch?: string): GitStatusPayload;
  pull(rootId: string, directoryPath: string | undefined, remote?: string, branch?: string): GitStatusPayload;
  push(rootId: string, directoryPath: string | undefined, remote?: string, branch?: string): GitStatusPayload;
  sync(rootId: string, directoryPath: string | undefined, remote?: string, branch?: string): GitStatusPayload;
  publishBranch(rootId: string, directoryPath: string | undefined, remote?: string, branch?: string): GitStatusPayload;
  listStashes(rootId: string, directoryPath?: string): GitStashListPayload;
  saveStash(rootId: string, directoryPath: string | undefined, message?: string, includeUntracked?: boolean): GitStatusPayload;
  applyStash(rootId: string, directoryPath: string | undefined, ref?: string): GitStatusPayload;
  popStash(rootId: string, directoryPath: string | undefined, ref?: string): GitStatusPayload;
  dropStash(rootId: string, directoryPath: string | undefined, ref?: string): GitStatusPayload;
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function toPortablePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeRelativePath(value: string | null | undefined): string {
  const portable = toPortablePath(String(value || "").trim());
  if (!portable || portable === ".") return "";
  const normalized = path.posix.normalize(portable);
  if (normalized === "." || normalized === "/") return "";
  if (normalized.startsWith("../") || normalized === ".." || path.isAbsolute(normalized)) {
    throw new Error("Path is outside the selected root");
  }
  return normalized.replace(/^\/+/g, "");
}

function realPathOrSelf(value: string): string {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function buildGitRoots(config: TracevaneServerConfig): GitRootContext[] {
  const filesystemRoot = path.parse(config.openclawRoot || process.cwd()).root || "/";
  const candidates: Array<{ id: string; absolutePath: string }> = [
    // Match Files service root semantics: openclaw-root is the filesystem root
    // so IDE Explorer paths can be passed directly to Git routes.
    { id: "openclaw-root", absolutePath: filesystemRoot },
    { id: "home-root", absolutePath: os.homedir() },
    { id: "system-root", absolutePath: filesystemRoot },
    { id: "project-root", absolutePath: config.projectRoot },
    { id: "openclaw-state-root", absolutePath: config.openclawRoot },
  ];
  const roots: GitRootContext[] = [];
  const seenIds = new Set<string>();
  for (const candidate of candidates) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    const absolutePath = path.resolve(candidate.absolutePath);
    roots.push({
      id: candidate.id,
      absolutePath,
      realPath: realPathOrSelf(absolutePath),
    });
  }
  return roots;
}

function isPathInside(rootRealPath: string, candidateRealPath: string): boolean {
  const root = path.resolve(rootRealPath);
  const candidate = path.resolve(candidateRealPath);
  if (root === candidate) return true;
  if (root === path.parse(root).root) return candidate.startsWith(root);
  return candidate.startsWith(`${root}${path.sep}`);
}

function resolveGitDirectory(
  config: TracevaneServerConfig,
  rootId: string,
  directoryPath = "",
): { root: GitRootContext; relativePath: string; absolutePath: string } {
  const roots = buildGitRoots(config);
  const root = roots.find((item) => item.id === String(rootId || "").trim())
    || roots.find((item) => item.id === "project-root")
    || roots[0];
  if (!root) throw new Error("No git root is available");
  const relativePath = normalizeRelativePath(directoryPath);
  const absolutePath = path.resolve(root.absolutePath, relativePath);
  const realPath = realPathOrSelf(absolutePath);
  if (!isPathInside(root.realPath, realPath)) {
    throw new Error("Path is outside the selected root");
  }
  return { root, relativePath, absolutePath };
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
}

function outputToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function runGitForDiff(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: GIT_DIFF_MAX_BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
  } catch (error) {
    const gitError = error as Error & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };
    if (gitError.status === 1) {
      return outputToString(gitError.stdout);
    }
    const stderr = outputToString(gitError.stderr).trim();
    throw new Error(stderr || gitError.message || "Unable to read git diff");
  }
}

function truncateGitDiff(diff: string): { diff: string; truncated: boolean } {
  if (diff.length <= GIT_DIFF_MAX_CHARS) {
    return { diff, truncated: false };
  }
  return {
    diff: diff.slice(0, GIT_DIFF_MAX_CHARS),
    truncated: true,
  };
}

function truncateText(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return { text: value.slice(0, maxChars), truncated: true };
}

function isBinaryDiff(diff: string): boolean {
  return /(?:Binary files .* differ|GIT binary patch)/.test(diff);
}

function bufferLooksBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function contentFromBuffer(buffer: Buffer): { content: string | null; binary: boolean; truncated: boolean } {
  if (bufferLooksBinary(buffer)) {
    return { content: null, binary: true, truncated: false };
  }
  const content = buffer.toString("utf8");
  if (content.length <= GIT_DIFF_CONTENT_MAX_CHARS) {
    return { content, binary: false, truncated: false };
  }
  return {
    content: content.slice(0, GIT_DIFF_CONTENT_MAX_CHARS),
    binary: false,
    truncated: true,
  };
}

function readWorkingTreeFile(repositoryRoot: string, filePath: string): { content: string | null; binary: boolean; truncated: boolean } {
  const absolutePath = path.resolve(repositoryRoot, filePath);
  const realPath = realPathOrSelf(absolutePath);
  if (!isPathInside(realPathOrSelf(repositoryRoot), realPath)) {
    throw new Error("Git diff path is outside the repository");
  }
  if (!fs.existsSync(absolutePath)) {
    return { content: "", binary: false, truncated: false };
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return { content: null, binary: true, truncated: false };
  }
  return contentFromBuffer(fs.readFileSync(absolutePath));
}

function diffPathLabel(filePath: string): string {
  return filePath.replace(/\t/g, "\\t").replace(/\r?\n/g, " ");
}

function buildUntrackedDiff(repositoryRoot: string, filePath: string): { diff: string; truncated: boolean } {
  const content = readWorkingTreeFile(repositoryRoot, filePath);
  if (content.binary || content.content === null) {
    return {
      diff: [
        `diff --git a/${diffPathLabel(filePath)} b/${diffPathLabel(filePath)}`,
        "new file mode 100644",
        "--- /dev/null",
        `+++ b/${diffPathLabel(filePath)}`,
        "@@",
        "+Binary or non-text content omitted from commit message context.",
      ].join("\n"),
      truncated: content.truncated,
    };
  }
  const truncated = truncateText(content.content, GIT_COMMIT_MESSAGE_UNTRACKED_FILE_MAX_CHARS);
  const lines = truncated.text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => `+${line}`)
    .join("\n");
  return {
    diff: [
      `diff --git a/${diffPathLabel(filePath)} b/${diffPathLabel(filePath)}`,
      "new file mode 100644",
      "--- /dev/null",
      `+++ b/${diffPathLabel(filePath)}`,
      "@@",
      lines,
      truncated.truncated ? "+...untracked file content truncated..." : "",
    ].filter(Boolean).join("\n"),
    truncated: content.truncated || truncated.truncated,
  };
}

function changeListLine(change: GitFileChange): string {
  return [
    change.status || change.kind,
    change.path,
    change.previousPath ? `(from ${change.previousPath})` : "",
    change.staged ? "[staged]" : "",
    change.unstaged || change.kind === "untracked" ? "[working-tree]" : "",
  ].filter(Boolean).join(" ");
}

function countChangeKinds(changes: GitFileChange[]): string {
  const counts = changes.reduce<Record<string, number>>((acc, change) => {
    acc[change.kind] = (acc[change.kind] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([kind, count]) => `${kind}:${count}`)
    .join(", ");
}

function commonChangeArea(changes: GitFileChange[]): string {
  const parts = changes
    .map((change) => change.path.split("/").filter(Boolean))
    .filter((segments) => segments.length > 0);
  if (!parts.length) return "workspace changes";
  const prefix: string[] = [];
  for (let index = 0; index < parts[0].length - 1; index += 1) {
    const candidate = parts[0][index];
    if (parts.every((segments) => segments[index] === candidate)) {
      prefix.push(candidate);
    } else {
      break;
    }
  }
  if (prefix.length) return prefix.slice(0, 3).join("/");
  const top = parts[0][0];
  if (top && changes.every((change) => change.path.startsWith(`${top}/`))) return top;
  return "workspace changes";
}

function fallbackCommitMessage(changes: GitFileChange[], branch: string, staged: boolean, truncated: boolean): string {
  const dominantKind = changes.reduce<Record<string, number>>((acc, change) => {
    acc[change.kind] = (acc[change.kind] || 0) + 1;
    return acc;
  }, {});
  const mainKind = Object.entries(dominantKind).sort((left, right) => right[1] - left[1])[0]?.[0] || "modified";
  const verbByKind: Record<string, string> = {
    added: "Add",
    copied: "Add",
    deleted: "Remove",
    modified: "Update",
    renamed: "Reorganize",
    untracked: "Add",
    conflicted: "Resolve",
    unknown: "Update",
  };
  const subject = `${verbByKind[mainKind] || "Update"} ${commonChangeArea(changes)}`;
  return [
    subject.slice(0, 72),
    "",
    `- Summarize ${staged ? "staged" : "working tree"} changes on ${branch || "HEAD"}.`,
    `- Files: ${changes.length}${countChangeKinds(changes) ? ` (${countChangeKinds(changes)})` : ""}.`,
    ...changes.slice(0, 6).map((change) => `- ${changeListLine(change)}`),
    changes.length > 6 ? `- ...and ${changes.length - 6} more file changes.` : "",
    truncated ? "- Diff context was truncated before generating this message." : "",
  ].filter(Boolean).join("\n");
}

function sanitizeGeneratedCommitMessage(value: string): string {
  let message = value.replace(/\r\n/g, "\n").trim();
  message = message.replace(/^```(?:\w+)?\s*/i, "").replace(/\s*```$/i, "").trim();
  message = message.replace(/^commit message:\s*/i, "").trim();
  const lines = message.split("\n");
  while (lines.length && !lines[0]?.trim()) lines.shift();
  if (lines[0] && lines[0].length > 120) {
    lines[0] = lines[0].slice(0, 120).trimEnd();
  }
  return lines.join("\n").slice(0, 4_000).trim();
}

function readGitObject(repositoryRoot: string, spec: string): { content: string | null; binary: boolean; truncated: boolean } {
  try {
    const buffer = execFileSync("git", ["show", spec], {
      cwd: repositoryRoot,
      maxBuffer: GIT_DIFF_MAX_BUFFER,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    return contentFromBuffer(Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer)));
  } catch {
    return { content: "", binary: false, truncated: false };
  }
}

function buildGitDiffContents(
  repositoryRoot: string,
  filePath: string,
  previousFilePath: string,
  staged: boolean,
  untracked: boolean,
): {
  originalContent: string | null;
  modifiedContent: string | null;
  originalPath: string | null;
  modifiedPath: string | null;
  binary: boolean;
  contentTruncated: boolean;
} {
  const originalPath = previousFilePath || filePath;
  if (untracked) {
    const modified = readWorkingTreeFile(repositoryRoot, filePath);
    return {
      originalContent: "",
      modifiedContent: modified.content,
      originalPath: null,
      modifiedPath: filePath,
      binary: modified.binary,
      contentTruncated: modified.truncated,
    };
  }

  if (staged) {
    const original = readGitObject(repositoryRoot, `HEAD:${originalPath}`);
    const modified = readGitObject(repositoryRoot, `:${filePath}`);
    return {
      originalContent: original.content,
      modifiedContent: modified.content,
      originalPath,
      modifiedPath: filePath,
      binary: original.binary || modified.binary,
      contentTruncated: original.truncated || modified.truncated,
    };
  }

  const original = readGitObject(repositoryRoot, `:${originalPath}`);
  const modified = readWorkingTreeFile(repositoryRoot, filePath);
  return {
    originalContent: original.content,
    modifiedContent: modified.content,
    originalPath,
    modifiedPath: filePath,
    binary: original.binary || modified.binary,
    contentTruncated: original.truncated || modified.truncated,
  };
}

function normalizeRepositoryPath(value: string): string {
  const normalized = normalizeRelativePath(value);
  if (!normalized) return "";
  if (normalized.includes("\0")) {
    throw new Error("Invalid git path");
  }
  return normalized;
}

function normalizeRepositoryPaths(paths: string[] | undefined): string[] {
  const normalized = Array.from(new Set(
    (Array.isArray(paths) ? paths : [])
      .map((item) => normalizeRepositoryPath(item))
      .filter(Boolean),
  ));
  return normalized.slice(0, GIT_STATUS_CHANGE_LIMIT);
}

function normalizeGitRefName(value: string | null | undefined, label = "Git reference"): string {
  const normalized = String(value || "").trim();
  if (
    !normalized ||
    normalized.length > 160 ||
    normalized.includes("\0") ||
    normalized.startsWith("-") ||
    normalized.includes("..") ||
    normalized.includes("//") ||
    normalized.endsWith("/") ||
    /\s/.test(normalized) ||
    !/^[A-Za-z0-9._/@-]+$/.test(normalized)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function normalizeCommitMessage(value: string | null | undefined): string {
  const normalized = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new Error("Commit message is required");
  }
  if (normalized.length > 10_000) {
    throw new Error("Commit message is too long");
  }
  return normalized;
}

function normalizeOptionalRemoteRef(value: string | null | undefined, label: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalizeGitRefName(normalized, label);
}

function buildRemoteArgs(remote?: string, branch?: string): string[] {
  const remoteName = normalizeOptionalRemoteRef(remote, "Git remote");
  const branchName = normalizeOptionalRemoteRef(branch, "Git branch");
  if (!remoteName && branchName) {
    throw new Error("Git remote is required when branch is provided");
  }
  return remoteName ? [remoteName, ...(branchName ? [branchName] : [])] : [];
}

function currentBranchName(repositoryRoot: string): string {
  let branch = "";
  try {
    branch = runGit(repositoryRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
  } catch {
    // Detached HEAD has no symbolic branch name.
  }
  if (!branch) {
    throw new Error("Current Git branch is detached or unavailable");
  }
  return normalizeGitRefName(branch, "Current branch");
}

function normalizeStashRef(value: string | null | undefined): string {
  const normalized = String(value || "stash@{0}").trim();
  if (!/^stash@\{\d+\}$/.test(normalized)) {
    throw new Error("Git stash reference is invalid");
  }
  return normalized;
}

function normalizeStashMessage(value: string | null | undefined): string {
  const normalized = String(value || "Workspace stash").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "Workspace stash";
  if (normalized.length > 500) {
    throw new Error("Git stash message is too long");
  }
  return normalized;
}

function parseStashLine(line: string): GitStashEntry | null {
  const [ref = "", branch = "", message = ""] = line.split("\0");
  const normalizedRef = ref.trim();
  if (!normalizedRef) return null;
  return {
    ref: normalizedRef,
    selector: normalizedRef,
    branch: branch.trim(),
    message: message.trim(),
  };
}

function listRepositoryStashes(repositoryRoot: string): GitStashEntry[] {
  try {
    const output = runGit(repositoryRoot, [
      "stash",
      "list",
      "--format=%gd%x00%gs%x00%cr",
    ]);
    return output
      .split(/\r?\n/)
      .map(parseStashLine)
      .filter((entry): entry is GitStashEntry => Boolean(entry))
      .slice(0, 50);
  } catch {
    return [];
  }
}

function resolveRepositoryRoot(
  config: TracevaneServerConfig,
  rootId: string,
  directoryPath = "",
): { resolved: ReturnType<typeof resolveGitDirectory>; repositoryRoot: string } {
  const resolved = resolveGitDirectory(config, rootId, directoryPath);
  const repositoryRoot = runGit(resolved.absolutePath, ["rev-parse", "--show-toplevel"]).trim();
  return { resolved, repositoryRoot };
}

function parseBranchLine(line: string): {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
} {
  const body = line.replace(/^##\s*/, "").trim();
  const noCommitsMatch = body.match(/^No commits yet on\s+(.+)$/);
  if (noCommitsMatch) {
    return {
      branch: noCommitsMatch[1]?.trim() || "HEAD",
      upstream: null,
      ahead: 0,
      behind: 0,
    };
  }
  const bracketMatch = body.match(/\[(.+)\]$/);
  const bracket = bracketMatch?.[1] || "";
  const withoutBracket = bracketMatch
    ? body.slice(0, bracketMatch.index).trim()
    : body;
  const [branchRaw, upstreamRaw] = withoutBracket.split("...");
  const ahead = Number(bracket.match(/ahead\s+(\d+)/)?.[1] || 0);
  const behind = Number(bracket.match(/behind\s+(\d+)/)?.[1] || 0);
  return {
    branch: branchRaw || "HEAD",
    upstream: upstreamRaw || null,
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

function statusToKind(status: string): GitFileChangeKind {
  if (status.includes("U")) return "conflicted";
  if (status === "??") return "untracked";
  if (status.includes("R")) return "renamed";
  if (status.includes("C")) return "copied";
  if (status.includes("A")) return "added";
  if (status.includes("D")) return "deleted";
  if (status.includes("M")) return "modified";
  return "unknown";
}

function parseChangeRecord(status: string, rawPath: string, previousPath = ""): GitFileChange | null {
  const normalizedPath = rawPath.trim();
  if (!normalizedPath) return null;
  const x = status[0] || " ";
  const y = status[1] || " ";
  return {
    path: toPortablePath(normalizedPath),
    previousPath: previousPath ? toPortablePath(previousPath) : null,
    status,
    kind: statusToKind(status),
    staged: x !== " " && x !== "?",
    unstaged: y !== " " && y !== "?",
  };
}

function parseChangeLine(line: string): GitFileChange | null {
  if (line.length < 4) return null;
  const status = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  if (!rawPath) return null;
  const renamed = rawPath.includes(" -> ");
  const [previousPath, nextPath] = renamed
    ? rawPath.split(" -> ", 2)
    : ["", rawPath];
  return parseChangeRecord(status, nextPath || rawPath, previousPath);
}

function parseStatusPorcelain(output: string): { branch: ReturnType<typeof parseBranchLine>; changes: GitFileChange[] } {
  const records = output.split("\0").filter(Boolean);
  const branchRecord = records[0] || "## HEAD";
  const branch = parseBranchLine(branchRecord);
  const changes: GitFileChange[] = [];
  for (let index = 1; index < records.length && changes.length < GIT_STATUS_CHANGE_LIMIT; index += 1) {
    const record = records[index] || "";
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    const rawPath = record.slice(3);
    if (status.includes("R") || status.includes("C")) {
      const nextRecord = records[index + 1] || "";
      index += 1;
      const change = parseChangeRecord(status, nextRecord || rawPath, rawPath);
      if (change) changes.push(change);
      continue;
    }
    const change = parseChangeRecord(status, rawPath);
    if (change) changes.push(change);
  }
  return { branch, changes };
}

function parseBranchSummaryLine(line: string): GitBranchSummary | null {
  const [name = "", head = "", upstream = "", shortHash = "", subject = ""] = line.split("\0");
  const normalizedName = name.trim();
  if (!normalizedName) return null;
  return {
    name: normalizedName,
    current: head.trim() === "*",
    upstream: upstream.trim() || null,
    shortHash: shortHash.trim(),
    subject: subject.trim(),
  };
}

function listBranches(repositoryRoot: string): GitBranchSummary[] {
  try {
    const output = runGit(repositoryRoot, [
      "for-each-ref",
      "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)%00%(subject)",
      "refs/heads",
    ]);
    return output
      .split(/\r?\n/)
      .map(parseBranchSummaryLine)
      .filter((branch): branch is GitBranchSummary => Boolean(branch))
      .slice(0, GIT_BRANCH_LIMIT);
  } catch {
    return [];
  }
}

function listRemoteBranches(repositoryRoot: string): string[] {
  try {
    const output = runGit(repositoryRoot, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]);
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function assertLocalBranch(repositoryRoot: string, name: string, label = "Branch name"): string {
  const branchName = normalizeGitRefName(name, label);
  if (branchName === "HEAD") throw new Error(`${label} cannot be HEAD`);
  const exists = listBranches(repositoryRoot).some((branch) => branch.name === branchName);
  if (!exists) {
    const remoteExists = listRemoteBranches(repositoryRoot).some((branch) => branch === branchName);
    throw new Error(remoteExists ? "Remote-tracking branch management is not supported here" : "Git branch does not exist");
  }
  return branchName;
}

function assertBranchTargetAvailable(repositoryRoot: string, name: string): string {
  const branchName = normalizeGitRefName(name, "New branch name");
  if (branchName === "HEAD") throw new Error("New branch name cannot be HEAD");
  if (listBranches(repositoryRoot).some((branch) => branch.name === branchName)) {
    throw new Error("Target Git branch already exists");
  }
  return branchName;
}

function assertRemoteTrackingBranch(repositoryRoot: string, upstream: string): string {
  const upstreamName = normalizeGitRefName(upstream, "Git upstream");
  if (!upstreamName.includes("/")) {
    throw new Error("Git upstream must be a remote-tracking branch such as origin/main");
  }
  if (!listRemoteBranches(repositoryRoot).some((branch) => branch === upstreamName)) {
    throw new Error("Git upstream remote-tracking branch does not exist");
  }
  return upstreamName;
}


function clampGitLimit(value: number | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(parsed)));
}

function parseGraphCommitLine(line: string): GitGraphCommit | null {
  const [hash = "", shortHash = "", parents = "", authorName = "", authorEmail = "", date = "", refs = "", subject = ""] = line.split("\0");
  if (!hash.trim()) return null;
  return {
    hash: hash.trim(),
    shortHash: shortHash.trim(),
    parents: parents.trim().split(/\s+/).filter(Boolean),
    authorName: authorName.trim(),
    authorEmail: authorEmail.trim(),
    date: date.trim(),
    refs: refs.trim(),
    subject: subject.trim(),
  };
}

function parseGitBlame(repositoryRoot: string, filePath: string): GitBlamePayload["lines"] {
  const output = runGit(repositoryRoot, ["blame", "--line-porcelain", "--", filePath]);
  const lines = output.split(/\r?\n/);
  const parsed: GitBlamePayload["lines"] = [];
  let current: {
    hash: string;
    originalLineNumber: number;
    lineNumber: number;
    authorName: string;
    authorEmail: string;
    authorTime: string;
    summary: string;
  } | null = null;
  for (const raw of lines) {
    if (!raw) continue;
    const header = raw.match(/^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/);
    if (header) {
      current = {
        hash: header[1],
        originalLineNumber: Number(header[2]),
        lineNumber: Number(header[3]),
        authorName: "",
        authorEmail: "",
        authorTime: "",
        summary: "",
      };
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("author ")) current.authorName = raw.slice("author ".length).trim();
    else if (raw.startsWith("author-mail ")) current.authorEmail = raw.slice("author-mail ".length).replace(/^<|>$/g, "").trim();
    else if (raw.startsWith("author-time ")) current.authorTime = new Date(Number(raw.slice("author-time ".length).trim()) * 1000).toISOString();
    else if (raw.startsWith("summary ")) current.summary = raw.slice("summary ".length).trim();
    else if (raw.startsWith("\t")) {
      parsed.push({
        lineNumber: current.lineNumber,
        originalLineNumber: current.originalLineNumber,
        hash: current.hash,
        shortHash: current.hash.slice(0, 7),
        authorName: current.authorName,
        authorEmail: current.authorEmail,
        authorTime: current.authorTime,
        summary: current.summary,
        content: raw.slice(1),
      });
      current = null;
      if (parsed.length >= GIT_BLAME_LINE_LIMIT) break;
    }
  }
  return parsed;
}

function parseCommitLine(line: string): GitCommitSummary | null {
  const [hash = "", shortHash = "", authorName = "", authorEmail = "", date = "", refs = "", subject = ""] = line.split("\0");
  if (!hash.trim()) return null;
  return {
    hash: hash.trim(),
    shortHash: shortHash.trim(),
    authorName: authorName.trim(),
    authorEmail: authorEmail.trim(),
    date: date.trim(),
    refs: refs.trim(),
    subject: subject.trim(),
  };
}

function listCommits(repositoryRoot: string): GitCommitSummary[] {
  try {
    const output = runGit(repositoryRoot, [
      "log",
      `-${GIT_HISTORY_LIMIT}`,
      "--date=iso-strict",
      "--pretty=format:%H%x00%h%x00%an%x00%ae%x00%ad%x00%D%x00%s",
    ]);
    return output
      .split(/\r?\n/)
      .map(parseCommitLine)
      .filter((commit): commit is GitCommitSummary => Boolean(commit));
  } catch {
    return [];
  }
}

function listCommitFiles(repositoryRoot: string, hash: string): GitFileChange[] {
  try {
    const output = runGit(repositoryRoot, [
      "diff-tree",
      "--root",
      "--no-commit-id",
      "--name-status",
      "-r",
      hash,
    ]);
    return output
      .split(/\r?\n/)
      .map((line) => parseCommitFileLine(line))
      .filter((change): change is GitFileChange => Boolean(change));
  } catch {
    return [];
  }
}

function parseCommitFileLine(line: string): GitFileChange | null {
  const [status = "", firstPath = "", secondPath = ""] = line.split("\t");
  const code = status.trim();
  const pathValue = secondPath || firstPath;
  if (!code || !pathValue) return null;
  return {
    path: toPortablePath(pathValue),
    previousPath: secondPath ? toPortablePath(firstPath) : null,
    status: code,
    kind: statusToKind(code),
    staged: false,
    unstaged: false,
  };
}

function getCommitDiff(repositoryRoot: string, hash: string): {
  diff: string;
  binary: boolean;
  truncated: boolean;
} {
  try {
    const output = runGitForDiff(repositoryRoot, [
      "show",
      "--format=",
      "--find-renames",
      "--patch",
      hash,
    ]);
    const truncated = truncateGitDiff(output);
    return {
      diff: truncated.diff,
      binary: isBinaryDiff(output),
      truncated: truncated.truncated,
    };
  } catch {
    return { diff: "", binary: false, truncated: false };
  }
}

function parseCommitDetail(
  output: string,
  fallbackHash: string,
  files: GitFileChange[] = [],
  diffInfo: { diff: string; binary: boolean; truncated: boolean } = {
    diff: "",
    binary: false,
    truncated: false,
  },
): GitCommitDetailPayload {
  const [
    hash = "",
    shortHash = "",
    authorName = "",
    authorEmail = "",
    date = "",
    refs = "",
    parents = "",
    ...messageParts
  ] = output.split("\0");
  const message = messageParts.join("\0").trimEnd();
  const [subject = "", ...bodyLines] = message.split(/\r?\n/);
  return {
    checkedAt: toIsoNow(),
    hash: hash.trim() || fallbackHash,
    shortHash: shortHash.trim() || fallbackHash.slice(0, 7),
    subject: subject.trim(),
    body: bodyLines.join("\n").trim(),
    message,
    authorName: authorName.trim(),
    authorEmail: authorEmail.trim(),
    date: date.trim(),
    refs: refs.trim(),
    parents: parents.trim().split(/\s+/).filter(Boolean),
    files,
    diff: diffInfo.diff,
    binary: diffInfo.binary,
    truncated: diffInfo.truncated,
  };
}

function buildCommitMessageContext(
  repositoryRoot: string,
  status: GitStatusPayload,
  requestedStaged = false,
): {
  staged: boolean;
  files: GitFileChange[];
  diff: string;
  truncated: boolean;
} {
  const stagedFiles = status.changes.filter((change) => change.staged);
  const staged = requestedStaged === true && stagedFiles.length > 0;
  const files = staged ? stagedFiles : status.changes;
  if (!files.length) {
    return {
      staged,
      files,
      diff: "",
      truncated: false,
    };
  }

  const diffParts: string[] = [];
  let truncated = false;
  const trackedDiff = runGitForDiff(repositoryRoot, [
    "diff",
    "--no-color",
    "--find-renames",
    "--find-copies",
    ...(staged ? ["--cached"] : []),
    "--",
  ]);
  if (trackedDiff.trim()) diffParts.push(trackedDiff.trimEnd());

  if (!staged) {
    for (const change of files) {
      if (change.kind !== "untracked") continue;
      try {
        const untracked = buildUntrackedDiff(repositoryRoot, normalizeRepositoryPath(change.path));
        diffParts.push(untracked.diff);
        truncated = truncated || untracked.truncated;
      } catch (error) {
        diffParts.push([
          `diff --git a/${diffPathLabel(change.path)} b/${diffPathLabel(change.path)}`,
          "new file mode 100644",
          `+Unable to read untracked file for commit context: ${error instanceof Error ? error.message : "unknown error"}`,
        ].join("\n"));
      }
    }
  }

  const diff = diffParts.join("\n\n");
  const limited = truncateText(diff, GIT_COMMIT_MESSAGE_DIFF_MAX_CHARS);
  return {
    staged,
    files,
    diff: limited.text,
    truncated: truncated || limited.truncated,
  };
}

function buildCommitMessageSystemPrompt(): string {
  return [
    "You generate Tracevane Git commit messages from real git diff context.",
    "Output only the commit message text. Do not wrap it in Markdown fences.",
    "Use English.",
    "First line: concise present-tense intent, 72 characters or fewer when possible.",
    "Body: add a blank line, then 1-4 bullets or short sentences when useful.",
    "Do not claim tests, issue numbers, reviewers, or behavior not visible in the diff.",
    "Prefer product intent over a raw file list, but stay grounded in the provided diff.",
  ].join("\n");
}

function buildCommitMessagePrompt(
  status: GitStatusPayload,
  context: ReturnType<typeof buildCommitMessageContext>,
): string {
  return [
    `Repository branch: ${status.branch || "HEAD"}`,
    `Scope: ${context.staged ? "staged changes only" : "working tree changes"}`,
    `Files changed: ${context.files.length}`,
    `Change kinds: ${countChangeKinds(context.files) || "none"}`,
    context.truncated ? "Note: diff context is truncated." : "Note: full captured diff context follows.",
    "",
    "Changed files:",
    ...context.files.map((change) => `- ${changeListLine(change)}`),
    "",
    "Unified diff:",
    context.diff || "(No textual diff was available; use the changed file list only.)",
  ].join("\n");
}

function emptyGitStatus(rootId: string, directoryPath: string, message: string): GitStatusPayload {
  return {
    checkedAt: toIsoNow(),
    rootId,
    directoryPath,
    repositoryRoot: null,
    repositoryRelativePath: "",
    available: false,
    clean: true,
    branch: "",
    upstream: null,
    ahead: 0,
    behind: 0,
    message,
    changes: [],
    branches: [],
    commits: [],
  };
}

export function createGitService(
  config: TracevaneServerConfig,
  options: { modelGateway?: ModelGatewayService } = {},
): GitService {
  const buildStatus = (rootId: string, directoryPath = ""): GitStatusPayload => {
    const resolved = resolveGitDirectory(config, rootId, directoryPath);
    let repositoryRoot = "";
    try {
      repositoryRoot = runGit(resolved.absolutePath, ["rev-parse", "--show-toplevel"]).trim();
    } catch {
      return emptyGitStatus(
        resolved.root.id,
        resolved.relativePath,
        "Selected directory is not inside a Git repository",
      );
    }

    const branchOutput = runGit(repositoryRoot, ["status", "--porcelain=v1", "-z", "-b"]);
    const { branch, changes } = parseStatusPorcelain(branchOutput);

    const branches = listBranches(repositoryRoot);
    if (!branches.length && branch.branch && branch.branch !== "HEAD") {
      branches.push({
        name: branch.branch,
        current: true,
        upstream: branch.upstream,
        shortHash: "",
        subject: "",
      });
    }

    return {
      checkedAt: toIsoNow(),
      rootId: resolved.root.id,
      directoryPath: resolved.relativePath,
      repositoryRoot,
      repositoryRelativePath: toPortablePath(path.relative(repositoryRoot, resolved.absolutePath)),
      available: true,
      clean: changes.length === 0,
      branch: branch.branch,
      upstream: branch.upstream,
      ahead: branch.ahead,
      behind: branch.behind,
      message: null,
      changes,
      branches,
      commits: listCommits(repositoryRoot),
    };
  };

  return {
    getStatus(rootId: string, directoryPath = ""): GitStatusPayload {
      return buildStatus(rootId, directoryPath);
    },

    getDiff(rootId: string, directoryPath = "", filePath = "", staged = false, untracked = false, previousFilePath = ""): GitDiffPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const normalizedFilePath = normalizeRepositoryPath(filePath);
      const normalizedPreviousFilePath = previousFilePath ? normalizeRepositoryPath(previousFilePath) : "";
      if (!normalizedFilePath) {
        throw new Error("Git diff file path is required");
      }

      const diffArgs = untracked
        ? ["diff", "--no-index", "--no-color", "--", "/dev/null", normalizedFilePath]
        : ["diff", ...(staged ? ["--cached"] : []), "--no-color", "--", normalizedFilePath];
      const output = runGitForDiff(repositoryRoot, diffArgs);
      const truncated = truncateGitDiff(output);
      const contents = buildGitDiffContents(
        repositoryRoot,
        normalizedFilePath,
        normalizedPreviousFilePath,
        staged === true,
        untracked === true,
      );
      const binary = isBinaryDiff(output) || contents.binary;

      return {
        checkedAt: toIsoNow(),
        rootId: resolved.root.id,
        directoryPath: resolved.relativePath,
        repositoryRoot,
        path: normalizedFilePath,
        previousPath: normalizedPreviousFilePath || null,
        originalPath: contents.originalPath,
        modifiedPath: contents.modifiedPath,
        staged: staged === true,
        untracked: untracked === true,
        binary,
        truncated: truncated.truncated,
        diff: truncated.diff,
        originalContent: contents.originalContent,
        modifiedContent: contents.modifiedContent,
        contentTruncated: contents.contentTruncated,
        message: output.trim() || contents.originalContent !== contents.modifiedContent ? null : "No diff is available for this file",
      };
    },

    getCommit(rootId: string, directoryPath = "", hash = ""): GitCommitDetailPayload {
      const { repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const normalizedHash = normalizeGitRefName(hash, "Commit reference");
      const output = runGit(repositoryRoot, [
        "show",
        "--no-patch",
        "--date=iso-strict",
        "--pretty=format:%H%x00%h%x00%an%x00%ae%x00%ad%x00%D%x00%P%x00%B",
        normalizedHash,
      ]);
      const files = listCommitFiles(repositoryRoot, normalizedHash);
      const diffInfo = getCommitDiff(repositoryRoot, normalizedHash);
      return parseCommitDetail(output, normalizedHash, files, diffInfo);
    },


    getGraph(rootId: string, directoryPath = "", limit = GIT_HISTORY_LIMIT, includeAll = false, filePath = ""): GitGraphPayload {
      const resolved = resolveGitDirectory(config, rootId, directoryPath);
      try {
        const repositoryRoot = runGit(resolved.absolutePath, ["rev-parse", "--show-toplevel"]).trim();
        const normalizedFilePath = filePath ? normalizeRepositoryPath(filePath) : "";
        const args = [
          "log",
          `-${clampGitLimit(limit, GIT_HISTORY_LIMIT, GIT_GRAPH_LIMIT)}`,
          "--date=iso-strict",
          "--pretty=format:%H%x00%h%x00%P%x00%an%x00%ae%x00%ad%x00%D%x00%s",
          ...(includeAll ? ["--all"] : []),
          ...(normalizedFilePath ? ["--", normalizedFilePath] : []),
        ];
        const output = runGit(repositoryRoot, args);
        return {
          checkedAt: toIsoNow(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          repositoryRoot,
          available: true,
          message: null,
          commits: output.split(/\r?\n/).map(parseGraphCommitLine).filter((commit): commit is GitGraphCommit => Boolean(commit)),
        };
      } catch (error) {
        return {
          checkedAt: toIsoNow(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          repositoryRoot: null,
          available: false,
          message: error instanceof Error ? error.message : "Git graph is unavailable",
          commits: [],
        };
      }
    },

    getBlame(rootId: string, directoryPath = "", filePath = ""): GitBlamePayload {
      const resolved = resolveGitDirectory(config, rootId, directoryPath);
      const normalizedFilePath = normalizeRepositoryPath(filePath);
      if (!normalizedFilePath) {
        throw new Error("Git blame file path is required");
      }
      try {
        const repositoryRoot = runGit(resolved.absolutePath, ["rev-parse", "--show-toplevel"]).trim();
        const lines = parseGitBlame(repositoryRoot, normalizedFilePath);
        return {
          checkedAt: toIsoNow(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          repositoryRoot,
          available: true,
          message: null,
          path: normalizedFilePath,
          lines,
          truncated: lines.length >= GIT_BLAME_LINE_LIMIT,
        };
      } catch (error) {
        return {
          checkedAt: toIsoNow(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          repositoryRoot: null,
          available: false,
          message: error instanceof Error ? error.message : "Git blame is unavailable",
          path: normalizedFilePath,
          lines: [],
          truncated: false,
        };
      }
    },

    async generateCommitMessage(rootId: string, directoryPath = "", staged = false, model = ""): Promise<GitCommitMessagePayload> {
      const resolved = resolveGitDirectory(config, rootId, directoryPath);
      try {
        const repositoryRoot = runGit(resolved.absolutePath, ["rev-parse", "--show-toplevel"]).trim();
        const status = buildStatus(resolved.root.id, resolved.relativePath);
        const context = buildCommitMessageContext(repositoryRoot, status, staged === true);
        if (!context.files.length) {
          return {
            checkedAt: toIsoNow(),
            rootId: resolved.root.id,
            directoryPath: resolved.relativePath,
            repositoryRoot,
            available: false,
            message: "No Git changes are available to summarize.",
            commitMessage: "",
            source: "local-fallback",
            model: null,
            providerId: null,
            staged: context.staged,
            files: [],
            truncated: false,
            promptVersion: GIT_COMMIT_MESSAGE_PROMPT_VERSION,
          };
        }

        const fallback = fallbackCommitMessage(
          context.files,
          status.branch,
          context.staged,
          context.truncated,
        );
        if (!options.modelGateway) {
          return {
            checkedAt: toIsoNow(),
            rootId: resolved.root.id,
            directoryPath: resolved.relativePath,
            repositoryRoot,
            available: true,
            message: "Model Gateway is not available; generated a local diff summary.",
            commitMessage: fallback,
            source: "local-fallback",
            model: null,
            providerId: null,
            staged: context.staged,
            files: context.files,
            truncated: context.truncated,
            promptVersion: GIT_COMMIT_MESSAGE_PROMPT_VERSION,
          };
        }

        const generation = await options.modelGateway.generateText(undefined, {
          scope: "codex",
          model: model || undefined,
          system: buildCommitMessageSystemPrompt(),
          input: buildCommitMessagePrompt(status, context),
          maxOutputTokens: 700,
          temperature: 0.2,
          timeoutMs: 12_000,
        });
        const generated = sanitizeGeneratedCommitMessage(generation.text);
        if (generation.ok && generated) {
          return {
            checkedAt: toIsoNow(),
            rootId: resolved.root.id,
            directoryPath: resolved.relativePath,
            repositoryRoot,
            available: true,
            message: null,
            commitMessage: generated,
            source: "model-gateway",
            model: generation.model,
            providerId: generation.providerId,
            staged: context.staged,
            files: context.files,
            truncated: context.truncated,
            promptVersion: GIT_COMMIT_MESSAGE_PROMPT_VERSION,
          };
        }

        return {
          checkedAt: toIsoNow(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          repositoryRoot,
          available: true,
          message: generation.error?.message || "Model Gateway did not return a usable commit message; generated a local diff summary.",
          commitMessage: fallback,
          source: "local-fallback",
          model: generation.model,
          providerId: generation.providerId,
          staged: context.staged,
          files: context.files,
          truncated: context.truncated,
          promptVersion: GIT_COMMIT_MESSAGE_PROMPT_VERSION,
        };
      } catch (error) {
        return {
          checkedAt: toIsoNow(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          repositoryRoot: null,
          available: false,
          message: error instanceof Error ? error.message : "Git commit message generation is unavailable.",
          commitMessage: "",
          source: "local-fallback",
          model: null,
          providerId: null,
          staged: staged === true,
          files: [],
          truncated: false,
          promptVersion: GIT_COMMIT_MESSAGE_PROMPT_VERSION,
        };
      }
    },

    initRepository(rootId: string, directoryPath = ""): GitStatusPayload {
      const resolved = resolveGitDirectory(config, rootId, directoryPath);
      runGit(resolved.absolutePath, ["init"]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    stagePaths(rootId: string, directoryPath = "", paths?: string[]): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const normalizedPaths = normalizeRepositoryPaths(paths);
      runGit(repositoryRoot, normalizedPaths.length ? ["add", "--", ...normalizedPaths] : ["add", "-A"]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    unstagePaths(rootId: string, directoryPath = "", paths?: string[]): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const normalizedPaths = normalizeRepositoryPaths(paths);
      runGit(repositoryRoot, normalizedPaths.length
        ? ["restore", "--staged", "--", ...normalizedPaths]
        : ["restore", "--staged", "--", "."]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    discardPaths(rootId: string, directoryPath = "", paths?: string[]): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const normalizedPaths = normalizeRepositoryPaths(paths);
      if (!normalizedPaths.length) {
        throw new Error("Discard requires at least one path");
      }
      const trackedPaths = normalizedPaths.filter((filePath) => {
        try {
          runGit(repositoryRoot, ["ls-files", "--error-unmatch", "--", filePath]);
          return true;
        } catch {
          return false;
        }
      });
      const untrackedPaths = normalizedPaths.filter((filePath) => !trackedPaths.includes(filePath));
      if (trackedPaths.length) {
        runGit(repositoryRoot, ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...trackedPaths]);
      }
      if (untrackedPaths.length) {
        runGit(repositoryRoot, ["clean", "-fd", "--", ...untrackedPaths]);
      }
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    commit(rootId: string, directoryPath = "", message = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      runGit(repositoryRoot, ["commit", "-m", normalizeCommitMessage(message)]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    createBranch(rootId: string, directoryPath = "", name = "", checkout = true, from = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const branchName = normalizeGitRefName(name, "Branch name");
      const args = checkout ? ["checkout", "-b", branchName] : ["branch", branchName];
      const fromRef = String(from || "").trim();
      if (fromRef) args.push(normalizeGitRefName(fromRef, "Start point"));
      runGit(repositoryRoot, args);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    checkout(rootId: string, directoryPath = "", target = "", detach = false): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const normalizedTarget = normalizeGitRefName(target, "Checkout target");
      runGit(repositoryRoot, detach ? ["checkout", "--detach", normalizedTarget] : ["checkout", normalizedTarget]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    revertCommit(rootId: string, directoryPath = "", hash = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const normalizedHash = normalizeGitRefName(hash, "Commit hash");
      runGit(repositoryRoot, ["revert", "--no-edit", normalizedHash]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    deleteBranch(rootId: string, directoryPath = "", name = "", force = false): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      if (force) {
        throw new Error("Force deleting Git branches is not supported by the IDE branch manager");
      }
      const branchName = assertLocalBranch(repositoryRoot, name);
      const current = currentBranchName(repositoryRoot);
      if (branchName === current) {
        throw new Error("Cannot delete the current Git branch");
      }
      runGit(repositoryRoot, ["branch", "-d", branchName]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    renameBranch(rootId: string, directoryPath = "", oldName = "", newName = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const sourceName = assertLocalBranch(repositoryRoot, oldName, "Old branch name");
      const targetName = assertBranchTargetAvailable(repositoryRoot, newName);
      if (sourceName === targetName) {
        throw new Error("New branch name must be different");
      }
      const current = currentBranchName(repositoryRoot);
      runGit(repositoryRoot, sourceName === current ? ["branch", "-m", targetName] : ["branch", "-m", sourceName, targetName]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    setBranchUpstream(rootId: string, directoryPath = "", branch = "", upstream = "", unset = false): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const branchName = assertLocalBranch(repositoryRoot, branch || currentBranchName(repositoryRoot));
      if (unset) {
        runGit(repositoryRoot, ["branch", "--unset-upstream", branchName]);
        return buildStatus(resolved.root.id, resolved.relativePath);
      }
      const upstreamName = assertRemoteTrackingBranch(repositoryRoot, upstream);
      runGit(repositoryRoot, ["branch", "--set-upstream-to", upstreamName, branchName]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    fetch(rootId: string, directoryPath = "", remote = "", branch = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      runGit(repositoryRoot, ["fetch", ...buildRemoteArgs(remote, branch)]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    pull(rootId: string, directoryPath = "", remote = "", branch = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      runGit(repositoryRoot, ["pull", "--ff-only", ...buildRemoteArgs(remote, branch)]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    push(rootId: string, directoryPath = "", remote = "", branch = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      runGit(repositoryRoot, ["push", ...buildRemoteArgs(remote, branch)]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    sync(rootId: string, directoryPath = "", remote = "", branch = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const args = buildRemoteArgs(remote, branch);
      runGit(repositoryRoot, ["pull", "--ff-only", ...args]);
      runGit(repositoryRoot, ["push", ...args]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    publishBranch(rootId: string, directoryPath = "", remote = "origin", branch = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const remoteName = normalizeOptionalRemoteRef(remote, "Git remote") || "origin";
      const branchName = normalizeOptionalRemoteRef(branch, "Git branch") || currentBranchName(repositoryRoot);
      runGit(repositoryRoot, ["push", "--set-upstream", remoteName, branchName]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    listStashes(rootId: string, directoryPath = ""): GitStashListPayload {
      const resolved = resolveGitDirectory(config, rootId, directoryPath);
      try {
        const repositoryRoot = runGit(resolved.absolutePath, ["rev-parse", "--show-toplevel"]).trim();
        return {
          checkedAt: toIsoNow(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          repositoryRoot,
          available: true,
          message: null,
          stashes: listRepositoryStashes(repositoryRoot),
        };
      } catch {
        return {
          checkedAt: toIsoNow(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          repositoryRoot: null,
          available: false,
          message: "Selected directory is not inside a Git repository",
          stashes: [],
        };
      }
    },

    saveStash(rootId: string, directoryPath = "", message = "", includeUntracked = true): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      runGit(repositoryRoot, [
        "stash",
        "save",
        ...(includeUntracked ? ["--include-untracked"] : []),
        "--",
        normalizeStashMessage(message),
      ]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    applyStash(rootId: string, directoryPath = "", ref = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      runGit(repositoryRoot, ["stash", "apply", normalizeStashRef(ref)]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    popStash(rootId: string, directoryPath = "", ref = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      runGit(repositoryRoot, ["stash", "pop", normalizeStashRef(ref)]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },

    dropStash(rootId: string, directoryPath = "", ref = ""): GitStatusPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      runGit(repositoryRoot, ["stash", "drop", normalizeStashRef(ref)]);
      return buildStatus(resolved.root.id, resolved.relativePath);
    },
  };
}
