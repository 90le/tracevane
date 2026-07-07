import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || `http://127.0.0.1:${process.env.TRACEVANE_WEB_PORT || '5176'}`;
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(pathname, options = {}) {
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}${pathname}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers ?? {}),
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const error = new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500) throw error;
      await sleep(250);
    }
  }
  throw lastError;
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 340 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom', visible: true, collapsed: false, size: 220,
      bottomSize: 220, rightWidth: 420, maximized: false, activePanelId: 'output',
    },
    viewPlacements: [
      { viewId: 'explorer', placement: 'primary-sidebar', order: 0, visible: true },
      { viewId: 'search', placement: 'primary-sidebar', order: 1, visible: true },
      { viewId: 'terminal', placement: 'panel', order: 0, visible: true },
      { viewId: 'problems', placement: 'panel', order: 1, visible: true },
      { viewId: 'output', placement: 'panel', order: 2, visible: true },
      { viewId: 'debugConsole', placement: 'panel', order: 3, visible: true },
    ],
    editorGroups: [{ id: 'main', activeTabId: null, tabs: [] }],
    activeEditorGroupId: 'main',
    dockviewLayout: null,
  };
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId) throw new Error('No file root is available for IDE LSP provider status smoke');

  const status = await api('/api/lsp/status');
  const yamlProfile = status.externalProviders?.profiles?.find((profile) => profile.id === 'yaml');
  if (!yamlProfile?.enabled) {
    throw new Error(`Expected enabled yaml external provider profile: ${JSON.stringify(status.externalProviders)}`);
  }
  const bashProfile = status.externalProviders?.profiles?.find((profile) => profile.id === 'bash');
  if (!bashProfile?.enabled) {
    throw new Error(`Expected enabled bash external provider profile: ${JSON.stringify(status.externalProviders)}`);
  }
  const yamlMetadata = status.externalProviders?.metadata?.find((item) => item.providerId === 'yaml');
  const bashMetadata = status.externalProviders?.metadata?.find((item) => item.providerId === 'bash');
  const pyrightProfile = status.externalProviders?.profiles?.find((profile) => profile.id === 'pyright');
  const pyrightMetadata = status.externalProviders?.metadata?.find((item) => item.providerId === 'pyright');
  const dockerfileProfile = status.externalProviders?.profiles?.find((profile) => profile.id === 'dockerfile');
  const dockerfileMetadata = status.externalProviders?.metadata?.find((item) => item.providerId === 'dockerfile');
  if (yamlProfile.install?.status !== 'installed' || yamlMetadata?.installStatus !== 'installed' || !yamlMetadata.version) {
    throw new Error(`Expected installed yaml provider metadata: ${JSON.stringify(status.externalProviders)}`);
  }
  if (bashProfile.install?.status !== 'installed' || bashMetadata?.installStatus !== 'installed' || bashMetadata.version !== '5.6.0') {
    throw new Error(`Expected installed bash provider metadata: ${JSON.stringify(status.externalProviders)}`);
  }
  if (pyrightProfile?.install?.status !== 'installed' || pyrightMetadata?.installStatus !== 'installed' || pyrightMetadata.version !== '1.1.411') {
    throw new Error(`Expected installed pyright provider metadata: ${JSON.stringify(status.externalProviders)}`);
  }
  if (dockerfileProfile?.install?.status !== 'installed' || dockerfileMetadata?.installStatus !== 'installed' || dockerfileMetadata.version !== '0.15.0') {
    throw new Error(`Expected installed dockerfile provider metadata: ${JSON.stringify(status.externalProviders)}`);
  }
  if (yamlMetadata.policy?.autoInstall !== false || bashMetadata.policy?.frontendCanProvideCommand !== false || pyrightMetadata.policy?.frontendCanProvideCommand !== false || dockerfileMetadata.policy?.frontendCanProvideCommand !== false) {
    throw new Error(`Expected read-only provider policy metadata: ${JSON.stringify(status.externalProviders)}`);
  }

  const layout = createDefaultWorkbenchLayout('');
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout, terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 840 } });
  await page.addInitScript(({ key, layout }) => {
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });

    const statusButton = page.locator('[data-ide-status-lsp]');
    await statusButton.waitFor({ state: 'visible', timeout: 30_000 });
    await statusButton.click();
    await page.locator('[data-ide-lsp-provider-status-dialog]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="yaml"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="bash"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="pyright"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="dockerfile"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="yaml"] [data-ide-lsp-provider-source]').filter({ hasText: 'npm:yaml-language-server' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="bash"] [data-ide-lsp-provider-audit-note]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="yaml"] [data-ide-lsp-provider-install-status]').filter({ hasText: 'installed' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="bash"] [data-ide-lsp-provider-version]').filter({ hasText: '5.6.0' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="pyright"] [data-ide-lsp-provider-version]').filter({ hasText: '1.1.411' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="dockerfile"] [data-ide-lsp-provider-version]').filter({ hasText: '0.15.0' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-close]').click();
    await page.locator('[data-ide-lsp-provider-status-dialog]').waitFor({ state: 'detached', timeout: 10_000 });

    await page.locator('[data-ide-command-palette-button]').click();
    await page.locator('[data-ide-command-palette]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-command-palette-input]').fill('>lsp');
    await page.locator('[data-ide-command-palette-command-id="workbench.action.lsp.showExternalProviderStatus"]').click();
    await page.locator('[data-ide-lsp-provider-status-dialog]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="yaml"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="bash"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="pyright"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-lsp-provider-status-row][data-ide-lsp-provider-status-provider-id="dockerfile"]').waitFor({ state: 'visible', timeout: 10_000 });
  } finally {
    await browser.close().catch(() => undefined);
    const severe = logs.filter((line) => line.includes('[pageerror]'));
    if (severe.length) console.warn(severe.join('\n'));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
