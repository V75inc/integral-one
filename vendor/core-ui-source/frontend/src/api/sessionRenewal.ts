import axios from 'axios';
import { getApiBaseURL } from '../config';
import { getSessionPolicy } from './sessionPolicy';
import { getHostSession } from '../host/session';
import { normalizeUserMe } from './helpers';
import { getRefreshToken, getSessionGeneration, isRefreshInFlight, refreshAccessToken, redirectToLogin, type TokenPayload } from './session';
import type { User } from '../types';
import { getRecoveryAccountId } from './sessionRecovery';

/** Use bare requests: the paused application client intentionally rejects work. */
export async function renewSession(
  expectedAccountId: string,
  credentials?: { email: string; password: string },
): Promise<{ tokens: TokenPayload; user: User; generation: number }> {
  const generation = getSessionGeneration();
  if (expectedAccountId !== getRecoveryAccountId()) throw new Error('The session changed. Please try again.');
  const deadline = Number(localStorage.getItem('t75_token_expires_at'));
  if (!credentials && (!localStorage.getItem('t75_token') || deadline <= Date.now())) {
    redirectToLogin();
    throw new Error('Your session expired. Sign in again.');
  }
  const host = getHostSession();
  let tokens: TokenPayload;
  try {
    if (host) {
      tokens = await host.session();
    } else {
      // Let an exchange started just before expiry finish rotating its token.
      if (!credentials && isRefreshInFlight()) await refreshAccessToken();
      const refreshToken = getRefreshToken();
      if (!credentials && !refreshToken) {
        // A valid access-only session can resume after authoritative verification.
        tokens = { access_token: localStorage.getItem('t75_token') ?? '', expires_in: (deadline - Date.now()) / 1000 };
      } else {
        const response = await axios.post<TokenPayload>(
          `${getApiBaseURL()}/auth/${credentials ? 'login' : 'refresh'}`,
          credentials ?? { refresh_token: refreshToken },
          { timeout: getSessionPolicy().renewal_request_timeout_seconds * 1000 },
        );
        tokens = response.data;
      }
    }
    if (!tokens.access_token) throw new Error('Session renewal did not complete. Please try again.');
    const response = await axios.get(`${getApiBaseURL()}/auth/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }, timeout: getSessionPolicy().renewal_request_timeout_seconds * 1000,
    });
    const user = normalizeUserMe(response.data);
    // Never expose retained page inputs/cache to a different authenticated user.
    if (!user.id || user.id !== expectedAccountId) {
      throw new Error('This page belongs to a different account. Sign out before changing accounts.');
    }
    if (generation !== getSessionGeneration() || expectedAccountId !== getRecoveryAccountId()) {
      throw new Error('The session changed. Please try again.');
    }
    if (!credentials && deadline <= Date.now()) {
      redirectToLogin();
      throw new Error('Your session expired. Sign in again.');
    }
    if (!credentials && !getRefreshToken() && !host) tokens.expires_in = (deadline - Date.now()) / 1000;
    return { tokens, user, generation };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (!credentials && generation === getSessionGeneration() && expectedAccountId === getRecoveryAccountId()
        && (status === 400 || status === 401 || status === 403)) redirectToLogin();
    throw error;
  }
}
