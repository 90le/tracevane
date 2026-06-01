import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  extractStudioResourceRefs,
  hasResourceForRef,
  hasReadyResourceForRef,
  mergeChatResourceItems,
  resetChatResourceResolverForTest,
  resolveMissingStudioResourcesForMarkdown,
  setChatResourceResolveTransportForTest,
} from '../../apps/web-vue/src/features/chat/chat-resource-resolver.ts';

type MarkdownModule = typeof import('../../apps/web-vue/src/features/chat/markdown.ts');

let markdownImportSerial = 0;

async function withDom<T>(run: (markdown: MarkdownModule) => Promise<T> | T): Promise<T> {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const previousDescriptors = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    Element: Object.getOwnPropertyDescriptor(globalThis, 'Element'),
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement'),
    HTMLAnchorElement: Object.getOwnPropertyDescriptor(globalThis, 'HTMLAnchorElement'),
    HTMLImageElement: Object.getOwnPropertyDescriptor(globalThis, 'HTMLImageElement'),
    HTMLVideoElement: Object.getOwnPropertyDescriptor(globalThis, 'HTMLVideoElement'),
    HTMLSourceElement: Object.getOwnPropertyDescriptor(globalThis, 'HTMLSourceElement'),
    SVGSVGElement: Object.getOwnPropertyDescriptor(globalThis, 'SVGSVGElement'),
    MutationObserver: Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver'),
    Node: Object.getOwnPropertyDescriptor(globalThis, 'Node'),
    NodeFilter: Object.getOwnPropertyDescriptor(globalThis, 'NodeFilter'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  };

  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLAnchorElement: dom.window.HTMLAnchorElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    HTMLVideoElement: dom.window.HTMLVideoElement,
    HTMLSourceElement: dom.window.HTMLSourceElement,
    SVGSVGElement: dom.window.SVGSVGElement,
    MutationObserver: dom.window.MutationObserver,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    navigator: dom.window.navigator,
  })) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  try {
    markdownImportSerial += 1;
    const markdown = await import(`../../apps/web-vue/src/features/chat/markdown.ts?test=${markdownImportSerial}`);
    return await run(markdown);
  } finally {
    for (const [key, descriptor] of Object.entries(previousDescriptors)) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete (globalThis as Record<string, unknown>)[key];
      }
    }
    dom.window.close();
  }
}

test('studio markdown resource resolver extracts refs without code or angle-link duplicates', () => {
  const refs = extractStudioResourceRefs([
    '请看 [报告](<uploads:report final.pdf> "studio:inline-chip")。',
    '结构图 ![图](workspace:diagram.png "studio:break-image")。',
    '`workspace:code-sample.png` should stay plain.',
    '```md',
    '[skip](uploads:inside-code.png "studio:card")',
    '```',
  ].join('\n'));

  assert.deepEqual(refs, ['uploads:report final.pdf', 'workspace:diagram.png']);
  const missingResource = {
    id: 'upload-report',
    kind: 'file' as const,
    url: '',
    downloadUrl: '',
    fileName: 'report final.pdf',
    mimeType: 'application/pdf',
    originalPath: 'uploads:report final.pdf',
    relativePath: 'uploads/report final.pdf',
    source: 'studio_resource' as const,
    status: 'missing' as const,
    placement: 'append' as const,
  };
  const readyResource = {
    ...missingResource,
    id: 'upload-report-ready',
    url: '/api/chat/sessions/demo/media/report.pdf',
    downloadUrl: '/api/chat/sessions/demo/media/report.pdf?download=1',
    status: 'ready' as const,
  };

  assert.equal(hasResourceForRef([
    missingResource,
  ], 'uploads:report final.pdf'), true);
  assert.equal(hasReadyResourceForRef([
    missingResource,
  ], 'uploads:report final.pdf'), false);
  assert.deepEqual(mergeChatResourceItems([
    missingResource,
  ], [
    readyResource,
  ]), [
    readyResource,
  ]);
  assert.equal(mergeChatResourceItems(undefined, undefined), undefined);
});

test('studio markdown resource resolver keeps ready refs from refetching', () => {
  assert.equal(hasReadyResourceForRef([
    {
      id: 'upload-report-ready',
      kind: 'file',
      url: '/api/chat/sessions/demo/media/report.pdf',
      downloadUrl: '/api/chat/sessions/demo/media/report.pdf?download=1',
      fileName: 'report final.pdf',
      mimeType: 'application/pdf',
      originalPath: 'uploads:report final.pdf',
      relativePath: 'uploads/report final.pdf',
      source: 'studio_resource',
      status: 'ready',
      placement: 'append',
    },
  ], 'uploads:report final.pdf'), true);
});

test('studio markdown resource resolver batches concurrent missing refs per session', async () => {
  resetChatResourceResolverForTest();
  const calls: string[][] = [];
  const restore = setChatResourceResolveTransportForTest(async (sessionKey, payload) => {
    assert.equal(sessionKey, 'session-batch');
    calls.push([...payload.refs]);
    return {
      ok: true,
      sessionKey,
      resources: payload.refs.map((ref) => ({
        ref,
        resourceRef: ref,
        aiReadable: false,
        resource: {
          id: `resource:${ref}`,
          kind: 'image',
          url: '',
          downloadUrl: '',
          fileName: ref.split('/').pop()?.split(':').pop() || 'image.png',
          mimeType: 'image/png',
          originalPath: ref,
          source: 'studio_resource',
          status: 'missing',
          placement: 'append',
        },
      })),
    };
  });

  try {
    const [first, second] = await Promise.all([
      resolveMissingStudioResourcesForMarkdown(
        'session-batch',
        '![A](workspace:a.png "studio:break-image")',
        undefined,
      ),
      resolveMissingStudioResourcesForMarkdown(
        'session-batch',
        '![B](workspace:b.png "studio:break-image") ![A](workspace:a.png "studio:break-image")',
        undefined,
      ),
    ]);

    assert.deepEqual(calls, [['workspace:a.png', 'workspace:b.png']]);
    assert.deepEqual(first.map((item) => item.originalPath), ['workspace:a.png']);
    assert.deepEqual(second.map((item) => item.originalPath), ['workspace:b.png', 'workspace:a.png']);

    const cached = await resolveMissingStudioResourcesForMarkdown(
      'session-batch',
      '![A](workspace:a.png "studio:break-image")',
      undefined,
    );
    assert.deepEqual(cached.map((item) => item.originalPath), ['workspace:a.png']);
    assert.deepEqual(calls, [['workspace:a.png', 'workspace:b.png']]);
  } finally {
    restore();
    resetChatResourceResolverForTest();
  }
});

test('studio markdown resource resolver prunes old cache entries under long histories', async () => {
  resetChatResourceResolverForTest();
  const calls: string[][] = [];
  const restore = setChatResourceResolveTransportForTest(async (sessionKey, payload) => {
    assert.equal(sessionKey, 'session-cache-limit');
    calls.push([...payload.refs]);
    return {
      ok: true,
      sessionKey,
      resources: payload.refs.map((ref) => ({
        ref,
        resourceRef: ref,
        aiReadable: false,
        resource: {
          id: `resource:${ref}`,
          kind: 'image',
          url: '',
          downloadUrl: '',
          fileName: ref.split('/').pop()?.split(':').pop() || 'image.png',
          mimeType: 'image/png',
          originalPath: ref,
          source: 'studio_resource',
          status: 'missing',
          placement: 'append',
        },
      })),
    };
  });

  try {
    await Promise.all(Array.from({ length: 805 }, (_item, index) => (
      resolveMissingStudioResourcesForMarkdown(
        'session-cache-limit',
        `![R](workspace:${index}.png "studio:break-image")`,
        undefined,
      )
    )));
    const callCountAfterFill = calls.length;

    await resolveMissingStudioResourcesForMarkdown(
      'session-cache-limit',
      '![R](workspace:0.png "studio:break-image")',
      undefined,
    );

    assert.equal(calls.length, callCountAfterFill + 1);
    assert.deepEqual(calls[calls.length - 1], ['workspace:0.png']);
  } finally {
    restore();
    resetChatResourceResolverForTest();
  }
});

test('raw html keeps style/align attributes and is not split into text fragments', async () => {
  const result = await withDom(({ renderChatMarkdownResult }) => renderChatMarkdownResult(
    [
      '<div style="display:flex;gap:28px;align-items:center;margin:20px 0;flex-wrap:wrap">',
      '  <div align="center">Ops</div>',
      '</div>',
    ].join('\n'),
    {
      interactive: true,
      inlineHtml: true,
      inlineSvg: true,
      sanitizeLevel: 'moderate',
    },
  ));

  assert.match(result.html, /<div[^>]*style="display:flex;gap:28px;align-items:center;margin:20px 0;flex-wrap:wrap"/);
  assert.match(result.html, /<div[^>]*align="center"[^>]*>Ops<\/div>/);
  assert.doesNotMatch(result.html, /style=&quot;display:flex/);
  assert.doesNotMatch(result.html, /align=&quot;center&quot;&gt;/);
});

test('mixed raw html and markdown renders markdown inside html containers', async () => {
  const result = await withDom(({ renderChatMarkdownResult }) => renderChatMarkdownResult(
    [
      '<div class="wrap">',
      '',
      '**Bold** and `code`',
      '',
      '</div>',
    ].join('\n'),
    {
      interactive: true,
      inlineHtml: true,
      inlineSvg: true,
      sanitizeLevel: 'moderate',
    },
  ));

  assert.match(result.html, /<div[^>]*class="wrap"[^>]*>/);
  assert.match(result.html, /<strong>Bold<\/strong>/);
  assert.match(result.html, /<code>code<\/code>/);
});

test('fenced html/svg/mermaid blocks restore preview placeholders', async () => {
  const source = [
    '```html',
    '<div style="color:red">demo</div>',
    '```',
    '',
    '```svg',
    '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>',
    '```',
    '',
    '```mermaid',
    'graph TD; A-->B;',
    '```',
  ].join('\n');

  const result = await withDom(({ renderChatMarkdownResult }) => renderChatMarkdownResult(source, {
    interactive: true,
    inlineHtml: true,
    inlineSvg: true,
    sanitizeLevel: 'moderate',
  }));

  assert.match(result.html, /preview-kind-html/);
  assert.match(result.html, /preview-kind-svg/);
  assert.match(result.html, /preview-kind-mermaid/);
  assert.equal(result.hasPreviewBlocks, true);
  assert.equal(result.hasMermaid, true);
});

test('math delimiters render stable placeholders for KaTeX enhancement', async () => {
  const source = [
    'Standard formula:',
    '',
    '\\[ a \\oplus b := a+b+1 \\]',
    '',
    'Bracket shorthand:',
    '',
    '[ a \\oplus b := a+b+1 ]',
    '',
    'Inline \\(x^2+y^2=z^2\\), dollar $e^{i\\pi} + 1 = 0$, and bracket [ m+n=2 ].',
    '',
    '- Binomial: $\\binom{n}{k} = \\frac{n!}{k!(n-k)!}$',
    '- Conditional: $P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}$',
    '- Norm: $\\|x\\|_2 = \\sqrt{\\sum_{i=1}^n x_i^2}$',
    '',
    'Do not render price $5 or inline code `$x+y$`.',
    '',
    '```text',
    '\\[ not math inside code \\]',
    '```',
  ].join('\n');

  const result = await withDom(({ renderChatMarkdownResult }) => renderChatMarkdownResult(source, {
    interactive: true,
    inlineHtml: true,
    inlineSvg: true,
    sanitizeLevel: 'moderate',
  }));

  assert.equal(result.hasMath, true);
  assert.match(result.html, /class="chat-math chat-math-block"/);
  assert.match(result.html, /class="chat-math chat-math-inline"/);
  assert.doesNotMatch(result.html, /class="chat-math[^"]*"[^>]*data-inline-html-root/);
  assert.match(result.html, /data-math-source="a \\oplus b := a\+b\+1"/);
  assert.match(result.html, /data-math-source="x\^2\+y\^2=z\^2"/);
  assert.match(result.html, /data-math-source="e\^\{i\\pi\} \+ 1 = 0"/);
  assert.match(result.html, /data-math-source="\\binom\{n\}\{k\} = \\frac\{n!\}\{k!\(n-k\)!\}"/);
  assert.match(result.html, /data-math-source="P\(A\\mid B\)=\\frac\{P\(A\\cap B\)\}\{P\(B\)\}"/);
  assert.match(result.html, /data-math-source="\\\|x\\\|_2 = \\sqrt\{\\sum_\{i=1\}\^n x_i\^2\}"/);
  assert.match(result.html, /<code>\$x\+y\$<\/code>/);
  assert.doesNotMatch(result.html, /data-math-source="x\+y"/);
  assert.match(result.html, /data-copy-source="\\\[ not math inside code \\\]"/);
  assert.match(result.html, /<code class="hljs language-text">\\\[ not math inside code \\\]\n<\/code>/);
});

test('missing studio-file markdown media renders a safe placeholder instead of the custom scheme', async () => {
  const href = 'studio-file:/home/binbin/.openclaw/media/tool-image-generation/missing-city.png';
  const result = await withDom(({ renderChatMarkdownResult }) => renderChatMarkdownResult(
    `![赛博朋克未来城市夜景](${href} "studio:break-image")`,
    {
      interactive: true,
      inlineHtml: true,
      inlineSvg: true,
      sanitizeLevel: 'moderate',
      resources: [
        {
          id: 'resource-missing-city',
          kind: 'image',
          url: '',
          downloadUrl: '',
          fileName: 'missing-city.png',
          mimeType: 'image/png',
          originalPath: href,
          source: 'assistant_markdown',
          status: 'missing',
          placement: 'append',
        },
      ],
    },
  ));

  assert.match(result.html, /Image missing:/);
  assert.match(result.html, /chat-inline-resource[^"]*missing/);
  assert.doesNotMatch(result.html, /src="studio-file:/);
  assert.doesNotMatch(result.html, /href="studio-file:/);
  assert.doesNotMatch(result.html, /ERR_UNKNOWN_URL_SCHEME/);
});

test('markdown cache is invalidated when studio resources become available', async () => {
  const source = '![结构图](workspace:graph.png "studio:break-image")';
  await withDom(({ renderChatMarkdownResult }) => {
    const first = renderChatMarkdownResult(source, {
      interactive: true,
      inlineHtml: true,
      inlineSvg: true,
      sanitizeLevel: 'moderate',
      resources: [],
    });
    assert.doesNotMatch(first.html, /Image missing:/);

    const second = renderChatMarkdownResult(source, {
      interactive: true,
      inlineHtml: true,
      inlineSvg: true,
      sanitizeLevel: 'moderate',
      resources: [
        {
          id: 'resource-graph',
          kind: 'image',
          url: '',
          downloadUrl: '',
          fileName: 'graph.png',
          mimeType: 'image/png',
          originalPath: 'workspace:graph.png',
          relativePath: 'graph.png',
          source: 'studio_resource',
          status: 'missing',
          placement: 'append',
        },
      ],
    });

    assert.match(second.html, /Image missing:/);
    assert.match(second.html, /chat-inline-resource-image[^"]*missing/);
  });
});

test('fenced code blocks render wrapped toolbar with copy action in interactive mode', async () => {
  const source = [
    '```bash',
    'openclaw status && openclaw gateway status',
    '```',
  ].join('\n');

  const result = await withDom(({ renderChatMarkdownResult }) => renderChatMarkdownResult(source, {
    interactive: true,
    inlineHtml: true,
    inlineSvg: true,
    sanitizeLevel: 'moderate',
  }));

  assert.match(result.html, /class="code-block-wrapper"/);
  assert.match(result.html, /class="code-block-header"/);
  assert.match(result.html, /class="code-block-lang"/);
  assert.match(result.html, /class="chat-md-copy-button code-block-copy"/);
  assert.match(result.html, /data-copy-source="openclaw status &amp;&amp; openclaw gateway status"/);
  assert.match(result.html, /<code class="hljs language-bash">/);
});

test('highlighted code supports additional languages and safe fallbacks', async () => {
  await withDom(({ renderHighlightedCodeHtml }) => {
    const php = renderHighlightedCodeHtml('<?php echo $name;', 'php');
    const go = renderHighlightedCodeHtml('package main\nfunc main() {}', 'go');
    const shell = renderHighlightedCodeHtml('openclaw status && openclaw gateway status', 'shell');
    const powershell = renderHighlightedCodeHtml('Get-Process | Select-Object -First 1', 'powershell');
    const vba = renderHighlightedCodeHtml('Sub Main()\nEnd Sub', 'vba');
    const dax = renderHighlightedCodeHtml('Total Sales = SUM(Sales[Amount])', 'dax');
    const pq = renderHighlightedCodeHtml('let\n  Source = 1\nin\n  Source', 'pq');

    assert.match(php, /<code class="hljs language-php">/);
    assert.match(go, /<code class="hljs language-go">/);
    assert.match(shell, /<code class="hljs language-shell">/);
    assert.match(powershell, /<code class="hljs language-powershell">/);
    assert.match(vba, /<code class="hljs language-vba">/);
    assert.match(dax, /<code class="hljs language-dax">/);
    assert.match(pq, /<code class="hljs language-pq">/);
  });
});
