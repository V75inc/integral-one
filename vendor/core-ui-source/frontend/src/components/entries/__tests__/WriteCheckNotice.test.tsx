import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WriteCheckNotice, splitCheckMessage } from '../WriteCheckNotice';

const MSG =
  "This pay run can't be created yet. 20 people are missing details payroll and the filings need. Fix them in HR (or on their pay record), then create the run again. Account Manager: TIN, NIS number; Alex Rivera: TIN (and 18 more)";

describe('WriteCheckNotice', () => {
  it('splits a message that lists people into a lead and items', () => {
    const { lead, items, more } = splitCheckMessage(MSG);
    expect(lead.endsWith('create the run again.')).toBe(true);
    expect(items).toEqual(['Account Manager: TIN, NIS number', 'Alex Rivera: TIN']);
    expect(more).toBe('and 18 more');
  });

  it('keeps a plain message as one line', () => {
    expect(splitCheckMessage('Amount is required.')).toEqual({ lead: 'Amount is required.', items: [], more: '' });
  });

  it('renders an alert with the list', () => {
    render(<WriteCheckNotice message={MSG} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Alex Rivera: TIN')).toBeTruthy();
  });
});
