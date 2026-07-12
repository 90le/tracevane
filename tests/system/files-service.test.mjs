import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const crossSpawn = require("cross-spawn");
const which = require("which");

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

function resolveTestPythonInvocation() {
  for (const candidate of ["python3", "python"]) {
    const resolved = which.sync(candidate, { nothrow: true });
    if (resolved) return { command: resolved, prefixArgs: [] };
  }
  if (process.platform === "win32") {
    const resolved = which.sync("py", { nothrow: true });
    if (resolved) return { command: resolved, prefixArgs: ["-3"] };
  }
  throw new Error("Python 3 is required to create files-service archive fixtures");
}

function runTestPython(args, options = {}) {
  const invocation = resolveTestPythonInvocation();
  const result = crossSpawn.sync(
    invocation.command,
    [...invocation.prefixArgs, ...args],
    {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      ...options,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `Python fixture command exited with status ${result.status}`);
  }
  return result.stdout || "";
}

function withPythonOnlyPath(root, fn) {
  const invocation = resolveTestPythonInvocation();
  const binDir = path.join(root, "python-only-bin");
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;
  fs.mkdirSync(binDir, { recursive: true });
  if (process.platform === "win32") {
    const prefix = invocation.prefixArgs.map((arg) => `"${arg.replaceAll('"', '""')}"`).join(" ");
    fs.writeFileSync(
      path.join(binDir, "python.cmd"),
      `@echo off\r\n"${invocation.command}"${prefix ? ` ${prefix}` : ""} %*\r\n`,
      "utf8",
    );
    process.env.PATHEXT = ".CMD";
  } else {
    fs.symlinkSync(invocation.command, path.join(binDir, "python"));
  }
  process.env.PATH = binDir;
  try {
    return fn();
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousPathExt === undefined) delete process.env.PATHEXT;
    else process.env.PATHEXT = previousPathExt;
  }
}

function writeZipEntry(zipPath, entryName, content) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  runTestPython(
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
  runTestPython(
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
  fs.mkdirSync(path.join(projectRoot, "workspace"), { recursive: true });
  fs.mkdirSync(path.join(openclawRoot, "workspace"), { recursive: true });
  fs.mkdirSync(path.join(openclawRoot, "extensions"), { recursive: true });
  return {
    openclawRoot,
    projectRoot,
  };
}

function filesystemRelativePath(absolutePath) {
  const filesystemRoot = path.parse(path.resolve(absolutePath)).root;
  return path.relative(filesystemRoot, absolutePath).split(path.sep).join("/");
}

const FILESYSTEM_ROOT_ID = "openclaw-root";

function createTempScopedFilesService(config, scopeRoot = config.projectRoot) {
  const rawService = createFilesService(config);
  const resolvedScopeRoot = fs.realpathSync(scopeRoot);
  const filesystemRoot = path.parse(resolvedScopeRoot).root;
  const scopePrefix = filesystemRelativePath(resolvedScopeRoot);

  function scopedPath(relativePath = "") {
    const normalized = String(relativePath || "").replaceAll("\\", "/");
    if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
      throw new Error(`Test path escapes its temporary scope: ${relativePath}`);
    }
    const absolutePath = path.resolve(resolvedScopeRoot, ...normalized.split("/").filter(Boolean));
    const relativeToScope = path.relative(resolvedScopeRoot, absolutePath);
    if (relativeToScope === ".." || relativeToScope.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToScope)) {
      throw new Error(`Test path escapes its temporary scope: ${relativePath}`);
    }
    return filesystemRelativePath(absolutePath);
  }

  function relativePath(scopedValue) {
    const absolutePath = path.resolve(filesystemRoot, ...String(scopedValue || "").split("/").filter(Boolean));
    const relativeToScope = path.relative(resolvedScopeRoot, absolutePath);
    if (relativeToScope === ".." || relativeToScope.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToScope)) {
      throw new Error(`Production API returned a path outside the temporary scope: ${scopedValue}`);
    }
    return relativeToScope.split(path.sep).join("/");
  }

  function rootId(value, allowGlobal = false) {
    if (allowGlobal && value === "global") return value;
    if (value !== undefined && value !== FILESYSTEM_ROOT_ID) {
      throw new Error(`Tests must use the production filesystem root id, received: ${value}`);
    }
    return FILESYSTEM_ROOT_ID;
  }

  function mapPayload(payload, { paths = [], pathArrays = [], allowGlobal = false } = {}) {
    const mapped = { ...payload };
    if (Object.hasOwn(mapped, "rootId")) mapped.rootId = rootId(mapped.rootId, allowGlobal);
    for (const key of paths) {
      if (Object.hasOwn(mapped, key) && mapped[key] !== undefined) mapped[key] = scopedPath(mapped[key]);
    }
    for (const key of pathArrays) {
      if (Object.hasOwn(mapped, key)) mapped[key] = mapped[key].map((entry) => scopedPath(entry));
    }
    return mapped;
  }

  function mapTransferPayload(payload) {
    return {
      ...payload,
      sourceRootId: rootId(payload.sourceRootId),
      sourcePath: payload.sourcePath === undefined ? undefined : scopedPath(payload.sourcePath),
      sourcePaths: payload.sourcePaths?.map((entry) => scopedPath(entry)),
      destinationRootId: rootId(payload.destinationRootId),
      destinationDirectoryPath: scopedPath(payload.destinationDirectoryPath),
    };
  }

  function mapFavoriteItem(item) {
    return {
      ...item,
      location: item.location
        ? {
            ...item.location,
            rootId: rootId(item.location.rootId),
            directoryPath: scopedPath(item.location.directoryPath),
          }
        : undefined,
      children: item.children?.map(mapFavoriteItem),
    };
  }

  const service = new Proxy(rawService, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (typeof original !== "function") return original;
      return (...originalArgs) => {
        const args = [...originalArgs];
        switch (property) {
          case "listDirectory":
          case "listTree":
          case "getWatchSnapshot":
          case "search":
          case "readFile":
          case "listVersions":
          case "readVersion":
          case "getDownloadFile":
            args[0] = rootId(args[0]);
            args[1] = scopedPath(args[1]);
            break;
          case "writeFile":
          case "restoreVersion":
          case "deleteVersion":
          case "renamePath":
            args[0] = mapPayload(args[0], { paths: ["path"] });
            break;
          case "createDirectory":
          case "createFile":
          case "uploadFiles":
          case "initUpload":
            args[0] = mapPayload(args[0], { paths: ["directoryPath"] });
            break;
          case "dryRunChmod":
          case "chmodPaths":
          case "deletePaths":
            args[0] = mapPayload(args[0], { pathArrays: ["paths"] });
            break;
          case "copyPath":
          case "movePath":
          case "dryRunTransfer":
          case "transferPaths":
            args[0] = mapTransferPayload(args[0]);
            break;
          case "dryRunArchive":
          case "archivePaths":
            args[0] = mapPayload(args[0], { paths: ["directoryPath"], pathArrays: ["paths"] });
            break;
          case "prepareArchiveDownload":
            args[0] = mapPayload(args[0], { pathArrays: ["paths"] });
            break;
          case "dryRunUnarchive":
          case "unarchiveFile":
            args[0] = mapPayload(args[0], {
              paths: ["archivePath", "directoryPath", "destinationDirectoryPath"],
            });
            break;
          case "getContentIndexStats":
          case "scanContentIndex":
          case "cleanContentIndex":
            args[0] = rootId(args[0], true);
            break;
          case "getContentIndexRecords":
            args[0] = mapPayload(args[0], { allowGlobal: true });
            break;
          case "listTrash":
            args[0] = typeof args[0] === "string"
              ? rootId(args[0], true)
              : mapPayload(args[0], { allowGlobal: true });
            break;
          case "restoreTrash":
          case "purgeTrash":
            args[0] = mapPayload(args[0], { allowGlobal: true });
            break;
          case "replaceFavoriteBookmarks":
            args[0] = { ...args[0], items: args[0].items.map(mapFavoriteItem) };
            break;
          case "rebuildContentIndex":
          case "startContentIndexRebuild":
            throw new Error("Root-wide index rebuilds are intentionally disabled in temp-scoped tests");
          default:
            break;
        }
        return original.apply(target, args);
      };
    },
  });

  return {
    service,
    scope: {
      absoluteRoot: resolvedScopeRoot,
      prefix: scopePrefix,
      path: scopedPath,
      relative: relativePath,
      rootId: FILESYSTEM_ROOT_ID,
    },
  };
}

function uploadIndexedFile(service, directoryPath, fileName, content) {
  const body = Buffer.from(content);
  const init = service.initUpload({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath,
    fileName,
    size: body.length,
    chunkSize: Math.max(1, Math.min(body.length || 1, 64 * 1024)),
    sha256: createHash("sha256").update(body).digest("hex"),
  });
  if (init.instant) return init;
  for (let index = 0; index < init.chunkCount; index += 1) {
    const start = index * init.chunkSize;
    service.writeUploadChunk(init.uploadId, index, body.subarray(start, start + init.chunkSize));
  }
  return service.completeUpload({ uploadId: init.uploadId });
}

test("files service rejects an explicit unknown root instead of falling back to the preferred root", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const service = createFilesService(config);

  assert.throws(
    () => service.listDirectory("unknown-root", filesystemRelativePath(config.projectRoot), true),
    /unknown|root/i,
  );
  assert.equal(
    service.listDirectory(undefined, filesystemRelativePath(config.projectRoot), true).rootId,
    FILESYSTEM_ROOT_ID,
  );
});

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

  const { service, scope } = createTempScopedFilesService(config);
  const summary = service.getSummary();
  const projectListing = service.listDirectory(FILESYSTEM_ROOT_ID, "", true);
  const secondPage = service.listDirectory(FILESYSTEM_ROOT_ID, "", true, {
    page: 2,
    pageSize: 2,
    sortKey: "name",
    sortDirection: "asc",
  });
  const clampedPageSize = service.listDirectory(FILESYSTEM_ROOT_ID, "", true, { pageSize: 5000 });

  assert.equal(summary.defaultRootId, FILESYSTEM_ROOT_ID);
  assert.deepEqual(summary.roots.map((rootEntry) => rootEntry.id), [FILESYSTEM_ROOT_ID]);
  assert.equal(summary.roots[0]?.absolutePath, path.resolve(path.parse(config.openclawRoot).root || "/"));
  assert.throws(() => scope.path("../outside"), /escapes its temporary scope/);
  assert.equal(scope.relative(projectListing.entries.find((entry) => entry.name === "README.md")?.path), "README.md");
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

test("files test scope keeps mutation, index, and archive paths inside its temporary root", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service, scope } = createTempScopedFilesService(config);

  const createdDirectory = service.createDirectory({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "",
    name: "sandbox",
  });
  const createdFile = service.createFile({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "sandbox",
    name: "note.txt",
    content: "safe\n",
  });
  uploadIndexedFile(service, "sandbox", "indexed.txt", "indexed\n");
  const indexPage = service.getContentIndexRecords({
    rootId: FILESYSTEM_ROOT_ID,
    status: "all",
    query: "indexed.txt",
    limit: 10,
  });
  const archivePreview = service.dryRunArchive({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "",
    paths: ["sandbox"],
    name: "sandbox.zip",
  });

  assert.deepEqual(createdDirectory.affectedPaths.map(scope.relative), ["sandbox"]);
  assert.deepEqual(createdFile.affectedPaths.map(scope.relative), ["sandbox/note.txt"]);
  assert.deepEqual(indexPage.records.map((record) => scope.relative(record.path)), ["sandbox/indexed.txt"]);
  assert.equal(scope.relative(archivePreview.archivePath), "sandbox.zip");
  assert.equal(fs.existsSync(path.join(config.projectRoot, "sandbox", "note.txt")), true);
  assert.throws(() => scope.path("../outside"), /escapes its temporary scope/);
});

test("files service persists favorites through sqlite across service instances", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service: first } = createTempScopedFilesService(config);
  const seed = [
    {
      id: "bookmark:alpha",
      type: "bookmark",
      title: "Alpha",
      location: {
        rootId: FILESYSTEM_ROOT_ID,
        directoryPath: "tmp/alpha",
        label: "/tmp/alpha",
      },
    },
    {
      id: "bookmark:folder",
      type: "folder",
      title: "Folder",
      children: [
        {
          id: "bookmark:nested",
          type: "bookmark",
          title: "Nested",
          location: {
            rootId: FILESYSTEM_ROOT_ID,
            directoryPath: "tmp/nested",
            label: "/tmp/nested",
            displayName: "Nested Display",
          },
        },
      ],
    },
  ];

  const saved = first.replaceFavoriteBookmarks({ items: seed });
  assert.equal(saved.items.length, 2);
  assert.equal(saved.items[1].children[0].title, "Nested");

  const { service: second } = createTempScopedFilesService(config);
  const loaded = second.getFavoriteBookmarks();
  assert.equal(loaded.items[0].title, "Alpha");
  assert.equal(loaded.items[1].type, "folder");
  assert.equal(loaded.items[1].children[0].location.displayName, "Nested Display");

  second.replaceFavoriteBookmarks({ items: [seed[1]] });
  const replaced = first.getFavoriteBookmarks();
  assert.equal(replaced.items.length, 1);
  assert.equal(replaced.items[0].id, "bookmark:folder");
});

test("files service uses a portable SQLite schema without optional FTS5 modules", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service, scope } = createTempScopedFilesService(config);

  const favorites = service.replaceFavoriteBookmarks({
    items: [
      {
        id: "bookmark:portable",
        type: "bookmark",
        title: "Portable",
        location: {
          rootId: FILESYSTEM_ROOT_ID,
          directoryPath: "docs",
          label: "/docs",
        },
      },
    ],
  });

  assert.equal(favorites.items[0]?.title, "Portable");

  const db = new DatabaseSync(path.join(config.openclawRoot, ".tracevane", "file-manager.sqlite"));
  try {
    const optionalFtsTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_index_fts'").get();
    assert.equal(optionalFtsTable, undefined);
  } finally {
    db.close();
  }
});

test("files service supports search, read, write, create, rename, copy, move, delete, and upload", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "docs", "guide.md"), "hello world\n");
  writeFile(path.join(config.projectRoot, "docs", "notes.txt"), "draft\n");
  writeFile(path.join(config.projectRoot, "docs", "content-only.txt"), "alpha hidden needle beta\n");
  const { service, scope } = createTempScopedFilesService(config);

  const search = service.search(FILESYSTEM_ROOT_ID, "", "guide", true, true);
  assert.equal(scope.relative(search.results[0].path), "docs/guide.md");
  assert.equal(search.results[0].matchKind, "name");
  assert.equal(search.limit, 250);
  assert.equal(search.truncated, false);

  const limitedSearch = service.search(FILESYSTEM_ROOT_ID, "", "guide", true, true, { limit: 1 });
  assert.equal(limitedSearch.limit, 1);
  assert.equal(limitedSearch.results.length, 1);
  assert.equal(limitedSearch.truncated, true);

  const contentSearch = service.search(FILESYSTEM_ROOT_ID, "", "needle", true, true);
  assert.equal(scope.relative(contentSearch.results[0].path), "docs/content-only.txt");
  assert.equal(contentSearch.results[0].matchKind, "content");
  assert.match(contentSearch.results[0].snippet || "", /needle/);

  const caseSensitiveMiss = service.search(FILESYSTEM_ROOT_ID, "", "GUIDE", true, true, { caseSensitive: true });
  assert.equal(caseSensitiveMiss.results.some((result) => scope.relative(result.path) === "docs/guide.md"), false);
  assert.equal(caseSensitiveMiss.caseSensitive, true);

  const regexSearch = service.search(FILESYSTEM_ROOT_ID, "", "h.dden\\s+needle", true, true, { regex: true });
  assert.equal(scope.relative(regexSearch.results[0].path), "docs/content-only.txt");
  assert.equal(regexSearch.regex, true);

  const invalidRegexSearch = service.search(FILESYSTEM_ROOT_ID, "", "[", true, true, { regex: true });
  assert.match(invalidRegexSearch.error || "", /regular expression|Unterminated|Invalid/i);
  assert.equal(invalidRegexSearch.limit, 250);
  assert.equal(invalidRegexSearch.truncated, false);
  assert.equal(invalidRegexSearch.results.length, 0);

  const read = service.readFile(FILESYSTEM_ROOT_ID, "docs/guide.md");
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
  const largeHead = service.readFile(FILESYSTEM_ROOT_ID, "docs/large.log");
  assert.equal(largeHead.editable, false);
  assert.equal(largeHead.truncated, true);
  assert.equal(largeHead.contentOffset, 0);
  assert.equal(largeHead.contentBytes, 1024 * 1024);
  assert.equal(largeHead.readLimitBytes, 1024 * 1024);
  assert.equal((largeHead.content || "").includes("TAIL-END"), false);
  const largeTail = service.readFile(FILESYSTEM_ROOT_ID, "docs/large.log", { offset: 1024 * 1024, limit: 512 });
  assert.equal(largeTail.contentOffset, 1024 * 1024);
  assert.equal(largeTail.readLimitBytes, 512);
  assert.equal(largeTail.truncated, true);
  assert.match(largeTail.content || "", /TAIL-END/);

  service.writeFile({
    rootId: FILESYSTEM_ROOT_ID,
    path: "docs/guide.md",
    content: "updated body\n",
  });
  assert.match(fs.readFileSync(path.join(config.projectRoot, "docs", "guide.md"), "utf8"), /updated body/);

  const versions = service.listVersions(FILESYSTEM_ROOT_ID, "docs/guide.md");
  assert.equal(versions.rootId, FILESYSTEM_ROOT_ID);
  assert.equal(scope.relative(versions.path), "docs/guide.md");
  assert.equal(versions.versions.length >= 1, true);
  assert.equal(scope.relative(versions.versions[0].path), "docs/guide.md");
  assert.equal(versions.versions[0].name, "guide.md");
  const firstVersionId = versions.versions[0].id;
  const historical = service.readVersion(FILESYSTEM_ROOT_ID, "docs/guide.md", firstVersionId);
  assert.match(historical.content, /hello world/);
  const restoreResult = service.restoreVersion({ rootId: FILESYSTEM_ROOT_ID, path: "docs/guide.md", versionId: firstVersionId });
  assert.equal(restoreResult.action, "restore-version");
  assert.match(fs.readFileSync(path.join(config.projectRoot, "docs", "guide.md"), "utf8"), /hello world/);
  const versionsAfterRestore = service.listVersions(FILESYSTEM_ROOT_ID, "docs/guide.md");
  assert.equal(versionsAfterRestore.versions.length >= 1, true);
  const deleteVersionResult = service.deleteVersion({ rootId: FILESYSTEM_ROOT_ID, path: "docs/guide.md", versionId: firstVersionId });
  assert.equal(deleteVersionResult.action, "delete-version");
  assert.equal(service.listVersions(FILESYSTEM_ROOT_ID, "docs/guide.md").versions.some((version) => version.id === firstVersionId), false);

  service.writeFile({
    rootId: FILESYSTEM_ROOT_ID,
    path: "docs/guide.md",
    content: "updated body\n",
  });

  service.createDirectory({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs",
    name: "archive",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive")), true);

  service.createFile({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs/archive",
    name: "fresh.md",
    content: "fresh\n",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive", "fresh.md")), true);

  service.renamePath({
    rootId: FILESYSTEM_ROOT_ID,
    path: "docs/notes.txt",
    nextName: "notes-renamed.txt",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "notes-renamed.txt")), true);

  const chmodPreview = service.dryRunChmod({
    rootId: FILESYSTEM_ROOT_ID,
    paths: ["docs"],
    mode: "0750",
    recursive: true,
  });
  assert.equal(chmodPreview.mode, "0750");
  assert.equal(chmodPreview.recursive, true);
  assert.equal(chmodPreview.counts.directories >= 1, true);
  assert.equal(chmodPreview.items.some((item) => scope.relative(item.path) === "docs/guide.md" && item.nextMode === "0750"), true);
  const chmodResult = service.chmodPaths({ rootId: FILESYSTEM_ROOT_ID, paths: ["docs/guide.md"], mode: "0600" });
  assert.equal(chmodResult.action, "chmod");
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(path.join(config.projectRoot, "docs", "guide.md")).mode & 0o777, 0o600);
  }
  assert.throws(() => service.dryRunChmod({ rootId: FILESYSTEM_ROOT_ID, paths: ["docs/guide.md"], mode: "9999" }));

  service.copyPath({
    sourceRootId: FILESYSTEM_ROOT_ID,
    sourcePath: "docs/guide.md",
    destinationRootId: FILESYSTEM_ROOT_ID,
    destinationDirectoryPath: "",
    nextName: "guide-copy.md",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "guide-copy.md")), true);

  service.movePath({
    sourceRootId: FILESYSTEM_ROOT_ID,
    sourcePath: "docs/archive/fresh.md",
    destinationRootId: FILESYSTEM_ROOT_ID,
    destinationDirectoryPath: "",
    nextName: "fresh-moved.md",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "fresh-moved.md")), true);
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive", "fresh.md")), false);

  const blockingTransfer = service.dryRunTransfer({
    operation: "copy",
    sourceRootId: FILESYSTEM_ROOT_ID,
    sourcePaths: ["docs/guide.md"],
    destinationRootId: FILESYSTEM_ROOT_ID,
    destinationDirectoryPath: "docs",
    conflictPolicy: "fail",
  });
  assert.equal(blockingTransfer.counts.conflicts, 1);
  assert.equal(blockingTransfer.items[0].status, "conflict");
  const renamedTransfer = service.dryRunTransfer({
    operation: "copy",
    sourceRootId: FILESYSTEM_ROOT_ID,
    sourcePaths: ["docs/guide.md"],
    destinationRootId: FILESYSTEM_ROOT_ID,
    destinationDirectoryPath: "docs",
    conflictPolicy: "rename",
  });
  assert.equal(renamedTransfer.counts.rename, 1);
  assert.equal(scope.relative(renamedTransfer.items[0].destinationPath), "docs/guide (1).md");
  const explicitNamedTransfer = service.dryRunTransfer({
    operation: "copy",
    sourceRootId: FILESYSTEM_ROOT_ID,
    sourcePaths: ["docs/guide.md"],
    destinationRootId: FILESYSTEM_ROOT_ID,
    destinationDirectoryPath: "docs",
    nextName: "guide-copy.md",
    conflictPolicy: "fail",
  });
  assert.equal(explicitNamedTransfer.counts.ready, 1);
  assert.equal(scope.relative(explicitNamedTransfer.items[0].destinationPath), "docs/guide-copy.md");
  assert.throws(() =>
    service.dryRunTransfer({
      operation: "copy",
      sourceRootId: FILESYSTEM_ROOT_ID,
      sourcePaths: ["docs/guide.md", "docs/notes-renamed.txt"],
      destinationRootId: FILESYSTEM_ROOT_ID,
      destinationDirectoryPath: "docs",
      nextName: "single-name-only.md",
      conflictPolicy: "rename",
    }),
  );
  const transferCopy = service.transferPaths({
    operation: "copy",
    sourceRootId: FILESYSTEM_ROOT_ID,
    sourcePaths: ["docs/guide.md"],
    destinationRootId: FILESYSTEM_ROOT_ID,
    destinationDirectoryPath: "docs",
    conflictPolicy: "rename",
  });
  assert.equal(transferCopy.action, "transfer");
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "guide (1).md")), true);

  fs.mkdirSync(path.join(config.projectRoot, "docs", "nested"), { recursive: true });
  const unsafeMove = service.dryRunTransfer({
    operation: "move",
    sourceRootId: FILESYSTEM_ROOT_ID,
    sourcePaths: ["docs"],
    destinationRootId: FILESYSTEM_ROOT_ID,
    destinationDirectoryPath: "docs/nested",
    conflictPolicy: "rename",
  });
  assert.equal(unsafeMove.counts.errors, 1);
  assert.match(unsafeMove.items[0].message || "", /自身|子目录/);

  service.uploadFiles({
    rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
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
  assert.equal(scope.relative(status.targetPath), "docs/chunked.txt");

  const completed = service.completeUpload({ uploadId: init.uploadId });
  assert.equal(scope.relative(completed.affectedPaths[0]), "docs/chunked.txt");
  assert.equal(
    fs.readFileSync(path.join(config.projectRoot, "docs", "chunked.txt"), "utf8"),
    chunked.toString("utf8"),
  );
  assert.throws(() =>
    service.initUpload({
      rootId: FILESYSTEM_ROOT_ID,
      directoryPath: "docs",
      fileName: "chunked.txt",
      size: 0,
      chunkSize: 97,
      conflictPolicy: "fail",
    }),
  );

  const skipped = service.initUpload({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs",
    fileName: "chunked.txt",
    size: 0,
    chunkSize: 97,
    conflictPolicy: "skip",
  });
  assert.equal(skipped.skipped, true);
  assert.equal(scope.relative(skipped.targetPath), "docs/chunked.txt");

  const renamed = service.initUpload({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs",
    fileName: "chunked.txt",
    size: 0,
    chunkSize: 97,
    conflictPolicy: "rename",
  });
  assert.equal(scope.relative(renamed.targetPath), "docs/chunked (1).txt");
  service.completeUpload({ uploadId: renamed.uploadId });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "chunked (1).txt")), true);

  const sameHash = service.initUpload({
    rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs",
    fileName: "chunked.txt",
    size: chunked.length,
    chunkSize: 97,
    conflictPolicy: "rename",
    sha256: realHash,
  });
  assert.equal(instant.instant, true);
  assert.equal(scope.relative(instant.targetPath), "docs/chunked (2).txt");
  assert.equal(fs.readFileSync(path.join(config.projectRoot, "docs", "chunked (2).txt"), "utf8"), chunked.toString("utf8"));

  const globalInstant = service.initUpload({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs",
    fileName: "global-hash-copy.txt",
    size: chunked.length,
    chunkSize: 97,
    conflictPolicy: "rename",
    sha256: realHash,
  });
  assert.equal(globalInstant.instant, true);
  assert.equal(scope.relative(globalInstant.targetPath), "docs/global-hash-copy.txt");
  assert.equal(fs.readFileSync(path.join(config.projectRoot, "docs", "global-hash-copy.txt"), "utf8"), chunked.toString("utf8"));
  assert.equal(fs.existsSync(path.join(config.openclawRoot, ".tracevane", "file-manager.sqlite")), true);
  const sqliteIndexPage = service.getContentIndexRecords({
    rootId: FILESYSTEM_ROOT_ID,
    status: "all",
    query: realHash.slice(0, 16),
    offset: 0,
    limit: 10,
  });
  assert.equal(sqliteIndexPage.records.some((record) => scope.relative(record.path) === "docs/global-hash-copy.txt"), true);
  const indexStats = service.getContentIndexStats(FILESYSTEM_ROOT_ID);
  assert.equal(indexStats.rootId, FILESYSTEM_ROOT_ID);
  assert.equal(indexStats.scope, "root");
  assert.equal(indexStats.rootCount, 1);
  assert.equal(indexStats.fastStats, true);
  assert.equal(indexStats.shardCount >= 1, true);
  assert.equal(indexStats.validRecordCount >= 1, true);
  assert.equal(indexStats.staleRecordCount, 0);
  assert.equal(indexStats.previewLimit, 20);
  assert.equal(Array.isArray(indexStats.recordsPreview), true);
  const globalPreview = indexStats.recordsPreview.find((record) => scope.relative(record.path) === "docs/global-hash-copy.txt");
  assert.equal(globalPreview?.rootId, FILESYSTEM_ROOT_ID);
  assert.equal(globalPreview?.status, "valid");
  assert.equal(globalPreview?.sha256, realHash);
  assert.equal(globalPreview?.size, chunked.length);
  const indexRecordsPage = service.getContentIndexRecords({
    rootId: FILESYSTEM_ROOT_ID,
    status: "valid",
    query: "global-hash",
    offset: 0,
    limit: 1,
  });
  assert.equal(indexRecordsPage.rootId, FILESYSTEM_ROOT_ID);
  assert.equal(indexRecordsPage.status, "valid");
  assert.equal(indexRecordsPage.query, "global-hash");
  assert.equal(indexRecordsPage.limit, 1);
  assert.equal(indexRecordsPage.returnedRecordCount, 1);
  assert.equal(indexRecordsPage.scope, "root");
  assert.equal(indexRecordsPage.rootCount, 1);
  assert.equal(indexRecordsPage.records[0]?.rootId, FILESYSTEM_ROOT_ID);
  assert.equal(scope.relative(indexRecordsPage.records[0]?.path), "docs/global-hash-copy.txt");
  assert.equal(indexRecordsPage.records[0]?.sha256, realHash);
  fs.rmSync(path.join(config.projectRoot, "docs", "global-hash-copy.txt"), { force: true });
  const staleIndexStats = service.scanContentIndex(FILESYSTEM_ROOT_ID);
  assert.equal(staleIndexStats.staleRecordCount >= 1, true);
  const staleRecordsPage = service.getContentIndexRecords({
    rootId: FILESYSTEM_ROOT_ID,
    status: "stale",
    query: realHash.slice(0, 16),
    offset: 0,
    limit: 10,
  });
  assert.equal(staleRecordsPage.records.some((record) => scope.relative(record.path) === "docs/global-hash-copy.txt" && record.status === "stale"), true);
  const stalePreview = staleIndexStats.recordsPreview.find((record) => scope.relative(record.path) === "docs/global-hash-copy.txt");
  assert.equal(stalePreview?.status, "stale");
  assert.equal(stalePreview?.sha256, realHash);
  const cleanedIndexStats = service.cleanContentIndex(FILESYSTEM_ROOT_ID);
  assert.equal((cleanedIndexStats.cleanedRecordCount ?? 0) >= 1, true);
  assert.equal(cleanedIndexStats.staleRecordCount, 0);
  assert.equal(cleanedIndexStats.previewLimit, 20);
  assert.equal(cleanedIndexStats.recordsPreview.some((record) => scope.relative(record.path) === "docs/global-hash-copy.txt"), false);
  assert.equal(cleanedIndexStats.recordsPreview.every((record) => record.status === "valid"), true);

  const indexedSearch = service.search(FILESYSTEM_ROOT_ID, "docs", "chunked", true, true);
  assert.equal(indexedSearch.index?.used, true);
  assert.equal((indexedSearch.index?.candidateCount ?? 0) >= 1, true);
  assert.equal(
    indexedSearch.results.some((entry) => scope.relative(entry.path) === "docs/chunked.txt" && entry.matchKind === "name"),
    true,
    JSON.stringify(indexedSearch.results.map((entry) => ({ path: scope.relative(entry.path), matchKind: entry.matchKind }))),
  );

  const emptyInit = service.initUpload({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs",
    fileName: "chunked-empty.txt",
    size: 0,
    chunkSize: 97,
  });
  assert.equal(emptyInit.chunkCount, 0);
  service.completeUpload({ uploadId: emptyInit.uploadId });
  assert.equal(fs.statSync(path.join(config.projectRoot, "docs", "chunked-empty.txt")).size, 0);

  const cancelInit = service.initUpload({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs",
    fileName: "cancel-me.txt",
    size: 4,
    chunkSize: 97,
  });
  service.cancelUpload({ uploadId: cancelInit.uploadId });
  assert.throws(() => service.completeUpload({ uploadId: cancelInit.uploadId }));

  const staleInit = service.initUpload({
    rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "docs",
    fileName: "gc-trigger.txt",
    size: 0,
    chunkSize: 97,
  });
  assert.equal(fs.existsSync(staleManifestPath), false);
  assert.throws(() => service.getUpload(staleInit.uploadId));

  assert.throws(() =>
    service.uploadFiles({
      rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
    paths: ["docs/archive"],
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive")), false);
  assert.match(deleteResult.message, /Moved 1 item\(s\) to recycle bin/);
  const globalTrashDir = path.join(config.openclawRoot, ".tracevane", "trash");
  assert.equal(fs.existsSync(globalTrashDir), true);
  assert.equal(fs.existsSync(path.join(config.projectRoot, ".tracevane-trash")), false);
  assert.equal(fs.existsSync(path.join(globalTrashDir, deleteResult.affectedPaths[1])), true);
  assert.equal(deleteResult.affectedPaths.some((entryPath) => entryPath.includes(`${FILESYSTEM_ROOT_ID}-archive`)), true);
  const trashMetadataPath = fs.readdirSync(globalTrashDir)
    .map((entry) => path.join(globalTrashDir, entry, "metadata.json"))
    .find((entryPath) => fs.existsSync(entryPath));
  assert.ok(trashMetadataPath);
  const trashMetadata = JSON.parse(fs.readFileSync(trashMetadataPath, "utf8"));
  assert.equal(trashMetadata.rootId, FILESYSTEM_ROOT_ID);
  assert.equal(scope.relative(trashMetadata.originalPath), "docs/archive");
  assert.equal(fs.existsSync(path.join(config.openclawRoot, ".tracevane", "file-manager.sqlite")), true);
  const trash = service.listTrash(FILESYSTEM_ROOT_ID);
  assert.equal(trash.trashDirectoryPath, ".tracevane/trash");
  assert.equal(trash.items.some((item) => scope.relative(item.originalPath) === "docs/archive" && item.rootId === FILESYSTEM_ROOT_ID), true);
  const restored = service.restoreTrash({ rootId: FILESYSTEM_ROOT_ID, trashPath: trash.items[0].trashPath, conflictPolicy: "rename" });
  assert.equal(restored.action, "restore-trash");
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive")), true);
  assert.equal(service.listTrash(FILESYSTEM_ROOT_ID).items.some((item) => scope.relative(item.originalPath) === "docs/archive"), false);

  service.createFile({ rootId: FILESYSTEM_ROOT_ID, directoryPath: "workspace", name: "global-trash-note.txt", content: "shared trash\n" });
  service.deletePaths({ rootId: FILESYSTEM_ROOT_ID, paths: ["workspace/global-trash-note.txt"] });
  service.createFile({ rootId: FILESYSTEM_ROOT_ID, directoryPath: "docs", name: "paged-trash-a.txt", content: "a\n" });
  service.createFile({ rootId: FILESYSTEM_ROOT_ID, directoryPath: "docs", name: "paged-trash-b.txt", content: "b\n" });
  service.deletePaths({ rootId: FILESYSTEM_ROOT_ID, paths: ["docs/paged-trash-a.txt", "docs/paged-trash-b.txt"] });
  const firstTrashPage = service.listTrash({ rootId: "global", limit: 1 });
  assert.equal(firstTrashPage.page, 1);
  assert.equal(firstTrashPage.pageSize, 1);
  assert.ok((firstTrashPage.totalPages || 0) >= 2);
  assert.equal(firstTrashPage.returnedItemCount, 1);
  assert.equal(firstTrashPage.hasMore, true);
  assert.ok(firstTrashPage.nextCursor);
  const secondTrashPage = service.listTrash({ rootId: "global", page: 2, pageSize: 1 });
  assert.equal(secondTrashPage.page, 2);
  assert.equal(secondTrashPage.returnedItemCount, 1);
  assert.notEqual(secondTrashPage.items[0]?.trashPath, firstTrashPage.items[0]?.trashPath);
  const cursorTrashPage = service.listTrash({ rootId: "global", limit: 1, cursor: firstTrashPage.nextCursor });
  assert.equal(cursorTrashPage.returnedItemCount, 1);
  assert.equal(cursorTrashPage.items[0]?.trashPath, secondTrashPage.items[0]?.trashPath);

  const globalTrashFromProjectView = service.listTrash(FILESYSTEM_ROOT_ID);
  assert.equal(globalTrashFromProjectView.rootId, "global");
  assert.equal(globalTrashFromProjectView.scope, "global");
  assert.equal(globalTrashFromProjectView.items.some((item) => item.rootId === FILESYSTEM_ROOT_ID && scope.relative(item.originalPath) === "workspace/global-trash-note.txt"), true);
  const openclawTrashItem = globalTrashFromProjectView.items.find((item) => item.rootId === FILESYSTEM_ROOT_ID && scope.relative(item.originalPath) === "workspace/global-trash-note.txt");
  assert.ok(openclawTrashItem);
  const indexedRecords = service.getContentIndexRecords({ rootId: FILESYSTEM_ROOT_ID, status: "all", limit: 500 });
  assert.equal(indexedRecords.records.some((record) => scope.relative(record.path).startsWith(".tracevane/trash/")), false);
  service.restoreTrash({ rootId: "global", trashPath: openclawTrashItem.trashPath, conflictPolicy: "rename" });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "workspace", "global-trash-note.txt")), true);

  service.createDirectory({ rootId: FILESYSTEM_ROOT_ID, directoryPath: "docs", name: "purge-me" });
  service.deletePaths({ rootId: FILESYSTEM_ROOT_ID, paths: ["docs/purge-me"] });
  const purgeTarget = service.listTrash(FILESYSTEM_ROOT_ID).items.find((item) => scope.relative(item.originalPath) === "docs/purge-me");
  assert.ok(purgeTarget);
  const purged = service.purgeTrash({ rootId: "global", trashPaths: [purgeTarget.trashPath] });
  assert.equal(purged.action, "purge-trash");
  assert.equal(service.listTrash(FILESYSTEM_ROOT_ID).items.some((item) => scope.relative(item.originalPath) === "docs/purge-me"), false);

  service.createDirectory({ rootId: FILESYSTEM_ROOT_ID, directoryPath: "docs", name: "permanent" });
  const permanentDelete = service.deletePaths({
    rootId: FILESYSTEM_ROOT_ID,
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
  const { service, scope } = createTempScopedFilesService(config);

  const browse = service.listDirectory(FILESYSTEM_ROOT_ID, "src", true);
  const tree = service.listTree(FILESYSTEM_ROOT_ID, "src", true);
  const download = service.getDownloadFile(FILESYSTEM_ROOT_ID, "src/nested/child.ts");
  const videoDownload = service.getDownloadFile(FILESYSTEM_ROOT_ID, "src/clip.mp4");
  const audioRead = service.readFile(FILESYSTEM_ROOT_ID, "src/track.mp3");
  const pdfRead = service.readFile(FILESYSTEM_ROOT_ID, "src/manual.pdf");
  const fontDownload = service.getDownloadFile(FILESYSTEM_ROOT_ID, "src/display.woff2");
  const nestedBrowseEntry = browse.entries.find((item) => scope.relative(item.path) === "src/nested");
  const nestedTreeEntry = tree.children.find((item) => scope.relative(item.path) === "src/nested");

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

test("files service keeps content-index hot paths SQL-only instead of auto-reading JSON shards", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "alpha.txt"), "alpha\n");
  const { service, scope } = createTempScopedFilesService(config);
  const indexDir = path.join(config.openclawRoot, ".tracevane", "file-content-index", FILESYSTEM_ROOT_ID);
  fs.mkdirSync(indexDir, { recursive: true });
  const alphaSha = "f".repeat(64);
  const alphaStat = fs.statSync(path.join(config.projectRoot, "alpha.txt"));
  fs.writeFileSync(path.join(indexDir, "ff.json"), JSON.stringify({
    [alphaSha]: [{ path: "alpha.txt", size: alphaStat.size, sha256: alphaSha, mtimeMs: alphaStat.mtimeMs, indexedAt: "2026-06-26T00:00:01.000Z" }],
  }), "utf8");

  const stats = service.getContentIndexStats(FILESYSTEM_ROOT_ID);
  const page = service.getContentIndexRecords({ rootId: FILESYSTEM_ROOT_ID, status: "all", offset: 0, limit: 10 });

  assert.equal(stats.recordCount, 0);
  assert.equal(page.totalRecordCount, 0);
  assert.equal(page.returnedRecordCount, 0);
  assert.equal(fs.existsSync(path.join(config.openclawRoot, ".tracevane", "file-manager.sqlite")), true);
});

test("files service writes temp-scoped upload index records to SQLite sorted pages", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service, scope } = createTempScopedFilesService(config);

  uploadIndexedFile(service, "", "alpha.txt", "alpha\n");
  uploadIndexedFile(service, "", "zeta.txt", "zeta\n");

  const firstPage = service.getContentIndexRecords({ rootId: FILESYSTEM_ROOT_ID, status: "valid", offset: 0, limit: 1 });
  const secondPage = service.getContentIndexRecords({ rootId: FILESYSTEM_ROOT_ID, status: "valid", offset: 1, limit: 1 });

  assert.equal(firstPage.page, 1);
  assert.equal(firstPage.pageSize, 1);
  assert.equal(firstPage.totalPages, 2);
  assert.equal(firstPage.totalRecordCount, 2);
  assert.equal(scope.relative(firstPage.records[0]?.path), "alpha.txt");
  assert.equal(scope.relative(secondPage.records[0]?.path), "zeta.txt");
  const secondPageByNumber = service.getContentIndexRecords({ rootId: FILESYSTEM_ROOT_ID, status: "valid", page: 2, pageSize: 1 });
  assert.equal(secondPageByNumber.page, 2);
  assert.equal(scope.relative(secondPageByNumber.records[0]?.path), "zeta.txt");
  assert.ok(firstPage.nextCursor);
  const cursorPage = service.getContentIndexRecords({ rootId: FILESYSTEM_ROOT_ID, status: "valid", cursor: firstPage.nextCursor, limit: 1 });
  assert.equal(scope.relative(cursorPage.records[0]?.path), "zeta.txt");
  const maintenance = service.maintainSqlite(false);
  assert.match(maintenance.quickCheck, /ok/i);
  assert.equal(maintenance.vacuumed, false);
  assert.match(maintenance.databasePath, /file-manager\.sqlite/);
  assert.equal(fs.existsSync(path.join(config.openclawRoot, ".tracevane", "file-manager.sqlite")), true);
});


test("files service test scope refuses root-wide index rebuilds", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service } = createTempScopedFilesService(config);

  assert.throws(() => service.rebuildContentIndex(FILESYSTEM_ROOT_ID), /root-wide index rebuilds.*disabled/i);
  assert.throws(() => service.startContentIndexRebuild(FILESYSTEM_ROOT_ID), /root-wide index rebuilds.*disabled/i);
});

test("files service pages large content-index records through SQLite without approximate totals", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service, scope } = createTempScopedFilesService(config);
  fs.mkdirSync(path.join(config.projectRoot, "bulk"), { recursive: true });
  for (let index = 0; index < 40; index += 1) {
    uploadIndexedFile(service, "bulk", `file-${String(index).padStart(3, "0")}.txt`, "bulk\n");
  }

  const page = service.getContentIndexRecords({ rootId: FILESYSTEM_ROOT_ID, status: "all", offset: 20, limit: 10 });

  assert.equal(page.totalRecordCount, 40);
  assert.equal(page.returnedRecordCount, 10);
  assert.equal(page.records.length, 10);
  assert.equal(page.hasMore, true);
  assert.equal(scope.relative(page.records[0]?.path), "bulk/file-020.txt");
  assert.equal(scope.relative(page.records.at(-1)?.path), "bulk/file-029.txt");
});

test("files service exposes content index as a global aggregate scope", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service, scope } = createTempScopedFilesService(config);
  uploadIndexedFile(service, "", "alpha.txt", "alpha\n");
  uploadIndexedFile(service, "workspace", "beta.txt", "beta\n");

  const stats = service.getContentIndexStats("global");
  assert.equal(stats.rootId, "global");
  assert.equal(stats.scope, "global");
  assert.equal(stats.fastStats, true);
  assert.equal(stats.rootCount, 1);
  assert.equal(stats.recordCount, 2);
  assert.deepEqual(
    stats.recordsPreview.map((record) => `${record.rootId}:${scope.relative(record.path)}`).sort(),
    [`${FILESYSTEM_ROOT_ID}:alpha.txt`, `${FILESYSTEM_ROOT_ID}:workspace/beta.txt`],
  );

  const page = service.getContentIndexRecords({ rootId: "global", status: "all", query: "beta", offset: 0, limit: 10 });
  assert.equal(page.rootId, "global");
  assert.equal(page.scope, "global");
  assert.equal(page.rootCount, 1);
  assert.equal(page.returnedRecordCount, 1);
  assert.equal(page.records[0]?.rootId, FILESYSTEM_ROOT_ID);
  assert.equal(scope.relative(page.records[0]?.path), "workspace/beta.txt");
});

test("files service can archive and unarchive zip and tar bundles", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "bundle", "a.txt"), "alpha\n");
  writeFile(path.join(config.projectRoot, "bundle", "nested", "b.txt"), "beta\n");
  const { service, scope } = createTempScopedFilesService(config);

  const archiveDryRun = service.dryRunArchive({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup",
  });
  assert.equal(archiveDryRun.destinationExists, false);
  assert.equal(scope.relative(archiveDryRun.archivePath), "bundle-backup.zip");
  assert.equal(archiveDryRun.counts.ready, 1);

  service.archivePaths({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup",
  });

  const archivePath = path.join(config.projectRoot, "bundle-backup.zip");
  assert.equal(fs.existsSync(archivePath), true);
  const archiveConflictDryRun = service.dryRunArchive({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup.zip",
  });
  assert.equal(archiveConflictDryRun.destinationExists, true);
  assert.throws(() =>
    service.archivePaths({
      rootId: FILESYSTEM_ROOT_ID,
      directoryPath: "",
      paths: ["bundle"],
      name: "bundle-backup.zip",
    }),
  );

  fs.mkdirSync(path.join(config.projectRoot, "restore"), { recursive: true });
  service.unarchiveFile({
    rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
    paths: ["bundle"],
    name: "bundle-download",
  });
  assert.equal(fs.existsSync(download.archivePath), true);
  assert.equal(download.fileName, "bundle-download.zip");
  fs.rmSync(download.cleanupDir, { recursive: true, force: true });

  service.archivePaths({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup.tar.gz",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "bundle-backup.tar.gz")), true);

  fs.mkdirSync(path.join(config.projectRoot, "restore-tar"), { recursive: true });
  service.unarchiveFile({
    rootId: FILESYSTEM_ROOT_ID,
    archivePath: "bundle-backup.tar.gz",
    directoryPath: "restore-tar",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore-tar", "bundle", "nested", "b.txt"), "utf8"),
    /beta/,
  );

  fs.mkdirSync(path.join(config.projectRoot, "restore-explicit"), { recursive: true });
  service.unarchiveFile({
    rootId: FILESYSTEM_ROOT_ID,
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
      rootId: FILESYSTEM_ROOT_ID,
      archivePath: "bundle-backup.zip",
      directoryPath: "restore",
      conflictPolicy: "fail",
    }),
  );
  const blockedExtract = service.dryRunUnarchive({
    rootId: FILESYSTEM_ROOT_ID,
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "fail",
  });
  assert.equal(blockedExtract.counts.conflicts >= 1, true);
  assert.equal(blockedExtract.items.some((item) => item.status === "conflict"), true);
  const overwriteExtract = service.dryRunUnarchive({
    rootId: FILESYSTEM_ROOT_ID,
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "overwrite",
  });
  assert.equal(overwriteExtract.counts.overwrite >= 1, true);
  assert.throws(() =>
    service.unarchiveFile({
      rootId: FILESYSTEM_ROOT_ID,
      archivePath: "bundle-backup.zip",
      directoryPath: "restore",
      conflictPolicy: "overwrite",
    }),
  );
  service.unarchiveFile({
    rootId: FILESYSTEM_ROOT_ID,
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
    rootId: FILESYSTEM_ROOT_ID,
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "rename",
  });
  assert.equal(renamedExtract.counts.rename >= 1, true);
  assert.equal(renamedExtract.items.some((item) => item.destinationPath?.endsWith("a (1).txt")), true);
  service.unarchiveFile({
    rootId: FILESYSTEM_ROOT_ID,
    archivePath: "bundle-backup.zip",
    directoryPath: "restore",
    conflictPolicy: "rename",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore", "bundle", "a (1).txt"), "utf8"),
    /alpha/,
  );

  service.archivePaths({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup.tar.xz",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "bundle-backup.tar.xz")), true);

  fs.mkdirSync(path.join(config.projectRoot, "restore-xz"), { recursive: true });
  service.unarchiveFile({
    rootId: FILESYSTEM_ROOT_ID,
    archivePath: "bundle-backup.tar.xz",
    directoryPath: "restore-xz",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore-xz", "bundle", "nested", "b.txt"), "utf8"),
    /beta/,
  );

  service.archivePaths({
    rootId: FILESYSTEM_ROOT_ID,
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup.tbz",
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "bundle-backup.tbz")), true);

  fs.mkdirSync(path.join(config.projectRoot, "restore-tbz"), { recursive: true });
  service.unarchiveFile({
    rootId: FILESYSTEM_ROOT_ID,
    archivePath: "bundle-backup.tbz",
    directoryPath: "restore-tbz",
  });
  assert.match(
    fs.readFileSync(path.join(config.projectRoot, "restore-tbz", "bundle", "a.txt"), "utf8"),
    /alpha/,
  );
});

test(
  "files archive list, preflight, and extract use a PATH-resolved Windows python.cmd fallback",
  { skip: process.platform !== "win32" },
  () => {
    const root = makeTempRoot();
    const config = makeConfig(root);
    writeFile(path.join(config.projectRoot, "bundle", "nested", "note.txt"), "portable\n");

    withPythonOnlyPath(root, () => {
      const { service } = createTempScopedFilesService(config);
      for (const archiveName of ["portable.zip", "portable.tar.gz"]) {
        const archivePayload = {
          rootId: FILESYSTEM_ROOT_ID,
          directoryPath: "",
          paths: ["bundle"],
          name: archiveName,
        };
        const archivePreflight = service.dryRunArchive(archivePayload);
        assert.equal(archivePreflight.counts.errors, 0, JSON.stringify(archivePreflight.items));
        assert.equal(archivePreflight.destinationExists, false);
        service.archivePaths(archivePayload);

        const destinationDirectoryPath = `restore-${archiveName.replaceAll(".", "-")}`;
        fs.mkdirSync(path.join(config.projectRoot, destinationDirectoryPath), { recursive: true });
        const preflight = service.dryRunUnarchive({
          rootId: FILESYSTEM_ROOT_ID,
          archivePath: archiveName,
          directoryPath: destinationDirectoryPath,
        });
        assert.equal(preflight.counts.errors, 0);
        assert.equal(preflight.items.some((entry) => entry.entryPath.endsWith("note.txt")), true);

        service.unarchiveFile({
          rootId: FILESYSTEM_ROOT_ID,
          archivePath: archiveName,
          directoryPath: destinationDirectoryPath,
        });
        assert.equal(
          fs.readFileSync(
            path.join(config.projectRoot, destinationDirectoryPath, "bundle", "nested", "note.txt"),
            "utf8",
          ),
          "portable\n",
        );
      }
    });
  },
);

test("files service rejects zip entries that escape the extraction directory", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service, scope } = createTempScopedFilesService(config);
  const archivePath = path.join(config.projectRoot, "unsafe.zip");
  const restorePath = path.join(config.projectRoot, "restore");
  const escapedPath = path.join(config.projectRoot, "restore-evil", "escape.txt");

  fs.mkdirSync(restorePath, { recursive: true });
  writeZipEntry(archivePath, "../restore-evil/escape.txt", "escaped\n");

  const dryRun = service.dryRunUnarchive({
    rootId: FILESYSTEM_ROOT_ID,
    archivePath: "unsafe.zip",
    directoryPath: "restore",
  });
  assert.equal(dryRun.counts.errors, 1);
  assert.match(dryRun.items[0].message || "", /escapes|Path escapes|逃逸/i);

  assert.throws(() =>
    service.unarchiveFile({
      rootId: FILESYSTEM_ROOT_ID,
      archivePath: "unsafe.zip",
      directoryPath: "restore",
    }),
  );
  assert.equal(fs.existsSync(escapedPath), false);
});
test("files service rejects tar entries that escape the extraction directory", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  const { service, scope } = createTempScopedFilesService(config);
  const archivePath = path.join(config.projectRoot, "unsafe.tar.gz");
  const restorePath = path.join(config.projectRoot, "restore");
  const escapedPath = path.join(config.projectRoot, "restore-evil", "escape.txt");

  fs.mkdirSync(restorePath, { recursive: true });
  writeTarGzEntry(archivePath, "../restore-evil/escape.txt", "escaped\n");

  assert.throws(() =>
    service.unarchiveFile({
      rootId: FILESYSTEM_ROOT_ID,
      archivePath: "unsafe.tar.gz",
      directoryPath: "restore",
    }),
  );
  assert.equal(fs.existsSync(escapedPath), false);
});
