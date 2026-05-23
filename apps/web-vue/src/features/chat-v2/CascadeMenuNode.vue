<template>
  <template v-for="item in items" :key="item.id">
    <template v-if="item.children?.length">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          class="cascade-menu-item"
          :class="{
            branch: true,
            danger: item.danger,
            disabled: item.disabled,
          }"
          @click="handleBranchClick(item)"
        >
          <span>{{ item.label }}</span>
          <ChevronRight class="cascade-menu__arrow" aria-hidden="true" />
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent
            class="cascade-menu"
            :collision-padding="padding"
            :side-offset="8"
            :style="{ zIndex: String(zIndex) }"
          >
            <CascadeMenuNode
              :items="item.children"
              :padding="padding"
              :z-index="zIndex"
              @select="emit('select', $event)"
            />
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </template>
    <DropdownMenuItem
      v-else
      class="cascade-menu-item"
      :class="{
        danger: item.danger,
      }"
      :disabled="item.disabled"
      @select="handleLeafSelect(item)"
    >
      <span>{{ item.label }}</span>
    </DropdownMenuItem>
  </template>
</template>

<script setup lang="ts">
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from 'reka-ui';
import { ChevronRight } from '@lucide/vue';
import type { CascadeMenuItem } from './cascade-menu.types';

defineOptions({
  name: 'CascadeMenuNode',
});

const props = defineProps<{
  items: CascadeMenuItem[];
  padding: number;
  zIndex: number;
}>();

const emit = defineEmits<{
  (event: 'select', itemId: string): void;
}>();

function handleLeafSelect(item: CascadeMenuItem): void {
  if (item.disabled) {
    return;
  }
  emit('select', item.id);
}

function handleBranchClick(item: CascadeMenuItem): void {
  if (item.submenuOnly || item.disabled) {
    return;
  }
  emit('select', item.id);
}
</script>
