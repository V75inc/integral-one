/**
 * AppErrorBoundary — the app had none.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * so any component-level bug produced a permanently blank page rather than a
 * degraded one. `App.tsx` wraps its routes in `<Suspense>`, which supplies a
 * *loading* fallback but not an error one — a `lazy()` chunk that fails to
 * fetch lands in the same place.
 *
 * That second case is the routine one, and it is not a bug in anyone's code:
 * after a deploy the hashed chunk filenames change, so a browser holding the
 * previous `index.html` requests a chunk that no longer exists. The user sees
 * a white screen until they happen to hard-reload. We detect that shape
 * specifically and offer a reload, because reloading genuinely fixes it —
 * it fetches the new `index.html` and the new chunk names with it.
 *
 * Deliberately a class component: `componentDidCatch` /
 * `getDerivedStateFromError` have no hook equivalent.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Surface, Text } from '../../ui';
import { Button } from '../ui/Button';
import {
  autoReloadOnceForStaleBuild,
  hasAutoReloadedForStaleBuild,
} from '../../lib/buildVersion';
import { getSystemNotificationsApi } from './SystemNotificationsContext';

interface Props {
  children: ReactNode;
  /** Distinguishes nested boundaries in the reported notification. */
  scope?: string;
  /** Render-prop fallback; falls back to the default panel when omitted. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Changing this clears a caught error. Pass the route pathname so navigating
   * away from a broken page recovers instead of leaving the panel pinned.
   */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * A failed `import()` of a stale chunk, across browsers.
 *
 * Chrome/Edge: "Failed to fetch dynamically imported module"
 * Firefox:     "error loading dynamically imported module"
 * Safari:      "Importing a module script failed"
 * Vite:        surfaces some of these as "Unable to preload CSS" too
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = String(
    (error as { message?: string } | null)?.message ?? error ?? '',
  ).toLowerCase();
  const name = String((error as { name?: string } | null)?.name ?? '');
  return (
    name === 'ChunkLoadError' ||
    message.includes('dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('unable to preload') ||
    message.includes('failed to fetch dynamically')
  );
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  /**
   * Clear the error when the caller signals a new context — in practice the
   * route.
   *
   * Found in smoke testing: a boundary that has caught an error stays in its
   * error state forever, because React never resets it on its own. Navigating
   * to a healthy route left the panel up, so one broken page effectively
   * bricked the whole app until a manual reload. The "Go to dashboard" link
   * only worked because it is a plain `<a>` that reloads the document.
   *
   * `App.tsx` passes the pathname as `resetKey`, so client-side navigation
   * gives the tree an honest second chance. A route that is genuinely broken
   * simply throws again and the panel returns.
   */
  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the component stack in the console — it is the only place the
    // failing component is named, and we are about to replace the tree.
    console.error(
      `[AppErrorBoundary${this.props.scope ? `:${this.props.scope}` : ''}]`,
      error,
      info.componentStack,
    );

    // Stale deploy chunks: auto-reload once so users never need a manual
    // hard-refresh. sessionStorage guards against a reload loop if the new
    // build is itself broken.
    if (isChunkLoadError(error) && autoReloadOnceForStaleBuild()) {
      return;
    }

    // Surface it in the system bar too, so a boundary further down the tree
    // (which renders a small inline panel) still reports app-wide.
    // `getSystemNotificationsApi` is the documented non-React escape hatch.
    const api = getSystemNotificationsApi();
    if (!api) return;
    if (isChunkLoadError(error)) {
      api.notify({
        id: 'system:stale-build',
        type: 'warning',
        title: 'A new version of Integral is available',
        body: hasAutoReloadedForStaleBuild()
          ? 'Reload did not finish updating. Try once more, or open a new tab.'
          : 'Reload to finish updating.',
        dismissible: true,
        actions: [
          { label: 'Reload', onClick: () => window.location.reload() },
        ],
      });
    } else {
      api.notify({
        id: 'system:render-error',
        type: 'error',
        title: 'Something went wrong on this page',
        dismissible: true,
      });
    }
  }

  private reset = (): void => {
    getSystemNotificationsApi()?.dismiss('system:render-error');
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const stale = isChunkLoadError(error);
    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <div className="max-w-md space-y-2">
          <Text variant="heading-sm" as="h1">
            {stale
              ? 'A new version of Integral is available'
              : 'Something went wrong'}
          </Text>
          <Text variant="body-sm" tone="muted" as="p">
            {stale
              ? 'This tab is running an older build and could not load part of the app. Reloading will pick up the new version.'
              : 'This page hit an unexpected error. You can try again, or head back to Home.'}
          </Text>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {stale ? (
            <Button
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          ) : (
            <Button
              type="button"
              onClick={this.reset}
            >
              Try again
            </Button>
          )}
          <Surface tone="panel-2" radius="input">
            <a
              href="/"
              className="block rounded-[var(--radius-input)] px-4 py-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
            >
              <Text variant="body" weight="medium">Go to Home</Text>
            </a>
          </Surface>
        </div>
      </div>
    );
  }
}
