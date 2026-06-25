import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../apps/web/src/features/chat/_shared.ts', import.meta.url), 'utf8');

test('legacy webchat session keys are presented as compatible Agent Chat sessions', () => {
  assert.doesNotMatch(source, /旧 Web 会话|WebChat/, 'Chat UI must not expose old WebChat wording as the primary session title');
  assert.match(source, /surface === "webchat"\) return `\$\{agent\} · Agent 会话（兼容）`/);
});
