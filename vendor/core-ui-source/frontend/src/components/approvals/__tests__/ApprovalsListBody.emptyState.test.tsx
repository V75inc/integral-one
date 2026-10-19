/**
 * The Approvals page hosts two independent queues — policy-gated agent
 * writes, and changes staged inside a conversation. This body only knows
 * about the first, but its empty state is worded as though it speaks for the
 * whole surface.
 *
 * Observed live: the page showed "1 item", "No pending approvals", and a
 * pending approval, all at once. Three claims, two of them wrong. The empty
 * state must stay silent when the other queue has rows.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ApprovalsListBody } from '../ApprovalsListBody';

const noop = () => {};

afterEach(() => cleanup());

describe('ApprovalsListBody empty state', () => {
  it('speaks up when nothing is pending anywhere', () => {
    render(
      <ApprovalsListBody rows={[]} loading={false} error={null} onRetry={noop} />,
    );
    expect(screen.getByText('No pending approvals')).toBeInTheDocument();
  });

  it('stays silent when the staged queue has rows', () => {
    // Otherwise it renders "No pending approvals" directly above a pending one.
    render(
      <ApprovalsListBody
        rows={[]}
        loading={false}
        error={null}
        onRetry={noop}
        hideEmptyState
      />,
    );
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
  });

  it('does not suppress the loading or error states', () => {
    // `hideEmptyState` is about emptiness only — a failed fetch is not an
    // empty list, and silently swallowing it would be a worse bug than the
    // one being fixed.
    const { rerender } = render(
      <ApprovalsListBody
        rows={[]}
        loading
        error={null}
        onRetry={noop}
        hideEmptyState
      />,
    );
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();

    rerender(
      <ApprovalsListBody
        rows={[]}
        loading={false}
        error="Failed to load approvals"
        onRetry={noop}
        hideEmptyState
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load approvals');
  });
});
