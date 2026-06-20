/* Tracevane Aurora 原型框架 — hash 路由
 * 页面以片段形式注册，按 #/path 加载到 #stage。
 * 每个页面 = { path, label, group, icon, title, crumb, mount(stage, ctx) }
 */
(function () {
  const routes = [];
  const pages = window.AURORA_PAGES = {};

  function define(page) {
    pages[page.path] = page;
    routes.push(page);
  }
  window.AuroraDefinePage = define;
  window.AuroraRoutes = routes;

  function parseHash() {
    let h = location.hash.replace(/^#\/?/, "") || "dashboard";
    return h;
  }

  function activePage() {
    const p = parseHash();
    return pages[p] || pages["dashboard"];
  }

  // fetch 片段 HTML（pages/<name>.html）
  async function fetchFragment(name) {
    const res = await fetch("pages/" + name + ".html", { cache: "no-store" });
    if (!res.ok) throw new Error("fragment " + name + " not found (" + res.status + ")");
    return res.text();
  }

  async function render() {
    const page = activePage();
    const stage = document.getElementById("stage");
    if (!stage || !page) return;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    // 切换时先显示骨架，避免 fetch 期间 stage 闪白；用 token 防快速切换竞态
    render._token = (render._token || 0) + 1;
    const token = render._token;
    if (window.AuroraStates) AuroraStates.states(stage, "skeleton-cards", { count: 3 });
    // 标记导航 active
    document.querySelectorAll("[data-route]").forEach(a => {
      a.classList.toggle("active", a.getAttribute("data-route") === page.path);
    });
    // 更新面包屑
    const crumbPath = document.getElementById("crumbPath");
    const crumbTitle = document.getElementById("crumbTitle");
    if (crumbPath) crumbPath.textContent = (page.group || "") + (page.group ? " / " : "") + page.label;
    if (crumbTitle) crumbTitle.textContent = page.label;
    // 1) 加载片段（失败单独处理，给出可重试的错误态）
    try {
      if (page.fragment) {
        stage.innerHTML = await fetchFragment(page.fragment);
      } else if (typeof page.html === "function") {
        stage.innerHTML = page.html();
      } else if (typeof page.html === "string") {
        stage.innerHTML = page.html;
      }
      // 快速切换保护：若期间又切到别的页，丢弃本次结果
      if (token !== render._token) return;
    } catch (e) {
      if (token !== render._token) return;
      stage.innerHTML = '<div class="statebox error"><span class="si"><i data-lucide="circle-alert"></i></span><strong>页面加载失败</strong><span>' + esc(e.message) + '</span><div class="row-actions"><button class="btn-ghost btn-sm retry" data-retry><i data-lucide="refresh-cw"></i>重试</button></div></div>';
      const rb = stage.querySelector("[data-retry]");
      if (rb) rb.addEventListener("click", () => render());
      if (window.AuroraShell) AuroraShell.refreshIcons();
      return;
    }
    // 2) 渲染图标 + 执行 mount（mount 抛错不影响内容，仅控制台告警）
    if (window.AuroraShell) AuroraShell.refreshIcons();
    try {
      if (typeof page.mount === "function") page.mount(stage, window.AuroraShell);
      const mounts = window.AURORA_PAGE_MOUNT || {};
      if (typeof mounts[page.path] === "function") mounts[page.path](stage, window.AuroraShell);
    } catch (e) {
      console.warn("[aurora] page mount error (" + page.path + "):", e);
    }
  }

  window.AuroraRouter = {
    go(path) { location.hash = "#/" + path; },
    current() { return activePage(); },
    render,
    init() { window.addEventListener("hashchange", render); render(); }
  };
})();
