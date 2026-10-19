import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';

import fixture from '../../../fixtures/c6A05FieldProjection.json';
import type { Entry, OperationalModelFieldSpec, SavedView } from '../../../types';
import { resolveFieldValuesForEntryType } from '../../entries/entryFormCustomFields';
import { aggregate, groupBy } from '../chartAggregate';
import { TableWidget } from '../TableWidget';

const entry = fixture.entry as unknown as Entry;
const fields = fixture.fields as OperationalModelFieldSpec[];

afterEach(cleanup);

describe('C6 A05 field identity and namespace consumers', () => {
  it('keeps form values keyed by stable field key through a label rename and null', () => {
    const renamedLabel = fixture.fields[0].renamed_label;
    if (!renamedLabel) throw new Error('fixture must provide a renamed label');
    const renamedField = { ...fields[0], name: renamedLabel };
    const values = resolveFieldValuesForEntryType('asset', [renamedField, fields[1]], entry.custom_fields ?? {});

    expect(renamedField.key).toBe('registration_number');
    expect(values).toEqual({ registration_number: 'ABC-014', workflow_state: null });
  });

  it('renders business and platform collisions through the saved table view', () => {
    const view = {
      id: 'v-c6-a05',
      name: 'Asset status',
      type: 'table',
      track_id: 'n.Track.c6-a05',
      config: {
        columns: [
          { field: 'status', label: 'Platform status' },
          { field: 'custom_fields.status', label: 'Business status' },
          { field: 'custom_fields.workflow_state', label: 'Workflow state' },
        ],
      },
    } as SavedView;
    render(<TableWidget view={view} entries={[entry]} fields={fields} isLoading={false} onEntryOpen={() => {}} />);

    expect(screen.getAllByText('active')).toHaveLength(2);
    expect(screen.getAllByText('awaiting_parts')).toHaveLength(2);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('groups the same persisted values in the dashboard chart consumer', () => {
    const groups = groupBy([entry], 'custom_fields.status');
    const points = aggregate(groups, { mode: 'count' });
    expect(points).toEqual([{ key: 'awaiting_parts', value: 1 }]);
    expect(groupBy([entry], 'custom_fields.workflow_state').has('(none)')).toBe(true);
    expect(groupBy([entry], 'status').has('active')).toBe(true);
  });
});
