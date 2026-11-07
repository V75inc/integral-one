import { MarkdownContent } from '../../../components/ui/MarkdownContent';
import { Text } from '../../../ui';
import { describeCron } from '../../../utils/scheduleCron';
import { diffBodyWithoutSummary } from './diffBodyWithoutSummary';
import { operationInput, StagedOperationInputs } from './StagedOperationInputs';
import type { StagedChange } from './types';

type Review = Pick<StagedChange, 'kind' | 'summary' | 'diff_machine' | 'diff_human'>;

/** Presentation only: the bound token, inputs and decision authority never change. */
export function approvalRequestSentence(summary: string): string {
  const clean = summary.trim().replace(/^File content as /, 'Save ');
  if (!clean) return 'Integral would like to make a change. Review the details before approving.';
  if (clean.startsWith('New routine:')) return 'This will schedule an automatic update in this chat.';
  const verb = /^(Create|Update|Delete|Remove|Add|Move|Attach|Detach|Set|Install|Uninstall|Publish|Revise|Revoke|Send|Run|Import|Export|Provision|Archive|Restore|Apply|Change|Save|Schedule|Cancel|File|Rename|Link|Unlink|Merge|Split)\b/.exec(clean);
  if (!verb) return clean;
  const action = verb[0].toLowerCase() + clean.slice(verb[0].length);
  return `This will ${action}${/[.!?]$/.test(action) ? '' : '.'}`;
}

function RoutineRequest({ staged }: { staged: Review }) {
  const change = staged.diff_machine;
  if (staged.kind !== 'routine_task_create' || change.op !== staged.kind) return null;
  const instruction = typeof change.instruction === 'string' ? change.instruction : '';
  const timezone = typeof change.timezone === 'string' ? change.timezone : undefined;
  const cadence = typeof change.run_at === 'string' && change.run_at
    ? `at ${change.run_at}${timezone ? ` (${timezone})` : ''}`
    : typeof change.cron === 'string' ? describeCron(change.cron, timezone) : '';
  const limit = typeof change.max_runs === 'number' && Number.isInteger(change.max_runs) && change.max_runs > 0
    ? ` It will stop after ${change.max_runs} successful ${change.max_runs === 1 ? 'run' : 'runs'}.`
    : ' It will continue until you pause or stop it.';
  const writes = Array.isArray(change.write_scope) && change.write_scope.length > 0;
  return <div className="flex flex-col gap-3">
    {instruction ? <Text as="p" variant="body-sm" className="whitespace-pre-wrap break-words">{instruction}</Text> : null}
    {cadence ? <Text as="p" variant="body-sm" tone="muted">
      {change.delivery_mode === 'reminder' ? 'The saved text will be posted' : 'Integral will check current information and post its result'} {cadence.charAt(0).toLowerCase() + cadence.slice(1)}.{limit}
    </Text> : null}
    {writes ? <Text as="p" variant="body-sm">
      Future runs may change the approved resources without another prompt. Review the permitted resources in the change details before approving.
    </Text> : null}
  </div>;
}

/** Shared by chat and Inbox: one prose request, followed by inspectable evidence. */
export function ApprovalRequestContent({ staged, onNavigate }: {
  staged: Review;
  onNavigate?: () => void;
}) {
  const input = operationInput(staged);
  const hasInputs = input !== null || (staged.kind === 'batch' && Array.isArray(staged.diff_machine.operations));
  const review = staged.diff_machine.review;
  const description = review && typeof review === 'object' && !Array.isArray(review)
    && typeof (review as Record<string, unknown>).description === 'string'
    ? (review as { description: string }).description.trim() : '';
  // Command narration can contain invented JSON. Its bound inputs below are
  // the review evidence; never substitute a narrated payload for those inputs.
  const body = input ? '' : diffBodyWithoutSummary(staged.summary, staged.diff_human);

  return <div className="flex min-w-0 flex-col gap-3">
    <Text as="p" variant="body" className="whitespace-pre-wrap break-words">
      {approvalRequestSentence(staged.summary)}
    </Text>
    <RoutineRequest staged={staged} />
    {description ? <Text as="p" variant="body-sm" tone="muted" className="whitespace-pre-wrap break-words">{description}</Text> : null}
    {body ? <details className="group">
      <summary className="cursor-pointer rounded-[var(--radius-input)] py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
        <Text as="span" variant="body-sm" tone="muted">Review change details</Text>
      </summary>
      <div className="mt-3 max-h-80 overflow-auto overscroll-contain pr-2">
        <MarkdownContent mutedBody={false}>{body}</MarkdownContent>
      </div>
    </details> : null}
    {hasInputs ? <StagedOperationInputs staged={staged} onNavigate={onNavigate} /> : null}
  </div>;
}
