/** Slug for ref segments (matches backend ``slug_ref_part`` closely enough for UI). */
export function slugRefPart(value: string): string {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown'
  );
}

/** Display placeholder for a qualified field ref (matches backend ``format_field_ref_display``). */
export function formatFieldRefDisplay(fieldRef: string): string {
  const inner = String(fieldRef || '')
    .trim()
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '');
  return inner ? `{{${inner}}}` : '';
}

/** True when ``fieldRef`` is ``module.track_key.local_field`` (≥3 dot segments). */
export function isQualifiedFieldRef(fieldRef: string): boolean {
  const inner = String(fieldRef || '')
    .trim()
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '');
  return inner.split('.').filter(Boolean).length >= 3;
}

/** Build a qualified ref when the API returns a legacy bare key. */
export function qualifyFieldRef(
  fieldRef: string,
  ctx: { module?: string; trackKey?: string; localField?: string },
): string {
  const raw = String(fieldRef || '')
    .trim()
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '');
  if (raw.startsWith('system.')) return raw;
  if (isQualifiedFieldRef(raw)) return raw;
  const local = String(ctx.localField || raw).trim();
  const mod = slugRefPart(ctx.module || 'app');
  const track = slugRefPart(ctx.trackKey || 'track');
  if (!local) return raw;
  return `${mod}.${track}.${local}`;
}

/** Upgrade legacy bare tokens when template track/module context is known. */
export function qualifyFieldTokensInDocument(
  doc: Record<string, unknown>,
  ctx: { module?: string; trackKey?: string },
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node;
    const n = node as Record<string, unknown>;
    if (n.type === 'fieldToken') {
      const attrs = (n.attrs || {}) as Record<string, unknown>;
      const fieldKey = qualifyFieldRef(String(attrs.fieldKey || ''), {
        module: ctx.module,
        trackKey: ctx.trackKey,
      });
      const placeholderRaw = String(attrs.placeholder || '');
      const placeholder =
        placeholderRaw && isQualifiedFieldRef(placeholderRaw)
          ? placeholderRaw
          : formatFieldRefDisplay(fieldKey);
      return { ...n, attrs: { ...attrs, fieldKey, placeholder } };
    }
    if (Array.isArray(n.content)) {
      return { ...n, content: n.content.map(walk) };
    }
    return n;
  };
  return walk(doc) as Record<string, unknown>;
}

/** Text shown inline for a field token in the template editor. */
export function fieldTokenDisplayText(attrs: {
  placeholder?: string;
  fieldKey?: string;
  label?: string;
}): string {
  const key = String(attrs.fieldKey || '').trim();
  const placeholder = String(attrs.placeholder || '').trim();
  if (placeholder && isQualifiedFieldRef(placeholder)) return placeholder;
  if (key) return formatFieldRefDisplay(key);
  if (placeholder) return placeholder;
  const label = String(attrs.label || '').trim();
  return label ? `[${label}]` : '[Field]';
}
