import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import test, { mock } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const terminalInstances = [];

class FakeTerminal {
  constructor(options) {
    this.options = options;
    this.cols = 80;
    this.rows = 24;
    terminalInstances.push(this);
  }

  loadAddon() {}
  open() {}
  write() {}
  clear() {}
  clearSelection() {}
  selectAll() {}
  focus() {}
  blur() {}
  dispose() {}
  getSelection() { return ""; }
  attachCustomKeyEventHandler() {}
  onSelectionChange() { return { dispose() {} }; }
  onData(listener) {
    this.dataListener = listener;
    return { dispose: () => { this.dataListener = undefined; } };
  }
  emitData(data) { this.dataListener?.(data); }
}

class FakeFitAddon {
  fit() {}
}

mock.module("@xterm/xterm", { namedExports: { Terminal: FakeTerminal } });
mock.module("@xterm/addon-fit", { namedExports: { FitAddon: FakeFitAddon } });

test("terminal status queries never suppress adjacent keyboard input", async (context) => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.getComputedStyle = dom.window.getComputedStyle;
  globalThis.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const bundleDir = mkdtempSync(path.join(process.cwd(), ".xterm-host-test-"));
  const bundlePath = path.join(bundleDir, "XtermHost.mjs");
  let root;
  context.after(async () => {
    if (root) await act(async () => root.unmount());
    dom.window.close();
    rmSync(bundleDir, { recursive: true, force: true });
  });
  await build({
    entryPoints: [fileURLToPath(new URL("./XtermHost.tsx", import.meta.url))],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["react", "@xterm/addon-fit"],
    loader: { ".css": "empty" },
    plugins: [{
      name: "mock-xterm",
      setup(esbuild) {
        esbuild.onResolve({ filter: /^@xterm\/xterm$/ }, () => ({
          path: "@xterm/xterm",
          external: true,
        }));
      },
    }],
  });
  const { XtermHost } = await import(pathToFileURL(bundlePath).href);
  root = createRoot(document.getElementById("root"));
  const ref = React.createRef();
  const input = [];

  await act(async () => {
    root.render(React.createElement(XtermHost, {
      ref,
      acceptInput: true,
      onInput: (data) => input.push(data),
      onResize: () => {},
    }));
  });

  document.querySelector("[data-ide-terminal-xterm]")
    .dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }));
  ref.current.write("\x1b[6n");
  terminalInstances.at(-1).emitData("x");
  terminalInstances.at(-1).emitData("\x1b[12;34R");

  assert.deepEqual(input, ["x"]);
});
