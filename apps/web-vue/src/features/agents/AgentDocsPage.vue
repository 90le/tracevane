<template>
  <section v-if="agentId" class="agents-stage-view">
    <div class="agents-stage-task-head operate-stage-task-head">
      <div>
        <p class="eyebrow">{{ agentId }}</p>
        <h3>{{ text('人设文档', 'Persona docs') }}</h3>
        <p>{{ text('维护身份、灵魂、协作、工具、心跳和记忆文档，不再和路由或运行配置混排。', 'Maintain identity, soul, collaboration, tools, heartbeat, and memory docs without mixing them with routing or runtime settings.') }}</p>
      </div>

      <div class="page-actions">
        <button type="button" class="primary-button" :disabled="docBusy || docLoading" @click="saveCurrentDoc">
          {{ docBusy ? text('保存中...', 'Saving...') : text('保存', 'Save') }}
        </button>
      </div>
    </div>

    <div v-if="noticeMessage" class="status-banner">
      {{ noticeMessage }}
    </div>
    <div v-if="errorMessage" class="status-banner status-banner-error">
      {{ errorMessage }}
    </div>

    <div class="agents-docs-layout">
      <nav class="agents-docs-nav">
        <button
          v-for="doc in visibleDocs"
          :key="doc.name"
          type="button"
          class="agents-doc-nav-item"
          :class="{ active: doc.name === selectedDocName }"
          @click="selectedDocName = doc.name"
        >
          <strong>{{ doc.title }}</strong>
          <span>{{ doc.description }}</span>
        </button>
      </nav>

      <article class="agents-stage-panel">
        <div class="agents-section-head">
          <div>
            <h3>{{ activeDoc?.title || selectedDocName }}</h3>
            <p>{{ activeDoc?.description || textDocDescription(selectedDocName) }}</p>
          </div>
          <span class="eyebrow">{{ activeDoc?.path || selectedDocName }}</span>
        </div>

        <div v-if="activeDocFacts.length" class="agents-summary-strip">
          <span v-for="fact in activeDocFacts" :key="fact" class="agents-summary-pill">{{ fact }}</span>
        </div>

        <div v-if="docLoading" class="empty-inline">{{ text('正在读取文档…', 'Loading document...') }}</div>
        <textarea
          v-else
          v-model="docContent"
          class="form-textarea"
          rows="26"
          :placeholder="text('在这里编辑当前 Agent 的人设文档内容。', 'Edit the current agent persona document here.')"
        />
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { AgentDocName, AgentDocumentSummary } from '../../../../../types/agents';
import { useLocalePreference } from '../../shared/locale';
import { fetchAgentDetail, fetchAgentDocument, saveAgentDocument } from './api';

defineOptions({ name: 'AgentDocsPage' });

const route = useRoute();
const { text } = useLocalePreference();

const agentId = computed(() => String(route.params.agentId || ''));
const selectedDocName = ref<AgentDocName>('IDENTITY.md');
const docs = ref<AgentDocumentSummary[]>([]);
const docContent = ref('');
const docLoading = ref(false);
const docBusy = ref(false);
const lastLoadedDocContent = ref('');
const errorMessage = ref('');
const noticeMessage = ref('');

function textDocTitle(docName: AgentDocName): string {
  const map: Record<AgentDocName, [string, string]> = {
    'IDENTITY.md': ['身份', 'Identity'],
    'SOUL.md': ['灵魂', 'Soul'],
    'AGENTS.md': ['协作', 'Agents'],
    'USER.md': ['用户', 'User'],
    'TOOLS.md': ['工具', 'Tools'],
    'HEARTBEAT.md': ['心跳', 'Heartbeat'],
    'MEMORY.md': ['记忆', 'Memory'],
  };
  return text(...map[docName]);
}

function textDocDescription(docName: AgentDocName): string {
  const map: Record<AgentDocName, [string, string]> = {
    'IDENTITY.md': ['定义名称、角色和使命。', 'Defines the name, role, and mission.'],
    'SOUL.md': ['定义核心人格和长期行为准则。', 'Defines the core personality and long-term behavior.'],
    'AGENTS.md': ['定义多 Agent 协作和分工规则。', 'Defines multi-agent collaboration and delegation.'],
    'USER.md': ['定义用户画像、偏好和交互边界。', 'Defines user profile, preferences, and interaction boundaries.'],
    'TOOLS.md': ['定义工具使用偏好和限制。', 'Defines tool preferences and limits.'],
    'HEARTBEAT.md': ['定义心跳运行时该做什么。', 'Defines heartbeat behavior.'],
    'MEMORY.md': ['保存长期记忆和跨会话线索。', 'Stores long-lived memory across sessions.'],
  };
  return text(...map[docName]);
}

const fallbackDocs = computed<AgentDocumentSummary[]>(() => {
  const names: AgentDocName[] = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'MEMORY.md'];
  return names.map((name) => ({
    name,
    title: textDocTitle(name),
    description: textDocDescription(name),
    path: name,
    exists: false,
    size: 0,
    updatedAt: null,
  }));
});

const visibleDocs = computed<AgentDocumentSummary[]>(() => {
  const source = docs.value.length ? docs.value : fallbackDocs.value;
  return source.map((doc) => ({
    ...doc,
    title: textDocTitle(doc.name),
    description: textDocDescription(doc.name),
  }));
});
const activeDoc = computed(() => {
  return visibleDocs.value.find((doc) => doc.name === selectedDocName.value) || visibleDocs.value[0] || null;
});

const activeDocFacts = computed(() => {
  const doc = activeDoc.value;
  if (!doc) return [] as string[];
  return [
    doc.exists ? text('已存在', 'Exists') : text('尚未创建', 'Not created'),
    doc.size ? text(`${doc.size} bytes`, `${doc.size} bytes`) : text('大小未记录', 'Size unknown'),
    doc.updatedAt ? text(`更新于 ${new Date(doc.updatedAt).toLocaleString()}`, `Updated ${new Date(doc.updatedAt).toLocaleString()}`) : text('暂无更新时间', 'No update time yet'),
  ];
});

async function loadDocList(): Promise<void> {
  if (!agentId.value) return;
  const payload = await fetchAgentDetail(agentId.value);
  docs.value = payload.docs;
  if (payload.docs.length && !payload.docs.some((doc) => doc.name === selectedDocName.value)) {
    selectedDocName.value = payload.docs[0].name;
  }
}

async function loadCurrentDoc(): Promise<void> {
  if (!agentId.value) return;
  docLoading.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const payload = await fetchAgentDocument(agentId.value, selectedDocName.value);
    docContent.value = payload.content;
    lastLoadedDocContent.value = payload.content;
    const existingIndex = docs.value.findIndex((doc) => doc.name === payload.doc.name);
    if (existingIndex >= 0) {
      docs.value.splice(existingIndex, 1, payload.doc);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('读取文档失败。', 'Failed to load document.');
  } finally {
    docLoading.value = false;
  }
}

async function saveCurrentDoc(): Promise<void> {
  if (!agentId.value) return;
  docBusy.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const payload = await saveAgentDocument(agentId.value, selectedDocName.value, { content: docContent.value });
    const existingIndex = docs.value.findIndex((doc) => doc.name === payload.doc.name);
    if (existingIndex >= 0) {
      docs.value.splice(existingIndex, 1, payload.doc);
    }
    lastLoadedDocContent.value = docContent.value;
    noticeMessage.value = payload.message;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('保存文档失败。', 'Failed to save document.');
  } finally {
    docBusy.value = false;
  }
}

watch(
  () => route.params.agentId,
  async () => {
    docs.value = [];
    docContent.value = '';
    lastLoadedDocContent.value = '';
    if (!agentId.value) return;
    await loadDocList();
    await loadCurrentDoc();
  },
  { immediate: true },
);

watch(
  selectedDocName,
  async (nextDoc, previousDoc) => {
    if (!agentId.value || nextDoc === previousDoc) return;
    await loadCurrentDoc();
  },
);

onActivated(async () => {
  if (!agentId.value || docLoading.value || docBusy.value) return;
  if (docContent.value !== lastLoadedDocContent.value) return;
  await loadDocList();
  await loadCurrentDoc();
});
</script>
