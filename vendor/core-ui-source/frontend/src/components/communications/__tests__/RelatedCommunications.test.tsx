/**
 * Phase 19 EML-04 — Related communications projection tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../api/connectors', () => ({
  connectorsApi: {
    listRelatedCommunications: vi.fn(),
    linkRelatedCommunication: vi.fn(),
    unlinkRelatedCommunication: vi.fn(),
  },
}));

import { connectorsApi } from '../../../api/connectors';
import { RelatedCommunications } from '../RelatedCommunications';

const listMock = connectorsApi.listRelatedCommunications as unknown as ReturnType<typeof vi.fn>;
const linkMock = connectorsApi.linkRelatedCommunication as unknown as ReturnType<typeof vi.fn>;
const unlinkMock = connectorsApi.unlinkRelatedCommunication as unknown as ReturnType<typeof vi.fn>;

const sampleThreads = [
  {
    id: 'thread-1',
    title: 'Renewal',
    subject: 'Renewal pricing 2027',
    message_count: 3,
    last_message_at: '2026-05-23T12:00:00+00:00',
    gmail_thread_id: 't1',
    gmail_labels: ['Label_Sales'],
  },
  {
    id: 'thread-2',
    title: 'Login issue',
    subject: 'Cannot log in',
    message_count: 1,
    last_message_at: '2026-05-20T09:00:00+00:00',
    gmail_thread_id: 't2',
    gmail_labels: ['Label_Support'],
  },
];

function renderPanel(entryId = 'entry-1') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RelatedCommunications entryId={entryId} />
    </QueryClientProvider>,
  );
}

describe('RelatedCommunications', () => {
  beforeEach(() => {
    listMock.mockReset();
    linkMock.mockReset();
    unlinkMock.mockReset();
  });

  it('renders linked threads newest-first', async () => {
    listMock.mockResolvedValue({ threads: sampleThreads });
    renderPanel();
    await waitFor(() => screen.getByTestId('related-thread-thread-1'));
    expect(screen.getByTestId('related-thread-thread-1')).toBeInTheDocument();
    expect(screen.getByTestId('related-thread-thread-2')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith('entry-1');
  });

  it('Link button calls linkRelatedCommunication with the typed thread id', async () => {
    listMock.mockResolvedValueOnce({ threads: [] });
    linkMock.mockResolvedValue({
      status: 'linked',
      entry_id: 'entry-1',
      thread_id: 'thread-new',
    });
    listMock.mockResolvedValueOnce({ threads: sampleThreads });
    renderPanel();
    await waitFor(() => screen.getByTestId('related-link-input'));
    fireEvent.change(screen.getByTestId('related-link-input'), {
      target: { value: 'thread-new' },
    });
    fireEvent.click(screen.getByTestId('related-link-button'));
    await waitFor(() =>
      expect(linkMock).toHaveBeenCalledWith('entry-1', 'thread-new'),
    );
  });

  it('Unlink removes the row optimistically and calls unlink API', async () => {
    listMock.mockResolvedValue({ threads: sampleThreads });
    unlinkMock.mockResolvedValue({ removed: 1 });
    renderPanel();
    await waitFor(() => screen.getByTestId('related-thread-thread-1'));
    fireEvent.click(screen.getByTestId('related-unlink-thread-1'));
    await waitFor(() =>
      expect(unlinkMock).toHaveBeenCalledWith('entry-1', 'thread-1'),
    );
  });
});
