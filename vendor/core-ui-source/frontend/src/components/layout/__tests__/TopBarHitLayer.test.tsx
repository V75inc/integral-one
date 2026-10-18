/**
 * The top bar's empty middle must be click-through.
 *
 * `Layout` renders `TopBar` as an absolutely-positioned transparent overlay
 * across the whole main column, and its comment has always claimed the empty
 * middle is click-through. It was not: a single `pointer-events-auto` wrapper
 * re-enabled the whole bar, so it swallowed clicks on whatever the page put in
 * its top ~58px.
 *
 * Found on `/agent`, where the conversation rail's top padding was reduced to
 * reclaim empty space: the agent-switcher row then sat on the boundary and its
 * upper half was dead. Measured with `elementFromPoint` — a click at the row's
 * top edge returned the `<header>`, not the row.
 *
 * jsdom has no layout, so hit-testing cannot be reproduced here. What IS
 * checkable is the invariant the fix rests on: the bar and its full-width
 * breadcrumb nav are click-through, and every interactive cluster re-enables
 * pointer events for itself. If someone reinstates a blanket
 * `pointer-events-auto`, this fails.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TopBar } from '../TopBar';
import { ThemeProvider } from '../../../context/ThemeContext';

// The right cluster's notifications button polls on an interval and fetches
// approvals; left real it resolves after the test environment is torn down and
// Vitest reports an unhandled `window is not defined`. Nothing here is about
// notifications — stub it to a plain button so the cluster still renders.
vi.mock('../NotificationsHeaderButton', () => ({
  NotificationsHeaderButton: () => (
    <button type="button" aria-label="Inbox">
      inbox
    </button>
  ),
}));

afterEach(cleanup);

function renderBar(crumbs: { label: string; to?: string }[] = []) {
  // The notifications button in the right cluster fetches; give it a client
  // with retries off so a failed fetch stays quiet.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <TopBar
            crumbs={crumbs}
            isDesktop
            mobileNavOpen={false}
            onToggleMobileNav={() => {}}
          />
        </ThemeProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('TopBar hit layer', () => {
  it('the bar itself does not take pointer events', () => {
    const { container } = renderBar();
    const header = container.querySelector('header');
    expect(header?.className).toContain('pointer-events-none');
  });

  it('the breadcrumb nav is click-through — it spans the empty middle', () => {
    // `flex-1` makes this element as wide as the gap between the clusters, so
    // it is the one that would swallow clicks on the page beneath.
    const { container } = renderBar();
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]');
    expect(nav?.className).toContain('pointer-events-none');
    expect(nav?.className).toContain('flex-1');
  });

  it('crumbs re-enable pointer events for themselves', () => {
    const { container } = renderBar([
      { label: 'Home', to: '/' },
      { label: 'Tracks' },
    ]);
    const crumbLink = screen.getByText('Home');
    const crumbWrapper = crumbLink.closest('span');
    expect(crumbWrapper?.className).toContain('pointer-events-auto');
    // …and the nav they sit in still does not.
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]');
    expect(nav?.className).toContain('pointer-events-none');
  });

  it('the right-hand control cluster stays interactive', () => {
    renderBar();
    const themeToggle = screen.getByLabelText(/Switch to (light|dark) mode/);
    const cluster = themeToggle.parentElement;
    expect(cluster?.className).toContain('pointer-events-auto');
  });
});
