function normalizeCommandText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const STUDIO_HOST_MANAGEMENT_COMMAND_PATTERNS: RegExp[] = [
  /\bopenclaw(?:-gateway)?\b/i,
  /\bsystemctl\b/i,
  /\bservice\b/i,
  /\blaunchctl\b/i,
  /\b(?:pkill|killall)\b/i,
  /\bkill\b(?:\s+-\S+)?\s+\d+\b/i,
];

export function isStudioHostManagementCommandText(command: unknown): boolean {
  const normalized = normalizeCommandText(command);
  if (!normalized) {
    return false;
  }
  return STUDIO_HOST_MANAGEMENT_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
}
