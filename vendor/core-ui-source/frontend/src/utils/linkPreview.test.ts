import { describe, expect, it } from 'vitest';
import { extractFirstUrl } from './linkPreview';

describe('extractFirstUrl', () => {
  it('returns first http/https URL from text', () => {
    expect(
      extractFirstUrl('See https://example.com/a and then https://example.com/b')
    ).toBe('https://example.com/a');
  });

  it('returns null when no URL is present', () => {
    expect(extractFirstUrl('No links in this note.')).toBeNull();
  });
});
