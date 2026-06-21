import * as React from "react";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type PlatformTone = "ok" | "warn" | "info";

interface PlatformCard {
  id: string;
  title: string;
  category: string;
  icon: string;
  tone: PlatformTone;
  summary: string;
  boundary: string;
  primaryLabel: string;
  primaryRoute: string;
  secondaryLabel?: string;
  secondaryRoute?: string;
}

function platformToneClass(tone: PlatformTone): string {
  if (tone === "ok") return "ok";
  if (tone === "warn") return "warn";
  return "info";
}

function PlatformCardView({ item }: { item: PlatformCard }) {
  const navigate = useNavigate();
  return (
    <section className="panel platform-card">
      <div className="panel-head">
        <div className="detail-title">
          <span className="rico r-primary"><i data-lucide={item.icon} /></span>
          <div className="htitle">
            <h3>{item.title}</h3>
            <span className="sub">{item.category}</span>
          </div>
        </div>
        <span className={`tag ${platformToneClass(item.tone)}`}>{item.tone === "ok" ? "已连接" : item.tone === "warn" ? "需关注" : "规划中"}</span>
      </div>
      <div className="panel-body platform-card-body">
        <p>{item.summary}</p>
        <div className="platform-boundary">{item.boundary}</div>
        <div className="row-actions">
          <button className="btn-primary btn-sm" onClick={() => navigate(item.primaryRoute)}>
            <i data-lucide="arrow-right" />
            {item.primaryLabel}
          </button>
          {item.secondaryRoute ? (
            <button className="btn-ghost btn-sm" onClick={() => navigate(item.secondaryRoute || "/platforms")}>
              {item.secondaryLabel || "查看主流程"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PlatformIntegrationsPage() {
  const shell = useShell();
  const health = useQuery({ queryKey: ["platforms", "health"], queryFn: () => apiJson<Record<string, unknown>>("/api/system/health"), retry: false });
  const recovery = useQuery({ queryKey: ["platforms", "recovery"], queryFn: () => apiJson<Record<string, unknown>>("/api/openclaw-recovery/status"), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [health.data, recovery.data, shell]);

  const openClawHealthy = recovery.data?.status === "healthy" || health.data?.gateway === "online";
  const cards: PlatformCard[] = [
    {
      id: "openclaw",
      title: "OpenClaw",
      category: "底层运行时 / Control UI / CLI",
      icon: "server",
      tone: openClawHealthy ? "ok" : "warn",
      summary: "维护 Tracevane 依赖的 OpenClaw 配置、扩展、服务和 Doctor/Recovery。",
      boundary: "OpenClaw 是底层平台支撑，不是 Tracevane 主产品入口；会话、网关、IM 投递和 IDE 留在主工作台。",
      primaryLabel: "管理 OpenClaw",
      primaryRoute: "/platforms/openclaw",
      secondaryLabel: "自愈守护",
      secondaryRoute: "/recovery",
    },
    {
      id: "mcp",
      title: "MCP",
      category: "外部工具协议",
      icon: "plug-zap",
      tone: "info",
      summary: "平台集成只展示 MCP server 身份、能力和健康。MCP 工具使用、任务编排和证据仍属于主线工作流。",
      boundary: "不要把 MCP 做成平台大杂烩；具体工具调用应回到外部连接或任务工作台。",
      primaryLabel: "查看外部连接",
      primaryRoute: "/external",
    },
    {
      id: "messaging",
      title: "Feishu / Octo / Webhook",
      category: "消息平台账号与机器人身份",
      icon: "radio-tower",
      tone: "info",
      summary: "平台集成只管账号、权限、机器人身份和底层健康；IM 任务流、绑定和投递仍在渠道连接。",
      boundary: "渠道连接是 Tracevane 核心任务页，不迁移进平台集成。",
      primaryLabel: "查看 IM 渠道",
      primaryRoute: "/im-channels",
    },
    {
      id: "agent-tools",
      title: "Codex / Claude Code / OpenCode",
      category: "外部 Agent CLI 能力",
      icon: "bot",
      tone: "info",
      summary: "平台集成只展示 CLI 安装、版本、session driver 和能力探测；运行任务仍在 CLI Agents / 会话工作台。",
      boundary: "第三方 Agent CLI 是执行底座，不应吞并 Tracevane 的任务控制面。",
      primaryLabel: "查看 CLI Agents",
      primaryRoute: "/cli-agents",
    },
    {
      id: "model-vendors",
      title: "OpenAI / Anthropic / GLM 等",
      category: "模型厂商账号与协议入口",
      icon: "route",
      tone: "info",
      summary: "平台集成只做厂商账号/凭据健康摘要；Provider、模型、路由、用量仍归模型网关。",
      boundary: "模型网关是 Tracevane 核心产品域，不作为第三方平台配置页折叠。",
      primaryLabel: "查看模型网关",
      primaryRoute: "/model-gateway",
    },
  ];

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap platforms-page">
        <section className="hero platform-hero">
          <div className="hero-top">
            <span className={`ready-chip ${openClawHealthy ? "ok" : "warn"}`}><i data-lucide="boxes" />平台集成</span>
            <span className="hero-time">third-party platforms stay behind explicit boundaries</span>
          </div>
          <h1>第三方平台只做接入、健康、凭据和诊断，不吞并 Tracevane 主任务流。</h1>
          <p className="hero-sub">OpenClaw 是第一个深度平台。后续 GitHub、MCP、消息平台、Agent CLI、模型厂商都按同一规则进入这里：低频平台管理在这里，日常工作流留在各自产品域。</p>
          <div className="hero-stats platform-stats">
            <div className="hero-stat"><span className="lab"><i data-lucide="server" />OpenClaw</span><span className="val">{openClawHealthy ? "ready" : "check"}</span><span className="trend flat"><i data-lucide="minus" />运行时平台</span></div>
            <div className="hero-stat"><span className="lab"><i data-lucide="plug-zap" />MCP</span><span className="val">main</span><span className="trend flat"><i data-lucide="minus" />能力仍归外部连接</span></div>
            <div className="hero-stat"><span className="lab"><i data-lucide="radio-tower" />IM</span><span className="val">main</span><span className="trend flat"><i data-lucide="minus" />任务流仍归渠道</span></div>
          </div>
        </section>
        <div className="platform-grid">
          {cards.map((item) => <PlatformCardView key={item.id} item={item} />)}
        </div>
      </div>
    </div>
  );
}
