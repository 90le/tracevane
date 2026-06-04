import { computed, inject, onActivated, onMounted, provide, reactive, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  ChannelAgentOption,
  ChannelBindingSummary,
  ChannelCatalogEntry,
  ChannelsSummaryPayload,
  ChannelSummary,
} from '../../../../../types/channels';
import { createChannel, fetchChannelsSummary } from './api';
import { titleCaseLabel } from './channel-ui';
import { useLocalePreference } from '../../shared/locale';
import type { ChannelSelectOption } from './channel-ui';

export interface ChannelsWorkspaceState {
  summary: Ref<ChannelsSummaryPayload | null>;
  loading: Ref<boolean>;
  busyKey: Ref<string>;
  errorMessage: Ref<string>;
  successMessage: Ref<string>;
  createChannelDraft: { type: string; enabled: boolean };
  selectedChannelType: ComputedRef<string>;
  selectedChannel: ComputedRef<ChannelSummary | null>;
  selectedCatalog: ComputedRef<ChannelCatalogEntry | null>;
  selectedBindings: ComputedRef<ChannelBindingSummary[]>;
  agents: ComputedRef<ChannelAgentOption[]>;
  checkedAtLabel: ComputedRef<string>;
  availableCreateTypeOptions: ComputedRef<ChannelSelectOption[]>;
  channelLabel: (channelType: string) => string;
  channelIcon: (channelType: string) => string;
  credentialLabel: (key: string, channelType?: string) => string;
  clearMessages: () => void;
  setSuccessMessage: (message: string) => void;
  setErrorMessage: (message: string) => void;
  refreshSummary: (preferredChannelType?: string) => Promise<void>;
  selectChannel: (channelType: string) => Promise<void>;
  submitCreateChannel: () => Promise<void>;
  openOverlay: (overlay: string, accountId?: string) => Promise<void>;
  closeOverlay: () => Promise<void>;
}

const ChannelsWorkspaceKey = Symbol('ChannelsWorkspace');

function formatCheckedAt(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function provideChannelsWorkspace(): ChannelsWorkspaceState {
  const route = useRoute();
  const router = useRouter();
  const { text } = useLocalePreference();

  const summary = ref<ChannelsSummaryPayload | null>(null);
  const loading = ref(false);
  const busyKey = ref('');
  const errorMessage = ref('');
  const successMessage = ref('');
  const createChannelDraft = reactive({
    type: '',
    enabled: true,
  });
  let refreshRequestSequence = 0;
  const isChannelsRouteActive = computed(() => route.path === '/channels' || route.path.startsWith('/channels/'));

  const selectedChannelType = computed(() => {
    const type = route.params.type;
    return typeof type === 'string' ? type : '';
  });

  const catalogByType = computed<Record<string, ChannelCatalogEntry>>(() => {
    return Object.fromEntries((summary.value?.catalog || []).map((entry) => [entry.type, entry])) as Record<string, ChannelCatalogEntry>;
  });

  const selectedChannel = computed(() => {
    return summary.value?.channels.find((channel) => channel.type === selectedChannelType.value) || null;
  });

  const selectedCatalog = computed(() => {
    return selectedChannel.value ? catalogByType.value[selectedChannel.value.type] || null : null;
  });

  const selectedBindings = computed(() => {
    return (summary.value?.bindings || []).filter((binding) => binding.channel === selectedChannelType.value);
  });

  const agents = computed(() => summary.value?.agents || []);

  const checkedAtLabel = computed(() => formatCheckedAt(summary.value?.checkedAt));

  const availableCreateTypeOptions = computed(() => {
    const existing = new Set((summary.value?.channels || []).map((channel) => channel.type));
    return (summary.value?.catalog || [])
      .filter((entry) => !existing.has(entry.type))
      .map((entry) => ({
        value: entry.type,
        label: `${entry.icon} ${channelLabel(entry.type)}`,
      }));
  });

  function clearMessages(): void {
    errorMessage.value = '';
    successMessage.value = '';
  }

  function setSuccessMessage(message: string): void {
    errorMessage.value = '';
    successMessage.value = message;
  }

  function setErrorMessage(message: string): void {
    successMessage.value = '';
    errorMessage.value = message;
  }

  function channelLabel(channelType: string): string {
    return catalogByType.value[channelType]?.label || titleCaseLabel(channelType);
  }

  function channelIcon(channelType: string): string {
    return catalogByType.value[channelType]?.icon || '◈';
  }

  function credentialLabel(key: string, channelType = selectedChannelType.value): string {
    return catalogByType.value[channelType]?.credentialFields.find((field) => field.key === key)?.label || titleCaseLabel(key);
  }

  function providerOverviewPath(channelType: string): string {
    return `/channels/${encodeURIComponent(channelType)}`;
  }

  async function ensureRouteAfterSummary(preferredChannelType?: string): Promise<void> {
    if (!isChannelsRouteActive.value) return;
    const channels = summary.value?.channels || [];
    if (!channels.length) {
      if (route.fullPath !== '/channels') {
        await router.replace('/channels');
      }
      return;
    }

    const preferred =
      (preferredChannelType && channels.some((channel) => channel.type === preferredChannelType) && preferredChannelType)
      || (selectedChannelType.value && channels.some((channel) => channel.type === selectedChannelType.value) && selectedChannelType.value)
      || channels[0]?.type
      || '';

    if (!preferred) return;
    if (!selectedChannelType.value) {
      await router.replace(providerOverviewPath(preferred));
      return;
    }
    if (!channels.some((channel) => channel.type === selectedChannelType.value)) {
      await router.replace(providerOverviewPath(preferred));
    }
  }

  async function refreshSummary(preferredChannelType?: string): Promise<void> {
    if (!isChannelsRouteActive.value) return;
    const requestSequence = ++refreshRequestSequence;
    loading.value = true;
    try {
      const nextSummary = await fetchChannelsSummary();
      if (requestSequence !== refreshRequestSequence || !isChannelsRouteActive.value) return;
      summary.value = nextSummary;
      await ensureRouteAfterSummary(preferredChannelType);
    } catch (error) {
      if (requestSequence !== refreshRequestSequence || !isChannelsRouteActive.value) return;
      setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
    } finally {
      if (requestSequence !== refreshRequestSequence) return;
      loading.value = false;
    }
  }

  async function selectChannel(channelType: string): Promise<void> {
    if (!isChannelsRouteActive.value) return;
    clearMessages();
    await router.push({
      path: providerOverviewPath(channelType),
      query: {},
    });
  }

  async function submitCreateChannel(): Promise<void> {
    if (!isChannelsRouteActive.value) return;
    if (!createChannelDraft.type) return;
    clearMessages();
    busyKey.value = 'create-channel';
    const createdType = createChannelDraft.type;
    try {
      const response = await createChannel(createdType, createChannelDraft.enabled);
      if (!isChannelsRouteActive.value) return;
      summary.value = response.summary;
      createChannelDraft.type = '';
      createChannelDraft.enabled = true;
      setSuccessMessage(response.message);
      await ensureRouteAfterSummary(createdType);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : text('未知错误', 'Unknown error'));
    } finally {
      busyKey.value = '';
    }
  }

  async function openOverlay(overlay: string, accountId?: string): Promise<void> {
    if (!isChannelsRouteActive.value) return;
    const nextQuery: Record<string, string> = {};
    for (const [key, value] of Object.entries(route.query)) {
      if (typeof value === 'string' && key !== 'overlay' && key !== 'accountId') {
        nextQuery[key] = value;
      }
    }
    nextQuery.overlay = overlay;
    if (accountId) nextQuery.accountId = accountId;
    await router.replace({ query: nextQuery });
  }

  async function closeOverlay(): Promise<void> {
    if (!isChannelsRouteActive.value) return;
    const nextQuery: Record<string, string> = {};
    for (const [key, value] of Object.entries(route.query)) {
      if (typeof value === 'string' && key !== 'overlay' && key !== 'accountId') {
        nextQuery[key] = value;
      }
    }
    await router.replace({ query: nextQuery });
  }

  const state: ChannelsWorkspaceState = {
    summary,
    loading,
    busyKey,
    errorMessage,
    successMessage,
    createChannelDraft,
    selectedChannelType,
    selectedChannel,
    selectedCatalog,
    selectedBindings,
    agents,
    checkedAtLabel,
    availableCreateTypeOptions,
    channelLabel,
    channelIcon,
    credentialLabel,
    clearMessages,
    setSuccessMessage,
    setErrorMessage,
    refreshSummary,
    selectChannel,
    submitCreateChannel,
    openOverlay,
    closeOverlay,
  };

  provide(ChannelsWorkspaceKey, state);

  watch(
    selectedChannelType,
    (nextChannelType, previousChannelType) => {
      if (!isChannelsRouteActive.value) return;
      if (previousChannelType && previousChannelType !== nextChannelType) clearMessages();
      if (!summary.value) {
        void refreshSummary(nextChannelType);
        return;
      }
      void ensureRouteAfterSummary(nextChannelType);
    },
  );

  onMounted(() => {
    if (!isChannelsRouteActive.value) return;
    void refreshSummary(selectedChannelType.value);
  });

  onActivated(() => {
    if (!isChannelsRouteActive.value) return;
    void refreshSummary(selectedChannelType.value);
  });

  return state;
}

export function useChannelsWorkspace(): ChannelsWorkspaceState {
  const state = inject<ChannelsWorkspaceState>(ChannelsWorkspaceKey);
  if (!state) {
    throw new Error('Channels workspace is not available');
  }
  return state;
}
