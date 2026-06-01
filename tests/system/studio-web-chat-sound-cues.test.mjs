import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const soundPreferences = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/chat-sound-preferences.ts'),
  'utf8',
);

test('sound cues default on, persist locally, and expose a shared helper entrypoint', () => {
  assert.match(soundPreferences, /openclaw-studio\.chat\.sound-cues-enabled/);
  assert.match(soundPreferences, /DEFAULT_CHAT_SOUND_CUES_ENABLED = true/);
  assert.match(soundPreferences, /peakGain:\s*0\.16/);
  assert.match(soundPreferences, /peakGain:\s*0\.22/);
  assert.match(soundPreferences, /export function readChatSoundCuesEnabled\(\): boolean \{/);
  assert.match(soundPreferences, /if \(raw === '0'\)/);
  assert.match(soundPreferences, /if \(raw === '1'\)/);
  assert.match(soundPreferences, /return DEFAULT_CHAT_SOUND_CUES_ENABLED;/);
  assert.match(soundPreferences, /export function writeChatSoundCuesEnabled\(enabled: boolean\): void \{/);
  assert.match(soundPreferences, /export async function playChatCue\(kind: 'sent' \| 'received'\): Promise<void> \{/);
});
