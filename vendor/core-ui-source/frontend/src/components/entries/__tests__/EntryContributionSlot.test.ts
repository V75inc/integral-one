import { describe, expect, it } from 'vitest';
import {
  contributionOwnsForm,
  contributionTitleFromFields,
  deriveTitleFromFields,
  resolveEntryContribution,
} from '../EntryContributionSlot';

describe('resolveEntryContribution', () => {
  it('returns the matching placement contribution', () => {
    const schema = {
      ui_contributions: [
        {
          placement: 'entry_compose',
          extension_view_key: 'document_lines',
          layout: 'wide',
        },
        {
          placement: 'entry_detail',
          extension_view_key: 'document_lines',
        },
      ],
    };
    expect(resolveEntryContribution(schema, 'entry_compose')).toEqual(
      schema.ui_contributions[0],
    );
    expect(resolveEntryContribution(schema, 'entry_detail')?.extension_view_key).toBe(
      'document_lines',
    );
  });

  it('resolves native view / view_type contributions', () => {
    const schema = {
      ui_contributions: [
        {
          placement: 'entry_compose',
          view: 'lines_editor',
          layout: 'wide',
        },
        {
          placement: 'entry_detail',
          view_type: 'editable_related_lines',
          config: { relation: 'parent' },
        },
      ],
    };
    expect(resolveEntryContribution(schema, 'entry_compose')?.view).toBe(
      'lines_editor',
    );
    expect(resolveEntryContribution(schema, 'entry_detail')?.view_type).toBe(
      'editable_related_lines',
    );
  });

  it('returns null when missing', () => {
    expect(resolveEntryContribution(null, 'entry_compose')).toBeNull();
    expect(resolveEntryContribution({ ui_contributions: [] }, 'entry_compose')).toBeNull();
    expect(
      resolveEntryContribution(
        { ui_contributions: [{ placement: 'entry_detail', extension_view_key: 'x' }] },
        'entry_compose',
      ),
    ).toBeNull();
  });

  it('reads owns_form from the contribution', () => {
    expect(
      contributionOwnsForm(
        {
          ui_contributions: [
            { placement: 'entry_compose', view: 'doc_shell', owns_form: true },
          ],
        },
        'entry_compose',
      ),
    ).toBe(true);
    expect(
      contributionOwnsForm(
        {
          ui_contributions: [{ placement: 'entry_compose', view: 'doc_shell' }],
        },
        'entry_compose',
      ),
    ).toBe(false);
  });

  it('reads title_from_fields and derives the first non-empty value', () => {
    expect(
      contributionTitleFromFields(
        {
          ui_contributions: [
            {
              placement: 'entry_compose',
              view: 'doc_shell',
              owns_form: true,
              title_from_fields: ['doc_number', 'party_name'],
            },
          ],
        },
        'entry_compose',
      ),
    ).toEqual(['doc_number', 'party_name']);
    expect(
      deriveTitleFromFields(
        { party_name: 'Acme', doc_number: '' },
        ['doc_number', 'party_name'],
      ),
    ).toBe('Acme');
  });
});
