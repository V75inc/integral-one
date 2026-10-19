/**
 * Task M3c-1 — frontend API client for the SPA-driven OAuth consent flow.
 *
 * The MCP authorization server (jvspatial M3a) 302-redirects an
 * unauthenticated authorize request to the SPA route
 * `/oauth/authorize?<oauth params>`. The authed consent page reads those
 * params and talks to the M3b-1 backend consent endpoints:
 *
 *   - GET  /api/oauth/consent          → ConsentDetails (client + scopes)
 *   - POST /api/oauth/consent/approve  → { redirect } (URL to send the
 *                                         browser back to the MCP client)
 *
 * The shared axios client (`./client`) prefixes `/api` and attaches the JWT
 * bearer, so both calls are authenticated as the logged-in user.
 */
import api from './client';

/** Shape returned by GET /oauth/consent (backend M3b-1). */
export interface ConsentDetails {
  client_id: string;
  client_name: string;
  scopes: string[];
  redirect_uri: string;
  state: string;
}

/** URL the browser is sent to after an approve/deny decision. */
export interface ConsentRedirect {
  redirect: string;
}

/** OAuth params forwarded from the authorize redirect's query string. */
export type OAuthParams = URLSearchParams | Record<string, string>;

function toRecord(params: OAuthParams): Record<string, string> {
  if (params instanceof URLSearchParams) {
    return Object.fromEntries(params.entries());
  }
  return params;
}

/**
 * Fetch the consent screen details for the pending authorize request. The
 * oauth params (client_id, redirect_uri, scope, state, code_challenge, …)
 * are forwarded verbatim as the query string so the backend can validate
 * the registered client + redirect_uri before disclosing the client name.
 */
export async function getConsent(params: OAuthParams): Promise<ConsentDetails> {
  const { data } = await api.get<ConsentDetails>('/oauth/consent', {
    params: toRecord(params),
  });
  return data;
}

/**
 * Record an approval. The backend mints an authorization code and returns
 * the `redirect_uri?code=...&state=...` URL to send the browser to.
 */
export async function approve(params: OAuthParams): Promise<ConsentRedirect> {
  const { data } = await api.post<ConsentRedirect>('/oauth/consent/approve', {
    decision: 'approve',
    ...toRecord(params),
  });
  return data;
}

/**
 * Record a denial. The backend returns the
 * `redirect_uri?error=access_denied&state=...` URL.
 */
export async function deny(params: OAuthParams): Promise<ConsentRedirect> {
  const { data } = await api.post<ConsentRedirect>('/oauth/consent/approve', {
    decision: 'deny',
    ...toRecord(params),
  });
  return data;
}
