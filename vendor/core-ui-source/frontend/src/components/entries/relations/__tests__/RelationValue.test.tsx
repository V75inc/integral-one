/**
 * RelationValue Vitest — shared renderer for resolved relation values.
 *
 * Covers:
 *  - inline variant: comma-joined links
 *  - chips variant: pill list with links
 *  - cell variant: single-line truncated
 *  - skeleton shown while loading
 *  - "Entry XXXXXX" fallback on resolve failure
 *  - empty value renders emptyFallback
 *  - link routes for entry (with trackId) and track targets
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

import { RelationValue } from '../RelationValue';
import apiClient from '../../../../api/client';

// RelationValue resolves ids through useRelationLabels -> relationTargetLoader,
// which batches every id requested in a tick into one POST /entry-lookup via
// apiClient — it never calls entriesApi/tracksApi directly, so mocking those
// (as this file used to) mocks the wrong boundary and every fetch silently
// falls through to the id-suffix fallback label instead of the mocked title.
vi.mock('../../../../api/client', () => ({
  default: { post: vi.fn() },
}));

type PostMock = ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('<RelationValue />', () => {
  it('renders comma-joined links for inline variant', async () => {
    (apiClient.post as PostMock).mockImplementation(
      async (_url: string, body: { ids: string[] }) => ({
        data: {
          targets: body.ids.map(id => ({ id, title: `Title-${id}`, track_id: 't1' })),
        },
      })
    );
    render(
      wrap(
        <RelationValue
          value={['a', 'b']}
          relation={{ target: 'entry' }}
          variant="inline"
        />
      )
    );
    await waitFor(() => {
      expect(screen.getByText('Title-a')).toBeInTheDocument();
      expect(screen.getByText('Title-b')).toBeInTheDocument();
    });
    expect(screen.getByText('Title-a').closest('a')).toHaveAttribute(
      'href',
      '/tracks/t1?entry=a'
    );
  });

  it('renders skeleton while loading', () => {
    (apiClient.post as PostMock).mockReturnValue(new Promise(() => {})); // never resolves
    render(wrap(<RelationValue value="x" relation={{ target: 'entry' }} />));
    expect(document.querySelector('[data-relation-skeleton="1"]')).toBeTruthy();
  });

  it('renders fallback on fetch failure', async () => {
    (apiClient.post as PostMock).mockRejectedValue(new Error('boom'));
    render(
      wrap(<RelationValue value="abcdef123456" relation={{ target: 'entry' }} />)
    );
    await waitFor(() =>
      expect(screen.getByText('Entry 123456')).toBeInTheDocument()
    );
    expect(screen.getByText('Entry 123456').closest('a')).toBeNull();
  });

  it('renders emptyFallback for empty value', () => {
    render(
      wrap(
        <RelationValue
          value={[]}
          relation={{ target: 'entry' }}
          emptyFallback={<span>—</span>}
        />
      )
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('routes to /tracks/{id} for track-kind targets', async () => {
    (apiClient.post as PostMock).mockResolvedValue({
      data: { targets: [{ id: 't42', title: 'Roadmap' }] },
    });
    render(
      wrap(<RelationValue value="t42" relation={{ target: 'track' }} />)
    );
    await waitFor(() => expect(screen.getByText('Roadmap')).toBeInTheDocument());
    expect(screen.getByText('Roadmap').closest('a')).toHaveAttribute(
      'href',
      '/tracks/t42'
    );
  });

  it('chips variant renders pill class', async () => {
    (apiClient.post as PostMock).mockResolvedValue({
      data: { targets: [{ id: 'e1', title: 'Acme', track_id: 't1' }] },
    });
    render(
      wrap(
        <RelationValue
          value="e1"
          relation={{ target: 'entry' }}
          variant="chips"
        />
      )
    );
    await waitFor(() => {
      const link = screen.getByText('Acme').closest('a');
      expect(link?.className).toMatch(/rounded-full/);
    });
  });

  it('cell variant renders single-line truncated span with title tooltip', async () => {
    (apiClient.post as PostMock).mockImplementation(
      async (_url: string, body: { ids: string[] }) => ({
        data: {
          targets: body.ids.map(id => ({ id, title: `Title-${id}`, track_id: 't1' })),
        },
      })
    );
    render(
      wrap(
        <RelationValue
          value={['a', 'b']}
          relation={{ target: 'entry' }}
          variant="cell"
        />
      )
    );
    await waitFor(() => expect(screen.getByText('Title-a')).toBeInTheDocument());
    const outer = screen.getByText('Title-a').closest('span[title]');
    expect(outer).not.toBeNull();
    expect(outer).toHaveAttribute('title', 'Title-a, Title-b');
    expect(outer?.className).toMatch(/truncate/);
  });

  it('maxItems truncates and renders a +N overflow indicator', async () => {
    (apiClient.post as PostMock).mockImplementation(
      async (_url: string, body: { ids: string[] }) => ({
        data: {
          targets: body.ids.map(id => ({ id, title: `Title-${id}`, track_id: 't1' })),
        },
      })
    );
    render(
      wrap(
        <RelationValue
          value={['a', 'b', 'c', 'd', 'e']}
          relation={{ target: 'entry' }}
          maxItems={3}
        />
      )
    );
    await waitFor(() => expect(screen.getByText('Title-a')).toBeInTheDocument());
    expect(screen.getByText('Title-b')).toBeInTheDocument();
    expect(screen.getByText('Title-c')).toBeInTheDocument();
    expect(screen.queryByText('Title-d')).toBeNull();
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
  });
});
