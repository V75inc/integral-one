/**
 * ProvenanceBadge Vitest — TEST-04 Plan 07-05 (UX-01).
 *
 * Per CONTEXT lock #UX-01 the badge MUST render distinct visual variants
 * for each of the four ActorKind sources, AND open a detail popover on
 * click. These are the four cases asserted here.
 *
 * The component is the SOLE consumer of ``Entry.provenance.source`` in the
 * frontend (I-UX-01 in docs/INVARIANTS.md) — this test pins the variant
 * mapping so a future refactor cannot silently drop a source kind.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

import { ProvenanceBadge } from '../ProvenanceBadge';
import type { ActorKind, Entry, Provenance } from '../../../types';

afterEach(() => {
  // RTL needs explicit cleanup under Vitest (globals: off) to scope
  // screen.queryByTestId per test — otherwise prior renders leak into
  // subsequent assertions. Mirrors EntryDetail.related_views.test.tsx.
  cleanup();
});

function renderBadge(entry: Pick<Entry, 'id' | 'provenance'>) {
  return render(
    <MemoryRouter>
      <ProvenanceBadge entry={entry} />
    </MemoryRouter>,
  );
}

function buildEntry(
  source: ActorKind,
  extra: Partial<Provenance> = {},
): Pick<Entry, 'id' | 'provenance'> {
  return {
    id: 'e-1',
    provenance: {
      source,
      synced_at: '2026-05-17T00:00:00Z',
      confidence: 1.0,
      ...extra,
    },
  };
}

describe('<ProvenanceBadge />', () => {
  it.each(['agent', 'connector', 'system'] as const)(
    'renders distinct testid for source=%s',
    source => {
      renderBadge(buildEntry(source));
      expect(
        screen.getByTestId(`provenance-badge-${source}`),
      ).toBeInTheDocument();
    },
  );

  it('renders nothing for source="human" (default — internal label hidden, B-ENT-07)', () => {
    const { container } = renderBadge(buildEntry('human'));
    expect(container.firstChild).toBeNull();
  });

  it('opens detail popover (role=dialog) on button click', () => {
    renderBadge(buildEntry('connector'));
    const trigger = screen.getByRole('button', {
      name: /Provenance: connector/i,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('links popover to Audit log filtered by entry', () => {
    renderBadge(buildEntry('agent'));
    fireEvent.click(screen.getByRole('button'));
    const link = screen.getByRole('link', { name: /View in Audit log/i });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/settings#audit-log'),
    );
    expect(link.getAttribute('href')).toContain('resource_id=e-1');
    expect(link.getAttribute('href')).toContain('actor_kind=agent');
  });

  it('renders connector source_id parsed into connector/external parts', () => {
    renderBadge(
      buildEntry('connector', {
        source_id: 'github_issues:org/repo#42',
      }),
    );
    fireEvent.click(screen.getByRole('button'));
    // The popover surfaces a "Connector " + "External " pair when the
    // source_id parses (see parseConnectorSourceId in ProvenanceBadge.tsx).
    // Match the parsed parts directly to avoid colliding with the badge
    // label which also contains "connector".
    expect(screen.getByText(/github_issues/)).toBeInTheDocument();
    expect(screen.getByText(/org\/repo#42/)).toBeInTheDocument();
    expect(screen.getByText(/External/)).toBeInTheDocument();
  });

  it('renders nothing when entry.provenance is missing (defaults to human)', () => {
    // Defensive default — legacy entries missing the provenance bag default
    // to 'human', which now renders nothing per B-ENT-07.
    const { container } = renderBadge(
      { id: 'e-2' } as Pick<Entry, 'id' | 'provenance'>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when an unknown source value arrives (falls back to human)', () => {
    const { container } = renderBadge({
      id: 'e-3',
      provenance: { source: 'unknown-source' as unknown as ActorKind },
    });
    expect(container.firstChild).toBeNull();
  });

  it('does not render confidence row when confidence == 1', () => {
    renderBadge(buildEntry('agent', { confidence: 1.0 }));
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText(/Confidence/i)).toBeNull();
  });

  it('renders confidence row when confidence < 1', () => {
    renderBadge(buildEntry('agent', { confidence: 0.72 }));
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/Confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/72%/)).toBeInTheDocument();
  });
});
