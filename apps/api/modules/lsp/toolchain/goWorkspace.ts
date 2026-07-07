import fs from "node:fs";
import path from "node:path";

export type GoWorkspaceMarkerKind = "go.work" | "go.mod";

export interface GoWorkspaceMarker {
  kind: GoWorkspaceMarkerKind;
  absolutePath: string;
  directory: string;
}

const IGNORED_GO_WORKSPACE_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".tracevane-trash",
]);

export function findGoWorkspaceMarker(rootRealPath: string, absoluteFilePath: string): GoWorkspaceMarker | null {
  const root = path.resolve(rootRealPath);
  const file = path.resolve(absoluteFilePath);
  if (!isWithinRoot(root, file)) return null;
  const relativeSegments = path.relative(root, file).split(path.sep).filter(Boolean);
  if (relativeSegments.some((segment) => IGNORED_GO_WORKSPACE_SEGMENTS.has(segment))) return null;

  let current = fs.statSync(file).isDirectory() ? file : path.dirname(file);
  let nearestGoMod: GoWorkspaceMarker | null = null;
  while (isWithinRoot(root, current)) {
    const goWork = path.join(current, "go.work");
    if (fs.existsSync(goWork) && fs.statSync(goWork).isFile()) {
      return { kind: "go.work", absolutePath: goWork, directory: current };
    }
    const goMod = path.join(current, "go.mod");
    if (!nearestGoMod && fs.existsSync(goMod) && fs.statSync(goMod).isFile()) {
      nearestGoMod = { kind: "go.mod", absolutePath: goMod, directory: current };
    }
    if (current === root) break;
    current = path.dirname(current);
  }
  return nearestGoMod;
}

export function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}
