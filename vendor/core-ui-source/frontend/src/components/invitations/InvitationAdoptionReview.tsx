import { useState } from 'react';
import { invitationsApi } from '../../api';
import type { InvitationAdoptionReview as Review } from '../../api/invitations';
import { Button } from '../ui';

/** Owner decision controls; the backend independently enforces current ownership. */
export function InvitationAdoptionReview({ workspaceId, invitationId, onAdopted }: {
  workspaceId: string; invitationId: string; onAdopted: (url: string) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [role, setRole] = useState('');
  const [apps, setApps] = useState(false);
  const [tracks, setTracks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReview() {
    setBusy(true);
    setError(null);
    try {
      const snapshot = await invitationsApi.reviewAdoption(workspaceId, invitationId);
      setReview(snapshot);
      // A deliberate selection is required; requested rights are context only.
      setRole('');
      setApps(false);
      setTracks(false);
    } catch {
      setReview(null);
      setError('This invitation cannot be adopted. Review its target or revoke and reissue it.');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!review || !role) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invitationsApi.adopt(workspaceId, invitationId, {
        review_digest: review.review_digest, role,
        can_create_apps: apps, can_create_tracks: tracks,
      });
      setReview(null);
      onAdopted(result.acceptance_url);
    } catch {
      setReview(null);
      setError('Adoption was not confirmed. Review the current invitation again before retrying.');
    } finally {
      setBusy(false);
    }
  }

  const roles = review?.target_resource_type
    ? ['viewer', 'commenter', 'editor', 'admin', 'owner'] : ['guest', 'member', 'admin'];
  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" disabled={busy} onClick={loadReview}>Review adoption</Button>
      {error && <p role="alert" className="text-sm text-[var(--danger-fg)]">{error}</p>}
      {review && (
        <div role="group" aria-label="Owner invitation adoption" className="space-y-2 text-sm">
          <p>Recipient: {review.email}. Target: {review.target_resource_type
            ? review.target_resource_type : 'this workspace'}.</p>
          <p>Originally requested: {review.requested_role || 'unspecified'}. Expires: {review.expires_at}.</p>
          <p>You will take responsibility for this pending invitation. The existing link will stop working. Send the new link to the recipient. No access is granted until acceptance.</p>
          <label className="block">Adopted role
            <select aria-label="Adopted role" value={role} disabled={busy} onChange={e => setRole(e.target.value)} className="app-input ml-2">
              <option value="">Choose a role</option>
              {roles.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {!review.target_resource_type && (
            <div className="space-x-4">
              <label><input type="checkbox" checked={apps} disabled={busy} onChange={e => setApps(e.target.checked)} /> Can create Apps</label>
              <label><input type="checkbox" checked={tracks} disabled={busy} onChange={e => setTracks(e.target.checked)} /> Can create Tracks</label>
            </div>
          )}
          <Button size="sm" disabled={busy || !role} onClick={apply}>Adopt and replace link</Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
