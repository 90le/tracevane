import type { ChannelAccountSummary, ChannelSummary } from '../../../../../types/channels';

export interface ChannelsOverviewRecipe {
  providerHeadline: string;
  providerCopy: string;
  accountCopy: {
    default: string;
    named: string;
  };
  badgeLabels: {
    enabled: string;
    disabled: string;
    accounts: (count: number) => string;
    bindings: (count: number) => string;
    defaultAccount: (accountId: string) => string;
  };
}

export interface ChannelWorkspaceSummary {
  headline: string;
  copy: string;
  badges: string[];
}

export interface ChannelAccountWorkspaceSummary {
  copy: string;
}

export function buildChannelsOverviewRecipe(
  text: (zh: string, en: string) => string,
): ChannelsOverviewRecipe {
  return {
    providerHeadline: text('Provider 工作区', 'Provider workspace'),
    providerCopy: text(
      '当前 provider 的概览、设置和绑定会在这里切换；账号配置请从下方账号索引进入。',
      'This stage switches between provider overview, settings, and bindings. Open account settings from the account index below.',
    ),
    accountCopy: {
      default: text(
        '当前是默认账号。账号配置只影响当前账号，不影响其它账号。',
        'This is the default account. Account settings only affect this account, not the other accounts.',
      ),
      named: text(
        '当前是命名账号。账号配置只影响当前账号，不影响其它账号。',
        'This is a named account. Account settings only affect this account, not the other accounts.',
      ),
    },
    badgeLabels: {
      enabled: text('已启用', 'Enabled'),
      disabled: text('已禁用', 'Disabled'),
      accounts: (count: number) => text(`${count} 个账号`, `${count} accounts`),
      bindings: (count: number) => text(`${count} 条绑定`, `${count} bindings`),
      defaultAccount: (accountId: string) => text(`默认账号 ${accountId}`, `Default ${accountId}`),
    },
  };
}

export function buildChannelWorkspaceSummary(
  recipe: ChannelsOverviewRecipe,
  channel: ChannelSummary,
): ChannelWorkspaceSummary {
  const badges = [
    channel.enabled ? recipe.badgeLabels.enabled : recipe.badgeLabels.disabled,
    recipe.badgeLabels.accounts(channel.accountCount),
    recipe.badgeLabels.bindings(channel.bindingCount),
  ];

  if (channel.defaultAccount) {
    badges.push(recipe.badgeLabels.defaultAccount(channel.defaultAccount));
  }

  return {
    headline: recipe.providerHeadline,
    copy: recipe.providerCopy,
    badges,
  };
}

export function buildChannelAccountWorkspaceSummary(
  recipe: ChannelsOverviewRecipe,
  account: ChannelAccountSummary,
): ChannelAccountWorkspaceSummary {
  return {
    copy: account.kind === 'default' ? recipe.accountCopy.default : recipe.accountCopy.named,
  };
}
