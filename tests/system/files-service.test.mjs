import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { createFilesService } = await (async () => {
  try {
    return await import("../../apps/api/modules/files/service.ts");
  } catch {
    return await import("../../dist/apps/api/modules/files/service.js");
  }
})();

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-files-service-"));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeZipEntry(zipPath, entryName, content) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  execFileSync(
    "python3",
    [
      "-c",
      "import pathlib, sys, zipfile; pathlib.Path(sys.argv[1]).parent.mkdir(parents=True, exist_ok=True); z=zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED); z.writestr(sys.argv[2], sys.argv[3]); z.close()",
      zipPath,
      entryName,
      content,
    ],
    { stdio: "ignore" },
  );
}

function writeTarGzEntry(tarPath, entryName, content) {
  fs.mkdirSync(path.dirname(tarPath), { recursive: true });
  execFileSync(
    "python3",
    [
      "-c",
      "import io, pathlib, sys, tarfile; pathlib.Path(sys.argv[1]).parent.mkdir(parents=True, exist_ok=True); data=sys.argv[3].encode(); info=tarfile.TarInfo(sys.argv[2]); info.size=len(data); t=tarfile.open(sys.argv[1], 'w:gz'); t.addfile(info, io.BytesIO(data)); t.close()",
      tarPath,
      entryName,
      content,
    ],
    { stdio: "ignore" },
  );
}

function makeConfig(root) {
  const openclawRoot = path.join(root, ".openclaw");
  const projectRoot = path.join(root, "project");
  fs.mkdirSync(openclawRoot, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(openclawRoot, "workspace"), { recursive: true });
  fs.mkdirSync(path.join(openclawRoot, "extensions"), { recursive: true });
  return {
    openclawRoot,
    projectRoot,
  };
}

test("files service discovers safe roots and browses directories", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "src", "main.ts"), "console.log('hi')\n");
  writeFile(path.join(config.projectRoot, "README.md"), "# Tracevane\n");
  writeFile(path.join(config.projectRoot, "alpha.txt"), "alpha\n");
  writeFile(path.join(config.projectRoot, "beta.txt"), "beta\n");
  writeFile(path.join(config.projectRoot, "gamma.txt"), "gamma\n");
  fs.mkdirSync(path.join(config.projectRoot, "assets"), { recursive: true });
  writeFile(path.join(config.openclawRoot, "workspace", "notes.md"), "workspace notes\n");

  const service = createFilesService(config);
  const summary = service.getSummary();
  const projectListing = service.listDirectory("project-root", "", true);
  const secondPage = service.listDirectory("project-root", "", true, {
    page: 2,
    pageSize: 2,
    sortKey: "name",
    sortDirection: "asc",
  });
  const clampedPageSize = service.listDirectory("project-root", "", true, { pageSize: 5000 });

  assert.equal(summary.defaultRootId, "openclaw-root");
  assert.equal(summary.roots.some((rootEntry) => rootEntry.id === "project-root"), true);
  assert.equal(summary.roots.some((rootEntry) => rootEntry.id === "openclaw-root"), true);
  assert.equal(summary.roots.some((rootEntry) => rootEntry.id === "home-root"), true);
  assert.equal(summary.roots.some((rootEntry) => rootEntry.id === "system-root"), true);
  assert.equal(projectListing.entries.some((entry) => entry.name === "README.md"), true);
  assert.equal(projectListing.entries.some((entry) => entry.name === "src" && entry.kind === "directory"), true);
  assert.equal(projectListing.entries[0].kind, "directory");
  assert.match(projectListing.entries[0].mode, /^[0-7]{4}$/);
  assert.match(projectListing.entries[0].permissions, /^d[rwx-]{9}$/);
  assert.equal(typeof projectListing.entries[0].uid === "number" || projectListing.entries[0].uid === null, true);
  assert.equal(typeof projectListing.entries[0].gid === "number" || projectListing.entries[0].gid === null, true);
  assert.equal(projectListing.pagination.page, 1);
  assert.equal(projectListing.pagination.totalEntries, projectListing.counts.total);
  assert.equal(secondPage.pagination.page, 2);
  assert.equal(secondPage.pagination.pageSize, 2);
  assert.equal(secondPage.entries.length, 2);
  assert.equal(clampedPageSize.pagination.pageSize, 500);
});

test("files service supports search, read, write, create, rename, copy, move, delete, and upload", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "docs", "guide.md"), "hello world\n");
  writeFile(path.join(config.projectRoot, "docs", "notes.txt"), "draft\n");
  writeFile(path.join(config.projectRoot, "docs", "content-only.txt"), "alpha hidden needle beta\n");
  const service = createFilesService(config);

  const search = service.search("project-root", "", "guide", true, true);
  assert.equal(search.results[0].path, "docs/guide.md");
  assert.equal(search.results[0].matchKind, "name");
  assert.equal(search.limit, 250);
  assert.equal(search.truncated, false);

  const limitedSearch = service.search("project-root", "", "guide", true, true, { limit: 1 });
  assert.equal(limitedSearch.limit, 1);
  assert.equal(limitedSearch.results.length, 1);
  assert.equal(limitedSearch.truncated, true);

  const contentSearch = service.search("project-root", "", "needle", true, true);
  assert.equal(contentSearch.results[0].path, "docs/content-only.txt");
  assert.equal(contentSearch.results[0].matchKind, "content");
  assert.match(contentSearch.results[0].snippet || "", /needle/);

  const caseSensitiveMiss = service.search("project-root", "", "GUIDE", true, true, { caseSensitive: true });
  assert.equal(caseSensitiveMiss.results.some((result) => result.path === "docs/guide.md"), false);
  assert.equal(caseSensitiveMiss.caseSensitive, true);

  const regexSearch = service.search("project-root", "", "h.dden\\s+needle", true, true, { regex: true });
  assert.equal(regexSearch.results[0].path, "docs/content-only.txt");
  assert.equal(regexSearch.regex, true);

  const invalidRegexSearch = service.search("project-root", "", "[", true, true, { regex: true });
  assert.match(invalidRegexSearch.error || "", /regular expression|Unterminated|Invalid/i);
  assert.equal(invalidRegexSearch.limit, 250);
  assert.equal(invalidRegexSearch.truncated, false);
  assert.equal(invalidRegexSearch.results.length, 0);

  const read = service.readFile("project-root", "docs/guide.md");
  assert.equal(read.editable, true);
  assert.match(read.mode, /^[0-7]{4}$/);
  assert.match(read.permissions, /^-[rwx-]{9}$/);
  assert.equal(typeof read.uid === "number" || read.uid === null, true);
  assert.equal(typeof read.gid === "number" || read.gid === null, true);
  assert.equal(read.contentOffset, 0);
  assert.equal(read.contentBytes, Buffer.byteLength("hello world\n"));
  assert.equal(read.truncated, false);
  assert.match(read.content || "", /hello world/);

  const largeLogBody = `${"a".repeat(1024 * 1024 + 256)}TAIL-END`;
  writeFile(path.join(config.projectRoot, "docs", "large.log"), largeLogBody);
  const largeHead = service.readFile("project-root", "docs/large.log");
  assert.equal(largeHead.editable, false);
  assert.equal(largeHead.truncated, true);
  assert.equal(largeHead.contentOffset, 0);
  assert.equal(largeHead.contentBytes, 1024 * 1024);
  assert.equal(largeHead.readLimitBytes, 1024 * 1024);
  assert.equal((largeHead.content || "").includes("TAIL-END"), false);
  const largeTail = service.readFile("project-root", "docs/large.log", { offset: 1024 * 1024, limit: 512 });
  assert.equal(largeTail.contentOffset, 1024 * 1024);
  assert.equal(largeTail.readLimitBytes, 512);
  assert.equal(largeTail.truncated, true);
  assert.match(largeTail.content || "", /TAIL-END/);

  service.writeFile({
    rootId: "project-root",
    path: "docs/guide.md",
    content: "updated body\n",
  });
  assert.match(fs.readFileSync(path.join(config.projectRoot, "docs", "guide.md"), "utf8"), /updated body/);

  const versions = service.listVersions("project-root", "docs/guide.md");
  assert.equal(versions.rootId, "project-root");
  assert.equal(versions.path, "docs/guide.md");
  assert.equal(versions.versions.length >= 1, true);
  assert.equal(versions.versions[0].path, "docs/guide.md");
  assert.equal(versions.versions[0].name, "guide.md");
  const firstVersionId = versions.versions[0].id;
  const historical = service.readVersion("project-root", "docs/guide.md", firstVersionId);
  assert.match(historical.content, /hello world/);
  const restoreResult = service.restoreVersion({ rootId: "project-root", path: "docs/guide.md", versionId: firstVersionId });
  assert.equal(restoreResult.action, "restore-version");
  assert.match(fs.readFileSync(path.join(config.projectRoot, "docs", "guide.md"), "utf8"), /hello world/);
  const versionsAfterRestore = service.listVersions("project-root", "docs/guide.md");
  assert.equal(versionsAfterRestore.versions.length >= 1, true);
  const deleteVersionResult = service.deleteVersion({ rootId: "project-root", path: "docs/guide.md", versionId: firstVersionId });
  assert.equal(deleteVersionResult.action, "delete-version");
  assert.equal(service.listVersions("project-root", "docs/guide.md").versions.some((version) => version.id === firstVersionId), false);

  service.writeFile({
    rootId: "project-root",
    path: "docs/guide.md",
    content: "updated body\n",
  });

  service.createDirectory({
    rootId: "project-root",
    directoryPath: "docs",
    name: "archive",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive")), true);

  service.createFile({
    rootId: "project-root",
    directoryPath: "docs/archive",
    name: "fresh.md",
    content: "fresh\n",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive", "fresh.md")), true);

  service.renamePath({
    rootId: "project-root",
    path: "docs/notes.txt",
    nextName: "notes-renamed.txt",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "notes-renamed.txt")), true);

  const chmodPreview = service.dryRunChmod({
    rootId: "project-root",
    paths: ["docs"],
    mode: "0750",
    recursive: true,
  });
  assert.equal(chmodPreview.mode, "0750");
  assert.equal(chmodPreview.recursive, true);
  assert.equal(chmodPreview.counts.directories >= 1, true);
  assert.equal(chmodPreview.items.some((item) => item.path === "docs/guide.md" && item.nextMode === "0750"), true);
  const chmodResult = service.chmodPaths({ rootId: "project-root", paths: ["docs/guide.md"], mode: "0600" });
  assert.equal(chmodResult.action, "chmod");
  assert.equal(fs.statSync(path.join(config.projectRoot, "docs", "guide.md")).mode & 0o777, 0o600);
  assert.throws(() => service.dryRunChmod({ rootId: "project-root", paths: ["docs/guide.md"], mode: "9999" }));

  service.copyPath({
    sourceRootId: "project-root",
    sourcePath: "docs/guide.md",
    destinationRootId: "openclaw-root",
    destinationDirectoryPath: "",
    nextName: "guide-copy.md",
  });
  assert.equal(fs.existsSync(path.join(config.openclawRoot, "guide-copy.md")), true);

  service.movePath({
    sourceRootId: "project-root",
    sourcePath: "docs/archive/fresh.md",
    destinationRootId: "project-root",
    destinationDirectoryPath: "",
    nextName: "fresh-moved.md",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "fresh-moved.md")), true);
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive", "fresh.md")), false);

  const blockingTransfer = service.dryRunTransfer({
    operation: "copy",
    sourceRootId: "project-root",
    sourcePaths: ["docs/guide.md"],
    destinationRootId: "project-root",
    destinationDirectoryPath: "docs",
    conflictPolicy: "fail",
  });
  assert.equal(blockingTransfer.counts.conflicts, 1);
  assert.equal(blockingTransfer.items[0].status, "conflict");
  const renamedTransfer = service.dryRunTransfer({
    operation: "copy",
    sourceRootId: "project-root",
    sourcePaths: ["docs/guide.md"],
    destinationRootId: "project-root",
    destinationDirectoryPath: "docs",
    conflictPolicy: "rename",
  });
  assert.equal(renamedTransfer.counts.rename, 1);
  assert.equal(renamedTransfer.items[0].destinationPath, "docs/guide (1).md");
  const explicitNamedTransfer = service.dryRunTransfer({
    operation: "copy",
    sourceRootId: "project-root",
    sourcePaths: ["docs/guide.md"],
    destinationRootId: "project-root",
    destinationDirectoryPath: "docs",
    nextName: "guide-copy.md",
    conflictPolicy: "fail",
  });
  assert.equal(explicitNamedTransfer.counts.ready, 1);
  assert.equal(explicitNamedTransfer.items[0].destinationPath, "docs/guide-copy.md");
  assert.throws(() =>
    service.dryRunTransfer({
      operation: "copy",
      sourceRootId: "project-root",
      sourcePaths: ["docs/guide.md", "docs/notes-renamed.txt"],
      destinationRootId: "project-root",
      destinationDirectoryPath: "docs",
      nextName: "single-name-only.md",
      conflictPolicy: "rename",
    }),
  );
  const transferCopy = service.transferPaths({
    operation: "copy",
    sourceRootId: "project-root",
    sourcePaths: ["docs/guide.md"],
    destinationRootId: "project-root",
    destinationDirectoryPath: "docs",
    conflictPolicy: "rename",
  });
  assert.equal(transferCopy.action, "transfer");
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "guide (1).md")), true);

  fs.mkdirSync(path.join(config.projectRoot, "docs", "nested"), { recursive: true });
  const unsafeMove = service.dryRunTransfer({
    operation: "move",
    sourceRootId: "project-root",
    sourcePaths: ["docs"],
    destinationRootId: "project-root",
    destinationDirectoryPath: "docs/nested",
    conflictPolicy: "rename",
  });
  assert.equal(unsafeMove.counts.errors, 1);
  assert.match(unsafeMove.items[0].message || "", /自身|子目录/);

  service.uploadFiles({
    rootId: "project-root",
    directoryPath: "",
    files: [
      {
        fileName: "upload.txt",
        dataBase64: Buffer.from("uploaded\n").toString("base64"),
      },
    ],
  });
  assert.match(fs.readFileSync(path.join(config.projectRoot, "upload.txt"), "utf8"), /uploaded/);

  service.uploadFiles({
    rootId: "project-root",
    directoryPath: "docs",
    files: [
      {
        fileName: "current-dir-upload.txt",
        dataBase64: Buffer.from("current directory upload\n").toString("base64"),
      },
      {
        fileName: "empty-paste-file.txt",
        dataBase64: "",
      },
    ],
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "docs", "current-dir-upload.txt"), "utf8"),
    /current directory upload/,
  );
  assert.equal(fs.statSync(path.join(config.projectRoot, "docs", "empty-paste-file.txt")).size, 0);

  service.uploadFiles({
    rootId: "project-root",
    directoryPath: "",
    files: [
      {
        fileName: "nested.txt",
        relativePath: "folder-upload/src/nested.txt",
        dataBase64: Buffer.from("nested upload\n").toString("base64"),
      },
    ],
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "folder-upload", "src", "nested.txt"), "utf8"),
    /nested upload/,
  );

  const largerThanPreviousUploadLimit = Buffer.alloc((24 * 1024 * 1024) + 1, "a");
  service.uploadFiles({
    rootId: "project-root",
    directoryPath: "",
    files: [
      {
        fileName: "larger-than-previous-limit.bin",
        dataBase64: largerThanPreviousUploadLimit.toString("base64"),
      },
    ],
  });
  assert.equal(
    fs.statSync(path.join(config.projectRoot, "larger-than-previous-limit.bin")).size,
    largerThanPreviousUploadLimit.length,
  );

  const chunked = Buffer.alloc((700 * 1024) + 13, "c");
  const init = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "chunked.txt",
    size: chunked.length,
    chunkSize: 97,
  });
  assert.equal(init.chunkCount, Math.ceil(chunked.length / init.chunkSize));
  for (let index = init.chunkCount - 1; index >= 0; index -= 1) {
    const start = index * init.chunkSize;
    service.writeUploadChunk(
      init.uploadId,
      index,
      chunked.subarray(start, Math.min(chunked.length, start + init.chunkSize)),
    );
  }
  const status = service.getUpload(init.uploadId);
  assert.equal(status.targetPath, "docs/chunked.txt");

  const completed = service.completeUpload({ uploadId: init.uploadId });
  assert.equal(completed.affectedPaths[0], "docs/chunked.txt");
  assert.equal(
    fs.readFileSync(path.join(config.projectRoot, "docs", "chunked.txt"), "utf8"),
    chunked.toString("utf8"),
  );
  assert.throws(() =>
    service.initUpload({
      rootId: "project-root",
      directoryPath: "docs",
      fileName: "chunked.txt",
      size: 0,
      chunkSize: 97,
      conflictPolicy: "fail",
    }),
  );

  const skipped = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "chunked.txt",
    size: 0,
    chunkSize: 97,
    conflictPolicy: "skip",
  });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.targetPath, "docs/chunked.txt");

  const renamed = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "chunked.txt",
    size: 0,
    chunkSize: 97,
    conflictPolicy: "rename",
  });
  assert.equal(renamed.targetPath, "docs/chunked (1).txt");
  service.completeUpload({ uploadId: renamed.uploadId });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "chunked (1).txt")), true);

  const sameHash = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "chunked.txt",
    size: chunked.length,
    chunkSize: 97,
    conflictPolicy: "rename",
    sha256: "not-a-valid-hash",
  });
  assert.equal(sameHash.instant, undefined);
  service.cancelUpload({ uploadId: sameHash.uploadId });

  const realHash = createHash("sha256").update(chunked).digest("hex");
  const instant = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "chunked.txt",
    size: chunked.length,
    chunkSize: 97,
    conflictPolicy: "rename",
    sha256: realHash,
  });
  assert.equal(instant.instant, true);
  assert.equal(instant.targetPath, "docs/chunked (2).txt");
  assert.equal(fs.readFileSync(path.join(config.projectRoot, "docs", "chunked (2).txt"), "utf8"), chunked.toString("utf8"));

  const globalInstant = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "global-hash-copy.txt",
    size: chunked.length,
    chunkSize: 97,
    conflictPolicy: "rename",
    sha256: realHash,
  });
  assert.equal(globalInstant.instant, true);
  assert.equal(globalInstant.targetPath, "docs/global-hash-copy.txt");
  assert.equal(fs.readFileSync(path.join(config.projectRoot, "docs", "global-hash-copy.txt"), "utf8"), chunked.toString("utf8"));
  const indexShardPath = path.join(config.openclawRoot, ".tracevane", "file-content-index", "project-root", `${realHash.slice(0, 2)}.json`);
  assert.equal(fs.existsSync(indexShardPath), true);
  const indexShard = JSON.parse(fs.readFileSync(indexShardPath, "utf8"));
  assert.equal(Array.isArray(indexShard[realHash]), true);
  assert.equal(indexShard[realHash].some((record) => record.path === "docs/global-hash-copy.txt"), true);
  const indexStats = service.getContentIndexStats("project-root");
  assert.equal(indexStats.rootId, "project-root");
  assert.equal(indexStats.scope, "root");
  assert.equal(indexStats.rootCount, 1);
  assert.equal(indexStats.fastStats, true);
  assert.equal(indexStats.shardCount >= 1, true);
  assert.equal(indexStats.validRecordCount >= 1, true);
  assert.equal(indexStats.staleRecordCount, 0);
  assert.equal(indexStats.previewLimit, 20);
  assert.equal(Array.isArray(indexStats.recordsPreview), true);
  const globalPreview = indexStats.recordsPreview.find((record) => record.path === "docs/global-hash-copy.txt");
  assert.equal(globalPreview?.rootId, "project-root");
  assert.equal(globalPreview?.status, "valid");
  assert.equal(globalPreview?.sha256, realHash);
  assert.equal(globalPreview?.size, chunked.length);
  const indexRecordsPage = service.getContentIndexRecords({
    rootId: "project-root",
    status: "valid",
    query: "global-hash",
    offset: 0,
    limit: 1,
  });
  assert.equal(indexRecordsPage.rootId, "project-root");
  assert.equal(indexRecordsPage.status, "valid");
  assert.equal(indexRecordsPage.query, "global-hash");
  assert.equal(indexRecordsPage.limit, 1);
  assert.equal(indexRecordsPage.returnedRecordCount, 1);
  assert.equal(indexRecordsPage.scope, "root");
  assert.equal(indexRecordsPage.rootCount, 1);
  assert.equal(indexRecordsPage.records[0]?.rootId, "project-root");
  assert.equal(indexRecordsPage.records[0]?.path, "docs/global-hash-copy.txt");
  assert.equal(indexRecordsPage.records[0]?.sha256, realHash);
  fs.rmSync(path.join(config.projectRoot, "docs", "global-hash-copy.txt"), { force: true });
  const staleIndexStats = service.scanContentIndex("project-root");
  assert.equal(staleIndexStats.staleRecordCount >= 1, true);
  const staleRecordsPage = service.getContentIndexRecords({
    rootId: "project-root",
    status: "stale",
    query: realHash.slice(0, 16),
    offset: 0,
    limit: 10,
  });
  assert.equal(staleRecordsPage.records.some((record) => record.path === "docs/global-hash-copy.txt" && record.status === "stale"), true);
  const stalePreview = staleIndexStats.recordsPreview.find((record) => record.path === "docs/global-hash-copy.txt");
  assert.equal(stalePreview?.status, "stale");
  assert.equal(stalePreview?.sha256, realHash);
  const cleanedIndexStats = service.cleanContentIndex("project-root");
  assert.equal((cleanedIndexStats.cleanedRecordCount ?? 0) >= 1, true);
  assert.equal(cleanedIndexStats.staleRecordCount, 0);
  assert.equal(cleanedIndexStats.previewLimit, 20);
  assert.equal(cleanedIndexStats.recordsPreview.some((record) => record.path === "docs/global-hash-copy.txt"), false);
  assert.equal(cleanedIndexStats.recordsPreview.every((record) => record.status === "valid"), true);

  const rebuiltIndexStats = service.rebuildContentIndex("project-root");
  assert.equal(rebuiltIndexStats.rootId, "project-root");
  assert.equal(rebuiltIndexStats.scannedFileCount >= 1, true);
  assert.equal(rebuiltIndexStats.rebuiltRecordCount >= 1, true);
  assert.equal(typeof rebuiltIndexStats.skippedFileCount, "number");
  assert.equal(rebuiltIndexStats.truncated, false);
  assert.equal(rebuiltIndexStats.validRecordCount >= 1, true);
  assert.equal(rebuiltIndexStats.previewLimit, 20);
  assert.equal(rebuiltIndexStats.recordsPreview.some((record) => record.status === "valid"), true);
  const indexedSearch = service.search("project-root", "", "updated body", true, true);
  assert.equal(indexedSearch.index?.used, true);
  assert.equal((indexedSearch.index?.candidateCount ?? 0) >= 1, true);
  assert.equal((indexedSearch.index?.resultCount ?? 0) >= 1, true);
  assert.equal(indexedSearch.results.some((entry) => entry.path === "docs/guide.md" && entry.matchKind === "content"), true);

  const emptyInit = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "chunked-empty.txt",
    size: 0,
    chunkSize: 97,
  });
  assert.equal(emptyInit.chunkCount, 0);
  service.completeUpload({ uploadId: emptyInit.uploadId });
  assert.equal(fs.statSync(path.join(config.projectRoot, "docs", "chunked-empty.txt")).size, 0);

  const cancelInit = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "cancel-me.txt",
    size: 4,
    chunkSize: 97,
  });
  service.cancelUpload({ uploadId: cancelInit.uploadId });
  assert.throws(() => service.completeUpload({ uploadId: cancelInit.uploadId }));

  const staleInit = service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "stale-upload.txt",
    size: 4,
    chunkSize: 97,
  });
  const staleManifestPath = path.join(os.tmpdir(), "tracevane-files-uploads", staleInit.uploadId, "manifest.json");
  const staleManifest = JSON.parse(fs.readFileSync(staleManifestPath, "utf8"));
  staleManifest.createdAt = new Date(Date.now() - (25 * 60 * 60 * 1000)).toISOString();
  fs.writeFileSync(staleManifestPath, JSON.stringify(staleManifest), "utf8");
  service.initUpload({
    rootId: "project-root",
    directoryPath: "docs",
    fileName: "gc-trigger.txt",
    size: 0,
    chunkSize: 97,
  });
  assert.equal(fs.existsSync(staleManifestPath), false);
  assert.throws(() => service.getUpload(staleInit.uploadId));

  assert.throws(() =>
    service.uploadFiles({
      rootId: "project-root",
      directoryPath: "",
      files: [
        {
          fileName: "escape.txt",
          relativePath: "../escape.txt",
          dataBase64: Buffer.from("escape\n").toString("base64"),
        },
      ],
    }),
  );
  assert.equal(fs.existsSync(path.join(config.projectRoot, "..", "escape.txt")), false);

  const deleteResult = service.deletePaths({
    rootId: "project-root",
    paths: ["docs/archive"],
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive")), false);
  assert.match(deleteResult.message, /Moved 1 item\(s\) to recycle bin/);
  const globalTrashDir = path.join(config.openclawRoot, ".tracevane", "trash");
  assert.equal(fs.existsSync(globalTrashDir), true);
  assert.equal(fs.existsSync(path.join(config.projectRoot, ".tracevane-trash")), false);
  assert.equal(fs.existsSync(path.join(globalTrashDir, deleteResult.affectedPaths[1])), true);
  assert.equal(deleteResult.affectedPaths.some((entryPath) => entryPath.includes("project-root-archive")), true);
  const trashMetadataPath = fs.readdirSync(globalTrashDir)
    .map((entry) => path.join(globalTrashDir, entry, "metadata.json"))
    .find((entryPath) => fs.existsSync(entryPath));
  assert.ok(trashMetadataPath);
  const trashMetadata = JSON.parse(fs.readFileSync(trashMetadataPath, "utf8"));
  assert.equal(trashMetadata.rootId, "project-root");
  assert.equal(trashMetadata.originalPath, "docs/archive");
  const trash = service.listTrash("project-root");
  assert.equal(trash.trashDirectoryPath, ".tracevane/trash");
  assert.equal(trash.items.some((item) => item.originalPath === "docs/archive" && item.rootId === "project-root"), true);
  const restored = service.restoreTrash({ rootId: "project-root", trashPath: trash.items[0].trashPath, conflictPolicy: "rename" });
  assert.equal(restored.action, "restore-trash");
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive")), true);
  assert.equal(service.listTrash("project-root").items.some((item) => item.originalPath === "docs/archive"), false);

  service.createFile({ rootId: "openclaw-root", directoryPath: "workspace", name: "global-trash-note.txt", content: "shared trash\n" });
  service.deletePaths({ rootId: "openclaw-root", paths: ["workspace/global-trash-note.txt"] });
  const globalTrashFromProjectView = service.listTrash("project-root");
  assert.equal(globalTrashFromProjectView.rootId, "global");
  assert.equal(globalTrashFromProjectView.scope, "global");
  assert.equal(globalTrashFromProjectView.items.some((item) => item.rootId === "openclaw-root" && item.originalPath === "workspace/global-trash-note.txt"), true);
  const openclawTrashItem = globalTrashFromProjectView.items.find((item) => item.rootId === "openclaw-root" && item.originalPath === "workspace/global-trash-note.txt");
  assert.ok(openclawTrashItem);
  const rebuiltOpenclawIndex = service.rebuildContentIndex("openclaw-root");
  assert.equal(rebuiltOpenclawIndex.recordsPreview.some((record) => record.path.startsWith(".tracevane/trash/")), false);
  service.restoreTrash({ rootId: "global", trashPath: openclawTrashItem.trashPath, conflictPolicy: "rename" });
  assert.equal(fs.existsSync(path.join(config.openclawRoot, "workspace", "global-trash-note.txt")), true);

  service.createDirectory({ rootId: "project-root", directoryPath: "docs", name: "purge-me" });
  service.deletePaths({ rootId: "project-root", paths: ["docs/purge-me"] });
  const purgeTarget = service.listTrash("project-root").items.find((item) => item.originalPath === "docs/purge-me");
  assert.ok(purgeTarget);
  const purged = service.purgeTrash({ rootId: "global", trashPaths: [purgeTarget.trashPath] });
  assert.equal(purged.action, "purge-trash");
  assert.equal(service.listTrash("project-root").items.some((item) => item.originalPath === "docs/purge-me"), false);

  service.createDirectory({ rootId: "project-root", directoryPath: "docs", name: "permanent" });
  const permanentDelete = service.deletePaths({
    rootId: "project-root",
    paths: ["docs/permanent"],
    permanent: true,
  });
  assert.match(permanentDelete.message, /Permanently deleted 1 item\(s\)/);
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "permanent")), false);
});

test("files service exposes tree nodes and download payloads", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "src", "nested", "child.ts"), "export const child = true;\n");
  fs.writeFileSync(path.join(config.projectRoot, "src", "clip.mp4"), Buffer.from([0, 0, 0, 24]));
  fs.writeFileSync(path.join(config.projectRoot, "src", "track.mp3"), Buffer.from([0xff, 0xfb, 0x90, 0x64]));
  fs.writeFileSync(path.join(config.projectRoot, "src", "manual.pdf"), Buffer.from("%PDF-1.4\n"));
  fs.writeFileSync(path.join(config.projectRoot, "src", "display.woff2"), Buffer.from("wOF2"));
  fs.mkdirSync(path.join(config.projectRoot, "src", "nested", "deeper"), { recursive: true });
  const service = createFilesService(config);

  const browse = service.listDirectory("project-root", "src", true);
  const tree = service.listTree("project-root", "src", true);
  const download = service.getDownloadFile("project-root", "src/nested/child.ts");
  const videoDownload = service.getDownloadFile("project-root", "src/clip.mp4");
  const audioRead = service.readFile("project-root", "src/track.mp3");
  const pdfRead = service.readFile("project-root", "src/manual.pdf");
  const fontDownload = service.getDownloadFile("project-root", "src/display.woff2");
  const nestedBrowseEntry = browse.entries.find((item) => item.path === "src/nested");
  const nestedTreeEntry = tree.children.find((item) => item.path === "src/nested");

  assert.equal(nestedBrowseEntry?.kind, "directory");
  assert.equal(nestedTreeEntry?.name, "nested");
  assert.equal(Object.hasOwn(nestedBrowseEntry ?? {}, "childDirectoryCount"), false);
  assert.equal(Object.hasOwn(nestedTreeEntry ?? {}, "childDirectoryCount"), false);
  assert.equal(download.fileName, "child.ts");
  assert.match(download.mimeType, /text|typescript|javascript|application/);
  assert.equal(videoDownload.mimeType, "video/mp4");
  assert.equal(audioRead.mimeType, "audio/mpeg");
  assert.equal(audioRead.content, null);
  assert.equal(pdfRead.mimeType, "application/pdf");
  assert.equal(pdfRead.textLike, false);
  assert.equal(fontDownload.mimeType, "font/woff2");
});

test("files service returns content-index records in stable sorted pages", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "alpha.txt"), "alpha\n");
  writeFile(path.join(config.projectRoot, "zeta.txt"), "zeta\n");
  const service = createFilesService(config);

  const indexDir = path.join(
    config.openclawRoot,
    ".tracevane",
    "file-content-index",
    "project-root",
  );
  fs.mkdirSync(indexDir, { recursive: true });
  const alphaSha = "f".repeat(64);
  const zetaSha = "0".repeat(64);
  const alphaStat = fs.statSync(path.join(config.projectRoot, "alpha.txt"));
  const zetaStat = fs.statSync(path.join(config.projectRoot, "zeta.txt"));
  fs.writeFileSync(
    path.join(indexDir, "00.json"),
    JSON.stringify({
      [zetaSha]: [
        {
          rootId: "project-root",
          path: "zeta.txt",
          size: zetaStat.size,
          sha256: zetaSha,
          mtimeMs: zetaStat.mtimeMs,
          indexedAt: "2026-06-26T00:00:00.000Z",
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(indexDir, "ff.json"),
    JSON.stringify({
      [alphaSha]: [
        {
          rootId: "project-root",
          path: "alpha.txt",
          size: alphaStat.size,
          sha256: alphaSha,
          mtimeMs: alphaStat.mtimeMs,
          indexedAt: "2026-06-26T00:00:01.000Z",
        },
      ],
    }),
    "utf8",
  );

  const firstPage = service.getContentIndexRecords({
    rootId: "project-root",
    status: "valid",
    offset: 0,
    limit: 1,
  });
  const secondPage = service.getContentIndexRecords({
    rootId: "project-root",
    status: "valid",
    offset: 1,
    limit: 1,
  });

  assert.equal(firstPage.totalRecordCount, 2);
  assert.equal(firstPage.returnedRecordCount, 1);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.records[0]?.path, "alpha.txt");
  assert.equal(secondPage.totalRecordCount, 2);
  assert.equal(secondPage.returnedRecordCount, 1);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.records[0]?.path, "zeta.txt");
});

test("files service exposes content index as a global aggregate scope", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const service = createFilesService(config);
  writeFile(path.join(config.projectRoot, "alpha.txt"), "alpha\n");
  writeFile(path.join(config.openclawRoot, "workspace", "beta.txt"), "beta\n");

  const records = [
    { rootId: "project-root", basePath: config.projectRoot, relativePath: "alpha.txt", sha: "a".repeat(64) },
    { rootId: "openclaw-root", basePath: config.openclawRoot, relativePath: "workspace/beta.txt", sha: "b".repeat(64) },
  ];
  for (const record of records) {
    const stat = fs.statSync(path.join(record.basePath, record.relativePath));
    const indexDir = path.join(config.openclawRoot, ".tracevane", "file-content-index", record.rootId);
    fs.mkdirSync(indexDir, { recursive: true });
    fs.writeFileSync(path.join(indexDir, `${record.sha.slice(0, 2)}.json`), JSON.stringify({
      [record.sha]: [{ path: record.relativePath, size: stat.size, mtimeMs: stat.mtimeMs, indexedAt: "2026-06-29T00:00:00.000Z" }],
    }), "utf8");
  }

  const stats = service.getContentIndexStats("global");
  assert.equal(stats.rootId, "global");
  assert.equal(stats.scope, "global");
  assert.equal(stats.fastStats, true);
  assert.equal(stats.rootCount >= 2, true);
  assert.equal(stats.recordCount, 2);
  assert.deepEqual(stats.recordsPreview.map((record) => `${record.rootId}:${record.path}`).sort(), ["openclaw-root:workspace/beta.txt", "project-root:alpha.txt"]);

  const page = service.getContentIndexRecords({ rootId: "global", status: "all", query: "beta", offset: 0, limit: 10 });
  assert.equal(page.rootId, "global");
  assert.equal(page.scope, "global");
  assert.equal(page.rootCount >= 2, true);
  assert.equal(page.returnedRecordCount, 1);
  assert.equal(page.records[0]?.rootId, "openclaw-root");
  assert.equal(page.records[0]?.path, "workspace/beta.txt");
});


test("files service can archive and unarchive zip and tar bundles", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "bundle", "a.txt"), "alpha\n");
  writeFile(path.join(config.projectRoot, "bundle", "nested", "b.txt"), "beta\n");
  const service = createFilesService(config);

  const archiveDryRun = service.dryRunArchive({
    rootId: "project-root",
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup",
  });
  assert.equal(archiveDryRun.destinationExists, false);
  assert.equal(archiveDryRun.archivePath, "bundle-backup.zip");
  assert.equal(archiveDryRun.counts.ready, 1);

  service.archivePaths({
    rootId: "project-root",
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup",
  });

  const archivePath = path.join(config.projectRoot, "bundle-backup.zip");
  assert.equal(fs.existsSync(archivePath), true);
  const archiveConflictDryRun = service.dryRunArchive({
    rootId: "project-root",
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup.zip",
  });
  assert.equal(archiveConflictDryRun.destinationExists, true);
  assert.throws(() =>
    service.archivePaths({
      rootId: "project-root",
      directoryPath: "",
      paths: ["bundle"],
      name: "bundle-backup.zip",
    }),
  );

  fs.mkdirSync(path.join(config.projectRoot, "restore"), { recursive: true });
  service.unarchiveFile({
    rootId: "project-root",
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
  });

  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore", "bundle", "a.txt"), "utf8"),
    /alpha/,
  );
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore", "bundle", "nested", "b.txt"), "utf8"),
    /beta/,
  );

  const download = service.prepareArchiveDownload({
    rootId: "project-root",
    paths: ["bundle"],
    name: "bundle-download",
  });
  assert.equal(fs.existsSync(download.archivePath), true);
  assert.equal(download.fileName, "bundle-download.zip");
  fs.rmSync(download.cleanupDir, { recursive: true, force: true });

  service.archivePaths({
    rootId: "project-root",
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup.tar.gz",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "bundle-backup.tar.gz")), true);

  fs.mkdirSync(path.join(config.projectRoot, "restore-tar"), { recursive: true });
  service.unarchiveFile({
    rootId: "project-root",
    archivePath: "bundle-backup.tar.gz",
    directoryPath: "restore-tar",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore-tar", "bundle", "nested", "b.txt"), "utf8"),
    /beta/,
  );

  fs.mkdirSync(path.join(config.projectRoot, "restore-explicit"), { recursive: true });
  service.unarchiveFile({
    rootId: "project-root",
    archivePath: "bundle-backup.tar.gz",
    directoryPath: "",
    destinationDirectoryPath: "restore-explicit",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore-explicit", "bundle", "a.txt"), "utf8"),
    /alpha/,
  );

  assert.throws(() =>
    service.unarchiveFile({
      rootId: "project-root",
      archivePath: "bundle-backup.zip",
      directoryPath: "restore",
      conflictPolicy: "fail",
    }),
  );
  const blockedExtract = service.dryRunUnarchive({
    rootId: "project-root",
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "fail",
  });
  assert.equal(blockedExtract.counts.conflicts >= 1, true);
  assert.equal(blockedExtract.items.some((item) => item.status === "conflict"), true);
  const overwriteExtract = service.dryRunUnarchive({
    rootId: "project-root",
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "overwrite",
  });
  assert.equal(overwriteExtract.counts.overwrite >= 1, true);
  assert.throws(() =>
    service.unarchiveFile({
      rootId: "project-root",
      archivePath: "bundle-backup.zip",
      directoryPath: "restore",
      conflictPolicy: "overwrite",
    }),
  );
  service.unarchiveFile({
    rootId: "project-root",
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "overwrite",
    overwriteConfirm: "OVERWRITE",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore", "bundle", "a.txt"), "utf8"),
    /alpha/,
  );
  const renamedExtract = service.dryRunUnarchive({
    rootId: "project-root",
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "rename",
  });
  assert.equal(renamedExtract.counts.rename >= 1, true);
  assert.equal(renamedExtract.items.some((item) => item.destinationPath?.endsWith("a (1).txt")), true);
  service.unarchiveFile({
    rootId: "project-root",
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "rename",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore", "bundle", "a (1).txt"), "utf8"),
    /alpha/,
  );

  service.archivePaths({
    rootId: "project-root",
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup.tar.xz",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "bundle-backup.tar.xz")), true);

  fs.mkdirSync(path.join(config.projectRoot, "restore-xz"), { recursive: true });
  service.unarchiveFile({
    rootId: "project-root",
    archivePath: "bundle-backup.tar.xz",
    directoryPath: "restore-xz",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore-xz", "bundle", "nested", "b.txt"), "utf8"),
    /beta/,
  );

  service.archivePaths({
    rootId: "project-root",
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup.tbz",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "bundle-backup.tbz")), true);

  fs.mkdirSync(path.join(config.projectRoot, "restore-tbz"), { recursive: true });
  service.unarchiveFile({
    rootId: "project-root",
    archivePath: "bundle-backup.tbz",
    directoryPath: "restore-tbz",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore-tbz", "bundle", "a.txt"), "utf8"),
    /alpha/,
  );
});

test("files service rejects zip entries that escape the extraction directory", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const service = createFilesService(config);
  const archivePath = path.join(config.projectRoot, "unsafe.zip");
  const restorePath = path.join(config.projectRoot, "restore");
  const escapedPath = path.join(config.projectRoot, "restore-evil", "escape.txt");

  fs.mkdirSync(restorePath, { recursive: true });
  writeZipEntry(archivePath, "../restore-evil/escape.txt", "escaped\n");

  const dryRun = service.dryRunUnarchive({
    rootId: "project-root",
    archivePath: "unsafe.zip",
    directoryPath: "restore",
  });
  assert.equal(dryRun.counts.errors, 1);
  assert.match(dryRun.items[0].message || "", /escapes|Path escapes|逃逸/i);

  assert.throws(() =>
    service.unarchiveFile({
      rootId: "project-root",
      archivePath: "unsafe.zip",
      directoryPath: "restore",
    }),
  );
  assert.equal(fs.existsSync(escapedPath), false);
});

test("files service rejects tar entries that escape the extraction directory", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const service = createFilesService(config);
  const archivePath = path.join(config.projectRoot, "unsafe.tar.gz");
  const restorePath = path.join(config.projectRoot, "restore");
  const escapedPath = path.join(config.projectRoot, "restore-evil", "escape.txt");

  fs.mkdirSync(restorePath, { recursive: true });
  writeTarGzEntry(archivePath, "../restore-evil/escape.txt", "escaped\n");

  assert.throws(() =>
    service.unarchiveFile({
      rootId: "project-root",
      archivePath: "unsafe.tar.gz",
      directoryPath: "restore",
    }),
  );
  assert.equal(fs.existsSync(escapedPath), false);
});
