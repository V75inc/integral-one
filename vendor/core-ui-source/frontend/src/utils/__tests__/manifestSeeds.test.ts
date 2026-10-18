import { describe, expect, it } from 'vitest';
import {
  countManifestSeedEntries,
  manifestHasSeedEntries,
  summarizeManifestSeeds,
} from '../manifestSeeds';

describe('manifestSeeds', () => {
  it('counts seed entries across track groups', () => {
    const manifest = {
      app: {
        seeds: [
          { track: 'source_material', entries: [{ title: 'A' }, { title: 'B' }] },
          { track: 'pipeline', entries: [{ title: 'C' }] },
        ],
      },
    };
    expect(countManifestSeedEntries(manifest)).toBe(3);
    expect(manifestHasSeedEntries(manifest)).toBe(true);
    expect(summarizeManifestSeeds(manifest)).toEqual([
      { track: 'source_material', count: 2 },
      { track: 'pipeline', count: 1 },
    ]);
  });

  it('returns zero for missing or empty seeds', () => {
    expect(countManifestSeedEntries(undefined)).toBe(0);
    expect(countManifestSeedEntries({ app: { seeds: [] } })).toBe(0);
    expect(manifestHasSeedEntries({ app: {} })).toBe(false);
  });
});
