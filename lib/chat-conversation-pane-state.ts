export function shouldShowInitialConversationLoading(params: {
  selectedSession: boolean;
  historyLoadingInitial: boolean;
  timelineItemCount: number;
}): boolean {
  if (!params.selectedSession) {
    return false;
  }
  if (!params.historyLoadingInitial) {
    return false;
  }
  return params.timelineItemCount === 0;
}
