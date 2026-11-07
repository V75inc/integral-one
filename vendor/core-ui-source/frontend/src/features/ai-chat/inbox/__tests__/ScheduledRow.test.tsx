/**
 * Scheduled-row controls: Pause / Stop / Remove call the right APIs and
 * respect confirm gates. Badge counting stays on useAgentInbox tests.
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider } from '../../../../context/ConfirmContext';

vi.mock('../../../../api/routines', () => ({
  updateRoutine: vi.fn(),
  cancelRoutine: vi.fn(),
  deleteRoutine: vi.fn(),
}));

import * as routinesApi from '../../../../api/routines';
import { ScheduledRow } from '../InboxView';
import type { RoutineResponse } from '../../../../api/routines';

function render(element: React.ReactElement) {
  return rtlRender(<ConfirmProvider>{element}</ConfirmProvider>);
}

function baseRoutine(
  overrides: Partial<RoutineResponse> = {},
): RoutineResponse {
  return {
    id: 'r1',
    instruction: 'Daily digest',
    cron: '0 8 * * *',
    timezone: 'UTC',
    status: 'active',
    write_scope: [],
    next_run_at: new Date().toISOString(),
    last_run_at: null,
    last_run_status: null,
    last_run_error: null,
    consecutive_failures: 0,
    max_runs: null,
    run_count: 0,
    thread_id: 'th1',
    workspace_id: 'ws1',
    created_at: null,
    updated_at: null,
    running: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(routinesApi.updateRoutine).mockResolvedValue(
    baseRoutine({ status: 'paused' }),
  );
  vi.mocked(routinesApi.cancelRoutine).mockResolvedValue({
    id: 'r1',
    status: 'cancelled',
  });
  vi.mocked(routinesApi.deleteRoutine).mockResolvedValue({
    id: 'r1',
    deleted: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScheduledRow', () => {
  it('pauses an active routine without confirm', async () => {
    const onResolved = vi.fn();
    render(
      <ScheduledRow routine={baseRoutine()} onResolved={onResolved} />,
    );

    fireEvent.click(screen.getByLabelText('Pause scheduled task'));

    await waitFor(() => {
      expect(routinesApi.updateRoutine).toHaveBeenCalledWith('r1', {
        status: 'paused',
      });
    });
    expect(onResolved).toHaveBeenCalled();
  });

  it('resumes a paused routine', async () => {
    const onResolved = vi.fn();
    render(
      <ScheduledRow
        routine={baseRoutine({ status: 'paused' })}
        onResolved={onResolved}
      />,
    );

    fireEvent.click(screen.getByLabelText('Resume scheduled task'));

    await waitFor(() => {
      expect(routinesApi.updateRoutine).toHaveBeenCalledWith('r1', {
        status: 'active',
      });
    });
  });

  it('stops after confirm', async () => {
    const onResolved = vi.fn();
    render(
      <ScheduledRow routine={baseRoutine()} onResolved={onResolved} />,
    );

    fireEvent.click(screen.getByLabelText('Stop scheduled task'));
    expect(routinesApi.cancelRoutine).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop task' }));

    await waitFor(() => {
      expect(routinesApi.cancelRoutine).toHaveBeenCalledWith('r1');
    });
    expect(onResolved).toHaveBeenCalled();
  });

  it('does not stop when confirm is declined', async () => {
    render(
      <ScheduledRow routine={baseRoutine()} onResolved={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Stop scheduled task'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(routinesApi.cancelRoutine).not.toHaveBeenCalled();
  });

  it('removes after confirm', async () => {
    const onResolved = vi.fn();
    render(
      <ScheduledRow routine={baseRoutine()} onResolved={onResolved} />,
    );

    fireEvent.click(screen.getByLabelText('Remove scheduled task'));
    expect(routinesApi.deleteRoutine).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove task' }));

    await waitFor(() => {
      expect(routinesApi.deleteRoutine).toHaveBeenCalledWith('r1');
    });
    expect(onResolved).toHaveBeenCalled();
  });

  it('allows a cancelled task to be removed', async () => {
    render(<ScheduledRow routine={baseRoutine({ status: 'cancelled' })} onResolved={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Remove scheduled task'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove task' }));
    await waitFor(() => expect(routinesApi.deleteRoutine).toHaveBeenCalledWith('r1'));
  });

  it('shows running now in the meta line', () => {
    render(
      <ScheduledRow
        routine={baseRoutine({ running: true })}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByText(/running now/)).toBeTruthy();
  });
});
