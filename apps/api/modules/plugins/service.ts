import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { StudioServerConfig } from "../../../../types/api.js";
import type {
  PluginDiagnostic,
  PluginEntrySummary,
  PluginActionResponse,
  PluginBulkActionResponse,
  PluginBulkTogglePayload,
  PluginBulkToggleResponse,
  PluginBulkUninstallPayload,
  PluginBulkUpdatePayload,
  PluginInstallPayload,
  PluginImpactPreview,
  PluginManifestSummary,
  PluginPreflightPayload,
  PluginPreflightResult,
  PluginToggleResponse,
  PluginUninstallPayload,
  PluginUpdatePayload,
  PluginUploadArchivePayload,
  PluginUploadInstallPayload,
  PluginUploadInstallResponse,
  PluginUploadPreflightPayload,
  PluginUploadPreflightResult,
  PluginsSummaryPayload,
} from "../../../../types/plugins.js";
import { readOpenClawConfig, writeJsonFile } from "../../core/state.js";

const execFileAsync = promisify(execFile);
const UPLOAD_PLUGIN_ARCHIVE_MAX_BYTES = 32 * 1024 * 1024;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactConfig(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value).filter(([key]) => {
    const normalized = key.toLowerCase();
    return !normalized.includes("token") && !normalized.includes("secret") && !normalized.includes("password");
  });
  return entries.length ? Object.fromEntries(entries) : null;
}

function safeReadJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function collectManifestFiles(root: string, depth = 3): string[] {
  const results: string[] = [];
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot)) return results;

  function walk(current: string, remainingDepth: number): void {
    if (remainingDepth < 0) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isFile() && entry.name === "openclaw.plugin.json") {
        results.push(absolute);
      } else if (entry.isDirectory()) {
        walk(absolute, remainingDepth - 1);
      }
    }
  }

  walk(resolvedRoot, depth);
  return results;
}

function manifestFromFile(filePath: string): PluginManifestSummary | null {
  const raw = safeReadJson(filePath);
  if (!raw) return null;
  const id = normalizeString(raw.id);
  if (!id) return null;
  return {
    id,
    name: normalizeString(raw.name) || id,
    description: normalizeString(raw.description),
    kind: normalizeString(raw.kind),
    path: filePath,
    version: normalizeString(raw.version),
    skillPaths: normalizeStringList(raw.skills),
    capabilities: deriveManifestCapabilities(raw),
    configSchema: isRecord(raw.configSchema) ? raw.configSchema : null,
    uiHints: isRecord(raw.uiHints)
      ? Object.fromEntries(
          Object.entries(raw.uiHints).filter(([, value]) => isRecord(value)),
        ) as Record<string, Record<string, unknown>>
      : null,
  };
}

function deriveManifestCapabilities(raw: Record<string, unknown>): string[] {
  const caps = new Set<string>();
  const kind = normalizeString(raw.kind);
  if (kind) caps.add(kind);
  if (Array.isArray(raw.skills) && raw.skills.length) caps.add("skills");
  if (isRecord(raw.configSchema)) caps.add("config");
  if (isRecord(raw.uiHints)) caps.add("ui-hints");
  const id = normalizeString(raw.id);
  if (/discord|telegram|slack|matrix|irc|signal|whatsapp|channel/i.test(id)) caps.add("channel");
  if (/openai|anthropic|google|qwen|deepseek|provider|model/i.test(id)) caps.add("provider");
  if (/memory|dream/i.test(id) || kind === "memory") caps.add("memory");
  if (/acp|acpx/i.test(id)) caps.add("acp");
  if (/browser/i.test(id)) caps.add("browser");
  if (/studio/i.test(id)) caps.add("studio");
  return Array.from(caps).sort();
}

function discoverPluginManifests(config: StudioServerConfig, loadPaths: string[]): PluginManifestSummary[] {
  const roots = [
    ...loadPaths,
    path.join(config.openclawRoot, "bundled-plugins-copy"),
    path.join(config.openclawRoot, "extensions"),
  ];
  const byId = new Map<string, PluginManifestSummary>();
  for (const root of roots) {
    for (const file of collectManifestFiles(root)) {
      const manifest = manifestFromFile(file);
      if (!manifest || byId.has(manifest.id)) continue;
      byId.set(manifest.id, manifest);
    }
  }
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function buildDiagnostics(input: {
  enabled: boolean;
  allow: string[];
  deny: string[];
  loadPaths: string[];
  entries: PluginEntrySummary[];
  manifests: PluginManifestSummary[];
  slots: PluginsSummaryPayload["slots"];
}): PluginDiagnostic[] {
  const diagnostics: PluginDiagnostic[] = [];
  const manifestIds = new Set(input.manifests.map((manifest) => manifest.id));
  const entryIds = new Set(input.entries.map((entry) => entry.id));
  const critical = new Set(["studio", "memory-core", "acpx", "browser", "openai"]);

  if (!input.enabled) {
    diagnostics.push({
      key: "plugins-disabled",
      level: "danger",
      title: "Plugin system disabled",
      detail: "Host plugin loading is disabled; runtime capabilities may be unavailable.",
    });
  }
  for (const loadPath of input.loadPaths) {
    if (!path.isAbsolute(loadPath) || !fs.existsSync(loadPath)) {
      diagnostics.push({
        key: `load-path-${loadPath}`,
        level: "warn",
        title: "Invalid load path",
        detail: loadPath,
      });
    }
  }
  for (const id of input.allow) {
    if (!manifestIds.has(id) && !entryIds.has(id)) {
      diagnostics.push({
        key: `allow-missing-${id}`,
        level: "warn",
        title: "Allowlist plugin not discovered",
        detail: id,
      });
    }
  }
  for (const id of input.deny) {
    if (input.allow.includes(id)) {
      diagnostics.push({
        key: `allow-deny-${id}`,
        level: "danger",
        title: "Allow/Deny conflict",
        detail: id,
      });
    }
  }
  for (const id of Object.values(input.slots || {})) {
    const normalized = normalizeString(id);
    if (normalized && normalized !== "none" && !manifestIds.has(normalized) && !entryIds.has(normalized)) {
      diagnostics.push({
        key: `slot-missing-${normalized}`,
        level: "warn",
        title: "Slot plugin not discovered",
        detail: normalized,
      });
    }
  }
  for (const entry of input.entries) {
    if (critical.has(entry.id) && !entry.enabled) {
      diagnostics.push({
        key: `critical-disabled-${entry.id}`,
        level: "danger",
        title: "Critical plugin disabled",
        detail: entry.id,
      });
    }
  }
  if (!diagnostics.length) {
    diagnostics.push({
      key: "restart-hint",
      level: "info",
      title: "Restart may be required",
      detail: "Plugin load path, allowlist, and enablement changes usually apply after host restart.",
    });
  }
  return diagnostics;
}

function buildCapabilityIndex(entries: PluginEntrySummary[], manifests: PluginManifestSummary[]): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const item of [...entries, ...manifests.map((manifest) => ({
    id: manifest.id,
    capabilities: manifest.capabilities,
  }))]) {
    for (const capability of item.capabilities || []) {
      index[capability] = Array.from(new Set([...(index[capability] || []), item.id])).sort();
    }
  }
  return Object.fromEntries(Object.entries(index).sort(([left], [right]) => left.localeCompare(right)));
}

const CRITICAL_PLUGIN_IDS = new Set(["studio", "memory-core", "acpx", "browser", "openai"]);

function buildImpactPreview(id: string, capabilities: string[]): PluginImpactPreview[] {
  const impacts: PluginImpactPreview[] = [];
  if (CRITICAL_PLUGIN_IDS.has(id)) {
    impacts.push({
      key: `critical-${id}`,
      title: "Critical runtime capability",
      detail: `${id} is considered critical in Studio. Disabling it can break host features and usually requires restart.`,
    });
  }
  if (capabilities.includes("memory")) {
    impacts.push({
      key: `memory-${id}`,
      title: "Memory capability",
      detail: "May affect memory slots, Dreaming, and long-lived memory features.",
    });
  }
  if (capabilities.includes("acp")) {
    impacts.push({
      key: `acp-${id}`,
      title: "ACP runtime capability",
      detail: "May affect ACP-backed sessions, agent runtime dispatch, and CLI task execution.",
    });
  }
  if (capabilities.includes("channel")) {
    impacts.push({
      key: `channel-${id}`,
      title: "Channel capability",
      detail: "May affect message delivery, pairing, or channel account availability.",
    });
  }
  if (capabilities.includes("provider")) {
    impacts.push({
      key: `provider-${id}`,
      title: "Model provider capability",
      detail: "May affect provider-backed model resolution and request routing.",
    });
  }
  if (capabilities.includes("browser")) {
    impacts.push({
      key: `browser-${id}`,
      title: "Browser capability",
      detail: "May affect browser automation, CDP integration, or capture workflows.",
    });
  }
  if (capabilities.includes("studio")) {
    impacts.push({
      key: `studio-${id}`,
      title: "Studio capability",
      detail: "May affect the Studio control surface itself.",
    });
  }
  return impacts;
}

export interface PluginsService {
  getSummary(): PluginsSummaryPayload;
  preflightPlugin(payload: PluginPreflightPayload): Promise<PluginPreflightResult>;
  preflightUploadedPluginArchive(payload: PluginUploadPreflightPayload): Promise<PluginUploadPreflightResult>;
  togglePlugin(id: string, enabled: boolean): PluginToggleResponse;
  bulkTogglePlugins(payload: PluginBulkTogglePayload): PluginBulkToggleResponse;
  installUploadedPluginArchive(payload: PluginUploadInstallPayload): Promise<PluginUploadInstallResponse>;
  installPlugin(payload: PluginInstallPayload): Promise<PluginActionResponse>;
  updatePlugins(payload: PluginUpdatePayload): Promise<PluginActionResponse>;
  bulkUpdatePlugins(payload: PluginBulkUpdatePayload): Promise<PluginBulkActionResponse>;
  uninstallPlugin(payload: PluginUninstallPayload): Promise<PluginActionResponse>;
  bulkUninstallPlugins(payload: PluginBulkUninstallPayload): Promise<PluginBulkActionResponse>;
}

async function runOpenClawPluginCommand(
  config: StudioServerConfig,
  args: string[],
): Promise<string> {
  const result = await execFileAsync("openclaw", args, {
    cwd: config.openclawRoot,
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}

async function runSequentialPluginCommands(
  ids: string[],
  runner: (id: string) => Promise<void>,
): Promise<Array<{ id: string; error: string }>> {
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      await runner(id);
    } catch (error) {
      failures.push({
        id,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
  return failures;
}

function classifyPluginSpec(spec: string, marketplace: string | null | undefined): PluginPreflightResult["kind"] {
  if (marketplace || spec.startsWith("clawhub:")) return "marketplace";
  if (fs.existsSync(spec)) {
    const stat = fs.statSync(spec);
    if (stat.isDirectory()) return "directory";
    return "archive";
  }
  return "npm-spec";
}

async function extractPluginArchive(specPath: string): Promise<string> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-plugin-preflight-"));
  const extractDir = path.join(tmpDir, "extract");
  fs.mkdirSync(extractDir, { recursive: true });
  await execFileAsync(
    "python3",
    [
      "-c",
      `
import pathlib, sys, zipfile, tarfile
src = pathlib.Path(sys.argv[1])
dest = pathlib.Path(sys.argv[2])
name = src.name.lower()
if name.endswith('.zip'):
    with zipfile.ZipFile(src) as zf:
        for member in zf.infolist():
            p = pathlib.PurePosixPath(member.filename)
            if member.filename.startswith('/') or '..' in p.parts:
                raise SystemExit(f'unsafe archive entry: {member.filename}')
        zf.extractall(dest)
else:
    with tarfile.open(src) as tf:
        for member in tf.getmembers():
            p = pathlib.PurePosixPath(member.name)
            if member.name.startswith('/') or '..' in p.parts:
                raise SystemExit(f'unsafe archive entry: {member.name}')
        tf.extractall(dest)
`,
      specPath,
      extractDir,
    ],
    { timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
  );
  return extractDir;
}

function findUniquePluginManifest(root: string): { manifest: PluginManifestSummary | null; diagnostics: PluginDiagnostic[] } {
  const files = collectManifestFiles(root, 6);
  if (files.length === 0) {
    return {
      manifest: null,
      diagnostics: [{
        key: "missing-plugin-manifest",
        level: "danger",
        title: "Missing openclaw.plugin.json",
        detail: "The selected plugin source does not contain an openclaw.plugin.json manifest.",
      }],
    };
  }
  if (files.length > 1) {
    return {
      manifest: null,
      diagnostics: [{
        key: "multiple-plugin-manifests",
        level: "danger",
        title: "Multiple plugin manifests found",
        detail: `Found ${files.length} openclaw.plugin.json files. Install one plugin bundle at a time.`,
      }],
    };
  }
  const manifest = manifestFromFile(files[0]);
  if (!manifest) {
    return {
      manifest: null,
      diagnostics: [{
        key: "invalid-plugin-manifest",
        level: "danger",
        title: "Invalid plugin manifest",
        detail: files[0],
      }],
    };
  }
  const diagnostics: PluginDiagnostic[] = [];
  if (!manifest.configSchema) {
    diagnostics.push({
      key: `manifest-no-schema-${manifest.id}`,
      level: "info",
      title: "Manifest has no config schema",
      detail: "Studio can still install it, but guided config rendering will be limited.",
    });
  }
  if (!manifest.uiHints) {
    diagnostics.push({
      key: `manifest-no-uihints-${manifest.id}`,
      level: "info",
      title: "Manifest has no uiHints",
      detail: "Studio will fall back to generic labels for guided fields.",
    });
  }
  const manifestDir = path.dirname(manifest.path);
  if (!manifest.kind) {
    diagnostics.push({
      key: `manifest-no-kind-${manifest.id}`,
      level: "warn",
      title: "Manifest kind missing",
      detail: "Plugin kind is missing. Capability routing and UI summaries will be less precise.",
    });
  }
  if (!manifest.version) {
    diagnostics.push({
      key: `manifest-no-version-${manifest.id}`,
      level: "warn",
      title: "Manifest version missing",
      detail: "Version is missing. Update and install provenance will be harder to verify.",
    });
  }
  if (manifest.configSchema) {
    const schemaType = normalizeString((manifest.configSchema as Record<string, unknown>).type);
    if (schemaType && schemaType !== "object") {
      diagnostics.push({
        key: `manifest-schema-root-${manifest.id}`,
        level: "warn",
        title: "Config schema root is not an object",
        detail: "Studio guided config works best when configSchema.type is object.",
      });
    }
  }
  for (const skillPath of manifest.skillPaths) {
    const absolute = path.resolve(manifestDir, skillPath);
    if (!fs.existsSync(absolute)) {
      diagnostics.push({
        key: `manifest-missing-skill-path-${manifest.id}-${skillPath}`,
        level: "warn",
        title: "Declared skill path is missing",
        detail: `${skillPath} -> ${absolute}`,
      });
    }
  }
  const resolvedRoot = path.resolve(root);
  if (manifestDir !== resolvedRoot) {
    diagnostics.push({
      key: `manifest-nested-root-${manifest.id}`,
      level: "info",
      title: "Plugin root is nested inside the package",
      detail: manifestDir,
    });
  }
  return { manifest, diagnostics };
}

function decodeUploadedPluginArchive(payload: PluginUploadArchivePayload): Buffer {
  const fileName = normalizeString(payload.fileName);
  if (!fileName.toLowerCase().endsWith(".zip")) {
    throw new Error("Only .zip plugin archives are supported");
  }
  const rawBase64 = normalizeString(payload.dataBase64).replace(/^data:[^,]+,/, "");
  if (!rawBase64) throw new Error("Uploaded plugin archive is empty");
  const buffer = Buffer.from(rawBase64, "base64");
  if (!buffer.length) throw new Error("Uploaded plugin archive could not be decoded");
  if (buffer.length > UPLOAD_PLUGIN_ARCHIVE_MAX_BYTES) {
    throw new Error(`Uploaded plugin archive is too large; limit is ${UPLOAD_PLUGIN_ARCHIVE_MAX_BYTES / 1024 / 1024} MiB`);
  }
  return buffer;
}

async function withExtractedUploadedPluginArchive<T>(
  payload: PluginUploadArchivePayload,
  handler: (extractDir: string) => Promise<T>,
): Promise<T> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-studio-upload-plugin-"));
  const zipPath = path.join(tmpDir, "plugin.zip");
  let extractRoot: string | null = null;
  try {
    await fs.promises.writeFile(zipPath, decodeUploadedPluginArchive(payload));
    const extractDir = await extractPluginArchive(zipPath);
    extractRoot = path.dirname(extractDir);
    return await handler(extractDir);
  } finally {
    if (extractRoot) {
      fs.rmSync(extractRoot, { recursive: true, force: true });
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function createPluginsService(config: StudioServerConfig): PluginsService {
  return {
    getSummary(): PluginsSummaryPayload {
      const openclawConfig = readOpenClawConfig(config);
      const plugins = isRecord(openclawConfig.plugins) ? openclawConfig.plugins : {};
      const allow = normalizeStringList(plugins.allow);
      const deny = normalizeStringList(plugins.deny);
      const load = isRecord(plugins.load) ? plugins.load : {};
      const loadPaths = normalizeStringList(load.paths || plugins.loadPaths);
      const slots = isRecord(plugins.slots)
        ? {
            memory: normalizeString(plugins.slots.memory) || undefined,
            contextEngine: normalizeString(plugins.slots.contextEngine) || undefined,
          }
        : {};
      const manifests = discoverPluginManifests(config, loadPaths);
      const manifestById = new Map(manifests.map((manifest) => [manifest.id, manifest]));
      const configuredEntries = Object.entries(isRecord(plugins.entries) ? plugins.entries : {})
        .map(([id, entry]) => {
          const rawEntry = isRecord(entry) ? entry : {};
          const manifest = manifestById.get(id) || null;
          const blocked = deny.includes(id) || (allow.length > 0 && !allow.includes(id));
          const capabilities = manifest?.capabilities || [];
          return {
            id,
            enabled: rawEntry.enabled !== false,
            config: redactConfig(rawEntry.config),
            manifest,
            status: blocked
              ? "blocked"
              : rawEntry.enabled === false
                ? "disabled"
                : manifest
                  ? "enabled"
                  : "missing",
            source: "configured",
            capabilities,
            critical: CRITICAL_PLUGIN_IDS.has(id),
            impacts: buildImpactPreview(id, capabilities),
          } satisfies PluginEntrySummary;
        })
        .sort((left, right) => left.id.localeCompare(right.id));
      const configuredIds = new Set(configuredEntries.map((entry) => entry.id));
      const availableEntries = manifests
        .filter((manifest) => !configuredIds.has(manifest.id))
        .map((manifest) => ({
          id: manifest.id,
          enabled: false,
          config: null,
          manifest,
          status: deny.includes(manifest.id)
            ? "blocked"
            : allow.length > 0 && !allow.includes(manifest.id)
              ? "blocked"
              : "available",
          source: "manifest-only",
          capabilities: manifest.capabilities,
          critical: CRITICAL_PLUGIN_IDS.has(manifest.id),
          impacts: buildImpactPreview(manifest.id, manifest.capabilities),
        }) satisfies PluginEntrySummary);
      const entries = [...configuredEntries, ...availableEntries].sort((left, right) => left.id.localeCompare(right.id));
      const installs = Object.entries(isRecord(plugins.installs) ? plugins.installs : {})
        .map(([id, entry]) => {
          const rawInstall = isRecord(entry) ? entry : {};
          return {
            id,
            source: normalizeString(rawInstall.source) || undefined,
            spec: normalizeString(rawInstall.spec) || undefined,
            installPath: normalizeString(rawInstall.installPath) || undefined,
            version: normalizeString(rawInstall.version) || undefined,
            resolvedName: normalizeString(rawInstall.resolvedName) || undefined,
            resolvedVersion: normalizeString(rawInstall.resolvedVersion) || undefined,
            resolvedSpec: normalizeString(rawInstall.resolvedSpec) || undefined,
            installedAt: normalizeString(rawInstall.installedAt) || undefined,
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id));
      const enabled = plugins.enabled != null ? plugins.enabled !== false : true;
      const diagnostics = buildDiagnostics({ enabled, allow, deny, loadPaths, entries, manifests, slots });
      const capabilityIndex = buildCapabilityIndex(entries, manifests);

      return {
        checkedAt: new Date().toISOString(),
        enabled,
        allow,
        deny,
        loadPaths,
        slots,
        entries,
        manifests,
        installs,
        diagnostics,
        counts: {
          entries: configuredEntries.length,
          manifests: manifests.length,
          enabledEntries: configuredEntries.filter((entry) => entry.enabled && entry.status === "enabled").length,
          blocked: entries.filter((entry) => entry.status === "blocked").length,
          missing: entries.filter((entry) => entry.status === "missing").length,
          loadPaths: loadPaths.length,
          diagnostics: diagnostics.length,
        },
        capabilityIndex,
      };
    },

    async preflightPlugin(payload: PluginPreflightPayload): Promise<PluginPreflightResult> {
      const spec = normalizeString(payload.spec);
      if (!spec) throw new Error("Plugin preflight spec is required");
      const kind = classifyPluginSpec(spec, payload.marketplace);

      if (kind === "npm-spec" || kind === "marketplace") {
        return {
          checkedAt: new Date().toISOString(),
          spec,
          kind,
          level: "warn",
          readiness: "review",
          summary: kind === "marketplace"
            ? "Remote marketplace installs still rely on official OpenClaw install-time safety checks. Studio can validate syntax, but not fetch-and-verify the final artifact yet."
            : "NPM specs still rely on official OpenClaw install-time safety checks. Studio can validate syntax, but not fully inspect the remote package before install yet.",
          manifest: null,
          manifestCount: 0,
          pluginRoot: null,
          manifestPath: null,
          requiresRestart: true,
          indicators: [
            {
              key: `remote-preflight-${kind}`,
              level: "warn",
              title: "Remote install preflight is limited",
              detail: spec,
            },
          ],
        };
      }

      const cleanupPaths: string[] = [];
      try {
        const root = kind === "directory" ? spec : await extractPluginArchive(spec);
        if (kind === "archive") cleanupPaths.push(path.dirname(root));
        const { manifest, diagnostics } = findUniquePluginManifest(root);
        const manifestCount = collectManifestFiles(root, 6).length;
        const hasDanger = diagnostics.some((item) => item.level === "danger");
        const hasWarn = diagnostics.some((item) => item.level === "warn");
        return {
          checkedAt: new Date().toISOString(),
          spec,
          kind,
          level: hasDanger ? "danger" : diagnostics.length ? "warn" : "info",
          readiness: hasDanger ? "blocked" : hasWarn ? "review" : "ready",
          summary: manifest
            ? `Found plugin ${manifest.id}${manifest.version ? ` v${manifest.version}` : ""}.`
            : "Plugin source failed manifest validation.",
          manifest,
          manifestCount,
          pluginRoot: manifest ? path.dirname(manifest.path) : null,
          manifestPath: manifest?.path || null,
          requiresRestart: true,
          indicators: diagnostics,
        };
      } finally {
        for (const entry of cleanupPaths) {
          fs.rmSync(entry, { recursive: true, force: true });
        }
      }
    },

    async preflightUploadedPluginArchive(payload: PluginUploadPreflightPayload): Promise<PluginUploadPreflightResult> {
      const fileName = normalizeString(payload.fileName);
      if (!fileName) throw new Error("Uploaded plugin file name is required");
      const preflight = await withExtractedUploadedPluginArchive(payload, async (extractDir) =>
        this.preflightPlugin({ spec: extractDir }),
      );
      return {
        checkedAt: new Date().toISOString(),
        fileName,
        preflight,
      };
    },

    togglePlugin(id: string, enabled: boolean): PluginToggleResponse {
      const pluginId = normalizeString(id);
      if (!pluginId) {
        throw new Error("Plugin id is required");
      }
      const openclawConfig = readOpenClawConfig(config);
      openclawConfig.plugins = isRecord(openclawConfig.plugins) ? openclawConfig.plugins : {};
      openclawConfig.plugins.entries = isRecord(openclawConfig.plugins.entries) ? openclawConfig.plugins.entries : {};
      const current = isRecord(openclawConfig.plugins.entries[pluginId]) ? openclawConfig.plugins.entries[pluginId] : {};
      openclawConfig.plugins.entries[pluginId] = {
        ...current,
        enabled,
      };
      writeJsonFile(config.openclawConfigFile, openclawConfig);
      const summary = this.getSummary();
      const entry = summary.entries.find((item) => item.id === pluginId);
      return {
        success: true,
        id: pluginId,
        enabled,
        critical: entry?.critical === true,
        impacts: entry?.impacts || buildImpactPreview(pluginId, entry?.capabilities || []),
        requiresRestart: true,
      };
    },

    bulkTogglePlugins(payload: PluginBulkTogglePayload): PluginBulkToggleResponse {
      const ids = Array.from(new Set((Array.isArray(payload.ids) ? payload.ids : []).map((id) => normalizeString(id))));
      if (!ids.length) {
        throw new Error("Plugin bulk toggle ids are required");
      }
      const enabled = payload.enabled !== false;
      const createMissingEntries = payload.createMissingEntries !== false;
      const currentSummary = this.getSummary();
      const byId = new Map(currentSummary.entries.map((entry) => [entry.id, entry]));
      const openclawConfig = readOpenClawConfig(config);
      openclawConfig.plugins = isRecord(openclawConfig.plugins) ? openclawConfig.plugins : {};
      openclawConfig.plugins.entries = isRecord(openclawConfig.plugins.entries) ? openclawConfig.plugins.entries : {};

      const updatedIds: string[] = [];
      const skipped: PluginBulkToggleResponse["skipped"] = [];
      for (const pluginId of ids) {
        if (!pluginId) {
          skipped.push({ id: pluginId, reason: "invalid-id" });
          continue;
        }
        const entry = byId.get(pluginId);
        if (!entry) {
          skipped.push({ id: pluginId, reason: "not-discovered" });
          continue;
        }
        if (!createMissingEntries && entry.source !== "configured") {
          skipped.push({ id: pluginId, reason: "not-configured" });
          continue;
        }
        const current = isRecord(openclawConfig.plugins.entries[pluginId]) ? openclawConfig.plugins.entries[pluginId] : {};
        openclawConfig.plugins.entries[pluginId] = {
          ...current,
          enabled,
        };
        updatedIds.push(pluginId);
      }

      if (updatedIds.length) {
        writeJsonFile(config.openclawConfigFile, openclawConfig);
      }
      const summary = this.getSummary();
      const results = updatedIds.map((pluginId) => {
        const entry = summary.entries.find((item) => item.id === pluginId);
        return {
          success: true,
          id: pluginId,
          enabled,
          critical: entry?.critical === true,
          impacts: entry?.impacts || buildImpactPreview(pluginId, entry?.capabilities || []),
          requiresRestart: true,
        } satisfies PluginToggleResponse;
      });
      return {
        success: true,
        enabled,
        updatedIds,
        skipped,
        results,
        requiresRestart: updatedIds.length > 0,
        summary,
      };
    },

    async installUploadedPluginArchive(payload: PluginUploadInstallPayload): Promise<PluginUploadInstallResponse> {
      const fileName = normalizeString(payload.fileName);
      if (!fileName) throw new Error("Uploaded plugin file name is required");
      return await withExtractedUploadedPluginArchive(payload, async (extractDir) => {
        const preflight = await this.preflightPlugin({ spec: extractDir });
        if (preflight.readiness === "blocked") {
          throw new Error(preflight.summary);
        }
        const action = await this.installPlugin({
          spec: preflight.pluginRoot || extractDir,
          force: payload.force,
          pin: payload.pin,
          dangerouslyForceUnsafeInstall: payload.dangerouslyForceUnsafeInstall,
        });
        return {
          success: action.success,
          installedId: preflight.manifest?.id || action.id,
          output: action.output,
          requiresRestart: action.requiresRestart,
          summary: action.summary,
          preflight,
        };
      });
    },

    async installPlugin(payload: PluginInstallPayload): Promise<PluginActionResponse> {
      const spec = normalizeString(payload.spec);
      if (!spec) throw new Error("Plugin install spec is required");
      const args = ["plugins", "install", spec];
      if (payload.force) args.push("--force");
      if (payload.link) args.push("--link");
      if (payload.pin) args.push("--pin");
      if (payload.marketplace) args.push("--marketplace", payload.marketplace);
      if (payload.dangerouslyForceUnsafeInstall) {
        args.push("--dangerously-force-unsafe-install");
      }
      const output = await runOpenClawPluginCommand(config, args);
      return {
        success: true,
        action: "install",
        id: spec,
        output,
        requiresRestart: true,
        summary: this.getSummary(),
      };
    },

    async updatePlugins(payload: PluginUpdatePayload): Promise<PluginActionResponse> {
      const args = ["plugins", "update"];
      const id = normalizeString(payload.id);
      if (payload.all) args.push("--all");
      else if (id) args.push(id);
      else throw new Error("Plugin update requires an id or all=true");
      if (payload.dryRun) args.push("--dry-run");
      if (payload.dangerouslyForceUnsafeInstall) {
        args.push("--dangerously-force-unsafe-install");
      }
      const output = await runOpenClawPluginCommand(config, args);
      return {
        success: true,
        action: "update",
        id: payload.all ? null : id,
        output,
        requiresRestart: !payload.dryRun,
        summary: this.getSummary(),
      };
    },

    async bulkUpdatePlugins(payload: PluginBulkUpdatePayload): Promise<PluginBulkActionResponse> {
      const ids = Array.from(new Set((Array.isArray(payload.ids) ? payload.ids : []).map((id) => normalizeString(id)).filter(Boolean)));
      const all = payload.all === true;
      if (!all && !ids.length) {
        throw new Error("Plugin bulk update requires ids or all=true");
      }
      if (all) {
        const result = await this.updatePlugins({
          all: true,
          dryRun: payload.dryRun,
          dangerouslyForceUnsafeInstall: payload.dangerouslyForceUnsafeInstall,
        });
        return {
          success: true,
          action: "update",
          processedIds: result.summary.installs.map((item) => item.id),
          failures: [],
          requiresRestart: result.requiresRestart,
          summary: result.summary,
        };
      }
      const failures = await runSequentialPluginCommands(ids, async (id) => {
        await this.updatePlugins({
          id,
          dryRun: payload.dryRun,
          dangerouslyForceUnsafeInstall: payload.dangerouslyForceUnsafeInstall,
        });
      });
      return {
        success: failures.length === 0,
        action: "update",
        processedIds: ids.filter((id) => !failures.some((failure) => failure.id === id)),
        failures,
        requiresRestart: payload.dryRun !== true && ids.length > 0,
        summary: this.getSummary(),
      };
    },

    async uninstallPlugin(payload: PluginUninstallPayload): Promise<PluginActionResponse> {
      const id = normalizeString(payload.id);
      if (!id) throw new Error("Plugin uninstall id is required");
      const args = ["plugins", "uninstall", id];
      if (payload.dryRun) args.push("--dry-run");
      if (payload.force !== false) args.push("--force");
      if (payload.keepFiles) args.push("--keep-files");
      const output = await runOpenClawPluginCommand(config, args);
      return {
        success: true,
        action: "uninstall",
        id,
        output,
        requiresRestart: !payload.dryRun,
        summary: this.getSummary(),
      };
    },

    async bulkUninstallPlugins(payload: PluginBulkUninstallPayload): Promise<PluginBulkActionResponse> {
      const ids = Array.from(new Set((Array.isArray(payload.ids) ? payload.ids : []).map((id) => normalizeString(id)).filter(Boolean)));
      if (!ids.length) {
        throw new Error("Plugin bulk uninstall ids are required");
      }
      const failures = await runSequentialPluginCommands(ids, async (id) => {
        await this.uninstallPlugin({
          id,
          dryRun: payload.dryRun,
          force: payload.force,
          keepFiles: payload.keepFiles,
        });
      });
      return {
        success: failures.length === 0,
        action: "uninstall",
        processedIds: ids.filter((id) => !failures.some((failure) => failure.id === id)),
        failures,
        requiresRestart: payload.dryRun !== true && ids.length > 0,
        summary: this.getSummary(),
      };
    },
  };
}
