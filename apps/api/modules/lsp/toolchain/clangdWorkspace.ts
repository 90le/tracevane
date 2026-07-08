import fs from "node:fs";
import path from "node:path";

import { isWithinRoot } from "./goWorkspace.js";

export type ClangdWorkspaceMarkerKind = "compile_commands.json" | "compile_flags.txt" | ".clangd";

export interface ClangdWorkspaceMarker {
  kind: ClangdWorkspaceMarkerKind;
  absolutePath: string;
  directory: string;
}

const IGNORED_CLANGD_WORKSPACE_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".tracevane-trash",
]);

export function findClangdWorkspaceMarker(rootRealPath: string, absoluteFilePath: string): ClangdWorkspaceMarker | null {
  const root = path.resolve(rootRealPath);
  const file = path.resolve(absoluteFilePath);
  if (!isWithinRoot(root, file)) return null;
  const relativeSegments = path.relative(root, file).split(path.sep).filter(Boolean);
  if (relativeSegments.some((segment) => IGNORED_CLANGD_WORKSPACE_SEGMENTS.has(segment))) return null;

  let current = fs.statSync(file).isDirectory() ? file : path.dirname(file);
  let nearestCompileFlags: ClangdWorkspaceMarker | null = null;
  let nearestClangdConfig: ClangdWorkspaceMarker | null = null;
  while (isWithinRoot(root, current)) {
    const compileCommands = path.join(current, "compile_commands.json");
    if (fs.existsSync(compileCommands) && fs.statSync(compileCommands).isFile()) {
      return { kind: "compile_commands.json", absolutePath: compileCommands, directory: current };
    }
    const compileFlags = path.join(current, "compile_flags.txt");
    if (!nearestCompileFlags && fs.existsSync(compileFlags) && fs.statSync(compileFlags).isFile()) {
      nearestCompileFlags = { kind: "compile_flags.txt", absolutePath: compileFlags, directory: current };
    }
    const clangdConfig = path.join(current, ".clangd");
    if (!nearestClangdConfig && fs.existsSync(clangdConfig) && fs.statSync(clangdConfig).isFile()) {
      nearestClangdConfig = { kind: ".clangd", absolutePath: clangdConfig, directory: current };
    }
    if (current === root) break;
    current = path.dirname(current);
  }
  return nearestCompileFlags ?? nearestClangdConfig;
}
