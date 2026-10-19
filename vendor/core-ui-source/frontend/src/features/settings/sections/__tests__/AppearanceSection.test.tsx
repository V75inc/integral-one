import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppearanceSection } from '../AppearanceSection';
import { DEFAULT_SETTINGS, type SettingsSnapshot } from '../../types';

vi.mock('../../../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe('AppearanceSection', () => {
  it('toggles entryDialogExpanded on the settings snapshot', async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const settings: SettingsSnapshot = {
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance, entryDialogExpanded: false },
    };

    render(<AppearanceSection settings={settings} update={update} />);

    const checkbox = screen.getByTestId('appearance-entry-dialog-expanded');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    expect(update).toHaveBeenCalledTimes(1);
    const updater = update.mock.calls[0][0] as (
      prev: SettingsSnapshot,
    ) => SettingsSnapshot;
    const next = updater(settings);
    expect(next.appearance.entryDialogExpanded).toBe(true);
  });
});
