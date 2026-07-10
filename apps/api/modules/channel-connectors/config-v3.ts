import {
  CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS,
  type ChannelConnectorDeliveryPolicy,
  type ChannelConnectorSourceRule,
  type ChannelConnectorV3ValidationIssue,
  type ChannelConnectorsV3Config,
} from "../../../../types/channel-connectors.js";

const DELIVERY_PEER_KINDS = new Set(["private", "group", "channel"]);
const SESSION_MODES = new Set(["persistent", "one-shot"]);
const RUNTIME_AGENT_IDS = new Set<string>(CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS);
const SUPPORTED_PLATFORMS = new Set(["feishu", "octo"]);
const ACCOUNT_LIFECYCLES = new Set(["draft", "enabled", "disabled"]);
const PERMISSION_MODES = new Set(["suggest", "read-only", "auto-edit", "full-auto", "plan", "yolo"]);
const SENSITIVE_KEY_PATTERN = /(?:secret|token|password|private.?key|api.?key|credential|encrypt.?key|aes.?key)/i;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstString(source: unknown, keys: string[]): string {
  const value = recordValue(source);
  for (const key of keys) {
    const normalized = normalizeString(value[key]);
    if (normalized) return normalized;
  }
  return "";
}

function validHttpEndpoint(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && !parsed.username
      && !parsed.password
      && !parsed.hash;
  } catch {
    return false;
  }
}

function normalizedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

function accountIdentityKey(
  platform: string,
  externalAccountId: string,
  botId: string | null,
): string {
  const accountId = platform === "octo" ? externalAccountId.toLowerCase() : externalAccountId;
  return [platform, accountId, botId || ""].join("::");
}

function sensitivePath(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = sensitivePath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (!/ref$/i.test(key) && SENSITIVE_KEY_PATTERN.test(key)) return nestedPath;
    const found = sensitivePath(nested, nestedPath);
    if (found) return found;
  }
  return null;
}

function pushDuplicateIds(
  issues: ChannelConnectorV3ValidationIssue[],
  values: Array<{ id: string }>,
  path: string,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const id = normalizeString(value.id);
    if (!id) {
      issues.push({
        code: "invalid_value",
        path: `${path}[${index}].id`,
        message: "ID is required.",
      });
      return;
    }
    if (seen.has(id)) {
      issues.push({
        code: "duplicate_id",
        path: `${path}[${index}].id`,
        message: `Duplicate ID: ${id}`,
      });
      return;
    }
    seen.add(id);
  });
}

export function channelConnectorSourceRuleMatchKey(rule: ChannelConnectorSourceRule): string {
  return JSON.stringify({
    peerKind: normalizeString(rule.match?.peer?.kind),
    peerId: normalizeString(rule.match?.peer?.id),
    threadId: normalizeString(rule.match?.threadId),
    senderId: normalizeString(rule.match?.senderId),
    mentionRequired: rule.match?.mentionRequired === true,
  });
}

export function channelConnectorSourceRuleSpecificity(rule: ChannelConnectorSourceRule): number {
  return (normalizeString(rule.match?.senderId) ? 8 : 0)
    + (normalizeString(rule.match?.threadId) ? 4 : 0)
    + (normalizeString(rule.match?.peer?.id) ? 2 : 0)
    + (rule.match?.mentionRequired === true ? 1 : 0);
}

function validatePolicyRules(
  issues: ChannelConnectorV3ValidationIssue[],
  policy: ChannelConnectorDeliveryPolicy,
  policyIndex: number,
  targetsById: Map<string, ChannelConnectorsV3Config["targets"][number]>,
): void {
  const path = `deliveryPolicies[${policyIndex}]`;
  const rules = Array.isArray(policy.rules) ? policy.rules : [];
  if (!Array.isArray(policy.rules)) {
    issues.push({
      code: "invalid_value",
      path: `${path}.rules`,
      message: "Policy rules must be an array.",
    });
  }
  pushDuplicateIds(issues, rules, `${path}.rules`);
  const enabledMatchKeys = new Map<string, number>();
  const defaultSenderAllowlist = normalizedStringList(policy.defaultAccessPolicy?.allowlist);
  const defaultAllowed = new Set([
    ...defaultSenderAllowlist,
    ...normalizedStringList(policy.defaultAccessPolicy?.adminUsers),
  ]);

  rules.forEach((rule, ruleIndex) => {
    const rulePath = `${path}.rules[${ruleIndex}]`;
    const peerKind = normalizeString(rule.match?.peer?.kind);
    const peerId = normalizeString(rule.match?.peer?.id);
    const threadId = normalizeString(rule.match?.threadId);
    const senderId = normalizeString(rule.match?.senderId);
    if (!DELIVERY_PEER_KINDS.has(peerKind)) {
      issues.push({
        code: "invalid_rule_match",
        path: `${rulePath}.match.peer.kind`,
        message: "Rule peer kind must be private, group, or channel.",
      });
    }
    if ((threadId || senderId) && !peerId) {
      issues.push({
        code: "invalid_rule_match",
        path: `${rulePath}.match.peer.id`,
        message: "Thread and sender matches require an exact peer ID.",
      });
    }
    if (rule.match?.mentionRequired !== undefined && rule.match.mentionRequired !== true) {
      issues.push({
        code: "invalid_rule_match",
        path: `${rulePath}.match.mentionRequired`,
        message: "A rule may only require a mention; it cannot disable an account requirement.",
      });
    }
    const ruleTarget = targetsById.get(normalizeString(rule.targetRef));
    if (!ruleTarget) {
      issues.push({
        code: "invalid_reference",
        path: `${rulePath}.targetRef`,
        message: `Unknown target: ${normalizeString(rule.targetRef) || "(empty)"}`,
      });
    } else if (!ruleTarget.enabled) {
      issues.push({
        code: "invalid_target",
        path: `${rulePath}.targetRef`,
        message: `Rule target is disabled: ${ruleTarget.id}`,
      });
    }
    if (rule.enabled !== false) {
      const matchKey = channelConnectorSourceRuleMatchKey(rule);
      const duplicateIndex = enabledMatchKeys.get(matchKey);
      if (duplicateIndex !== undefined) {
        issues.push({
          code: "duplicate_rule_match",
          path: `${rulePath}.match`,
          message: `Rule match duplicates ${path}.rules[${duplicateIndex}].match.`,
        });
      } else {
        enabledMatchKeys.set(matchKey, ruleIndex);
      }
    }
    const overrideAllowlist = rule.accessPolicy?.allowlist;
    if (overrideAllowlist && defaultSenderAllowlist.length > 0) {
      const expanded = normalizedStringList(overrideAllowlist).filter((id) => !defaultAllowed.has(id));
      if (expanded.length) {
        issues.push({
          code: "non_restrictive_access_override",
          path: `${rulePath}.accessPolicy.allowlist`,
          message: `Rule allowlist broadens account access: ${expanded.join(", ")}`,
        });
      }
    }
    const mode = normalizeString(rule.sessionPolicy?.mode);
    if (mode && !SESSION_MODES.has(mode)) {
      issues.push({
        code: "invalid_value",
        path: `${rulePath}.sessionPolicy.mode`,
        message: `Unsupported session mode: ${mode}`,
      });
    }
  });
}

export function validateChannelConnectorsV3Config(
  config: ChannelConnectorsV3Config,
): ChannelConnectorV3ValidationIssue[] {
  const issues: ChannelConnectorV3ValidationIssue[] = [];
  pushDuplicateIds(issues, config.accounts, "accounts");
  pushDuplicateIds(issues, config.targets, "targets");
  pushDuplicateIds(issues, config.deliveryPolicies, "deliveryPolicies");

  const accountIds = new Set(config.accounts.map((account) => normalizeString(account.id)).filter(Boolean));
  const targetsById = new Map(
    config.targets.map((target) => [normalizeString(target.id), target] as const),
  );
  const policyCountByAccount = new Map<string, number>();
  const enabledAccountIdentities = new Map<string, number>();

  config.accounts.forEach((account, index) => {
    if (!SUPPORTED_PLATFORMS.has(normalizeString(account.platform))) {
      issues.push({
        code: "invalid_value",
        path: `accounts[${index}].platform`,
        message: `Unsupported channel platform: ${normalizeString(account.platform) || "(empty)"}`,
      });
    }
    if (!ACCOUNT_LIFECYCLES.has(normalizeString(account.lifecycle))) {
      issues.push({
        code: "invalid_value",
        path: `accounts[${index}].lifecycle`,
        message: `Unsupported account lifecycle: ${normalizeString(account.lifecycle) || "(empty)"}`,
      });
    }
    if (typeof account.credentials !== "object" || account.credentials === null || Array.isArray(account.credentials)) {
      issues.push({ code: "invalid_value", path: `accounts[${index}].credentials`, message: "Account credentials must be an object." });
    }
    if (typeof account.transport !== "object" || account.transport === null || Array.isArray(account.transport)) {
      issues.push({ code: "invalid_value", path: `accounts[${index}].transport`, message: "Account transport must be an object." });
    }
    if (typeof account.advanced !== "object" || account.advanced === null || Array.isArray(account.advanced)) {
      issues.push({ code: "invalid_value", path: `accounts[${index}].advanced`, message: "Account advanced settings must be an object." });
    }
    if (!account.security || typeof account.security.allowPrivateAttachmentUrls !== "boolean" || !Array.isArray(account.security.allowedAttachmentHosts)) {
      issues.push({ code: "invalid_value", path: `accounts[${index}].security`, message: "Account security settings are invalid." });
    }
    const transportSecret = sensitivePath(account.transport, `accounts[${index}].transport`);
    const advancedSecret = sensitivePath(account.advanced, `accounts[${index}].advanced`);
    if (transportSecret || advancedSecret) {
      issues.push({
        code: "secret_outside_account",
        path: transportSecret || advancedSecret || `accounts[${index}]`,
        message: "Account secrets must be stored in credentials, not transport or advanced settings.",
      });
    }
    const externalAccountId = normalizeString(account.externalAccountId);
    if (account.lifecycle === "enabled" && !externalAccountId) {
      issues.push({
        code: "enabled_account_missing_identity",
        path: `accounts[${index}].externalAccountId`,
        message: "An enabled account requires an external account ID.",
      });
    }
    if (account.lifecycle === "enabled" && externalAccountId) {
      const identity = accountIdentityKey(account.platform, externalAccountId, normalizeString(account.botId) || null);
      const duplicateIndex = enabledAccountIdentities.get(identity);
      if (duplicateIndex !== undefined) {
        issues.push({
          code: "duplicate_account_identity",
          path: `accounts[${index}]`,
          message: `Enabled account duplicates accounts[${duplicateIndex}] (${identity}).`,
        });
      } else {
        enabledAccountIdentities.set(identity, index);
      }
    }
    if (account.lifecycle === "enabled") {
      const apiUrl = firstString(account.transport, ["apiUrl", "api_url", "baseUrl", "base_url"]);
      if (!apiUrl || !validHttpEndpoint(apiUrl)) {
        issues.push({
          code: "invalid_value",
          path: `accounts[${index}].transport.apiUrl`,
          message: "An enabled account requires a valid HTTP(S) API URL without credentials or a fragment.",
        });
      }
      if (account.platform === "feishu" && !firstString(account.credentials, ["appSecret", "app_secret"])) {
        issues.push({
          code: "invalid_value",
          path: `accounts[${index}].credentials.appSecret`,
          message: "An enabled Feishu account requires an App Secret.",
        });
      }
      if (account.platform === "octo" && !firstString(account.credentials, ["botToken", "bot_token"])) {
        issues.push({
          code: "invalid_value",
          path: `accounts[${index}].credentials.botToken`,
          message: "An enabled Octo account requires a Bot Token.",
        });
      }
    }
  });

  config.targets.forEach((target, index) => {
    const path = `targets[${index}]`;
    if (!RUNTIME_AGENT_IDS.has(normalizeString(target.runtime?.agent))) {
      issues.push({
        code: "invalid_target",
        path: `${path}.runtime.agent`,
        message: `Unsupported runtime Agent: ${normalizeString(target.runtime?.agent) || "(empty)"}`,
      });
    }
    if (!normalizeString(target.workspace?.workDir)) {
      issues.push({
        code: "invalid_target",
        path: `${path}.workspace.workDir`,
        message: "Target workDir is required.",
      });
    }
    if (!PERMISSION_MODES.has(normalizeString(target.execution?.permissionMode))) {
      issues.push({
        code: "invalid_target",
        path: `${path}.execution.permissionMode`,
        message: `Unsupported permission mode: ${normalizeString(target.execution?.permissionMode) || "(empty)"}`,
      });
    }
    if (!Number.isInteger(target.execution?.workspaceConcurrency) || target.execution.workspaceConcurrency < 1) {
      issues.push({
        code: "invalid_target",
        path: `${path}.execution.workspaceConcurrency`,
        message: "workspaceConcurrency must be a positive integer.",
      });
    }
    if (!Number.isInteger(target.execution?.queueLimit) || target.execution.queueLimit < 0) {
      issues.push({
        code: "invalid_target",
        path: `${path}.execution.queueLimit`,
        message: "queueLimit must be a non-negative integer.",
      });
    }
    const secret = sensitivePath(target, path);
    if (secret) {
      issues.push({
        code: "secret_outside_account",
        path: secret,
        message: "Secrets may only be stored on channel accounts.",
      });
    }
  });

  config.deliveryPolicies.forEach((policy, index) => {
    const path = `deliveryPolicies[${index}]`;
    const accountRef = normalizeString(policy.accountRef);
    if (!accountIds.has(accountRef)) {
      issues.push({
        code: "invalid_reference",
        path: `${path}.accountRef`,
        message: `Unknown account: ${accountRef || "(empty)"}`,
      });
    }
    policyCountByAccount.set(accountRef, (policyCountByAccount.get(accountRef) || 0) + 1);
    const defaultTarget = targetsById.get(normalizeString(policy.defaultTargetRef));
    if (!defaultTarget) {
      issues.push({
        code: "invalid_reference",
        path: `${path}.defaultTargetRef`,
        message: `Unknown default target: ${normalizeString(policy.defaultTargetRef) || "(empty)"}`,
      });
    } else if (!defaultTarget.enabled) {
      issues.push({
        code: "invalid_target",
        path: `${path}.defaultTargetRef`,
        message: `Default target is disabled: ${defaultTarget.id}`,
      });
    }
    const defaultMode = normalizeString(policy.defaultSessionPolicy?.mode);
    if (!SESSION_MODES.has(defaultMode)) {
      issues.push({
        code: "invalid_value",
        path: `${path}.defaultSessionPolicy.mode`,
        message: `Unsupported session mode: ${defaultMode || "(empty)"}`,
      });
    }
    validatePolicyRules(issues, policy, index, targetsById);
    const secret = sensitivePath(policy, path);
    if (secret) {
      issues.push({
        code: "secret_outside_account",
        path: secret,
        message: "Secrets may only be stored on channel accounts.",
      });
    }
  });

  config.accounts.forEach((account, index) => {
    if (account.lifecycle !== "enabled") return;
    const count = policyCountByAccount.get(normalizeString(account.id)) || 0;
    if (count !== 1) {
      issues.push({
        code: "enabled_account_missing_policy",
        path: `accounts[${index}]`,
        message: count === 0
          ? "An enabled account requires one delivery policy."
          : "An enabled account may only have one delivery policy.",
      });
    }
  });

  return issues;
}

export class ChannelConnectorV3ConfigValidationError extends Error {
  readonly issues: ChannelConnectorV3ValidationIssue[];

  constructor(issues: ChannelConnectorV3ValidationIssue[]) {
    super(`Invalid Channel Connectors v3 config (${issues.length} issue${issues.length === 1 ? "" : "s"}).`);
    this.name = "ChannelConnectorV3ConfigValidationError";
    this.issues = issues;
  }
}

export function assertChannelConnectorsV3Config(config: ChannelConnectorsV3Config): void {
  const issues = validateChannelConnectorsV3Config(config);
  if (issues.length) throw new ChannelConnectorV3ConfigValidationError(issues);
}
