/**
 * Full-height pages must subtract the system bar — August 5 QA item 3,
 * "Unwanted Horizontal Blank Space Appears at the Bottom of the Page".
 *
 * `App.tsx` pads the layout root by `--system-bar-h` so the fixed bar doesn't
 * cover the app. A child asking for a bare `100vh` therefore makes the
 * document `100vh + bar` tall: the page scrolls by exactly the bar's height
 * and a strip of `--bg` shows under the fold. It survives a reload because it
 * is layout, not state.
 *
 * Measured before the fix with the bar at 48px: document scrollHeight 768
 * against a 720px viewport — 48px of overflow, matching exactly.
 *
 * The rule lives in CSS rather than at the ~19 call sites so pages added later
 * are correct without having to remember. This asserts the rule is present and
 * still specific enough to win: `.system-bar-layout .min-h-screen` (0,2,0)
 * against Tailwind's own `.min-h-screen` (0,1,0), in the same layer.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error Node built-ins are available at vitest runtime; the project
// doesn't ship @types/node so the typed import is unavailable.
import * as fs from 'node:fs';
// @ts-expect-error see comment above
import * as path from 'node:path';

declare const process: { cwd(): string };

const css = fs.readFileSync(
  path.resolve(process.cwd(), 'src/index.css'),
  'utf-8',
);

describe('system-bar viewport height', () => {
  it.each(['min-h-screen', 'h-screen'])(
    'scopes %s inside the pushed-down layout',
    (utility) => {
      const rule = new RegExp(
        String.raw`\.system-bar-layout\s+\.${utility}\s*\{[^}]*calc\(100vh\s*-\s*var\(--system-bar-h,\s*0px\)\)`,
      );
      expect(css).toMatch(rule);
    },
  );

  it('keeps the layout wrapper padded by the same variable', () => {
    // If this ever stops being a padded wrapper, the override above becomes a
    // double subtraction rather than a correction.
    const app = fs.readFileSync(
      path.resolve(process.cwd(), 'src/App.tsx'),
      'utf-8',
    );
    expect(app).toContain('system-bar-layout');
    expect(app).toMatch(/paddingTop:\s*'var\(--system-bar-h, 0px\)'/);
  });
});
