import { requestJson } from '../../shared/api';
import type {
  GitCheckoutRequest,
  GitCommitDetailPayload,
  GitCommitRequest,
  GitCreateBranchRequest,
  GitDiffPayload,
  GitPathActionRequest,
  GitRepositoryRequest,
  GitStatusPayload,
} from '../../../../../types/git';

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const raw = search.toString();
  return raw ? `?${raw}` : '';
}

export function fetchGitStatus(
  rootId: string,
  directoryPath = '',
): Promise<GitStatusPayload> {
  return requestJson<GitStatusPayload>(
    `/api/git/status${buildQuery({ rootId, path: directoryPath })}`,
  );
}

export function fetchGitDiff(
  rootId: string,
  directoryPath: string,
  filePath: string,
  options: { staged?: boolean; untracked?: boolean } = {},
): Promise<GitDiffPayload> {
  return requestJson<GitDiffPayload>(
    `/api/git/diff${buildQuery({
      rootId,
      path: directoryPath,
      file: filePath,
      staged: options.staged === true,
      untracked: options.untracked === true,
    })}`,
  );
}

export function fetchGitCommitDetail(
  rootId: string,
  directoryPath: string,
  hash: string,
): Promise<GitCommitDetailPayload> {
  return requestJson<GitCommitDetailPayload>(
    `/api/git/commit-detail${buildQuery({ rootId, path: directoryPath, hash })}`,
  );
}

function postGitAction<TPayload extends GitRepositoryRequest>(
  endpoint: string,
  payload: TPayload,
): Promise<GitStatusPayload> {
  return requestJson<GitStatusPayload>(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function initGitRepository(payload: GitRepositoryRequest): Promise<GitStatusPayload> {
  return postGitAction('/api/git/init', payload);
}

export function stageGitPaths(payload: GitPathActionRequest): Promise<GitStatusPayload> {
  return postGitAction('/api/git/stage', payload);
}

export function unstageGitPaths(payload: GitPathActionRequest): Promise<GitStatusPayload> {
  return postGitAction('/api/git/unstage', payload);
}

export function commitGitChanges(payload: GitCommitRequest): Promise<GitStatusPayload> {
  return postGitAction('/api/git/commit', payload);
}

export function createGitBranch(payload: GitCreateBranchRequest): Promise<GitStatusPayload> {
  return postGitAction('/api/git/branches', payload);
}

export function checkoutGitTarget(payload: GitCheckoutRequest): Promise<GitStatusPayload> {
  return postGitAction('/api/git/checkout', payload);
}
