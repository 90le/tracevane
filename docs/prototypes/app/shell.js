/* 应用壳：导航、主题/折叠、命令面板、overlay 事件、页面分发注册。
 * 依赖：styles.css, states.js, router.js, pages.js, data/*.js
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const S = window.AuroraStates;
  // focus trap：打开浮层时记录触发元素，限制 Tab 在容器内，关闭时还焦
  let _lastFocus = null;
  function trapOn(container) {
    _lastFocus = document.activeElement;
    const handler = (e) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null);
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    container.addEventListener("keydown", handler);
    return () => { container.removeEventListener("keydown", handler); if (_lastFocus && _lastFocus.focus) _lastFocus.focus(); };
  }
  let _cmdTrap = null, _dlgTrap = null;

  function refreshIcons() { try { window.lucide && lucide.createIcons(); } catch (e) {} }

  function buildNav() {
    const nav = $("#nav");
    if (!nav) return;
    const groups = window.AURORA_NAV || [];
    let h = "";
    groups.forEach(g => {
      h += '<div class="nav-group-label">' + g.label + "</div>";
      g.items.forEach(it => {
        const cls = "nav-item" + (it.alert ? " alert" : "");
        const badge = it.count ? '<span class="nav-count">' + it.count + "</span>" : "";
        h += '<a class="' + cls + '" href="#/' + it.path + '" data-route="' + it.path + '"><i data-lucide="' + it.icon + '"></i><span>' + it.label + "</span>" + badge + "</a>";
      });
    });
    nav.innerHTML = h;
  }

  function buildCommandPalette() {
    const list = $("#cmdList");
    if (!list) return;
    const input = $("#cmdInput");
    let flat = [];
    const rebuild = () => {
      flat = [];
      (window.AURORA_NAV || []).forEach(g => g.items.forEach(it => flat.push({ g: "导航", label: it.label, icon: it.icon, act: () => (location.hash = "#/" + it.path) })));
      (window.AURORA_COMMANDS || []).forEach(c => flat.push(c));
      // 合并当前页的页面级命令
      const path = window.AuroraRouter && AuroraRouter.current && AuroraRouter.current().path;
      const pc = (window.AURORA_PAGE_COMMANDS || {})[path || ""];
      if (pc) pc.forEach(c => flat.push(c));
    };
    let cur = 0, filtered = flat;
    const render = () => {
      const q = (input.value || "").trim().toLowerCase();
      filtered = flat.filter(c => c.label.toLowerCase().includes(q));
      cur = 0; let html = "", lastG = "";
      filtered.forEach((c, i) => {
        if (c.g !== lastG) { html += '<div class="cmd-group">' + c.g + "</div>"; lastG = c.g; }
        html += '<button class="cmd-item' + (i === cur ? " cur" : "") + '" data-i="' + i + '"><i data-lucide="' + c.icon + '"></i><span>' + c.label + "</span>" + (c.kbd ? '<span class="kbd">' + c.kbd + "</span>" : "") + "</button>";
      });
      list.innerHTML = html || '<div class="empty">无匹配命令</div>';
      refreshIcons();
    };
    const move = d => { const items = $$(".cmd-item", list); if (!items.length) return; cur = (cur + d + items.length) % items.length; items.forEach((x, i) => x.classList.toggle("cur", i === cur)); items[cur].scrollIntoView({ block: "nearest" }); };
    const run = i => { const c = filtered[i]; if (!c) return; closeCmd(); if (c.act) c.act(); };
    const openCmd = () => { const m = $("#cmdMask"); if (!m) return; rebuild(); m.classList.add("show"); input.value = ""; render(); if (_cmdTrap) _cmdTrap(); _cmdTrap = trapOn(m); setTimeout(() => input.focus(), 30); };
    const closeCmd = () => { const m = $("#cmdMask"); if (m) m.classList.remove("show"); if (_cmdTrap) { _cmdTrap(); _cmdTrap = null; } };

    $("#cmdTrigger") && $("#cmdTrigger").addEventListener("click", openCmd);
    $("#topSearch") && $("#topSearch").addEventListener("click", openCmd);
    input && input.addEventListener("input", render);
    const mask = $("#cmdMask"); mask && mask.addEventListener("click", e => { if (e.target === mask) closeCmd(); });
    list && list.addEventListener("click", e => { const b = e.target.closest(".cmd-item"); if (b) run(+b.dataset.i); });
    input && input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); run(cur); }
    });
    window.AuroraCmd = { open: openCmd, close: closeCmd };
  }

  function bindShellEvents() {
    const app = $("#app");
    // dialog / sheet 打开时挂 focus trap，关闭时卸载并还焦
    [["#dlgMask", "_dlgTrap"], ["#sheetMask", "_sheetTrap"]].forEach(([sel, key]) => {
      const m = $(sel); if (!m) return;
      const mo = new MutationObserver(() => {
        const open = m.classList.contains("show");
        if (open && !window[key]) { window[key] = trapOn(m); }
        else if (!open && window[key]) { window[key](); window[key] = null; }
      });
      mo.observe(m, { attributes: true, attributeFilter: ["class"] });
    });
    $("#themeBtn") && $("#themeBtn").addEventListener("click", () => { document.body.dataset.theme = document.body.dataset.theme === "dark" ? "light" : "dark"; });
    $("#collapseBtn") && $("#collapseBtn").addEventListener("click", () => { if (app) app.dataset.nav = app.dataset.nav === "collapsed" ? "expanded" : "collapsed"; });
    const setMobile = open => { if (app) app.dataset.mobile = open ? "open" : "closed"; };
    $("#menuBtn") && $("#menuBtn").addEventListener("click", () => setMobile(true));
    $("#scrim") && $("#scrim").addEventListener("click", () => setMobile(false));

    // segmented 通用
    document.addEventListener("click", e => {
      const segBtn = e.target.closest(".seg button, .seg-radio button");
      if (segBtn) {
        const seg = segBtn.parentElement;
        Array.from(seg.children).forEach(x => x.classList.toggle("on", x === segBtn));
        const tab = segBtn.getAttribute("data-tab");
        if (tab) $$("[data-tabpanel]").forEach(p => { p.hidden = p.getAttribute("data-tabpanel") !== tab; });
      }
      const accHead = e.target.closest(".acc-head");
      if (accHead) accHead.closest(".acc").classList.toggle("open");
      // list-detail mobile drawer
      const row = e.target.closest(".trow[data-row]");
      if (row && row.closest(".split") && window.matchMedia("(max-width:1080px)").matches) {
        row.closest(".split").classList.add("detail-open");
      }
      // 点击 detail 抽屉遮罩或检视器外部 → 关闭抽屉（≤1080px）；排除点击行本身（那是打开动作）
      const split = e.target.closest && e.target.closest(".split.detail-open");
      if (split && window.matchMedia("(max-width:1080px)").matches && !e.target.closest(".detail") && !e.target.closest(".trow")) {
        split.classList.remove("detail-open");
      }
    });

    // data-route 跨页跳转（兼容 button/a，无 href 时补 hash）
    document.addEventListener("click", e => {
      const el = e.target.closest("[data-route]");
      if (el) {
        const path = el.getAttribute("data-route");
        if (path && location.hash !== "#/" + path) { e.preventDefault(); location.hash = "#/" + path; }
      }
    });
    // data-sheet 统一走 states（兼容字符串与对象）
    document.addEventListener("click", e => {
      const el = e.target.closest("[data-sheet]");
      if (el) { e.preventDefault(); S.openSheetLegacy(el.getAttribute("data-sheet")); }
    });
    // data-toast
    document.addEventListener("click", e => {
      const el = e.target.closest("[data-toast]");
      if (el) S.toast(el.getAttribute("data-toast"), el.getAttribute("data-toast-tone") || "ok");
    });

    // overlay 关闭
    ["#sheetMask", "#dlgMask"].forEach(sel => { const m = $(sel); m && m.addEventListener("click", e => { if (e.target === m) { if (sel === "#sheetMask") S.closeSheet(); else { const c = m._confirm; S.closeDialog(); } } }); });
    ["#shClose", "#shCancel", "#shGo", "#dlgCancel", "#dlgOk"].forEach(sel => {
      const b = $(sel);
      b && b.addEventListener("click", () => {
        if (sel.includes("dlg")) { const m = $("#dlgMask"); const c = m && m._confirm; S.closeDialog(); if (c) c(); }
        else { S.closeSheet(); }
      });
    });

    document.addEventListener("keydown", e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); const m = $("#cmdMask"); m && (m.classList.contains("show") ? window.AuroraCmd.close() : window.AuroraCmd.open()); }
      else if (e.key === "Escape") { window.AuroraCmd && window.AuroraCmd.close(); S.closeSheet(); S.closeDialog(); $$(".split.detail-open").forEach(x => x.classList.remove("detail-open")); }
    });

    // 通用列表搜索：输入关键词过滤 .trow，无匹配时显示 empty 态
    const bindListSearch = (stage, opts) => {
      opts = opts || {};
      const input = stage.querySelector(".search-input input");
      const wrap = stage.querySelector(".tablewrap");
      if (!input || !wrap) return;
      const rows = () => Array.from(wrap.querySelectorAll(".trow"));
      const empty = () => {
        let el = wrap.querySelector(".list-empty");
        if (!el) { el = document.createElement("div"); el.className = "list-empty"; wrap.appendChild(el); }
        return el;
      };
      const apply = () => {
        const q = input.value.trim().toLowerCase();
        let visible = 0;
        rows().forEach(r => {
          const text = r.textContent.toLowerCase();
          const show = !q || text.includes(q);
          r.style.display = show ? "" : "none";
          if (show) visible++;
        });
        const e = empty();
        if (visible === 0) {
          S.states(e, "empty", { title: opts.emptyTitle || "无匹配结果", desc: opts.emptyDesc || "尝试更换关键词或清除筛选。", icon: opts.icon || "search-x" });
        } else {
          e.innerHTML = "";
        }
      };
      input.addEventListener("input", apply);
      apply();
    };

    window.AuroraShell = Object.assign({}, S, { refreshIcons, setMobile, bindListSearch });
  }

  function init() {
    buildNav();
    buildCommandPalette();
    bindShellEvents();
    refreshIcons();
    window.AuroraRouter.init();
  }
  window.AuroraShellInit = init;
})();
