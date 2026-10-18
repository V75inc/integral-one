/**
 * Settings store — localStorage-backed for now. Swap with a backend
 * `/api/settings` adapter when persistence lands server-side.
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type SettingsSnapshot } from './types';

const STORAGE_KEY = 'integral.settings.v1';

function load(): SettingsSnapshot {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SettingsSnapshot>;
    return mergeWithDefaults(parsed);
  } catch (err) {
    console.warn('settings: failed to load — falling back to defaults', err);
    return DEFAULT_SETTINGS;
  }
}

function persist(snapshot: SettingsSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('settings: persist failed', err);
  }
}

function mergeWithDefaults(partial: Partial<SettingsSnapshot>): SettingsSnapshot {
  return {
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    providers: {
      ...DEFAULT_SETTINGS.providers,
      ...(partial.providers ?? {}),
      // The resident is built in, including when a saved preference names a test provider.
      defaultProviderId: 'pydantic-ai-native',
    },
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      ...(partial.appearance ?? {}),
    },
    retrieval: {
      ...DEFAULT_SETTINGS.retrieval,
      ...(partial.retrieval ?? {}),
    },
  };
}

/**
 * React hook for the settings snapshot. Returns the snapshot and a writer
 * that accepts either a full snapshot or a partial-merge updater.
 */
export function useSettings(): [
  SettingsSnapshot,
  (next: SettingsSnapshot | ((prev: SettingsSnapshot) => SettingsSnapshot)) => void,
] {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>(load);

  useEffect(() => {
    persist(snapshot);
  }, [snapshot]);

  const update = useCallback(
    (next: SettingsSnapshot | ((prev: SettingsSnapshot) => SettingsSnapshot)) => {
      setSnapshot(prev => (typeof next === 'function' ? next(prev) : next));
    },
    [],
  );

  return [snapshot, update];
}
