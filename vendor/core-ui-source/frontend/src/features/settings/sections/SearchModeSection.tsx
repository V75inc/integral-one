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

/**
 * SearchModeSection — global search mode picker.
 *
 * Renamed from RetrievalSection in Phase 8 Plan 08-01. Body is unchanged
 * verbatim — only the exported symbol name was renamed. Plan 08-04
 * finalises this section's body (e.g. wiring a backend-config preview
 * alongside the picker); 08-01 owns the rename/delete contract only.
 *
 * Replaces the per-strip inline ``Mode`` dropdown that previously lived
 * next to every search input. The choice is now made once here and
 * applied to every search surface (feed, track-detail, future global
 * search). Default is ``semantic`` — global vector retrieval — because
 * it surfaces matches beyond the in-memory list and is more
 * comprehensive than the substring filter.
 */
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
          Pick how every search box in Integral resolves your query.
        </PageMeta>
        {navigateToSection && <Button variant="ghost" size="sm" onClick={() => navigateToSection('ai-models')}>Manage embedding model in AI Models</Button>}
      </div>

      <SettingsSection
        title="Search mode"
        description="Saved in this browser and used by its search boxes. Other people’s preferences are unchanged."
      >
        <SettingsField
          label="Mode"
          hint={
            mode === 'semantic'
              ? 'Matches by meaning across the whole workspace, including items not currently visible.'
              : mode === 'hybrid'
                ? 'Widest results. Combines meaning-based search with structured navigation through your data.'
                : 'Fastest. Plain text match against the items currently loaded on screen.'
          }
        >
          <div role="group" aria-label="Search mode" className="flex flex-wrap gap-1 rounded-[var(--radius-pill)] border border-[var(--panel-border)] bg-[var(--panel-2)] p-1">
            {(['semantic', 'hybrid', 'graph'] as const).map(m => (
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
