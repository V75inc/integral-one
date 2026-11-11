import { RelationValue } from '../../../components/entries/relations/RelationValue';
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
  const verb = /^(Create|Update|Delete|Remove|Add|Move|Attach|Detach|Set|Install|Uninstall|Publish|Revise|Revoke|Send|Run|Import|Export|Provision|Archive|Restore|Close|Apply|Change|Save|Schedule|Cancel|File|Rename|Link|Unlink|Merge|Split)\b/.exec(clean);
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
  const taskWatch = change.delivery_mode === 'task_watch';
  const assignmentDigest = change.delivery_mode === 'assignment_digest';
  const goalWatch = taskWatch && change.watch_goal === true;
  const preparesClosure = goalWatch && change.watch_prepare_closure === true;
  const watchEntry = typeof change.watch_entry_id === 'string' ? change.watch_entry_id : '';
  const delivery = taskWatch
    ? goalWatch ? 'Integral will check the watched goal' : 'Integral will check the watched task'
    : assignmentDigest
      ? 'Integral will check for assignments ready for review'
      : change.delivery_mode === 'reminder'
        ? 'The saved text will be posted'
        : 'Integral will check current information and post its result';
  const writes = Array.isArray(change.write_scope) && change.write_scope.length > 0;
  return <div className="flex flex-col gap-3">
    {instruction ? <Text as="p" variant="body-sm" className="whitespace-pre-wrap break-words">{instruction}</Text> : null}
    {cadence ? <Text as="p" variant="body-sm" tone="muted">
      {delivery} {cadence.charAt(0).toLowerCase() + cadence.slice(1)}.{limit}
    </Text> : null}
    {taskWatch && watchEntry ? <Text as="p" variant="body-sm">
      Watched Entry {watchEntry}. {goalWatch
        ? preparesClosure
          ? 'When a changed goal meets every declared criterion, this routine may prepare a closure review. Closing the goal requires your approval.'
          : 'This routine reports changes to the goal outcome, status, or linked criterion evidence. It cannot edit or close the goal.'
        : 'This routine posts only when the task changes and cannot edit the Entry. It checks the declared outcome, acceptance criteria, due date, dependencies, and assignment.'}
    </Text> : null}
    {assignmentDigest && <Text as="p" variant="body-sm">
      Integral will post up to three new suggestions from assignments you sponsored in this workspace. It cannot prepare or edit tasks from this routine.
    </Text>}
    {writes ? <Text as="p" variant="body-sm">
      Future runs may change the approved resources without another prompt. Review the permitted resources in the change details before approving.
    </Text> : null}
  </div>;
}

function FilePreview({ staged }: { staged: Review }) {
  if (staged.kind !== 'attach_file' || staged.diff_machine.op !== 'attach_file') return null;
  const value = staged.diff_machine.file_preview;
  const preview = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  if (preview.available !== true || typeof preview.text !== 'string') {
    return <Text as="p" variant="body-sm" tone="muted">A content preview is not available for this file. Inspect it before approving.</Text>;
  }
  return <div>
    {preview.complete !== true ? <Text as="p" variant="body-sm" tone="muted">Partial preview. Inspect the complete file before approving.</Text> : null}
    <details>
      <summary className="cursor-pointer"><Text as="span" variant="body-sm">Preview file content</Text></summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">{preview.text || '(Empty file)'}</pre>
    </details>
  </div>;
}

type ChatFileReview = { threadId: string; attachmentId: string; filename: string; expectedSha256: string };

function chatFileReviews(staged: Review): ChatFileReview[] {
  const operations = staged.kind === 'batch' && Array.isArray(staged.diff_machine.operations)
    ? staged.diff_machine.operations : [staged];
  return operations.flatMap(operation => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return [];
    const item = operation as Record<string, unknown>;
    if (item.kind !== 'attach_uploaded_file' || !item.diff_machine || typeof item.diff_machine !== 'object') return [];
    const machine = item.diff_machine as Record<string, unknown>;
    const review = machine.file_review;
    if (machine.op !== 'attach_uploaded_file' || !review || typeof review !== 'object' || Array.isArray(review)) return [];
    const file = review as Record<string, unknown>;
    if (typeof file.thread_id !== 'string' || !/^n\.ChatThread\.[\w-]+$/.test(file.thread_id)
      || typeof file.attachment_id !== 'string' || !/^n\.Attachment\.[\w-]+$/.test(file.attachment_id)
      || file.attachment_id !== machine.attachment_id || typeof file.filename !== 'string'
      || typeof machine.expected_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(machine.expected_sha256)) return [];
    return [{ threadId: file.thread_id, attachmentId: file.attachment_id, filename: file.filename, expectedSha256: machine.expected_sha256 }];
  });
}

function ReviewChatFile({ file }: { file: ChatFileReview }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await aiChatApi.downloadChatAttachmentForReview(file.threadId, file.attachmentId, file.expectedSha256);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Control characters are intentionally excluded from download filenames.
      // eslint-disable-next-line no-control-regex
      link.download = file.filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120) || 'attachment';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not open this file. It may have changed or you may no longer have access.');
    } finally { setBusy(false); }
  };
  return <div>
    <button type="button" onClick={() => void download()} disabled={busy} className="text-sm underline disabled:opacity-50">
      {busy ? 'Preparing file…' : `Download ${file.filename} for review`}
    </button>
    {error ? <div role="alert"><Text as="p" variant="body-sm" tone="danger">{error}</Text></div> : null}
  </div>;
}

function GoalClosureEvidence({ staged, onNavigate }: { staged: Review; onNavigate?: () => void }) {
  const change = staged.diff_machine;
  if (staged.kind !== 'file_content' || change.op !== staged.kind || change.close_goal !== true) return null;
  const evidence = change.evidence_revisions;
  const rows = evidence && typeof evidence === 'object' && !Array.isArray(evidence)
    ? Object.entries(evidence).filter(([id, revision]) =>
      /^n\.Entry\.[\w-]+$/.test(id)
      && typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0)
    : [];
  return <div className="flex flex-col gap-2">
    <Text as="p" variant="body-sm">
      Approval marks the goal completed and adds the closure note only if every published criterion passes against the reviewed Entry revisions.
    </Text>
    {rows.length > 0 && <ul aria-label="Supporting Entry revisions" className="space-y-1">
      {rows.map(([id, revision]) => <li key={id} className="flex flex-wrap items-center gap-2">
        <RelationValue value={id} relation={{ target: 'entry' }} onNavigate={onNavigate} />
        <Text as="span" variant="body-sm" tone="muted">Revision {String(revision)}</Text>
      </li>)}
    </ul>}
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
    <GoalClosureEvidence staged={staged} onNavigate={onNavigate} />
    <FilePreview staged={staged} />
    {chatFileReviews(staged).map((file, index) => <ReviewChatFile key={`${file.attachmentId}-${index}`} file={file} />)}
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
import { useState } from 'react';
import { aiChatApi } from '../../../api/aiChat';
