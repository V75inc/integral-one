import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrackDot } from '../TrackDot';
import { AppIcon } from '../../../ui/AppIcon';
import { knownManifestIcon, MANIFEST_ICON_IDS } from '../../../lib/manifestLucideIcon';

describe('manifest icons', () => {
  it('draws a named icon in place of the dot', () => {
    const { container } = render(<TrackDot icon="receipt" title="Payslips" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('keeps the dot for no icon or a name outside the list', () => {
    expect(render(<TrackDot />).container.querySelector('svg')).toBeNull();
    expect(render(<TrackDot icon="nope" />).container.querySelector('svg')).toBeNull();
  });

  it('App icons use the same list and fall back to initials', () => {
    expect(render(<AppIcon name="Payroll Guyana" icon="banknote" />).container.querySelector('svg')).not.toBeNull();
    expect(render(<AppIcon name="Payroll Guyana" icon="nope" />).container.textContent).toBe('PG');
  });

  it('knows the names payroll uses', () => {
    for (const n of ['banknote', 'receipt', 'percent', 'landmark', 'wallet', 'calendar-clock']) {
      expect(knownManifestIcon(n)).toBeDefined();
      expect(MANIFEST_ICON_IDS).toContain(n);
    }
  });
});
