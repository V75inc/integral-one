import { useCallback, useState, type ReactNode } from 'react';

/** Field key (or a reserved key such as ``__title``) mapped to what is wrong with it. */
export type FieldProblems = Record<string, string>;

export const TITLE_PROBLEM_KEY = '__title';
export const BODY_PROBLEM_KEY = '__body';

/** One line for a toast: names what needs fixing, never just "invalid". */
export function summarizeProblems(
  problems: FieldProblems,
  labels: Record<string, string> = {}
): string {
  const keys = Object.keys(problems);
  if (keys.length === 0) return '';
  const name = (key: string) => labels[key] || key;
  if (keys.length === 1) return `${name(keys[0])}: ${problems[keys[0]]}`;
  const shown = keys.slice(0, 5).map(name).join(', ');
  return `${keys.length} things need attention: ${shown}${keys.length > 5 ? ', …' : ''}`;
}

/**
 * Field-level problems carried by an API error, when it names them.
 * Understands ``details.field_errors``, ``details.missing_fields`` and a list of
 * ``{field, message}`` rows. Only keys the form actually shows are returned.
 */
export function problemsFromApiError(
  err: unknown,
  knownKeys: string[]
): FieldProblems {
  const known = new Set(knownKeys);
  const found: FieldProblems = {};
  const add = (raw: unknown, message: unknown) => {
    const key = String(raw ?? '').split('.').pop() || '';
    if (key && known.has(key) && !found[key]) {
      found[key] = String(message || 'Check this value').trim() || 'Check this value';
    }
  };
  const details = (
    err as { response?: { data?: { details?: unknown } } }
  )?.response?.data?.details;
  if (Array.isArray(details)) {
    for (const row of details) {
      const r = row as { field?: unknown; message?: unknown };
      add(r?.field, r?.message);
    }
  } else if (details && typeof details === 'object') {
    const d = details as {
      field_errors?: Record<string, unknown>;
      missing_fields?: Array<{ key?: unknown; label?: unknown }>;
    };
    for (const [key, message] of Object.entries(d.field_errors || {})) add(key, message);
    for (const m of d.missing_fields || []) add(m?.key, 'Required');
  }
  return found;
}

export function useFieldProblems() {
  const [problems, setProblems] = useState<FieldProblems>({});
  const clear = useCallback((key: string) => {
    setProblems(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);
  const reset = useCallback(() => setProblems({}), []);
  return { problems, setProblems, clear, reset };
}

/** Scroll to the first highlighted field and put the cursor in it. */
export function focusFirstProblem(root?: ParentNode | null) {
  const target = (root || document).querySelector<HTMLElement>('[data-field-problem]');
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const control = target.matches('input,textarea,select,button')
    ? target
    : target.querySelector<HTMLElement>(
        'input,textarea,select,[contenteditable="true"],button'
      );
  control?.focus?.({ preventScroll: true });
}

/**
 * Wraps a field so a problem shows as a red outline and a message under it.
 * The wrapper is always rendered, so highlighting never remounts the field.
 */
export function FieldProblem({
  fieldKey,
  message,
  children,
}: {
  fieldKey: string;
  message?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-field-problem={message ? fieldKey : undefined}
      className={
        message
          ? 'rounded-md ring-2 ring-red-500/70 ring-offset-2 ring-offset-transparent'
          : 'contents'
      }
    >
      {children}
      {message ? (
        <p role="alert" className="mt-1 px-1 text-xs text-red-500">
          {message}
        </p>
      ) : null}
    </div>
  );
}
