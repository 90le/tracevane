import type http from "node:http";
import fs from "node:fs";
import { buildContentDisposition, parseJsonBody, sendFileStream, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  FilesArchivePayload,
  FilesChmodPayload,
  FilesContentIndexActionPayload,
  FilesContentIndexRecordsParams,
  FilesCreateDirectoryPayload,
  FilesCreateFilePayload,
  FilesDeletePayload,
  FilesRenamePayload,
  FilesTransferDryRunPayload,
  FilesTransferPayload,
  FilesVersionDeletePayload,
  FilesVersionRestorePayload,
  FilesTrashPurgePayload,
  FilesTrashRestorePayload,
  FilesUploadCancelPayload,
  FilesUploadCompletePayload,
  FilesUploadInitPayload,
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

async function readBinaryBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
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
        {
          offset: readNumber(url.searchParams.get("offset")),
          limit: readNumber(url.searchParams.get("limit")),
        },
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
        {
          caseSensitive: readFlag(url.searchParams.get("caseSensitive"), false),
          regex: readFlag(url.searchParams.get("regex"), false),
          limit: readNumber(url.searchParams.get("limit")),
        },
      ),
    );
  });


  router.get("/api/files/content-index", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(res, 200, routeCtx.services.files.getContentIndexStats(url.searchParams.get("rootId") || ""));
  });

  router.get("/api/files/content-index/records", (req, res, routeCtx) => {
    const url = readUrl(req);
    const params: FilesContentIndexRecordsParams = {
      rootId: url.searchParams.get("rootId") || "",
      status: (url.searchParams.get("status") || "all") as FilesContentIndexRecordsParams["status"],
      query: url.searchParams.get("query") || "",
      offset: readNumber(url.searchParams.get("offset")),
      limit: readNumber(url.searchParams.get("limit")),
    };
    sendJson(res, 200, routeCtx.services.files.getContentIndexRecords(params));
  });

  router.post("/api/files/content-index/scan", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesContentIndexActionPayload>(req);
    sendJson(res, 200, routeCtx.services.files.scanContentIndex(payload.rootId));
  });

  router.post("/api/files/content-index/clean", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesContentIndexActionPayload>(req);
    sendJson(res, 200, routeCtx.services.files.cleanContentIndex(payload.rootId));
  });

  router.post("/api/files/content-index/rebuild", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesContentIndexActionPayload>(req);
    sendJson(res, 200, routeCtx.services.files.rebuildContentIndex(payload.rootId));
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

  router.get("/api/files/versions", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(res, 200, routeCtx.services.files.listVersions(url.searchParams.get("rootId") || "", url.searchParams.get("path") || ""));
  });

  router.get("/api/files/versions/read", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(res, 200, routeCtx.services.files.readVersion(
      url.searchParams.get("rootId") || "",
      url.searchParams.get("path") || "",
      url.searchParams.get("versionId") || "",
    ));
  });

  router.post("/api/files/versions/restore", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesVersionRestorePayload>(req);
    sendJson(res, 200, routeCtx.services.files.restoreVersion(payload));
  });

  router.delete("/api/files/versions", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesVersionDeletePayload>(req);
    sendJson(res, 200, routeCtx.services.files.deleteVersion(payload));
  });

  router.post("/api/files/rename", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesRenamePayload>(req);
    sendJson(res, 200, routeCtx.services.files.renamePath(payload));
  });

  router.post("/api/files/chmod/dry-run", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesChmodPayload>(req);
    sendJson(res, 200, routeCtx.services.files.dryRunChmod(payload));
  });

  router.post("/api/files/chmod", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesChmodPayload>(req);
    sendJson(res, 200, routeCtx.services.files.chmodPaths(payload));
  });

  router.post("/api/files/transfer/dry-run", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesTransferDryRunPayload>(req);
    sendJson(res, 200, routeCtx.services.files.dryRunTransfer(payload));
  });

  router.post("/api/files/transfer", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesTransferDryRunPayload>(req);
    sendJson(res, 200, routeCtx.services.files.transferPaths(payload));
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

  router.get("/api/files/trash", (req, res, routeCtx) => {
    const url = readUrl(req);
    sendJson(res, 200, routeCtx.services.files.listTrash(url.searchParams.get("rootId") || ""));
  });

  router.post("/api/files/trash/restore", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesTrashRestorePayload>(req);
    sendJson(res, 200, routeCtx.services.files.restoreTrash(payload));
  });

  router.delete("/api/files/trash", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesTrashPurgePayload>(req);
    sendJson(res, 200, routeCtx.services.files.purgeTrash(payload));
  });

  router.post("/api/files/upload", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesUploadPayload>(req);
    sendJson(res, 200, routeCtx.services.files.uploadFiles(payload));
  });

  router.post("/api/files/uploads/init", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesUploadInitPayload>(req);
    sendJson(res, 200, routeCtx.services.files.initUpload(payload));
  });

  router.get("/api/files/uploads/:uploadId", (_req, res, routeCtx, params) => {
    sendJson(res, 200, routeCtx.services.files.getUpload(params.uploadId));
  });

  router.put("/api/files/uploads/:uploadId/chunks/:chunkIndex", async (req, res, routeCtx, params) => {
    const data = await readBinaryBody(req);
    sendJson(
      res,
      200,
      routeCtx.services.files.writeUploadChunk(
        params.uploadId,
        Number(params.chunkIndex),
        data,
      ),
    );
  });

  router.post("/api/files/uploads/complete", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesUploadCompletePayload>(req);
    sendJson(res, 200, routeCtx.services.files.completeUpload(payload));
  });

  router.delete("/api/files/uploads", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesUploadCancelPayload>(req);
    sendJson(res, 200, routeCtx.services.files.cancelUpload(payload));
  });

  router.post("/api/files/archive/dry-run", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesArchivePayload>(req);
    sendJson(res, 200, routeCtx.services.files.dryRunArchive(payload));
  });

  router.post("/api/files/archive", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesArchivePayload>(req);
    sendJson(res, 200, routeCtx.services.files.archivePaths(payload));
  });

  router.post("/api/files/unarchive/dry-run", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesUnarchivePayload>(req);
    sendJson(res, 200, routeCtx.services.files.dryRunUnarchive(payload));
  });

  router.post("/api/files/unarchive", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<FilesUnarchivePayload>(req);
    sendJson(res, 200, routeCtx.services.files.unarchiveFile(payload));
  });
}
