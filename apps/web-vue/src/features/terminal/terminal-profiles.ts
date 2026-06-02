import type {
  TerminalBinaryId,
  TerminalBinaryStatus,
  TerminalLaunchCli,
  TerminalProfileDescriptor,
  TerminalStatusPayload,
} from "../../../../../types/terminal";

export type TerminalProfileMap = Record<string, TerminalProfileDescriptor>;

const AGENT_LAUNCH_CLI_BY_BINARY: Partial<Record<TerminalBinaryId, TerminalLaunchCli>> = {
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
  bash: "bash",
};

const DEFAULT_PROFILE_SPECS: Array<Omit<
  TerminalProfileDescriptor,
  "installed" | "launchable" | "cwd"
>> = [
  {
    id: "local-shell",
    label: "Local Shell",
    labelZh: "本地 Shell",
    description: "Open a plain local shell in the OpenClaw workspace.",
    descriptionZh: "在 OpenClaw 工作区打开普通本地 Shell。",
    kind: "shell",
    targetKind: "local",
    command: "bash",
    binaryId: "bash",
    pinned: true,
    color: "slate",
  },
  {
    id: "agent-codex",
    label: "Codex Agent",
    labelZh: "Codex Agent",
    description: "Launch Codex CLI with the configured default model.",
    descriptionZh: "使用已配置默认模型启动 Codex CLI。",
    kind: "agent",
    targetKind: "local",
    command: "codex",
    binaryId: "codex",
    pinned: true,
    color: "emerald",
  },
  {
    id: "agent-claude",
    label: "Claude Agent",
    labelZh: "Claude Agent",
    description: "Launch Claude CLI with the configured default model.",
    descriptionZh: "使用已配置默认模型启动 Claude CLI。",
    kind: "agent",
    targetKind: "local",
    command: "claude",
    binaryId: "claude",
    pinned: true,
    color: "violet",
  },
  {
    id: "agent-opencode",
    label: "OpenCode Agent",
    labelZh: "OpenCode Agent",
    description: "Launch OpenCode in a dedicated terminal tab.",
    descriptionZh: "在独立终端标签中启动 OpenCode。",
    kind: "agent",
    targetKind: "local",
    command: "opencode",
    binaryId: "opencode",
    pinned: false,
    color: "cyan",
  },
  {
    id: "marketplace-clawhub",
    label: "ClawHub CLI",
    labelZh: "ClawHub CLI",
    description: "Open the OpenClaw marketplace CLI in a terminal tab.",
    descriptionZh: "在终端标签中打开 OpenClaw 技能市场 CLI。",
    kind: "marketplace",
    targetKind: "local",
    command: "clawhub",
    binaryId: "clawhub",
    pinned: false,
    color: "amber",
  },
  {
    id: "marketplace-skillhub",
    label: "SkillHub CLI",
    labelZh: "SkillHub CLI",
    description: "Open the skill dependency marketplace CLI in a terminal tab.",
    descriptionZh: "在终端标签中打开技能依赖市场 CLI。",
    kind: "marketplace",
    targetKind: "local",
    command: "skillhub",
    binaryId: "skillhub",
    pinned: false,
    color: "orange",
  },
  {
    id: "remote-ssh",
    label: "SSH Terminal",
    labelZh: "SSH 终端",
    description: "Reserved remote profile for cloud server terminal targets.",
    descriptionZh: "为云服务器终端目标预留的远程 Profile。",
    kind: "remote",
    targetKind: "ssh",
    command: "ssh",
    binaryId: null,
    pinned: false,
    color: "rose",
  },
];

function binaryInstalled(
  binaryId: TerminalBinaryId | null,
  binaries: TerminalBinaryStatus[],
): boolean {
  if (binaryId === "bash") return true;
  if (!binaryId) return false;
  return Boolean(binaries.find((binary) => binary.id === binaryId)?.installed);
}

export function buildFallbackTerminalProfiles(
  status: TerminalStatusPayload | null,
): TerminalProfileDescriptor[] {
  const binaries = status?.binaries || [];
  return DEFAULT_PROFILE_SPECS.map((profile) => {
    const installed = binaryInstalled(profile.binaryId, binaries);
    return {
      ...profile,
      cwd: null,
      installed,
      launchable: profile.targetKind === "local" && installed,
    };
  });
}

export function normalizeTerminalProfileCatalog(
  profiles: TerminalProfileDescriptor[],
  status: TerminalStatusPayload | null,
): TerminalProfileDescriptor[] {
  const fallback = buildFallbackTerminalProfiles(status);
  const byId = new Map<string, TerminalProfileDescriptor>();

  for (const profile of [...fallback, ...(profiles || [])]) {
    const id = String(profile?.id || "").trim();
    if (!id) continue;
    const targetKind = profile.targetKind || "local";
    const installed = profile.installed ?? binaryInstalled(profile.binaryId, status?.binaries || []);
    byId.set(id, {
      ...profile,
      id,
      label: String(profile.label || id).trim() || id,
      description: String(profile.description || "").trim(),
      command: String(profile.command || "").trim(),
      targetKind,
      cwd: profile.cwd || null,
      binaryId: profile.binaryId || null,
      installed,
      launchable: Boolean(profile.launchable ?? (targetKind === "local" && installed)),
      pinned: Boolean(profile.pinned),
      color: String(profile.color || "slate").trim() || "slate",
    });
  }

  return Array.from(byId.values()).sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.label.localeCompare(right.label);
  });
}

export function createTerminalProfileMap(
  profiles: TerminalProfileDescriptor[],
): TerminalProfileMap {
  return Object.fromEntries(
    profiles
      .filter((profile) => profile.id)
      .map((profile) => [profile.id, profile]),
  );
}

export function resolveProfileLaunchCli(
  profile: TerminalProfileDescriptor | null | undefined,
): TerminalLaunchCli | null {
  if (!profile?.binaryId) return null;
  return AGENT_LAUNCH_CLI_BY_BINARY[profile.binaryId] || null;
}

export function resolveTerminalProfileTitle(
  profile: TerminalProfileDescriptor | null | undefined,
  fallback = "Shell",
): string {
  const label = String(profile?.label || "").trim();
  return label || fallback;
}
