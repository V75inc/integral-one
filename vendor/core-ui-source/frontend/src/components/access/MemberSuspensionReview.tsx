import { useState } from 'react';
import { accessControlApi, type SuspensionReview } from '../../api/accessControl';
import { Button } from '../ui';

export function MemberSuspensionReview({ workspaceId, memberId, name }: {
  workspaceId: string; memberId: string; name: string;
}) {
  const [review, setReview] = useState<SuspensionReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function inspect() {
    setBusy(true); setError(''); setReview(null);
    try { setReview(await accessControlApi.reviewSuspension(workspaceId, memberId)); }
    catch { setError('Access review could not be loaded. Retry before changing suspension.'); }
    finally { setBusy(false); }
  }
  async function apply(suspended: boolean) {
    if (!review) return;
    setBusy(true); setError('');
    try {
      await accessControlApi.setSuspension(workspaceId, memberId, suspended, review);
      setReview(await accessControlApi.reviewSuspension(workspaceId, memberId));
    } catch {
      setReview(null);
      setError('The change was not confirmed. Load a fresh review before retrying.');
    } finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <Button variant="secondary" size="sm" disabled={busy} onClick={inspect}>Review access for {name}</Button>
    {error && <p role="alert" className="text-sm text-[var(--danger-fg)]">{error}</p>}
    {review && <div role="group" aria-label={`Suspension review for ${name}`} className="space-y-2 text-sm">
      <p>{review.state === 'suspended' ? 'Access is suspended.' : 'Access is active.'} Retained membership: {review.membership_role || 'none'}.</p>
      {review.retained_access?.length ? <ul>{review.retained_access.map((row, index) => <li key={index}>{row.resource_type}: {row.resource_id} · {row.role || row.source}</li>)}</ul> : null}
      <p>Suspension blocks this workspace and survives removal and new invitations. Resuming uses the current retained access; it does not restore revoked grants.</p>
      <Button size="sm" disabled={busy} onClick={() => apply(review.state !== 'suspended')}>
        {review.state === 'suspended' ? 'Resume reviewed access' : 'Suspend workspace access'}
      </Button>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
    </div>}
  </div>;
}
