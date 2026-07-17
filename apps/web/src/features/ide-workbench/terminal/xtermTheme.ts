import type { ITheme } from "@xterm/xterm";

/**
 * xterm theme driven by the dark-console design tokens. Colors are read from
 * the host's computed style, so the terminal follows the active theme
 * automatically: the dark console palette is the unprefixed default and the
 * light palette applies when `[data-theme="light"]` is set on <html>. The
 * hard-coded fallbacks mirror the token values in `src/design/theme.css`
 * (keyed off `document.documentElement.dataset.theme`) so a host that has not
 * been painted yet still gets the right palette. XtermHost re-invokes this
 * when `data-theme` flips at runtime.
 */
export function createXtermConsoleTheme(host: HTMLElement): ITheme {
  const light = document.documentElement.dataset.theme === "light";
  const style = getComputedStyle(host);
  const canvas = readToken(style, "--canvas", light ? "#F6F7F9" : "#0B0E13");
  const panel3 = readToken(style, "--panel-3", light ? "#E9EBEF" : "#1E2531");
  const ink = readToken(style, "--ink", light ? "#232A35" : "#DCE3EC");
  const strong = readToken(style, "--ink-strong", light ? "#0F141B" : "#F3F6FA");
  const subtle = readToken(style, "--subtle", light ? "#8992A1" : "#68738A");
  const primary = readToken(style, "--primary", light ? "#0891B2" : "#22D3EE");
  const green = readToken(style, "--green", light ? "#059669" : "#34D399");
  const amber = readToken(style, "--amber", light ? "#B45309" : "#FBBF24");
  const red = readToken(style, "--red", light ? "#DC2626" : "#F87171");
  const teal = readToken(style, "--teal", light ? "#0F8F86" : "#2DD4BF");
  const violet = readToken(style, "--violet", light ? "#6D5BD0" : "#A78BFA");

  return {
    background: canvas,
    foreground: ink,
    cursor: primary,
    cursorAccent: canvas,
    selectionBackground: readToken(style, "--primary-soft", primary),
    black: panel3,
    brightBlack: subtle,
    red,
    brightRed: red,
    green,
    brightGreen: green,
    yellow: amber,
    brightYellow: amber,
    blue: primary,
    brightBlue: primary,
    magenta: violet,
    brightMagenta: violet,
    cyan: teal,
    brightCyan: teal,
    white: ink,
    brightWhite: strong,
  };
}

function readToken(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}
