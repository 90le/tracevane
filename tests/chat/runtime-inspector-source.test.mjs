import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('apps/web/src/features/chat/views/RuntimeInspectorView.tsx', 'utf-8');

test('RuntimeInspectorView describes the selected Agent runtime target instead of raw OpenClaw control labels', () => {
  assert.match(source, /<SectionLabel>运行目标<\/SectionLabel>/);
  assert.match(source, /runtimeAgentLabel\(session\)/);
  assert.match(source, /sessionSourceLabel\(session\)/);
  assert.match(source, /<Fact label="模型">/);
  assert.match(source, /<Fact label="目录">/);
  assert.match(source, /<Fact label="权限">/);
  assert.match(source, /<Fact label="可发送">/);
  assert.match(source, /<Fact label="事件连接">/);
  assert.doesNotMatch(source, /<Fact label="代理">/);
  assert.doesNotMatch(source, /<Fact label="网关">/);
});

test('RuntimeInspectorView keeps destructive reset confirmed and does not expose a generic control tab', () => {
  assert.match(source, /DialogTitle>重置会话<\/DialogTitle>/);
  assert.match(source, /CHAT_INSPECTOR_TABS/);
  assert.doesNotMatch(source, /label: "控制"/);
  assert.doesNotMatch(source, /host-exec/);
});
