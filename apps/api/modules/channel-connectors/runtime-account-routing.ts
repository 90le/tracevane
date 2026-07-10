import type {
  ChannelConnectorDeliveryResolutionResult,
  ChannelConnectorIngressRoutingContext,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorsDaemonRuntimeConfig,
  ChannelConnectorsV3Config,
} from "../../../../types/channel-connectors.js";
import type {
  ChannelConnectorRuntimeBinding,
  ChannelConnectorRuntimeProject,
} from "./agent-runner.js";
import { resolveChannelConnectorDelivery } from "./delivery-resolver.js";

export interface ChannelConnectorRuntimeRouteRef {
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
}

export interface ChannelConnectorOctoAccountRouteGroup {
  key: string;
  accountId: string;
  botId: string | null;
  primary: ChannelConnectorRuntimeRouteRef;
  refs: ChannelConnectorRuntimeRouteRef[];
}

export interface ChannelConnectorV3RuntimeRouteSelection<TRef> {
  result: ChannelConnectorDeliveryResolutionResult;
  ref: TRef | null;
}

export interface ChannelConnectorV3AccountConnectionDiff {
  addedAccountIds: string[];
  removedAccountIds: string[];
  reconnectedAccountIds: string[];
  changedAccountIds: string[];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, stableValue(nested)]));
}

function accountConnectionFingerprint(account: ChannelConnectorsV3Config["accounts"][number]): string {
  return JSON.stringify(stableValue({
    platform: account.platform,
    lifecycle: account.lifecycle,
    externalAccountId: account.externalAccountId,
    botId: account.botId,
    credentials: account.credentials,
    transport: account.transport,
  }));
}

export function diffChannelConnectorV3AccountConnections(
  current: ChannelConnectorsV3Config,
  next: ChannelConnectorsV3Config,
): ChannelConnectorV3AccountConnectionDiff {
  const before = new Map(current.accounts.map((account) => [account.id, accountConnectionFingerprint(account)] as const));
  const after = new Map(next.accounts.map((account) => [account.id, accountConnectionFingerprint(account)] as const));
  const addedAccountIds = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removedAccountIds = [...before.keys()].filter((id) => !after.has(id)).sort();
  const reconnectedAccountIds = [...after.keys()]
    .filter((id) => before.has(id) && before.get(id) !== after.get(id))
    .sort();
  return {
    addedAccountIds,
    removedAccountIds,
    reconnectedAccountIds,
    changedAccountIds: [...new Set([...addedAccountIds, ...removedAccountIds, ...reconnectedAccountIds])].sort(),
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(normalizeString).filter(Boolean))];
}

export function channelConnectorRuntimeRouteId(accountId: string, ruleId: string | null = null): string {
  return ruleId ? `${accountId}:rule:${ruleId}` : `${accountId}:default`;
}

export function channelConnectorRuntimeRouteRefs(
  config: ChannelConnectorsDaemonRuntimeConfig,
): ChannelConnectorRuntimeRouteRef[] {
  const delivery = config.deliveryConfig;
  const targets = new Map(delivery.targets.map((target) => [target.id, target] as const));
  const policies = new Map(delivery.deliveryPolicies.map((policy) => [policy.accountRef, policy] as const));
  const refs: ChannelConnectorRuntimeRouteRef[] = [];

  for (const account of delivery.accounts) {
    if (account.lifecycle !== "enabled") continue;
    const policy = policies.get(account.id);
    if (!policy) continue;
    const entries = [{
      id: channelConnectorRuntimeRouteId(account.id),
      name: `${account.displayName} / 默认`,
      targetRef: policy.defaultTargetRef,
      enabled: true,
      peerKind: "private",
      peerId: "*",
      sessionPolicy: policy.defaultSessionPolicy,
      allowlist: policy.defaultAccessPolicy.allowlist,
      disabledCommands: policy.defaultAccessPolicy.disabledCommands,
      ruleId: null as string | null,
    }, ...policy.rules.map((rule) => ({
      id: channelConnectorRuntimeRouteId(account.id, rule.id),
      name: rule.name || rule.id,
      targetRef: rule.targetRef,
      enabled: rule.enabled,
      peerKind: rule.match.peer.kind,
      peerId: rule.match.peer.id || "*",
      sessionPolicy: {
        mode: rule.sessionPolicy?.mode || policy.defaultSessionPolicy.mode,
        busyGuard: rule.sessionPolicy?.busyGuard ?? policy.defaultSessionPolicy.busyGuard,
        attachmentStaging: rule.sessionPolicy?.attachmentStaging ?? policy.defaultSessionPolicy.attachmentStaging,
      },
      allowlist: rule.accessPolicy?.allowlist || policy.defaultAccessPolicy.allowlist,
      disabledCommands: uniqueStrings([
        ...policy.defaultAccessPolicy.disabledCommands,
        ...(rule.accessPolicy?.disabledCommands || []),
      ]),
      ruleId: rule.id,
    }))];

    for (const entry of entries) {
      const target = targets.get(entry.targetRef);
      if (!target || !target.enabled || !entry.enabled) continue;
      const binding: ChannelConnectorRuntimeBinding = {
        id: entry.id,
        platform: account.platform,
        accountId: account.externalAccountId || account.id,
        botId: account.botId,
        displayName: entry.name,
        agent: target.runtime.agent,
        enabled: true,
        allowlist: uniqueStrings(entry.allowlist),
        adminUsers: uniqueStrings(policy.defaultAccessPolicy.adminUsers),
        disabledCommands: uniqueStrings([...target.governance.disabledCommands, ...entry.disabledCommands]),
        metadata: {
          ...account.transport,
          ...account.advanced,
          ...account.credentials,
          allowPrivateAttachmentUrls: account.security.allowPrivateAttachmentUrls,
          allowedAttachmentHosts: [...account.security.allowedAttachmentHosts],
          channelAccountId: account.id,
          peerKind: entry.peerKind,
          peerId: entry.peerId,
          sessionMode: entry.sessionPolicy.mode,
          busyGuard: entry.sessionPolicy.busyGuard,
          attachmentStaging: entry.sessionPolicy.attachmentStaging,
          deliveryPolicyId: policy.id,
          deliveryRuleId: entry.ruleId,
          deliveryTargetId: target.id,
          deliveryTargetRevision: target.id,
          workspaceConcurrency: target.execution.workspaceConcurrency,
          workspaceQueueLimit: target.execution.queueLimit,
        },
      };
      refs.push({
        binding,
        project: {
          id: target.id,
          name: target.name,
          workDir: target.workspace.workDir,
          agent: target.runtime.agent,
          model: target.execution.model,
          reasoningEffort: target.execution.reasoningEffort,
          permissionMode: target.execution.permissionMode,
          gatewayEndpoint: target.runtime.gatewayEndpoint,
          gatewayKeyRef: target.runtime.gatewayKeyRef,
          appProfileRef: target.runtime.appProfileRef,
        },
      });
    }
  }
  return refs;
}

export function channelConnectorRuntimeRoutePeerKind(binding: ChannelConnectorRuntimeBinding): string {
  return normalizeString(binding.metadata?.peerKind).toLowerCase();
}

export function channelConnectorRuntimeRoutePeerId(binding: ChannelConnectorRuntimeBinding): string {
  return normalizeString(binding.metadata?.peerId);
}

export function channelConnectorRuntimeAccountId(binding: ChannelConnectorRuntimeBinding): string {
  return normalizeString(binding.metadata?.channelAccountId);
}

export function selectChannelConnectorV3RuntimeRoute<
  TRef extends ChannelConnectorRuntimeRouteRef,
>(
  config: ChannelConnectorsV3Config,
  refs: TRef[],
  context: ChannelConnectorIngressRoutingContext,
): ChannelConnectorV3RuntimeRouteSelection<TRef> {
  const result = resolveChannelConnectorDelivery(config, context);
  if (!result.ok) return { result, ref: null };
  const ref = refs.find((candidate) => (
    channelConnectorRuntimeAccountId(candidate.binding) === context.accountId
      && normalizeString(candidate.binding.metadata?.deliveryRuleId) === normalizeString(result.resolution.ruleId)
      && candidate.project.id === result.resolution.targetId
  )) || null;
  return { result, ref };
}

export function applyChannelConnectorV3ResolutionToRuntimeRef<
  TRef extends ChannelConnectorRuntimeRouteRef,
>(
  config: ChannelConnectorsV3Config,
  selection: ChannelConnectorV3RuntimeRouteSelection<TRef>,
): TRef | null {
  const result = selection.result;
  if (!result.ok || !selection.ref) return null;
  const policy = config.deliveryPolicies.find((candidate) => candidate.id === result.resolution.policyId);
  const target = config.targets.find((candidate) => candidate.id === result.resolution.targetId);
  if (!policy || !target) return null;
  return {
    ...selection.ref,
    binding: {
      ...selection.ref.binding,
      allowlist: [...result.resolution.accessDecision.allowlist],
      adminUsers: [...policy.defaultAccessPolicy.adminUsers],
      disabledCommands: [...result.resolution.accessDecision.disabledCommands],
      metadata: {
        ...selection.ref.binding.metadata,
        sessionMode: result.resolution.sessionPolicy.mode,
        busyGuard: result.resolution.sessionPolicy.busyGuard,
        attachmentStaging: result.resolution.sessionPolicy.attachmentStaging,
        deliveryTargetRevision: result.resolution.targetRevision,
      },
    },
  };
}

export function selectExactChannelConnectorRuntimeRoute<TRef extends ChannelConnectorRuntimeRouteRef>(
  refs: TRef[],
  source: { peerKind: string; peerId: string },
): TRef | null {
  const peerKind = normalizeString(source.peerKind).toLowerCase();
  const peerId = normalizeString(source.peerId);
  return refs.find((ref) => (
    channelConnectorRuntimeRoutePeerKind(ref.binding) === peerKind
      && channelConnectorRuntimeRoutePeerId(ref.binding) === peerId
  )) || null;
}

export function selectChannelConnectorRuntimeRoute<TRef extends ChannelConnectorRuntimeRouteRef>(
  refs: TRef[],
  source: { peerKind: string; peerId: string },
): TRef | null {
  return selectExactChannelConnectorRuntimeRoute(refs, source)
    || refs.find((ref) => channelConnectorRuntimeRoutePeerKind(ref.binding) === normalizeString(source.peerKind).toLowerCase() && channelConnectorRuntimeRoutePeerId(ref.binding) === "*")
    || refs.find((ref) => channelConnectorRuntimeRoutePeerId(ref.binding) === "*")
    || null;
}

export function channelConnectorAccountConnectionKey(binding: ChannelConnectorRuntimeBinding): string {
  return [binding.platform, normalizeString(binding.accountId).toLowerCase(), normalizeString(binding.botId).toLowerCase()].join("::");
}

export function groupChannelConnectorOctoAccountRoutes(
  config: ChannelConnectorsDaemonRuntimeConfig,
): ChannelConnectorOctoAccountRouteGroup[] {
  const groups = new Map<string, ChannelConnectorRuntimeRouteRef[]>();
  for (const ref of channelConnectorRuntimeRouteRefs(config)) {
    if (ref.binding.platform !== "octo" || ref.binding.enabled === false) continue;
    const key = channelConnectorAccountConnectionKey(ref.binding);
    const group = groups.get(key);
    if (group) group.push(ref);
    else groups.set(key, [ref]);
  }
  return [...groups.entries()].map(([key, refs]) => ({
    key,
    accountId: channelConnectorRuntimeAccountId(refs[0].binding),
    botId: refs[0].binding.botId,
    primary: refs.find((ref) => channelConnectorRuntimeRoutePeerId(ref.binding) === "*") || refs[0],
    refs,
  }));
}

export function selectChannelConnectorOctoAccountRoute(
  group: ChannelConnectorOctoAccountRouteGroup,
  message: ChannelConnectorOctoInboundMessage,
): ChannelConnectorRuntimeRouteRef {
  return selectChannelConnectorRuntimeRoute(group.refs, {
    peerKind: message.channelType === 1 ? "private" : "group",
    peerId: normalizeString(message.channelId) || normalizeString(message.fromUid),
  }) || group.primary;
}
