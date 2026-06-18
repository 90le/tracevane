import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  GitBranchSummary,
  GitCommitDetailPayload,
  GitCommitSummary,
  GitDiffPayload,
  GitFileChange,
  GitFileChangeKind,
  GitStatusPayload,
} from "../../../../types/git.js";

const GIT_STATUS_CHANGE_LIMIT = 500;
const GIT_HISTORY_LIMIT = 80;
const GIT_BRANCH_LIMIT = 120;
const GIT_DIFF_MAX_CHARS = 220_000;
const GIT_DIFF_MAX_BUFFER = 4 * 1024 * 1024;

interface GitRootContext {
  id: string;
  absolutePath: string;
  realPath: string;
}

export interface GitService {
  getStatus(rootId: string, directoryPath?: string): GitStatusPayload;
  getDiff(rootId: string, directoryPath: string | undefined, filePath?: string, staged?: boolean, untracked?: boolean): GitDiffPayload;
  getCommit(rootId: string, directoryPath: string | undefined, hash?: string): GitCommitDetailPayload;
  initRepository(rootId: string, directoryPath?: string): GitStatusPayload;
  stagePaths(rootId: string, directoryPath: string | undefined, paths?: string[]): GitStatusPayload;
  unstagePaths(rootId: string, directoryPath: string | undefined, paths?: string[]): GitStatusPayload;
  commit(rootId: string, directoryPath: string | undefined, message?: string): GitStatusPayload;
  createBranch(rootId: string, directoryPath: string | undefined, name?: string, checkout?: boolean, from?: string): GitStatusPayload;
  checkout(rootId: string, directoryPath: string | undefined, target?: string, detach?: boolean): GitStatusPayload;
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
  const candidates: Array<{ id: string; absolutePath: string }> = [
    { id: "openclaw-root", absolutePath: config.openclawRoot },
    { id: "home-root", absolutePath: os.homedir() },
    { id: "system-root", absolutePath: path.parse(config.openclawRoot || process.cwd()).root || "/" },
    { id: "project-root", absolutePath: config.projectRoot },
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

function isBinaryDiff(diff: string): boolean {
  return /(?:Binary files .* differ|GIT binary patch)/.test(diff);
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

function parseChangeLine(line: string): GitFileChange | null {
  if (line.length < 4) return null;
  const status = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  if (!rawPath) return null;
  const renamed = rawPath.includes(" -> ");
  const [previousPath, nextPath] = renamed
    ? rawPath.split(" -> ", 2)
    : ["", rawPath];
  const x = status[0] || " ";
  const y = status[1] || " ";
  return {
    path: toPortablePath(nextPath || rawPath),
    previousPath: previousPath ? toPortablePath(previousPath) : null,
    status,
    kind: statusToKind(status),
    staged: x !== " " && x !== "?",
    unstaged: y !== " " && y !== "?",
  };
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
      "branch",
      "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)%00%(subject)",
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

function parseCommitDetail(output: string, fallbackHash: string): GitCommitDetailPayload {
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
  };
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

export function createGitService(config: TracevaneServerConfig): GitService {
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

    const branchOutput = runGit(repositoryRoot, ["status", "--porcelain=v1", "-b"]);
    const lines = branchOutput.split(/\r?\n/).filter(Boolean);
    const branch = parseBranchLine(lines[0] || "## HEAD");
    const changes = lines
      .slice(1)
      .map(parseChangeLine)
      .filter((change): change is GitFileChange => Boolean(change))
      .slice(0, GIT_STATUS_CHANGE_LIMIT);

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

    getDiff(rootId: string, directoryPath = "", filePath = "", staged = false, untracked = false): GitDiffPayload {
      const { resolved, repositoryRoot } = resolveRepositoryRoot(config, rootId, directoryPath);
      const normalizedFilePath = normalizeRepositoryPath(filePath);
      if (!normalizedFilePath) {
        throw new Error("Git diff file path is required");
      }

      const diffArgs = untracked
        ? ["diff", "--no-index", "--no-color", "--", "/dev/null", normalizedFilePath]
        : ["diff", ...(staged ? ["--cached"] : []), "--no-color", "--", normalizedFilePath];
      const output = runGitForDiff(repositoryRoot, diffArgs);
      const truncated = truncateGitDiff(output);
      const binary = isBinaryDiff(output);

      return {
        checkedAt: toIsoNow(),
        rootId: resolved.root.id,
        directoryPath: resolved.relativePath,
        repositoryRoot,
        path: normalizedFilePath,
        staged: staged === true,
        untracked: untracked === true,
        binary,
        truncated: truncated.truncated,
        diff: truncated.diff,
        message: output.trim() ? null : "No diff is available for this file",
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
      return parseCommitDetail(output, normalizedHash);
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
  };
}
