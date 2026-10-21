import { ExpandableChatError } from "../components/ExpandableChatError";
import { useMemo, useState, type ReactNode } from 'react';
import { diffBodyWithoutSummary } from '../staging/diffBodyWithoutSummary';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Button } from '../../../components/ui';
import { MarkdownContent } from '../../../components/ui/MarkdownContent';
import { IconButton, Input, Surface, Text } from '../../../ui';
import { usePromptQueue } from './usePromptQueue';
import type { PromptQuestionItem, PromptStagedWriteItem } from './types';

/**
 * Bottom sheet over the chat composer — unified Prompt Sheet for clarifying
 * questions and staged-write bless. Composer stays locked while open.
 *
 * Call once in the viewport footer; pass ``composerLocked`` into Composer.
 */
export function PromptSheetHost({
  children,
}: {
  children: (state: {
    composerLocked: boolean;
    canReplyInChat: boolean;
    sheet: ReactNode;
  }) => ReactNode;
}) {
  const sheet = usePromptQueue();
  const node = sheet.open && sheet.current ? <PromptSheetView sheet={sheet} /> : null;
  return (
    <>
      {children({
        composerLocked: sheet.open,
        canReplyInChat: sheet.open && sheet.current?.kind === 'staged_write',
        sheet: node,
      })}
    </>
  );
}

function PromptSheetView({
  sheet,
}: {
  sheet: ReturnType<typeof usePromptQueue>;
}) {
  if (!sheet.current) return null;

  return (
    <div
      role="dialog"
      aria-label="Agent prompts"
      data-prompt-sheet="open"
      className="w-full"
    >
      <Surface
        tone="panel"
        border="subtle"
        radius="none"
        elevation="card"
        className="
          w-full rounded-t-2xl border-b-0 px-4 pb-3 pt-2.5
          shadow-[0_-10px_28px_rgba(0,0,0,0.12)]
        "
      >
      <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--border-subtle)]" />
      <div className="mb-3 flex items-center justify-between gap-2">
        <Text variant="label" tone="muted">
          {sheet.page.total > 1
            ? `Prompt ${sheet.page.index + 1} of ${sheet.page.total}`
            : sheet.current.kind === 'question'
              ? 'Question'
              : 'Approval'}
          {sheet.current.status !== 'pending'
            ? ` · ${sheet.current.status}`
            : ''}
        </Text>
        {sheet.page.total > 1 ? (
          <div className="flex items-center gap-0.5">
            <IconButton
              label="Previous prompt"
              disabled={!sheet.page.canPrev}
              onClick={sheet.page.prev}
            >
              <ChevronLeft size={14} aria-hidden />
            </IconButton>
            <IconButton
              label="Next prompt"
              disabled={!sheet.page.canNext}
              onClick={sheet.page.next}
            >
              <ChevronRight size={14} aria-hidden />
            </IconButton>
          </div>
        ) : null}
      </div>

      {/* keyed by item id: without it React reuses the page component across
          Prev/Next, so a selection made for one prompt stayed picked — and
          submittable — on the next one. */}
      {sheet.current.kind === 'question' ? (
        <QuestionPage
          key={sheet.current.id}
          item={sheet.current}
          busy={sheet.busy}
          onAnswer={sheet.answerQuestion}
          onSkip={sheet.skipQuestion}
        />
      ) : (
        <WritePage
          key={sheet.current.id}
          item={sheet.current}
          busy={sheet.busy}
          onApprove={sheet.approveWrite}
          onReject={sheet.rejectWrite}
        />
      )}

      {sheet.error ? (
        <ExpandableChatError summary={<Text as="span" variant="body-sm" tone="danger">{sheet.error}</Text>} className="mt-2">
          <Text as="p" variant="body-sm" tone="danger">{sheet.error}</Text>
        </ExpandableChatError>
      ) : null}

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={sheet.busy}
          onClick={() => void sheet.cancelAll()}
        >
          <X size={12} className="mr-1" />
          Cancel all
        </Button>
      </div>
    </Surface>
    </div>
  );
}

function QuestionPage({
  item,
  busy,
  onAnswer,
  onSkip,
}: {
  item: PromptQuestionItem;
  busy: boolean;
  onAnswer: (choices: string[], freeText?: string) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const multi = Boolean(item.multi_select);
  const pending = item.status === 'pending';

  const toggle = (label: string) => {
    if (!pending || busy) return;
    if (!multi) {
      void onAnswer([label]);
      return;
    }
    setPicked((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label],
    );
  };

  return (
    <div>
      <Text
        as="p"
        variant="meta"
        tone="muted"
        className="mb-1 uppercase tracking-wide"
      >
        {item.header || 'Question'}
      </Text>
      <Text as="p" variant="body" weight="medium" className="mb-2">
        {item.question}
      </Text>
      <div className="flex flex-col gap-1.5">
        {item.options.map((opt) => {
          const selected = picked.includes(opt.label);
          return (
            <button
              key={opt.label}
              type="button"
              disabled={!pending || busy}
              onClick={() => toggle(opt.label)}
              className={`
                rounded-[var(--radius-input)] border px-3 py-2 text-left
                transition disabled:opacity-50
                ${
                  selected
                    ? 'border-[var(--accent)]'
                    : 'border-[var(--border-subtle)]'
                }
              `}
            >
              <Text as="div" variant="body-sm" weight="medium">
                {opt.label}
              </Text>
              {opt.description ? (
                <Text as="div" variant="meta" tone="muted">
                  {opt.description}
                </Text>
              ) : null}
            </button>
          );
        })}
      </div>
      {pending ? (
        <div className="mt-2 flex gap-2">
          <Input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Other…"
            disabled={busy}
            size="sm"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || (!other.trim() && !(multi && picked.length))}
            onClick={() =>
              void onAnswer(multi ? picked : [], other.trim() || undefined)
            }
          >
            {multi ? `Send${picked.length ? ` ${picked.length}` : ''}` : 'Send'}
          </Button>
        </div>
      ) : null}
      {pending ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void onSkip()}
          >
            Skip
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function WritePage({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: PromptStagedWriteItem;
  busy: boolean;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const pending = item.status === 'pending';
  const human = useMemo(() => {
    const d = item.diff_human;
    let raw = '';
    if (typeof d === 'string') raw = d;
    else if (d && typeof d === 'object') raw = JSON.stringify(d, null, 2);
    return diffBodyWithoutSummary(item.summary, raw);
  }, [item.diff_human, item.summary]);

  return (
    <div>
      <Text
        as="p"
        variant="meta"
        tone="muted"
        className="mb-1 uppercase tracking-wide"
      >
        Review change
      </Text>
      <Text as="p" variant="body" weight="medium" className="mb-2">
        {item.summary || 'Staged change'}
      </Text>
      {item.last_error && (
        <div role="alert" className="mb-2">
          <ExpandableChatError summary={<Text as="span" variant="meta" tone="danger">Your approval was saved, but this change couldn't be finished.</Text>}>
            <Text as="p" variant="meta" tone="danger">
              {item.last_error.message || 'The change could not be applied.'}
              {item.completed_operations ? ` ${item.completed_operations} changes were already saved. Trying again continues with what's left.` : ''}
            </Text>
          </ExpandableChatError>
        </div>
      )}
      {human ? (
        <div className="mb-2 max-h-40 overflow-auto rounded border border-[var(--border-subtle)] p-2 text-xs">
          <MarkdownContent mutedBody={false}>{human}</MarkdownContent>
        </div>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void onApprove()}
          >
            {item.staged_state === 'blessed' ? 'Retry application' : 'Approve'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void onReject()}
          >
            Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}
