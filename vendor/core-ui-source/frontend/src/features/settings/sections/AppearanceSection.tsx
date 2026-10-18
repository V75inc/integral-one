import { PageMeta } from '../../../components/ui';
import { useTheme } from '../../../context/ThemeContext';
import { SettingsField, SettingsSection } from '../components/Field';
import { Text } from '../../../ui';
import type { SettingsSnapshot } from '../types';

interface Props {
  settings: SettingsSnapshot;
  update: (
    next: SettingsSnapshot | ((prev: SettingsSnapshot) => SettingsSnapshot),
  ) => void;
  // Accepted for SettingsPage render-ctx spread compatibility; this
  // section doesn't use it today.
  navigateToSection?: (id: string) => void;
}

export function AppearanceSection({ settings, update }: Props) {
  const { theme, setTheme } = useTheme();
  const entryDialogExpanded = Boolean(settings.appearance.entryDialogExpanded);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">
          Appearance
        </Text>
        <PageMeta as="p">
          Choose how Integral looks across the workspace.
        </PageMeta>
      </div>

      <SettingsSection
        title="Theme"
        description="Switch between light and dark."
      >
        <SettingsField label="Color theme" inline>
          <div role="group" aria-label="Color theme" className="flex gap-1 rounded-[var(--radius-pill)] border border-[var(--panel-border)] bg-[var(--panel-2)] p-1">
            {(['light', 'dark'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                aria-pressed={theme === t}
                className={`
                  rounded-[var(--radius-pill)] px-3 py-1 text-xs capitalize
                  transition-colors duration-fast
                  ${theme === t ? 'bg-[var(--panel)] text-[var(--text)]' : 'text-[var(--text-subtle)] hover:text-[var(--text-muted)]'}
                `}
              >
                {t}
              </button>
            ))}
          </div>
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="Entry dialogs"
        description="Choose the default size for entry details."
      >
        <SettingsField label="Open entry dialogs enlarged" inline>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={entryDialogExpanded}
              onChange={e => {
                const next = e.target.checked;
                update(prev => ({
                  ...prev,
                  appearance: {
                    ...prev.appearance,
                    entryDialogExpanded: next,
                  },
                }));
              }}
              data-testid="appearance-entry-dialog-expanded"
              className="rounded border-[var(--panel-border)]"
            />
            <Text as="span" variant="body-sm" tone="muted">
              Use full workspace width by default
            </Text>
          </label>
        </SettingsField>
      </SettingsSection>
    </div>
  );
}
