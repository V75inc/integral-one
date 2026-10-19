import type { LoginResponse } from '../api/auth';

/** Trusted host session integration; Core still authorizes every resource. */
export interface HostSessionAdapter {
  identity: 'installation_owner' | 'accounts';
  session(): Promise<LoginResponse>;
  profile?(): Promise<{ email: string; name: string } | null>;
  signOut?(): Promise<void>;
  signIn?(): Promise<void>;
  resumeOffline?(): Promise<void>;
}
