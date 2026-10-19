/** API origin without path; empty → same-origin `/api` (Vite dev proxy, nginx, Traefik). */
const origin =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '' : '');

const root = String(origin).replace(/\/$/, '');

export function getApiBaseURL(): string {
  return root ? `${root}/api` : '/api';
}
