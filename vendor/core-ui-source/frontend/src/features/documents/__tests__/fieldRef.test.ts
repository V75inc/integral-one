import { describe, expect, it } from 'vitest';
import {
  fieldTokenDisplayText,
  formatFieldRefDisplay,
  isQualifiedFieldRef,
  qualifyFieldRef,
  qualifyFieldTokensInDocument,
} from '../fieldRef';

describe('formatFieldRefDisplay', () => {
  it('wraps a qualified ref in braces', () => {
    expect(formatFieldRefDisplay('hr_app.recruitment.address_line')).toBe(
      '{{hr_app.recruitment.address_line}}',
    );
  });

  it('normalizes existing braces', () => {
    expect(formatFieldRefDisplay('{{ hr_app.recruitment.email }}')).toBe(
      '{{hr_app.recruitment.email}}',
    );
  });
});

describe('qualifyFieldRef', () => {
  it('builds module.track.local from a bare key', () => {
    expect(
      qualifyFieldRef('title', {
        module: 'hr_app',
        trackKey: 'employee_onboarding',
      }),
    ).toBe('hr_app.employee_onboarding.title');
  });

  it('leaves an already-qualified ref unchanged', () => {
    expect(
      qualifyFieldRef('hr_app.recruitment.email', {
        module: 'hr_app',
        trackKey: 'recruitment',
      }),
    ).toBe('hr_app.recruitment.email');
  });

  it('leaves system generation fields unchanged', () => {
    expect(
      qualifyFieldRef('system.current_date', {
        module: 'hr_app',
        trackKey: 'recruitment',
      }),
    ).toBe('system.current_date');
  });
});

describe('isQualifiedFieldRef', () => {
  it('requires three dot segments', () => {
    expect(isQualifiedFieldRef('title')).toBe(false);
    expect(isQualifiedFieldRef('hr_app.recruitment.email')).toBe(true);
  });
});

describe('qualifyFieldTokensInDocument', () => {
  it('upgrades legacy fieldToken nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'fieldToken',
              attrs: { fieldKey: 'title', label: 'Name', placeholder: '' },
            },
          ],
        },
      ],
    };
    const next = qualifyFieldTokensInDocument(doc, {
      module: 'hr_app',
      trackKey: 'employee_onboarding',
    });
    const token = (
      (next.content as Array<Record<string, unknown>>)[0].content as Array<
        Record<string, unknown>
      >
    )[0].attrs as Record<string, string>;
    expect(token.fieldKey).toBe('hr_app.employee_onboarding.title');
    expect(token.placeholder).toBe('{{hr_app.employee_onboarding.title}}');
  });
});

describe('fieldTokenDisplayText', () => {
  it('prefers placeholder when set', () => {
    expect(
      fieldTokenDisplayText({
        placeholder: '{{hr_app.recruitment.address_line}}',
        fieldKey: 'hr_app.recruitment.address_line',
        label: 'Address',
      }),
    ).toBe('{{hr_app.recruitment.address_line}}');
  });

  it('derives braces from fieldKey for legacy tokens', () => {
    expect(
      fieldTokenDisplayText({
        fieldKey: 'hr_app.recruitment.address_line',
        label: 'Address',
      }),
    ).toBe('{{hr_app.recruitment.address_line}}');
  });

  it('falls back to bracketed label when no key', () => {
    expect(fieldTokenDisplayText({ label: 'Address' })).toBe('[Address]');
  });
});
