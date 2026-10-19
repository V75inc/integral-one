import { describe, expect, it } from 'vitest';
import {
  fieldDefaultSettingKey,
  patchFromAppSettings,
} from '../fieldSettingDefaults';

describe('fieldSettingDefaults', () => {
  it('reads default_from_setting keys', () => {
    expect(fieldDefaultSettingKey({ default_from_setting: 'default_currency' })).toBe(
      'default_currency',
    );
    expect(fieldDefaultSettingKey({ default_from_setting: '  ' })).toBe('');
    expect(fieldDefaultSettingKey({})).toBe('');
  });

  it('patches empty fields from app settings', () => {
    const patch = patchFromAppSettings(
      [
        { key: 'currency', default_from_setting: 'default_currency' },
        { key: 'terms', default_from_setting: 'default_payment_terms' },
      ],
      { default_currency: 'GYD', default_payment_terms: 'net_30' },
      {},
    );
    expect(patch).toEqual({ currency: 'GYD', terms: 'net_30' });
  });

  it('does not overwrite non-empty current values', () => {
    const patch = patchFromAppSettings(
      [{ key: 'currency', default_from_setting: 'default_currency' }],
      { default_currency: 'GYD' },
      { currency: 'USD' },
    );
    expect(patch).toEqual({});
  });

  it('skips missing or blank settings', () => {
    const patch = patchFromAppSettings(
      [
        { key: 'currency', default_from_setting: 'default_currency' },
        { key: 'terms', default_from_setting: 'default_payment_terms' },
      ],
      { default_currency: '  ', default_payment_terms: undefined },
      {},
    );
    expect(patch).toEqual({});
  });
});
