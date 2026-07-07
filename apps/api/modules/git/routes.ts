import type http from "node:http";
import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  GitCheckoutRequest,
  GitCommitDetailRequest,
  GitCommitRequest,
  GitCreateBranchRequest,
  GitDiffRequest,
  GitPathActionRequest,
  GitPublishBranchRequest,
  GitRemoteActionRequest,
  GitRepositoryRequest,
  GitStashActionRequest,
  GitStashSaveRequest,
} from "../../../../types/git.js";

function readUrl(req: http.IncomingMessage): URL {
  return new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
}

export function registerGitRoutes(router: TracevaneRouter, ctx: TracevaneApiContext): void {
  router.get("/api/git/status", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(
      res,
      200,
      routeCtx.services.git.getStatus(
        url.searchParams.get("rootId") || "",
        url.searchParams.get("path") || "",
      ),
    );
  });

  router.get("/api/git/diff", (req, res, routeCtx) => {
    const url = readUrl(req);
    const payload: GitDiffRequest = {
      rootId: url.searchParams.get("rootId") || "",
      path: url.searchParams.get("path") || "",
      file: url.searchParams.get("file") || "",
      previousFile: url.searchParams.get("previousFile") || "",
      staged: url.searchParams.get("staged") === "true",
      untracked: url.searchParams.get("untracked") === "true",
    };
    sendJson(
      res,
      200,
      routeCtx.services.git.getDiff(
        payload.rootId || "",
        payload.path || "",
        payload.file || "",
        payload.staged === true,
        payload.untracked === true,
        payload.previousFile || "",
      ),
    );
  });

  router.get("/api/git/commit-detail", (req, res, routeCtx) => {
    const url = readUrl(req);
    const payload: GitCommitDetailRequest = {
      rootId: url.searchParams.get("rootId") || "",
      path: url.searchParams.get("path") || "",
      hash: url.searchParams.get("hash") || "",
    };
    sendJson(
      res,
      200,
      routeCtx.services.git.getCommit(
        payload.rootId || "",
        payload.path || "",
        payload.hash || "",
      ),
    );
  });

  router.get("/api/git/stashes", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(
      res,
      200,
      routeCtx.services.git.listStashes(
        url.searchParams.get("rootId") || "",
        url.searchParams.get("path") || "",
      ),
    );
  });

  router.post("/api/git/init", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitRepositoryRequest>(req);
    sendJson(res, 200, routeCtx.services.git.initRepository(payload.rootId || "", payload.path || ""));
  });

  router.post("/api/git/stage", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitPathActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.stagePaths(payload.rootId || "", payload.path || "", payload.paths));
  });

  router.post("/api/git/unstage", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitPathActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.unstagePaths(payload.rootId || "", payload.path || "", payload.paths));
  });

  router.post("/api/git/commit", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitCommitRequest>(req);
    sendJson(res, 200, routeCtx.services.git.commit(payload.rootId || "", payload.path || "", payload.message || ""));
  });

  router.post("/api/git/branches", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitCreateBranchRequest>(req);
    sendJson(
      res,
      200,
      routeCtx.services.git.createBranch(
        payload.rootId || "",
        payload.path || "",
        payload.name || "",
        payload.checkout !== false,
        payload.from || "",
      ),
    );
  });

  router.post("/api/git/checkout", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitCheckoutRequest>(req);
    sendJson(
      res,
      200,
      routeCtx.services.git.checkout(
        payload.rootId || "",
        payload.path || "",
        payload.target || "",
        payload.detach === true,
      ),
    );
  });

  router.post("/api/git/fetch", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitRemoteActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.fetch(payload.rootId || "", payload.path || "", payload.remote || "", payload.branch || ""));
  });

  router.post("/api/git/pull", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitRemoteActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.pull(payload.rootId || "", payload.path || "", payload.remote || "", payload.branch || ""));
  });

  router.post("/api/git/push", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitRemoteActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.push(payload.rootId || "", payload.path || "", payload.remote || "", payload.branch || ""));
  });

  router.post("/api/git/sync", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitRemoteActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.sync(payload.rootId || "", payload.path || "", payload.remote || "", payload.branch || ""));
  });

  router.post("/api/git/publish", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitPublishBranchRequest>(req);
    sendJson(res, 200, routeCtx.services.git.publishBranch(payload.rootId || "", payload.path || "", payload.remote || "origin", payload.branch || ""));
  });

  router.post("/api/git/stashes", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitStashSaveRequest>(req);
    sendJson(
      res,
      200,
      routeCtx.services.git.saveStash(
        payload.rootId || "",
        payload.path || "",
        payload.message || "",
        payload.includeUntracked !== false,
      ),
    );
  });

  router.post("/api/git/stashes/apply", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitStashActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.applyStash(payload.rootId || "", payload.path || "", payload.ref || ""));
  });

  router.post("/api/git/stashes/pop", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitStashActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.popStash(payload.rootId || "", payload.path || "", payload.ref || ""));
  });

  router.post("/api/git/stashes/drop", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<GitStashActionRequest>(req);
    sendJson(res, 200, routeCtx.services.git.dropStash(payload.rootId || "", payload.path || "", payload.ref || ""));
  });
}
