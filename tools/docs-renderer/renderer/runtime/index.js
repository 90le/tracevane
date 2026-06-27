import { initToc } from './toc.js';
import { createModalApi } from './modal.js';
import { initHeadingAnchors } from './headings.js';
import { initCodeBlocks } from './code-block.js';
import { initMermaidBlocks, initHtmlPreviewBlocks, initChartBlocks, initMindmapBlocks, initTables } from './rich-blocks.js';
import { initMermaidRuntime } from './mermaid.js';
import { initSearch } from './search.js';
import { initThemeToggle } from './theme.js';
import { initMediaLightbox } from './media.js';
import { initReadingProgress } from './reading-progress.js';
import { initReadingSettings } from './reading-settings.js';
import { initBackToTop } from './back-to-top.js';
import { initKeyboardHelp } from './keyboard-help.js';
import { initBlockReferencePreviews } from './link-preview.js';
import { initInlineMemos } from './inline-memo.js';
import { initLinkGraph } from './link-graph.js';

function init() {
  initThemeToggle();
  initKeyboardHelp();
  initReadingProgress();
  initReadingSettings();
  initBackToTop();
  initToc();
  initSearch();
  initLinkGraph();
  const { openModal } = createModalApi();
  initHeadingAnchors();
  initCodeBlocks(openModal);
  initMermaidBlocks(openModal);
  initHtmlPreviewBlocks(openModal);
  initChartBlocks(openModal);
  initMindmapBlocks(openModal);
  initTables(openModal);
  initMediaLightbox(openModal);
  initBlockReferencePreviews();
  initInlineMemos();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  initMermaidRuntime().catch((error) => {
    console.warn('Failed to initialize mermaid runtime', error);
  });
});
