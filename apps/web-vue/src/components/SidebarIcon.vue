<template>
  <svg
    class="sidebar-svg-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.8"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <template v-if="name === 'dashboard'">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </template>
    <template v-else-if="name === 'agents'">
      <path d="M8.4 10.9a2.6 2.6 0 1 0 0-5.2a2.6 2.6 0 0 0 0 5.2Z" />
      <path d="M15.9 10a2.1 2.1 0 1 0 0-4.2a2.1 2.1 0 0 0 0 4.2Z" />
      <path d="M4.7 18.4c.7-2.1 2.2-3.2 4.4-3.2c2.2 0 3.7 1.1 4.4 3.2" />
      <path d="M13.6 17.8c.5-1.5 1.6-2.3 3.3-2.3c1.4 0 2.4.6 3 1.8" />
    </template>
    <template v-else-if="name === 'channels'">
      <path d="M4 7.5c0-1.4 1.1-2.5 2.5-2.5h11c1.4 0 2.5 1.1 2.5 2.5v6c0 1.4-1.1 2.5-2.5 2.5H11l-3.8 3v-3H6.5C5.1 16 4 14.9 4 13.5v-6Z" />
      <path d="M8 9.5h8" />
      <path d="M8 12.5h5" />
    </template>
    <template v-else-if="name === 'chat'">
      <path d="M4 6.8c0-1.5 1.2-2.8 2.8-2.8h10.4c1.5 0 2.8 1.2 2.8 2.8v7.1c0 1.5-1.2 2.8-2.8 2.8H10l-4 3v-3H6.8C5.2 16.7 4 15.4 4 13.9V6.8Z" />
      <path d="M7.8 8.8h8.4" />
      <path d="M7.8 11.8h6.2" />
    </template>
    <template v-else-if="name === 'cron'">
      <circle cx="12" cy="12" r="7.2" />
      <path d="M12 8.4v4.1l2.8 1.8" />
      <path d="M9 3.8h6" />
    </template>
    <template v-else-if="name === 'dreaming'">
      <path d="M15.8 4.8a6.8 6.8 0 1 0 3.4 12.7A7.9 7.9 0 0 1 15.8 4.8Z" />
      <path d="M7.2 6.1l.6 1.4l1.5.2l-1.1 1l.3 1.5l-1.3-.7l-1.3.7l.3-1.5l-1.1-1l1.5-.2l.6-1.4Z" />
    </template>
    <template v-else-if="name === 'skills'">
      <path d="M10.2 4.5h3.6v3.1h3.1v3.6h-3.1v3.1h-3.6v-3.1H7.1V7.6h3.1V4.5Z" />
      <path d="M6.2 14.2l-1.7 1.7" />
      <path d="M17.8 14.2l1.7 1.7" />
      <path d="M6.2 9.8L4.5 8.1" />
      <path d="M17.8 9.8l1.7-1.7" />
    </template>
    <template v-else-if="name === 'terminal'">
      <rect x="3.8" y="5" width="16.4" height="14" rx="2" />
      <path d="M7.4 10.2l2.5 2.3l-2.5 2.3" />
      <path d="M12.7 15.2h3.9" />
    </template>
    <template v-else-if="name === 'config'">
      <path d="M6 7h12" />
      <path d="M6 12h12" />
      <path d="M6 17h12" />
      <circle cx="9" cy="7" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="17" r="1.8" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'system'">
      <path d="M12 4.2v3" />
      <path d="M12 16.8v3" />
      <path d="M4.2 12h3" />
      <path d="M16.8 12h3" />
      <path d="M6.9 6.9l2.1 2.1" />
      <path d="M15 15l2.1 2.1" />
      <path d="M17.1 6.9L15 9" />
      <path d="M9 15l-2.1 2.1" />
      <circle cx="12" cy="12" r="3.1" />
    </template>
  </svg>
</template>

<script setup lang="ts">
defineProps<{
  name: 'dashboard' | 'agents' | 'chat' | 'channels' | 'cron' | 'dreaming' | 'skills' | 'terminal' | 'config' | 'system';
}>();
</script>
