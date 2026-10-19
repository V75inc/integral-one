import { describe, expect, it } from 'vitest';
import { resolveEntryFieldValue } from '../entryFieldValue';
import fieldResolutionCases from '../../fixtures/fieldResolutionCases.json';

describe('resolveEntryFieldValue', () => {
  it('matches the shared API/query conformance cases', () => {
    for (const testCase of fieldResolutionCases) {
      for (const [fieldPath, expected] of Object.entries(testCase.expectations)) {
        expect(resolveEntryFieldValue(testCase.entry, fieldPath), `${testCase.name}: ${fieldPath}`).toEqual(expected);
      }
    }
  });

  it('keeps platform and business status values in their declared namespaces', () => {
    const entry = { status: 'active', custom_fields: { status: null } };

    expect(resolveEntryFieldValue(entry, 'status')).toBe('active');
    expect(resolveEntryFieldValue(entry, 'custom_fields.status')).toBeNull();
  });

  it('retains bare-key compatibility only for unreserved business keys', () => {
    const entry = { title: 'Truck 01', custom_fields: { registration: 'PZZ 1234' } };

    expect(resolveEntryFieldValue(entry, 'registration')).toBe('PZZ 1234');
    expect(resolveEntryFieldValue(entry, 'custom_fields.registration')).toBe('PZZ 1234');
  });
});
