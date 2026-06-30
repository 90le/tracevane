import * as React from "react";

const MIN_KEYBOARD_INSET = 80;
const FOCUSED_FIELD_GAP = 24;
const MAX_SURFACE_SHRINK_RATIO = 0.45;

/**
 * Mobile soft-keyboard avoidance based on the browser VisualViewport contract.
 *
 * The important detail is that keyboard avoidance must be scoped to the actual
 * editing surface and, when possible, to the focused field inside that surface.
 * A blunt `innerHeight - visualViewport.height` inset double-compensates on
 * browsers that already move/resize the visual viewport and creates the mobile
 * bug the workspace hit: a blank strip appears above the editor before content.
 *
 * Pass the scroll/editor surface ref whenever possible. The hook measures how
 * much of that exact surface is below the visual viewport and caps the inset by
 * the focused editable rect when it can see one. Without a ref it falls back to
 * the global overlay inset for non-DOM callers.
 */
export interface VisualViewportKeyboardInsetOptions {
  /**
   * When true, only apply keyboard avoidance if the focused editable can be
   * measured inside the target. Turn this off for canvas-like controls such as
   * xterm/Monaco hidden textareas where the real input node may be zero-sized.
   */
  requireFocusedTarget?: boolean;
  /**
   * Canvas-like controls such as xterm.js do not expose a meaningful focused
   * field rect. When enabled, use the global visual viewport / VirtualKeyboard
   * occlusion as a fallback so the bottom input line is still lifted above the
   * soft keyboard. Keep this off for document editors to avoid double spacing
   * when the browser already resized the layout viewport.
   */
  includeViewportOverlayInset?: boolean;
}

export function useVisualViewportKeyboardInset(
  targetRef?: React.RefObject<HTMLElement | null>,
  options: VisualViewportKeyboardInsetOptions = {},
): number {
  const [inset, setInset] = React.useState(0);
  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const coarseQuery = window.matchMedia?.(
      "(pointer: coarse), (max-width: 768px)",
    );

    const requireFocusedTarget = options.requireFocusedTarget ?? true;
    const includeViewportOverlayInset =
      options.includeViewportOverlayInset ?? false;

    const update = () => {
      if (coarseQuery && !coarseQuery.matches) {
        setInset(0);
        return;
      }

      const visualBottom = Math.round(viewport.height + viewport.offsetTop);
      const target = targetRef?.current;
      if (target) {
        const targetRect = target.getBoundingClientRect();
        const targetOverlap = Math.max(
          0,
          Math.round(targetRect.bottom - visualBottom),
        );
        const viewportOverlayInset = includeViewportOverlayInset
          ? getViewportOverlayKeyboardInset(viewport, targetRect)
          : 0;
        const effectiveTargetOverlap = Math.max(
          targetOverlap,
          viewportOverlayInset,
        );
        if (effectiveTargetOverlap <= MIN_KEYBOARD_INSET) {
          setInset(0);
          return;
        }

        const focusedRect = getFocusedRectInside(target);
        if (!focusedRect && requireFocusedTarget) {
          setInset(0);
          return;
        }
        const focusOverlap = focusedRect
          ? Math.max(
              0,
              Math.round(focusedRect.bottom + FOCUSED_FIELD_GAP - visualBottom),
            )
          : effectiveTargetOverlap;
        const maxSurfaceInset = Math.round(
          targetRect.height * MAX_SURFACE_SHRINK_RATIO,
        );
        const scopedInset = Math.min(
          effectiveTargetOverlap,
          focusOverlap,
          maxSurfaceInset,
        );
        setInset(scopedInset > MIN_KEYBOARD_INSET ? scopedInset : 0);
        return;
      }

      // Fallback for non-DOM callers: only compensate overlay keyboards. If the
      // browser already resized the layout viewport, this remains zero.
      const overlayInset = Math.max(
        getVirtualKeyboardInset(),
        Math.max(0, Math.round(window.innerHeight) - visualBottom),
      );
      setInset(overlayInset > MIN_KEYBOARD_INSET ? overlayInset : 0);
    };

    update();
    const resizeObserver = targetRef?.current
      ? new ResizeObserver(update)
      : null;
    if (targetRef?.current) resizeObserver?.observe(targetRef.current);

    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    viewport.addEventListener("scrollend", update);
    coarseQuery?.addEventListener?.("change", update);
    getVirtualKeyboard()?.addEventListener?.("geometrychange", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    return () => {
      resizeObserver?.disconnect();
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      viewport.removeEventListener("scrollend", update);
      coarseQuery?.removeEventListener?.("change", update);
      window.removeEventListener("orientationchange", update);
      getVirtualKeyboard()?.removeEventListener?.("geometrychange", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
    };
  }, [
    options.includeViewportOverlayInset,
    options.requireFocusedTarget,
    targetRef,
  ]);

  return inset;
}

function getViewportOverlayKeyboardInset(
  viewport: VisualViewport,
  targetRect: DOMRect,
): number {
  const visualBottom = Math.round(viewport.height + viewport.offsetTop);
  const layoutOverlayInset = Math.max(
    0,
    Math.round(window.innerHeight) - visualBottom,
  );
  const virtualKeyboardInset = getVirtualKeyboardInset();
  const overlayInset = Math.max(layoutOverlayInset, virtualKeyboardInset);
  if (overlayInset <= 0) return 0;

  // Scope the global occlusion to the current surface. If the surface already
  // ends above the visible viewport, the browser has handled it for us.
  const targetBottomGap = Math.max(
    0,
    Math.round(targetRect.bottom - visualBottom),
  );
  return Math.max(targetBottomGap, overlayInset);
}

function getVirtualKeyboardInset(): number {
  const keyboard = getVirtualKeyboard();
  const rect = keyboard?.boundingRect;
  return rect ? Math.max(0, Math.round(rect.height)) : 0;
}

function getVirtualKeyboard():
  (EventTarget & { boundingRect?: DOMRect }) | null {
  const nav = navigator as Navigator & {
    virtualKeyboard?: EventTarget & { boundingRect?: DOMRect };
  };
  return nav.virtualKeyboard ?? null;
}

function getFocusedRectInside(target: HTMLElement): DOMRect | null {
  if (target instanceof HTMLIFrameElement) {
    return getFrameFocusedRect(target);
  }

  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active === target || target.contains(active)) {
    if (active instanceof HTMLTextAreaElement) {
      return getTextareaCaretApproxRect(active);
    }
    const selectionRect = getSelectionRectInside(active);
    if (selectionRect) return selectionRect;
    const rect = active.getBoundingClientRect();
    return isUsefulRect(rect) ? rect : null;
  }

  const frame = active instanceof HTMLIFrameElement ? active : null;
  if (frame && target.contains(frame)) return getFrameFocusedRect(frame);
  return null;
}

function getFrameFocusedRect(frame: HTMLIFrameElement): DOMRect | null {
  const frameRect = frame.getBoundingClientRect();
  try {
    const active = frame.contentDocument?.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const innerRect =
      getSelectionRectInside(active) ?? active.getBoundingClientRect();
    if (!isUsefulRect(innerRect)) return null;
    return new DOMRect(
      frameRect.left + innerRect.left,
      frameRect.top + innerRect.top,
      innerRect.width,
      innerRect.height,
    );
  } catch {
    return frameRect;
  }
}

function getSelectionRectInside(active: HTMLElement): DOMRect | null {
  const doc = active.ownerDocument;
  const selection = doc.getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0).cloneRange();
  const rect = range.getBoundingClientRect();
  if (isUsefulRect(rect)) return rect;
  const fallback = range.getClientRects()[0];
  return fallback && isUsefulRect(fallback) ? fallback : null;
}

function getTextareaCaretApproxRect(
  textarea: HTMLTextAreaElement,
): DOMRect | null {
  const rect = textarea.getBoundingClientRect();
  if (!isUsefulRect(rect)) return null;
  const styles = window.getComputedStyle(textarea);
  const lineHeight =
    parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.4 || 20;
  const paddingTop = parseFloat(styles.paddingTop) || 0;
  const paddingLeft = parseFloat(styles.paddingLeft) || 0;
  const valueBeforeCaret = textarea.value.slice(
    0,
    textarea.selectionStart ?? 0,
  );
  const lineIndex = valueBeforeCaret.split(/\r\n|\r|\n/).length - 1;
  const caretTop =
    rect.top + paddingTop + lineIndex * lineHeight - textarea.scrollTop;
  return new DOMRect(
    rect.left + paddingLeft,
    Math.max(rect.top, caretTop),
    1,
    lineHeight,
  );
}

function isUsefulRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}
