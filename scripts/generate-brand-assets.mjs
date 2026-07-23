#!/usr/bin/env node
// Tracevane 品牌资产生成器
// 用法:
//   node scripts/generate-brand-assets.mjs preview          # 渲染全部设计候选到 .tmp/brand-preview.png
//   node scripts/generate-brand-assets.mjs build <design>   # 用指定设计生成全部品牌资产
//
// 所有 SVG 自包含, 不引用外部图片/字体文件, 修复 <img> 场景下外部子资源被浏览器拦截导致的 logo 空白问题。

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BRAND = {
  green: '#35E69A',
  cyan: '#22D3EE',
  ink: '#0B0E13',
  paper: '#F4F1EA',
};

// ---------- 设计候选 ----------
// 每个设计返回 viewBox 512x512 内的图形内容 (不含外层 <svg>), 渐变 id 固定为 "tvgrad"。
const GRAD_DEFS = `<defs><linearGradient id="tvgrad" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${BRAND.green}"/><stop offset="1" stop-color="${BRAND.cyan}"/>
</linearGradient></defs>`;

const DESIGNS = {
  // 1. 轨迹 V: 圆角 V 形字标 (Vane), 身后拖两道渐隐的运动轨迹 (Trace), 整体朝东北行进
  'trace-v': () => {
    const v = (dx, dy) => `M ${150 + dx} ${140 + dy} L ${256 + dx} ${330 + dy} L ${362 + dx} ${140 + dy}`;
    return `${GRAD_DEFS}
    <path d="${v(-68, 68)}" fill="none" stroke="${BRAND.green}" stroke-opacity="0.16" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${v(-36, 36)}" fill="none" stroke="${BRAND.green}" stroke-opacity="0.38" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${v(0, 0)}" fill="none" stroke="url(#tvgrad)" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>`;
  },

  // 2. 风标罗盘: 沿 45° 对角的双菱形针叶, 东北叶渐变实色, 西南叶半透明, 中心留白
  'vane-rose': () => {
    const blade = (tx, ty) =>
      `<polygon points="${tx},${ty} 276,276 236,236" stroke-linejoin="round" stroke-width="16" stroke-linejoin="round"`;
    return `${GRAD_DEFS}
    <polygon points="390,122 276,276 236,236" fill="url(#tvgrad)" stroke="url(#tvgrad)" stroke-width="16" stroke-linejoin="round"/>
    <polygon points="122,390 276,276 236,236" fill="${BRAND.cyan}" fill-opacity="0.28" stroke="${BRAND.cyan}" stroke-opacity="0.28" stroke-width="16" stroke-linejoin="round"/>`;
  },

  // 3. 节点 T: 电路走线风格的 T 字标 (Tracevane), 三个端点是实心节点, 像遥测/trace 路线图
  'trace-t': () => `${GRAD_DEFS}
    <path d="M 150 168 H 362 M 256 168 V 332" fill="none" stroke="url(#tvgrad)" stroke-width="52" stroke-linecap="round"/>
    <circle cx="150" cy="168" r="37" fill="${BRAND.green}"/>
    <circle cx="362" cy="168" r="37" fill="${BRAND.green}"/>
    <circle cx="256" cy="332" r="37" fill="${BRAND.cyan}"/>`,

  // 4. 北辰叶片: 一片沿东北-西南轴的风向标菱形叶, 外围一圈细轨道弧 (35°~75° 缺口让叶尖穿出)
  'north-blade': () => {
    const rad = (deg) => (deg * Math.PI) / 180;
    const pt = (deg, r = 178) => [256 + r * Math.cos(rad(deg)), 256 - r * Math.sin(rad(deg))];
    const [sx, sy] = pt(75);
    const [ex, ey] = pt(35);
    return `${GRAD_DEFS}
    <path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} A 178 178 0 1 0 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${BRAND.green}" stroke-opacity="0.4" stroke-width="22" stroke-linecap="round"/>
    <polygon points="384,128 295.6,216.4 160,352 216.4,295.6" fill="url(#tvgrad)" stroke="url(#tvgrad)" stroke-width="14" stroke-linejoin="round"/>`;
  },
};

// ---------- SVG 组装 ----------
function wrap(inner, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">${inner}</svg>`;
}

function markSvg(design, size = 512) {
  return wrap(DESIGNS[design](), size);
}

function iconSvg(design, size = 512) {
  const inner = 400;
  const offset = (512 - inner) / 2;
  return wrap(`<rect width="512" height="512" rx="112" fill="${BRAND.ink}"/>
  <g transform="translate(${offset} ${offset}) scale(${inner / 512})">${DESIGNS[design]()}</g>`, size);
}

function lockupSvg(design) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 200" width="880" height="200" role="img" aria-label="Tracevane — local agent control">
  <rect width="880" height="200" rx="28" fill="${BRAND.ink}"/>
  <g transform="translate(28 28) scale(0.28125)">${DESIGNS[design]()}</g>
  <text x="196" y="102" fill="${BRAND.paper}" font-family="Inter, Avenir Next, Segoe UI, system-ui, sans-serif" font-size="56" font-weight="760" letter-spacing="5">TRACEVANE</text>
  <text x="200" y="140" fill="${BRAND.green}" font-family="Inter, Avenir Next, Segoe UI, system-ui, sans-serif" font-size="19" font-weight="700" letter-spacing="6">LOCAL AGENT CONTROL</text>
</svg>`;
}

function posterSvg(design) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="Tracevane poster">
  <defs><radialGradient id="glow" cx="0.5" cy="0.42" r="0.75">
    <stop offset="0" stop-color="#14202B"/><stop offset="1" stop-color="${BRAND.ink}"/>
  </radialGradient></defs>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(470 75) scale(0.5078)">${DESIGNS[design]()}</g>
  <text x="600" y="452" text-anchor="middle" fill="${BRAND.paper}" font-family="Inter, Avenir Next, Segoe UI, system-ui, sans-serif" font-size="72" font-weight="780" letter-spacing="10">TRACEVANE</text>
  <text x="600" y="506" text-anchor="middle" fill="${BRAND.green}" font-family="Inter, Avenir Next, Segoe UI, system-ui, sans-serif" font-size="26" font-weight="700" letter-spacing="9">LOCAL AGENT CONTROL</text>
</svg>`;
}

// ---------- 渲染 ----------
async function renderPng(browser, svg, width, height, { omitBackground = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<!doctype html><html><body style="margin:0;padding:0">${svg}</body></html>`);
  const buffer = await page.screenshot({ omitBackground, clip: { x: 0, y: 0, width, height } });
  await page.close();
  return buffer;
}

// ICO: 现代 ICO 直接内嵌 PNG 数据
function buildIco(pngEntries) {
  const count = pngEntries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngEntries.forEach(({ size, png }, i) => {
    dir.writeUInt8(size >= 256 ? 0 : size, i * 16);
    dir.writeUInt8(size >= 256 ? 0 : size, i * 16 + 1);
    dir.writeUInt8(0, i * 16 + 2);
    dir.writeUInt8(0, i * 16 + 3);
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(png.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...pngEntries.map((e) => e.png)]);
}

// ---------- 命令 ----------
async function preview() {
  const browser = await chromium.launch();
  const cell = 176;
  const names = Object.keys(DESIGNS);
  const sizes = [144, 64, 32, 16];

  let body = '';
  for (const [index, name] of names.entries()) {
    body += `<div style="display:flex;align-items:center;gap:20px">
      <div style="width:130px;color:#333;font:600 15px system-ui">${index + 1}. ${name}</div>
      <div style="width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px">${markSvg(name, 144)}</div>
      <div style="width:${cell}px;height:${cell}px;display:flex;align-items:center;justify-content:center">${iconSvg(name, 144)}</div>
      ${sizes
        .slice(1)
        .map(
          (s) => `<div style="width:96px;height:${cell}px;display:flex;align-items:center;justify-content:center">${iconSvg(name, s)}</div>`,
        )
        .join('')}
    </div>`;
  }
  body += `<div style="display:flex;gap:20px;margin-top:16px">${names
    .map((n) => `<div style="width:440px;overflow:hidden;border-radius:14px"><div style="transform:scale(0.5);transform-origin:top left;width:880px;height:200px">${lockupSvg(n)}</div></div>`)
    .join('')}</div>`;

  const width = 130 + 2 * cell + 3 * 96 + 24 * 8;
  const page = await browser.newPage({ viewport: { width, height: names.length * (cell + 20) + 300 } });
  await page.setContent(`<!doctype html><html><body style="margin:0;padding:28px;background:#f5f5f5;display:flex;flex-direction:column;gap:20px">${body}</body></html>`);
  const outDir = path.join(ROOT, '.tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'brand-preview.png');
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(`预览已生成: ${out}`);
}

async function build(design) {
  if (!DESIGNS[design]) {
    console.error(`未知设计 "${design}", 可选: ${Object.keys(DESIGNS).join(', ')}`);
    process.exit(2);
  }
  const brandDir = path.join(ROOT, 'assets', 'brand');
  const webPublicDir = path.join(ROOT, 'apps', 'web', 'public');
  const webBrandDir = path.join(webPublicDir, 'brand');

  const master = {
    'tracevane-mark.svg': markSvg(design),
    'favicon.svg': iconSvg(design),
    'tracevane-lockup.svg': lockupSvg(design),
    'tracevane-logo-poster.svg': posterSvg(design),
  };

  const browser = await chromium.launch();
  const raster = {};
  raster['favicon-16.png'] = await renderPng(browser, iconSvg(design, 16), 16, 16);
  raster['favicon-32.png'] = await renderPng(browser, iconSvg(design, 32), 32, 32);
  const ico48 = await renderPng(browser, iconSvg(design, 48), 48, 48);
  raster['favicon.ico'] = buildIco([
    { size: 16, png: raster['favicon-16.png'] },
    { size: 32, png: raster['favicon-32.png'] },
    { size: 48, png: ico48 },
  ]);
  raster['apple-touch-icon.png'] = await renderPng(browser, iconSvg(design, 180), 180, 180);
  raster['icon-192.png'] = await renderPng(browser, iconSvg(design, 192), 192, 192);
  raster['icon-512.png'] = await renderPng(browser, iconSvg(design, 512), 512, 512);
  raster['tracevane-mark-96.png'] = await renderPng(browser, markSvg(design, 96), 96, 96, { omitBackground: true });
  raster['tracevane-logo-poster.png'] = await renderPng(browser, posterSvg(design), 1200, 630);
  await browser.close();

  for (const [name, svg] of Object.entries(master)) fs.writeFileSync(path.join(brandDir, name), svg);
  for (const [name, png] of Object.entries(raster)) fs.writeFileSync(path.join(brandDir, name), png);

  const webRoot = ['favicon.svg', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
  for (const name of webRoot) fs.writeFileSync(path.join(webPublicDir, name), master[name] ?? raster[name]);
  const webBrand = ['favicon.svg', 'tracevane-mark.svg', 'tracevane-lockup.svg', 'tracevane-logo-poster.svg', 'tracevane-logo-poster.png'];
  for (const name of webBrand) fs.writeFileSync(path.join(webBrandDir, name), master[name] ?? raster[name]);

  console.log(`已用设计 "${design}" 生成品牌资产:`);
  console.log(`  ${path.relative(ROOT, brandDir)}/`);
  console.log(`  ${path.relative(ROOT, webPublicDir)}/`);
  console.log(`  ${path.relative(ROOT, webBrandDir)}/`);
}

const [command, design] = process.argv.slice(2);
if (command === 'preview') await preview();
else if (command === 'build') await build(design);
else {
  console.error('用法: node scripts/generate-brand-assets.mjs <preview|build <design>>');
  process.exit(2);
}
