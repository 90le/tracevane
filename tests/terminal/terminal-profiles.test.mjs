import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const profilesModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-profiles.ts");

test("terminal profiles normalize backend catalog with local fallback launchability", () => {
  const status = {
    binaries: [
      { id: "codex", installed: true },
      { id: "claude", installed: false },
      { id: "opencode", installed: true },
    ],
  };

  const profiles = profilesModule.normalizeTerminalProfileCatalog([], status);
  const byId = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));

  assert.equal(byId["local-shell"].launchable, true);
  assert.equal(byId["agent-codex"].launchable, true);
  assert.equal(byId["agent-claude"].launchable, false);
  assert.equal(byId["marketplace-clawhub"].kind, "marketplace");
  assert.equal(byId["marketplace-clawhub"].launchable, false);
  assert.equal(byId["marketplace-skillhub"].kind, "marketplace");
  assert.equal(byId["remote-ssh"].targetKind, "ssh");
  assert.equal(byId["remote-ssh"].launchable, false);
});

test("terminal profiles map launchable agent profiles to launch cli ids", () => {
  const profiles = profilesModule.buildFallbackTerminalProfiles({
    binaries: [
      { id: "codex", installed: true },
      { id: "bash", installed: true },
    ],
  });
  const byId = profilesModule.createTerminalProfileMap(profiles);

  assert.equal(profilesModule.resolveProfileLaunchCli(byId["agent-codex"]), "codex");
  assert.equal(profilesModule.resolveProfileLaunchCli(byId["local-shell"]), "bash");
  assert.equal(profilesModule.resolveProfileLaunchCli(byId["remote-ssh"]), null);
});
