export function isSelectedChatSessionRealtimeReady(params: {
  selectedSessionKey: string | null | undefined;
  connected: boolean;
  activeRealtimeSessionKey: string | null | undefined;
}): boolean {
  if (!params.connected) {
    return false;
  }
  const sessionKey = String(params.selectedSessionKey || '').trim();
  if (!sessionKey) {
    return false;
  }
  return String(params.activeRealtimeSessionKey || '').trim() === sessionKey;
}
