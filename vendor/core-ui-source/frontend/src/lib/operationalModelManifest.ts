/**
 * Read canonical v1 operational model manifests (library packages).
 * Shapes: `track` tier or `app.tracks[]` tiers.
 */

export type ManifestScopeKind = 'track' | 'app' | 'unknown';

export function getManifestScopeKind(
  manifest: Record<string, unknown> | undefined
): ManifestScopeKind {
  if (!manifest || typeof manifest !== 'object') return 'unknown';
  const s = String(manifest.scope || '').toLowerCase();
  if (s === 'track') return 'track';
  if (s === 'app') return 'app';
  return 'unknown';
}

function countTaxonomyTags(taxonomy: unknown): number {
  if (!taxonomy || typeof taxonomy !== 'object') return 0;
  const groups = (taxonomy as Record<string, unknown>).tag_groups;
  if (!Array.isArray(groups)) return 0;
  let n = 0;
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue;
    const tags = (g as Record<string, unknown>).tags;
    if (Array.isArray(tags)) n += tags.length;
  }
  return n;
}

function normalizeSkillEntries(raw: unknown): { key: string; kind: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { key: string; kind: string }[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      out.push({ key: entry.trim(), kind: 'declarative' });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    const key = String(o.key ?? '').trim();
    if (!key) continue;
    out.push({ key, kind: String(o.kind ?? 'declarative') });
  }
  return out;
}

function countOperationalLayer(manifest: Record<string, unknown> | undefined): {
  skillCount: number;
  agentCount: number;
  toolCount: number;
  hookCount: number;
  skills: { key: string; kind: string }[];
  agents: { key: string; name: string }[];
  tools: string[];
} {
  if (!manifest || typeof manifest !== 'object') {
    return {
      skillCount: 0,
      agentCount: 0,
      toolCount: 0,
      hookCount: 0,
      skills: [],
      agents: [],
      tools: [],
    };
  }
  const scope = getManifestScopeKind(manifest);
  const tier =
    scope === 'app'
      ? (manifest.app as Record<string, unknown> | undefined)
      : scope === 'track'
        ? (manifest.track as Record<string, unknown> | undefined)
        : undefined;
  const skills = normalizeSkillEntries(tier?.skills);
  const agentsRaw = Array.isArray(tier?.agents) ? tier.agents : [];
  const agents: { key: string; name: string }[] = [];
  for (const a of agentsRaw) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const key = String(o.key ?? '').trim();
    if (!key) continue;
    agents.push({ key, name: String(o.name ?? key) });
  }
  const toolsRaw = Array.isArray(tier?.tools) ? tier.tools : [];
  const tools: string[] = [];
  for (const t of toolsRaw) {
    if (!t || typeof t !== 'object') continue;
    const key = String((t as Record<string, unknown>).key ?? '').trim();
    if (key) tools.push(key);
  }
  const hooks = Array.isArray(tier?.hooks) ? tier.hooks : [];
  return {
    skillCount: skills.length,
    agentCount: agents.length,
    toolCount: tools.length,
    hookCount: hooks.length,
    skills,
    agents,
    tools,
  };
}

/** Aggregate counts for library cards and filters. */
export function summarizeLibraryManifest(
  manifest: Record<string, unknown> | undefined
): {
  scopeKind: ManifestScopeKind;
  entryTypeCount: number;
  tagCount: number;
  viewCount: number;
  prescribedTrackCount: number;
  skillCount: number;
  agentCount: number;
  toolCount: number;
  hookCount: number;
} {
  const scopeKind = getManifestScopeKind(manifest);
  const ops = countOperationalLayer(manifest);
  const empty = {
    scopeKind,
    entryTypeCount: 0,
    tagCount: 0,
    viewCount: 0,
    prescribedTrackCount: 0,
    skillCount: ops.skillCount,
    agentCount: ops.agentCount,
    toolCount: ops.toolCount,
    hookCount: ops.hookCount,
  };
  if (!manifest) return { ...empty, scopeKind: 'unknown' };

  if (scopeKind === 'track') {
    const t = manifest.track as Record<string, unknown> | undefined;
    return {
      scopeKind,
      entryTypeCount: Array.isArray(t?.entry_types) ? t.entry_types.length : 0,
      viewCount: Array.isArray(t?.views) ? t.views.length : 0,
      tagCount: countTaxonomyTags(t?.taxonomy),
      prescribedTrackCount: 0,
      skillCount: ops.skillCount,
      agentCount: ops.agentCount,
      toolCount: ops.toolCount,
      hookCount: ops.hookCount,
    };
  }

  if (scopeKind === 'app') {
    const s = manifest.app as Record<string, unknown> | undefined;
    const tracks = Array.isArray(s?.tracks) ? s.tracks : [];
    let entryTypeCount = 0;
    let viewCount = 0;
    let tagCount = 0;
    for (const tr of tracks) {
      if (!tr || typeof tr !== 'object') continue;
      const td = tr as Record<string, unknown>;
      if (Array.isArray(td.entry_types)) entryTypeCount += td.entry_types.length;
      if (Array.isArray(td.views)) viewCount += td.views.length;
      tagCount += countTaxonomyTags(td.taxonomy);
    }
    return {
      scopeKind,
      entryTypeCount,
      viewCount,
      tagCount,
      prescribedTrackCount: tracks.length,
      skillCount: ops.skillCount,
      agentCount: ops.agentCount,
      toolCount: ops.toolCount,
      hookCount: ops.hookCount,
    };
  }

  return empty;
}

/** Collect capability types declared at `package.capabilities`. */
export function getDeclaredManifestCapabilities(
  manifest: Record<string, unknown> | undefined
): string[] {
  const pkg =
    manifest && typeof manifest === 'object'
      ? ((manifest.package as Record<string, unknown> | undefined) ?? undefined)
      : undefined;
  const caps = pkg?.capabilities;
  if (!Array.isArray(caps)) return [];
  const out: string[] = [];
  for (const cap of caps) {
    if (typeof cap === 'string' && cap.trim()) {
      out.push(cap.trim().toLowerCase());
      continue;
    }
    if (!cap || typeof cap !== 'object') continue;
    const ctype = String((cap as Record<string, unknown>).type ?? '')
      .trim()
      .toLowerCase();
    if (ctype) out.push(ctype);
  }
  return [...new Set(out)];
}

/** Capabilities required by manifest but not currently registered in UI. */
export function getMissingManifestCapabilities(
  manifest: Record<string, unknown> | undefined,
  availableWidgetTypes: string[]
): string[] {
  const required = getDeclaredManifestCapabilities(manifest);
  const available = new Set(
    (availableWidgetTypes || []).map(v => String(v).trim().toLowerCase())
  );
  return required.filter(cap => !available.has(cap));
}

export type InspectFieldRow = { key: string; name: string; type: string };
export type InspectEntryTypeRow = {
  key?: string;
  name: string;
  icon?: string;
  fields: InspectFieldRow[];
};
export type InspectViewRow = {
  key?: string;
  name: string;
  viewType: string;
  isDefault?: boolean;
};
export type InspectTagRow = { name: string; color?: string; groupName?: string };

export type InspectTrackSection = {
  key?: string;
  name: string;
  description?: string;
  entryTypes: InspectEntryTypeRow[];
  views: InspectViewRow[];
  tags: InspectTagRow[];
};

export type InspectOperationalRow = {
  skills: { key: string; kind: string }[];
  agents: { key: string; name: string }[];
  tools: string[];
  hookCount: number;
};

export function buildManifestInspection(manifest: Record<string, unknown> | undefined): {
  scopeKind: ManifestScopeKind;
  packageDescription?: string;
  sections: InspectTrackSection[];
  operational: InspectOperationalRow;
} {
  const scopeKind = getManifestScopeKind(manifest);
  const ops = countOperationalLayer(manifest);
  const pkg = manifest?.package as Record<string, unknown> | undefined;
  const packageDescription =
    typeof pkg?.description === 'string' ? pkg.description : undefined;

  if (!manifest) {
    return {
      scopeKind: 'unknown',
      sections: [],
      operational: { skills: [], agents: [], tools: [], hookCount: 0 },
    };
  }

  const mapEntryType = (e: unknown): InspectEntryTypeRow => {
    const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const fieldsRaw = o.fields;
    const formSchema = o.form_schema as Record<string, unknown> | undefined;
    const fromForm = formSchema?.fields;
    const fieldList = Array.isArray(fieldsRaw)
      ? fieldsRaw
      : Array.isArray(fromForm)
        ? fromForm
        : [];
    const fields: InspectFieldRow[] = fieldList.map((f: unknown) => {
      const fd = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
      const key = String(fd.key ?? '');
      const name = String(fd.name ?? (key || 'Field'));
      const type = String(fd.type ?? 'text');
      return { key, name, type };
    });
    return {
      key: typeof o.key === 'string' ? o.key : undefined,
      name: String(o.name ?? 'Untitled'),
      icon: typeof o.icon === 'string' ? o.icon : undefined,
      fields,
    };
  };

  const mapView = (v: unknown): InspectViewRow => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const viewType = String(o.view_type ?? o.type ?? 'feed');
    return {
      key: typeof o.key === 'string' ? o.key : undefined,
      name: String(o.name ?? viewType),
      viewType,
      isDefault: Boolean(o.is_default ?? o.isDefault),
    };
  };

  const tagsFromTaxonomy = (taxonomy: unknown): InspectTagRow[] => {
    const out: InspectTagRow[] = [];
    if (!taxonomy || typeof taxonomy !== 'object') return out;
    const groups = (taxonomy as Record<string, unknown>).tag_groups;
    if (!Array.isArray(groups)) return out;
    for (const g of groups) {
      if (!g || typeof g !== 'object') continue;
      const gd = g as Record<string, unknown>;
      const groupName = String(gd.name ?? gd.key ?? '');
      const tags = gd.tags;
      if (!Array.isArray(tags)) continue;
      for (const t of tags) {
        if (!t || typeof t !== 'object') continue;
        const td = t as Record<string, unknown>;
        const name = String(td.name ?? '');
        if (!name) continue;
        out.push({
          name,
          color: typeof td.color === 'string' ? td.color : undefined,
          groupName: groupName || undefined,
        });
      }
    }
    return out;
  };

  if (scopeKind === 'track') {
    const t = manifest.track as Record<string, unknown> | undefined;
    const entryTypes = (
      Array.isArray(t?.entry_types) ? t.entry_types : []
    ).map(mapEntryType);
    const views = (Array.isArray(t?.views) ? t.views : []).map(mapView);
    const tags = tagsFromTaxonomy(t?.taxonomy);
    return {
      scopeKind,
      packageDescription,
      sections: [{ name: 'Track profile', entryTypes, views, tags }],
      operational: {
        skills: ops.skills,
        agents: ops.agents,
        tools: ops.tools,
        hookCount: ops.hookCount,
      },
    };
  }

  if (scopeKind === 'app') {
    const s = manifest.app as Record<string, unknown> | undefined;
    const tracks = Array.isArray(s?.tracks) ? s.tracks : [];
    const sections: InspectTrackSection[] = [];
    for (const tr of tracks) {
      if (!tr || typeof tr !== 'object') continue;
      const td = tr as Record<string, unknown>;
      const name = String(td.name ?? td.key ?? 'Track');
      sections.push({
        key: typeof td.key === 'string' ? td.key : undefined,
        name,
        description: typeof td.description === 'string' ? td.description : undefined,
        entryTypes: (
          Array.isArray(td.entry_types) ? td.entry_types : []
        ).map(mapEntryType),
        views: (Array.isArray(td.views) ? td.views : []).map(mapView),
        tags: tagsFromTaxonomy(td.taxonomy),
      });
    }
    return {
      scopeKind,
      packageDescription,
      sections,
      operational: {
        skills: ops.skills,
        agents: ops.agents,
        tools: ops.tools,
        hookCount: ops.hookCount,
      },
    };
  }

  return {
    scopeKind,
    packageDescription,
    sections: [],
    operational: {
      skills: ops.skills,
      agents: ops.agents,
      tools: ops.tools,
      hookCount: ops.hookCount,
    },
  };
}

export function manifestKindLabel(kind: ManifestScopeKind): string {
  switch (kind) {
    case 'app':
      return 'App suite';
    case 'track':
      return 'Track pack';
    default:
      return 'Package';
  }
}
