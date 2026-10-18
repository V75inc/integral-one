import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const api = vi.hoisted(() => ({
  entry: { get: vi.fn() },
  job: { get: vi.fn() },
  tools: { call: vi.fn() },
}));

vi.mock('../../../api', () => ({ entriesApi: api.entry }));
vi.mock('../../../api/workItems', () => ({ workItemsApi: api.job }));
vi.mock('../../../api/tools', () => ({ toolsApi: api.tools }));

import { ProcessingStatusWidget } from '../ProcessingStatusWidget';
import type { SavedView } from '../../../types';

const STAGES = [
  { label: 'Draft', statuses: ['draft'] },
  { label: 'Working', statuses: ['working', 'failed'] },
  { label: 'Done', statuses: ['done'] },
];

function view(extra: Record<string, unknown> = {}): SavedView {
  return {
    id: 'v1',
    type: 'region-system/processing-status',
    track_id: 't1',
    name: 'Status',
    config: {
      title: 'Processing',
      stages: STAGES,
      active_statuses: ['working'],
      failed_statuses: ['failed'],
      error_field: 'problem',
      job_field: 'job',
      retry: { tool: 'restart_it', label: 'Try again' },
      __bindings: { entryId: 'e1' },
      ...extra,
    },
  } as unknown as SavedView;
}

function show(v: SavedView) {
  return render(<ProcessingStatusWidget view={v} entries={[]} isLoading={false} onEntryOpen={() => undefined} />);
}

function entryWith(fields: Record<string, unknown>) {
  api.entry.get.mockResolvedValue({ id: 'e1', custom_fields: fields });
}

describe('ProcessingStatusWidget', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('shows the status, the stage track and job progress while work is active', async () => {
    entryWith({ status: 'working', job: 'job-1' });
    api.job.get.mockResolvedValue({ progress: { done: 3, total: 10, label: '3 of 10 done' }, failure: null });
    show(view());
    expect(await screen.findByText('working')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(await screen.findByText('3 of 10 done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
  });

  it('shows the reason and a retry when the record has stopped', async () => {
    entryWith({ status: 'failed', problem: 'The rates page is missing' });
    show(view());
    expect(await screen.findByRole('alert')).toHaveTextContent('The rates page is missing');
    api.tools.call.mockResolvedValue({ output: { ok: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.tools.call).toHaveBeenCalledWith('restart_it', { entry_id: 'e1' }));
  });

  it('reports a retry the tool refuses', async () => {
    entryWith({ status: 'failed', problem: 'x' });
    api.tools.call.mockResolvedValue({ output: { ok: false, reason: 'Not now' } });
    show(view());
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Not now')).toBeInTheDocument();
  });

  it('shows neither progress nor an alert once finished', async () => {
    entryWith({ status: 'done' });
    show(view());
    expect(await screen.findByText('done')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders nothing without a record', () => {
    const { container } = show(view({ __bindings: {} }));
    expect(container).toBeEmptyDOMElement();
  });
});
