import type { OperationalModelFieldSpec } from '../types';

/**
 * Lowercase first character so a label fits after a verb ("Contact name" → "contact name").
 */
export function labelAsPhraseFragment(label: string): string {
  return label.trim();
}

/** Placeholder already starts with a guiding verb — leave as-is. */
const HAS_LEADING_VERB =
  /^(enter|choose|select|add|write|describe|link|pick|type|use)\s+/i;

/**
 * If the manifest already used a suggestive phrase, keep it; otherwise prefix with the verb.
 * Composer fields use **Enter** for generated copy; manifests may still use Choose/Link/etc.
 */
export function normalizeExplicitPlaceholder(
  raw: string,
  verb: 'Enter' | 'Choose' | 'Select' | 'Write' | 'Link'
): string {
  const t = raw.trim();
  if (!t) return t;
  if (HAS_LEADING_VERB.test(t)) return t;
  return `${verb} ${labelAsPhraseFragment(t)}`;
}

/**
 * Title/body base slots: same verb family as custom text fields for a consistent composer.
 */
export function buildBaseSlotPlaceholder(opts: {
  label: string;
  placeholder: string;
  canonicalLabel: string;
  slot: 'title' | 'body';
}): string {
  const ph = opts.placeholder.trim();
  const lb = opts.label.trim();

  const isDefaultLabel = !lb || lb === opts.canonicalLabel;

  if (ph) {
    return normalizeExplicitPlaceholder(ph, 'Enter');
  }

  if (isDefaultLabel) {
    return opts.slot === 'body' ? 'Enter details' : 'Enter title (optional)';
  }

  const frag = labelAsPhraseFragment(lb);
  return `Enter ${frag}`;
}

/** Placeholder for custom fields: normalize manifest text, or generate from name + type. */
export function buildFieldPlaceholder(field: OperationalModelFieldSpec): string {
  const explicit = field.placeholder?.trim();
  if (explicit) {
    return normalizeExplicitPlaceholder(explicit, 'Enter');
  }

  const name = field.name.trim() || 'value';

  switch (field.type) {
    case 'text':
      return `Enter ${name}`;
    case 'number':
      return `Enter ${name} (e.g., 42)`;
    case 'date':
    case 'datetime':
      return `Enter ${name}…`;
    case 'select':
    case 'multi_select':
    case 'relation':
    case 'member':
      return `Enter ${name}…`;
    case 'markdown':
      return `Enter ${name} (Markdown supported)`;
    case 'json':
      return `Enter ${name} (JSON)`;
    default:
      return `Enter ${name}`;
  }
}
