import type { InvitationGrantReceipt } from '../types';

/** Describe current access separately from the invitation's original request. */
export function invitationAcceptanceMessage(
  role: string | null,
  receipt?: InvitationGrantReceipt,
): string {
  if (!role) return 'Access was not granted. Ask the workspace owner to review this invitation.';
  if (receipt?.outcome === 'conflict') {
    return `Access changed since this invitation was sent. Your current role is ${role}.`;
  }
  if (receipt?.outcome === 'unchanged') return `Your existing ${role} access is unchanged.`;
  return `Access confirmed as ${role}.`;
}
