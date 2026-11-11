import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui';
import { Text } from '../../../ui';
import { acceptRoutineOpportunity, deferRoutineOpportunity, dismissRoutineOpportunity, requestRoutineOpportunityReview, type AssignmentSuggestion } from '../../../api/routines';

function Suggestion({ messageId, suggestion, index }: {
  messageId: string;
  suggestion: AssignmentSuggestion;
  index: number;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [deferredUntil, setDeferredUntil] = useState<string | null>(null);
  const [reviewRequested, setReviewRequested] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = `Assigned task ${index + 1}`;
  const apply = async (action: 'dismiss' | 'later' | 'prepare' | 'accept') => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'dismiss') {
        await dismissRoutineOpportunity(messageId, suggestion.entry_id);
        setDismissed(true);
      } else if (action === 'later') {
        setDeferredUntil(await deferRoutineOpportunity(messageId, suggestion.entry_id));
      } else if (action === 'accept') {
        await acceptRoutineOpportunity(messageId, suggestion.entry_id);
        setAccepted(true);
      } else {
        await requestRoutineOpportunityReview(messageId, suggestion.entry_id);
        setReviewRequested(true);
      }
    } catch {
      setError('Could not update this suggestion. It may have been superseded.');
    } finally {
      setBusy(false);
    }
  };

  if (dismissed || suggestion.dismissed) {
    return <li><Text as="span" variant="body-sm" tone="muted">{label} dismissed</Text></li>;
  }
  const entryPath = `/tracks/${encodeURIComponent(suggestion.track_id)}?entry=${encodeURIComponent(suggestion.entry_id)}`;
  if (reviewRequested || suggestion.review_requested) {
    return <li className="flex flex-wrap items-center gap-2">
      <Text as="span" variant="body-sm" tone="muted">Preparation review requested</Text>
      <Link to={entryPath}>Open {label.toLowerCase()}</Link>
    </li>;
  }
  const until = deferredUntil ?? suggestion.deferred_until;
  if (until) {
    return <li><Text as="span" variant="body-sm" tone="muted">
      {label} deferred until <time dateTime={until}>{new Date(until).toLocaleString()}</time>
    </Text></li>;
  }
  return <li>
    <div className="flex flex-wrap items-center gap-2">
      <Link to={entryPath}>
        Review {label.toLowerCase()}
      </Link>
      {accepted || suggestion.accepted
        ? <Text as="span" variant="body-sm" tone="muted">Accepted for follow-up</Text>
        : <Button size="xs" variant="ghost" disabled={busy} onClick={() => void apply('accept')} aria-label={`Accept ${label.toLowerCase()} for follow-up`}>
            Accept
          </Button>}
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void apply('prepare')} aria-label={`Request preparation review for ${label.toLowerCase()}`}>
        Prepare
      </Button>
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void apply('dismiss')} aria-label={`Dismiss ${label.toLowerCase()}`}>
        Dismiss
      </Button>
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void apply('later')} aria-label={`Defer ${label.toLowerCase()} for 24 hours`}>
        Later
      </Button>
    </div>
    {error && <div role="alert"><Text as="p" variant="body-sm" tone="danger">{error}</Text></div>}
  </li>;
}

export function AssignmentDigestSuggestions({ messageId, suggestions }: {
  messageId: string;
  suggestions: AssignmentSuggestion[];
}) {
  return <div className="my-2 space-y-2">
    <p>These assignments are ready for a first preparation review. Accept to keep a task for follow-up, or use Prepare to request a review.</p>
    <ul aria-label="Assignment suggestions" className="space-y-1">
      {suggestions.map((suggestion, index) => (
        <Suggestion key={suggestion.entry_id} messageId={messageId} suggestion={suggestion} index={index} />
      ))}
    </ul>
  </div>;
}
