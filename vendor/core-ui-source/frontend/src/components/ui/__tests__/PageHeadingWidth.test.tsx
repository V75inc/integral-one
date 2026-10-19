/**
 * A page title must survive a narrowed container.
 *
 * The header switches from a column to a row on the VIEWPORT breakpoint, but
 * its container can be much narrower than the viewport — the assistant dock
 * insets it by `--assistant-dock-w`. Measured on the live app at 1440px with
 * the dock open: the header had 622px, the action cluster took ~477px, and
 * "Venture Factory" rendered as "Ve…" in the 145px that remained.
 *
 * A bare `min-width` floor was not enough. 10rem still fit alongside the
 * action cluster in that 622px header, so nothing wrapped and the title
 * clipped to "Product Pi…" in the 308px left over. Asking for a 24rem basis
 * instead means the row cannot seat title AND actions when the container is
 * narrow, so the actions wrap to their own line and the title gets the width;
 * `flex-1` still lets it grow past 24rem when there is room. `sm+` only —
 * below that the parent is a column and the title already spans it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// @ts-expect-error Node built-ins are available at vitest runtime; the project
// doesn't ship @types/node so the typed import is unavailable.
import * as fs from 'node:fs';

import { PageHeading } from '../PageHeading';

afterEach(cleanup);

describe('PageHeading', () => {
  it('asks for enough width that a squeezed row wraps instead of clipping', () => {
    render(<PageHeading>Venture Factory</PageHeading>);
    const h1 = screen.getByRole('heading', { level: 1 });
    // 24rem is the ask; paired with the header row's `flex-wrap` it pushes the
    // action cluster onto its own line rather than letting it squeeze the
    // title. A plain `min-w` floor was tried first and still clipped.
    expect(h1.className).toContain('sm:basis-96');
    expect(h1.className).not.toContain('sm:min-w-[10rem]');
    // Still able to shrink and to grow past the basis when there is room.
    expect(h1.className).toContain('min-w-0');
    expect(h1.className).toContain('flex-1');
  });

  it('is paired with a wrapping header row', () => {
    // The basis only helps if the row is allowed to wrap; without
    // `md:flex-wrap` on the header the actions stay put and squeeze the
    // title regardless of what it asks for.
    for (const f of [
      'src/components/tracks/detail/TrackDetailHeader.tsx',
      'src/pages/AppDetailPage.tsx',
    ]) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src, f).toMatch(/md:flex-row md:flex-wrap/);
    }
  });

  it('still renders the full title text for assistive tech', () => {
    render(<PageHeading>Venture Factory</PageHeading>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Venture Factory');
  });
});
