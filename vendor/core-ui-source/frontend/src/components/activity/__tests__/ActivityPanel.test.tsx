/**
 * ActivityPanel Vitest — TEST-04 Plan 07-05 (UX-02).
 *
 * Per CONTEXT lock #UX-02 the panel renders:
 *   - a status pill keyed to live | polling | connecting | disconnected
 *   - a reverse-chronological event list (newest first)
 *   - a click-to-open diff drawer surfacing before/after JSON
 *
 * The test mocks ``useEventStream`` to avoid the WS+polling state
 * machine — that hook is covered by ``useEventStream.test.ts``.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});

import type { ActivityEvent } from '../../../utils/changeEvent';
import type { EventStreamStatus } from '../useEventStream';

const mockUseEventStream = vi.fn();
vi.mock('../useEventStream', () => ({
  useEventStream: (scope: string) => mockUseEventStream(scope),
}));

import { ActivityPanel } from '../ActivityPanel';

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'ce-1',
    ts: '2026-05-17T00:00:00Z',
    actor_kind: 'human',
    actor_id: 'u-1',
    action: 'entry.create',
    resource_type: 'Entry',
    resource_id: 'e-1',
    ...overrides,
  };
}

function renderPanel(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(() => {
  mockUseEventStream.mockReset();
});

describe('<ActivityPanel />', () => {
  it('shows status pill matching the hook status', () => {
    mockUseEventStream.mockReturnValue({
      events: [],
      status: 'live' satisfies EventStreamStatus,
      reconnect: vi.fn(),
    });
    renderPanel(<ActivityPanel scope="track:t-1" />);
    expect(screen.getByTestId('activity-status-live')).toBeInTheDocument();
  });

  it('renders an empty-state row when the events list is empty', () => {
    mockUseEventStream.mockReturnValue({
      events: [],
      status: 'live' satisfies EventStreamStatus,
      reconnect: vi.fn(),
    });
    renderPanel(<ActivityPanel scope="track:t-1" />);
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });

  it('renders an event row keyed by id with actor + action', () => {
    mockUseEventStream.mockReturnValue({
      events: [makeEvent()],
      status: 'live' satisfies EventStreamStatus,
      reconnect: vi.fn(),
    });
    renderPanel(<ActivityPanel scope="track:t-1" />);
    expect(screen.getByTestId('activity-event-ce-1')).toBeInTheDocument();
    // Humanized renderer: "Someone created" (no display_name + no auth context).
    expect(screen.getByText(/created/i)).toBeInTheDocument();
  });

  it('renders Retry button when status is "disconnected"', () => {
    const reconnect = vi.fn();
    mockUseEventStream.mockReturnValue({
      events: [],
      status: 'disconnected' satisfies EventStreamStatus,
      reconnect,
    });
    renderPanel(<ActivityPanel scope="track:t-1" />);
    const retry = screen.getByRole('button', {
      name: /Reconnect event stream/i,
    });
    fireEvent.click(retry);
    expect(reconnect).toHaveBeenCalled();
  });

  it('renders Retry button when status is "polling" (fallback mode)', () => {
    mockUseEventStream.mockReturnValue({
      events: [],
      status: 'polling' satisfies EventStreamStatus,
      reconnect: vi.fn(),
    });
    renderPanel(<ActivityPanel scope="track:t-1" />);
    expect(screen.getByTestId('activity-status-polling')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Reconnect event stream/i }),
    ).toBeInTheDocument();
  });

  it('renders rows in reverse-chronological order (most recent first)', () => {
    mockUseEventStream.mockReturnValue({
      events: [
        makeEvent({ id: 'ce-old', ts: '2026-05-17T00:00:00Z' }),
        makeEvent({ id: 'ce-new', ts: '2026-05-17T01:00:00Z' }),
      ],
      status: 'live' satisfies EventStreamStatus,
      reconnect: vi.fn(),
    });
    renderPanel(<ActivityPanel scope="track:t-1" />);
    const rows = screen
      .getAllByRole('listitem')
      .filter(li => li.getAttribute('data-testid')?.startsWith('activity-event-'));
    expect(rows[0].getAttribute('data-testid')).toBe('activity-event-ce-new');
    expect(rows[1].getAttribute('data-testid')).toBe('activity-event-ce-old');
  });

  it('passes scope through to useEventStream', () => {
    mockUseEventStream.mockReturnValue({
      events: [],
      status: 'live' satisfies EventStreamStatus,
      reconnect: vi.fn(),
    });
    renderPanel(<ActivityPanel scope="entry:e-99" />);
    expect(mockUseEventStream).toHaveBeenCalledWith('entry:e-99');
  });

  it('deep-links to Audit log for the panel scope', () => {
    mockUseEventStream.mockReturnValue({
      events: [],
      status: 'live' satisfies EventStreamStatus,
      reconnect: vi.fn(),
    });
    renderPanel(<ActivityPanel scope="track:t-1" />);
    const link = screen.getByRole('link', { name: /Audit log/i });
    expect(link.getAttribute('href')).toContain('/settings#audit-log');
    expect(link.getAttribute('href')).toContain('scope=track%3At-1');
  });
});
