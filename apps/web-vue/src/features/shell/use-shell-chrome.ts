import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'openclaw-studio.sidebar-collapsed';

export function useShellChrome(contextPanelEnabled: Ref<boolean>) {
  const sidebarCollapsed = ref(true);
  const isMobile = ref(false);
  const mobileSidebarOpen = ref(false);
  const contextPanelOpen = ref(false);

  const canOpenContextPanel = computed(() => contextPanelEnabled.value);

  const updateViewportState = () => {
    if (typeof window === 'undefined') return;
    const mobile = window.innerWidth <= 920;
    isMobile.value = mobile;
    if (!mobile) mobileSidebarOpen.value = false;
  };

  const syncSidebarPreference = () => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    sidebarCollapsed.value = saved === null ? true : saved === 'true';
  };

  const persistSidebarPreference = (value: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
  };

  const toggleSidebar = () => {
    if (isMobile.value) {
      mobileSidebarOpen.value = !mobileSidebarOpen.value;
      return;
    }
    sidebarCollapsed.value = !sidebarCollapsed.value;
  };

  const handleSidebarNavigate = () => {
    if (isMobile.value) mobileSidebarOpen.value = false;
  };

  const openContextPanel = () => {
    if (!canOpenContextPanel.value) return;
    contextPanelOpen.value = true;
  };

  const closeContextPanel = () => {
    contextPanelOpen.value = false;
  };

  const toggleContextPanel = () => {
    if (!canOpenContextPanel.value) {
      contextPanelOpen.value = false;
      return;
    }
    contextPanelOpen.value = !contextPanelOpen.value;
  };

  onMounted(() => {
    updateViewportState();
    syncSidebarPreference();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateViewportState, { passive: true });
    }
  });

  watch(sidebarCollapsed, (value) => {
    if (isMobile.value) return;
    persistSidebarPreference(value);
  });

  watch(contextPanelEnabled, (enabled) => {
    if (!enabled) {
      contextPanelOpen.value = false;
    }
  }, { immediate: true });

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateViewportState);
    }
  });

  return {
    sidebarCollapsed,
    isMobile,
    mobileSidebarOpen,
    contextPanelOpen,
    canOpenContextPanel,
    toggleSidebar,
    handleSidebarNavigate,
    openContextPanel,
    closeContextPanel,
    toggleContextPanel,
  };
}
