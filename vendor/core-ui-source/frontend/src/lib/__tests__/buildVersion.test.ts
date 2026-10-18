import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import {
  CLIENT_WEB_ASSET_VERSION,
  STALE_BUILD_RELOAD_KEY,
  autoReloadOnceForStaleBuild,
  clearStaleBuildReloadFlag,
  hasAutoReloadedForStaleBuild,
} from '../buildVersion';

describe('buildVersion auto-reload guard', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('auto-reloads once per client asset version', () => {
    expect(hasAutoReloadedForStaleBuild()).toBe(false);
    expect(autoReloadOnceForStaleBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STALE_BUILD_RELOAD_KEY)).toBe(
      CLIENT_WEB_ASSET_VERSION,
    );
    expect(hasAutoReloadedForStaleBuild()).toBe(true);
    expect(autoReloadOnceForStaleBuild()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('clears the marker only when the client version advanced', () => {
    sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, 'old-build');
    clearStaleBuildReloadFlag();
    expect(sessionStorage.getItem(STALE_BUILD_RELOAD_KEY)).toBeNull();

    sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, CLIENT_WEB_ASSET_VERSION);
    clearStaleBuildReloadFlag();
    expect(sessionStorage.getItem(STALE_BUILD_RELOAD_KEY)).toBe(
      CLIENT_WEB_ASSET_VERSION,
    );
  });
});
