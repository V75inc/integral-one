import { describe, it, expect } from 'vitest';
import {
  slugifyKey,
  validateFieldKey,
  validateFieldName,
  RESERVED_BASE_FIELD_KEYS,
  FIELD_TYPES,
} from '../fieldValidation';

describe('slugifyKey', () => {
  it('lowercases and underscores', () => {
    expect(slugifyKey('Project Owner')).toBe('project_owner');
  });
  it('strips non-alphanumeric except underscores', () => {
    expect(slugifyKey('Due-Date / Time!')).toBe('due_date_time');
  });
  it('collapses consecutive underscores', () => {
    expect(slugifyKey('a   b___c')).toBe('a_b_c');
  });
  it('trims leading/trailing underscores', () => {
    expect(slugifyKey('  hello  ')).toBe('hello');
  });
  it('returns empty string for empty input', () => {
    expect(slugifyKey('')).toBe('');
  });
  it('prefixes with letter if leading digit', () => {
    expect(slugifyKey('1priority')).toBe('f_1priority');
  });
});

describe('validateFieldKey', () => {
  it('accepts valid key', () => {
    expect(validateFieldKey('priority', [])).toBeNull();
  });
  it('rejects empty', () => {
    expect(validateFieldKey('', [])).toMatch(/required/i);
  });
  it('rejects bad pattern', () => {
    expect(validateFieldKey('Priority', [])).toMatch(/lowercase/i);
    expect(validateFieldKey('1foo', [])).toMatch(/letter/i);
    expect(validateFieldKey('foo-bar', [])).toMatch(/lowercase|underscore/i);
  });
  it('rejects duplicate within siblings', () => {
    expect(validateFieldKey('owner', ['priority', 'owner'])).toMatch(/already exists/i);
  });
  it('rejects reserved base-field keys', () => {
    for (const k of RESERVED_BASE_FIELD_KEYS) {
      expect(validateFieldKey(k, [])).toMatch(/reserved/i);
    }
  });
});

describe('validateFieldName', () => {
  it('rejects empty', () => {
    expect(validateFieldName('   ')).toMatch(/required/i);
  });
  it('accepts non-empty', () => {
    expect(validateFieldName('Project Owner')).toBeNull();
  });
});

describe('FIELD_TYPES', () => {
  it('contains the 11 supported types', () => {
    expect(FIELD_TYPES).toEqual([
      'text',
      'textarea',
      'number',
      'boolean',
      'date',
      'datetime',
      'select',
      'multi_select',
      'link',
      'email',
      'relation',
      'member',
    ]);
  });
});
