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
