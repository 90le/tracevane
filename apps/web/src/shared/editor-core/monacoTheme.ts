import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";

/**
 * Tracevane console Monaco themes.
 *
 * Every color below mirrors a token from apps/web/src/design/theme.css
 * (Monaco theme objects cannot reference CSS custom properties, so the
 * hex values are duplicated here intentionally — keep them in sync):
 *
 *   dark (default)                light ([data-theme="light"])
 *   --bg      #0B0E13             --bg      #F6F7F9
 *   --panel   #12161D             --panel   #FFFFFF
 *   --panel-2 #171C25             --panel-2 #F4F5F7
 *   --panel-3 #1E2531             --panel-3 #E9EBEF
 *   --ink     #DCE3EC             --ink     #232A35
 *   --muted   #97A2B3             --muted   #5A6472
 *   --subtle  #68738A             --subtle  #8992A1
 *   --primary #22D3EE             --primary #0891B2
 *   --green   #34D399             --green   #059669
 *   --amber   #FBBF24             --amber   #B45309
 *   --red     #F87171             --red     #DC2626
 */

export const TRACEVANE_MONACO_THEME_DARK = "tracevane-dark";
export const TRACEVANE_MONACO_THEME_LIGHT = "tracevane-light";

export type TracevaneMonacoThemeName =
  | typeof TRACEVANE_MONACO_THEME_DARK
  | typeof TRACEVANE_MONACO_THEME_LIGHT;

const TRACEVANE_DARK_THEME: monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    // Surfaces: editor sits on --panel, the app base (--bg) shows through
    // minimap / breadcrumbs / peek chrome.
    "editor.background": "#12161D",
    "editor.foreground": "#DCE3EC",
    "editorGutter.background": "#12161D",
    "minimap.background": "#0B0E13",
    "breadcrumb.background": "#0B0E13",
    // Current line + indent guides ride the panel elevation ramp.
    "editor.lineHighlightBackground": "#171C25",
    "editor.lineHighlightBorder": "#00000000",
    "editorIndentGuide.background1": "#1E2531",
    "editorIndentGuide.activeBackground1": "#22D3EE55",
    "editorWhitespace.foreground": "#1E2531",
    // Line numbers: subtle by default, primary for the caret line.
    "editorLineNumber.foreground": "#68738A",
    "editorLineNumber.activeForeground": "#22D3EE",
    // Caret, selection, find matches.
    "editorCursor.foreground": "#22D3EE",
    "editor.selectionBackground": "#22D3EE33",
    "editor.inactiveSelectionBackground": "#22D3EE1A",
    "editor.selectionHighlightBackground": "#22D3EE24",
    "editor.wordHighlightBackground": "#22D3EE1F",
    "editor.findMatchBackground": "#FBBF244D",
    "editor.findMatchHighlightBackground": "#FBBF2426",
    "editor.findMatchBorder": "#FBBF24",
    "editorBracketMatch.background": "#22D3EE26",
    "editorBracketMatch.border": "#22D3EE66",
    "editor.linkedEditingBackground": "#22D3EE1A",
    // Floating chrome on --panel-2 with the hairline token as alpha.
    "editorWidget.background": "#171C25",
    "editorWidget.border": "#94A3B833",
    "editorHoverWidget.background": "#171C25",
    "editorHoverWidget.border": "#94A3B833",
    "editorSuggestWidget.background": "#171C25",
    "editorSuggestWidget.border": "#94A3B833",
    "editorSuggestWidget.selectedBackground": "#22D3EE24",
    "editorMarkerNavigation.background": "#171C25",
    "peekViewEditor.background": "#0B0E13",
    "peekViewResult.background": "#12161D",
    "peekViewTitle.background": "#171C25",
    "input.background": "#0B0E13",
    "input.border": "#94A3B833",
    "focusBorder": "#22D3EE",
    // Scrollbars blend into the panel ramp; sticky scroll sits one level up.
    "scrollbarSlider.background": "#1E253180",
    "scrollbarSlider.hoverBackground": "#1E2531CC",
    "scrollbarSlider.activeBackground": "#22D3EE66",
    "editorOverviewRuler.border": "#00000000",
    "editorStickyScroll.background": "#171C25",
    "editorStickyScrollHover.background": "#1E2531",
    // Squiggles + gutter VCS / diff accents from the semantic palette.
    "editorError.foreground": "#F87171",
    "editorWarning.foreground": "#FBBF24",
    "editorInfo.foreground": "#22D3EE",
    "editorGutter.addedBackground": "#34D399",
    "editorGutter.modifiedBackground": "#22D3EE",
    "editorGutter.deletedBackground": "#F87171",
    "diffEditor.insertedTextBackground": "#34D39922",
    "diffEditor.removedTextBackground": "#F8717122",
    "diffEditor.insertedLineBackground": "#34D39914",
    "diffEditor.removedLineBackground": "#F8717114",
    "diffEditor.diagonalFill": "#94A3B833",
  },
};

const TRACEVANE_LIGHT_THEME: monaco.editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#232A35",
    "editorGutter.background": "#FFFFFF",
    "minimap.background": "#F6F7F9",
    "breadcrumb.background": "#F6F7F9",
    "editor.lineHighlightBackground": "#F4F5F7",
    "editor.lineHighlightBorder": "#00000000",
    "editorIndentGuide.background1": "#E9EBEF",
    "editorIndentGuide.activeBackground1": "#0891B255",
    "editorWhitespace.foreground": "#E9EBEF",
    "editorLineNumber.foreground": "#8992A1",
    "editorLineNumber.activeForeground": "#0891B2",
    "editorCursor.foreground": "#0891B2",
    "editor.selectionBackground": "#0891B22E",
    "editor.inactiveSelectionBackground": "#0891B214",
    "editor.selectionHighlightBackground": "#0891B21A",
    "editor.wordHighlightBackground": "#0891B214",
    "editor.findMatchBackground": "#B4530940",
    "editor.findMatchHighlightBackground": "#B4530926",
    "editor.findMatchBorder": "#B45309",
    "editorBracketMatch.background": "#0891B21F",
    "editorBracketMatch.border": "#0891B266",
    "editor.linkedEditingBackground": "#0891B214",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#0F172A29",
    "editorHoverWidget.background": "#FFFFFF",
    "editorHoverWidget.border": "#0F172A29",
    "editorSuggestWidget.background": "#FFFFFF",
    "editorSuggestWidget.border": "#0F172A29",
    "editorSuggestWidget.selectedBackground": "#0891B21F",
    "editorMarkerNavigation.background": "#FFFFFF",
    "peekViewEditor.background": "#F6F7F9",
    "peekViewResult.background": "#FFFFFF",
    "peekViewTitle.background": "#F4F5F7",
    "input.background": "#F6F7F9",
    "input.border": "#0F172A29",
    "focusBorder": "#0891B2",
    "scrollbarSlider.background": "#E9EBEFCC",
    "scrollbarSlider.hoverBackground": "#E9EBEF",
    "scrollbarSlider.activeBackground": "#0891B266",
    "editorOverviewRuler.border": "#00000000",
    "editorStickyScroll.background": "#F4F5F7",
    "editorStickyScrollHover.background": "#E9EBEF",
    "editorError.foreground": "#DC2626",
    "editorWarning.foreground": "#B45309",
    "editorInfo.foreground": "#0891B2",
    "editorGutter.addedBackground": "#059669",
    "editorGutter.modifiedBackground": "#0891B2",
    "editorGutter.deletedBackground": "#DC2626",
    "diffEditor.insertedTextBackground": "#05966922",
    "diffEditor.removedTextBackground": "#DC262622",
    "diffEditor.insertedLineBackground": "#05966914",
    "diffEditor.removedLineBackground": "#DC262614",
    "diffEditor.diagonalFill": "#0F172A29",
  },
};

let tracevaneMonacoThemesRegistered = false;

/**
 * Register both Tracevane themes with Monaco. Safe to call repeatedly and
 * before any editor is created; only the first call defines the themes.
 */
export function ensureTracevaneMonacoThemes(): void {
  if (tracevaneMonacoThemesRegistered) return;
  tracevaneMonacoThemesRegistered = true;
  monaco.editor.defineTheme(TRACEVANE_MONACO_THEME_DARK, TRACEVANE_DARK_THEME);
  monaco.editor.defineTheme(TRACEVANE_MONACO_THEME_LIGHT, TRACEVANE_LIGHT_THEME);
}

/** Theme name for an explicit mode; registers the themes on first use. */
export function tracevaneMonacoThemeForMode(
  mode: "dark" | "light",
): TracevaneMonacoThemeName {
  ensureTracevaneMonacoThemes();
  return mode === "light"
    ? TRACEVANE_MONACO_THEME_LIGHT
    : TRACEVANE_MONACO_THEME_DARK;
}

/**
 * Resolve the Monaco theme from the app theme attribute on <html>.
 * Dark console is the unprefixed default; only light sets data-theme.
 */
export function tracevaneMonacoThemeFromDocument(
  doc: Document = document,
): TracevaneMonacoThemeName {
  return tracevaneMonacoThemeForMode(
    doc.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
}
