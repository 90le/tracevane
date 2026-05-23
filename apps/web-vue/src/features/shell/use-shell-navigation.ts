import { computed } from "vue";
import { useLocalePreference } from "../../shared/locale";
import { shellNavGroups } from "./route-manifest";

export function useShellNavigation() {
  const { text } = useLocalePreference();

  const navGroups = computed(() =>
    shellNavGroups.map((group) => ({
      title: text(group.titleZh, group.titleEn),
      items: group.items
        .filter((item) => !item.future)
        .map((item) => ({
          to: item.to,
          icon: item.icon,
          label: text(item.labelZh, item.labelEn),
        })),
    })),
  );

  return {
    navGroups,
  };
}
