/**
 * Settings domain types.
 *
 * Backend persistence lands later (initiative: settings-backend). For now
 * the settings store is FE-only via ``localStorage``, so the shapes here
 * are the single source of truth for the UI.
 */

/** Fixed resident identity; model provider selection lives in AI Models. */
export type HarnessProviderId = 'pydantic-ai-native';

export interface ProvidersSettings {
  /** Active harness routing. Default ``pydantic-ai-native``. */
  defaultProviderId: HarnessProviderId;
}

export interface AppearanceSettings {
  /** Reserved — theme already lives in ThemeContext, mirrored here for the
   *  settings UI; switching here updates the context too. */
  theme: 'light' | 'dark';
  /**
   * When true, entry detail modals open at workspace-max width (and stay
   * that size until the user restores). Toggled from the modal header or
   * Appearance settings.
   */
  entryDialogExpanded: boolean;
  /** Device-local choice shared by entry detail panels; omitted until chosen. */
  entryDetailsPanelOpen?: boolean;
}

/** Global retrieval (search) mode applied to every search surface. */
export type RetrievalModeSetting = 'graph' | 'semantic' | 'hybrid';

export interface RetrievalSettings {
  mode: RetrievalModeSetting;
}

export interface SettingsSnapshot {
  providers: ProvidersSettings;
  appearance: AppearanceSettings;
  retrieval: RetrievalSettings;
  /** Version to drive future migrations of the localStorage payload. */
  schemaVersion: number;
}

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  schemaVersion: 3,
  providers: {
    defaultProviderId: 'pydantic-ai-native',
  },
  appearance: {
    theme: 'light',
    entryDialogExpanded: false,
  },
  retrieval: {
    mode: 'semantic',
  },
};

export const RETRIEVAL_MODE_LABELS: Record<RetrievalModeSetting, string> = {
  semantic: 'Semantic (default)',
  hybrid: 'Hybrid',
  graph: 'Graph (in-memory)',
};
