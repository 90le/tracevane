import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const read = (rel) =>
  fs.readFileSync(new URL(`../../apps/web/src/${rel}`, import.meta.url), "utf-8");

// ---------------------------------------------------------------------------
// Routing — IdeShell renders outside AppShell; /files stays under AppShell.
// ---------------------------------------------------------------------------

test("/ide renders IdeShell outside AppShell layout", () => {
  const router = read("app/router.tsx");
  assert.match(router, /import \{ IdeShell \}/);
  assert.ok(router.includes('<Route path="/ide" element={<IdeShell />} />'));
});

test("/files route is preserved under AppShell (not removed by the IDE)", () => {
  const router = read("app/router.tsx");
  // The IDE is additive — the standalone /files page under AppShell must still
  // exist. We assert both that AppShell wraps a block of routes and that the
  // /files line is present in the file.
  assert.ok(
    router.includes('<Route element={<AppShell />}'),
    "AppShell-wrapped route block must exist",
  );
  assert.ok(
    router.includes('path="/files"'),
    '/files route must remain (IDE does not replace the Files page)',
  );
  // The full-bleed /ide route must NOT accidentally sit inside the AppShell
  // block — it is declared before `<Route element={<AppShell />}>`.
  assert.ok(
    router.indexOf('<Route path="/ide"') <
      router.indexOf('<Route element={<AppShell />}'),
    "/ide must be declared before (outside) the AppShell block",
  );
});

test("IdeShell is exported", () => {
  const shell = read("features/ide/IdeShell.tsx");
  assert.match(shell, /export function IdeShell/);
});

// ---------------------------------------------------------------------------
// IdeShell composes the six IDE chrome panels.
// ---------------------------------------------------------------------------

test("IdeShell renders the six chrome panels (ActivityBar/SidePanel/EditorArea/Preview/BottomPanel/StatusBar)", () => {
  const shell = read("features/ide/IdeShell.tsx");
  // Imports — each panel is pulled from its dedicated module under panels/.
  for (const panel of [
    "ActivityBar",
    "SidePanel",
    "EditorArea",
    "Preview",
    "BottomPanel",
    "StatusBar",
  ]) {
    assert.ok(
      shell.includes(`panels/${panel}`),
      `IdeShell must import panels/${panel}`,
    );
  }
  // JSX usage — each panel appears as a rendered element (<Panel .../>).
  for (const panel of [
    "ActivityBar",
    "SidePanel",
    "EditorArea",
    "Preview",
    "BottomPanel",
    "StatusBar",
  ]) {
    assert.ok(
      new RegExp(`<${panel}[\\s/>]`).test(shell),
      `IdeShell must render <${panel} ...>`,
    );
  }
});

// ---------------------------------------------------------------------------
// Explorer reuses the Phase 1 file core (FileTree + FileActionsMenu).
// ---------------------------------------------------------------------------

test("IdeExplorer imports FileTree + FileActionsMenu (reuses Phase 1 core)", () => {
  const explorer = read("features/ide/explorer/IdeExplorer.tsx");
  assert.ok(
    explorer.includes('features/files/FileActionsMenu'),
    "IdeExplorer must import FileActionsMenu from the Phase 1 file core",
  );
  assert.ok(
    explorer.includes('features/files/FileTree'),
    "IdeExplorer must import FileTree from the Phase 1 file core",
  );
});

// ---------------------------------------------------------------------------
// Editor is CodeMirror 6-backed.
// ---------------------------------------------------------------------------

test("CodeEditor imports @codemirror", () => {
  const editor = read("features/ide/editor/CodeEditor.tsx");
  assert.ok(
    /@codemirror\//.test(editor),
    "CodeEditor must import from @codemirror/* packages",
  );
});

// ---------------------------------------------------------------------------
// Preview is remark/rehype-backed Markdown.
// ---------------------------------------------------------------------------

test("MarkdownPreview imports remarkParse", () => {
  const preview = read("features/ide/preview/MarkdownPreview.tsx");
  assert.ok(
    preview.includes("remark-parse"),
    "MarkdownPreview must use remarkParse (remark pipeline)",
  );
});

// ---------------------------------------------------------------------------
// Terminal is xterm.js-backed.
// ---------------------------------------------------------------------------

test("IdeTerminal imports @xterm/xterm", () => {
  const terminal = read("features/ide/terminal/IdeTerminal.tsx");
  assert.ok(
    terminal.includes("@xterm/xterm"),
    "IdeTerminal must import @xterm/xterm",
  );
});
