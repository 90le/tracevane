/* 统一数据契约与状态组件。
 * 取代散落在 data-sheet="a|b|c|d\\ne" 里的字符串拼接。
 * Sheet 数据用结构化对象，换行由 states.sheet 渲染时处理，杜绝 \\n 字面量暴露。
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const refreshIcons = () => { try { window.lucide && lucide.createIcons(); } catch (e) {} };

  // sheet/show 对话框 / dialog / drawer 的统一挂载点由 shell 提供。
  function openSheet(obj) {
    const mask = $("#sheetMask"), sheet = $("#sheet");
    if (!sheet) return;
    const o = obj || {};
    $("#shTitle").textContent = o.title || "详情";
    $("#shSub").textContent = o.sub || "";
    $("#shStatus").textContent = o.status || "-";
    $("#shOwner").textContent = o.owner || "-";
    $("#shAction").textContent = o.action || "-";
    $("#shNote").textContent = o.note || "";
    // log 用数组 join 成真实换行，绝不再有字面 \n
    const log = Array.isArray(o.log) ? o.log.join("\n") : (o.log || "waiting...");
    $("#shLog").textContent = log;
    const extra = $("#shExtra");
    if (o.diff) {
      extra.innerHTML = '<div class="section-label" style="margin-bottom:6px;">配置 diff</div><div class="diff">' + o.diff + "</div>";
    } else {
      extra.innerHTML = "";
    }
    sheet.classList.add("show"); if (mask) mask.classList.add("show");
    refreshIcons();
  }
  // 兼容旧的 "a|b|c|d" 字符串格式（最后一项是 log，把真实换行符转义）
  function openSheetLegacy(str) {
    const parts = String(str).split("|");
    const log = parts[6] ? parts[6].replace(/\\n/g, "\n") : "";
    openSheet({ title: parts[0], sub: parts[1], status: parts[2], owner: parts[3], action: parts[4], note: parts[5], log });
  }

  function closeSheet() {
    const mask = $("#sheetMask"), sheet = $("#sheet");
    if (sheet) sheet.classList.remove("show"); if (mask) mask.classList.remove("show");
  }

  function openDialog(cfg) {
    cfg = cfg || {};
    const mask = $("#dlgMask"); if (!mask) return;
    const head = $("#dlgHead"); if (head) head.className = "dlg-head " + (cfg.tone || "info");
    $("#dlgTitle").textContent = cfg.title || "确认操作";
    $("#dlgBody").innerHTML = cfg.body || "";
    const ic = $("#dlgIcon"); if (ic) ic.setAttribute("data-lucide", cfg.icon || "shield-alert");
    const ok = $("#dlgOk"); if (ok) ok.querySelector("span").textContent = cfg.okLabel || "确认";
    if (ok) ok.className = "btn-primary" + (cfg.tone === "danger" ? " danger" : "");
    mask._confirm = cfg.onConfirm || null;
    mask.classList.add("show"); refreshIcons();
  }
  function closeDialog() { const m = $("#dlgMask"); if (m) { m.classList.remove("show"); m._confirm = null; } }

  function toast(msg, tone) {
    const wrap = $("#toastWrap"); if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast " + (tone || "ok");
    const icon = tone === "warn" ? "alert-triangle" : tone === "info" ? "info" : "check";
    el.innerHTML = '<span class="ti"><i data-lucide="' + icon + '"></i></span><span>' + msg + "</span>";
    wrap.appendChild(el); refreshIcons();
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); }, 2600);
  }

  function states(container, kind, opts) {
    opts = opts || {};
    const el = typeof container === "string" ? document.querySelector(container) : container;
    if (!el) return null;
    const icon = opts.icon || "inbox";
    if (kind === "skeleton-rows") {
      let h = "";
      for (let i = 0; i < (opts.count || 4); i++) h += '<div class="sk-row"><span class="skeleton ava"></span><span class="skeleton t"></span><span class="skeleton s"></span><span class="skeleton s"></span></div>';
      el.innerHTML = '<div class="sk-list">' + h + "</div>";
    } else if (kind === "skeleton-cards") {
      let h = "";
      for (let i = 0; i < (opts.count || 3); i++) h += '<div class="sk-card"><span class="skeleton" style="height:18px;width:50%"></span><span class="skeleton" style="height:28px;width:30%"></span><span class="skeleton" style="height:12px"></span></div>';
      el.innerHTML = '<div class="sk-blocks" style="grid-template-columns:repeat(' + Math.min(opts.count || 3, 3) + ',1fr)">' + h + "</div>";
    } else if (kind === "empty") {
      el.innerHTML = '<div class="statebox empty"><span class="si"><i data-lucide="' + icon + '"></i></span><strong>' + (opts.title || "暂无数据") + "</strong><span>" + (opts.desc || "") + "</span>" + (opts.action ? '<div class="row-actions">' + opts.action + "</div>" : "") + "</div>";
    } else if (kind === "error") {
      el.innerHTML = '<div class="statebox error"><span class="si"><i data-lucide="' + (opts.icon || "circle-alert") + '"></i></span><strong>' + (opts.title || "加载失败") + "</strong><span>" + (opts.desc || "请稍后重试。") + '</span><div class="row-actions"><button class="btn-ghost btn-sm retry" data-retry><i data-lucide="refresh-cw"></i>重试</button></div></div>';
    } else if (kind === "loading") {
      el.innerHTML = '<div class="statebox"><span class="spinner"></span><strong>' + (opts.title || "加载中…") + "</strong></div>";
    }
    refreshIcons();
    if (opts.onRetry) { const rb = el.querySelector("[data-retry]"); if (rb) rb.addEventListener("click", opts.onRetry); }
    return el;
  }

  window.AuroraStates = { openSheet, openSheetLegacy, closeSheet, openDialog, closeDialog, toast, states, refreshIcons };
})();
