/**
 * Deploy / stale-tab recovery helpers.
 *
 * ``WEB_ASSET_VERSION`` must match between the SPA build
 * (``VITE_WEB_ASSET_VERSION``) and the API (``INTEGRAL_WEB_ASSET_VERSION``).
 * Deploys set both to the same value (git SHA, release tag, …). Local
 * defaults stay in lockstep via package/app version ``0.1.0``.
 */

export const STALE_BUILD_RELOAD_KEY = 'integral.stale_build_reloaded';

/** Client asset version baked in at Vite build time. */
export const CLIENT_WEB_ASSET_VERSION: string =
  (import.meta.env.VITE_WEB_ASSET_VERSION as string | undefined)?.trim() ||
  '0.1.0';

/**
 * Drop the auto-reload marker when this tab is running a *different* asset
 * version than the one that triggered a reload — i.e. the reload worked.
 * Leaving the marker when versions match prevents an infinite reload loop.
 */
export function clearStaleBuildReloadFlag(): void {
  try {
    const prior = sessionStorage.getItem(STALE_BUILD_RELOAD_KEY);
    if (prior && prior !== CLIENT_WEB_ASSET_VERSION) {
      sessionStorage.removeItem(STALE_BUILD_RELOAD_KEY);
    }
  } catch {
    /* private mode / disabled storage */
  }
}

/** True when we already auto-reloaded for *this* client asset version. */
export function hasAutoReloadedForStaleBuild(): boolean {
  try {
    return sessionStorage.getItem(STALE_BUILD_RELOAD_KEY) === CLIENT_WEB_ASSET_VERSION;
  } catch {
    return true;
  }
}

/** Mark + reload once per client asset version. Returns false if already tried. */
export function autoReloadOnceForStaleBuild(): boolean {
  if (hasAutoReloadedForStaleBuild()) return false;
  try {
    sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, CLIENT_WEB_ASSET_VERSION);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
