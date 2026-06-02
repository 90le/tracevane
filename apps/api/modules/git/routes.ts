import type http from "node:http";
import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioApiContext } from "../../core/context.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  GitCheckoutRequest,
  GitCommitDetailRequest,
  GitCommitRequest,
  GitCreateBranchRequest,
  GitDiffRequest,
  GitPathActionRequest,
  GitRepositoryRequest,
} from "../../../../types/git.js";

function readUrl(req: http.IncomingMessage): URL {
  return new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
}

export function registerGitRoutes(router: StudioRouter, ctx: StudioApiContext): void {
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
}
