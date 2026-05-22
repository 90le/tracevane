const STUDIO_EASE = [0.2, 1, 0.3, 1] as const;
const STUDIO_EXIT_EASE = [0.4, 0, 1, 1] as const;

export const shellChromeReveal = {
  initial: { opacity: 0, y: 8, filter: "blur(8px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.22,
      ease: STUDIO_EASE,
    },
  },
};

export const shellRouteReveal = {
  initial: { opacity: 0, y: 10, scale: 0.992, filter: "blur(10px)" },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.28,
      ease: STUDIO_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.996,
    transition: {
      duration: 0.16,
      ease: STUDIO_EXIT_EASE,
    },
  },
};

export const pageMastheadReveal = {
  initial: { opacity: 0, y: 12, filter: "blur(8px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.3,
      delay: 0.02,
      ease: STUDIO_EASE,
    },
  },
};

export const pageSurfaceReveal = {
  initial: { opacity: 0, y: 12, scale: 0.992 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.34,
      delay: 0.04,
      ease: STUDIO_EASE,
    },
  },
};

export const floatingPanelReveal = {
  initial: { opacity: 0, y: 8, scale: 0.98, filter: "blur(8px)" },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.22,
      ease: STUDIO_EASE,
    },
  },
  exit: {
    opacity: 0,
    y: 6,
    scale: 0.985,
    transition: {
      duration: 0.14,
      ease: STUDIO_EXIT_EASE,
    },
  },
};
