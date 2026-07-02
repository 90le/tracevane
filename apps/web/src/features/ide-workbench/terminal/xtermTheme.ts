import type { ITheme } from "@xterm/xterm";

function readToken(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

export function createXtermAuroraTheme(host: HTMLElement): ITheme {
  const style = getComputedStyle(host);
  const panel = readToken(style, "--panel", "Canvas");
  const panel2 = readToken(style, "--panel-2", panel);
  const panel3 = readToken(style, "--panel-3", panel2);
  const ink = readToken(style, "--ink", "CanvasText");
  const strong = readToken(style, "--ink-strong", ink);
  const subtle = readToken(style, "--subtle", ink);
  const primary = readToken(style, "--primary", strong);
  const green = readToken(style, "--green", primary);
  const amber = readToken(style, "--amber", primary);
  const red = readToken(style, "--red", primary);
  const teal = readToken(style, "--teal", primary);
  const violet = readToken(style, "--violet", primary);

  return {
    background: panel,
    foreground: ink,
    cursor: primary,
    cursorAccent: panel,
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
