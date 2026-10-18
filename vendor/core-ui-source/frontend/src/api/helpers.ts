import type { Entry, Reaction, Tag, User } from '../types';
import apiClient from './client';

/** Normalize FastAPI / Pydantic ``detail`` (string, object, or array of error objects) for display. */
export function formatApiErrorDetail(detail: unknown, fallback: string): string {
  if (detail == null || detail === '') return fallback;
  if (typeof detail === 'string') {
    const t = detail.trim();
    return t || fallback;
  }
  if (Array.isArray(detail)) {
    const parts: string[] = [];
    for (const item of detail) {
      if (typeof item === 'string' && item.trim()) {
        parts.push(item.trim());
        continue;
      }
      if (item && typeof item === 'object') {
        const msg = (item as { msg?: unknown }).msg;
        if (typeof msg === 'string' && msg.trim()) {
          parts.push(msg.trim());
        }
      }
    }
    return parts.length ? parts.join('; ') : fallback;
  }
  if (typeof detail === 'object' && detail !== null) {
    const msg = (detail as { msg?: unknown }).msg;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return fallback;
}

/** Message from an axios-style error (uses ``response.data.detail``, falling
 *  back to the JVSpatialAPIException envelope's ``message`` — e.g.
 *  ``ResourceConflictError`` — for routes that raise the canonical error
 *  shape rather than a legacy Pydantic ``detail``, so callers still surface
 *  the real reason instead of the generic fallback string). */
export function errorMessageFromAxios(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { detail?: unknown; message?: unknown } } };
  const data = ax?.response?.data;
  if (data?.detail == null || data.detail === '') {
    const message = data?.message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  return formatApiErrorDetail(data?.detail, fallback);
}

/** Read the user-facing message from an agentive error response.
 *  Prefers the canonical envelope (D-03). Falls back to legacy {detail} for non-agentive
 *  routes. Never returns the error_code (operator-only). */
export function agentiveErrorMessage(err: unknown, fallback: string): string {
  const ax = err as {
    response?: {
      data?: { message?: unknown; detail?: unknown; error_code?: unknown };
    };
  };
  const data = ax?.response?.data;
  if (data && typeof data === 'object') {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      const errorCode = (data as { error_code?: unknown }).error_code;
      if (typeof errorCode === 'string') {
        // Dev signal — operator-facing, never rendered to end users.

        console.warn(`[agentive] ${errorCode}: ${message}`);
      }
      return message.trim();
    }
  }
  return errorMessageFromAxios(err, fallback);
}

/**
 * Coerce toast content to a plain string so React never receives Pydantic error objects.
 * Also unwraps axios-shaped errors passed by mistake.
 */
export function toToastMessage(message: unknown, fallback = 'Something went wrong'): string {
  if (typeof message === 'string') {
    const t = message.trim();
    return t || fallback;
  }
  if (message == null) return fallback;
  const ax = message as { response?: { data?: { detail?: unknown } } };
  if (ax?.response?.data?.detail != null) {
    const t = formatApiErrorDetail(ax.response.data.detail, '');
    if (t) return t;
  }
  const direct = formatApiErrorDetail(message, '');
  return direct || fallback;
}

/** Single-resource wrappers from the Integral API. */
export function unwrapResource<T = unknown>(data: unknown, key: string): T {
  if (data == null) return data as T;
  if (typeof data !== 'object') return data as T;
  const obj = data as Record<string, unknown>;
  const v = key in obj ? obj[key] : obj;
  return v as T;
}

/** Inner object when responses use ``{ success: true, data: { ... } }``. */
export function unwrapApiDataEnvelope(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (
      o.success === true &&
      o.data != null &&
      typeof o.data === 'object' &&
      !Array.isArray(o.data)
    ) {
      return o.data as Record<string, unknown>;
    }
  }
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export function toArr(d: unknown): any[] {
  if (Array.isArray(d)) return d;
  if (!d || typeof d !== 'object') return [];
  const o = d as Record<string, unknown>;
  return (
    (o.items as any[]) ||
    (o.entries as any[]) ||
    (o.tracks as any[]) ||
    (o.results as any[]) ||
    (o.notifications as any[]) ||
    (o.comments as any[]) ||
    (o.attachments as any[]) ||
    (o.collaborators as any[]) ||
    (o.templates as any[]) ||
    (o.tags as any[]) ||
    (o.entry_types as any[]) ||
    (o.views as any[]) ||
    (o.apps as any[]) ||
    (o.workspaces as any[]) ||
    (o.members as any[]) ||
    (o.users as any[]) ||
    (o.profiles as any[]) ||
    []
  );
}

export function normalizeReactions(
  raw: unknown,
  principalId?: string
): Reaction[] {
  if (Array.isArray(raw)) return raw as Reaction[];
  if (!raw || typeof raw !== 'object') return [];
  const out: Reaction[] = [];
  for (const [emoji, ids] of Object.entries(raw as Record<string, unknown>)) {
    const list = Array.isArray(ids) ? ids.map(String) : [];
    const count = list.length;
    if (count === 0) continue;
    out.push({
      emoji,
      count,
      user_reacted: principalId ? list.includes(principalId) : false,
    });
  }
  return out;
}

/** Normalize ``tags`` to ``Tag[]`` (API often sent only tag ids as strings before enrichment). */
export function normalizeEntryTags(raw: unknown): Tag[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: Tag[] = [];
  for (const t of raw) {
    if (typeof t === 'string') {
      out.push({ id: t, name: t });
      continue;
    }
    if (t && typeof t === 'object' && 'id' in t) {
      const o = t as Record<string, unknown>;
      const id = String(o.id);
      const ctx =
        o.context && typeof o.context === 'object'
          ? (o.context as Record<string, unknown>)
          : null;
      const label =
        (o.name != null && String(o.name).trim() !== '' ? String(o.name) : '') ||
        (ctx?.name != null && String(ctx.name).trim() !== ''
          ? String(ctx.name)
          : '') ||
        (ctx?.label != null && String(ctx.label).trim() !== ''
          ? String(ctx.label)
          : '') ||
        id;
      const color =
        (typeof o.color === 'string' ? o.color : undefined) ||
        (ctx && typeof ctx.color === 'string' ? ctx.color : undefined);
      const track_id =
        (typeof o.track_id === 'string' ? o.track_id : undefined) ||
        (ctx && typeof ctx.track_id === 'string' ? ctx.track_id : undefined);
      out.push({
        id,
        name: label,
        color,
        track_id,
      });
    }
  }
  return out;
}

/** True if this tag item still needs resolution (id string, or missing / bogus name). */
export function looksLikeUnresolvedTagItem(item: unknown): boolean {
  if (typeof item === 'string') return true;
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  const id = o.id != null ? String(o.id) : '';
  const name = o.name != null ? String(o.name).trim() : '';
  if (!name) return true;
  if (id && name === id) return true;
  if (/^n\.tag\./i.test(name)) return true;
  return false;
}

/**
 * For entries whose ``tags`` are still ids (or objects without a real label),
 * fill from ``GET /tags?track_id=`` (one request per distinct track in the list).
 */
export async function hydrateEntryTagsForList(entries: any[]): Promise<void> {
  if (!entries?.length) return;
  const anyNeeds = entries.some(
    e => Array.isArray(e?.tags) && e.tags.some(looksLikeUnresolvedTagItem)
  );
  if (!anyNeeds) return;
  const trackIds = [
    ...new Set(
      entries
        .map(e => e?.track_id)
        .filter((tid: unknown): tid is string => typeof tid === 'string' && tid.length > 0)
    ),
  ];
  const byTrack = new Map<string, Map<string, Tag>>();
  await Promise.all(
    trackIds.map(async tid => {
      try {
        const { data } = await apiClient.get('/tags', { params: { track_id: tid } });
        const list = toArr(data);
        const m = new Map<string, Tag>();
        for (const raw of list) {
          const one = normalizeEntryTags([raw])[0];
          if (one?.id) m.set(one.id, one);
        }
        byTrack.set(tid, m);
      } catch {
        byTrack.set(tid, new Map());
      }
    })
  );
  for (const e of entries) {
    const tid = e?.track_id;
    const tags = e?.tags;
    if (!Array.isArray(tags) || typeof tid !== 'string') continue;
    const m = byTrack.get(tid);
    if (!m?.size) continue;
    e.tags = tags.map((item: unknown) => {
      if (!looksLikeUnresolvedTagItem(item)) return item;
      const id =
        typeof item === 'string'
          ? item
          : item && typeof item === 'object' && 'id' in item
            ? String((item as { id: unknown }).id)
            : '';
      if (!id) return item;
      return m.get(id) ?? item;
    });
  }
}

export function normalizeUserMe(raw: any): User {
  const u = unwrapResource<any>(raw, 'user');
  const display_name = u.display_name || u.name || '';
  const prefs =
    u.preferences && typeof u.preferences === 'object' ? { ...u.preferences } : {};
  const bio =
    typeof (prefs as any).bio === 'string'
      ? (prefs as any).bio
      : typeof u.bio === 'string'
        ? u.bio
        : undefined;
  return {
    ...u,
    display_name,
    bio,
    user_id: u.user_id,
    preferences: prefs,
    workspace_id: u.workspace_id,
    role: u.role,
    roles: u.roles,
    email: u.email ?? u.email_address,
    must_change_password: Boolean(u.must_change_password),
    pending_assigned_form:
      u.pending_assigned_form ?? u.pending_onboarding_form ?? null,
    pending_onboarding_form:
      u.pending_onboarding_form ?? u.pending_assigned_form ?? null,
  };
}

/** Non-negative comment count from API shapes (snake_case, camelCase, numeric strings). */
function normalizedCommentCountFromRaw(raw: any): number {
  const candidates = [
    raw?.comment_count,
    raw?.commentCount,
    raw?.comments_count,
    raw?.commentsCount,
    raw?.comment_total,
    raw?.comments_total,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) {
      return Math.max(0, Math.trunc(c));
    }
    if (typeof c === 'string' && c.trim() !== '') {
      const n = Number(c);
      if (Number.isFinite(n)) return Math.max(0, Math.trunc(n));
    }
  }
  return 0;
}

export function normalizeEntry(
  raw: any,
  opts?: { typeNameById?: Record<string, string>; principalId?: string }
): Entry {
  // Prefer the backend-attached ``type`` slug (added to list + single-entry
  // exports). Falls back to a custom-field override or the per-track
  // EntryType lookup, then to ``post``. The backend slug matches the
  // manifest ``entry_type_keys`` view-config exactly (slug == lowercase +
  // non-alphanumeric → underscore), so view-scoped filters
  // ("Pricing Rubric" → "pricing_rubric") line up. The local typeNameById
  // fallback only lowercases the name — for manifest keys with spaces
  // ("Pricing Rubric"), it would NOT match the slug. Backend ``type``
  // wins to avoid that drift.
  const slug =
    raw?.type ||
    raw?.custom_fields?._entry_type_slug ||
    (opts?.typeNameById && raw?.type_id
      ? opts.typeNameById[raw.type_id]
      : undefined) ||
    'post';
  const reactions = normalizeReactions(raw?.reactions, opts?.principalId);
  let cachedUser: User | undefined;
  try {
    const stored = localStorage.getItem('t75_user');
    if (stored) cachedUser = JSON.parse(stored) as User;
  } catch {
    cachedUser = undefined;
  }
  const normalizedCommentCount = normalizedCommentCountFromRaw(raw);
  const normalizedAuthor =
    raw?.author ||
    raw?.user ||
    raw?.created_by ||
    (cachedUser &&
    (cachedUser.user_id === raw?.author_id || cachedUser.id === raw?.author_id)
      ? cachedUser
      : undefined);
  const tags = Array.isArray(raw?.tags) ? normalizeEntryTags(raw.tags) : raw?.tags;
  const base =
    raw && typeof raw === 'object'
      ? (() => {
          const o = { ...raw } as Record<string, unknown>;
          delete o.image_urls;
          return o;
        })()
      : raw;

  return {
    ...base,
    type: String(slug).toLowerCase(),
    reactions,
    author: normalizedAuthor,
    comment_count: normalizedCommentCount,
    ...(Array.isArray(base?.tags) ? { tags } : {}),
  };
}

/** Slug = lowercase, then non-alphanumeric → underscore (collapsed,
 *  trimmed). Matches the backend ``_slugify_entry_type_key`` so
 *  view-scoped filters using manifest ``entry_type_keys`` line up. */
export function slugifyEntryTypeKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function manifestKeyFromFormSchema(formSchema: unknown): string {
  if (!formSchema || typeof formSchema !== 'object') return '';
  return slugifyEntryTypeKey(
    String(
      (formSchema as { _manifest_entry_type_key?: unknown })._manifest_entry_type_key ||
        ''
    )
  );
}

/** Identity slugs for an EntryType: manifest key and display-name slug. */
export function entryTypeIdentitySlugs(
  et: { name?: string; form_schema?: unknown } | null | undefined
): string[] {
  const slugs = new Set<string>();
  const mk = manifestKeyFromFormSchema(et?.form_schema);
  const ns = slugifyEntryTypeKey(String(et?.name || ''));
  if (mk) slugs.add(mk);
  if (ns) slugs.add(ns);
  return [...slugs];
}

export function canonicalEntryTypeSlug(
  et: { name?: string; form_schema?: unknown } | null | undefined
): string {
  const mk = manifestKeyFromFormSchema(et?.form_schema);
  if (mk) return mk;
  return slugifyEntryTypeKey(String(et?.name || ''));
}

/** Message for entry PATCH failures (JVSpatial envelope + hire-gate missing_fields). */
export function entrySaveErrorMessage(err: unknown, fallback: string): string {
  const ax = err as {
    response?: {
      data?: {
        details?: {
          missing_fields?: Array<{ label?: string; key?: string }>;
        };
      };
    };
  };
  const base = agentiveErrorMessage(err, '');
  const missing = ax?.response?.data?.details?.missing_fields;
  if (Array.isArray(missing) && missing.length) {
    const labels = missing
      .map(m => String(m.label || m.key || '').trim())
      .filter(Boolean);
    if (labels.length) {
      const listed = labels.slice(0, 8).join(', ');
      if (base) {
        const probe = labels[0]?.toLowerCase() || '';
        if (probe && base.toLowerCase().includes(probe)) return base;
        return `${base.replace(/\.$/, '')}. Missing: ${listed}.`;
      }
      return `Complete required fields before saving. Missing: ${listed}.`;
    }
  }
  if (base) return base;
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return fallback;
}

export function buildTypeNameById(entryTypes: any[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const et of entryTypes || []) {
    if (et?.id && et?.name) m[et.id] = slugifyEntryTypeKey(String(et.name));
  }
  return m;
}

export async function ensureEntryTypeId(
  trackId: string,
  name: string
): Promise<string> {
  const slug = slugifyEntryTypeKey(name);
  const { data } = await apiClient.get('/entry-types', {
    params: { track_id: trackId },
  });
  const types = toArr(data);
  const existing = types.find(
    (t: any) => slugifyEntryTypeKey(String(t.name || '')) === slug
  );
  if (existing?.id) return existing.id;
  const created = await apiClient.post('/entry-types', {
    track_id: trackId,
    name: slug.replace(/_/g, ' '),
  });
  const et = unwrapResource<any>(created.data, 'entry_type');
  return et.id;
}
