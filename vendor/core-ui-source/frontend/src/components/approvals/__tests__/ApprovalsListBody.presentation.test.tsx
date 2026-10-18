import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

import { ApprovalsListBody } from '../ApprovalsListBody';

afterEach(() => cleanup());

describe('ApprovalsListBody change review', () => {
  it('shows a readable change and links the affected record before exposing technical details', () => {
    render(
      <MemoryRouter>
        <ApprovalsListBody
          rows={[
            {
              id: 'approval-1',
              actor_kind: 'agent',
              actor_id: 'resident',
              action: 'entry.create',
              resource_kind: 'entry',
              resource_id: 'entry-1',
              payload: {
                title: 'Inspect vehicle',
                priority: 'high',
                nested: { raw: true },
              },
              policy_id: 'policy-1',
              created_at: '2026-09-22T00:00:00Z',
              expires_at: '2026-09-23T00:00:00Z',
              status: 'pending',
              decided_at: null,
              decider_id: null,
            },
          ]}
          loading={false}
          error={null}
          onRetry={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Entry create for Entry entry-1')).toBeInTheDocument();
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Inspect vehicle')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review affected record' })).toHaveAttribute(
      'href',
      '/feed?entry=entry-1',
    );
    expect(screen.getByRole('button', { name: 'Show technical details' })).toBeInTheDocument();
    expect(screen.queryByText('nested')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }));

    expect(screen.getByText(/"nested"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide technical details' })).toBeInTheDocument();
  });
});
