import fs from 'node:fs';
import path from 'node:path';

export function resolveProjectRoot(startDir: string = process.cwd()): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    const pluginManifestPath = path.join(currentDir, 'openclaw.plugin.json');

    if (fs.existsSync(packageJsonPath) && fs.existsSync(pluginManifestPath)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }

    currentDir = parentDir;
  }
}
