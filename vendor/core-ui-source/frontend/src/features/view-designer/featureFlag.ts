/**
 * Feature flag for the Universal View Designer.
 * Enabled when VITE_VIEW_DESIGNER is unset/"1"/"true" (default on for local
 * Core so designers are available immediately). Set to "0"/"false" to hide.
 */

export function isViewDesignerEnabled(): boolean {
  const raw = (import.meta.env.VITE_VIEW_DESIGNER as string | undefined)?.trim();
  if (raw === undefined || raw === '') return true;
  const lower = raw.toLowerCase();
  if (lower === '0' || lower === 'false' || lower === 'off' || lower === 'no') {
    return false;
  }
  return true;
}
