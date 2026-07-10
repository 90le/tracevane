import test from "node:test";
import assert from "node:assert/strict";

import {
  applyChannelConnectorV3ResolutionToRuntimeRef,
  channelConnectorAccountConnectionKey,
  channelConnectorRuntimeRouteRefs,
  diffChannelConnectorV3AccountConnections,
  groupChannelConnectorOctoAccountRoutes,
  selectChannelConnectorOctoAccountRoute,
  selectChannelConnectorV3RuntimeRoute,
} from "../../dist/apps/api/modules/channel-connectors/runtime-account-routing.js";

function runtimeConfig() {
  return {
    version: 1,
    management: { host: "127.0.0.1", port: 18797 },
    paths: {
      root: "/tmp/channel-connectors",
      state: "/tmp/channel-connectors/state.json",
      log: "/tmp/channel-connectors/daemon.log",
      runtime: "/tmp/channel-connectors/runtime.json",
      octoEvents: "/tmp/channel-connectors/octo.jsonl",
      feishuEvents: "/tmp/channel-connectors/feishu.jsonl",
    },
    gateway: {
      endpoint: "http://127.0.0.1:18796/v1",
      clientKeyRef: "tracevane-gateway-client-key",
    },
    agentSessionPolicy: {
      maxSessions: 8,
      maxConcurrentTurns: 4,
      idleTimeoutMs: 600_000,
      busyStrategy: "queue",
      queueMaxRecords: 100,
      queueMaxAgeMs: 600_000,
    },
    projects: [],
    deliveryConfig: {
      version: 3,
      updatedAt: "2026-07-10T10:00:00.000Z",
      agentSessionPolicy: {
        maxSessions: 8,
        maxConcurrentTurns: 4,
        idleTimeoutMs: 600_000,
        busyStrategy: "queue",
        queueMaxRecords: 100,
        queueMaxAgeMs: 600_000,
      },
      accounts: [
        { id: "octo-main", platform: "octo", displayName: "Octo main", lifecycle: "enabled", externalAccountId: "Octo-Account", botId: null, credentials: { botToken: "secret" }, transport: { apiUrl: "https://im.deepminer.com.cn/api" }, security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] }, advanced: {} },
        { id: "octo-other", platform: "octo", displayName: "Octo other", lifecycle: "enabled", externalAccountId: "other-account", botId: null, credentials: { botToken: "secret" }, transport: { apiUrl: "https://im.deepminer.com.cn/api" }, security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] }, advanced: {} },
        { id: "octo-disabled", platform: "octo", displayName: "Octo disabled", lifecycle: "disabled", externalAccountId: "disabled-account", botId: null, credentials: { botToken: "secret" }, transport: { apiUrl: "https://im.deepminer.com.cn/api" }, security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] }, advanced: {} },
      ],
      targets: ["default", "specific", "group", "other"].map((id) => ({
        id,
        name: id,
        enabled: true,
        runtime: { agent: "codex", appProfileRef: "codex", gatewayEndpoint: "http://127.0.0.1:18796/v1", gatewayKeyRef: "tracevane-gateway-client-key" },
        workspace: { workDir: `/workspace/${id}` },
        execution: { model: "gpt-5.5", reasoningEffort: null, permissionMode: "suggest", workspaceConcurrency: 1, queueLimit: 20 },
        governance: { disabledCommands: [] },
      })),
      deliveryPolicies: [
        {
          id: "octo-main-policy",
          accountRef: "octo-main",
          defaultTargetRef: "default",
          defaultSessionPolicy: { mode: "persistent", busyGuard: true, attachmentStaging: true },
          defaultAccessPolicy: { allowlist: [], adminUsers: [], disabledCommands: [], mentionRequired: false },
          rules: [
            { id: "specific", name: "specific", enabled: true, match: { peer: { kind: "private", id: "user-1" } }, targetRef: "specific" },
            { id: "group", name: "group", enabled: true, match: { peer: { kind: "group", id: "group-1" } }, targetRef: "group" },
          ],
        },
        { id: "octo-other-policy", accountRef: "octo-other", defaultTargetRef: "other", defaultSessionPolicy: { mode: "persistent", busyGuard: true, attachmentStaging: true }, defaultAccessPolicy: { allowlist: [], adminUsers: [], disabledCommands: [], mentionRequired: false }, rules: [] },
      ],
    },
  };
}

test("Channel Connectors groups every Octo account into one physical connection boundary", () => {
  const groups = groupChannelConnectorOctoAccountRoutes(runtimeConfig());
  assert.equal(groups.length, 2);
  const main = groups.find((group) => group.accountId === "octo-main");
  assert.ok(main);
  assert.equal(main.refs.length, 3);
  assert.equal(main.primary.binding.id, "octo-main:default");
  assert.deepEqual(
    new Set(main.refs.map((ref) => ref.binding.id)),
    new Set(["octo-main:default", "octo-main:rule:specific", "octo-main:rule:group"]),
  );
  assert.equal(
    channelConnectorAccountConnectionKey(main.refs[0].binding),
    channelConnectorAccountConnectionKey(main.refs[1].binding),
  );
});

test("Channel Connectors selects exact Octo peers after the account connection receives a message", () => {
  const main = groupChannelConnectorOctoAccountRoutes(runtimeConfig())
    .find((group) => group.accountId === "octo-main");
  assert.ok(main);
  const privateRoute = selectChannelConnectorOctoAccountRoute(main, {
    messageId: "m-private",
    fromUid: "user-1",
    channelId: "user-1",
    channelType: 1,
    payload: { type: 1, content: "hello" },
  });
  const groupRoute = selectChannelConnectorOctoAccountRoute(main, {
    messageId: "m-group",
    fromUid: "user-2",
    channelId: "group-1",
    channelType: 2,
    payload: { type: 1, content: "hello" },
  });
  const fallbackRoute = selectChannelConnectorOctoAccountRoute(main, {
    messageId: "m-fallback",
    fromUid: "user-3",
    channelId: "user-3",
    channelType: 1,
    payload: { type: 1, content: "hello" },
  });
  assert.equal(privateRoute.binding.id, "octo-main:rule:specific");
  assert.equal(groupRoute.binding.id, "octo-main:rule:group");
  assert.equal(fallbackRoute.binding.id, "octo-main:default");
});

test("Channel Connectors v3 runtime selection applies rule access, session, and workspace policy", () => {
  const config = runtimeConfig();
  const main = groupChannelConnectorOctoAccountRoutes(config)
    .find((group) => group.accountId === "octo-main");
  assert.ok(main);
  const deliveryConfig = {
    version: 3,
    updatedAt: "2026-07-10T10:00:00.000Z",
    agentSessionPolicy: config.agentSessionPolicy,
    accounts: [{
      id: "octo-main",
      platform: "octo",
      displayName: "Octo main",
      lifecycle: "enabled",
      externalAccountId: "Octo-Account",
      botId: null,
      credentials: {},
      transport: {},
      security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] },
      advanced: {},
    }],
    targets: [{
      id: "default",
      name: "Default",
      enabled: true,
      runtime: {
        agent: "codex",
        appProfileRef: "codex",
        gatewayEndpoint: "http://127.0.0.1:18796/v1",
        gatewayKeyRef: "tracevane-gateway-client-key",
      },
      workspace: { workDir: "/workspace/default" },
      execution: {
        model: null,
        reasoningEffort: null,
        permissionMode: "suggest",
        workspaceConcurrency: 1,
        queueLimit: 20,
      },
      governance: { disabledCommands: ["shell"] },
    }, {
      id: "specific",
      name: "Specific",
      enabled: true,
      runtime: {
        agent: "codex",
        appProfileRef: "codex",
        gatewayEndpoint: "http://127.0.0.1:18796/v1",
        gatewayKeyRef: "tracevane-gateway-client-key",
      },
      workspace: { workDir: "/workspace/specific" },
      execution: {
        model: null,
        reasoningEffort: null,
        permissionMode: "suggest",
        workspaceConcurrency: 2,
        queueLimit: 7,
      },
      governance: { disabledCommands: ["deploy"] },
    }],
    deliveryPolicies: [{
      id: "octo-main-policy",
      accountRef: "octo-main",
      defaultTargetRef: "default",
      defaultSessionPolicy: { mode: "persistent", busyGuard: true, attachmentStaging: true },
      defaultAccessPolicy: {
        allowlist: ["user-1", "user-2"],
        adminUsers: ["admin"],
        disabledCommands: ["reset"],
        mentionRequired: false,
      },
      rules: [{
        id: "private-user-1",
        name: "User one",
        enabled: true,
        match: { peer: { kind: "private", id: "user-1" }, senderId: "user-1" },
        targetRef: "specific",
        sessionPolicy: { mode: "one-shot" },
        accessPolicy: { allowlist: ["user-1"], disabledCommands: ["write"] },
      }],
    }],
  };
  const selection = selectChannelConnectorV3RuntimeRoute(deliveryConfig, channelConnectorRuntimeRouteRefs({
    ...config,
    deliveryConfig,
  }), {
    accountId: "octo-main",
    peer: { kind: "private", id: "user-1" },
    senderId: "user-1",
    threadId: null,
    botMentioned: false,
  });
  assert.equal(selection.result.ok, true);
  assert.equal(selection.ref.binding.id, "octo-main:rule:private-user-1");
  const applied = applyChannelConnectorV3ResolutionToRuntimeRef(deliveryConfig, selection);
  assert.deepEqual(applied.binding.allowlist, ["user-1"]);
  assert.deepEqual(applied.binding.adminUsers, ["admin"]);
  assert.deepEqual(applied.binding.disabledCommands, ["deploy", "reset", "write"]);
  assert.equal(applied.binding.metadata.sessionMode, "one-shot");
  assert.equal(applied.binding.metadata.workspaceConcurrency, 2);
  assert.equal(applied.binding.metadata.workspaceQueueLimit, 7);
});

test("Channel Connectors v3 connection diff ignores resolver changes and isolates changed accounts", () => {
  const base = {
    version: 3,
    updatedAt: "2026-07-10T10:00:00.000Z",
    agentSessionPolicy: runtimeConfig().agentSessionPolicy,
    accounts: [{
      id: "bot-1",
      platform: "feishu",
      displayName: "Bot 1",
      lifecycle: "enabled",
      externalAccountId: "cli_1",
      botId: null,
      credentials: { appSecret: "one" },
      transport: { apiUrl: "https://open.feishu.cn" },
      security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] },
      advanced: { feishuProgressCardEntryLimit: 8 },
    }, {
      id: "bot-2",
      platform: "feishu",
      displayName: "Bot 2",
      lifecycle: "enabled",
      externalAccountId: "cli_2",
      botId: null,
      credentials: { appSecret: "two" },
      transport: { apiUrl: "https://open.feishu.cn" },
      security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] },
      advanced: {},
    }],
    targets: [],
    deliveryPolicies: [],
  };
  const resolverOnly = structuredClone(base);
  resolverOnly.accounts[0].advanced.feishuProgressCardEntryLimit = 12;
  resolverOnly.accounts[0].security.allowedAttachmentHosts = ["files.example.com"];
  assert.deepEqual(diffChannelConnectorV3AccountConnections(base, resolverOnly), {
    addedAccountIds: [],
    removedAccountIds: [],
    reconnectedAccountIds: [],
    changedAccountIds: [],
  });

  const credentialChange = structuredClone(base);
  credentialChange.accounts[1].credentials.appSecret = "two-rotated";
  assert.deepEqual(diffChannelConnectorV3AccountConnections(base, credentialChange), {
    addedAccountIds: [],
    removedAccountIds: [],
    reconnectedAccountIds: ["bot-2"],
    changedAccountIds: ["bot-2"],
  });
});

test("Channel Connectors v3 runtime refs come from accounts, targets, and policies", () => {
  const config = runtimeConfig();
  config.projects = [];
  config.deliveryConfig = {
    version: 3,
    updatedAt: "2026-07-10T10:00:00.000Z",
    agentSessionPolicy: config.agentSessionPolicy,
    accounts: [{
      id: "octo-native",
      platform: "octo",
      displayName: "Octo native",
      lifecycle: "enabled",
      externalAccountId: "octo-native-external",
      botId: "bot-native",
      credentials: { botToken: "native-secret" },
      transport: { apiUrl: "https://im.deepminer.com.cn/api" },
      security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] },
      advanced: { stageOctoUrlAttachments: true },
    }],
    targets: [{
      id: "native-workspace",
      name: "Native workspace",
      enabled: true,
      runtime: {
        agent: "codex",
        appProfileRef: "codex",
        gatewayEndpoint: "http://127.0.0.1:18796/v1",
        gatewayKeyRef: "tracevane-gateway-client-key",
      },
      workspace: { workDir: "/workspace/native" },
      execution: {
        model: "gpt-5.5",
        reasoningEffort: "high",
        permissionMode: "suggest",
        workspaceConcurrency: 1,
        queueLimit: 20,
      },
      governance: { disabledCommands: ["shell"] },
    }],
    deliveryPolicies: [{
      id: "octo-native-delivery",
      accountRef: "octo-native",
      defaultTargetRef: "native-workspace",
      defaultSessionPolicy: { mode: "persistent", busyGuard: true, attachmentStaging: true },
      defaultAccessPolicy: { allowlist: ["user-1"], adminUsers: ["admin"], disabledCommands: [], mentionRequired: false },
      rules: [{
        id: "group-special",
        name: "Group special",
        enabled: true,
        match: { peer: { kind: "group", id: "group-1" } },
        targetRef: "native-workspace",
      }],
    }],
  };

  const refs = channelConnectorRuntimeRouteRefs(config);
  assert.equal(refs.length, 2);
  assert.ok(refs.every((ref) => ref.project.id === "native-workspace"));
  assert.ok(refs.every((ref) => ref.project.workDir === "/workspace/native"));
  assert.ok(refs.every((ref) => ref.binding.metadata.channelAccountId === "octo-native"));
  assert.ok(refs.every((ref) => ref.binding.metadata.botToken === "native-secret"));
  const groups = groupChannelConnectorOctoAccountRoutes(config);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].accountId, "octo-native");
  assert.equal(groups[0].refs.length, 2);
});
