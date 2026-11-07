import React, { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import {
  ChatPageFocusProvider,
  useChatPageFocus,
} from '../../context/ChatPageFocusContext';

const getEntry = vi.fn();

vi.mock('../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api')>();
  return { ...actual, entriesApi: { ...actual.entriesApi, get: (id: string) => getEntry(id) } };
});

vi.mock('../../components/entries/EntryDetail', () => ({
  EntryDetail: () => <div data-testid="entry-detail" />,
}));

import { EntryPage } from '../EntryPage';
import { IntegralMarkdownLink } from '../../components/ui/IntegralMarkdownLink';

let seen: ReturnType<typeof useChatPageFocus> | null = null;
function Probe() {
  const value = useChatPageFocus();
  useEffect(() => {
    seen = value;
  }, [value]);
  return null;
}

function renderPage() {
  return render(
    <ChatPageFocusProvider>
      <Probe />
      <MemoryRouter initialEntries={['/entries/n.Entry.abc']}>
        <Routes>
          <Route path="entries/:entryId" element={<EntryPage />} />
        </Routes>
      </MemoryRouter>
    </ChatPageFocusProvider>,
  );
}

describe('EntryPage page context', () => {
  afterEach(() => {
    cleanup();
    seen = null;
    getEntry.mockReset();
  });

  it('tells the assistant which entry is open, without the body', async () => {
    getEntry.mockResolvedValue({
      id: 'n.Entry.abc',
      track_id: 'n.Track.docs',
      type: 'document',
      title: 'Q3 board update',
      body: 'SECRET BODY TEXT',
    });
    renderPage();
    await waitFor(() => expect(seen?.focusedEntryId).toBe('n.Entry.abc'));
    expect(seen?.pageKind).toBe('entry_page');
    expect(seen?.focusedTrackId).toBe('n.Track.docs');
    expect(seen?.metadata).toEqual({ entry_title: 'Q3 board update', entry_type: 'document' });
    expect(JSON.stringify(seen)).not.toContain('SECRET BODY TEXT');
  });

  it('publishes nothing while the entry is missing', async () => {
    getEntry.mockRejectedValue(new Error('404'));
    renderPage();
    await waitFor(() => expect(getEntry).toHaveBeenCalled());
    expect(seen?.focusedEntryId).toBeNull();
  });

  it.each([true, false])('opens a repaired citation through the entry API and honors its access result (allowed=%s)', async allowed => {
    if (allowed) {
      getEntry.mockResolvedValue({ id: 'n.Entry.abc', track_id: 'n.Track.actual', title: 'Sample record' });
    } else {
      getEntry.mockRejectedValue(new Error('403'));
    }
    render(
      <ChatPageFocusProvider>
        <Probe />
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<IntegralMarkdownLink href="/tracks/n.Entry.abc">Saved record</IntegralMarkdownLink>} />
            <Route path="entries/:entryId" element={<EntryPage />} />
            <Route path="tracks/:trackId" element={<div>Wrong track destination</div>} />
          </Routes>
        </MemoryRouter>
      </ChatPageFocusProvider>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Saved record' }));
    await waitFor(() => expect(getEntry).toHaveBeenCalledWith('n.Entry.abc'));
    expect(screen.queryByText('Wrong track destination')).not.toBeInTheDocument();
    if (allowed) {
      await screen.findByTestId('entry-detail');
      expect(seen?.focusedEntryId).toBe('n.Entry.abc');
      expect(seen?.focusedTrackId).toBe('n.Track.actual');
    } else {
      await screen.findByText('Entry not found or you no longer have access.');
      expect(screen.queryByTestId('entry-detail')).not.toBeInTheDocument();
      expect(seen?.focusedEntryId).toBeNull();
    }
  });
});
