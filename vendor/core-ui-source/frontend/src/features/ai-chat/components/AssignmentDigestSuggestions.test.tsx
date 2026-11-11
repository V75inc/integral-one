import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { acceptRoutineOpportunity, deferRoutineOpportunity, dismissRoutineOpportunity, requestRoutineOpportunityReview } from '../../../api/routines';
import { AssignmentDigestSuggestions } from './AssignmentDigestSuggestions';

vi.mock('../../../api/routines', () => ({ acceptRoutineOpportunity: vi.fn(), dismissRoutineOpportunity: vi.fn(), deferRoutineOpportunity: vi.fn(), requestRoutineOpportunityReview: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it('dismisses only the selected task and preserves the other suggestion', async () => {
  vi.mocked(dismissRoutineOpportunity).mockResolvedValueOnce(undefined);
  render(<MemoryRouter><AssignmentDigestSuggestions messageId="message" suggestions={[
    { entry_id: 'entry-1', track_id: 'track' },
    { entry_id: 'entry-2', track_id: 'track' },
  ]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss assigned task 1' }));
  expect(await screen.findByText('Assigned task 1 dismissed')).toBeVisible();
  expect(dismissRoutineOpportunity).toHaveBeenCalledWith('message', 'entry-1');
  expect(screen.queryByRole('link', { name: 'Review assigned task 1' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Review assigned task 2' }))
    .toHaveAttribute('href', '/tracks/track?entry=entry-2');
});

it('shows the saved follow-up time for only the deferred suggestion', async () => {
  const until = '2099-01-01T09:00:00Z';
  vi.mocked(deferRoutineOpportunity).mockResolvedValueOnce(until);
  render(<MemoryRouter><AssignmentDigestSuggestions messageId="message" suggestions={[
    { entry_id: 'entry-1', track_id: 'track' },
    { entry_id: 'entry-2', track_id: 'track' },
  ]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Defer assigned task 1 for 24 hours' }));
  expect(await screen.findByText(/Assigned task 1 deferred until/)).toBeVisible();
  expect(document.querySelector('time')).toHaveAttribute('datetime', until);
  expect(deferRoutineOpportunity).toHaveBeenCalledWith('message', 'entry-1');
  expect(screen.getByRole('link', { name: 'Review assigned task 2' })).toBeVisible();
});

it('requests preparation review for the selected suggestion', async () => {
  vi.mocked(requestRoutineOpportunityReview).mockResolvedValueOnce(undefined);
  render(<MemoryRouter><AssignmentDigestSuggestions messageId="message" suggestions={[
    { entry_id: 'entry-1', track_id: 'track' },
  ]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Request preparation review for assigned task 1' }));
  expect(await screen.findByText('Preparation review requested')).toBeVisible();
  expect(requestRoutineOpportunityReview).toHaveBeenCalledWith('message', 'entry-1');
  expect(screen.getByRole('link', { name: 'Open assigned task 1' }))
    .toHaveAttribute('href', '/tracks/track?entry=entry-1');
});

it('keeps an accepted suggestion available for a separate preparation request', async () => {
  vi.mocked(acceptRoutineOpportunity).mockResolvedValueOnce(undefined);
  render(<MemoryRouter><AssignmentDigestSuggestions messageId="message" suggestions={[
    { entry_id: 'entry-1', track_id: 'track' },
  ]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Accept assigned task 1 for follow-up' }));
  expect(await screen.findByText('Accepted for follow-up')).toBeVisible();
  expect(acceptRoutineOpportunity).toHaveBeenCalledWith('message', 'entry-1');
  expect(requestRoutineOpportunityReview).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Request preparation review for assigned task 1' })).toBeEnabled();
});
