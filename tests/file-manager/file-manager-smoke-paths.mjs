import os from 'node:os';
import path from 'node:path';

function portablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

export function resolveWritableSmokeDirectory(summary, uniqueName) {
  const rootId = summary?.defaultRootId ?? summary?.roots?.[0]?.id;
  const root = summary?.roots?.find((item) => item.id === rootId) ?? summary?.roots?.[0];
  if (!rootId || !root?.absolutePath) {
    throw new Error('No file-manager root is available');
  }

  const rootPath = path.resolve(root.absolutePath);
  const basePath = [
    process.env.TRACEVANE_SMOKE_TEMP_DIR,
    os.homedir(),
  ].find((candidate) => {
    if (!candidate) return false;
    const relative = path.relative(rootPath, path.resolve(candidate));
    return !path.isAbsolute(relative)
      && relative !== '..'
      && !relative.startsWith(`..${path.sep}`);
  });
  if (!basePath) {
    throw new Error(`No writable smoke directory is inside the selected file-manager root: ${root.absolutePath}`);
  }

  const relativeBase = portablePath(path.relative(rootPath, path.resolve(basePath)));
  const directoryName = portablePath(uniqueName);
  return {
    root,
    rootId,
    directoryPath: relativeBase ? `${relativeBase}/${directoryName}` : directoryName,
  };
}
