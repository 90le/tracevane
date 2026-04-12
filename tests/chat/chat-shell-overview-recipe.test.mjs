import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatShellQuickActions,
  buildChatShellWarnings,
} from "../../dist/apps/web-vue/src/features/chat-v2/chat-shell-overview-recipe.js";

test("buildChatShellQuickActions summarizes record browser and stage toggles", () => {
  const summary = buildChatShellQuickActions({
    selectedSessionKey: "session-a",
    recordBrowserOpen: true,
    recordBrowserHasActiveFilters: true,
    historyMode: "search",
    inspectPinned: true,
  });

  assert.deepEqual(summary, {
    canToggleRecordBrowser: true,
    recordBrowserOpen: true,
    recordBrowserHasActiveFilters: true,
    historyMode: "search",
    inspectPinned: true,
  });
});

test("buildChatShellQuickActions disables browser toggle without selected session", () => {
  const summary = buildChatShellQuickActions({
    selectedSessionKey: "",
    recordBrowserOpen: false,
    recordBrowserHasActiveFilters: false,
    historyMode: "history",
    inspectPinned: false,
  });

  assert.equal(summary.canToggleRecordBrowser, false);
  assert.equal(summary.historyMode, "history");
});

test("buildChatShellWarnings trims text and prioritizes inspector warning content", () => {
  const warning = buildChatShellWarnings({
    gatewayWarning: "  gateway offline  ",
    accessError: "  ",
    runtimeLastErrorMessage: " runtime lost ",
  });

  assert.deepEqual(warning, {
    gatewayWarning: "gateway offline",
    accessError: "",
    inspectorWarningMessage: "gateway offline",
  });
});

test("buildChatShellWarnings falls back to access and runtime warnings", () => {
  const warning = buildChatShellWarnings({
    gatewayWarning: " ",
    accessError: "read-only denial",
    runtimeLastErrorMessage: "stream degraded",
  });
  assert.equal(warning.inspectorWarningMessage, "read-only denial");

  const runtimeOnly = buildChatShellWarnings({
    gatewayWarning: "",
    accessError: "",
    runtimeLastErrorMessage: "stream degraded",
  });
  assert.equal(runtimeOnly.inspectorWarningMessage, "stream degraded");
});
