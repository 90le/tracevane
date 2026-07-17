import * as React from "react";
import { Box, Check, Plus, ScanSearch, Search, Trash2 } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";

/** A single editable model-catalog row. Shared with ProviderConfigView. */
export interface ModelRow {
  id: string;
  alias: string;
  contextWindow: string;
  maxOutput: string;
  isDefault: boolean;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
}

export function newModelRow(isDefault = false): ModelRow {
  return {
    id: "",
    alias: "",
    contextWindow: "",
    maxOutput: "",
    isDefault,
    reasoning: false,
    vision: false,
    tools: false,
  };
}

/** A detected-but-not-yet-added model candidate surfaced for opt-in. */
export interface DetectedCandidate {
  id: string;
  contextWindow: string;
  maxOutput: string;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
}

const PAGE_SIZE = 30;

/**
 * Parse bulk-import text. Each non-empty line is `model-id | alias1,alias2`.
 * Returns the rows to append plus per-line errors. Only the first alias is
 * kept (the form models a single alias per row, matching buildPayload).
 */
function parseBulkImport(
  text: string,
  existingIds: Set<string>,
): { rows: ModelRow[]; added: number; skipped: number; errors: string[] } {
  const rows: ModelRow[] = [];
  const errors: string[] = [];
  const seen = new Set(existingIds);
  let skipped = 0;
  const lines = text.split("\n");
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [idPart, aliasPart = ""] = line.split("|");
    const id = idPart.trim();
    if (!id) {
      errors.push(`第 ${i + 1} 行：缺少模型 id。`);
      return;
    }
    if (/\s/.test(id)) {
      errors.push(`第 ${i + 1} 行：模型 id「${id}」不能包含空格。`);
      return;
    }
    if (seen.has(id)) {
      skipped += 1;
      return;
    }
    seen.add(id);
    const alias = aliasPart
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean)[0] ?? "";
    rows.push({ ...newModelRow(), id, alias });
  });
  return { rows, added: rows.length, skipped, errors };
}

interface ModelCatalogEditorProps {
  models: ModelRow[];
  onChange: (models: ModelRow[]) => void;
  modelErrors: Record<number, string>;
  showErrors: boolean;
  /** Detected models not present in `models`; user opts them in. */
  candidates: DetectedCandidate[];
  onAddCandidates: (ids: string[]) => void;
}

type BulkFlag = "reasoning" | "vision" | "tools";

/**
 * Model-catalog editor: search/filter, windowed rendering for large catalogs,
 * bulk import, bulk capability apply (visible rows only), and opt-in detected
 * candidates. Validation lives in the parent; row errors are passed in.
 */
export function ModelCatalogEditor({
  models,
  onChange,
  modelErrors,
  showErrors,
  candidates,
  onAddCandidates,
}: ModelCatalogEditorProps) {
  const [search, setSearch] = React.useState("");
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState("");
  const [bulkMsg, setBulkMsg] = React.useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = React.useState("");

  // Patch one model by its identity in the full array (index-safe under filter).
  const patchRow = (target: ModelRow, patch: Partial<ModelRow>) =>
    onChange(models.map((m) => (m === target ? { ...m, ...patch } : m)));

  const removeRow = (target: ModelRow) => onChange(models.filter((m) => m !== target));

  const setDefaultRow = (target: ModelRow) =>
    onChange(models.map((m) => ({ ...m, isDefault: m === target })));

  const q = search.trim().toLowerCase();
  // Indices kept so row errors (keyed by original index) still line up.
  const filtered = React.useMemo(() => {
    return models
      .map((m, index) => ({ m, index }))
      .filter(({ m }) =>
        !q || m.id.toLowerCase().includes(q) || m.alias.toLowerCase().includes(q),
      );
  }, [models, q]);

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [q]);

  const visible = filtered.slice(0, visibleCount);
  const hiddenByWindow = filtered.length - visible.length;

  // Bulk capability/default apply — operates ONLY on currently-visible rows.
  const applyToVisible = (flag: BulkFlag, value: boolean) => {
    const targets = new Set(visible.map((v) => v.m));
    onChange(models.map((m) => (targets.has(m) ? { ...m, [flag]: value } : m)));
  };

  const runBulkImport = () => {
    const existing = new Set(models.map((m) => m.id.trim()).filter(Boolean));
    const result = parseBulkImport(bulkText, existing);
    if (result.errors.length > 0 && result.added === 0) {
      setBulkMsg(result.errors[0]);
      return;
    }
    if (result.added > 0) onChange([...models, ...result.rows]);
    const parts = [`新增 ${result.added} 个`];
    if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 个重复`);
    if (result.errors.length > 0) parts.push(`${result.errors.length} 行有误`);
    setBulkMsg(parts.join(" · "));
    if (result.added > 0) {
      setBulkText("");
    }
  };

  const cq = candidateSearch.trim().toLowerCase();
  const filteredCandidates = React.useMemo(
    () => (cq ? candidates.filter((c) => c.id.toLowerCase().includes(cq)) : candidates),
    [candidates, cq],
  );

  return (
    <div className="grid gap-3.5">
      {/* Toolbar: search + counts + bulk import toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型 id / alias"
            className="pl-8"
            aria-label="搜索模型"
          />
        </div>
        <span className="text-xs text-subtle">
          {q ? `${filtered.length} / ${models.length}` : `${models.length} 个模型`}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setBulkOpen((v) => !v)}>
          <Plus />
          批量导入
        </Button>
      </div>

      {/* Bulk import textarea */}
      {bulkOpen && (
        <div className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3">
          <span className="text-sm text-ink-strong">批量导入模型</span>
          <span className="text-xs text-subtle">
            每行一个：<code>model-id | alias1,alias2</code>（alias 可省略）。重复 id 会被跳过。
          </span>
          <textarea
            value={bulkText}
            onChange={(e) => {
              setBulkText(e.target.value);
              setBulkMsg(null);
            }}
            rows={4}
            placeholder={"glm-4.6 | glm\nglm-4.5-air | air"}
            className="w-full rounded-sm border border-line bg-panel px-2.5 py-2 font-mono text-sm text-ink outline-none focus-visible:shadow-[var(--ring)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={runBulkImport} disabled={!bulkText.trim()}>
              <Check />
              导入
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setBulkOpen(false); setBulkMsg(null); }}>
              收起
            </Button>
            {bulkMsg && <span className="text-xs text-muted">{bulkMsg}</span>}
          </div>
        </div>
      )}

      {/* Bulk apply to visible rows */}
      {visible.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-sm border border-line bg-panel-2 px-3 py-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1 text-subtle">
            <ScanSearch className="size-3.5" />
            应用到可见 {visible.length} 行：
          </span>
          {(["reasoning", "vision", "tools"] as BulkFlag[]).map((flag) => (
            <span key={flag} className="inline-flex items-center gap-1">
              {flag}
              <button
                type="button"
                onClick={() => applyToVisible(flag, true)}
                className="rounded-[5px] border border-line px-1.5 py-0.5 hover:bg-panel-3"
              >
                开
              </button>
              <button
                type="button"
                onClick={() => applyToVisible(flag, false)}
                className="rounded-[5px] border border-line px-1.5 py-0.5 hover:bg-panel-3"
              >
                关
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Detected candidates (opt-in) */}
      {candidates.length > 0 && (
        <div className="grid gap-2 rounded-sm border border-dashed border-line bg-panel-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-strong">
              <ScanSearch className="size-4 text-primary" />
              探测到 {candidates.length} 个未加入的模型
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => onAddCandidates(filteredCandidates.map((c) => c.id))}
              disabled={filteredCandidates.length === 0}
            >
              <Plus />
              {cq ? `加入可见 ${filteredCandidates.length} 个` : "全部加入"}
            </Button>
          </div>
          {candidates.length > 8 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                placeholder="过滤候选模型"
                className="pl-8"
                aria-label="过滤候选模型"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {filteredCandidates.slice(0, 60).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onAddCandidates([c.id])}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-muted hover:border-primary-line hover:text-ink"
              >
                <Plus className="size-3" />
                {c.id}
              </button>
            ))}
            {filteredCandidates.length > 60 && (
              <span className="self-center text-xs text-subtle">…还有 {filteredCandidates.length - 60} 个</span>
            )}
          </div>
        </div>
      )}

      {/* Rows */}
      {models.length === 0 ? (
        <p className="text-sm text-muted">还没有模型，新增一行、批量导入，或在「基础」用「探测」自动发现。</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">没有匹配「{search}」的模型。</p>
      ) : (
        <div className="grid gap-3">
          {visible.map(({ m, index }) => {
            const rowError = showErrors ? modelErrors[index] : undefined;
            return (
              <div
                key={index}
                className={cn(
                  "grid gap-2.5 rounded-sm border bg-panel-2 p-3",
                  rowError ? "border-danger" : "border-line",
                )}
              >
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-ink">模型 id</span>
                    <Input
                      value={m.id}
                      onChange={(e) => patchRow(m, { id: e.target.value })}
                      placeholder="例如 glm-4-plus"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-ink">alias</span>
                    <Input
                      value={m.alias}
                      onChange={(e) => patchRow(m, { alias: e.target.value })}
                      placeholder="可选"
                    />
                  </label>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-ink">上下文窗口</span>
                    <Input
                      inputMode="numeric"
                      value={m.contextWindow}
                      onChange={(e) => patchRow(m, { contextWindow: e.target.value })}
                      placeholder="tokens"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-ink">最大输出</span>
                    <Input
                      inputMode="numeric"
                      value={m.maxOutput}
                      onChange={(e) => patchRow(m, { maxOutput: e.target.value })}
                      placeholder="tokens"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="default-model"
                      checked={m.isDefault}
                      onChange={() => setDefaultRow(m)}
                    />
                    默认模型
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={m.reasoning} onChange={(e) => patchRow(m, { reasoning: e.target.checked })} />
                    reasoning
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={m.vision} onChange={(e) => patchRow(m, { vision: e.target.checked })} />
                    vision
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={m.tools} onChange={(e) => patchRow(m, { tools: e.target.checked })} />
                    tools
                  </label>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => removeRow(m)}>
                    <Trash2 />
                    移除
                  </Button>
                </div>
                {rowError && <span className="text-sm text-danger">{rowError}</span>}
              </div>
            );
          })}
          {hiddenByWindow > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              <Box />
              再显示 {Math.min(PAGE_SIZE, hiddenByWindow)} 个（剩余 {hiddenByWindow}）
            </Button>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-self-start"
        onClick={() => onChange([...models, newModelRow(models.length === 0)])}
      >
        <Plus />
        新增模型
      </Button>
    </div>
  );
}
