import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type FileEvidenceView = "overview" | "files" | "search" | "git";

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function listAt(value: unknown, path: string[]): unknown[] {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return Array.isArray(current) ? current : [];
}

function textAt(value: unknown, keys: string[], fallback = "-"): string {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct;
    if (typeof direct === "number" || typeof direct === "boolean") return String(direct);
  }
  return fallback;
}

function numberAt(value: unknown, keys: string[], fallback = 0): number {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  }
  return fallback;
}

function formatBytes(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (number >= 1024 * 1024) return `${(number / 1024 / 1024).toFixed(1)} MB`;
  if (number >= 1024) return `${(number / 1024).toFixed(1)} KB`;
  return `${number} B`;
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(clean|ready|ok|true|text|file|found|available)/.test(text)) return "ok";
  if (/(failed|error|missing|false|denied|invalid)/.test(text)) return "bad";
  if (/(dirty|modified|untracked|binary|directory|large|partial)/.test(text)) return "warn";
  return "info";
}

function StatusTag({ value }: { value: unknown }) {
  const tone = stateTone(value);
  return <span className={`tag ${tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "info"}`}>{String(value ?? "unknown")}</span>;
}

function QueryNotice({ query, label }: { query: { isLoading: boolean; isError: boolean; error: unknown }; label: string }) {
  if (query.isLoading) return <div className="statebox"><span className="spinner" /><strong>{label} 加载中</strong></div>;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "加载失败";
    return <div className="statebox error"><span className="si"><i data-lucide="circle-alert" /></span><strong>{label} 不可用</strong><span>{message}</span></div>;
  }
  return null;
}

function Metric({ icon, label, value, sub }: { icon: string; label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="hero-stat">
      <span className="lab"><i data-lucide={icon} />{label}</span>
      <span className="val">{value}</span>
      <span className="trend flat"><i data-lucide="minus" />{sub}</span>
    </div>
  );
}

function EvidenceTile({ icon, title, value, sub, status }: { icon: string; title: string; value: React.ReactNode; sub: React.ReactNode; status?: unknown }) {
  return (
    <div className="file-evidence-tile">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <div><strong>{title}</strong><span>{sub}</span></div>
      <div className="file-evidence-tile-value">
        <b>{value}</b>
        {status !== undefined ? <StatusTag value={status} /> : null}
      </div>
    </div>
  );
}

function fileKind(entry: AnyRecord): string {
  if (entry.kind === "directory") return "directory";
  if (entry.textLike === true) return "text";
  if (entry.imageLike === true) return "image";
  return textAt(entry, ["kind"], "file");
}

function displayPath(entry: AnyRecord): string {
  return textAt(entry, ["path", "relativePath", "name"], "-");
}

function FileRow({ entry, selected, onSelect }: { entry: AnyRecord; selected: boolean; onSelect: () => void }) {
  const kind = fileKind(entry);
  const path = displayPath(entry);
  return (
    <button className={`file-evidence-row ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <span className="rico r-primary"><i data-lucide={kind === "directory" ? "folder" : kind === "image" ? "image" : "file-text"} /></span>
      <span className="file-evidence-copy"><strong>{textAt(entry, ["name"], path)}</strong><small>{path}</small></span>
      <span className="cell-mono">{formatBytes(entry.size)}</span>
      <span className="cell-mono">{formatTime(textAt(entry, ["modifiedAt"], ""))}</span>
      <StatusTag value={kind} />
    </button>
  );
}

function previewLines(content: string): string {
  return content.split(/\r?\n/).slice(0, 180).join("\n");
}

export function FileEvidencePage() {
  const shell = useShell();
  const [view, setView] = useState<FileEvidenceView>("overview");
  const [selectedPath, setSelectedPath] = useState("");
  const [search, setSearch] = useState("tracevane");

  const summary = useQuery({ queryKey: ["file-evidence", "summary"], queryFn: () => apiJson("/api/files/summary"), retry: false });
  const roots = listAt(summary.data, ["roots"]).map(asRecord);
  const projectRoot = roots.find((root) => root.id === "project-root") || roots.find((root) => root.preferred === true) || roots[0] || {};
  const rootId = textAt(projectRoot, ["id"], "");

  const directory = useQuery({
    queryKey: ["file-evidence", "browse", rootId],
    queryFn: () => apiJson(`/api/files/browse?${new URLSearchParams({ rootId, pageSize: "80", hidden: "false", sortKey: "modifiedAt", sortDirection: "desc" })}`),
    enabled: Boolean(rootId),
    retry: false,
  });
  const searchResults = useQuery({
    queryKey: ["file-evidence", "search", rootId, search],
    queryFn: () => apiJson(`/api/files/search?${new URLSearchParams({ rootId, q: search.trim() || "tracevane", recursive: "true", hidden: "false" })}`),
    enabled: Boolean(rootId),
    retry: false,
  });
  const gitStatus = useQuery({
    queryKey: ["file-evidence", "git-status", rootId],
    queryFn: () => apiJson(`/api/git/status?${new URLSearchParams({ rootId })}`),
    enabled: Boolean(rootId),
    retry: false,
  });

  const entries = listAt(directory.data, ["entries"]).map(asRecord);
  const results = listAt(searchResults.data, ["results"]).map(asRecord);
  const changes = listAt(gitStatus.data, ["changes"]).map(asRecord);
  const commits = listAt(gitStatus.data, ["commits"]).map(asRecord);
  const knownEntries = useMemo(() => [...entries, ...results, ...changes], [changes, entries, results]);
  const selectedEntry = knownEntries.find((entry) => displayPath(entry) === selectedPath) || {};
  const selectedKind = fileKind(selectedEntry);
  const readable = Boolean(rootId && selectedPath && selectedKind !== "directory" && selectedEntry.textLike !== false && selectedEntry.binary !== true);

  const fileRead = useQuery({
    queryKey: ["file-evidence", "read", rootId, selectedPath],
    queryFn: () => apiJson(`/api/files/read?${new URLSearchParams({ rootId, path: selectedPath })}`),
    enabled: readable,
    retry: false,
  });
  const gitDiff = useQuery({
    queryKey: ["file-evidence", "git-diff", rootId, selectedPath],
    queryFn: () => apiJson(`/api/git/diff?${new URLSearchParams({ rootId, file: selectedPath })}`),
    enabled: Boolean(rootId && selectedPath),
    retry: false,
  });

  useEffect(() => {
    if (!selectedPath) {
      const firstFile = entries.find((entry) => entry.kind === "file") || entries[0];
      if (firstFile) setSelectedPath(displayPath(firstFile));
    }
  }, [entries, selectedPath]);

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, summary.data, directory.data, searchResults.data, gitStatus.data, fileRead.data, gitDiff.data, selectedPath]);

  const fileCount = entries.filter((entry) => entry.kind === "file").length;
  const dirCount = entries.filter((entry) => entry.kind === "directory").length;
  const textCount = entries.filter((entry) => entry.textLike === true).length;
  const gitClean = gitStatus.isError ? "unknown" : asRecord(gitStatus.data).clean === true ? "clean" : "dirty";
  const content = textAt(fileRead.data, ["content"], "");
  const diff = textAt(gitDiff.data, ["diff"], "");

  const renderDetail = () => (
    <aside className="panel file-evidence-detail-panel">
      <div className="panel-head">
        <div><strong>证据详情</strong><span>{selectedPath || "未选择文件"}</span></div>
        <StatusTag value={selectedKind} />
      </div>
      <div className="file-evidence-detail">
        <div className="file-evidence-detail-title">
          <span className="rico r-primary"><i data-lucide={selectedKind === "directory" ? "folder" : "file-text"} /></span>
          <span><strong>{selectedPath ? selectedPath.split("/").pop() : "未选择"}</strong><small>{selectedPath || "从列表或搜索结果中选择一个证据文件"}</small></span>
        </div>
        <div className="metric-row file-evidence-metrics">
          <div><strong>{formatBytes(selectedEntry.size)}</strong><span>大小</span></div>
          <div><strong>{formatTime(textAt(selectedEntry, ["modifiedAt"], ""))}</strong><span>修改时间</span></div>
        </div>
        {readable ? <QueryNotice query={fileRead} label="文件预览" /> : null}
        {readable && content ? <pre className="file-evidence-preview">{previewLines(content)}</pre> : null}
        {!readable ? (
          <div className="statebox empty"><span className="si"><i data-lucide="lock" /></span><strong>只读元数据</strong><span>目录、二进制或未知类型不在证据页直接读取内容。</span></div>
        ) : null}
        <QueryNotice query={gitDiff} label="Git Diff" />
        {diff ? <pre className="file-evidence-diff">{previewLines(diff)}</pre> : <div className="statebox empty"><span className="si"><i data-lucide="file-diff" /></span><strong>没有 Diff 片段</strong><span>该文件可能未修改，或 Git 无可展示差异。</span></div>}
        <div className="file-evidence-log">
          {[
            "只读边界: 不提供写入、上传、删除、重命名、归档和下载动作。",
            "编辑归 Workspace IDE；变更执行必须进入审批、回滚和审计链路。",
            `root ${rootId || "-"} · ${textAt(projectRoot, ["absolutePath"], "-")}`,
          ].map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>
    </aside>
  );

  const renderOverview = () => (
    <>
      <section className="hero file-evidence-hero">
        <div className="hero-top">
          <span className={`ready-chip ${stateTone(gitClean) === "ok" ? "ok" : "warn"}`}><i data-lucide="folder-check" />文件证据 · {gitClean}</span>
          <span className="hero-time">{textAt(projectRoot, ["absolutePath"], "-")}</span>
        </div>
        <div className="hero-body">
          <div>
            <h1>文件证据浏览器</h1>
            <p>聚合文件树、搜索命中、Git 状态和 Diff 片段，作为任务回放与审计入口。当前页面保持只读，避免和工作区 IDE 的编辑流混在一起。</p>
          </div>
          <div className="hero-stats file-evidence-stats">
            <Metric icon="folder" label="目录" value={dirCount} sub="当前根目录" />
            <Metric icon="file-text" label="文件" value={fileCount} sub={`${textCount} text-like`} />
            <Metric icon="git-branch" label="Git 变更" value={changes.length} sub={textAt(gitStatus.data, ["branch"], "branch")} />
          </div>
        </div>
      </section>
      <div className="file-evidence-overview-grid">
        <section className="panel file-evidence-panel">
          <div className="panel-head"><div><strong>证据面板</strong><span>来自文件服务和 Git 服务的只读快照</span></div></div>
          <div className="file-evidence-tile-grid">
            <EvidenceTile icon="database" title="可用根目录" value={roots.length} sub={textAt(summary.data, ["defaultRootId"], rootId)} status="available" />
            <EvidenceTile icon="search" title="搜索命中" value={results.length} sub={`query ${search || "tracevane"}`} status="found" />
            <EvidenceTile icon="file-diff" title="Diff 证据" value={changes.length} sub={gitClean} status={gitClean} />
            <EvidenceTile icon="lock" title="动作边界" value="只读" sub="写入由 IDE / 审批域承接" status="locked" />
          </div>
        </section>
        {renderDetail()}
      </div>
    </>
  );

  const renderFiles = () => (
    <div className="file-evidence-shell">
      <section className="panel file-evidence-list-panel">
        <div className="panel-head"><div><strong>文件列表</strong><span>{rootId || "root"} · 最近修改排序</span></div><button className="btn-ghost" onClick={() => void directory.refetch()}><i data-lucide="refresh-cw" />刷新</button></div>
        <QueryNotice query={directory} label="文件列表" />
        <div className="file-evidence-table">
          {entries.slice(0, 60).map((entry) => {
            const path = displayPath(entry);
            return <FileRow key={path} entry={entry} selected={path === selectedPath} onSelect={() => setSelectedPath(path)} />;
          })}
        </div>
      </section>
      {renderDetail()}
    </div>
  );

  const renderSearch = () => (
    <div className="file-evidence-shell">
      <section className="panel file-evidence-list-panel">
        <div className="panel-head"><div><strong>搜索</strong><span>递归搜索当前项目根目录，结果只用于定位证据</span></div></div>
        <div className="file-evidence-searchbar">
          <i data-lucide="search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="搜索文件证据" />
        </div>
        <QueryNotice query={searchResults} label="搜索结果" />
        <div className="file-evidence-table">
          {results.slice(0, 60).map((entry) => {
            const path = displayPath(entry);
            return <FileRow key={path} entry={entry} selected={path === selectedPath} onSelect={() => setSelectedPath(path)} />;
          })}
          {!searchResults.isLoading && !searchResults.isError && results.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="search-x" /></span><strong>没有搜索命中</strong><span>换一个更具体的路径、文件名或关键词。</span></div> : null}
        </div>
      </section>
      {renderDetail()}
    </div>
  );

  const renderGit = () => (
    <div className="file-evidence-shell">
      <section className="panel file-evidence-list-panel">
        <div className="panel-head"><div><strong>Git 证据</strong><span>{textAt(gitStatus.data, ["branch"], "branch")} · {gitClean}</span></div><StatusTag value={gitClean} /></div>
        <QueryNotice query={gitStatus} label="Git 状态" />
        <div className="file-evidence-table">
          {changes.slice(0, 60).map((change) => {
            const path = displayPath(change);
            return <FileRow key={path} entry={{ ...change, kind: "file" }} selected={path === selectedPath} onSelect={() => setSelectedPath(path)} />;
          })}
          {!gitStatus.isLoading && !gitStatus.isError && changes.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="git-branch" /></span><strong>工作区干净</strong><span>当前没有 Git 变更证据。</span></div> : null}
        </div>
        <div className="file-evidence-log">
          {commits.slice(0, 8).map((commit) => <span key={textAt(commit, ["hash", "shortHash"], "commit")}>{textAt(commit, ["shortHash"], "-")} · {textAt(commit, ["subject"], "commit")}</span>)}
        </div>
      </section>
      {renderDetail()}
    </div>
  );

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap file-evidence-page">
        <div className="page-head">
          <div className="htitle">
            <h2>文件证据</h2>
            <p>面向任务审计的文件、搜索和 Git 只读证据，不承载编辑器和危险操作。</p>
          </div>
          <div className="toolbar">
            <div className="seg file-evidence-viewbar" role="tablist" aria-label="文件证据视图">
              {[
                ["overview", "总览"],
                ["files", "文件"],
                ["search", "搜索"],
                ["git", "Git"],
              ].map(([id, label]) => (
                <button key={id} className={view === id ? "on" : ""} role="tab" aria-selected={view === id} onClick={() => setView(id as FileEvidenceView)}>{label}</button>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => { void summary.refetch(); void directory.refetch(); void searchResults.refetch(); void gitStatus.refetch(); }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>
        <QueryNotice query={summary} label="文件根目录" />
        {view === "overview" ? renderOverview() : null}
        {view === "files" ? renderFiles() : null}
        {view === "search" ? renderSearch() : null}
        {view === "git" ? renderGit() : null}
      </div>
    </div>
  );
}
