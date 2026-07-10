import crypto from "node:crypto";

import type {
  ChannelConnectorDeliveryAccessDecision,
  ChannelConnectorDeliveryAccessPolicy,
  ChannelConnectorDeliveryPolicy,
  ChannelConnectorDeliveryResolutionResult,
  ChannelConnectorDeliverySessionPolicy,
  ChannelConnectorDeliveryTarget,
  ChannelConnectorIngressRoutingContext,
  ChannelConnectorSourceRule,
  ChannelConnectorsV3Config,
} from "../../../../types/channel-connectors.js";
import { channelConnectorSourceRuleSpecificity } from "./config-v3.js";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeString).filter(Boolean))];
}

function ruleMatches(
  rule: ChannelConnectorSourceRule,
  context: ChannelConnectorIngressRoutingContext,
): boolean {
  if (rule.enabled === false) return false;
  if (rule.match.peer.kind !== context.peer.kind) return false;
  const peerId = normalizeString(rule.match.peer.id);
  if (peerId && peerId !== context.peer.id) return false;
  const threadId = normalizeString(rule.match.threadId);
  if (threadId && threadId !== normalizeString(context.threadId)) return false;
  const senderId = normalizeString(rule.match.senderId);
  if (senderId && senderId !== context.senderId) return false;
  if (rule.match.mentionRequired === true && !context.botMentioned) return false;
  return true;
}

function effectiveSessionPolicy(
  policy: ChannelConnectorDeliveryPolicy,
  rule: ChannelConnectorSourceRule | null,
): ChannelConnectorDeliverySessionPolicy {
  return {
    mode: rule?.sessionPolicy?.mode ?? policy.defaultSessionPolicy.mode,
    busyGuard: rule?.sessionPolicy?.busyGuard ?? policy.defaultSessionPolicy.busyGuard,
    attachmentStaging: rule?.sessionPolicy?.attachmentStaging
      ?? policy.defaultSessionPolicy.attachmentStaging,
  };
}

function effectiveAccessDecision(
  target: ChannelConnectorDeliveryTarget,
  policy: ChannelConnectorDeliveryPolicy,
  rule: ChannelConnectorSourceRule | null,
  context: ChannelConnectorIngressRoutingContext,
): ChannelConnectorDeliveryAccessDecision {
  const defaults: ChannelConnectorDeliveryAccessPolicy = policy.defaultAccessPolicy;
  const allowlist = rule?.accessPolicy?.allowlist === undefined
    ? uniqueStrings(defaults.allowlist)
    : uniqueStrings(rule.accessPolicy.allowlist);
  const adminUsers = uniqueStrings(defaults.adminUsers);
  const admin = adminUsers.includes(context.senderId);
  const mentionRequired = defaults.mentionRequired
    || rule?.match.mentionRequired === true
    || rule?.accessPolicy?.mentionRequired === true;
  const disabledCommands = uniqueStrings([
    ...uniqueStrings(target.governance.disabledCommands),
    ...uniqueStrings(defaults.disabledCommands),
    ...uniqueStrings(rule?.accessPolicy?.disabledCommands),
  ]);

  if (mentionRequired && !context.botMentioned) {
    return {
      allowed: false,
      reason: "mention_required",
      admin,
      allowlist,
      disabledCommands,
      mentionRequired,
    };
  }
  if (allowlist.length && !admin && !allowlist.includes(context.senderId)) {
    return {
      allowed: false,
      reason: "sender_not_allowed",
      admin,
      allowlist,
      disabledCommands,
      mentionRequired,
    };
  }
  return {
    allowed: true,
    reason: "allowed",
    admin,
    allowlist,
    disabledCommands,
    mentionRequired,
  };
}

export function channelConnectorDeliveryTargetRevision(
  target: ChannelConnectorDeliveryTarget,
): string {
  const revisionInput = {
    runtime: {
      agent: target.runtime.agent,
      appProfileRef: target.runtime.appProfileRef,
      gatewayEndpoint: target.runtime.gatewayEndpoint,
      gatewayKeyRef: target.runtime.gatewayKeyRef,
    },
    workspace: {
      workDir: target.workspace.workDir,
    },
    execution: {
      model: target.execution.model,
      reasoningEffort: target.execution.reasoningEffort,
      permissionMode: target.execution.permissionMode,
      workspaceConcurrency: target.execution.workspaceConcurrency,
      queueLimit: target.execution.queueLimit,
    },
    governance: {
      disabledCommands: [...uniqueStrings(target.governance.disabledCommands)].sort(),
    },
  };
  return crypto.createHash("sha256")
    .update(JSON.stringify(revisionInput))
    .digest("hex")
    .slice(0, 16);
}

export function resolveChannelConnectorDelivery(
  config: ChannelConnectorsV3Config,
  context: ChannelConnectorIngressRoutingContext,
): ChannelConnectorDeliveryResolutionResult {
  const account = config.accounts.find((candidate) => candidate.id === context.accountId);
  if (!account) {
    return {
      ok: false,
      code: "account_not_found",
      message: `Channel account not found: ${context.accountId}`,
    };
  }
  if (account.lifecycle !== "enabled") {
    return {
      ok: false,
      code: "account_disabled",
      message: `Channel account is not enabled: ${context.accountId}`,
    };
  }
  const policy = config.deliveryPolicies.find((candidate) => candidate.accountRef === account.id);
  if (!policy) {
    return {
      ok: false,
      code: "policy_not_found",
      message: `Delivery policy not found for account: ${context.accountId}`,
    };
  }
  const matchedRule = policy.rules
    .filter((rule) => ruleMatches(rule, context))
    .sort((left, right) => {
      const specificity = channelConnectorSourceRuleSpecificity(right)
        - channelConnectorSourceRuleSpecificity(left);
      return specificity || left.id.localeCompare(right.id);
    })[0] ?? null;
  const targetId = matchedRule?.targetRef || policy.defaultTargetRef;
  const target = config.targets.find((candidate) => candidate.id === targetId);
  if (!target) {
    return {
      ok: false,
      code: "target_not_found",
      message: `Delivery target not found: ${targetId}`,
    };
  }
  if (!target.enabled) {
    return {
      ok: false,
      code: "target_disabled",
      message: `Delivery target is disabled: ${targetId}`,
    };
  }

  return {
    ok: true,
    resolution: {
      accountId: account.id,
      policyId: policy.id,
      matchedBy: matchedRule ? "rule" : "default",
      ruleId: matchedRule?.id ?? null,
      targetId: target.id,
      targetRevision: channelConnectorDeliveryTargetRevision(target),
      sessionPolicy: effectiveSessionPolicy(policy, matchedRule),
      accessDecision: effectiveAccessDecision(target, policy, matchedRule, context),
      explanation: matchedRule
        ? `Matched source rule "${matchedRule.name || matchedRule.id}".`
        : `Used the default target for account "${account.displayName || account.id}".`,
    },
  };
}
