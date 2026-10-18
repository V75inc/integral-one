import { describe, expect, it } from 'vitest';
import { entryTypeColor, resolveIdentityColor } from './index';

describe('resolveIdentityColor', () => {
  it('inherits the workspace color when an item has no explicit color', () => {
    expect(resolveIdentityColor('', ' #6633cc ')).toBe('#6633cc');
  });

  it('uses workspace color consistently over an explicit item color', () => {
    expect(resolveIdentityColor(' #ff8844 ', '#6633cc')).toBe('#6633cc');
  });

  it('leaves unconfigured items on the theme default', () => {
    expect(resolveIdentityColor('', '')).toBeUndefined();
  });
});

describe('entryTypeColor workspace override', () => {
  it('uses workspace color for entry type highlights when configured', () => {
    expect(entryTypeColor('decision', '#12Abef')).toEqual({ bg: '#12abef', fg: '#12abef' });
  });

  it('keeps the entry type palette when workspace color is unset', () => {
    expect(entryTypeColor('decision', '')).toEqual(entryTypeColor('decision'));
  });
});
