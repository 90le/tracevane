<template>
  <section class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Sessions</p>
        <h2 class="page-title">Session Management</h2>
      </div>
    </header>

    <section class="stats-grid agents-summary-grid">
      <MetricCard eyebrow="TOTAL" value="4" label="会话总数" note="mock session list" />
      <MetricCard eyebrow="ACTIVE" value="2" label="最近更新" note="today" />
      <MetricCard eyebrow="TOKENS" value="41k" label="Token 汇总" note="estimated" />
    </section>

    <section class="panel-card">
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
import MetricCard from '../components/MetricCard.vue';
import { sessions } from '../data/mock';
</script>
