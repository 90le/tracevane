import type http from "node:http";
import fs from "node:fs";
import { buildContentDisposition, parseJsonBody, sendFileStream, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  FilesArchivePayload,
  FilesCreateDirectoryPayload,
  FilesCreateFilePayload,
  FilesDeletePayload,
  FilesRenamePayload,
  FilesTransferPayload,
  FilesUnarchivePayload,
  FilesUploadPayload,
  FilesWritePayload,
} from "../../../../types/files.js";

function readUrl(req: http.IncomingMessage): URL {
  return new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
}

function readFlag(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function readNumber(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function readDirectorySortKey(value: string | null): "name" | "size" | "modifiedAt" {
  return value === "size" || value === "modifiedAt" ? value : "name";
}

function readDirectorySortDirection(value: string | null): "asc" | "desc" {
  return value === "desc" ? "desc" : "asc";
}

export function registerFilesRoutes(router: TracevaneRouter, ctx: TracevaneApiContext): void {
  router.get("/api/files/summary", (_req, res) => {
    sendJson(res, 200, ctx.services.files.getSummary());
  });

  router.get("/api/files/browse", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(
      res,
      200,
      routeCtx.services.files.listDirectory(
        url.searchParams.get("rootId") || "",
        url.searchParams.get("path") || "",
        readFlag(url.searchParams.get("hidden"), true),
        {
          page: readNumber(url.searchParams.get("page")),
          pageSize: readNumber(url.searchParams.get("pageSize")),
          sortKey: readDirectorySortKey(url.searchParams.get("sortKey")),
          sortDirection: readDirectorySortDirection(url.searchParams.get("sortDirection")),
        },
      ),
    );
  });

  router.get("/api/files/tree", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(
      res,
      200,
      routeCtx.services.files.listTree(
        url.searchParams.get("rootId") || "",
        url.searchParams.get("path") || "",
        readFlag(url.searchParams.get("hidden"), true),
      ),
    );
  });

  router.get("/api/files/read", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(
      res,
      200,
      routeCtx.services.files.readFile(
        url.searchParams.get("rootId") || "",
        url.searchParams.get("path") || "",
      ),
    );
  });

  router.get("/api/files/search", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(
      res,
      200,
      routeCtx.services.files.search(
        url.searchParams.get("rootId") || "",
        url.searchParams.get("path") || "",
        url.searchParams.get("q") || "",
        readFlag(url.searchParams.get("recursive"), true),
        readFlag(url.searchParams.get("hidden"), true),
      ),
    );
  });

  router.get("/api/files/download", (req, res, routeCtx) => {
    const url = readUrl(req);
    const payload = routeCtx.services.files.getDownloadFile(
      url.searchParams.get("rootId") || "",
      url.searchParams.get("path") || "",
    );
    sendFileStream(res, {
      filePath: payload.absolutePath,
      contentType: payload.mimeType,
      range: req.headers.range || null,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": buildContentDisposition(
          payload.fileName,
          readFlag(url.searchParams.get("download"), false) ? "attachment" : "inline",
        ),
      },
    });
  });

  router.get("/api/files/download-archive", (req, res, routeCtx) => {
    const url = readUrl(req);
    const payload = routeCtx.services.files.prepareArchiveDownload({
      rootId: url.searchParams.get("rootId") || "",
      paths: url.searchParams.getAll("path"),
      name: url.searchParams.get("name") || undefined,
    });
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        fs.rmSync(payload.cleanupDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failure
      }
    };
    res.on("close", cleanup);
    res.on("finish", cleanup);
    sendFileStream(res, {
      filePath: payload.archivePath,
      contentType: payload.mimeType,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": buildContentDisposition(payload.fileName, "attachment"),
      },
    });
  });

  router.post("/api/files/directories", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesCreateDirectoryPayload>(req);
    sendJson(res, 200, routeCtx.services.files.createDirectory(payload));
  });

  router.post("/api/files/files", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesCreateFilePayload>(req);
    sendJson(res, 200, routeCtx.services.files.createFile(payload));
  });

  router.put("/api/files/content", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesWritePayload>(req);
    sendJson(res, 200, routeCtx.services.files.writeFile(payload));
  });

  router.post("/api/files/rename", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesRenamePayload>(req);
    sendJson(res, 200, routeCtx.services.files.renamePath(payload));
  });

  router.post("/api/files/copy", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesTransferPayload>(req);
    sendJson(res, 200, routeCtx.services.files.copyPath(payload));
  });

  router.post("/api/files/move", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesTransferPayload>(req);
    sendJson(res, 200, routeCtx.services.files.movePath(payload));
  });

  router.delete("/api/files", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesDeletePayload>(req);
    sendJson(res, 200, routeCtx.services.files.deletePaths(payload));
  });

  router.post("/api/files/upload", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesUploadPayload>(req);
    sendJson(res, 200, routeCtx.services.files.uploadFiles(payload));
  });

  router.post("/api/files/archive", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesArchivePayload>(req);
    sendJson(res, 200, routeCtx.services.files.archivePaths(payload));
  });

  router.post("/api/files/unarchive", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesUnarchivePayload>(req);
    sendJson(res, 200, routeCtx.services.files.unarchiveFile(payload));
  });
}
