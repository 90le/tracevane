import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type {
  ChatHistorySearchContentFilter,
  ChatHistorySearchMatch,
  ChatHistorySearchPayload,
  ChatHistorySearchRoleFilter,
} from '../../../../../types/chat';

export interface ChatRecordBrowserMatchGroup {
  day: string | null;
  matches: ChatHistorySearchMatch[];
}

export interface ChatRecordBrowserState {
  open: Ref<boolean>;
  query: Ref<string>;
  roleFilter: Ref<ChatHistorySearchRoleFilter>;
  contentFilter: Ref<ChatHistorySearchContentFilter>;
  selectedDay: Ref<string | null>;
  selectedResultMessageId: Ref<string | null>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  payload: Ref<ChatHistorySearchPayload | null>;
  results: ComputedRef<ChatHistorySearchMatch[]>;
  groupedMatches: ComputedRef<ChatRecordBrowserMatchGroup[]>;
  matchCount: ComputedRef<number>;
  hasActiveFilters: ComputedRef<boolean>;
  selectedResult: ComputedRef<ChatHistorySearchMatch | null>;
  reset: () => void;
  clearResults: () => void;
  setPayload: (payload: ChatHistorySearchPayload | null) => void;
  selectResult: (messageId: string | null) => void;
}

export function normalizeChatRecordBrowserQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function groupSearchMatchesByDay(matches: ChatHistorySearchMatch[]): ChatRecordBrowserMatchGroup[] {
  const groups = new Map<string | null, ChatHistorySearchMatch[]>();
  for (const match of matches) {
    const key = match.day || null;
    const existing = groups.get(key);
    if (existing) {
      existing.push(match);
    } else {
      groups.set(key, [match]);
    }
  }

  return [...groups.entries()].map(([day, groupedMatches]) => ({
    day,
    matches: groupedMatches,
  }));
}

function resolveSelectedResultMessageId(
  payload: ChatHistorySearchPayload | null,
  nextSelectedResultMessageId: string | null,
): string | null {
  const matches = payload?.matches || [];
  if (!matches.length) {
    return null;
  }
  if (nextSelectedResultMessageId && matches.some((match) => match.messageId === nextSelectedResultMessageId)) {
    return nextSelectedResultMessageId;
  }
  return matches[0]?.messageId || null;
}

export function useChatRecordBrowserState(): ChatRecordBrowserState {
  const open = ref(false);
  const query = ref('');
  const roleFilter = ref<ChatHistorySearchRoleFilter>('all');
  const contentFilter = ref<ChatHistorySearchContentFilter>('all');
  const selectedDay = ref<string | null>(null);
  const selectedResultMessageId = ref<string | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');
  const payload = ref<ChatHistorySearchPayload | null>(null);

  const results = computed(() => payload.value?.matches || []);
  const groupedMatches = computed(() => groupSearchMatchesByDay(results.value));
  const matchCount = computed(() => results.value.length);
  const hasActiveFilters = computed(() => Boolean(
    normalizeChatRecordBrowserQuery(query.value)
    || roleFilter.value !== 'all'
    || contentFilter.value !== 'all'
    || selectedDay.value,
  ));
  const selectedResult = computed(() => (
    results.value.find((match) => match.messageId === selectedResultMessageId.value)
    || results.value[0]
    || null
  ));

  function setPayload(nextPayload: ChatHistorySearchPayload | null): void {
    payload.value = nextPayload;
    selectedResultMessageId.value = resolveSelectedResultMessageId(nextPayload, selectedResultMessageId.value);
  }

  function selectResult(messageId: string | null): void {
    selectedResultMessageId.value = messageId;
  }

  function clearResults(): void {
    loading.value = false;
    errorMessage.value = '';
    payload.value = null;
    selectedResultMessageId.value = null;
  }

  function reset(): void {
    open.value = false;
    query.value = '';
    roleFilter.value = 'all';
    contentFilter.value = 'all';
    selectedDay.value = null;
    clearResults();
  }

  return {
    open,
    query,
    roleFilter,
    contentFilter,
    selectedDay,
    selectedResultMessageId,
    loading,
    errorMessage,
    payload,
    results,
    groupedMatches,
    matchCount,
    hasActiveFilters,
    selectedResult,
    reset,
    clearResults,
    setPayload,
    selectResult,
  };
}
