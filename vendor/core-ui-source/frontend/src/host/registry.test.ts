import { describe, expect, it } from 'vitest';
import { CreditCard, Settings } from 'lucide-react';
import {
  getRegisteredSidebarAccountActions,
  registerSidebarAccountAction,
} from './registry';

describe('host sidebar account actions', () => {
  it('stores an optional host-supplied icon', () => {
    registerSidebarAccountAction({
      id: 'test-billing-icon',
      label: 'Billing',
      icon: CreditCard,
      onSelect: () => undefined,
    });
    const actions = getRegisteredSidebarAccountActions();
    const action = actions.find(a => a.id === 'test-billing-icon');
    expect(action?.icon).toBe(CreditCard);
    expect(action?.icon).not.toBe(Settings);
  });

  it('allows actions without an icon (Core supplies a neutral fallback)', () => {
    registerSidebarAccountAction({
      id: 'test-no-icon',
      label: 'Host action',
      onSelect: () => undefined,
    });
    const actions = getRegisteredSidebarAccountActions();
    const action = actions.find(a => a.id === 'test-no-icon');
    expect(action?.icon).toBeUndefined();
  });
});
