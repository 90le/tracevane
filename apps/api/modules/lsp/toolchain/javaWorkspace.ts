import fs from "node:fs";
import path from "node:path";

import { isWithinRoot } from "./goWorkspace.js";

export type JavaWorkspaceMarkerKind = "pom.xml" | "build.gradle" | "build.gradle.kts" | "settings.gradle" | "settings.gradle.kts" | ".project";

export interface JavaWorkspaceMarker {
  kind: JavaWorkspaceMarkerKind;
  absolutePath: string;
  directory: string;
}

const IGNORED_JAVA_WORKSPACE_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".tracevane-trash",
]);

const PRIMARY_MARKERS: JavaWorkspaceMarkerKind[] = ["pom.xml"];
const GRADLE_MARKERS: JavaWorkspaceMarkerKind[] = ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"];
const ECLIPSE_MARKERS: JavaWorkspaceMarkerKind[] = [".project"];

export function findJavaWorkspaceMarker(rootRealPath: string, absoluteFilePath: string): JavaWorkspaceMarker | null {
  const root = path.resolve(rootRealPath);
  const file = path.resolve(absoluteFilePath);
  if (!isWithinRoot(root, file)) return null;
  const relativeSegments = path.relative(root, file).split(path.sep).filter(Boolean);
  if (relativeSegments.some((segment) => IGNORED_JAVA_WORKSPACE_SEGMENTS.has(segment))) return null;

  let current = fs.statSync(file).isDirectory() ? file : path.dirname(file);
  let nearestGradle: JavaWorkspaceMarker | null = null;
  let nearestEclipse: JavaWorkspaceMarker | null = null;
  while (isWithinRoot(root, current)) {
    const primary = findFirstMarker(current, PRIMARY_MARKERS);
    if (primary) return primary;

    if (!nearestGradle) nearestGradle = findFirstMarker(current, GRADLE_MARKERS);
    if (!nearestEclipse) nearestEclipse = findFirstMarker(current, ECLIPSE_MARKERS);

    if (current === root) break;
    current = path.dirname(current);
  }
  return nearestGradle ?? nearestEclipse;
}

function findFirstMarker(directory: string, kinds: JavaWorkspaceMarkerKind[]): JavaWorkspaceMarker | null {
  for (const kind of kinds) {
    const absolutePath = path.join(directory, kind);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      return { kind, absolutePath, directory };
    }
  }
  return null;
}
