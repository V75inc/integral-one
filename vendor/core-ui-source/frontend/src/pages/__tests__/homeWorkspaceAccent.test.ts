import { describe, expect, it } from 'vitest';
// @ts-expect-error Node built-ins exist in Vitest; frontend does not ship @types/node.
import { readFileSync } from 'node:fs';

const styles = readFileSync('src/index.css', 'utf8');

describe('Home card workspace accent', () => {
  it('inherits the active workspace token instead of the fixed brand fallback', () => {
    const rule = styles.match(/\.home-overview section\.home-widget\s*\{([^}]+)\}/)?.[1];
    expect(rule).toContain('border-top: 3px solid var(--brand-accent)');
    expect(rule).not.toContain('--brand-accent-default');
  });
});
