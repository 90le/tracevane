import fs from "node:fs";
import path from "node:path";

import type { TracevaneServerConfig } from "../../../../types/api.js";

const STORE_FILE_NAME = "ide-workbench-layouts.json";
const MAX_LAYOUT_JSON_BYTES = 512 * 1024;

export interface IdeWorkbenchLayoutRecord {
  workspaceKey: string;
  layout: unknown;
  terminalLayouts: Record<string, unknown>;
  updatedAt: string;
}

export interface IdeWorkbenchLayoutPayload {
  layout?: unknown;
  terminalLayouts?: Record<string, unknown>;
}

export interface IdeWorkbenchService {
  getLayout(workspaceKey: string): IdeWorkbenchLayoutRecord | null;
  putLayout(workspaceKey: string, payload: IdeWorkbenchLayoutPayload): IdeWorkbenchLayoutRecord;
}

interface StoreShape {
  version: 1;
  records: Record<string, IdeWorkbenchLayoutRecord>;
}

export function createIdeWorkbenchService(
  config: TracevaneServerConfig,
): IdeWorkbenchService {
  const storePath = getStorePath(config);

  function readStore(): StoreShape {
    try {
      const raw = fs.readFileSync(storePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreShape>;
      if (!parsed || parsed.version !== 1 || !parsed.records || typeof parsed.records !== "object") {
        return createEmptyStore();
      }
      const records: Record<string, IdeWorkbenchLayoutRecord> = {};
      for (const [key, value] of Object.entries(parsed.records)) {
        const normalizedKey = normalizeWorkspaceKey(key);
        const record = normalizeRecord(value);
        if (normalizedKey && record) records[normalizedKey] = record;
      }
      return { version: 1, records };
    } catch {
      return createEmptyStore();
    }
  }

  function writeStore(store: StoreShape): void {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(tempPath, storePath);
  }

  return {
    getLayout(workspaceKey: string): IdeWorkbenchLayoutRecord | null {
      const key = normalizeWorkspaceKey(workspaceKey);
      if (!key) return null;
      return readStore().records[key] ?? null;
    },

    putLayout(workspaceKey: string, payload: IdeWorkbenchLayoutPayload): IdeWorkbenchLayoutRecord {
      const key = normalizeWorkspaceKey(workspaceKey);
      if (!key) throw new Error("invalid workspace key");
      assertSmallJson(payload);
      const store = readStore();
      const previous = store.records[key] ?? null;
      const previousTerminalLayouts = normalizeTerminalLayouts(previous?.terminalLayouts);
      const nextTerminalLayouts = payload.terminalLayouts === undefined
        ? previousTerminalLayouts
        : Object.keys(payload.terminalLayouts).length === 0
          ? {}
          : {
              ...previousTerminalLayouts,
              ...normalizeTerminalLayouts(payload.terminalLayouts),
            };
      const record: IdeWorkbenchLayoutRecord = {
        workspaceKey: key,
        layout: payload.layout === undefined ? previous?.layout ?? null : payload.layout,
        terminalLayouts: nextTerminalLayouts,
        updatedAt: new Date().toISOString(),
      };
      store.records[key] = record;
      writeStore(store);
      return record;
    },
  };
}

function getStorePath(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, ".tracevane", STORE_FILE_NAME);
}

function createEmptyStore(): StoreShape {
  return { version: 1, records: {} };
}

function normalizeWorkspaceKey(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "-")
    .slice(0, 160);
}

function normalizeRecord(value: unknown): IdeWorkbenchLayoutRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<IdeWorkbenchLayoutRecord>;
  const workspaceKey = normalizeWorkspaceKey(candidate.workspaceKey);
  if (!workspaceKey) return null;
  return {
    workspaceKey,
    layout: candidate.layout ?? null,
    terminalLayouts: normalizeTerminalLayouts(candidate.terminalLayouts),
    updatedAt: String(candidate.updatedAt || new Date().toISOString()),
  };
}

function normalizeTerminalLayouts(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, layout] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeTerminalLayoutKey(key);
    if (!normalizedKey) continue;
    output[normalizedKey] = layout;
  }
  return output;
}

function normalizeTerminalLayoutKey(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:/-]/g, "-")
    .slice(0, 220);
}

function assertSmallJson(value: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
  if (bytes > MAX_LAYOUT_JSON_BYTES) {
    throw new Error(`ide workbench layout metadata too large: ${bytes} bytes`);
  }
}
