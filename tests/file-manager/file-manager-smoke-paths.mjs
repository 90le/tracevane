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

  const relativeHome = path.relative(
    path.resolve(root.absolutePath),
    path.resolve(os.homedir()),
  );
  if (path.isAbsolute(relativeHome) || relativeHome === '..' || relativeHome.startsWith(`..${path.sep}`)) {
    throw new Error(`User home is outside the selected file-manager root: ${os.homedir()}`);
  }

  const homePath = portablePath(relativeHome);
  const directoryName = portablePath(uniqueName);
  return {
    root,
    rootId,
    directoryPath: homePath ? `${homePath}/${directoryName}` : directoryName,
  };
}
