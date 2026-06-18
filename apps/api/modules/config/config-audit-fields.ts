export interface ConfigAuditWhitelistEntry {
  path: string;
  module: string;
  label: string;
  severity: string;
  actionKey: string;
}

export const CONFIG_AUDIT_WHITELIST_FIELDS: ConfigAuditWhitelistEntry[] = [
  {
    path: "transport.preferredMode",
    module: "system",
    label: "Preferred Tracevane entry",
    severity: "info",
    actionKey: "open-config-section",
  },
  {
    path: "transport.standalone.enabled",
    module: "system",
    label: "Standalone transport",
    severity: "info",
    actionKey: "open-config-section",
  },
  {
    path: "transport.standalone.port",
    module: "system",
    label: "Standalone port",
    severity: "info",
    actionKey: "open-config-section",
  },
  {
    path: "transport.gateway.enabled",
    module: "system",
    label: "Gateway transport",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "transport.gateway.basePath",
    module: "system",
    label: "Gateway basePath",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "gatewayPort",
    module: "system",
    label: "Gateway port",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "gatewayWsUrl",
    module: "system",
    label: "Gateway WS URL",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "gatewayControlUiBasePath",
    module: "system",
    label: "Gateway control UI basePath",
    severity: "warning",
    actionKey: "open-config-section",
  },
  {
    path: "deviceTrust.autoApproveLocalHelper",
    module: "system",
    label: "Local helper auto-approve",
    severity: "warning",
    actionKey: "open-config-section",
  },
];
