const viewportSubscribers = new Set();
let viewportInstalled = false;
let viewportScheduled = false;

export function rafThrottle(callback) {
  let scheduled = false;
  let lastArgs = [];
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      callback(...lastArgs);
    });
  };
}

export function onViewportChange(callback) {
  viewportSubscribers.add(callback);
  if (!viewportInstalled) {
    viewportInstalled = true;
    const flush = () => {
      if (viewportScheduled) return;
      viewportScheduled = true;
      window.requestAnimationFrame(() => {
        viewportScheduled = false;
        viewportSubscribers.forEach((subscriber) => subscriber());
      });
    };
    window.addEventListener('scroll', flush, { passive: true });
    window.addEventListener('resize', flush);
  }
  return () => viewportSubscribers.delete(callback);
}

export function whenVisible(element, callback, options = {}) {
  if (!element || !('IntersectionObserver' in window)) {
    callback();
    return () => {};
  }
  let done = false;
  const observer = new IntersectionObserver((entries) => {
    if (done || !entries.some((entry) => entry.isIntersecting)) return;
    done = true;
    observer.disconnect();
    callback();
  }, { rootMargin: options.rootMargin || '700px 0px' });
  observer.observe(element);
  return () => observer.disconnect();
}
