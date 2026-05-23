<template>
  <section class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Sessions</p>
        <h2 class="page-title">Session Management</h2>
      </div>
    </header>

    <section class="sessions-summary-strip" aria-label="Session summary">
      <div v-for="item in summaryItems" :key="item.label" class="sessions-summary-item">
        <span>{{ item.eyebrow }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.label }} · {{ item.note }}</p>
      </div>
    </section>

    <section class="sessions-list-section">
      <div class="panel-head">
        <h3>会话列表</h3>
      </div>
      <div class="table-card table-card-inner">
        <table class="data-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>Agent</th>
              <th>更新时间</th>
              <th>Token</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="session in sessions" :key="session.title">
              <td><strong>{{ session.title }}</strong></td>
              <td>{{ session.agent }}</td>
              <td>{{ session.updatedAt }}</td>
              <td>{{ session.tokens }}</td>
              <td>{{ session.state }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { sessions } from '../data/mock';

const summaryItems = [
  { eyebrow: 'TOTAL', value: '4', label: '会话总数', note: 'mock session list' },
  { eyebrow: 'ACTIVE', value: '2', label: '最近更新', note: 'today' },
  { eyebrow: 'TOKENS', value: '41k', label: 'Token 汇总', note: 'estimated' },
];
</script>

<style scoped>
.sessions-summary-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-base) 44%, transparent);
}

.sessions-summary-item {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 16px 18px;
  border-right: 1px solid var(--border-subtle);
}

.sessions-summary-item:last-child {
  border-right: 0;
}

.sessions-summary-item span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.12em;
}

.sessions-summary-item strong {
  color: var(--text);
  font-size: 24px;
  line-height: 1;
}

.sessions-summary-item p {
  margin: 0;
  color: var(--text-soft);
  font-size: 12px;
}

.sessions-list-section {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-base) 44%, transparent);
}

@media (max-width: 760px) {
  .sessions-summary-strip {
    grid-template-columns: 1fr;
  }

  .sessions-summary-item {
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .sessions-summary-item:last-child {
    border-bottom: 0;
  }
}
</style>
