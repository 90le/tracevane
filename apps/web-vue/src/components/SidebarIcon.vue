<template>
  <component
    :is="Icon"
    class="sidebar-svg-icon"
    :size="17"
    :stroke-width="1.8"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Bot,
  CalendarClock,
  Compass,
  FileText,
  Folder,
  Gauge,
  LayoutDashboard,
  MessageSquareText,
  PlugZap,
  RadioTower,
  SlidersHorizontal,
  TerminalSquare,
  Users,
} from "@lucide/vue";

const props = defineProps<{
  name:
    | "dashboard"
    | "agents"
    | "chat"
    | "channels"
    | "channel-connectors"
    | "gateway"
    | "cron"
    | "skills"
    | "files"
    | "terminal"
    | "config"
    | "system";
}>();

const iconByName = {
  dashboard: LayoutDashboard,
  agents: Users,
  chat: MessageSquareText,
  channels: Bot,
  "channel-connectors": RadioTower,
  gateway: PlugZap,
  cron: CalendarClock,
  skills: Compass,
  files: Folder,
  terminal: TerminalSquare,
  config: SlidersHorizontal,
  system: Gauge,
} as const;

const Icon = computed(() => iconByName[props.name] ?? FileText);
</script>
