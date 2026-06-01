import type { Locale } from '../../shared/locale';
import type { ChatMessageItem, ChatResourceItem, ChatSessionRow } from '../../../../../types/chat';

export interface BuildSlashSessionExportDocumentOptions {
  locale: Locale;
  session: ChatSessionRow;
  messages: ChatMessageItem[];
  exportedAt?: string;
  title?: string | null;
}

export interface SlashSessionExportDocument {
  filename: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function slugifyFilename(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'studio-session-export';
}

function formatRole(role: ChatMessageItem['role'], locale: Locale): string {
  if (locale === 'zh') {
    if (role === 'user') return '用户';
    if (role === 'assistant') return '助手';
    if (role === 'system') return '系统';
    return '工具';
  }
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  if (role === 'system') return 'System';
  return 'Tool';
}

function renderResources(resources: ChatResourceItem[] | undefined, locale: Locale): string {
  if (!resources?.length) {
    return '';
  }
  const title = locale === 'zh' ? '资源' : 'Resources';
  const items = resources
    .map((resource) => (
      `<li><strong>${escapeHtml(resource.fileName || resource.id)}</strong>${
        resource.mimeType ? ` <span class="muted">(${escapeHtml(resource.mimeType)})</span>` : ''
      }</li>`
    ))
    .join('');
  return `<section class="message-resources"><h4>${title}</h4><ul>${items}</ul></section>`;
}

function renderMessage(message: ChatMessageItem, locale: Locale): string {
  const timestamp = message.createdAt ? escapeHtml(message.createdAt) : (locale === 'zh' ? '未知时间' : 'Unknown time');
  const text = message.text.trim()
    ? escapeHtml(message.text)
    : (locale === 'zh' ? '（空消息）' : '(empty message)');
  return `
    <article class="message message-${escapeHtml(message.role)}">
      <header class="message-header">
        <span class="message-role">${formatRole(message.role, locale)}</span>
        <span class="message-time">${timestamp}</span>
      </header>
      <div class="message-body">${text}</div>
      ${renderResources(message.resources, locale)}
    </article>
  `;
}

export function buildSlashSessionExportDocument(
  options: BuildSlashSessionExportDocumentOptions,
): SlashSessionExportDocument {
  const exportedAt = options.exportedAt || new Date().toISOString();
  const title = (options.title || options.session.label || options.session.key || 'Studio Session').trim();
  const visibleCountLabel = options.locale === 'zh'
    ? `当前可见消息 ${options.messages.length} 条`
    : `Current visible messages: ${options.messages.length}`;
  const note = options.locale === 'zh'
    ? '说明：这是 Studio 当前页面可见会话内容的本地导出，不包含宿主侧完整 system prompt 导出。'
    : 'Note: this is a local export of the session content currently visible in Studio, not the host-side full system prompt export.';
  const heading = options.locale === 'zh' ? 'Studio 会话导出' : 'Studio Session Export';
  const sessionLabel = options.locale === 'zh' ? '会话' : 'Session';
  const exportedLabel = options.locale === 'zh' ? '导出时间' : 'Exported At';

  const html = `<!doctype html>
<html lang="${options.locale === 'zh' ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1ea;
        --panel: rgba(255, 252, 247, 0.96);
        --ink: #1c1a17;
        --muted: #6f675d;
        --line: rgba(63, 52, 38, 0.14);
        --user: #fff3d4;
        --assistant: #edf7ee;
        --tool: #eef3fb;
        --system: #f2edf8;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(214, 181, 113, 0.18), transparent 30%),
          linear-gradient(180deg, #f8f4ec 0%, #efe7db 100%);
        color: var(--ink);
      }
      .page {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 18px 48px;
      }
      .hero, .message {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--panel);
        box-shadow: 0 20px 48px rgba(64, 47, 21, 0.08);
      }
      .hero {
        padding: 24px;
        margin-bottom: 18px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
        line-height: 1.15;
      }
      .meta {
        display: grid;
        gap: 8px;
        margin-top: 18px;
        color: var(--muted);
      }
      .meta strong {
        color: var(--ink);
      }
      .note {
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px dashed var(--line);
        color: var(--muted);
      }
      .timeline {
        display: grid;
        gap: 14px;
      }
      .message {
        padding: 18px;
      }
      .message-user { background: linear-gradient(180deg, var(--user), rgba(255,255,255,0.92)); }
      .message-assistant { background: linear-gradient(180deg, var(--assistant), rgba(255,255,255,0.92)); }
      .message-tool { background: linear-gradient(180deg, var(--tool), rgba(255,255,255,0.92)); }
      .message-system { background: linear-gradient(180deg, var(--system), rgba(255,255,255,0.92)); }
      .message-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        font-size: 13px;
        color: var(--muted);
      }
      .message-role {
        font-weight: 700;
        color: var(--ink);
      }
      .message-body {
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
        line-height: 1.65;
      }
      .message-resources {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px dashed var(--line);
      }
      .message-resources h4 {
        margin: 0 0 8px;
        font-size: 13px;
      }
      .message-resources ul {
        margin: 0;
        padding-left: 18px;
      }
      .muted {
        color: var(--muted);
      }
      @media (max-width: 640px) {
        .page { padding: 18px 12px 28px; }
        .hero, .message { border-radius: 14px; }
        h1 { font-size: 22px; }
        .message-header { flex-direction: column; gap: 4px; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <h1>${heading}</h1>
        <div class="meta">
          <div><strong>${sessionLabel}:</strong> ${escapeHtml(title)}</div>
          <div><strong>Key:</strong> ${escapeHtml(options.session.key)}</div>
          <div><strong>${exportedLabel}:</strong> ${escapeHtml(exportedAt)}</div>
          <div><strong>${escapeHtml(visibleCountLabel)}</strong></div>
        </div>
        <div class="note">${escapeHtml(note)}</div>
      </section>
      <section class="timeline">
        ${options.messages.map((message) => renderMessage(message, options.locale)).join('')}
      </section>
    </main>
  </body>
</html>`;

  return {
    filename: `${slugifyFilename(title)}.html`,
    html,
  };
}
