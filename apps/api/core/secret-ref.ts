import fs from "node:fs";

export type OpenClawSecretRef = {
  source: "env" | "file" | "exec";
  provider: string;
  id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isOpenClawSecretRef(value: unknown): value is OpenClawSecretRef {
  if (!isRecord(value)) return false;
  if (Object.keys(value).length !== 3) return false;
  return (
    (value.source === "env" || value.source === "file" || value.source === "exec")
    && typeof value.provider === "string"
    && value.provider.trim().length > 0
    && typeof value.id === "string"
    && value.id.trim().length > 0
  );
}

function parseEnvSecretTemplate(value: unknown): OpenClawSecretRef | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(trimmed)
    || /^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
  if (!match) return null;
  return { source: "env", provider: "default", id: match[1] };
}

export function coerceOpenClawSecretRef(value: unknown): OpenClawSecretRef | null {
  if (isOpenClawSecretRef(value)) return value;
  if (isRecord(value)
    && (value.source === "env" || value.source === "file" || value.source === "exec")
    && typeof value.id === "string"
    && value.id.trim()) {
    return {
      source: value.source,
      provider: typeof value.provider === "string" && value.provider.trim()
        ? value.provider.trim()
        : "default",
      id: value.id.trim(),
    };
  }
  return parseEnvSecretTemplate(value);
}

export function cloneOpenClawSecretRef(value: unknown): OpenClawSecretRef | null {
  const ref = coerceOpenClawSecretRef(value);
  if (!ref) return null;
  return {
    source: ref.source,
    provider: ref.provider.trim(),
    id: ref.id.trim(),
  };
}

export function hasConfiguredSecretInput(value: unknown): boolean {
  if (typeof value === "string" && value.trim()) return true;
  return coerceOpenClawSecretRef(value) !== null;
}

function readJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined;
  let current = root;
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveFileSecretRef(
  openclawConfig: Record<string, unknown>,
  ref: OpenClawSecretRef,
): string {
  const provider = isRecord(openclawConfig.secrets)
    && isRecord(openclawConfig.secrets.providers)
    ? openclawConfig.secrets.providers[ref.provider]
    : null;
  if (!isRecord(provider)) return "";
  if (provider.source !== "file") return "";
  const filePath = typeof provider.path === "string" ? provider.path.trim() : "";
  if (!filePath) return "";
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const value = provider.mode === "json"
      ? readJsonPointer(JSON.parse(raw), ref.id)
      : raw;
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readEnvFileValue(filePath: string | undefined, key: string): string {
  if (!filePath) return "";
  try {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const name = trimmed.slice(0, separator).trim();
      if (name !== key) continue;
      return unquoteEnvValue(trimmed.slice(separator + 1));
    }
  } catch {
    return "";
  }
  return "";
}

export function resolveSecretInputString(
  openclawConfig: Record<string, unknown>,
  value: unknown,
  options: { envFilePath?: string } = {},
): string {
  if (typeof value === "string") {
    const ref = coerceOpenClawSecretRef(value);
    if (ref) return resolveSecretInputString(openclawConfig, ref, options);
    return value.trim();
  }
  const ref = coerceOpenClawSecretRef(value);
  if (!ref) return "";
  if (ref.source === "env") {
    return (process.env[ref.id] || readEnvFileValue(options.envFilePath, ref.id)).trim();
  }
  if (ref.source === "file") return resolveFileSecretRef(openclawConfig, ref);
  return "";
}
