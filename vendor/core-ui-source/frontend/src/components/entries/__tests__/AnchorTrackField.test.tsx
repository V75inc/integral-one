import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  AnchorTrackField,
  CREATE_ANCHOR_SENTINEL,
  isAnchorTrackRelation,
} from '../AnchorTrackField';
import type { OperationalModelFieldSpec } from '../../../types';

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

const financialsField: OperationalModelFieldSpec = {
  key: 'financials_track',
  name: 'Project Financials',
  type: 'relation',
  relation: {
    target: 'track',
    target_track_template: 'project-financials',
    auto_provision: false,
  },
};

const detailsField: OperationalModelFieldSpec = {
  key: 'details_track',
  name: 'Project Details',
  type: 'relation',
  relation: {
    target: 'track',
    target_track_template: 'project-details',
    auto_provision: true,
  },
};

describe('AnchorTrackField', () => {
  it('detects track-target relations', () => {
    expect(isAnchorTrackRelation(financialsField)).toBe(true);
    expect(
      isAnchorTrackRelation({
        key: 'contact',
        name: 'Contact',
        type: 'relation',
        relation: { target: 'entry' },
      })
    ).toBe(false);
  });

  it('shows None | Create Track for opt-in fields', () => {
    const onChange = vi.fn();
    render(
      wrap(
        <AnchorTrackField
          field={financialsField}
          value={null}
          onChange={onChange}
        />
      )
    );
    expect(screen.getByRole('radio', { name: 'None' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Create Track' }));
    expect(onChange).toHaveBeenCalledWith(CREATE_ANCHOR_SENTINEL);
  });

  it('shows Created with project for auto_provision fields', () => {
    render(
      wrap(
        <AnchorTrackField
          field={detailsField}
          value={null}
          onChange={() => undefined}
        />
      )
    );
    expect(screen.getByText('Created with project')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Create Track' })).toBeNull();
  });
});
