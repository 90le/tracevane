import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const logoMarkSource = read("apps/web-vue/src/components/LogoMark.vue");
const styleCss = read("apps/web-vue/src/style.css");

test("shell logo mark resolves through theme tokens instead of local svg colors", () => {
  for (const token of [
    "--logo-mark-frame-fill",
    "--logo-mark-frame-border",
    "--logo-mark-orb-start",
    "--logo-mark-orb-end",
    "--logo-mark-ridge-back-start",
    "--logo-mark-ridge-back-end",
    "--logo-mark-ridge-front-start",
    "--logo-mark-ridge-front-end",
    "--logo-mark-peak-fill",
  ]) {
    assert.match(
      logoMarkSource,
      new RegExp(`var\\(${token}\\)`),
      `expected LogoMark.vue to consume ${token}`,
    );
    assert.match(
      styleCss,
      new RegExp(`${token}:\\s*`),
      `expected style.css to define ${token}`,
    );
  }

  assert.doesNotMatch(
    logoMarkSource,
    /#[0-9a-fA-F]{3,6}|rgba\(/,
    "expected the shell logo svg to avoid raw hex or rgba colors",
  );
  assert.doesNotMatch(
    [logoMarkSource, styleCss].join("\n"),
    /oc-sky|logo-mark-sky/,
    "expected the shell logo to avoid legacy sky-era gradient names",
  );
});

test("sidebar logo icon shadow is a shell token shared by both themes", () => {
  assert.match(styleCss, /--logo-icon-shadow:\s*[\s\S]*?;/);
  assert.match(
    styleCss,
    /html\[data-theme="light"\]\s*\{[\s\S]*--logo-icon-shadow:\s*[\s\S]*?;/,
    "expected light theme to override the logo icon elevation token",
  );
  assert.match(
    styleCss,
    /\.logo-icon\s*\{[\s\S]*box-shadow:\s*var\(--logo-icon-shadow\);/,
  );

  const logoIconBlock = styleCss.match(/\.logo-icon\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(
    logoIconBlock,
    /rgba\(|#[0-9a-fA-F]{3,6}/,
    "expected .logo-icon chrome to avoid local color literals",
  );
});
