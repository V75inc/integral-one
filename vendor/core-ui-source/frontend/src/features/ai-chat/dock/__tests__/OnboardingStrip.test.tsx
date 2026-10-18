import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OnboardingStrip } from '../OnboardingStrip';

const state = vi.hoisted(() => ({ messages: [] as {role: string}[], dismiss: vi.fn(), setOnboarding: vi.fn(), refreshUser: vi.fn(), invalidate: vi.fn() }));
vi.mock('@assistant-ui/react', () => ({ useAuiState: (selector: (s: unknown) => unknown) => selector({thread: {messages: state.messages}}) }));
vi.mock('../../../../hooks/useFirstLoginOnboarding', () => ({ useFirstLoginOnboarding: () => ({dismiss: state.dismiss}) }));
vi.mock('../../../../context/AssistantDockContext', () => ({ useAssistantDock: () => ({setOnboarding: state.setOnboarding}) }));
vi.mock('../../../../context/AuthContext', () => ({ useAuthOptional: () => ({refreshUser: state.refreshUser}) }));
vi.mock('@tanstack/react-query', () => ({useQueryClient: () => ({invalidateQueries: state.invalidate})}));
beforeEach(() => { vi.clearAllMocks(); state.messages = []; state.refreshUser.mockResolvedValue(undefined); });
afterEach(cleanup);

it('acknowledges the overlay with Ok', () => {
  render(<OnboardingStrip />);
  expect(screen.getByTestId('onboarding-seed-hint')).toHaveClass('absolute');
  fireEvent.click(screen.getByRole('button', {name: 'Ok'}));
  expect(state.dismiss).toHaveBeenCalledOnce();
  expect(state.setOnboarding).toHaveBeenCalledWith(false);
});
it('dismisses when the first user message arrives, but not for assistant messages', () => {
  state.messages = [{role: 'assistant'}];
  const view = render(<OnboardingStrip />);
  expect(state.dismiss).not.toHaveBeenCalled();
  state.messages.push({role: 'user'});
  view.rerender(<OnboardingStrip />);
  expect(screen.queryByTestId('onboarding-seed-hint')).not.toBeInTheDocument();
  expect(state.dismiss).toHaveBeenCalledOnce();
});
it('hides the hint for an existing conversation with a user message', () => {
  state.messages = [{role: 'user'}];
  render(<OnboardingStrip />);
  expect(screen.queryByRole('button', {name:'Ok'})).not.toBeInTheDocument();
  expect(state.dismiss).toHaveBeenCalledOnce();
});
