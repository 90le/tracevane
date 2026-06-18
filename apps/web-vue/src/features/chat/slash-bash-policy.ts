import { isTracevaneHostManagementCommandText } from '../../../../../lib/tracevane-host-management-command';

type LocalizedText = {
  zh: string;
  en: string;
};

export type TracevaneBashSlashDecision =
  | { kind: 'help'; detail: LocalizedText }
  | { kind: 'blocked'; detail: LocalizedText }
  | { kind: 'fallback' };

export function resolveTracevaneBashSlashHandling(params: {
  args: string;
  globalHostManagementExecEnabled: boolean;
  sessionHostManagementExecEnabled: boolean;
}): TracevaneBashSlashDecision {
  const args = typeof params.args === 'string' ? params.args.trim() : '';
  if (!args || args === 'help' || args === '--help' || args === '-h') {
    const globalState = params.globalHostManagementExecEnabled ? '已开启' : '未开启';
    const sessionState = params.sessionHostManagementExecEnabled ? '已开启' : '未开启';
    const globalStateEn = params.globalHostManagementExecEnabled ? 'enabled' : 'disabled';
    const sessionStateEn = params.sessionHostManagementExecEnabled ? 'enabled' : 'disabled';
    return {
      kind: 'help',
      detail: {
        zh: `Tracevane 中的 /bash 会继续回退宿主原生命令执行。普通工作区命令可直接继续发送；宿主管理类 bash 命令需要先开启双层开关。当前全局宿主管理 Exec：${globalState}；当前会话宿主管理 Exec：${sessionState}。`,
        en: `In Tracevane, /bash still falls back to the host slash command. Ordinary workspace commands can keep sending directly; host-management bash commands require both switches first. Current global host-management Exec: ${globalStateEn}; current session host-management Exec: ${sessionStateEn}.`,
      },
    };
  }

  if (
    isTracevaneHostManagementCommandText(args)
    && !(params.globalHostManagementExecEnabled && params.sessionHostManagementExecEnabled)
  ) {
    return {
      kind: 'blocked',
      detail: {
        zh: '当前 `/bash` 命中了宿主管理命令，但宿主管理 Exec 双层开关尚未同时开启。请先在 Config > 沙盒与安全 打开“允许在 Tracevane Chat 中启用宿主管理 Exec”，再为当前会话开启顶部的小开关。',
        en: 'This `/bash` command matches a host-management operation, but the dual host-management Exec switches are not both enabled yet. First enable “Allow host-management Exec in Tracevane Chat” under Config > Sandbox & Security, then turn on the small session switch in chat.',
      },
    };
  }

  return { kind: 'fallback' };
}
