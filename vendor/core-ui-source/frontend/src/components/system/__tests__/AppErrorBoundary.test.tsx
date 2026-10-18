/**
 * The app previously had no error boundary at all, so any render throw — or a
 * `lazy()` chunk that 404s after a deploy — unmounted the whole tree and left a
 * blank page.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AppErrorBoundary, isChunkLoadError } from '../AppErrorBoundary';

function Boom({ error }: { error: Error }): JSX.Element {
  throw error;
}

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: /assets/Foo-abc123.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/Foo.css',
  ])('recognises the stale-build shape: %s', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it('recognises ChunkLoadError by name', () => {
    const err = new Error('boom');
    err.name = 'ChunkLoadError';
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('does not treat an ordinary render error as a stale build', () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(
      false,
    );
  });

  it('tolerates non-Error values', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('nope')).toBe(false);
  });
});

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('renders children when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <div>healthy</div>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('healthy')).toBeTruthy();
  });

  it('shows a recoverable panel instead of a blank page on a render error', () => {
    render(
      <AppErrorBoundary>
        <Boom error={new Error('kaboom')} />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('offers a reload for a stale-build chunk failure', () => {
    // Pretend we already auto-reloaded once so the boundary shows UI
    // instead of calling location.reload() during the test.
    sessionStorage.setItem('integral.stale_build_reloaded', '0.1.0');
    render(
      <AppErrorBoundary>
        <Boom
          error={new Error('Failed to fetch dynamically imported module: /a.js')}
        />
      </AppErrorBoundary>,
    );
    expect(
      screen.getByText('A new version of Integral is available'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
  });

  it('auto-reloads once on a stale-build chunk failure', () => {
    sessionStorage.clear();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(
      <AppErrorBoundary>
        <Boom
          error={new Error('Failed to fetch dynamically imported module: /a.js')}
        />
      </AppErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recovers when the child stops throwing after Try again', () => {
    let shouldThrow = true;
    function Flaky(): JSX.Element {
      if (shouldThrow) throw new Error('transient');
      return <div>recovered</div>;
    }

    render(
      <AppErrorBoundary>
        <Flaky />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('recovered')).toBeTruthy();
  });


  it('clears the error when resetKey changes (navigation)', () => {
    // Found in smoke testing: without this the panel stayed up after
    // navigating to a healthy route, so one broken page bricked the app
    // until a manual reload.
    let shouldThrow = true;
    function Flaky(): JSX.Element {
      if (shouldThrow) throw new Error('route blew up');
      return <div>healthy route</div>;
    }

    const { rerender } = render(
      <AppErrorBoundary resetKey="/broken">
        <Flaky />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    // Navigate: the new route renders fine.
    shouldThrow = false;
    rerender(
      <AppErrorBoundary resetKey="/healthy">
        <Flaky />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('healthy route')).toBeTruthy();
  });

  it('re-shows the panel if the new route also throws', () => {
    function AlwaysBroken(): JSX.Element {
      throw new Error('still broken');
    }

    const { rerender } = render(
      <AppErrorBoundary resetKey="/a">
        <AlwaysBroken />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(
      <AppErrorBoundary resetKey="/b">
        <AlwaysBroken />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('supports a custom fallback', () => {
    render(
      <AppErrorBoundary fallback={(err) => <div>custom: {err.message}</div>}>
        <Boom error={new Error('specific')} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText(/custom: specific/)).toBeTruthy();
  });
});
