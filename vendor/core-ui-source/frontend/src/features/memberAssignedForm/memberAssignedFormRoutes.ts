import type { User } from '../../types';

/** Authenticated member assigned-entry wizard (any app; not public share). */
export const MEMBER_ASSIGNED_FORM_PATH = '/me/assigned-form';

export function pendingAssignedFormUrl(user: User | null | undefined): string {
  return (
    user?.pending_assigned_form?.url?.trim() ||
    user?.pending_onboarding_form?.url?.trim() ||
    ''
  );
}

/** Legacy HR bundle route — still recognized when resolving stored URLs. */
export const LEGACY_MEMBER_ASSIGNED_FORM_PATH = '/hr/employee-onboarding';

/**
 * Map stored pending URLs (legacy paths or public share) to the canonical
 * member assigned-form route, preserving `?entry=` when present.
 */
export function resolveMemberAssignedFormNavigateTarget(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return MEMBER_ASSIGNED_FORM_PATH;

  if (
    trimmed.startsWith(MEMBER_ASSIGNED_FORM_PATH) ||
    trimmed.startsWith(LEGACY_MEMBER_ASSIGNED_FORM_PATH)
  ) {
    const pathOnly = trimmed.split('#')[0];
    if (pathOnly.startsWith(LEGACY_MEMBER_ASSIGNED_FORM_PATH)) {
      return pathOnly.replace(
        LEGACY_MEMBER_ASSIGNED_FORM_PATH,
        MEMBER_ASSIGNED_FORM_PATH,
      );
    }
    return pathOnly;
  }

  try {
    const parsed = trimmed.startsWith('http')
      ? new URL(trimmed)
      : new URL(trimmed, 'http://local.invalid');

    if (
      parsed.pathname.includes(MEMBER_ASSIGNED_FORM_PATH) ||
      parsed.pathname.includes(LEGACY_MEMBER_ASSIGNED_FORM_PATH)
    ) {
      const path = parsed.pathname.replace(
        LEGACY_MEMBER_ASSIGNED_FORM_PATH,
        MEMBER_ASSIGNED_FORM_PATH,
      );
      return `${path}${parsed.search}`;
    }

    const entry = parsed.searchParams.get('entry')?.trim();
    if (entry) {
      return `${MEMBER_ASSIGNED_FORM_PATH}?entry=${encodeURIComponent(entry)}`;
    }
  } catch {
    /* ignore malformed URLs */
  }

  return MEMBER_ASSIGNED_FORM_PATH;
}

export function isMemberAssignedFormPathname(pathname: string): boolean {
  const path = String(pathname || '').replace(/\/+$/, '');
  return (
    path === MEMBER_ASSIGNED_FORM_PATH ||
    path.endsWith(MEMBER_ASSIGNED_FORM_PATH) ||
    path === LEGACY_MEMBER_ASSIGNED_FORM_PATH ||
    path.endsWith(LEGACY_MEMBER_ASSIGNED_FORM_PATH)
  );
}
