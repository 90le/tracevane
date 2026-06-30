import type { OpenClawSection, PlatformSectionId } from "./types";

export const OPENCLAW_SECTIONS: OpenClawSection[] = [
  {
    id: "overview",
    label: "总览",
    description: "平台身份、健康、边界与关键入口。",
    path: "/platforms/openclaw",
  },
  {
    id: "guard",
    label: "守护",
    description: "OpenClaw/Tracevane substrate guard、恢复、备份与事件。",
    path: "/platforms/openclaw/guard",
  },
  {
    id: "config",
    label: "配置",
    description: "OpenClaw config 摘要、默认模型、MCP 与安全边界。",
    path: "/platforms/openclaw/config",
  },
  {
    id: "agents",
    label: "原生 Agent",
    description:
      "OpenClaw 上游原生 Agent 定义证据；不是 Tracevane CLI Agents 安装/修复页。",
    path: "/platforms/openclaw/agents",
  },
  {
    id: "channels",
    label: "原生渠道",
    description:
      "OpenClaw 上游原生 Channel 配置摘要；不是 Tracevane IM 渠道账号/投递配置。",
    path: "/platforms/openclaw/channels",
  },
  {
    id: "bindings",
    label: "原生绑定",
    description:
      "OpenClaw 上游 Channel 到 Agent/ACP 的静态绑定证据；不是 Tracevane IM 路由绑定。",
    path: "/platforms/openclaw/bindings",
  },
  {
    id: "skills",
    label: "Skills",
    description: "技能安装、启用、缺失依赖与 Agent 映射证据。",
    path: "/platforms/openclaw/skills",
  },
  {
    id: "services",
    label: "服务",
    description: "runtime、daemon、systemd/launchd 服务状态。",
    path: "/platforms/openclaw/services",
  },
  {
    id: "logs",
    label: "日志",
    description: "平台守护事件与近期运行证据。",
    path: "/platforms/openclaw/logs",
  },
  {
    id: "diagnostics",
    label: "诊断",
    description: "system diagnostics、doctor、bootstrap 与设备信任摘要。",
    path: "/platforms/openclaw/diagnostics",
  },
];

const SECTION_IDS = new Set(OPENCLAW_SECTIONS.map((section) => section.id));

export function normalizeOpenClawSection(section?: string): PlatformSectionId {
  if (!section) return "overview";
  if (section === "recovery") return "guard";
  return SECTION_IDS.has(section as PlatformSectionId)
    ? (section as PlatformSectionId)
    : "overview";
}

export function getOpenClawSection(
  section: PlatformSectionId,
): OpenClawSection {
  return (
    OPENCLAW_SECTIONS.find((item) => item.id === section) ??
    OPENCLAW_SECTIONS[0]
  );
}
