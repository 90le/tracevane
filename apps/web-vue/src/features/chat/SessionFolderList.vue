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
        <MoreHorizontal class="chat-shell-session-more-icon" aria-hidden="true" />
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
        <MoreHorizontal class="chat-shell-session-more-icon" aria-hidden="true" />
      </button>
    </article>
  </div>
</template>

<script setup lang="ts">
import { MoreHorizontal } from '@lucide/vue';
import type { ChatBuiltInOrganizerEntry } from '../../../../../lib/chat-session-organizer';
import type { ChatSessionFolder } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import './session-list-shared.css';

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
