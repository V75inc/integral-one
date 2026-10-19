export const RESERVED_BASE_FIELD_KEYS = ['title', 'body', 'attachments'] as const;

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'boolean',
  'date',
  'datetime',
  'select',
  'multi_select',
  'link',
  'email',
  'relation',
  'member',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

const VALID_KEY_RE = /^[a-z][a-z0-9_]*$/;

export function slugifyKey(input: string): string {
  let s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9_\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (s.length > 0 && /^[0-9]/.test(s)) {
    s = `f_${s}`;
  }
  return s;
}

export function validateFieldKey(key: string, siblingKeys: string[]): string | null {
  if (!key) return 'Key is required';
  if (!VALID_KEY_RE.test(key)) {
    if (/^[0-9]/.test(key)) {
      return 'Key must start with a letter';
    }
    return 'Key must be lowercase letters, digits, underscores';
  }
  if ((RESERVED_BASE_FIELD_KEYS as readonly string[]).includes(key)) {
    return `"${key}" is a reserved base-field key`;
  }
  if (siblingKeys.includes(key)) {
    return `A field with key "${key}" already exists`;
  }
  return null;
}

export function validateFieldName(name: string): string | null {
  if (!name || !name.trim()) return 'Name is required';
  return null;
}
