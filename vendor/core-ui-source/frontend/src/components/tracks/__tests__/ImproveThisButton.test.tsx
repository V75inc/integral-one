import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ImproveThisButton, type ImprovementTarget } from '../ImproveThisButton';
import {
  consumePendingChatInput,
  OPEN_AI_CHAT_EVENT,
} from '../../../features/ai-chat/chatHandoff';

vi.mock('../../../context/ScopeContext', () => ({ useScopeOptional: () => ({scope: {workspaceId: 'ws-test'}}) }));
vi.mock('../../../context/AuthContext', () => ({ useAuthOptional: () => ({user: {id: 'user-test'}}) }));

afterEach(() => {
  sessionStorage.clear();
});

describe('ImproveThisButton', () => {
  it.each<ImprovementTarget>(['entry', 'track', 'view'])(
    'opens chat with a immediate scoped review request for a focused %s',
    target => {
      const listener = vi.fn();
      window.addEventListener(OPEN_AI_CHAT_EVENT, listener);
      render(
        <ImproveThisButton
          target={target}
          subjectName="Customer Reviews"
          subjectId="n.Resource.focused"
          trackId="n.Track.customer-reviews"
        />,
      );

      const button = screen.getByRole('button', { name: `Enhance this ${target === 'entry' ? 'record' : target}` });
      expect(button).toHaveAttribute('title', `Enhance this ${target === 'entry' ? 'record' : target}`);
      expect(button).toHaveTextContent('Enhance');
      fireEvent.click(button);

      expect(listener).toHaveBeenCalledOnce();
      const input = consumePendingChatInput();
      expect(input).toMatchObject({submit: true, workspaceId: 'ws-test', principalId: 'user-test'});
      const draft = input?.text ?? '';
      expect(draft).toMatch(
        /currently open .*“Customer Reviews” .*existing schema.*integral-model skill.*Do not publish.*I approve/i,
      );
      expect(draft).not.toContain('n.Resource.focused');
      if (target === 'track') {
        expect(draft).toContain(
          'integral_describe_model for the focused track',
        );
        expect(draft).toContain('integral_recommend_customizations');
        expect(draft).toContain('Do not call integral_draft_new_model');
      } else {
        expect(draft).not.toContain('n.Track.customer-reviews');
      }
      window.removeEventListener(OPEN_AI_CHAT_EVENT, listener);
    },
  );

  it('keeps an untitled target usable without inserting an empty label', () => {
    render(
      <ImproveThisButton
        target="track"
        subjectName="  "
        subjectId="n.Track.untitled"
        trackId="n.Track.untitled"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enhance this track' }));

    expect(consumePendingChatInput()?.text).toMatch(
      /currently open track .*existing schema.*integral_recommend_customizations/i,
    );
  });
});
