import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../../apps/web/src/lib/api/files.ts", import.meta.url), "utf-8");
const types = fs.readFileSync(new URL("../../types/files.ts", import.meta.url), "utf-8");
test("files api binds write endpoints", () => {
  for (const [fn, path] of [
    ["writeFileContent", "/api/files/content"],
    ["getFileVersions", "/api/files/versions"],
    ["readFileVersion", "/api/files/versions/read"],
    ["restoreFileVersion", "/api/files/versions/restore"],
    ["deleteFileVersion", "/api/files/versions"],
    ["createDirectory", "/api/files/directories"],
    ["createFile", "/api/files/files"],
    ["renameFile", "/api/files/rename"],
    ["dryRunChmodFiles", "/api/files/chmod/dry-run"],
    ["chmodFiles", "/api/files/chmod"],
    ["dryRunFileTransfer", "/api/files/transfer/dry-run"],
    ["transferFiles", "/api/files/transfer"],
    ["copyFile", "/api/files/copy"],
    ["moveFile", "/api/files/move"],
    ["deleteFiles", "/api/files"],
    ["getFilesTrash", "/api/files/trash"],
    ["restoreFilesTrash", "/api/files/trash/restore"],
    ["purgeFilesTrash", "/api/files/trash"],
    ["archiveFiles", "/api/files/archive"],
    ["dryRunUnarchiveFile", "/api/files/unarchive/dry-run"],
    ["unarchiveFile", "/api/files/unarchive"],
    ["initFileUpload", "/api/files/uploads/init"],
    ["getFileUpload", "/api/files/uploads/"],
    ["uploadFileChunk", "/api/files/uploads/"],
    ["completeFileUpload", "/api/files/uploads/complete"],
    ["cancelFileUpload", "/api/files/uploads"],
    ["uploadFilesWithProgress", "/api/files/upload"],
    ["getFilesContentIndexStats", "/api/files/content-index"],
    ["getFilesContentIndexRecords", "/api/files/content-index/records"],
    ["scanFilesContentIndex", "/api/files/content-index/scan"],
    ["cleanFilesContentIndex", "/api/files/content-index/clean"],
    ["rebuildFilesContentIndex", "/api/files/content-index/rebuild"],
    ["getFilesContentIndexRebuildJob", "/api/files/content-index/rebuild-jobs"],
    ["startFilesContentIndexRebuildJob", "/api/files/content-index/rebuild-jobs"],
    ["maintainFilesSqlite", "/api/files/sqlite/maintenance"],
  ]) {
    assert.match(src, new RegExp(`export function ${fn}\\b`), `missing ${fn}`);
    assert.ok(
      src.includes(`"${path}"`) || src.includes(`'${path}'`) || src.includes(path),
      `missing path ${path}`,
    );
  }
});

test("resumable files upload control requests accept abort signals", () => {
  assert.match(src, /export function initFileUpload\(\s*payload: FilesUploadInitPayload,\s*signal\?: AbortSignal/s);
  assert.match(src, /export function completeFileUpload\(\s*payload: FilesUploadCompletePayload,\s*signal\?: AbortSignal/s);
  assert.match(src, /export function cancelFileUpload\(\s*payload: FilesUploadCancelPayload,\s*signal\?: AbortSignal/s);
  assert.match(src, /apiRequest<FilesUploadInitResponse>\("\/api\/files\/uploads\/init", \{[\s\S]*?signal,/);
  assert.match(src, /apiRequest<FilesMutationResponse>\("\/api\/files\/uploads\/complete", \{[\s\S]*?signal,/);
  assert.match(src, /apiRequest<FilesMutationResponse>\("\/api\/files\/uploads", \{[\s\S]*?signal,/);
});

test("files version history API exposes server-side version contract", () => {
  const routes = fs.readFileSync(new URL("../../apps/api/modules/files/routes.ts", import.meta.url), "utf-8");
  const service = fs.readFileSync(new URL("../../apps/api/modules/files/service.ts", import.meta.url), "utf-8");
  const query = fs.readFileSync(new URL("../../apps/web/src/lib/query/files.ts", import.meta.url), "utf-8");
  assert.match(types, /interface FilesVersionItem/);
  assert.match(types, /interface FilesVersionsPayload/);
  assert.match(types, /interface FilesVersionReadPayload extends FilesVersionItem/);
  assert.match(types, /interface FilesVersionRestorePayload/);
  assert.match(types, /interface FilesVersionDeletePayload/);
  assert.match(types, /versions: FilesVersionItem\[\]/);
  assert.match(types, /\| "restore-version"/);
  assert.match(types, /\| "delete-version"/);
  assert.match(src, /Promise<FilesVersionsPayload>/);
  assert.match(src, /Promise<FilesVersionReadPayload>/);
  assert.match(src, /apiRequest<FilesMutationResponse>\("\/api\/files\/versions\/restore"/);
  assert.match(src, /apiRequest<FilesMutationResponse>\("\/api\/files\/versions"/);
  assert.match(routes, /router\.get\("\/api\/files\/versions"/);
  assert.match(routes, /router\.get\("\/api\/files\/versions\/read"/);
  assert.match(routes, /router\.post\("\/api\/files\/versions\/restore"/);
  assert.match(routes, /router\.delete\("\/api\/files\/versions"/);
  assert.match(service, /listVersions\(rootId: string, filePath: string\): FilesVersionsPayload/);
  assert.match(service, /readVersion\(\s*rootId: string,\s*filePath: string,\s*versionId: string,?\s*\): FilesVersionReadPayload/s);
  assert.match(service, /restoreVersion\(payload: FilesVersionRestorePayload\): FilesMutationResponse/);
  assert.match(service, /deleteVersion\(payload: FilesVersionDeletePayload\): FilesMutationResponse/);
  assert.match(service, /MAX_FILE_VERSIONS_PER_FILE = 20/);
  assert.match(service, /MAX_FILE_VERSION_BYTES = 1024 \* 1024/);
  assert.match(query, /useFileVersionsQuery/);
  assert.match(query, /useFileVersionReadQuery/);
  assert.match(query, /useRestoreFileVersionMutation/);
  assert.match(query, /useDeleteFileVersionMutation/);
});


test("files content index stats expose bounded record preview contract", () => {
  assert.match(types, /permanent\?: boolean/);
  assert.match(types, /interface FilesChmodPayload/);
  assert.match(types, /interface FilesChmodDryRunResponse/);
  assert.match(types, /recursive\?: boolean/);
  assert.match(types, /\| "chmod"/);
  assert.match(src, /Promise<FilesChmodDryRunResponse>/);
  assert.match(src, /chmodFiles/);
  assert.match(types, /\| "transfer"/);
  assert.match(src, /transferFiles/);
  assert.match(src, /Promise<FilesMutationResponse>/);
  assert.match(types, /interface FilesTrashItem/);
  assert.match(types, /interface FilesTrashPayload/);
  assert.match(types, /interface FilesTrashListParams/);
  assert.match(types, /nextCursor\?: string \| null/);
  assert.match(types, /scope\?: "root" \| "global"/);
  assert.match(types, /interface FilesTrashRestorePayload/);
  assert.match(types, /interface FilesTrashPurgePayload/);
  assert.match(types, /trashPath: string/);
  assert.match(src, /Promise<FilesTrashPayload>/);
  assert.match(src, /restoreFilesTrash/);
  assert.match(src, /purgeFilesTrash/);
  assert.match(types, /interface FilesContentIndexRecordPreview/);
  assert.match(types, /rootId\?: string/);
  assert.match(types, /fastStats\?: boolean/);
  assert.match(types, /interface FilesContentIndexRecordsParams/);
  assert.match(types, /interface FilesContentIndexRecordsPayload/);
  assert.match(types, /interface FilesSqliteMaintenancePayload/);
  assert.match(types, /interface FilesContentIndexRebuildJobPayload/);
  assert.match(types, /recordsPreview: FilesContentIndexRecordPreview\[\]/);
  assert.match(types, /records: FilesContentIndexRecordPreview\[\]/);
  assert.match(types, /hasMore: boolean/);
  assert.match(types, /previewLimit: number/);
  assert.match(src, /Promise<FilesContentIndexStatsPayload>/);
  assert.match(src, /Promise<FilesContentIndexRecordsPayload>/);
  assert.match(src, /Promise<import\("\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/types\/files"\)\.FilesSqliteMaintenancePayload>/);
  assert.match(src, /search\.set\("cursor"/);
  assert.match(src, /search\.set\("offset"/);
  assert.match(src, /search\.set\("limit"/);
});

test("files read API exposes large text slice parameters", () => {
  assert.match(types, /contentOffset: number/);
  assert.match(types, /contentBytes: number/);
  assert.match(types, /readLimitBytes: number/);
  assert.match(src, /offset\?: number/);
  assert.match(src, /limit\?: number/);
  assert.match(src, /search\.set\("offset"/);
  assert.match(src, /search\.set\("limit"/);
});

test("files search API exposes IDE-grade case and regex options", () => {
  const routes = fs.readFileSync(new URL("../../apps/api/modules/files/routes.ts", import.meta.url), "utf-8");
  const service = fs.readFileSync(new URL("../../apps/api/modules/files/service.ts", import.meta.url), "utf-8");
  assert.match(types, /caseSensitive\?: boolean/);
  assert.match(types, /regex\?: boolean/);
  assert.match(types, /error\?: string/);
  assert.match(types, /limit\?: number/);
  assert.match(types, /truncated\?: boolean/);
  assert.match(src, /caseSensitive\?: boolean/);
  assert.match(src, /regex\?: boolean/);
  assert.match(src, /search\.set\("caseSensitive"/);
  assert.match(src, /search\.set\("regex"/);
  assert.match(src, /search\.set\("limit"/);
  assert.match(routes, /searchParams\.get\("caseSensitive"\)/);
  assert.match(routes, /searchParams\.get\("regex"\)/);
  assert.match(routes, /searchParams\.get\("limit"\)/);
  assert.match(service, /interface FileSearchOptions/);
  assert.match(service, /validateSearchQuery/);
  assert.match(service, /findSearchMatch/);
  assert.match(service, /DEFAULT_SEARCH_LIMIT = 250/);
  assert.match(service, /MAX_SEARCH_LIMIT = 500/);
  assert.match(service, /clampSearchLimit/);
});


test("files metadata exposes POSIX mode and owner fields", () => {
  assert.match(types, /mode: string/);
  assert.match(types, /permissions: string/);
  assert.match(types, /uid: number \| null/);
  assert.match(types, /gid: number \| null/);
});

test("files query cache namespace is shared by file manager workspace and chat", () => {
  const query = fs.readFileSync(new URL("../../apps/web/src/lib/query/files.ts", import.meta.url), "utf-8");
  assert.match(query, /all: \["files"\] as const/);
  assert.match(query, /summary: \(\) => \["files", "summary"\] as const/);
  assert.match(query, new RegExp('"files",\\n\\s+"browse",'));
  assert.match(query, new RegExp('"files",\\n\\s+"search",'));
  assert.doesNotMatch(query, /\["ide", "files"\]/);
  assert.doesNotMatch(query, new RegExp('"ide",\\n\\s+"files",'));
});
