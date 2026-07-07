import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ExternalLanguageServerGateway,
  externalProviderMetadataForProfile,
} from "../../dist/apps/api/modules/lsp/external/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));

const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const BUNDLED_INSTALL_MODES = new Set(["bundled-npm", "optional-bundled-npm"]);

test("bundled external LSP providers use exact-pinned package metadata", () => {
  const gateway = new ExternalLanguageServerGateway({ rootPath: repoRoot });
  const metadata = gateway.listProfiles().map((profile) => externalProviderMetadataForProfile(profile));
  const bundled = metadata.filter((entry) => BUNDLED_INSTALL_MODES.has(entry.installMode));

  assert.ok(bundled.length >= 2, "YAML and Bash external providers should be covered by dependency hygiene");

  for (const entry of bundled) {
    assert.equal(entry.commandSource, "server-allowlist", `${entry.providerId} command source must stay server-side allowlisted`);
    assert.equal(entry.policy.autoInstall, false, `${entry.providerId} must not auto-install providers`);
    assert.equal(entry.policy.frontendCanProvideCommand, false, `${entry.providerId} must not accept frontend command overrides`);
    assert.equal(entry.installStatus, "installed", `${entry.providerId} should be installed in the bundled dependency set`);
    assert.ok(entry.pinnedVersion, `${entry.providerId} must declare pinnedVersion`);
    assert.match(entry.pinnedVersion, EXACT_VERSION_PATTERN, `${entry.providerId} pinnedVersion must be exact, not a semver range`);
    assert.equal(entry.version, entry.pinnedVersion, `${entry.providerId} installed version should match pinnedVersion`);

    const rootDependencyRange = packageJson.dependencies?.[entry.packageName];
    assert.equal(rootDependencyRange, entry.pinnedVersion, `${entry.providerId} package.json dependency must match metadata pin`);

    const lockRootRange = packageLock.packages?.[""]?.dependencies?.[entry.packageName];
    assert.equal(lockRootRange, entry.pinnedVersion, `${entry.providerId} package-lock root dependency must match metadata pin`);

    const lockPackage = packageLock.packages?.[`node_modules/${entry.packageName}`];
    assert.equal(lockPackage?.version, entry.pinnedVersion, `${entry.providerId} package-lock resolved version must match metadata pin`);
    assert.equal(lockPackage?.license, entry.license, `${entry.providerId} package-lock license should match metadata license`);
  }
});
