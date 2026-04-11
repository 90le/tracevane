<template>
  <div v-if="showRootFolders && visibleFolderEntries.length" class="chat-shell-session-section chat-shell-folder-section">
    <div class="chat-shell-session-divider">
      <span>{{ text('文件夹', 'Folders') }}</span>
      <strong>{{ visibleFolderEntries.length }}</strong>
    </div>

    <article
      v-for="entry in visibleFolderEntries"
      :key="entry.id"
      class="chat-shell-folder-row"
      :class="{
        active: currentFolderId === entry.id,
        'menu-open': isUserFolder(entry) && isContextMenuOpenForFolder(entry),
        renaming: isUserFolder(entry) && isRenamingFolder(entry.id),
        system: isBuiltInArchivedEntry(entry),
      }"
      @contextmenu="isUserFolder(entry) ? $emit('open-folder-context-menu', $event, entry) : undefined"
    >
      <form
        v-if="isUserFolder(entry) && isRenamingFolder(entry.id)"
        class="chat-shell-folder-item chat-shell-folder-item--rename"
        @submit.prevent="$emit('submit-folder-rename')"
      >
        <div class="chat-shell-folder-avatar" aria-hidden="true">F</div>
        <div class="chat-shell-folder-content">
          <input
            :value="folderRenameDraft"
            class="chat-shell-session-field"
            type="text"
            :placeholder="text('输入文件夹名称', 'Enter a folder name')"
            @input="$emit('update:folder-rename-draft', ($event.target as HTMLInputElement).value)"
            @keydown.escape.prevent="$emit('cancel-folder-rename')"
          />
          <div class="chat-shell-folder-rename-form__actions">
            <button
              type="submit"
              class="secondary-button compact-button"
              :disabled="!folderRenameDraft.trim()"
            >
              {{ text('保存', 'Save') }}
            </button>
            <button type="button" class="chat-shell-link-button" @click="$emit('cancel-folder-rename')">
              {{ text('取消', 'Cancel') }}
            </button>
          </div>
        </div>
      </form>

      <button
        v-else
        type="button"
        class="chat-shell-folder-item"
        :class="{ system: isBuiltInArchivedEntry(entry) }"
        @click="$emit('enter-folder', entry.id)"
      >
        <div class="chat-shell-folder-avatar" :class="{ system: isBuiltInArchivedEntry(entry) }" aria-hidden="true">
          {{ isBuiltInArchivedEntry(entry) ? 'A' : 'F' }}
        </div>
        <div class="chat-shell-folder-content">
          <div class="chat-shell-folder-topline">
            <strong>{{ folderTitle(entry) }}</strong>
            <time>{{ formatDate(entry.updatedAt) }}</time>
          </div>
          <div class="chat-shell-folder-subline">
            <span class="chat-shell-folder-count">
              {{ text(`${folderSessionCount(entry.id)} 个会话`, `${folderSessionCount(entry.id)} chats`) }}
            </span>
            <span class="chat-shell-folder-tag" :class="{ system: isBuiltInArchivedEntry(entry) }">
              {{
                isBuiltInArchivedEntry(entry)
                  ? text('系统', 'System')
                  : folderChildCount(entry.id) > 0
                    ? text(`${folderChildCount(entry.id)} 个子文件夹`, `${folderChildCount(entry.id)} subfolders`)
                    : text('文件夹', 'Folder')
              }}
            </span>
          </div>
        </div>
      </button>

      <button
        v-if="isUserFolder(entry)"
        type="button"
        class="chat-shell-session-more"
        :class="{ active: isContextMenuOpenForFolder(entry) }"
        :title="text('文件夹操作', 'Folder actions')"
        @click="$emit('toggle-folder-menu', $event, entry)"
      >
        ⋯
      </button>
    </article>
  </div>

  <div v-if="showChildFolders && visibleChildFolders.length" class="chat-shell-session-section chat-shell-folder-section">
    <div class="chat-shell-session-divider">
      <span>{{ text('子文件夹', 'Subfolders') }}</span>
      <strong>{{ visibleChildFolders.length }}</strong>
    </div>

    <article
      v-for="folder in visibleChildFolders"
      :key="folder.id"
      class="chat-shell-folder-row"
      :class="{ active: currentFolderId === folder.id, 'menu-open': isContextMenuOpenForFolder(folder), renaming: isRenamingFolder(folder.id) }"
      @contextmenu="$emit('open-folder-context-menu', $event, folder)"
    >
      <form
        v-if="isRenamingFolder(folder.id)"
        class="chat-shell-folder-item chat-shell-folder-item--rename"
        @submit.prevent="$emit('submit-folder-rename')"
      >
        <div class="chat-shell-folder-avatar" aria-hidden="true">F</div>
        <div class="chat-shell-folder-content">
          <input
            :value="folderRenameDraft"
            class="chat-shell-session-field"
            type="text"
            :placeholder="text('输入文件夹名称', 'Enter a folder name')"
            @input="$emit('update:folder-rename-draft', ($event.target as HTMLInputElement).value)"
            @keydown.escape.prevent="$emit('cancel-folder-rename')"
          />
          <div class="chat-shell-folder-rename-form__actions">
            <button
              type="submit"
              class="secondary-button compact-button"
              :disabled="!folderRenameDraft.trim()"
            >
              {{ text('保存', 'Save') }}
            </button>
            <button type="button" class="chat-shell-link-button" @click="$emit('cancel-folder-rename')">
              {{ text('取消', 'Cancel') }}
            </button>
          </div>
        </div>
      </form>

      <button
        v-else
        type="button"
        class="chat-shell-folder-item"
        @click="$emit('enter-folder', folder.id)"
      >
        <div class="chat-shell-folder-avatar" aria-hidden="true">F</div>
        <div class="chat-shell-folder-content">
          <div class="chat-shell-folder-topline">
            <strong>{{ folder.title }}</strong>
            <time>{{ formatDate(folder.updatedAt) }}</time>
          </div>
          <div class="chat-shell-folder-subline">
            <span class="chat-shell-folder-count">
              {{ text(`${folderSessionCount(folder.id)} 个会话`, `${folderSessionCount(folder.id)} chats`) }}
            </span>
            <span class="chat-shell-folder-tag">
              {{
                folderChildCount(folder.id) > 0
                  ? text(`${folderChildCount(folder.id)} 个子文件夹`, `${folderChildCount(folder.id)} subfolders`)
                  : text('子文件夹', 'Nested')
              }}
            </span>
          </div>
        </div>
      </button>

      <button
        type="button"
        class="chat-shell-session-more"
        :class="{ active: isContextMenuOpenForFolder(folder) }"
        :title="text('文件夹操作', 'Folder actions')"
        @click="$emit('toggle-folder-menu', $event, folder)"
      >
        ⋯
      </button>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { ChatBuiltInOrganizerEntry } from '../../../../../lib/chat-session-organizer';
import type { ChatSessionFolder } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';

type OrganizerEntry = ChatSessionFolder | ChatBuiltInOrganizerEntry;

defineProps<{
  showRootFolders: boolean;
  showChildFolders: boolean;
  visibleFolderEntries: OrganizerEntry[];
  visibleChildFolders: ChatSessionFolder[];
  currentFolderId: string;
  folderRenameDraft: string;
  folderSessionCount: (folderId: string) => number;
  folderChildCount: (folderId: string) => number;
  formatDate: (value: string | null) => string;
  isBuiltInArchivedEntry: (entry: OrganizerEntry) => boolean;
  isUserFolder: (entry: OrganizerEntry) => boolean;
  isContextMenuOpenForFolder: (folder: ChatSessionFolder) => boolean;
  isRenamingFolder: (folderId: string) => boolean;
  folderTitle: (entry: OrganizerEntry) => string;
}>();

defineEmits<{
  (event: 'enter-folder', folderId: string): void;
  (event: 'open-folder-context-menu', mouseEvent: MouseEvent, folder: ChatSessionFolder): void;
  (event: 'toggle-folder-menu', mouseEvent: MouseEvent, folder: ChatSessionFolder): void;
  (event: 'update:folder-rename-draft', value: string): void;
  (event: 'cancel-folder-rename'): void;
  (event: 'submit-folder-rename'): void;
}>();

const { text } = useLocalePreference();
</script>

<style scoped>
.chat-shell-session-section {
  display: grid;
  gap: 8px;
}

.chat-shell-folder-row {
  position: relative;
  border: 1px solid transparent;
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-sidebar-row) 96%, transparent 4%), color-mix(in srgb, var(--chat-sidebar-row) 90%, transparent 10%)),
    radial-gradient(circle at right top, color-mix(in srgb, var(--chat-accent) 10%, transparent), transparent 54%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.chat-shell-folder-row:hover {
  background: var(--chat-sidebar-row-hover);
  border-color: var(--chat-line);
  transform: translateY(-1px);
}

.chat-shell-folder-row.active,
.chat-shell-folder-row.menu-open,
.chat-shell-folder-row.renaming {
  background: var(--chat-sidebar-row-active);
  border-color: color-mix(in srgb, var(--chat-accent) 18%, var(--chat-line));
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1), inset 0 0 0 1px color-mix(in srgb, var(--chat-accent) 12%, transparent);
}

.chat-shell-folder-row.system {
  background: color-mix(in srgb, var(--chat-sidebar-row) 86%, var(--chat-accent) 14%);
  border-color: color-mix(in srgb, var(--chat-accent) 18%, transparent 82%);
}

.chat-shell-folder-item {
  width: calc(100% - 52px);
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px 10px 12px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.chat-shell-folder-item.system,
.chat-shell-folder-item--rename {
  width: 100%;
}

.chat-shell-folder-item--rename {
  cursor: default;
}

.chat-shell-folder-item--rename .chat-shell-folder-content {
  gap: 8px;
}

.chat-shell-folder-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--chat-line-strong) 58%, transparent 42%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-accent) 18%, var(--chat-avatar-bg) 82%), color-mix(in srgb, var(--chat-accent) 10%, var(--chat-avatar-bg) 90%));
  color: var(--chat-avatar-text);
  font-weight: 700;
  font-size: 13px;
}

.chat-shell-folder-avatar.system {
  border-color: color-mix(in srgb, #c2410c 22%, var(--chat-line));
  background: linear-gradient(180deg, color-mix(in srgb, #c2410c 16%, var(--chat-avatar-bg) 84%), color-mix(in srgb, #c2410c 10%, var(--chat-avatar-bg) 90%));
  color: #c2410c;
}

.chat-shell-folder-content {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.chat-shell-folder-topline,
.chat-shell-folder-subline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.chat-shell-folder-subline {
  flex-wrap: wrap;
  row-gap: 6px;
}

.chat-shell-folder-topline strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--chat-text);
  font-size: 13.5px;
  letter-spacing: 0.01em;
}

.chat-shell-folder-topline time,
.chat-shell-folder-subline {
  color: var(--chat-text-soft);
  font-size: 11px;
}

.chat-shell-folder-topline time {
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0.92;
}

.chat-shell-folder-count {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.45;
  max-width: min(14rem, 100%);
}

.chat-shell-folder-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  max-width: min(12rem, 100%);
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--chat-accent) 18%, var(--chat-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-hover) 74%, var(--chat-sidebar-row));
  color: color-mix(in srgb, var(--chat-text) 72%, var(--chat-text-soft));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-shell-folder-tag.system {
  border-color: color-mix(in srgb, #c2410c 24%, var(--chat-line));
  background: color-mix(in srgb, #c2410c 10%, var(--chat-hover) 90%);
  color: #c2410c;
}

@media (max-width: 1040px) {
  .chat-shell-folder-row {
    backdrop-filter: none;
  }
}
</style>
