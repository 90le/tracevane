import fs from "node:fs";
import path from "node:path";

import { isWithinRoot } from "./goWorkspace.js";

export type RustWorkspaceMarkerKind = "Cargo.toml" | "rust-project.json";

export interface RustWorkspaceMarker {
  kind: RustWorkspaceMarkerKind;
  absolutePath: string;
  directory: string;
}

const IGNORED_RUST_WORKSPACE_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".tracevane-trash",
]);

export function findRustWorkspaceMarker(rootRealPath: string, absoluteFilePath: string): RustWorkspaceMarker | null {
  const root = path.resolve(rootRealPath);
  const file = path.resolve(absoluteFilePath);
  if (!isWithinRoot(root, file)) return null;
  const relativeSegments = path.relative(root, file).split(path.sep).filter(Boolean);
  if (relativeSegments.some((segment) => IGNORED_RUST_WORKSPACE_SEGMENTS.has(segment))) return null;

  let current = fs.statSync(file).isDirectory() ? file : path.dirname(file);
  let nearestRustProject: RustWorkspaceMarker | null = null;
  while (isWithinRoot(root, current)) {
    const cargoToml = path.join(current, "Cargo.toml");
    if (fs.existsSync(cargoToml) && fs.statSync(cargoToml).isFile()) {
      return { kind: "Cargo.toml", absolutePath: cargoToml, directory: current };
    }
    const rustProject = path.join(current, "rust-project.json");
    if (!nearestRustProject && fs.existsSync(rustProject) && fs.statSync(rustProject).isFile()) {
      nearestRustProject = { kind: "rust-project.json", absolutePath: rustProject, directory: current };
    }
    if (current === root) break;
    current = path.dirname(current);
  }
  return nearestRustProject;
}
