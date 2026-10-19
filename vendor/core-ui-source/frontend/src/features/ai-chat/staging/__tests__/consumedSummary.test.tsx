import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { describeConsumed, extractConsumedNav } from '../consumedSummary';
import type { StagedChange } from '../types';

function staged(partial: Partial<StagedChange>): StagedChange {
  return {
    _kind: 'staged_change',
    token: 'tok',
    kind: 'create_entry',
    summary: '',
    diff_human: '',
    diff_machine: {},
    state: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-01T00:10:00.000Z',
    autonomy_grant_used: false,
    ...partial,
  };
}

describe('extractConsumedNav', () => {
  it('reads flat create_entry payloads', () => {
    const nav = extractConsumedNav(
      { id: 'e-1', title: 'Note', track_id: 't-1' },
      staged({ kind: 'create_entry' }),
    );
    expect(nav).toMatchObject({
      title: 'Note',
      entryId: 'e-1',
      trackId: 't-1',
    });
    expect(nav.created).toEqual([
      { kind: 'entry', id: 'e-1', title: 'Note', trackId: 't-1' },
    ]);
  });

  it('reads file_content wrapped payloads', () => {
    const nav = extractConsumedNav(
      {
        filed: true,
        entry: { id: 'e-2', title: 'Doc', track_id: 't-2' },
      },
      staged({ kind: 'file_content' }),
    );
    expect(nav.entryId).toBe('e-2');
    expect(nav.trackId).toBe('t-2');
  });

  it('reads create_track payloads (flat or API envelope)', () => {
    const flat = extractConsumedNav(
      { id: 't-9', title: 'Sprint board' },
      staged({
        kind: 'create_track',
        diff_machine: { op: 'create_track' },
      }),
    );
    expect(flat).toMatchObject({
      title: 'Sprint board',
      trackId: 't-9',
    });

    const enveloped = extractConsumedNav(
      {
        track: { id: 't-10', title: 'Roadmap' },
        message: 'Track created successfully',
      },
      staged({
        kind: 'create_track',
        diff_machine: { op: 'create_track' },
      }),
    );
    expect(enveloped).toMatchObject({
      title: 'Roadmap',
      trackId: 't-10',
    });
  });

  it('reads create_app payloads (flat or API envelope) for quick-nav (June 29 QA #3)', () => {
    const enveloped = extractConsumedNav(
      {
        app: { id: 'app-1', name: 'Vendor Contracts' },
        message: 'App created successfully',
      },
      staged({
        kind: 'create_app',
        diff_machine: { op: 'create_app' },
      }),
    );
    expect(enveloped).toMatchObject({
      title: 'Vendor Contracts',
      appId: 'app-1',
    });

    const flat = extractConsumedNav(
      { id: 'app-2', name: 'Service Tickets' },
      staged({
        kind: 'create_app',
        diff_machine: { op: 'create_app' },
      }),
    );
    expect(flat).toMatchObject({
      title: 'Service Tickets',
      appId: 'app-2',
    });
  });

  it('unwraps nested entry envelopes from file_content', () => {
    const nav = extractConsumedNav(
      {
        filed: true,
        entry: {
          entry: { id: 'e-3', title: 'Note', track_id: 't-3' },
          message: 'Entry created successfully',
        },
      },
      staged({ kind: 'file_content' }),
    );
    expect(nav.entryId).toBe('e-3');
    expect(nav.trackId).toBe('t-3');
  });

  it('collects a nav link per created resource from a BATCH result (June 29 QA #3)', () => {
    // The realistic agent app-creation path: create_app + tracks staged as ONE
    // batch, blessed in one approval → executor returns {batched, results:[…]}.
    const nav = extractConsumedNav(
      {
        batched: true,
        completed: 3,
        total: 3,
        results: [
          { kind: 'create_app', result: { app: { id: 'app-9', name: 'Service Tickets' } } },
          { kind: 'create_track', result: { track: { id: 't-1', title: 'Tickets' } } },
          {
            kind: 'create_entry',
            result: { id: 'e-1', title: 'First ticket', track_id: 't-1' },
          },
        ],
      },
      staged({ kind: 'batch', summary: 'workflow (3 steps)', diff_machine: {} }),
    );
    expect(nav.created).toEqual([
      { kind: 'app', id: 'app-9', title: 'Service Tickets' },
      { kind: 'track', id: 't-1', title: 'Tickets' },
      { kind: 'entry', id: 'e-1', title: 'First ticket', trackId: 't-1' },
    ]);
    expect(nav.appId).toBe('app-9');
  });

  it('renders links (incl. the app) for a consumed batch', () => {
    const stagedBatch = staged({
      kind: 'batch',
      summary: 'workflow (2 steps)',
    });
    const nav = extractConsumedNav(
      {
        batched: true,
        results: [
          { kind: 'create_app', result: { app: { id: 'app-9', name: 'Service Tickets' } } },
          { kind: 'create_track', result: { track: { id: 't-1', title: 'Tickets' } } },
        ],
      },
      stagedBatch,
    );
    const html = renderToStaticMarkup(
      <MemoryRouter>{describeConsumed(stagedBatch, nav)}</MemoryRouter>,
    );
    // App gets a real /apps/ link (the QA gap), track gets its /tracks/ link.
    expect(html).toContain('href="/apps/app-9"');
    expect(html).toContain('Service Tickets');
    expect(html).toContain('href="/tracks/t-1"');
    expect(html).toContain('Tickets');
  });

  it('reads update_entry API envelopes', () => {
    const nav = extractConsumedNav(
      {
        entry: { id: 'e-4', title: 'Sprint item', track_id: 't-4' },
        message: 'Entry updated successfully',
      },
      staged({
        kind: 'update_entry',
        diff_machine: { op: 'update_entry', entry_id: 'e-4' },
      }),
    );
    expect(nav).toMatchObject({
      title: 'Sprint item',
      entryId: 'e-4',
      trackId: 't-4',
    });
  });
});
