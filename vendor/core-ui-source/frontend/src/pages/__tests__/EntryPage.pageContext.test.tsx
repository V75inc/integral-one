import React, { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
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
});
