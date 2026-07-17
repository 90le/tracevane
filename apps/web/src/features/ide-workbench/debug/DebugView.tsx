import * as React from "react";
import {
  ArrowDownToDot,
  ArrowUpFromDot,
  Bug,
  Circle,
  CircleDot,
  CircleStop,
  ExternalLink,
  ListTree,
  Pause,
  Play,
  SkipForward,
  SquareTerminal,
  Trash2,
  Variable,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { PanelSectionLabel, SidebarViewHeader } from "../panelHeader";
import { controlIdeDebugSession, createIdeDebugSession, stopIdeDebugSession } from "./debugClient";
import {
  removeDebugBreakpoint,
  setDebugBreakpointEnabled,
  upsertDebugSession,
  useIdeDebugSnapshot,
} from "./debugStore";
import type { DebugControlAction, DebugLaunchProfile, DebugSourceLocation } from "../../../../../../types/debug";

export function IdeDebugView({
  hidden,
  rootId,
  cwd,
  activeFile,
  onOpenDebugConsole,
  onOpenLocation,
}: {
  hidden: boolean;
  rootId: string;
  cwd: string;
  activeFile?: { rootId: string; path: string } | null;
  onOpenDebugConsole: () => void;
  onOpenLocation: (location: DebugSourceLocation) => void;
}) {
  const snapshot = useIdeDebugSnapshot();
  const [busy, setBusy] = React.useState(false);
  const debugUnavailable = snapshot.connectionState === "unavailable";
  const profiles = snapshot.status?.supportedProfiles ?? [];
  const [selectedProfileId, setSelectedProfileId] = React.useState("mock-node");
  const [launchArgsText, setLaunchArgsText] = React.useState("");
  const [launchEnvText, setLaunchEnvText] = React.useState("");
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const activeSession = snapshot.sessions.find((session) => !["terminated", "disconnected"].includes(session.state)) ?? snapshot.sessions[0] ?? null;
  const stackFrames = activeSession ? snapshot.stackFramesBySessionId[activeSession.id] ?? [] : [];
  const scopes = activeSession ? snapshot.scopesBySessionId[activeSession.id] ?? [] : [];
  const variables = activeSession ? snapshot.variablesBySessionId[activeSession.id] ?? [] : [];

  React.useEffect(() => {
    if (!profiles.length) return;
    if (!profiles.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(profiles[0]?.id ?? "mock-node");
    }
  }, [profiles, selectedProfileId]);

  const handleStart = React.useCallback(async () => {
    if (!rootId || busy) return;
    setBusy(true);
    try {
      const payload = await createIdeDebugSession({
        rootId,
        cwd,
        name: `Mock Debug ${snapshot.sessions.length + 1}`,
        breakpoints: snapshot.breakpoints.filter((breakpoint) => breakpoint.enabled !== false),
      });
      upsertDebugSession(payload.session);
      if (payload.session.activeLocation) onOpenLocation(payload.session.activeLocation);
    } finally {
      setBusy(false);
    }
  }, [busy, cwd, onOpenLocation, rootId, snapshot.breakpoints, snapshot.sessions.length]);

  const handleStartAdapterProof = React.useCallback(async () => {
    if (!rootId || !activeFile || busy) return;
    setBusy(true);
    try {
      const payload = await createIdeDebugSession({
        rootId,
        cwd,
        profileId: "node-lite",
        program: activeFile.path,
        name: `Node Lite ${snapshot.sessions.length + 1}`,
        breakpoints: snapshot.breakpoints.filter((breakpoint) => breakpoint.enabled !== false),
      });
      upsertDebugSession(payload.session);
      if (payload.session.activeLocation) onOpenLocation(payload.session.activeLocation);
    } finally {
      setBusy(false);
    }
  }, [activeFile, busy, cwd, onOpenLocation, rootId, snapshot.breakpoints, snapshot.sessions.length]);

  const handleStartSelectedProfile = React.useCallback(async () => {
    if (!rootId || !selectedProfile || busy) return;
    if (selectedProfile.requiresProgram && !activeFile) return;
    setBusy(true);
    try {
      const payload = await createIdeDebugSession({
        rootId,
        cwd,
        profileId: selectedProfile.id,
        program: selectedProfile.requiresProgram ? activeFile?.path ?? null : null,
        name: `${selectedProfile.label} ${snapshot.sessions.length + 1}`,
        args: parseLaunchArgs(launchArgsText, selectedProfile),
        env: parseLaunchEnv(launchEnvText, selectedProfile),
        breakpoints: snapshot.breakpoints.filter((breakpoint) => breakpoint.enabled !== false),
      });
      upsertDebugSession(payload.session);
      if (payload.session.activeLocation) onOpenLocation(payload.session.activeLocation);
    } finally {
      setBusy(false);
    }
  }, [
    activeFile,
    busy,
    cwd,
    launchArgsText,
    launchEnvText,
    onOpenLocation,
    rootId,
    selectedProfile,
    snapshot.breakpoints,
    snapshot.sessions.length,
  ]);

  const handleStop = React.useCallback(async () => {
    if (!activeSession || ["terminating", "terminated", "disconnected"].includes(activeSession.state) || busy) return;
    setBusy(true);
    try {
      const payload = await stopIdeDebugSession(activeSession.id);
      upsertDebugSession(payload.session);
    } finally {
      setBusy(false);
    }
  }, [activeSession, busy]);

  const handleControl = React.useCallback(async (action: DebugControlAction) => {
    if (!activeSession || busy) return;
    setBusy(true);
    try {
      const payload = await controlIdeDebugSession(activeSession.id, action);
      upsertDebugSession(payload.session);
      if (payload.session.activeLocation) onOpenLocation(payload.session.activeLocation);
    } finally {
      setBusy(false);
    }
  }, [activeSession, busy, onOpenLocation]);

  const canStopActiveSession = Boolean(activeSession && !["terminating", "terminated", "disconnected"].includes(activeSession.state));
  const canContinue = Boolean(activeSession && activeSession.state === "stopped");
  const canPause = Boolean(activeSession && activeSession.state === "running");
  const canStep = canContinue;

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;

  return (
    <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-r border-line bg-panel" data-ide-sidebar data-ide-debug-view>
      <div className="min-w-0 overflow-hidden border-b border-line">
        <SidebarViewHeader
          icon={<Bug />}
          title="运行和调试"
          subtitle={(
            <span data-ide-debug-status>
              {snapshot.connectionState === "connected" ? "Debug Gateway 已连接" : snapshot.message ?? "Debug Gateway 等待连接"}
            </span>
          )}
        />
        {debugUnavailable ? (
          <div className="px-2.5 pb-2">
            <ErrorState
              className="gap-1.5 rounded-md border border-dashed border-danger-line bg-danger-soft px-3 py-4"
              title="网关单端口模式下不可用"
              description="调试实时通道使用原始 WebSocket（/ws/debug），OpenClaw 网关单端口模式不会把 WS 升级转发给插件，且暂无对应的 gateway RPC 桥接。调试启动、断点命中、调用栈与变量均依赖该通道，因此已在当前模式下停用；请在 Tracevane 独立端口模式下使用调试功能。"
              data-ide-debug-gateway-unavailable
            />
          </div>
        ) : null}
      </div>
      <div className="min-h-0 overflow-auto overscroll-contain p-2 [scrollbar-width:thin]">
        <PanelSectionLabel className="px-1">启动</PanelSectionLabel>
        <div className="mb-4 grid min-w-0 gap-2">
          <div className="rounded-md border border-line bg-panel-2 p-2 shadow-sm" data-ide-debug-launch-config>
            <label className="block text-xs font-medium text-subtle" htmlFor="ide-debug-profile-select">启动配置</label>
            <select
              id="ide-debug-profile-select"
              className="mt-1 h-8 w-full rounded-md border border-line bg-panel px-2 text-sm text-ink-strong outline-none focus:border-primary-line focus-visible:shadow-[var(--ring)]"
              value={selectedProfile?.id ?? selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
              data-ide-debug-profile-select
            >
              {profiles.length ? profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.label}</option>
              )) : (
                <option value="mock-node">Mock Node Debugger</option>
              )}
            </select>
            <div className="mt-1 truncate text-2xs text-muted" data-ide-debug-profile-description>
              {selectedProfile?.description ?? "正在读取可用调试配置…"}
            </div>
            <input
              className="mt-2 h-8 w-full rounded-md border border-line bg-panel px-2 font-mono text-xs text-ink-strong outline-none placeholder:text-muted focus:border-primary-line focus-visible:shadow-[var(--ring)] disabled:opacity-60"
              value={launchArgsText}
              onChange={(event) => setLaunchArgsText(event.target.value)}
              placeholder="args: --flag value"
              aria-label="调试启动参数"
              disabled={!selectedProfile?.allowArgs}
              data-ide-debug-launch-args
            />
            <textarea
              className="mt-2 min-h-14 w-full resize-y rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs text-ink-strong outline-none placeholder:text-muted focus:border-primary-line focus-visible:shadow-[var(--ring)] disabled:opacity-60"
              value={launchEnvText}
              onChange={(event) => setLaunchEnvText(event.target.value)}
              placeholder={"ENV_KEY=value\nTRACEVANE_SMOKE=1"}
              aria-label="调试环境变量"
              disabled={!selectedProfile?.allowEnv}
              data-ide-debug-launch-env
            />
            <Button
              className="mt-2 w-full min-w-0 justify-center"
              size="sm"
              variant="primary"
              onClick={handleStartSelectedProfile}
              disabled={debugUnavailable || !rootId || !selectedProfile || (selectedProfile.requiresProgram && !activeFile) || busy}
              title={selectedProfile?.requiresProgram && !activeFile ? "先在编辑器中打开一个 JavaScript/TypeScript 文件" : "使用所选启动配置开始调试"}
              data-ide-debug-launch-start
            >
              <Play />
              启动所选配置
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={handleStart} disabled={debugUnavailable || !rootId || busy} title="使用内置 Mock 调试器验证断点与生命周期" data-ide-debug-start>
              <Play />
              启动 Mock
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartAdapterProof}
              disabled={debugUnavailable || !rootId || !activeFile || busy}
              title={activeFile ? `使用 Node Lite 调试 ${activeFile.path}` : "先在编辑器中打开一个 JavaScript/TypeScript 文件"}
              data-ide-debug-adapter-start
            >
              <Play />
              Node Lite
            </Button>
          </div>
          <div className="flex min-w-0 items-center gap-1 rounded-md border border-line bg-panel-2 p-1 shadow-sm" data-ide-debug-controls>
            <DebugToolbarButton icon={<Play />} label="继续" disabled={!canContinue || busy} onClick={() => handleControl("continue")} dataAttr="data-ide-debug-control-continue" />
            <DebugToolbarButton icon={<Pause />} label="暂停" disabled={!canPause || busy} onClick={() => handleControl("pause")} dataAttr="data-ide-debug-control-pause" />
            <DebugToolbarButton icon={<SkipForward />} label="单步跳过" disabled={!canStep || busy} onClick={() => handleControl("stepOver")} dataAttr="data-ide-debug-control-step-over" />
            <DebugToolbarButton icon={<ArrowDownToDot />} label="单步进入" disabled={!canStep || busy} onClick={() => handleControl("stepInto")} dataAttr="data-ide-debug-control-step-into" />
            <DebugToolbarButton icon={<ArrowUpFromDot />} label="单步跳出" disabled={!canStep || busy} onClick={() => handleControl("stepOut")} dataAttr="data-ide-debug-control-step-out" />
            <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
            <DebugToolbarButton icon={<CircleStop />} label="停止" tone="danger" disabled={!canStopActiveSession || busy} onClick={() => void handleStop()} dataAttr="data-ide-debug-stop" />
          </div>
          <div className="flex min-w-0 items-center gap-2 px-1">
            <span className="min-w-0 flex-1 truncate text-2xs text-muted" data-ide-debug-active-file>
              当前文件：{activeFile?.path ?? "未打开文件"}
            </span>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-sm text-2xs text-primary outline-none hover:underline focus-visible:shadow-[var(--ring)]"
              onClick={onOpenDebugConsole}
              data-ide-debug-open-console
            >
              <SquareTerminal className="size-3.5" />
              打开调试控制台
            </button>
          </div>
        </div>

        <PanelSectionLabel className="px-1">
          断点
          <span className="rounded-full bg-panel-3 px-1.5 py-px text-2xs tabular-nums text-muted">{snapshot.breakpoints.length}</span>
        </PanelSectionLabel>
        {snapshot.breakpoints.length ? (
          <div className="mb-4 grid gap-1">
            {snapshot.breakpoints.map((breakpoint) => {
              const active = snapshot.activeStoppedLocation
                ? breakpoint.rootId === snapshot.activeStoppedLocation.rootId
                  && breakpoint.path === snapshot.activeStoppedLocation.path
                  && breakpoint.lineNumber === snapshot.activeStoppedLocation.lineNumber
                : false;
              return (
                <div
                  key={`${breakpoint.rootId}:${breakpoint.path}:${breakpoint.lineNumber}`}
                  className={cn(
                    "group flex min-w-0 items-center gap-2 rounded-md border bg-panel-2 px-2 py-1.5",
                    active ? "border-primary-line bg-primary-soft/40" : "border-line",
                  )}
                  data-ide-debug-breakpoint-row
                  data-ide-debug-breakpoint-path={breakpoint.path}
                  data-ide-debug-breakpoint-line={breakpoint.lineNumber}
                  data-ide-debug-breakpoint-active={active ? "true" : "false"}
                >
                  <button
                    type="button"
                    className="shrink-0 rounded-sm text-danger outline-none hover:bg-danger-soft focus-visible:shadow-[var(--ring)]"
                    aria-label={breakpoint.enabled === false ? "启用断点" : "禁用断点"}
                    title={breakpoint.enabled === false ? "启用断点" : "禁用断点"}
                    onClick={() => setDebugBreakpointEnabled(breakpoint, breakpoint.enabled === false)}
                  >
                    {breakpoint.enabled === false ? <Circle className="size-4" /> : <CircleDot className="size-4" />}
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-mono text-xs text-ink-strong outline-none hover:text-primary focus-visible:shadow-[var(--ring)]"
                    onClick={() => onOpenLocation(breakpoint)}
                  >
                    {breakpoint.path}:{breakpoint.lineNumber}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-sm p-1 text-muted opacity-0 outline-none hover:bg-panel-2 hover:text-primary focus-visible:opacity-100 focus-visible:shadow-[var(--ring)] group-hover:opacity-100"
                    aria-label="打开断点位置"
                    onClick={() => onOpenLocation(breakpoint)}
                  >
                    <ExternalLink className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-sm p-1 text-muted opacity-0 outline-none hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 focus-visible:shadow-[var(--ring)] group-hover:opacity-100"
                    aria-label="删除断点"
                    onClick={() => removeDebugBreakpoint(breakpoint)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-dashed border-line bg-canvas p-3 text-xs text-muted" data-ide-debug-breakpoints-empty>
            在编辑器行号栏点击可添加断点；启动调试后会停在首个启用的断点。
          </div>
        )}

        <PanelSectionLabel className="px-1">
          会话
          <span className="rounded-full bg-panel-3 px-1.5 py-px text-2xs tabular-nums text-muted">{snapshot.sessions.length}</span>
        </PanelSectionLabel>
        {snapshot.sessions.length ? (
          <div className="mb-4 grid gap-1.5">
            {snapshot.sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-md border border-line bg-panel-2 px-2 py-2 text-sm shadow-sm"
                data-ide-debug-session
                data-ide-debug-session-state={session.state}
                data-ide-debug-session-profile={session.profileId}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", debugStateDotClass(session.state))} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink-strong">{session.name}</span>
                  <span className="shrink-0 rounded-sm border border-line bg-panel px-1.5 py-0.5 text-2xs text-muted">{session.state}</span>
                </div>
                <div className="mt-1 truncate text-xs text-subtle" data-ide-debug-session-lifecycle>
                  lifecycle: {session.lifecycleEvent ?? session.state}
                  {session.terminationReason ? ` · reason: ${session.terminationReason}` : ""}
                </div>
                <div className="mt-1 truncate font-mono text-2xs text-muted">cwd: {session.cwd || "."}</div>
                {session.program ? <div className="mt-1 truncate font-mono text-2xs text-muted">program: {session.program}</div> : null}
                {session.launchArgs?.length ? <div className="mt-1 truncate font-mono text-2xs text-muted" data-ide-debug-session-args>args: {session.launchArgs.length}</div> : null}
                {session.launchEnvKeys?.length ? <div className="mt-1 truncate font-mono text-2xs text-muted" data-ide-debug-session-env>env: {session.launchEnvKeys.join(", ")}</div> : null}
                {session.lastError ? <div className="mt-1 text-xs text-danger" data-ide-debug-session-error>{session.lastError}</div> : null}
                {session.message ? <div className="mt-1 text-xs text-subtle">{session.message}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-dashed border-line bg-canvas p-3 text-xs text-muted" data-ide-debug-empty>
            还没有调试会话。请选择启动配置后开始调试。
          </div>
        )}

        <PanelSectionLabel className="px-1">
          <ListTree className="size-3.5" aria-hidden />
          调用堆栈
        </PanelSectionLabel>
        {stackFrames.length ? (
          <div className="mb-4 grid gap-1">
            {stackFrames.map((frame) => (
              <button
                key={`${activeSession?.id ?? "session"}:${frame.id}`}
                type="button"
                className="w-full rounded-md border border-transparent px-2 py-1.5 text-left outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
                onClick={() => onOpenLocation(frame.source)}
                data-ide-debug-stack-frame
              >
                <div className="truncate text-xs font-medium text-ink-strong">{frame.name}</div>
                <div className="truncate font-mono text-2xs text-muted">{frame.source.path}:{frame.source.lineNumber}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-dashed border-line bg-canvas p-3 text-xs text-muted" data-ide-debug-stack-empty>
            调试会话停止后会显示调用栈。
          </div>
        )}

        <PanelSectionLabel className="px-1">
          <Variable className="size-3.5" aria-hidden />
          变量
        </PanelSectionLabel>
        {scopes.length ? (
          <div className="mb-4 grid gap-2" data-ide-debug-scopes>
            {scopes.map((scope) => (
              <div
                key={`${activeSession?.id ?? "session"}:${scope.name}`}
                className="overflow-hidden rounded-md border border-line bg-panel-2 shadow-sm"
                data-ide-debug-scope
                data-ide-debug-scope-name={scope.name}
              >
                <div className="border-b border-line bg-panel-3 px-2 py-1.5 text-xs font-semibold text-ink-strong">
                  {scope.name}
                </div>
                <div className="grid gap-1 p-2">
                  {scope.variables.map((variable) => (
                    <div
                      key={`${scope.name}:${variable.name}`}
                      className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2 text-xs"
                      data-ide-debug-scope-variable
                      data-ide-debug-scope-variable-name={variable.name}
                    >
                      <span className="truncate font-medium text-ink-strong">{variable.name}</span>
                      <span className="truncate font-mono text-muted" title={variable.value}>{variable.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-dashed border-line bg-canvas p-3 text-xs text-muted" data-ide-debug-scopes-empty>
            调试会话停止后会显示作用域分组。
          </div>
        )}

        <PanelSectionLabel className="px-1">原始变量</PanelSectionLabel>
        {variables.length ? (
          <div className="grid gap-1">
            {variables.map((variable) => (
              <div
                key={`${activeSession?.id ?? "session"}:${variable.name}`}
                className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2 rounded-md border border-line bg-panel-2 px-2 py-1.5 text-xs"
                data-ide-debug-variable
                data-ide-debug-variable-name={variable.name}
              >
                <span className="truncate font-medium text-ink-strong">{variable.name}</span>
                <span className="truncate font-mono text-muted" title={variable.value}>{variable.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-line bg-canvas p-3 text-xs text-muted" data-ide-debug-variables-empty>
            调试会话停止后会显示变量快照。
          </div>
        )}
      </div>
    </aside>
  );
}

function DebugToolbarButton({
  icon,
  label,
  tone = "default",
  disabled = false,
  onClick,
  dataAttr,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  onClick: () => void;
  dataAttr: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-sm text-muted outline-none transition-colors",
        "hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        tone === "danger" && "text-danger hover:bg-danger-soft hover:text-danger",
        "[&_svg]:size-4",
      )}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...{ [dataAttr]: "true" }}
    >
      {icon}
    </button>
  );
}

function debugStateDotClass(state: string): string {
  if (state === "terminated" || state === "disconnected") return "bg-muted";
  if (state === "error") return "bg-danger";
  if (state === "stopped") return "bg-warning";
  if (state === "terminating") return "bg-subtle";
  if (state === "initializing" || state === "configured") return "bg-info";
  return "bg-primary";
}

function parseLaunchArgs(value: string, profile: DebugLaunchProfile): string[] {
  if (!profile.allowArgs) return [];
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean).slice(0, profile.maxArgs ?? 16);
}

function parseLaunchEnv(value: string, profile: DebugLaunchProfile): Record<string, string> {
  if (!profile.allowEnv) return {};
  const result: Record<string, string> = {};
  const maxEnv = profile.maxEnv ?? 32;
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const envValue = trimmed.slice(separator + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    result[key] = envValue;
    if (Object.keys(result).length >= maxEnv) break;
  }
  return result;
}
