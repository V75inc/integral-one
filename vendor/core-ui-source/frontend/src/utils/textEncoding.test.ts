import { describe, expect, it } from 'vitest';
import { normalizeDeepStrings, normalizeForDisplay } from './textEncoding';

describe('normalizeForDisplay', () => {
  it('applies Unicode NFC', () => {
    const c = 'e\u0301';
    const n = normalizeForDisplay(c);
    expect(n).toBe('\u00e9');
  });

  it('replaces U+FFFD between letters with hyphen', () => {
    expect(normalizeForDisplay('Contoso e\uFFFDcommerce')).toBe('Contoso e-commerce');
  });

  it('repairs UTF-8 read as latin1 for é', () => {
    const garbled = '\u00c3\u00a9';
    expect(normalizeForDisplay(garbled)).toBe('é');
  });
});

describe('normalizeDeepStrings', () => {
  it('walks nested objects and arrays', () => {
    const out = normalizeDeepStrings({
      title: 'a\uFFFDb',
      nested: { note: '\u00c3\u00a9' },
      items: ['x\uFFFDy'],
      n: 1,
    }) as {
      title: string;
      nested: { note: string };
      items: string[];
      n: number;
    };
    expect(out.title).toBe('a-b');
    expect(out.nested.note).toBe('é');
    expect(out.items[0]).toBe('x-y');
    expect(out.n).toBe(1);
  });
});
