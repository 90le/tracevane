import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-files-service-"));
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
  writeFile(path.join(config.projectRoot, "README.md"), "# Studio\n");
  fs.mkdirSync(path.join(config.projectRoot, "assets"), { recursive: true });
  writeFile(path.join(config.openclawRoot, "workspace", "notes.md"), "workspace notes\n");

  const service = createFilesService(config);
  const summary = service.getSummary();
  const projectListing = service.listDirectory("project-root", "", true);

  assert.equal(summary.defaultRootId, "openclaw-root");
  assert.equal(summary.roots.some((rootEntry) => rootEntry.id === "project-root"), true);
  assert.equal(summary.roots.some((rootEntry) => rootEntry.id === "openclaw-root"), true);
  assert.equal(summary.roots.some((rootEntry) => rootEntry.id === "home-root"), true);
  assert.equal(summary.roots.some((rootEntry) => rootEntry.id === "system-root"), true);
  assert.equal(projectListing.entries.some((entry) => entry.name === "README.md"), true);
  assert.equal(projectListing.entries.some((entry) => entry.name === "src" && entry.kind === "directory"), true);
  assert.equal(projectListing.entries[0].kind, "directory");
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

  const contentSearch = service.search("project-root", "", "needle", true, true);
  assert.equal(contentSearch.results[0].path, "docs/content-only.txt");
  assert.equal(contentSearch.results[0].matchKind, "content");
  assert.match(contentSearch.results[0].snippet || "", /needle/);

  const read = service.readFile("project-root", "docs/guide.md");
  assert.equal(read.editable, true);
  assert.match(read.content || "", /hello world/);

  service.writeFile({
    rootId: "project-root",
    path: "docs/guide.md",
    content: "updated body\n",
  });
  assert.match(fs.readFileSync(path.join(config.projectRoot, "docs", "guide.md"), "utf8"), /updated body/);

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

  service.deletePaths({
    rootId: "project-root",
    paths: ["docs/archive"],
  });
  assert.equal(fs.existsSync(path.join(config.projectRoot, "docs", "archive")), false);
});

test("files service exposes tree nodes and download payloads", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "src", "nested", "child.ts"), "export const child = true;\n");
  fs.mkdirSync(path.join(config.projectRoot, "src", "nested", "deeper"), { recursive: true });
  const service = createFilesService(config);

  const browse = service.listDirectory("project-root", "src", true);
  const tree = service.listTree("project-root", "src", true);
  const download = service.getDownloadFile("project-root", "src/nested/child.ts");
  const nestedBrowseEntry = browse.entries.find((item) => item.path === "src/nested");
  const nestedTreeEntry = tree.children.find((item) => item.path === "src/nested");

  assert.equal(nestedBrowseEntry?.kind, "directory");
  assert.equal(nestedTreeEntry?.name, "nested");
  assert.equal(Object.hasOwn(nestedBrowseEntry ?? {}, "childDirectoryCount"), false);
  assert.equal(Object.hasOwn(nestedTreeEntry ?? {}, "childDirectoryCount"), false);
  assert.equal(download.fileName, "child.ts");
  assert.match(download.mimeType, /text|typescript|javascript|application/);
});

test("files service can archive and unarchive zip bundles", () => {
  const root = makeTempRoot();
  const config = makeConfig(root);
  writeFile(path.join(config.projectRoot, "bundle", "a.txt"), "alpha\n");
  writeFile(path.join(config.projectRoot, "bundle", "nested", "b.txt"), "beta\n");
  const service = createFilesService(config);

  service.archivePaths({
    rootId: "project-root",
    directoryPath: "",
    paths: ["bundle"],
    name: "bundle-backup",
  });

  const archivePath = path.join(config.projectRoot, "bundle-backup.zip");
  assert.equal(fs.existsSync(archivePath), true);

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

  assert.throws(() =>
    service.unarchiveFile({
      rootId: "project-root",
      archivePath: "unsafe.zip",
      directoryPath: "restore",
    }),
  );
  assert.equal(fs.existsSync(escapedPath), false);
});
