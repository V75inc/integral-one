import type { OperationalModelNode } from '../types';

export type OperationalModelSelectRow = {
  value: string;
  triggerLabel: string;
  label: string;
  description: string;
};

/** Options for library operational model pickers (base row + packages). */
export function operationalModelLibrarySelectOptions(
  packages: OperationalModelNode[],
  opts?: { emptyDescription?: string }
): OperationalModelSelectRow[] {
  const emptyDescription =
    opts?.emptyDescription ??
    'Built-in base profile. No library package merged on create.';
  const base: OperationalModelSelectRow = {
    value: '',
    triggerLabel: 'Default (base model)',
    label: 'Default (base model)',
    description: emptyDescription,
  };
  const rest = packages.map(pkg => {
    const title = `${pkg.name || pkg.id}${pkg.version ? ` (${pkg.version})` : ''}`;
    const raw = (pkg.description && pkg.description.trim()) || '';
    const desc = raw || 'No description.';
    return {
      value: pkg.id,
      triggerLabel: title,
      label: title,
      description: desc.length > 140 ? `${desc.slice(0, 137)}…` : desc,
    };
  });
  return [base, ...rest];
}

/** Parsed `app.tracks[]` entries from an app-attached operational model manifest. */
export function manifestAppTracks(
  manifest?: Record<string, unknown> | null
): { key: string; name: string; description: string; entryTypeCount: number; viewCount: number }[] {
  if (!manifest || typeof manifest !== 'object') return [];
  const app = manifest.app;
  if (!app || typeof app !== 'object') return [];
  const tracks =
    (app as { tracks?: unknown; track_types?: unknown }).tracks ??
    (app as { tracks?: unknown; track_types?: unknown }).track_types;
  if (!Array.isArray(tracks)) return [];
  const out: { key: string; name: string; description: string; entryTypeCount: number; viewCount: number }[] = [];
  for (const t of tracks) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const key = String(o.key || '').trim();
    if (!key) continue;
    const name = String(o.name || key).trim() || key;
    out.push({ key, name,
      description: typeof o.description === 'string' ? o.description.trim() : '',
      entryTypeCount: Array.isArray(o.entry_types) ? o.entry_types.length : 0,
      viewCount: Array.isArray(o.views) ? o.views.length : 0,
    });
  }
  return out;
}

export function operationalModelTemplateSelectOptions(
  templates: OperationalModelNode[]
): OperationalModelSelectRow[] {
  const base: OperationalModelSelectRow = {
    value: '',
    triggerLabel: 'App default only',
    label: 'App default only',
    description: 'No extra template merge beyond the app baseline.',
  };
  const rest = templates.map(tpl => {
    const title = tpl.name || tpl.id;
    const raw = (tpl.description && tpl.description.trim()) || '';
    const desc = raw || 'No description.';
    return {
      value: tpl.id,
      triggerLabel: title,
      label: title,
      description: desc.length > 140 ? `${desc.slice(0, 137)}…` : desc,
    };
  });
  return [base, ...rest];
}
