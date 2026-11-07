/** Excluded App records must not be presented as proof that no records exist. */
export function requiresAppQuery(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as Record<string, unknown>;
  return [data.boundary, data.refused].some(value => {
    if (!value || typeof value !== 'object') return false;
    const restriction = value as Record<string, unknown>;
    return restriction.declared_query_required === true || restriction.code === 'app_domain';
  });
}
