import { describe, expect, it } from 'vitest';
import { apiResponseMessage } from '../apiResponseMessage';

describe('public API failure messages', () => {
  it('shows the canonical workspace denial rather than a generic Tracks failure', () => {
    expect(apiResponseMessage({ response: { status: 403, data: {
      error_code: 'insufficient_permissions', message: 'You do not have access to this workspace.',
    } } }, 'Failed to load tracks')).toBe('You do not have access to this workspace.');
  });
  it('supports a nested framework error envelope and legacy detail', () => {
    expect(apiResponseMessage({ response: { data: { error: { message: 'The database is unavailable.' } } } }, 'Failed to load tracks')).toBe('The database is unavailable.');
    expect(apiResponseMessage({ response: { data: { detail: 'Legacy API failure' } } }, 'Failed to load tracks')).toBe('Legacy API failure');
  });
  it('does not replace the fallback with structured validation data or empty messages', () => {
    expect(apiResponseMessage({ response: { data: { detail: [{ msg: 'invalid' }] } } }, 'Failed to load tracks')).toBe('Failed to load tracks');
    expect(apiResponseMessage({ response: { data: { message: '   ' } } }, 'Failed to load tracks')).toBe('Failed to load tracks');
    expect(apiResponseMessage(null, 'Failed to load tracks')).toBe('Failed to load tracks');
  });
});
