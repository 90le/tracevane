import type {
  ChannelConnectorsDaemonRuntimeStatus,
  ChannelConnectorPlatformBinding,
} from "../types";

export interface ChannelConnectorAccountGroup {
  key: string;
  representative: ChannelConnectorPlatformBinding;
  bindings: ChannelConnectorPlatformBinding[];
}

export interface ChannelConnectorAccountRuntimeState {
  label: string;
  variant: "ok" | "warn" | "mute" | "info";
  description: string;
}

export function channelConnectorAccountKey(
  binding: ChannelConnectorPlatformBinding,
): string {
  return [binding.platform, binding.accountId || "", binding.botId || ""].join(
    "::",
  );
}

export function groupChannelConnectorAccounts(
  bindings: ChannelConnectorPlatformBinding[],
): ChannelConnectorAccountGroup[] {
  const byKey = new Map<string, ChannelConnectorAccountGroup>();
  for (const binding of bindings) {
    const key = channelConnectorAccountKey(binding);
    const existing = byKey.get(key);
    if (existing) {
      existing.bindings.push(binding);
    } else {
      byKey.set(key, { key, representative: binding, bindings: [binding] });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const aName =
      a.representative.displayName ||
      a.representative.accountId ||
      a.representative.id;
    const bName =
      b.representative.displayName ||
      b.representative.accountId ||
      b.representative.id;
    return aName.localeCompare(bName);
  });
}

export function runtimeAccountState(
  group: ChannelConnectorAccountGroup,
  runtime: ChannelConnectorsDaemonRuntimeStatus | null | undefined,
): ChannelConnectorAccountRuntimeState {
  const enabledBindings = group.bindings.filter((binding) => binding.enabled);
  if (enabledBindings.length === 0) {
    return { label: "已停用", variant: "mute", description: "账号未启用" };
  }
  if (runtime?.reachable !== true) {
    return {
      label: "守护离线",
      variant: "warn",
      description: runtime?.error || "无法读取消息守护运行状态",
    };
  }
  const enabledIds = new Set(enabledBindings.map((binding) => binding.id));
  if (group.representative.platform === "feishu") {
    const detail = runtime.feishuConnectionDetails.find((connection) =>
      connection.bindingIds.some((bindingId) => enabledIds.has(bindingId)),
    );
    if (!detail) {
      return {
        label: "等待应用",
        variant: "info",
        description: "运行时尚未加载该账号",
      };
    }
    if (detail.connected && detail.ingressState === "receiving") {
      return {
        label: "已连接",
        variant: "ok",
        description: "飞书长连接正在接收事件",
      };
    }
    if (detail.connected) {
      return {
        label: "连接待验证",
        variant: "warn",
        description:
          detail.ingressState === "warming"
            ? "长连接已建立，但尚未收到事件；检查应用版本发布、im.message.receive_v1 与长连接订阅"
            : `飞书长连接在线，事件入口状态：${detail.ingressState}`,
      };
    }
    return {
      label: "连接异常",
      variant: "warn",
      description: detail.lastError || `飞书连接状态：${detail.state}`,
    };
  }
  if (group.representative.platform === "octo") {
    const details = runtime.octoConnectionDetails.filter((connection) =>
      enabledIds.has(connection.bindingId),
    );
    if (details.some((connection) => connection.connected)) {
      return {
        label: "已连接",
        variant: "ok",
        description: "Octo WebSocket 已连接",
      };
    }
    if (details.length === 0) {
      return {
        label: "等待应用",
        variant: "info",
        description: "运行时尚未加载该账号",
      };
    }
    if (details.some((connection) => connection.state === "connecting")) {
      return {
        label: "连接中",
        variant: "info",
        description: "Octo WebSocket 正在连接",
      };
    }
    const error = details.find(
      (connection) => connection.lastError || connection.restHeartbeatLastError,
    );
    return {
      label: "连接异常",
      variant: "warn",
      description:
        error?.lastError ||
        error?.restHeartbeatLastError ||
        "Octo WebSocket 未连接",
    };
  }
  return {
    label: "未检测",
    variant: "mute",
    description: "当前平台暂无运行时探针",
  };
}
