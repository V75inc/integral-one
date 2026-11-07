import { Button } from '../../../components/ui/Button';
import { PageMeta } from '../../../components/ui';
import {
  SettingsField,
  SettingsSection,
} from '../components/Field';
import { Text } from '../../../ui';
import {
  RETRIEVAL_MODE_LABELS,
  type RetrievalModeSetting,
  type SettingsSnapshot,
} from '../types';

interface Props {
  settings: SettingsSnapshot;
  update: (
    next: SettingsSnapshot | ((prev: SettingsSnapshot) => SettingsSnapshot),
  ) => void;
  // Accepted for SettingsPage render-ctx spread compatibility; this
  // section doesn't use it today.
  navigateToSection?: (id: string) => void;
}

/** Search preference for Feed and Track lists on this browser. */
export function SearchModeSection({ settings, update, navigateToSection }: Props) {
  const mode = settings.retrieval.mode;

  const setMode = (next: RetrievalModeSetting) => {
    update(prev => ({
      ...prev,
      retrieval: { ...prev.retrieval, mode: next },
    }));
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">Search</Text>
        <PageMeta as="p">
          Choose how searches in Feed and Tracks find entries.
        </PageMeta>
        {navigateToSection && <Button variant="ghost" size="sm" onClick={() => navigateToSection('ai-models')}>Manage embedding model in AI Models</Button>}
      </div>

      <SettingsSection
        title="Search mode"
        description="Saved in this browser. Other people’s preferences are unchanged."
      >
        <SettingsField
          label="Mode"
          hint={
            mode === 'semantic'
              ? 'Finds indexed entries by meaning within the current scope.'
              : mode === 'hybrid'
                ? 'Combines matches by meaning and keywords. Falls back to keyword search if meaning-based search is unavailable.'
                : 'Finds indexed entries containing the words in your search.'
          }
        >
          <div role="group" aria-label="Search mode" className="flex flex-wrap gap-1 rounded-[var(--radius-pill)] border border-[var(--panel-border)] bg-[var(--panel-2)] p-1">
            {(['hybrid', 'lexical', 'semantic'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`
                  rounded-[var(--radius-pill)] px-3 py-1 text-xs
                  transition-colors duration-fast
                  ${
                    mode === m
                      ? 'bg-[var(--panel)] text-[var(--text)]'
                      : 'text-[var(--text-subtle)] hover:text-[var(--text-muted)]'
                  }
                `}
              >
                {RETRIEVAL_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </SettingsField>
      </SettingsSection>
    </div>
  );
}
