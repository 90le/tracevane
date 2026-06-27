export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit += 1;
  }
  return `${next >= 10 || unit === 0 ? next.toFixed(0) : next.toFixed(1)} ${units[unit]}`;
}

export function estimateRemaining(
  total: number,
  loaded: number,
  speed: number,
): string {
  if (!speed || loaded >= total) return "--";
  const seconds = Math.ceil((total - loaded) / speed);
  if (seconds < 60) return `${seconds}秒`;
  return `${Math.ceil(seconds / 60)}分钟`;
}
