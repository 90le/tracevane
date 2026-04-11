const STUDIO_EASE = [0.2, 1, 0.3, 1] as const;

export const shellChromeReveal = {
  initial: { opacity: 1, y: 0 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      ease: STUDIO_EASE,
    },
  },
};

export const shellRouteReveal = {
  initial: { opacity: 1, y: 0 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      ease: STUDIO_EASE,
    },
  },
  exit: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      ease: [0.4, 0, 1, 1] as const,
    },
  },
};

export const pageMastheadReveal = {
  initial: { opacity: 1, y: 0 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      delay: 0,
      ease: STUDIO_EASE,
    },
  },
};

export const pageSurfaceReveal = {
  initial: { opacity: 1, y: 0 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      delay: 0,
      ease: STUDIO_EASE,
    },
  },
};
