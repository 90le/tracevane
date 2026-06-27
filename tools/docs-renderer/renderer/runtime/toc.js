export function initToc() {
  const toc = document.querySelector('.toc-panel');
  const toggle = document.querySelector('.toc-toggle');
  const fab = document.querySelector('.toc-fab');
  const backdrop = document.querySelector('.toc-backdrop');
  const smallScreen = window.matchMedia('(max-width: 980px)');

  if (toc && toggle) {
    const setCollapsed = (collapsed) => {
      document.body.classList.toggle('toc-collapsed', collapsed);
      document.body.classList.toggle('toc-open', !collapsed && smallScreen.matches);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      if (fab) fab.setAttribute('aria-expanded', String(!collapsed));
      if (backdrop) backdrop.hidden = collapsed || !smallScreen.matches;
    };

    setCollapsed(smallScreen.matches);
    toggle.addEventListener('click', () => setCollapsed(!document.body.classList.contains('toc-collapsed')));
    if (fab) fab.addEventListener('click', () => setCollapsed(false));
    if (backdrop) backdrop.addEventListener('click', () => setCollapsed(true));
    toc.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (smallScreen.matches) setCollapsed(true);
      });
    });
    smallScreen.addEventListener('change', (event) => setCollapsed(event.matches));
  }

  const tocLinks = Array.from(document.querySelectorAll('.page-toc-section a[href^="#"]'));
  if (!tocLinks.length) return;

  const tocById = new Map();
  tocLinks.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const id = decodeURIComponent(href.slice(1));
    if (id) tocById.set(id, link);
  });

  const headings = Array.from(document.querySelectorAll('main :is(h1,h2,h3,h4,h5,h6)[id]')).filter((heading) => tocById.has(heading.id));
  const activate = (id) => {
    tocLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const current = decodeURIComponent(href.slice(1)) === id;
      link.classList.toggle('is-visible', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    const active = tocById.get(id);
    if (active && toc && !document.body.classList.contains('toc-collapsed')) {
      active.scrollIntoView({ block: 'nearest' });
    }
  };

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) activate(visible[0].target.id);
  }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 1] });

  headings.forEach((heading) => observer.observe(heading));
  if (location.hash) {
    const id = decodeURIComponent(location.hash.slice(1));
    if (tocById.has(id)) activate(id);
  } else if (headings[0]) {
    activate(headings[0].id);
  }
}
