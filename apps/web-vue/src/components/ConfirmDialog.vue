<template>
  <Teleport to="body">
    <div
      v-if="activeConfirmDialog"
      class="confirm-dialog-mask"
      role="presentation"
      @click="onMaskClick"
    >
      <section
        class="confirm-dialog__surface"
        :class="{
          'confirm-dialog is-danger': activeConfirmDialog.tone === 'danger',
          'confirm-dialog is-safe': activeConfirmDialog.tone === 'safe',
        }"
        role="alertdialog"
        aria-modal="true"
        :aria-label="activeConfirmDialog.title"
        @click.stop
      >
        <header class="confirm-dialog__head">
          <h3>{{ activeConfirmDialog.title }}</h3>
          <p v-if="activeConfirmDialog.message">{{ activeConfirmDialog.message }}</p>
        </header>
        <footer class="confirm-dialog__actions">
          <button
            type="button"
            class="secondary-button"
            @click="confirmCancel"
          >
            {{ activeConfirmDialog.cancelText }}
          </button>
          <button
            type="button"
            class="primary-button"
            :class="{
              'is-danger': activeConfirmDialog.tone === 'danger',
              'is-safe': activeConfirmDialog.tone === 'safe',
            }"
            @click="confirmAccept"
          >
            {{ activeConfirmDialog.confirmText }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import {
  activeConfirmDialog,
  confirmAccept,
  confirmCancel,
} from '../composables/useConfirmDialog';

function onMaskClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    confirmCancel();
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeConfirmDialog.value) {
    event.preventDefault();
    confirmCancel();
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeydown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeydown);
  }
  if (activeConfirmDialog.value) {
    confirmCancel();
  }
});
</script>
