import test from "node:test";
import assert from "node:assert/strict";

import {
  assertChannelConnectorsV3Config,
  channelConnectorSourceRuleMatchKey,
  channelConnectorSourceRuleSpecificity,
  ChannelConnectorV3ConfigValidationError,
  validateChannelConnectorsV3Config,
} from "../../dist/apps/api/modules/channel-connectors/config-v3.js";
import {
  channelConnectorDeliveryTargetRevision,
  resolveChannelConnectorDelivery,
} from "../../dist/apps/api/modules/channel-connectors/delivery-resolver.js";

function target(id, workDir = `/workspace/${id}`) {
  return {
    id,
    name: id,
    enabled: true,
    runtime: {
      agent: "codex",
      appProfileRef: "codex",
      gatewayEndpoint: "http://127.0.0.1:18796/v1",
      gatewayKeyRef: "tracevane-gateway-client-key",
    },
    workspace: { workDir },
    execution: {
      model: "gpt-5.5",
      reasoningEffort: "high",
      permissionMode: "suggest",
      workspaceConcurrency: 1,
      queueLimit: 20,
    },
    governance: {
      disabledCommands: ["danger"],
    },
  };
}

function rule(id, targetRef, match, extra = {}) {
  return {
    id,
    name: id,
    enabled: true,
    match,
    targetRef,
    ...extra,
  };
}

function baseConfig() {
  return {
    version: 3,
    updatedAt: "2026-07-10T12:00:00.000Z",
    agentSessionPolicy: {
      maxSessions: 100,
      maxConcurrentTurns: 4,
      idleTimeoutMs: 3_600_000,
      busyStrategy: "queue",
      queueMaxRecords: 100,
      queueMaxAgeMs: 600_000,
    },
    accounts: [{
      id: "feishu-main",
      platform: "feishu",
      displayName: "Feishu main",
      lifecycle: "enabled",
      externalAccountId: "cli_main",
      botId: "ou_bot",
      credentials: { appSecret: "account-secret" },
      transport: { apiUrl: "https://open.feishu.cn" },
      security: {
        allowPrivateAttachmentUrls: false,
        allowedAttachmentHosts: [],
      },
      advanced: {},
    }],
    targets: [
      target("default"),
      target("group"),
      target("exact"),
      target("thread"),
      target("sender"),
      target("mentioned"),
    ],
    deliveryPolicies: [{
      id: "feishu-main-policy",
      accountRef: "feishu-main",
      defaultTargetRef: "default",
      defaultSessionPolicy: {
        mode: "persistent",
        busyGuard: true,
        attachmentStaging: true,
      },
      defaultAccessPolicy: {
        allowlist: [],
        adminUsers: ["admin-user"],
        disabledCommands: ["shutdown"],
        mentionRequired: false,
      },
      rules: [],
    }],
  };
}

function context(extra = {}) {
  return {
    accountId: "feishu-main",
    peer: { kind: "private", id: "ou_user" },
    senderId: "ou_user",
    threadId: null,
    botMentioned: false,
    ...extra,
  };
}

test("Channel Connectors v3 config accepts one account, reusable targets, and one default policy", () => {
  const config = baseConfig();
  assert.deepEqual(validateChannelConnectorsV3Config(config), []);
  assert.doesNotThrow(() => assertChannelConnectorsV3Config(config));
});

test("Channel Connectors v3 resolver sends unmatched messages to the account default target", () => {
  const result = resolveChannelConnectorDelivery(baseConfig(), context());
  assert.equal(result.ok, true);
  assert.equal(result.resolution.matchedBy, "default");
  assert.equal(result.resolution.ruleId, null);
  assert.equal(result.resolution.targetId, "default");
  assert.equal(result.resolution.accessDecision.allowed, true);
  assert.match(result.resolution.explanation, /default target/);
});

test("Channel Connectors v3 resolver selects the most specific source rule", () => {
  const config = baseConfig();
  config.deliveryPolicies[0].rules = [
    rule("group", "group", { peer: { kind: "group" } }),
    rule("exact", "exact", { peer: { kind: "group", id: "oc_group" } }),
    rule("thread", "thread", {
      peer: { kind: "group", id: "oc_group" },
      threadId: "om_thread",
    }),
    rule("sender", "sender", {
      peer: { kind: "group", id: "oc_group" },
      threadId: "om_thread",
      senderId: "ou_sender",
    }),
  ];
  const result = resolveChannelConnectorDelivery(config, context({
    peer: { kind: "group", id: "oc_group" },
    senderId: "ou_sender",
    threadId: "om_thread",
  }));
  assert.equal(result.ok, true);
  assert.equal(result.resolution.ruleId, "sender");
  assert.equal(result.resolution.targetId, "sender");
  assert.equal(channelConnectorSourceRuleSpecificity(config.deliveryPolicies[0].rules[3]), 14);
});

test("Channel Connectors v3 mention rules only win when the bot is mentioned", () => {
  const config = baseConfig();
  config.deliveryPolicies[0].rules = [
    rule("exact", "exact", { peer: { kind: "group", id: "oc_group" } }),
    rule("mentioned", "mentioned", {
      peer: { kind: "group", id: "oc_group" },
      mentionRequired: true,
    }),
  ];
  const withoutMention = resolveChannelConnectorDelivery(config, context({
    peer: { kind: "group", id: "oc_group" },
  }));
  const withMention = resolveChannelConnectorDelivery(config, context({
    peer: { kind: "group", id: "oc_group" },
    botMentioned: true,
  }));
  assert.equal(withoutMention.ok, true);
  assert.equal(withoutMention.resolution.ruleId, "exact");
  assert.equal(withMention.ok, true);
  assert.equal(withMention.resolution.ruleId, "mentioned");
});

test("Channel Connectors v3 rule access can narrow senders and add disabled commands", () => {
  const config = baseConfig();
  config.deliveryPolicies[0].defaultAccessPolicy.allowlist = ["allowed-user", "admin-user"];
  config.deliveryPolicies[0].rules = [rule(
    "restricted",
    "exact",
    { peer: { kind: "private", id: "ou_user" } },
    {
      accessPolicy: {
        allowlist: ["allowed-user"],
        disabledCommands: ["delete"],
        mentionRequired: true,
      },
    },
  )];

  const denied = resolveChannelConnectorDelivery(config, context({ senderId: "other-user" }));
  assert.equal(denied.ok, true);
  assert.equal(denied.resolution.accessDecision.allowed, false);
  assert.equal(denied.resolution.accessDecision.reason, "mention_required");

  const allowed = resolveChannelConnectorDelivery(config, context({
    senderId: "allowed-user",
    botMentioned: true,
  }));
  assert.equal(allowed.ok, true);
  assert.equal(allowed.resolution.accessDecision.allowed, true);
  assert.deepEqual(
    new Set(allowed.resolution.accessDecision.disabledCommands),
    new Set(["danger", "shutdown", "delete"]),
  );
});

test("Channel Connectors v3 validator rejects duplicate active account identities and missing policies", () => {
  const config = baseConfig();
  config.accounts.push({
    ...config.accounts[0],
    id: "feishu-duplicate",
    displayName: "Duplicate",
  });
  const issues = validateChannelConnectorsV3Config(config);
  assert.ok(issues.some((issue) => issue.code === "duplicate_account_identity"));
  assert.ok(issues.some((issue) => (
    issue.code === "enabled_account_missing_policy"
    && issue.path === "accounts[1]"
  )));
});

test("Channel Connectors v3 validator rejects ambiguous and structurally invalid rules", () => {
  const config = baseConfig();
  const duplicateMatch = { peer: { kind: "group", id: "oc_group" } };
  config.deliveryPolicies[0].rules = [
    rule("one", "exact", duplicateMatch),
    rule("two", "group", duplicateMatch),
    rule("bad-thread", "thread", {
      peer: { kind: "group" },
      threadId: "om_thread",
    }),
  ];
  const issues = validateChannelConnectorsV3Config(config);
  assert.ok(issues.some((issue) => issue.code === "duplicate_rule_match"));
  assert.ok(issues.some((issue) => (
    issue.code === "invalid_rule_match"
    && issue.path.endsWith("match.peer.id")
  )));
  assert.equal(
    channelConnectorSourceRuleMatchKey(config.deliveryPolicies[0].rules[0]),
    channelConnectorSourceRuleMatchKey(config.deliveryPolicies[0].rules[1]),
  );
});

test("Channel Connectors v3 validator prevents rule access expansion and secrets outside accounts", () => {
  const config = baseConfig();
  config.deliveryPolicies[0].defaultAccessPolicy.allowlist = ["allowed-user"];
  config.deliveryPolicies[0].rules = [rule(
    "expanded",
    "exact",
    { peer: { kind: "private", id: "ou_user" } },
    { accessPolicy: { allowlist: ["unknown-user"] } },
  )];
  config.targets[0].runtime.botToken = "must-not-live-here";
  const issues = validateChannelConnectorsV3Config(config);
  assert.ok(issues.some((issue) => issue.code === "non_restrictive_access_override"));
  assert.ok(issues.some((issue) => issue.code === "secret_outside_account"));
  assert.throws(
    () => assertChannelConnectorsV3Config(config),
    ChannelConnectorV3ConfigValidationError,
  );
});

test("Channel Connectors v3 validator enforces enabled platform credentials and keeps secrets in credentials", () => {
  const missingFeishuSecret = baseConfig();
  missingFeishuSecret.accounts[0].credentials = {};
  assert.ok(validateChannelConnectorsV3Config(missingFeishuSecret).some((issue) => (
    issue.path === "accounts[0].credentials.appSecret"
  )));

  const invalidEndpoint = baseConfig();
  invalidEndpoint.accounts[0].transport.apiUrl = "https://user:pass@open.feishu.cn/#secret";
  assert.ok(validateChannelConnectorsV3Config(invalidEndpoint).some((issue) => (
    issue.path === "accounts[0].transport.apiUrl"
  )));

  const misplacedSecret = baseConfig();
  misplacedSecret.accounts[0].advanced.verificationToken = "wrong-boundary";
  assert.ok(validateChannelConnectorsV3Config(misplacedSecret).some((issue) => (
    issue.code === "secret_outside_account"
    && issue.path === "accounts[0].advanced.verificationToken"
  )));

  const octo = baseConfig();
  octo.accounts[0] = {
    ...octo.accounts[0],
    id: "octo-main",
    platform: "octo",
    externalAccountId: "octo-main",
    credentials: {},
    transport: { apiUrl: "https://im.deepminer.com.cn/api" },
  };
  octo.deliveryPolicies[0] = {
    ...octo.deliveryPolicies[0],
    id: "octo-main-policy",
    accountRef: "octo-main",
  };
  assert.ok(validateChannelConnectorsV3Config(octo).some((issue) => (
    issue.path === "accounts[0].credentials.botToken"
  )));
});

test("Channel Connectors v3 target revisions are stable but change with execution identity", () => {
  const first = target("stable");
  const reordered = {
    ...first,
    governance: { disabledCommands: ["z", "danger", "a"] },
  };
  const sameOrderIndependent = {
    ...reordered,
    governance: { disabledCommands: ["a", "z", "danger"] },
  };
  assert.equal(
    channelConnectorDeliveryTargetRevision(reordered),
    channelConnectorDeliveryTargetRevision(sameOrderIndependent),
  );
  assert.notEqual(
    channelConnectorDeliveryTargetRevision(first),
    channelConnectorDeliveryTargetRevision({
      ...first,
      workspace: { workDir: "/workspace/changed" },
    }),
  );
});

test("Channel Connectors v3 resolver refuses disabled accounts and targets", () => {
  const disabledAccount = baseConfig();
  disabledAccount.accounts[0].lifecycle = "disabled";
  const accountResult = resolveChannelConnectorDelivery(disabledAccount, context());
  assert.deepEqual(accountResult, {
    ok: false,
    code: "account_disabled",
    message: "Channel account is not enabled: feishu-main",
  });

  const disabledTarget = baseConfig();
  disabledTarget.targets[0].enabled = false;
  const targetResult = resolveChannelConnectorDelivery(disabledTarget, context());
  assert.equal(targetResult.ok, false);
  assert.equal(targetResult.code, "target_disabled");
});
