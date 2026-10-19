/**
 * The answer round-trip is two steps that must both happen: record the pick
 * server-side (clearing the thread marker) AND append it as a user message
 * (the only way the model learns it). Dropping either half looks fine on
 * screen — the card flips to "Answered" — while the conversation silently
 * stalls or the card reopens on remount.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const append = vi.fn();
vi.mock('@assistant-ui/react', () => ({
  useThreadRuntime: () => ({ append }),
}));

vi.mock('../../../../api/agentive', () => ({
  answerUserQuestion: vi.fn(async () => ({ ok: true, cleared: true })),
  getPendingUserQuestion: vi.fn(async () => null),
}));

vi.mock('../../AIChatSurface', () => ({
  useChatActivity: () => ({ activeThreadId: 'n.ChatThread.1' }),
}));

import * as agentiveApi from '../../../../api/agentive';
import { UserQuestionCard } from '../UserQuestionCard';
import type { UserQuestion } from '../types';

const QUESTION: UserQuestion = {
  _kind: 'user_question',
  question_id: 'q1',
  question: 'Rebuild the track or extend it?',
  header: 'Approach',
  options: [
    { label: 'Rebuild', description: 'Start from scratch' },
    { label: 'Extend', description: 'Keep existing entries' },
  ],
  state: 'pending',
};

beforeEach(() => {
  vi.mocked(agentiveApi.getPendingUserQuestion).mockResolvedValue({
    question_id: 'q1',
    question: QUESTION.question,
    options: QUESTION.options,
  });
  vi.mocked(agentiveApi.answerUserQuestion).mockResolvedValue({
    ok: true,
    cleared: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserQuestionCard', () => {
  it('renders the question, header and every option', async () => {
    render(<UserQuestionCard question={QUESTION} />);
    expect(screen.getByText('Rebuild the track or extend it?')).toBeInTheDocument();
    expect(screen.getByText('Approach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rebuild/ })).toBeInTheDocument();
    expect(screen.getByText('Keep existing entries')).toBeInTheDocument();
  });

  it('records the pick AND delivers it as a user turn', async () => {
    render(<UserQuestionCard question={QUESTION} />);
    fireEvent.click(screen.getByRole('button', { name: /Extend/ }));

    await waitFor(() =>
      expect(agentiveApi.answerUserQuestion).toHaveBeenCalledWith({
        threadId: 'n.ChatThread.1',
        questionId: 'q1',
        choices: ['Extend'],
      }),
    );
    // Without this the model never learns the answer and the turn stalls.
    await waitFor(() =>
      expect(append).toHaveBeenCalledWith({
        role: 'user',
        content: [{ type: 'text', text: 'Extend' }],
      }),
    );
    expect(await screen.findByText('Answered')).toBeInTheDocument();
  });

  it('reconciles to answered when the server holds no pending question', async () => {
    // Answered in another tab, or the user typed a reply instead of clicking.
    vi.mocked(agentiveApi.getPendingUserQuestion).mockResolvedValue(null);
    render(<UserQuestionCard question={QUESTION} />);
    expect(await screen.findByText('Answered')).toBeInTheDocument();
  });

  it('reconciles to answered when a different question is now pending', async () => {
    vi.mocked(agentiveApi.getPendingUserQuestion).mockResolvedValue({
      question_id: 'q2',
      question: 'Something else',
      options: [{ label: 'A' }, { label: 'B' }],
    });
    render(<UserQuestionCard question={QUESTION} />);
    expect(await screen.findByText('Answered')).toBeInTheDocument();
  });

  it('stays answerable when recording the pick fails', async () => {
    vi.mocked(agentiveApi.answerUserQuestion).mockRejectedValue(new Error('boom'));
    render(<UserQuestionCard question={QUESTION} />);
    fireEvent.click(screen.getByRole('button', { name: /Rebuild/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not record/);
    // Not appended: claiming an answer the server rejected would desync the
    // conversation from the thread marker.
    expect(append).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Rebuild/ })).toBeInTheDocument();
  });

  it('collects several picks before sending when multi_select is set', async () => {
    render(<UserQuestionCard question={{ ...QUESTION, multi_select: true }} />);

    // Single click must NOT submit in multi mode.
    fireEvent.click(screen.getByRole('button', { name: /Rebuild/ }));
    expect(agentiveApi.answerUserQuestion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Extend/ }));
    fireEvent.click(screen.getByRole('button', { name: /Send 2/ }));

    await waitFor(() =>
      expect(agentiveApi.answerUserQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ choices: ['Rebuild', 'Extend'] }),
      ),
    );
  });
});
