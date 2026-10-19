import { useCallback, useEffect, useMemo, useState } from 'react';
import { HelpCircle, Check } from 'lucide-react';
import { useThreadRuntime } from '@assistant-ui/react';

import { Surface, Text } from '../../../ui';
import { Button } from '../../../components/ui';
import {
  answerUserQuestion,
  getPendingUserQuestion,
} from '../../../api/agentive';
import { useChatActivity } from '../AIChatSurface';
import type { UserQuestion } from './types';
import './user-question.css';

/**
 * A clarifying question the resident asked, rendered as clickable options.
 *
 * The answer travels back on the same two-step path the staged-change card
 * uses: a REST call records the pick server-side (clearing the thread
 * marker), then the label is appended as an ordinary user message so the
 * model sees it as a normal turn. Nothing suspends the turn — the tool
 * already returned when this card rendered.
 *
 * State is reconciled against the server on mount. The persisted tool-call
 * result captured `state: "pending"` at ask time and never changes, so
 * without this the card would re-render as unanswered every time the user
 * navigates back to the thread.
 */
export function UserQuestionCard({ question }: { question: UserQuestion }) {
  const threadRuntime = useThreadRuntime();
  const { activeThreadId } = useChatActivity();

  const [answered, setAnswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const multi = Boolean(question.multi_select);

  // Reconcile: if the server no longer holds this question as pending, it
  // has been answered (here, in another tab, or by the user typing a reply
  // instead of clicking).
  useEffect(() => {
    if (!activeThreadId) return;
    let active = true;
    void getPendingUserQuestion(activeThreadId).then((pending) => {
      if (!active) return;
      if (!pending || pending.question_id !== question.question_id) {
        setAnswered(true);
      }
    });
    return () => {
      active = false;
    };
  }, [activeThreadId, question.question_id]);

  const submit = useCallback(
    async (choices: string[]) => {
      if (!choices.length || submitting || answered) return;
      setSubmitting(true);
      setError(null);
      try {
        if (activeThreadId) {
          await answerUserQuestion({
            threadId: activeThreadId,
            questionId: question.question_id,
            choices,
          });
        }
        setAnswered(true);
        // Deliver the answer as a normal user turn — the model has no other
        // way to learn the pick. Same channel StagedChangeCard nudges on.
        threadRuntime?.append({
          role: 'user',
          content: [{ type: 'text', text: choices.join(', ') }],
        });
      } catch {
        // The pick did not register; let the user try again rather than
        // leaving the card looking answered.
        setError('Could not record that answer. Try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [activeThreadId, answered, question.question_id, submitting, threadRuntime],
  );

  const toggle = useCallback((label: string) => {
    setPicked((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }, []);

  const optionRows = useMemo(() => question.options, [question.options]);

  return (
    <Surface
      tone="panel"
      border="default"
      radius="card"
      padding="md"
      className="flex flex-col gap-2"
      role="group"
    >
      <div className="flex items-start gap-2">
        <HelpCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          {question.header ? (
            <Text variant="meta" tone="subtle" as="p" className="uppercase tracking-[0.08em]">
              {question.header}
            </Text>
          ) : null}
          <Text variant="body" weight="medium" as="p">
            {question.question}
          </Text>
        </div>
      </div>

      {answered ? (
        <Text variant="body-sm" tone="muted" as="p" className="flex items-center gap-1.5">
          <Check size={13} aria-hidden />
          Answered
        </Text>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {optionRows.map((opt) => {
              const selected = picked.includes(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  disabled={submitting}
                  aria-pressed={multi ? selected : undefined}
                  onClick={() => (multi ? toggle(opt.label) : void submit([opt.label]))}
                  className="user-question-option w-full rounded-[var(--radius-input)] border border-[var(--panel-border)] px-3 py-2 text-left transition-colors duration-fast disabled:opacity-60"
                >
                  <Text variant="body-sm" weight="medium" as="span" className="block">
                    {opt.label}
                  </Text>
                  {opt.description ? (
                    <Text variant="meta" tone="muted" as="span" className="block leading-normal">
                      {opt.description}
                    </Text>
                  ) : null}
                </button>
              );
            })}
          </div>

          {multi ? (
            <div className="flex items-center justify-end">
              <Button
                size="xs"
                variant="primary"
                disabled={submitting || picked.length === 0}
                onClick={() => void submit(picked)}
              >
                {picked.length ? `Send ${picked.length}` : 'Select an option'}
              </Button>
            </div>
          ) : null}

          <Text variant="meta" tone="subtle" as="p" className="leading-normal">
            Or answer in your own words below.
          </Text>
        </>
      )}

      {/* `Text` takes no `role`, so the live region is the wrapper. */}
      {error ? (
        <p role="alert">
          <Text variant="meta" tone="danger">
            {error}
          </Text>
        </p>
      ) : null}
    </Surface>
  );
}
