import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockGet = vi.fn();

vi.mock('../../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api')>();
  return {
    ...actual,
    entriesApi: { ...actual.entriesApi, get: (id: string) => mockGet(id) },
  };
});

import { StaticContentWidget } from '../StaticContentWidget';
import type { SavedView } from '../../../types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function baseView(config: Record<string, unknown>): SavedView {
  return {
    id: 'view-1',
    name: 'Notes',
    type: 'static_content',
    track_id: 'track-1',
    config,
  };
}

describe('StaticContentWidget', () => {
  it('renders inline body without fetching an entry', () => {
    render(
      <StaticContentWidget
        view={baseView({ body: '**Hello world**' })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('reads body from a field on the bound entry when body_field is set', async () => {
    mockGet.mockResolvedValue({
      id: 'entry-1',
      title: 'Filing',
      custom_fields: { instructions: 'Fill in every row' },
    });
    render(
      <StaticContentWidget
        view={baseView({
          body_field: 'instructions',
          __bindings: { entryId: 'entry-1' },
        })}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Fill in every row')).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith('entry-1');
  });

  it('renders nothing when there is no body to show', () => {
    const { container } = render(
      <StaticContentWidget
        view={baseView({})}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
