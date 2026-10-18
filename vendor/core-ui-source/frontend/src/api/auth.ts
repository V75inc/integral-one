import { getHostSession } from '../host/session';
import apiClient from './client';
import { normalizeUserMe } from './helpers';
import type { User } from '../types';
import type { Workspace } from './workspaces';

export interface LoginResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string | null;
  refresh_expires_in?: number | null;
  user?: unknown;
}

export interface SignupResponse extends LoginResponse {
  workspace?: Workspace;
}

export const authApi = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    apiClient.post('/auth/login', { email, password }).then(r => r.data),
  signup: (
    email: string,
    password: string,
    display_name: string,
    workspaceName?: string
  ): Promise<SignupResponse> =>
    apiClient
      .post('/auth/signup', {
        email,
        password,
        name: display_name,
        ...(workspaceName?.trim()
          ? { workspaceName: workspaceName.trim() }
          : {}),
      })
      .then(r => r.data),
  me: (): Promise<User> =>
    apiClient.get('/auth/me').then(async r => {
      const user = normalizeUserMe(r.data);
      const profile = await getHostSession()?.profile?.();
      return profile ? {...user, email: profile.email, display_name: user.display_name && user.display_name !== 'Owner' ? user.display_name : profile.name || profile.email} : user;
    }),
  /** Blacklists the current JWT on the server (requires Bearer token). */
  logout: () => apiClient.post('/auth/logout').then(r => r.data),
  updateProfile: (data: Record<string, unknown>): Promise<User> =>
    apiClient
      .put('/auth/update-profile', data)
      .then(r => normalizeUserMe(r.data)),

  /** Trigger a password-reset email. Always resolves with a generic message
   *  regardless of whether the email is registered (anti-enumeration). */
  forgotPassword: (
    email: string,
  ): Promise<{ ok: boolean; message: string }> =>
    apiClient
      .post('/auth/forgot-password', { email })
      .then(r => r.data),

  /** Consume a reset token and set a new password. Throws an axios error on
   *  4xx with `error.response.data.detail = { error_code, message }`. */
  resendCredentialsDelivery: (memberUserId: string, intentId: string) =>
    apiClient.post<{ ok: boolean; challenge_emailed: boolean }>(
      '/auth/credentials-delivery/resend', { member_user_id: memberUserId, intent_id: intentId },
    ),

  verifyCredentialsDelivery: (memberUserId: string, intentId: string, code: string) =>
    apiClient.post<{ ok: boolean; credentials_emailed: boolean; message: string }>(
      '/auth/credentials-delivery/verify',
      { member_user_id: memberUserId, intent_id: intentId, code },
    ),

  resetPassword: (
    token: string,
    password: string,
  ): Promise<{ ok: boolean; message: string }> =>
    apiClient
      .post('/auth/reset-password', { token, password })
      .then(r => r.data),

  /** Consume a 6-digit verification OTP. Resolves with `{ ok: true }` on
   *  success; throws an axios error on 4xx with `error_code`. */
  verifyEmail: (code: string): Promise<{ ok: boolean; message: string }> =>
    apiClient.post('/auth/verify-email', { code }).then(r => r.data),

  /** Generate and resend a fresh verification OTP to the authenticated
   *  user's registered email address. */
  resendVerification: (): Promise<{ ok: boolean; message: string }> =>
    apiClient.post('/auth/resend-verification').then(r => r.data),

  changePassword: (
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: boolean; message: string; must_change_password: boolean }> =>
    apiClient
      .post('/auth/update-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      .then(r => r.data),

  completeAssignedForm: (): Promise<{ ok: boolean; cleared: boolean }> =>
    apiClient.post('/auth/complete-assigned-form').then(r => r.data),

  /** @deprecated use completeAssignedForm */
  completeOnboardingForm: (): Promise<{ ok: boolean; cleared: boolean }> =>
    apiClient.post('/auth/complete-assigned-form').then(r => r.data),
};

/** Stable error_code constants for the password-reset flow.
 *  Kept in sync with backend/app/services/password_reset.py. */
export const PasswordResetError = {
  INVALID_TOKEN: 'auth.reset.token_invalid',
  EXPIRED_TOKEN: 'auth.reset.token_expired',
  ATTEMPTS_EXCEEDED: 'auth.reset.attempts_exceeded',
  WEAK_PASSWORD: 'auth.reset.password_too_short',
  USER_INACTIVE: 'auth.reset.user_inactive',
} as const;

export function unwrapWorkspace(res: SignupResponse): SignupResponse['workspace'] {
  return res.workspace;
}
