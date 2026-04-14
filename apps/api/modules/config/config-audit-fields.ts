export interface ConfigAuditWhitelistEntry {
  path: string;
  module: string;
  label: string;
  severity: string;
  actionKey: string;
}

export const CONFIG_AUDIT_WHITELIST_FIELDS: ConfigAuditWhitelistEntry[] = [
  {
    path: "transport.gateway.basePath",
    module: "transport",
    label: "Gateway Base Path",
    severity: "info",
    actionKey: "transport.gateway.basePath.update",
  },
  {
    path: "deviceTrust.autoApproveLocalHelper",
    module: "deviceTrust",
    label: "Auto Approve Local Helper",
    severity: "warning",
    actionKey: "deviceTrust.autoApproveLocalHelper.toggle",
  },
];
