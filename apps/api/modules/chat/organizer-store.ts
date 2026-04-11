import path from 'node:path';
import type { StudioServerConfig } from '../../../../types/api.js';
import type { ChatSessionOrganizerState } from '../../../../types/chat.js';
import { createEmptyChatSessionOrganizerState, normalizeChatSessionOrganizerState } from '../../../../lib/chat-session-organizer.js';
import { ensureDir, readJsonFile, writeJsonFile } from '../../core/state.js';

export function resolveStudioChatOrganizerPath(config: StudioServerConfig): string {
  return path.join(config.openclawRoot, 'studio', 'chat-organizer.json');
}

export function readStudioChatOrganizerState(config: StudioServerConfig): ChatSessionOrganizerState {
  return normalizeChatSessionOrganizerState(
    readJsonFile<ChatSessionOrganizerState>(resolveStudioChatOrganizerPath(config), createEmptyChatSessionOrganizerState()),
  );
}

export function writeStudioChatOrganizerState(config: StudioServerConfig, value: ChatSessionOrganizerState): void {
  const file = resolveStudioChatOrganizerPath(config);
  ensureDir(path.dirname(file));
  writeJsonFile(file, normalizeChatSessionOrganizerState(value));
}

export function createStudioChatOrganizerStore(config: StudioServerConfig) {
  return {
    read(): ChatSessionOrganizerState {
      return readStudioChatOrganizerState(config);
    },

    write(value: ChatSessionOrganizerState): ChatSessionOrganizerState {
      const normalized = normalizeChatSessionOrganizerState(value);
      writeStudioChatOrganizerState(config, normalized);
      return normalized;
    },
  };
}
