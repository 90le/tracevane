import * as React from "react";

export interface IdeEditorPreferences {
  minimapEnabled: boolean;
}

const IDE_EDITOR_PREFERENCES_KEY = "tracevane:ide-workbench:editor-preferences:v1";

const DEFAULT_IDE_EDITOR_PREFERENCES: IdeEditorPreferences = {
  minimapEnabled: false,
};

export function useIdeEditorPreferences() {
  const [preferences, setPreferences] = React.useState<IdeEditorPreferences>(() => loadIdeEditorPreferences());

  const updatePreferences = React.useCallback((patch: Partial<IdeEditorPreferences>) => {
    setPreferences((current) => {
      const next = normalizeIdeEditorPreferences({ ...current, ...patch });
      saveIdeEditorPreferences(next);
      return next;
    });
  }, []);

  return [preferences, updatePreferences] as const;
}

function loadIdeEditorPreferences(): IdeEditorPreferences {
  if (typeof window === "undefined") return DEFAULT_IDE_EDITOR_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(IDE_EDITOR_PREFERENCES_KEY);
    if (!raw) return DEFAULT_IDE_EDITOR_PREFERENCES;
    return normalizeIdeEditorPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_IDE_EDITOR_PREFERENCES;
  }
}

function saveIdeEditorPreferences(preferences: IdeEditorPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IDE_EDITOR_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore persistence failures; editor runtime should continue with in-memory preferences.
  }
}

function normalizeIdeEditorPreferences(value: Partial<IdeEditorPreferences> | null | undefined): IdeEditorPreferences {
  return {
    minimapEnabled: value?.minimapEnabled === true,
  };
}
