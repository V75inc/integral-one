/** Count seed entries declared in an app-scope manifest's ``app.seeds[]``. */

export function countManifestSeedEntries(
  manifest: Record<string, unknown> | undefined | null,
): number {
  const app = (manifest?.app as Record<string, unknown> | undefined) || {};
  const seeds = app.seeds;
  if (!Array.isArray(seeds)) return 0;
  let count = 0;
  for (const group of seeds) {
    if (!group || typeof group !== 'object') continue;
    const entries = (group as { entries?: unknown }).entries;
    if (Array.isArray(entries)) count += entries.length;
  }
  return count;
}

export function manifestHasSeedEntries(
  manifest: Record<string, unknown> | undefined | null,
): boolean {
  return countManifestSeedEntries(manifest) > 0;
}

/** Summarize seeds by track for install capability prompts. */
export function summarizeManifestSeeds(
  manifest: Record<string, unknown> | undefined | null,
): { track: string; count: number }[] {
  const app = (manifest?.app as Record<string, unknown> | undefined) || {};
  const seeds = app.seeds;
  if (!Array.isArray(seeds)) return [];
  const out: { track: string; count: number }[] = [];
  for (const group of seeds) {
    if (!group || typeof group !== 'object') continue;
    const track = String((group as { track?: unknown }).track || '').trim();
    const entries = (group as { entries?: unknown }).entries;
    const count = Array.isArray(entries) ? entries.length : 0;
    if (track && count > 0) out.push({ track, count });
  }
  return out;
}
