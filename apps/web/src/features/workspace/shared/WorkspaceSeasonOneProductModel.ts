export type WorkspaceSeasonOneIconKey =
  | "ai"
  | "code"
  | "command"
  | "evidence"
  | "files"
  | "git"
  | "panel"
  | "run"
  | "search"
  | "stage"
  | "terminal"
  | "timer"
  | "writing";

export interface WorkspaceSeasonOneActivityItem {
  id: string;
  label: string;
  icon: WorkspaceSeasonOneIconKey;
  active?: boolean;
}

export interface WorkspaceSeasonOneResourceItem {
  id: string;
  label: string;
  meta: string;
  state: string;
}

export interface WorkspaceSeasonOnePhase {
  id: string;
  label: string;
  status: "done" | "active" | "next";
  copy: string;
}

export interface WorkspaceSeasonOneInsightCard {
  id: string;
  label: string;
  body: string;
  icon: WorkspaceSeasonOneIconKey;
  tone: "violet" | "amber" | "cyan";
}

export interface WorkspaceSeasonOneProductModel {
  identity: {
    title: string;
    rootLabel: string;
    modeLabel: string;
    commandPlaceholder: string;
    primaryActionLabel: string;
  };
  mission: {
    eyebrow: string;
    title: string;
    body: string;
    currentLabel: string;
    currentBody: string;
    resourceSummary: string;
  };
  activityItems: WorkspaceSeasonOneActivityItem[];
  resources: WorkspaceSeasonOneResourceItem[];
  phases: WorkspaceSeasonOnePhase[];
  aiPartner: {
    title: string;
    badge: string;
    quote: string;
    contextLabel: string;
    contextValue: string;
    nextActionLabel: string;
    nextActionValue: string;
  };
  canvas: {
    fileName: string;
    badge: string;
    writingLabel: string;
    writingBody: string;
    codeSample: string;
  };
  insightCards: WorkspaceSeasonOneInsightCard[];
  evidence: {
    badge: string;
    title: string;
    body: string;
  };
  runPanel: {
    title: string;
    badge: string;
    subtitle: string;
    transcript: string;
  };
  status: {
    branch: string;
    health: string;
    viewportCoverage: string;
    label: string;
  };
  mobileTasks: WorkspaceSeasonOneActivityItem[];
}

export function createWorkspaceSeasonOnePreviewModel(): WorkspaceSeasonOneProductModel {
  return {
    identity: {
      title: "Tracevane Season One",
      rootLabel: "project-root",
      modeLabel: "AI coding + writing studio",
      commandPlaceholder:
        "Ask, search, run, cite evidence, or open any workspace command",
      primaryActionLabel: "AI Handoff",
    },
    mission: {
      eyebrow: "First season rebuild",
      title: "Redesign the Workspace around one live task artifact.",
      body: "The new frame makes the editor or writing canvas dominant. Files, terminal, Git, AI, previews and evidence become task context instead of competing page chrome.",
      currentLabel: "Current mission",
      currentBody: "Replace the IDE shell with a focused AI work surface.",
      resourceSummary: "5 artifacts attached to this task stage",
    },
    activityItems: [
      { id: "files", label: "Files", icon: "files", active: true },
      { id: "search", label: "Search", icon: "search" },
      { id: "git", label: "Git", icon: "git" },
      { id: "run", label: "Run", icon: "terminal" },
      { id: "evidence", label: "Evidence", icon: "evidence" },
    ],
    resources: [
      {
        id: "design",
        label: "DESIGN.md",
        meta: "design contract",
        state: "open",
      },
      {
        id: "workspace",
        label: "apps/web/workspace",
        meta: "frontend shell",
        state: "active",
      },
      {
        id: "acceptance",
        label: "Season One acceptance",
        meta: "desktop · tablet · phone",
        state: "locked",
      },
      {
        id: "evidence",
        label: "Evidence packet",
        meta: "tests · screenshots · diff",
        state: "ready",
      },
      {
        id: "terminal",
        label: "Terminal run",
        meta: "smoke verified",
        state: "clean",
      },
    ],
    phases: [
      {
        id: "frame",
        label: "Frame",
        status: "done",
        copy: "Topbar, rails, stage, panel, status and mobile switcher are separated as replaceable slots.",
      },
      {
        id: "work-stage",
        label: "Work stage",
        status: "active",
        copy: "Coding, writing, preview and AI review converge around one visible task artifact.",
      },
      {
        id: "evidence",
        label: "Evidence",
        status: "next",
        copy: "Every AI handoff must attach files, commands, tests and approval state before apply.",
      },
    ],
    aiPartner: {
      title: "AI Work Partner",
      badge: "cited",
      quote:
        "I can propose a workspace shell change, but I must show attached files, affected tests, viewport coverage and rollback notes before apply.",
      contextLabel: "Context",
      contextValue: "DESIGN.md · Season One plan · browser smoke",
      nextActionLabel: "Next action",
      nextActionValue: "Promote preview slots into live Workspace adapters.",
    },
    canvas: {
      fileName: "WorkspaceShell.tsx",
      badge: "live draft",
      writingLabel: "Writing brief",
      writingBody:
        "Season One is not a page refresh. It is a new interaction model: task-first, evidence-aware, keyboard-native, and readable on every viewport.",
      codeSample: `<WorkspaceSeasonOneFrame
  topbar={<CommandCenter />}
  resources={<TaskContext />}
  stage={<EditorAndDraft />}
  contextRail={<EvidenceRail />}
  bottomPanel={<RunPanel />}
/>`,
    },
    insightCards: [
      {
        id: "review-loop",
        label: "Review loop",
        body: "Human notes, AI proposals and evidence review stay beside the work instead of hiding in another page.",
        icon: "ai",
        tone: "violet",
      },
      {
        id: "recovery-model",
        label: "Recovery model",
        body: "Layout reset, staged apply and rollback affordances are designed into the shell from day one.",
        icon: "timer",
        tone: "amber",
      },
    ],
    evidence: {
      badge: "Evidence",
      title: "Approval cockpit",
      body: "The right rail is for proof, risk and handoff state—not another decorative sidebar.",
    },
    runPanel: {
      title: "Run panel",
      badge: "verified",
      subtitle: "terminal · tests · agent runs",
      transcript: `binbin@tracevane:~/workspace$ npm run verify:workspace-season-one
✓ desktop frame: command center, resource map, evidence rail
✓ tablet frame: two-column task shell
✓ phone frame: single-stage with mobile task switcher`,
    },
    status: {
      branch: "main",
      health: "evidence ready",
      viewportCoverage: "desktop · tablet · phone",
      label: "Season One Frame Preview",
    },
    mobileTasks: [
      { id: "files", label: "Files", icon: "files" },
      { id: "stage", label: "Stage", icon: "code" },
      { id: "ai", label: "AI", icon: "ai" },
      { id: "evidence", label: "Evidence", icon: "evidence" },
      { id: "run", label: "Run", icon: "run" },
    ],
  };
}
