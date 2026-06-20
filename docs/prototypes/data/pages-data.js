/* 所有页面的专属交互（mount）集中在此。由 router 在片段加载后按 path 调用 mount(stage, shell)。 */
window.AURORA_PAGE_MOUNT = window.AURORA_PAGE_MOUNT || {};
window.AURORA_PAGE_MOUNT["dashboard"] = function (stage, shell) {
  const grid = stage.querySelector("#connGrid");
  if (!grid) return;
  const seg = stage.querySelector("#connStateDemo");
  if (!seg) return;
  const saved = grid.innerHTML;
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cstate]"); if (!b) return;
    Array.from(seg.children).forEach((x) => x.classList.toggle("on", x === b));
    const st = b.dataset.cstate;
    const S = window.AuroraStates;
    if (st === "data") { grid.innerHTML = saved; shell.refreshIcons(); }
    else if (st === "loading") { S.states(grid, "skeleton-cards", { count: 3 }); }
    else if (st === "empty") { S.states(grid, "empty", { title: "暂无接入数据", desc: "还没有配置 Provider 或渠道。", action: '<button class="btn-primary btn-sm" data-route="model-gateway"><i data-lucide="plus"></i>配置模型网关</button>', icon: "plug-zap" }); }
    else if (st === "error") { S.states(grid, "error", { title: "接入数据加载失败", desc: "无法连接到聚合接口，请稍后重试。", onRetry: () => { Array.from(seg.children).forEach((x) => x.classList.toggle("on", x.dataset.cstate === "data")); grid.innerHTML = saved; shell.refreshIcons(); } }); }
  });
};

// ---- model-gateway: viewbar 多视图 + provider 行选中 ----
window.AURORA_PAGE_MOUNT["model-gateway"] = function (stage, shell) {
  // view switching
  const viewBtns = stage.querySelectorAll("[data-view-btn]");
  const views = stage.querySelectorAll("[data-view]");
  if (viewBtns.length) {
    const crumbTitle = document.getElementById("crumbTitle");
    viewBtns.forEach(b => b.addEventListener("click", () => {
      const v = b.getAttribute("data-view-btn");
      viewBtns.forEach(x => x.classList.toggle("on", x === b));
      views.forEach(el => el.classList.toggle("on", el.getAttribute("data-view") === v));
    }));
  }
  // provider row select -> update detail header
  const provs = { glm: ["GLM 智谱","native + openai · 2 endpoint","manual"], codex: ["Codex 账号","responses · 账号池 ×2","account"], anthropic: ["Anthropic","messages · claude-3.7-sonnet","manual"], local: ["本地 vLLM","openai 兼容 · 熔断","manual"] };
  stage.querySelectorAll(".trow[data-row]").forEach(r => r.addEventListener("click", () => {
    stage.querySelectorAll(".trow[data-row]").forEach(x => x.classList.remove("sel"));
    r.classList.add("sel");
    const key = r.getAttribute("data-row");
    const p = provs[key];
    if (p) { const n = stage.querySelector("#dName"); const sb = stage.querySelector("#dSub"); if (n) n.textContent = p[0]; if (sb) sb.textContent = p[1]; }
    // 账号制 Provider 才显示“账号池”子视图入口
    const sub = stage.querySelector("#providerSubViews");
    if (sub) sub.hidden = !(p && p[2] === "account");
  }));
};

// ---- ide: 活动栏联动左侧面板 + 文件树/标签 + 面板 tab ----
window.AURORA_PAGE_MOUNT["ide"] = function (stage, shell) {
  const wb = stage.querySelector("#workbench");
  const acts = stage.querySelectorAll(".wb-act[data-pane]");
  const panes = stage.querySelectorAll("[data-pane-content]");
  const labels = { files: "资源管理器", search: "搜索", git: "Git", evidence: "证据", ai: "AI 动作" };
  acts.forEach(a => a.addEventListener("click", () => {
    acts.forEach(x => x.classList.remove("on")); a.classList.add("on");
    const pane = a.getAttribute("data-pane");
    panes.forEach(p => p.hidden = p.getAttribute("data-pane-content") !== pane);
    const t = stage.querySelector("#treeToggleLabel"); if (t) t.textContent = labels[pane] || "面板";
  }));
  const treeToggle = stage.querySelector("#treeToggle");
  treeToggle && treeToggle.addEventListener("click", () => wb && wb.classList.toggle("tree-open"));
  const fileCode = {
    "routes.ts": '<span class="ln">1</span><span class="cm">// model gateway routes</span>\n<span class="ln">2</span><span class="kw">export function</span> <span class="fn">registerModelGatewayRoutes</span>(router) {\n<span class="ln">3</span>  router.<span class="fn">get</span>(<span class="st">"/api/model-gateway/status"</span>, handler);\n<span class="ln">4</span>}',
    "service.ts": '<span class="ln">1</span><span class="cm">// gateway service</span>\n<span class="ln">2</span><span class="kw">export class</span> <span class="fn">ModelGatewayService</span> {}'
  };
  stage.querySelectorAll(".wb-tree .tree-item[data-file], .wb-tab[data-file]").forEach(t => t.addEventListener("click", () => {
    const name = t.getAttribute("data-file");
    stage.querySelectorAll(".wb-tab").forEach(x => x.classList.toggle("on", x.getAttribute("data-file") === name));
    stage.querySelectorAll(".wb-tree .tree-item").forEach(x => x.classList.toggle("on", x.getAttribute("data-file") === name));
    if (fileCode[name]) { const c = stage.querySelector("#wbCode"); if (c) c.innerHTML = fileCode[name]; }
  }));
  const pt = stage.querySelector("#panelTabs");
  pt && pt.addEventListener("click", e => { const b = e.target.closest("button[data-panel-tab]"); if (!b) return; pt.querySelectorAll("button[data-panel-tab]").forEach(x => x.classList.toggle("on", x === b)); stage.querySelectorAll("[data-panel-content]").forEach(p => p.hidden = p.getAttribute("data-panel-content") !== b.getAttribute("data-panel-tab")); });
};

// ---- chat: 会话选中 + 手机端抽屉 ----
window.AURORA_PAGE_MOUNT["chat"] = function (stage, shell) {
  const cs = stage.querySelector("#chatShell");
  stage.querySelectorAll(".chat-sess").forEach(s => s.addEventListener("click", () => {
    stage.querySelectorAll(".chat-sess").forEach(x => x.classList.remove("on")); s.classList.add("on");
    cs && cs.classList.remove("list-open");
  }));
  const ol = stage.querySelector("#openListBtn"), oi = stage.querySelector("#openInspectBtn");
  ol && ol.addEventListener("click", () => cs && cs.classList.toggle("list-open"));
  oi && oi.addEventListener("click", () => cs && cs.classList.toggle("inspect-open"));
};

// ---- 通用 List-Detail: 行选中更新检视器标题（cli-agents / im-channels / external / files / long-tasks）----
function rowSelectUpdater(path, data) {
  window.AURORA_PAGE_MOUNT[path] = function (stage, shell) {
    if (shell && shell.bindListSearch) shell.bindListSearch(stage, { emptyTitle: "无匹配结果", emptyDesc: "尝试更换关键词。" });
    stage.querySelectorAll(".trow[data-row]").forEach(r => r.addEventListener("click", () => {
      stage.querySelectorAll(".trow[data-row]").forEach(x => x.classList.remove("sel")); r.classList.add("sel");
      const d = data[r.getAttribute("data-row")];
      if (d) { const n = stage.querySelector("#dName"); const sb = stage.querySelector("#dSub"); if (n) n.textContent = d[0]; if (sb) sb.textContent = d[1]; }
    }));
  };
}
rowSelectUpdater("cli-agents", { codex: ["Codex","~/tracevane · 原生 session"], claude: ["Claude Code","~/projects/web"], opencode: ["OpenCode","~/lab"], openclaw: ["OpenClaw","~/.openclaw · 未连接"] });
rowSelectUpdater("im-channels", { feishu: ["飞书","tracevane-bot · 长连接 WS"], webhook: ["Webhook","octo-relay · HTTP 回调"], octo: ["Octo 私聊","octo-main · 长连接"] });
rowSelectUpdater("external", { mcp: ["MCP · shadcn registry","stdio · 本地"], gh: ["GitHub App","repo · issues 授权"], fs: ["对象存储","S3 兼容"], ws: ["webhook 中继","HTTP · 外部回调"] });
rowSelectUpdater("files", { diff: ["ai-edit.diff","Codex 生成 · routes.ts"], png: ["preview-01.png","预览截图 · 工作区"], json: ["smoke-200.json","smoke 证据 · 模型网关"], att: ["error.log","IM 附件 · 飞书"] });
rowSelectUpdater("long-tasks", { index: ["索引整个项目","Codex · 后台 run"], cron: ["每日依赖检查","cron · 02:00"], recover: ["Gateway 自愈重试","recovery · 后台"], fail: ["批量翻译文档","OpenCode · run"] });

// approvals: 行选中联动详情 + 批准/拒绝状态流转 + tab 切换 + 搜索 empty 态
window.AURORA_PAGE_MOUNT["approvals"] = function (stage, shell) {
  const S = window.AuroraStates;
  const DATA = {
    write: { title: "文件写入 · 3 个文件", sub: "Codex · 修复网关降级", risk: "中风险", rc: "warn", diff: '<div class="dl ctx">routes.ts</div><div class="dl add">+ router.post("/active-route-smoke", smoke);</div><div class="dl ctx">service.ts</div><div class="dl add">+ private fallbackActive = true;</div>', impact: "3 个文件 · 可回滚", by: "Codex Agent", rel: "修复网关降级会话" },
    cmd: { title: "命令执行 · rm -rf dist", sub: "OpenCode · 构建清理", risk: "高风险", rc: "bad", diff: '<div class="dl del">- rm -rf dist/</div><div class="dl ctx"># 将删除构建输出目录</div>', impact: "删除目录 · 不可撤销", by: "OpenCode Agent", rel: "构建任务" },
    cred: { title: "凭据访问 · glm.api_key", sub: "Claude Code · 测试连接", risk: "低风险", rc: "info", diff: '<div class="dl ctx">read secretRef glm.api_key</div><div class="dl add">+ 用于一次性测试连接</div>', impact: "读取密钥引用", by: "Claude Code Agent", rel: "测试连接" },
  };
  const list = stage.querySelector(".panel-body");
  const renderDetail = (key) => {
    const d = DATA[key]; if (!d) return;
    const t = stage.querySelector("#apTitle"); if (t) t.textContent = d.title;
    const sb = stage.querySelector("#apSub"); if (sb) sb.textContent = d.sub;
    const rk = stage.querySelector("#apRisk"); if (rk) { rk.textContent = d.risk; rk.className = "tag " + d.rc; }
    const df = stage.querySelector("#apDiff"); if (df) df.innerHTML = d.diff;
    const kvs = stage.querySelectorAll("#apprDetail .kv dd");
    if (kvs.length >= 3) { kvs[0].textContent = d.impact; kvs[1].textContent = d.by; kvs[2].textContent = d.rel; }
  };
  // 行选中
  stage.querySelectorAll(".trow[data-appr]").forEach(r => r.addEventListener("click", () => {
    stage.querySelectorAll(".trow[data-appr]").forEach(x => x.classList.remove("sel"));
    r.classList.add("sel");
    renderDetail(r.getAttribute("data-appr"));
  }));
  // 批准 / 拒绝：把行标记为对应状态，从待审批列表移除
  const act = (decision) => {
    const sel = stage.querySelector(".trow.sel[data-appr]");
    if (!sel) { S && S.toast("请先选择一个审批项", "info"); return; }
    sel.classList.remove("sel");
    sel.style.opacity = ".45";
    sel.setAttribute("data-status", decision);
    sel.querySelector(".tag")?.remove();
    const tag = document.createElement("span"); tag.className = "tag " + (decision === "approved" ? "ok" : "bad");
    tag.textContent = decision === "approved" ? "已批准" : "已拒绝";
    sel.appendChild(tag);
    S && S.toast(decision === "approved" ? "已批准" : "已拒绝", decision === "approved" ? "ok" : "warn");
    refreshTab(stage);
  };
  const approveBtn = stage.querySelector("#approveBtn"); approveBtn && approveBtn.addEventListener("click", () => act("approved"));
  const rejectBtn = stage.querySelector("#rejectBtn"); rejectBtn && rejectBtn.addEventListener("click", () => act("rejected"));
  // 跳工作区
  const wsBtn = stage.querySelector("#diffWsBtn"); wsBtn && wsBtn.addEventListener("click", () => { location.hash = "#/ide"; });
  // tab 切换：待审批 / 已批准 / 已拒绝
  function refreshTab(st) {
    const active = st.querySelector(".toolbar .seg button.on")?.textContent?.trim() || "待审批";
    st.querySelectorAll(".trow[data-appr]").forEach(r => {
      const status = r.getAttribute("data-status") || "pending";
      const show = (active.startsWith("待") && status === "pending") || (active.startsWith("已批") && status === "approved") || (active.startsWith("已拒") && status === "rejected");
      r.style.display = show ? "" : "none";
    });
  }
  const seg = stage.querySelector(".toolbar .seg");
  seg && seg.addEventListener("click", () => setTimeout(() => refreshTab(stage), 0));
  // 搜索 empty
  if (shell && shell.bindListSearch) shell.bindListSearch(stage, { emptyTitle: "无匹配审批项", emptyDesc: "尝试更换关键词。", icon: "shield-check" });
};

// recovery: 可推进的修复流程（备份→预览→应用→校验→回滚）
window.AURORA_PAGE_MOUNT["recovery"] = function (stage, shell) {
  const S = window.AuroraStates;
  const FIX = {
    gateway: { name: "Gateway 服务降级", backup: "backup gateway.json @ 14:02\nservice unit snapshot saved", preview: "restart tracevane-gateway.service\nreset endpoint A circuit", verify: "gateway active, endpoint A healthy" },
    config: { name: "OpenClaw 配置漂移", backup: "backup openclaw.json\nplugin slots snapshot", preview: "prune stale plugin slot\nrewrite openclaw entry", verify: "config valid, no drift" },
    secret: { name: "明文凭据残留", backup: "backup credentials.json\n(redacted)", preview: "migrate glm.api_key to secret store\nredact plaintext", verify: "no plaintext found" },
  };
  const STEPS = [
    { key: "backup", label: "1 · 备份", desc: "创建配置与服务快照", icon: "package-check" },
    { key: "preview", label: "2 · 预览", desc: "将执行的修复动作", icon: "eye" },
    { key: "apply", label: "3 · 应用", desc: "执行修复", icon: "wrench" },
    { key: "verify", label: "4 · 校验", desc: "确认修复生效", icon: "shield-check" },
  ];
  let current = "gateway";
  let applied = false;
  const stepsEl = stage.querySelector("#flowSteps");
  const logEl = stage.querySelector("#flowLog");
  const applyBtn = stage.querySelector("#applyFixBtn");
  const rollbackBtn = stage.querySelector("#rollbackBtn");
  const fixName = stage.querySelector("#fixName");

  const render = () => {
    const d = FIX[current]; if (!d) return;
    if (fixName) fixName.textContent = d.name;
    stepsEl.innerHTML = STEPS.map((s, i) => {
      let state = "pending", stateText = "待执行";
      // apply 之前：backup/preview 是 done（已自动完成），apply 是 active，verify 是 pending
      if (!applied) {
        if (i < 2) { state = "done"; stateText = "已完成"; }
        else if (i === 2) { state = "active"; stateText = "待应用"; }
        else { state = "pending"; stateText = "待校验"; }
      } else {
        state = "done"; stateText = "已完成";
      }
      return '<div class="flow-step ' + state + '"><span class="fs-ico"><i data-lucide="' + s.icon + '"></i></span><span class="fs-copy"><strong>' + s.label + '</strong><span>' + s.desc + '</span></span><span class="fs-state">' + stateText + '</span></div>';
    }).join("");
    logEl.textContent = applied ? ("已应用并校验：\n" + d.verify) : (d.backup + "\n---\n" + d.preview);
    if (applyBtn) { applyBtn.disabled = applied; applyBtn.style.opacity = applied ? .5 : 1; applyBtn.querySelector("span") || (applyBtn.textContent = ""); }
    if (rollbackBtn) { rollbackBtn.disabled = !applied; rollbackBtn.style.opacity = applied ? 1 : .5; }
    if (shell) shell.refreshIcons();
  };

  stage.querySelectorAll("[data-fix]").forEach(r => r.addEventListener("click", () => {
    stage.querySelectorAll("[data-fix]").forEach(x => x.style.background = "");
    r.style.background = "var(--primary-soft)";
    current = r.getAttribute("data-fix");
    applied = false;
    render();
  }));

  applyBtn && applyBtn.addEventListener("click", () => {
    if (applied) return;
    S && S.toast("正在应用修复…", "info");
    applyBtn.disabled = true; applyBtn.style.opacity = .5;
    // 模拟应用 + 校验
    setTimeout(() => { applied = true; render(); S && S.toast("修复已应用 · 校验通过", "ok"); }, 1200);
  });
  rollbackBtn && rollbackBtn.addEventListener("click", () => {
    if (!applied) return;
    S && S.openDialog({ tone: "warn", icon: "undo-2", title: "回滚到备份？", okLabel: "回滚", body: "将恢复到应用前的配置与服务快照。", onConfirm: () => { applied = false; render(); S && S.toast("已回滚到备份", "ok"); } });
  });
  const scanBtn = stage.querySelector("#scanBtn");
  scanBtn && scanBtn.addEventListener("click", () => S && S.toast("巡检完成 · 2 项可修复", "info"));

  render();
};
