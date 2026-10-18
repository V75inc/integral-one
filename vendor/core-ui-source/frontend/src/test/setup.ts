import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);

/**
 * jsdom ships no `matchMedia`, so anything reaching `useIsMdUp` throws on
 * first render. Rather than stubbing a constant `true` — which would quietly
 * make every `(max-width: …)` query wrong and hide real responsive bugs —
 * evaluate the common width forms against `window.innerWidth` (jsdom
 * defaults to 1024, i.e. desktop). Tests that need the mobile branch can set
 * `window.innerWidth` and dispatch `resize`.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  const listeners = new Set<() => void>();

  const evaluate = (query: string): boolean => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    if (min) return window.innerWidth >= Number(min[1]);
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    if (max) return window.innerWidth <= Number(max[1]);
    return false;
  };

  window.addEventListener('resize', () => {
    for (const fn of listeners) fn();
  });

  window.matchMedia = (query: string): MediaQueryList => {
    const mql = {
      get matches() {
        return evaluate(query);
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      // Deprecated pair, still called by some libraries.
      addListener: (fn: () => void) => listeners.add(fn),
      removeListener: (fn: () => void) => listeners.delete(fn),
      dispatchEvent: () => false,
    };
    return mql as unknown as MediaQueryList;
  };
}

afterEach(() => {
  cleanup();
});
