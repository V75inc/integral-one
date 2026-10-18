/**
 * Frontend template-var resolver registry — Phase 3.1 Plan 03.1-04 (ANC-07).
 *
 * Mirrors ``backend/app/services/template_var_resolvers.py`` shape with SYNC
 * signatures. Async lookups (e.g. walking ANCHORS edges) are pre-resolved at
 * the call site and passed via the ``ResolverContext`` object — per Plan
 * 03.1-04 planner discretion, the frontend stays synchronous because
 * ``applyFilters`` is synchronous and async-ifying it would touch every
 * existing call site without a real benefit (all v1 vars are available
 * synchronously from the rendering context).
 *
 * v1 resolvers (parallel to backend):
 *   :current_user    → context.userId
 *   :entry_id        → context.entryId
 *   :anchored_track  → context.anchoredTrackId (pre-resolved by EntryDetail.tsx)
 *
 * Registration hygiene (mirrors backend + Phase 1 D-07):
 *   - tokens MUST start with ':'
 *   - duplicate registration throws (single-source-of-truth)
 *   - unknown tokens at resolve time return null (fail-soft)
 */

export type ResolverContext = {
  userId?: string;
  entryId?: string;
  anchoredTrackId?: string;
  [extra: string]: unknown;
};

export type ResolverFn = (context: ResolverContext) => string | null | undefined;

const _registry: Map<string, ResolverFn> = new Map();

export function registerResolver(token: string, fn: ResolverFn): void {
  if (typeof token !== 'string' || !token.startsWith(':')) {
    throw new Error(
      `Resolver token must start with ':'; got ${JSON.stringify(token)}`
    );
  }
  if (_registry.has(token)) {
    throw new Error(`Resolver ${JSON.stringify(token)} already registered`);
  }
  _registry.set(token, fn);
}

export function getRegisteredTokens(): string[] {
  return Array.from(_registry.keys()).sort();
}

export function resolveTemplateVar(
  token: string,
  context: ResolverContext
): string | null {
  const fn = _registry.get(token);
  if (!fn) return null;
  try {
    const result = fn(context);
    return result == null ? null : String(result);
  } catch (e) {
    // Fail-soft — log and return null so the caller can skip the rule.

    console.warn(`Resolver ${token} threw:`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// v1 resolvers — registered at module import time
// ---------------------------------------------------------------------------

registerResolver(':current_user', ctx => (ctx.userId ?? null) as string | null);
registerResolver(':entry_id', ctx => (ctx.entryId ?? null) as string | null);
registerResolver(
  ':anchored_track',
  ctx => (ctx.anchoredTrackId ?? null) as string | null
);
