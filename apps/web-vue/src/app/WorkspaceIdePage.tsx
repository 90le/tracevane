import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type IdeMode = "edit" | "preview" | "diff";
type IdePane = "files" | "git" | "terminal" | "evidence" | "ai";

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
  if (/(clean|healthy|running|active|ok|ready|success|installed|true)/.test(text)) return "ok";
  if (/(failed|error|invalid|offline|disabled|stopped|false|missing)/.test(text)) return "bad";
  if (/(dirty|modified|pending|warn|warning|detached|lost|untracked)/.test(text)) return "warn";
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

function markdownPreview(text: string): React.ReactNode {
  const lines = text.split(/\r?\n/).slice(0, 120);
  return lines.map((line, index) => {
    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const content = line.replace(/^#{1,3}\s+/, "");
      return level === 1 ? <h3 key={index}>{content}</h3> : <h4 key={index}>{content}</h4>;
    }
    if (/^\s*[-*]\s+/.test(line)) return <p key={index} className="workspace-md-list">{line.replace(/^\s*[-*]\s+/, "• ")}</p>;
    if (!line.trim()) return <br key={index} />;
    return <p key={index}>{line}</p>;
  });
}

export function WorkspaceIdePage() {
  const shell = useShell();
  const [mode, setMode] = useState<IdeMode>("edit");
  const [pane, setPane] = useState<IdePane>("files");
  const [selectedPath, setSelectedPath] = useState<string>("");

  const filesSummary = useQuery({ queryKey: ["workspace-ide", "files-summary"], queryFn: () => apiJson("/api/files/summary"), retry: false });
  const roots = listAt(filesSummary.data, ["roots"]).map(asRecord);
  const projectRoot = roots.find((root) => root.id === "project-root") || roots.find((root) => root.preferred === true) || roots[0] || {};
  const rootId = textAt(projectRoot, ["id"], "");

  const directory = useQuery({
    queryKey: ["workspace-ide", "browse", rootId],
    queryFn: () => apiJson(`/api/files/browse?${new URLSearchParams({ rootId, pageSize: "80", hidden: "false" })}`),
    enabled: Boolean(rootId),
    retry: false,
  });
  const entries = listAt(directory.data, ["entries"]).map(asRecord);
  const textFiles = entries.filter((entry) => entry.kind === "file" && entry.textLike === true);

  useEffect(() => {
    if (!selectedPath && textFiles.length > 0) setSelectedPath(textAt(textFiles[0], ["path"], ""));
  }, [selectedPath, textFiles]);

  const fileRead = useQuery({
    queryKey: ["workspace-ide", "read", rootId, selectedPath],
    queryFn: () => apiJson(`/api/files/read?${new URLSearchParams({ rootId, path: selectedPath })}`),
    enabled: Boolean(rootId && selectedPath),
    retry: false,
  });
  const gitStatus = useQuery({
    queryKey: ["workspace-ide", "git-status", rootId],
    queryFn: () => apiJson(`/api/git/status?${new URLSearchParams({ rootId })}`),
    enabled: Boolean(rootId),
    retry: false,
  });
  const gitDiff = useQuery({
    queryKey: ["workspace-ide", "git-diff", rootId, selectedPath],
    queryFn: () => apiJson(`/api/git/diff?${new URLSearchParams({ rootId, file: selectedPath })}`),
    enabled: Boolean(rootId && selectedPath),
    retry: false,
  });
  const terminalStatus = useQuery({ queryKey: ["workspace-ide", "terminal-status"], queryFn: () => apiJson("/api/terminal/status"), retry: false });
  const terminalSessions = useQuery({ queryKey: ["workspace-ide", "terminal-sessions"], queryFn: () => apiJson("/api/terminal/sessions"), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, mode, pane, filesSummary.data, directory.data, fileRead.data, gitStatus.data, gitDiff.data, terminalStatus.data, terminalSessions.data]);

  const selectedFile = asRecord(fileRead.data);
  const content = typeof selectedFile.content === "string" ? selectedFile.content : "";
  const changes = listAt(gitStatus.data, ["changes"]).map(asRecord);
  const commits = listAt(gitStatus.data, ["commits"]).map(asRecord);
  const binaries = listAt(terminalStatus.data, ["binaries"]).map(asRecord);
  const sessions = listAt(terminalSessions.data, ["sessions"]).map(asRecord);
  const agentBinaries = binaries.filter((binary) => binary.category === "agent");
  const diffText = textAt(gitDiff.data, ["diff"], "");
  const currentFile = textAt(selectedFile, ["name"], selectedPath || "未选择文件");
  const fileExt = textAt(selectedFile, ["ext"], "");
  const gitClean = gitStatus.isError ? "unknown" : asRecord(gitStatus.data).clean === true ? "clean" : "dirty";

  const renderPane = () => {
    if (pane === "files") {
      return (
        <div className="workspace-pane-body">
          <QueryNotice query={directory} label="文件列表" />
          {!directory.isLoading && !directory.isError ? entries.slice(0, 40).map((entry) => {
            const isFile = entry.kind === "file";
            const path = textAt(entry, ["path"], "");
            return (
              <button
                key={path}
                className={`workspace-tree-item ${path === selectedPath ? "on" : ""}`}
                disabled={!isFile || entry.textLike !== true}
                onClick={() => setSelectedPath(path)}
              >
                <i data-lucide={isFile ? "file-text" : "folder"} />
                <span>{textAt(entry, ["name"], path)}</span>
                {isFile ? <small>{formatBytes(entry.size)}</small> : null}
              </button>
            );
          }) : null}
        </div>
      );
    }
    if (pane === "git") {
      return (
        <div className="workspace-pane-body">
          <QueryNotice query={gitStatus} label="Git 状态" />
          {!gitStatus.isLoading && !gitStatus.isError ? (
            <>
              <div className="workspace-side-card">
                <strong>{textAt(gitStatus.data, ["branch"], "main")}</strong>
                <span>{changes.length} changes · {asRecord(gitStatus.data).clean === true ? "working tree clean" : "working tree dirty"}</span>
              </div>
              {changes.length ? changes.slice(0, 20).map((change) => (
                <div key={textAt(change, ["path"], "change")} className="workspace-change-row">
                  <i data-lucide="file-diff" />
                  <span>{textAt(change, ["path"], "change")}</span>
                  <StatusTag value={textAt(change, ["kind"], "changed")} />
                </div>
              )) : <div className="statebox empty"><span className="si"><i data-lucide="git-branch" /></span><strong>工作区干净</strong><span>没有待提交改动。</span></div>}
            </>
          ) : null}
        </div>
      );
    }
    if (pane === "terminal") {
      return (
        <div className="workspace-pane-body">
          <QueryNotice query={terminalStatus} label="Terminal 状态" />
          {!terminalStatus.isLoading && !terminalStatus.isError ? agentBinaries.map((binary) => (
            <div key={textAt(binary, ["id"], "binary")} className="workspace-change-row">
              <i data-lucide="terminal" />
              <span>{textAt(binary, ["id"], "cli")} · {textAt(binary, ["version"], "-")}</span>
              <StatusTag value={binary.installed ? "installed" : "missing"} />
            </div>
          )) : null}
        </div>
      );
    }
    if (pane === "evidence") {
      return (
        <div className="workspace-pane-body">
          {commits.slice(0, 6).map((commit) => (
            <div key={textAt(commit, ["hash", "shortHash"], "commit")} className="workspace-change-row">
              <i data-lucide="git-commit-horizontal" />
              <span>{textAt(commit, ["subject"], "commit")}</span>
              <small>{textAt(commit, ["shortHash"], "-")}</small>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="workspace-pane-body">
        <div className="workspace-side-card">
          <strong>AI 编辑待确认流</strong>
          <span>当前只展示文件/终端/Git 证据。AI 编辑、写文件、应用 diff 必须先进入审批和回滚设计。</span>
        </div>
      </div>
    );
  };

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap workspace-ide-page">
        <div className="page-head">
          <div className="htitle">
            <h2>工作区 IDE</h2>
            <p>真实文件、Git、终端状态和预览证据汇聚在一个只读工作台。</p>
          </div>
          <div className="toolbar">
            <div className="seg" role="tablist" aria-label="工作区模式">
              {[
                ["edit", "编辑"],
                ["preview", "预览"],
                ["diff", "Diff"],
              ].map(([id, label]) => (
                <button key={id} className={mode === id ? "on" : ""} role="tab" aria-selected={mode === id} onClick={() => setMode(id as IdeMode)}>{label}</button>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => { void directory.refetch(); void gitStatus.refetch(); void terminalStatus.refetch(); }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>

        <section className="hero workspace-hero">
          <div className="hero-top">
            <span className={`ready-chip ${stateTone(gitClean) === "ok" ? "ok" : "warn"}`}><i data-lucide="square-terminal" />Workspace · {gitClean}</span>
            <span className="hero-time">{textAt(projectRoot, ["absolutePath"], "-")}</span>
          </div>
          <h1>工作台先成为可靠读面，再进入编辑、运行和预览时修改。</h1>
          <p className="hero-sub">第一版接入现有 Files、Git、Terminal GET API；写文件、提交、启动终端和 AI diff 应用全部保留在确认流之后。</p>
          <div className="hero-stats workspace-stats">
            <div className="hero-stat"><span className="lab"><i data-lucide="folder" />文件</span><span className="val">{numberAt(directory.data, ["counts", "total"])}</span><span className="trend flat"><i data-lucide="minus" />{textFiles.length} text-like</span></div>
            <div className="hero-stat"><span className="lab"><i data-lucide="git-branch" />Git</span><span className="val">{textAt(gitStatus.data, ["branch"], "-")}</span><span className="trend flat"><i data-lucide="minus" />{changes.length} changes</span></div>
            <div className="hero-stat"><span className="lab"><i data-lucide="terminal" />Terminal</span><span className="val">{numberAt(terminalStatus.data, ["sessionCount"])}</span><span className="trend flat"><i data-lucide="minus" />sessions</span></div>
            <div className="hero-stat"><span className="lab"><i data-lucide="bot" />Agents</span><span className="val">{agentBinaries.filter((binary) => binary.installed === true).length}</span><span className="trend flat"><i data-lucide="minus" />installed CLI</span></div>
          </div>
        </section>

        <section className="workspace-shell" aria-label="Workspace IDE">
          <div className="workspace-rail" role="tablist" aria-label="工作区面板">
            {[
              ["files", "files", "资源"],
              ["git", "git-branch", "Git"],
              ["terminal", "terminal", "终端"],
              ["evidence", "folder-check", "证据"],
              ["ai", "wand-sparkles", "AI"],
            ].map(([id, icon, label]) => (
              <button key={id} className={pane === id ? "on" : ""} role="tab" aria-selected={pane === id} title={label} onClick={() => setPane(id as IdePane)}><i data-lucide={icon} /></button>
            ))}
          </div>
          <aside className="workspace-tree">
            <div className="workspace-tree-head">
              <strong>{pane === "files" ? "资源管理器" : pane === "git" ? "Git 状态" : pane === "terminal" ? "终端" : pane === "evidence" ? "证据" : "AI 动作"}</strong>
              <StatusTag value={pane} />
            </div>
            {renderPane()}
          </aside>
          <main className="workspace-editor">
            <div className="workspace-tabs">
              <span className="workspace-tab on"><i data-lucide={fileExt === ".md" ? "file-text" : "file-code-2"} />{currentFile}</span>
              <span className="workspace-tab"><i data-lucide="shield-check" />只读</span>
            </div>
            <QueryNotice query={fileRead} label="文件内容" />
            {!fileRead.isLoading && !fileRead.isError ? (
              mode === "edit" ? <textarea className="workspace-code" value={content || "当前文件不可作为文本预览。"} readOnly aria-label="当前文件只读内容" />
                : mode === "preview" ? <div className="workspace-preview">{fileExt === ".md" ? markdownPreview(content) : <pre>{content || "没有可预览内容。"}</pre>}</div>
                  : <pre className="workspace-diff">{diffText || "当前文件没有 Git diff。"}</pre>
            ) : null}
          </main>
          <footer className="workspace-console">
            <div className="workspace-console-tabs">
              <span className="on">Sessions</span>
              <span>Problems</span>
              <span>Ports</span>
            </div>
            <div className="workspace-console-body">
              {sessions.length ? sessions.slice(0, 4).map((session) => (
                <div key={textAt(session, ["sessionId"], "session")} className="workspace-session-row">
                  <span>{textAt(session, ["title", "sessionId"], "session")}</span>
                  <small>{textAt(session, ["cwd"], "-")} · {formatTime(textAt(session, ["lastActiveAt"], ""))}</small>
                  <StatusTag value={textAt(session, ["status"], "unknown")} />
                </div>
              )) : <span className="workspace-console-empty">暂无持久终端 session；启动/结束终端后续进入确认流。</span>}
            </div>
          </footer>
          <div className="workspace-status">
            <span className="si"><i data-lucide="git-branch" />{textAt(gitStatus.data, ["branch"], "-")}</span>
            <span className="si"><i data-lucide="file-text" />{selectedPath || "-"}</span>
            <span className="si"><i data-lucide="hard-drive" />{formatBytes(selectedFile.size)}</span>
            <span className="filler" />
            <span className="si"><i data-lucide="lock" />read-only</span>
          </div>
        </section>
      </div>
    </div>
  );
}
