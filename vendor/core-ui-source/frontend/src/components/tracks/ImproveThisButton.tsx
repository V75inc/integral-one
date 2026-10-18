import { Sparkles } from 'lucide-react';
import { Button } from '../ui';
import { useScopeOptional } from '../../context/ScopeContext';
import { useAuthOptional } from '../../context/AuthContext';
import { requestOpenCompanionChat } from '../../features/ai-chat/chatHandoff';

export type ImprovementTarget = 'entry' | 'track' | 'view';

/** Open the resident with the already-published page context and submit a review request. */
export function ImproveThisButton({
  target,
  subjectName,
  disabled = false,
  compact = false,
}: {
  target: ImprovementTarget;
  subjectName?: string | null;
  subjectId?: string | null;
  trackId?: string | null;
  disabled?: boolean;
  compact?: boolean;
}) {
  const scope = useScopeOptional();
  const auth = useAuthOptional();
  const label = target === 'entry' ? 'record' : target;
  const subject = subjectName?.trim();
  const reviewWorkflow =
    target === 'entry'
      ? 'Use the integral-model skill to inspect the focused entry and its parent track’s existing model before proposing any evidence-based revision. Do not create a new model.'
      : `Use the integral-model skill. Call integral_describe_model for the focused track, then call integral_recommend_customizations for that same track before proposing changes. If there is an evidence-backed recommendation, open a draft for the attached model, stage one revision using only that suggestion, and show me its diff. Do not call integral_draft_new_model or integral_author_model; this target already has an attached model. If there is no attached model or no evidence-backed recommendation, report that and stop without creating a new model.`;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={`Enhance this ${label}`}
      title={`Enhance this ${label}`}
      className={compact ? 'h-8 w-8 !p-0' : undefined}
      onClick={() =>
        requestOpenCompanionChat({
          submit: true,
          workspaceId: scope?.scope?.workspaceId ?? null,
          principalId: auth?.user?.id ?? null,
          draftText:
            `Please review the currently open ${label}${subject ? ` “${subject}”` : ''} ` +
            `Review its existing schema and available records. ${reviewWorkflow} ` +
            'Show me the diff. ' +
            'Do not publish the revision until I approve it.',
        })
      }
      disabled={disabled || !scope?.scope?.workspaceId || !auth?.user?.id}
    >
      <Sparkles size={16} aria-hidden />
      <span className={compact ? 'sr-only' : 'hidden sm:inline'}>Enhance</span>
    </Button>
  );
}
