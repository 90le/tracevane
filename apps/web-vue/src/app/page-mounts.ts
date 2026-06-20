import type { ShellApi } from "./shell-context";

type Cleanup = () => void;

function on<K extends keyof HTMLElementEventMap>(node: Element | Document | Window | null, type: K, handler: (event: HTMLElementEventMap[K]) => void): Cleanup {
  if (!node) return () => undefined;
  node.addEventListener(type, handler as EventListener);
  return () => node.removeEventListener(type, handler as EventListener);
}

function setActive(nodes: Iterable<Element>, active: Element) {
  Array.from(nodes).forEach((node) => node.classList.toggle("on", node === active));
}

function showTab(container: ParentNode, name: string) {
  container.querySelectorAll<HTMLElement>("[data-tabpanel]").forEach((panel) => {
    panel.hidden = panel.getAttribute("data-tabpanel") !== name;
  });
}

function switchView(stage: HTMLElement, view: string) {
  stage.querySelectorAll<HTMLElement>("[data-view-btn]").forEach((button) => {
    button.classList.toggle("on", button.getAttribute("data-view-btn") === view);
  });
  stage.querySelectorAll<HTMLElement>("[data-view]").forEach((panel) => {
    panel.classList.toggle("on", panel.getAttribute("data-view") === view);
  });
}

function dashboardMount(stage: HTMLElement, shell: ShellApi): Cleanup {
  const grid = stage.querySelector<HTMLElement>("#connGrid");
  const seg = stage.querySelector<HTMLElement>("#connStateDemo");
  if (!grid || !seg) return () => undefined;
  const saved = grid.innerHTML;
  return on(seg, "click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-cstate]");
    if (!button) return;
    setActive(seg.children, button);
    const state = button.dataset.cstate;
    if (state === "data") {
      grid.innerHTML = saved;
      shell.refreshIcons();
    } else if (state === "loading") {
      shell.states(grid, "skeleton-cards", { count: 3 });
    } else if (state === "empty") {
      shell.states(grid, "empty", {
        title: "暂无接入数据",
        desc: "还没有配置 Provider 或渠道。",
        action: '<button class="btn-primary btn-sm" data-route="model-gateway"><i data-lucide="plus"></i>配置模型网关</button>',
        icon: "plug-zap",
      });
    } else if (state === "error") {
      shell.states(grid, "error", {
        title: "接入数据加载失败",
        desc: "无法连接到聚合接口，请稍后重试。",
        onRetry: () => {
          Array.from(seg.children).forEach((node) => node.classList.toggle("on", (node as HTMLElement).dataset.cstate === "data"));
          grid.innerHTML = saved;
          shell.refreshIcons();
        },
      });
    }
  });
}

function modelGatewayMount(stage: HTMLElement, shell: ShellApi): Cleanup {
  const cleanups: Cleanup[] = [];
  stage.querySelectorAll<HTMLElement>("[data-view-btn],[data-go-view]").forEach((button) => {
    cleanups.push(on(button, "click", () => {
      const view = button.getAttribute("data-view-btn") || button.getAttribute("data-go-view");
      if (view) switchView(stage, view);
    }));
  });

  const providers: Record<string, [string, string, "manual" | "account"]> = {
    glm: ["GLM 智谱", "native + openai · 2 endpoint · 手动", "manual"],
    codex: ["Codex 账号", "responses · 账号池 ×2", "account"],
    anthropic: ["Anthropic", "messages · claude-3.7-sonnet · 手动", "manual"],
    local: ["本地 vLLM", "openai 兼容 · 熔断 · 手动", "manual"],
  };
  stage.querySelectorAll<HTMLElement>(".trow[data-row]").forEach((row) => {
    cleanups.push(on(row, "click", () => {
      stage.querySelectorAll(".trow[data-row]").forEach((node) => node.classList.remove("sel"));
      row.classList.add("sel");
      const provider = providers[row.getAttribute("data-row") || ""];
      if (!provider) return;
      const name = stage.querySelector<HTMLElement>("#dName");
      const sub = stage.querySelector<HTMLElement>("#dSub");
      if (name) name.textContent = provider[0];
      if (sub) sub.textContent = provider[1];
      const accountSubView = stage.querySelector<HTMLElement>("#providerSubViews");
      if (accountSubView) accountSubView.hidden = provider[2] !== "account";
    }));
  });

  const deleteButtons = ["#deleteProviderBtn", "#deleteProviderBtn2"].map((selector) => stage.querySelector<HTMLElement>(selector)).filter(Boolean) as HTMLElement[];
  deleteButtons.forEach((button) => cleanups.push(on(button, "click", () => shell.openDialog({
    tone: "danger",
    icon: "trash-2",
    title: "删除 Provider？",
    okLabel: "删除",
    body: "将删除该 Provider 的 endpoint 与模型 alias。已应用到客户端的连接不会静默改写。",
    onConfirm: () => shell.toast("Provider 删除已进入待应用队列", "warn"),
  }))));

  const saveProvider = stage.querySelector<HTMLElement>("#saveProviderBtn");
  cleanups.push(on(saveProvider, "click", () => {
    shell.toast("Provider 配置已保存", "ok");
    switchView(stage, "providers");
  }));

  const setSecret = stage.querySelector<HTMLElement>("#setSecretBtn");
  cleanups.push(on(setSecret, "click", () => shell.openDialog({
    tone: "warn",
    icon: "key-round",
    title: "更新密钥引用",
    okLabel: "继续",
    body: "浏览器只提交 secretRef 与掩码提示，真实密钥写入仍由服务端安全流程处理。",
    onConfirm: () => shell.toast("密钥更新流程已打开", "info"),
  })));

  return () => cleanups.forEach((cleanup) => cleanup());
}

function ideMount(stage: HTMLElement, shell: ShellApi): Cleanup {
  const cleanups: Cleanup[] = [];
  const workbench = stage.querySelector<HTMLElement>("#workbench");
  const labels: Record<string, string> = { files: "资源管理器", search: "搜索", git: "Git", evidence: "证据", ai: "AI 动作" };
  stage.querySelectorAll<HTMLElement>(".wb-act[data-pane]").forEach((button) => {
    cleanups.push(on(button, "click", () => {
      stage.querySelectorAll(".wb-act[data-pane]").forEach((node) => node.classList.remove("on"));
      button.classList.add("on");
      const pane = button.getAttribute("data-pane") || "files";
      stage.querySelectorAll<HTMLElement>("[data-pane-content]").forEach((panel) => {
        panel.hidden = panel.getAttribute("data-pane-content") !== pane;
      });
      const label = stage.querySelector<HTMLElement>("#treeToggleLabel");
      if (label) label.textContent = labels[pane] || "面板";
    }));
  });
  cleanups.push(on(stage.querySelector("#treeToggle"), "click", () => workbench?.classList.toggle("tree-open")));
  const code: Record<string, string> = {
    "routes.ts": '<span class="ln">1</span><span class="cm">// model gateway routes</span>\n<span class="ln">2</span><span class="kw">export function</span> <span class="fn">registerModelGatewayRoutes</span>(router) {\n<span class="ln">3</span>  router.<span class="fn">get</span>(<span class="st">"/api/model-gateway/status"</span>, handler);\n<span class="ln">4</span>}',
    "service.ts": '<span class="ln">1</span><span class="cm">// gateway service</span>\n<span class="ln">2</span><span class="kw">export class</span> <span class="fn">ModelGatewayService</span> {}',
  };
  stage.querySelectorAll<HTMLElement>(".wb-tree .tree-item[data-file], .wb-tab[data-file]").forEach((item) => {
    cleanups.push(on(item, "click", () => {
      const name = item.getAttribute("data-file") || "";
      stage.querySelectorAll<HTMLElement>(".wb-tab").forEach((tab) => tab.classList.toggle("on", tab.getAttribute("data-file") === name));
      stage.querySelectorAll<HTMLElement>(".wb-tree .tree-item").forEach((tab) => tab.classList.toggle("on", tab.getAttribute("data-file") === name));
      const codeNode = stage.querySelector<HTMLElement>("#wbCode");
      if (codeNode && code[name]) codeNode.innerHTML = code[name];
    }));
  });
  const panelTabs = stage.querySelector<HTMLElement>("#panelTabs");
  cleanups.push(on(panelTabs, "click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-panel-tab]");
    if (!button || !panelTabs) return;
    setActive(panelTabs.querySelectorAll("button[data-panel-tab]"), button);
    const tab = button.getAttribute("data-panel-tab");
    stage.querySelectorAll<HTMLElement>("[data-panel-content]").forEach((panel) => {
      panel.hidden = panel.getAttribute("data-panel-content") !== tab;
    });
  }));
  shell.bindListSearch(stage, { emptyTitle: "无匹配文件", emptyDesc: "尝试更换关键词。", icon: "folder-search" });
  return () => cleanups.forEach((cleanup) => cleanup());
}

function chatMount(stage: HTMLElement): Cleanup {
  const cleanups: Cleanup[] = [];
  const chatShell = stage.querySelector<HTMLElement>("#chatShell");
  stage.querySelectorAll<HTMLElement>(".chat-sess").forEach((session) => {
    cleanups.push(on(session, "click", () => {
      stage.querySelectorAll(".chat-sess").forEach((node) => node.classList.remove("on"));
      session.classList.add("on");
      chatShell?.classList.remove("list-open");
    }));
  });
  cleanups.push(on(stage.querySelector("#openListBtn"), "click", () => chatShell?.classList.toggle("list-open")));
  cleanups.push(on(stage.querySelector("#openInspectBtn"), "click", () => chatShell?.classList.toggle("inspect-open")));
  return () => cleanups.forEach((cleanup) => cleanup());
}

function rowSelectMount(stage: HTMLElement, shell: ShellApi, data: Record<string, [string, string]>): Cleanup {
  shell.bindListSearch(stage, { emptyTitle: "无匹配结果", emptyDesc: "尝试更换关键词。" });
  const cleanups: Cleanup[] = [];
  stage.querySelectorAll<HTMLElement>(".trow[data-row]").forEach((row) => {
    cleanups.push(on(row, "click", () => {
      stage.querySelectorAll(".trow[data-row]").forEach((node) => node.classList.remove("sel"));
      row.classList.add("sel");
      const value = data[row.getAttribute("data-row") || ""];
      if (!value) return;
      const name = stage.querySelector<HTMLElement>("#dName");
      const sub = stage.querySelector<HTMLElement>("#dSub");
      if (name) name.textContent = value[0];
      if (sub) sub.textContent = value[1];
    }));
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}

function approvalsMount(stage: HTMLElement, shell: ShellApi): Cleanup {
  const cleanups: Cleanup[] = [];
  const data: Record<string, { title: string; sub: string; risk: string; rc: string; diff: string; impact: string; by: string; rel: string }> = {
    write: { title: "文件写入 · 3 个文件", sub: "Codex · 修复网关降级", risk: "中风险", rc: "warn", diff: '<div class="dl ctx">routes.ts</div><div class="dl add">+ router.post("/active-route-smoke", smoke);</div><div class="dl ctx">service.ts</div><div class="dl add">+ private fallbackActive = true;</div>', impact: "3 个文件 · 可回滚", by: "Codex Agent", rel: "修复网关降级会话" },
    cmd: { title: "命令执行 · rm -rf dist", sub: "OpenCode · 构建清理", risk: "高风险", rc: "bad", diff: '<div class="dl del">- rm -rf dist/</div><div class="dl ctx"># 将删除构建输出目录</div>', impact: "删除目录 · 不可撤销", by: "OpenCode Agent", rel: "构建任务" },
    cred: { title: "凭据访问 · glm.api_key", sub: "Claude Code · 测试连接", risk: "低风险", rc: "info", diff: '<div class="dl ctx">read secretRef glm.api_key</div><div class="dl add">+ 用于一次性测试连接</div>', impact: "读取密钥引用", by: "Claude Code Agent", rel: "测试连接" },
  };
  const renderDetail = (key: string) => {
    const item = data[key];
    if (!item) return;
    const title = stage.querySelector<HTMLElement>("#apTitle");
    const sub = stage.querySelector<HTMLElement>("#apSub");
    const risk = stage.querySelector<HTMLElement>("#apRisk");
    const diff = stage.querySelector<HTMLElement>("#apDiff");
    if (title) title.textContent = item.title;
    if (sub) sub.textContent = item.sub;
    if (risk) {
      risk.textContent = item.risk;
      risk.className = `tag ${item.rc}`;
    }
    if (diff) diff.innerHTML = item.diff;
    const values = stage.querySelectorAll<HTMLElement>("#apprDetail .kv dd");
    if (values.length >= 3) {
      values[0].textContent = item.impact;
      values[1].textContent = item.by;
      values[2].textContent = item.rel;
    }
  };
  const refreshTab = () => {
    const active = stage.querySelector(".toolbar .seg button.on")?.textContent?.trim() || "待审批";
    stage.querySelectorAll<HTMLElement>(".trow[data-appr]").forEach((row) => {
      const status = row.getAttribute("data-status") || "pending";
      const show = (active.startsWith("待") && status === "pending")
        || (active.startsWith("已批") && status === "approved")
        || (active.startsWith("已拒") && status === "rejected");
      row.style.display = show ? "" : "none";
    });
  };
  stage.querySelectorAll<HTMLElement>(".trow[data-appr]").forEach((row) => cleanups.push(on(row, "click", () => {
    stage.querySelectorAll(".trow[data-appr]").forEach((node) => node.classList.remove("sel"));
    row.classList.add("sel");
    renderDetail(row.getAttribute("data-appr") || "");
  })));
  const decide = (decision: "approved" | "rejected") => {
    const row = stage.querySelector<HTMLElement>(".trow.sel[data-appr]");
    if (!row) {
      shell.toast("请先选择一个审批项", "info");
      return;
    }
    row.classList.remove("sel");
    row.style.opacity = ".45";
    row.setAttribute("data-status", decision);
    row.querySelector(".tag")?.remove();
    const tag = document.createElement("span");
    tag.className = `tag ${decision === "approved" ? "ok" : "bad"}`;
    tag.textContent = decision === "approved" ? "已批准" : "已拒绝";
    row.appendChild(tag);
    shell.toast(decision === "approved" ? "已批准" : "已拒绝", decision === "approved" ? "ok" : "warn");
    refreshTab();
  };
  cleanups.push(on(stage.querySelector("#approveBtn"), "click", () => decide("approved")));
  cleanups.push(on(stage.querySelector("#rejectBtn"), "click", () => decide("rejected")));
  cleanups.push(on(stage.querySelector("#diffWsBtn"), "click", () => { location.hash = "#/ide"; }));
  cleanups.push(on(stage.querySelector(".toolbar .seg"), "click", () => window.setTimeout(refreshTab, 0)));
  shell.bindListSearch(stage, { emptyTitle: "无匹配审批项", emptyDesc: "尝试更换关键词。", icon: "shield-check" });
  return () => cleanups.forEach((cleanup) => cleanup());
}

function recoveryMount(stage: HTMLElement, shell: ShellApi): Cleanup {
  const fixes: Record<string, { name: string; backup: string; preview: string; verify: string }> = {
    gateway: { name: "Gateway 服务降级", backup: "backup gateway.json @ 14:02\nservice unit snapshot saved", preview: "restart tracevane-gateway.service\nreset endpoint A circuit", verify: "gateway active, endpoint A healthy" },
    config: { name: "OpenClaw 配置漂移", backup: "backup openclaw.json\nplugin slots snapshot", preview: "prune stale plugin slot\nrewrite openclaw entry", verify: "config valid, no drift" },
    secret: { name: "明文凭据残留", backup: "backup credentials.json\n(redacted)", preview: "migrate glm.api_key to secret store\nredact plaintext", verify: "no plaintext found" },
  };
  const steps = [
    { key: "backup", label: "1 · 备份", desc: "创建配置与服务快照", icon: "package-check" },
    { key: "preview", label: "2 · 预览", desc: "将执行的修复动作", icon: "eye" },
    { key: "apply", label: "3 · 应用", desc: "执行修复", icon: "wrench" },
    { key: "verify", label: "4 · 校验", desc: "确认修复生效", icon: "shield-check" },
  ];
  let current = "gateway";
  let applied = false;
  const render = () => {
    const fix = fixes[current];
    const fixName = stage.querySelector<HTMLElement>("#fixName");
    const stepsEl = stage.querySelector<HTMLElement>("#flowSteps");
    const logEl = stage.querySelector<HTMLElement>("#flowLog");
    const applyBtn = stage.querySelector<HTMLButtonElement>("#applyFixBtn");
    const rollbackBtn = stage.querySelector<HTMLButtonElement>("#rollbackBtn");
    if (fixName) fixName.textContent = fix.name;
    if (stepsEl) {
      stepsEl.innerHTML = steps.map((step, index) => {
        let state = "pending";
        let stateText = "待执行";
        if (!applied) {
          if (index < 2) { state = "done"; stateText = "已完成"; }
          else if (index === 2) { state = "active"; stateText = "待应用"; }
          else stateText = "待校验";
        } else {
          state = "done";
          stateText = "已完成";
        }
        return `<div class="flow-step ${state}"><span class="fs-ico"><i data-lucide="${step.icon}"></i></span><span class="fs-copy"><strong>${step.label}</strong><span>${step.desc}</span></span><span class="fs-state">${stateText}</span></div>`;
      }).join("");
    }
    if (logEl) logEl.textContent = applied ? `已应用并校验：\n${fix.verify}` : `${fix.backup}\n---\n${fix.preview}`;
    if (applyBtn) {
      applyBtn.disabled = applied;
      applyBtn.style.opacity = applied ? ".5" : "1";
    }
    if (rollbackBtn) {
      rollbackBtn.disabled = !applied;
      rollbackBtn.style.opacity = applied ? "1" : ".5";
    }
    shell.refreshIcons();
  };
  const cleanups: Cleanup[] = [];
  stage.querySelectorAll<HTMLElement>("[data-fix]").forEach((row) => cleanups.push(on(row, "click", () => {
    stage.querySelectorAll<HTMLElement>("[data-fix]").forEach((node) => { node.style.background = ""; });
    row.style.background = "var(--primary-soft)";
    current = row.getAttribute("data-fix") || "gateway";
    applied = false;
    render();
  })));
  cleanups.push(on(stage.querySelector("#applyFixBtn"), "click", () => {
    if (applied) return;
    shell.toast("正在应用修复...", "info");
    window.setTimeout(() => {
      applied = true;
      render();
      shell.toast("修复已应用 · 校验通过", "ok");
    }, 900);
  }));
  cleanups.push(on(stage.querySelector("#rollbackBtn"), "click", () => {
    if (!applied) return;
    shell.openDialog({
      tone: "warn",
      icon: "undo-2",
      title: "回滚到备份？",
      okLabel: "回滚",
      body: "将恢复到应用前的配置与服务快照。",
      onConfirm: () => {
        applied = false;
        render();
        shell.toast("已回滚到备份", "ok");
      },
    });
  }));
  cleanups.push(on(stage.querySelector("#scanBtn"), "click", () => shell.toast("巡检完成 · 2 项可修复", "info")));
  render();
  return () => cleanups.forEach((cleanup) => cleanup());
}

export function mountAuroraPage(path: string, stage: HTMLElement, shell: ShellApi): Cleanup {
  shell.refreshIcons();
  if (path === "dashboard") return dashboardMount(stage, shell);
  if (path === "model-gateway") return modelGatewayMount(stage, shell);
  if (path === "ide") return ideMount(stage, shell);
  if (path === "chat") return chatMount(stage);
  if (path === "approvals") return approvalsMount(stage, shell);
  if (path === "recovery") return recoveryMount(stage, shell);
  const data: Record<string, Record<string, [string, string]>> = {
    "cli-agents": { codex: ["Codex", "~/tracevane · 原生 session"], claude: ["Claude Code", "~/projects/web"], opencode: ["OpenCode", "~/lab"], openclaw: ["OpenClaw", "~/.openclaw · 未连接"] },
    "im-channels": { feishu: ["飞书", "tracevane-bot · 长连接 WS"], webhook: ["Webhook", "octo-relay · HTTP 回调"], octo: ["Octo 私聊", "octo-main · 长连接"] },
    external: { mcp: ["MCP · shadcn registry", "stdio · 本地"], gh: ["GitHub App", "repo · issues 授权"], fs: ["对象存储", "S3 兼容"], ws: ["webhook 中继", "HTTP · 外部回调"] },
    files: { diff: ["ai-edit.diff", "Codex 生成 · routes.ts"], png: ["preview-01.png", "预览截图 · 工作区"], json: ["smoke-200.json", "smoke 证据 · 模型网关"], att: ["error.log", "IM 附件 · 飞书"] },
    "long-tasks": { index: ["索引整个项目", "Codex · 后台 run"], cron: ["每日依赖检查", "cron · 02:00"], recover: ["Gateway 自愈重试", "recovery · 后台"], fail: ["批量翻译文档", "OpenCode · run"] },
  };
  if (data[path]) return rowSelectMount(stage, shell, data[path]);
  shell.bindListSearch(stage);
  return () => undefined;
}

