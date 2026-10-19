import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HomeChatComposer, HomeComposerBody } from '../HomeChatComposer';

const state = vi.hoisted(() => ({ thread: null as string | null, count: 0, ready: true, running: false, open: vi.fn(), setText: vi.fn() }));
vi.mock('@assistant-ui/react', () => ({ useAui: () => ({ composer: () => ({ setText: state.setText }) }), useAuiState: () => state.count }));
vi.mock('../../AIChatSurface', () => ({
  useChatActivity: () => ({ activeThreadId: state.thread, composerReady: state.ready, isRunning: state.running }),
  AIChatRuntimeBoundary: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));
vi.mock('../../useActiveChatProvider', () => ({ useActiveChatProvider: () => ({id: 'integral_native'}) }));
vi.mock('../../chatHandoff', () => ({ requestOpenCompanionChat: state.open }));
vi.mock('../Thread', () => ({ Composer: ({home, onSendAttempt}: {home: boolean; onSendAttempt: () => void}) => <button onClick={onSendAttempt}>{home ? 'Ask Integral' : 'Send'}</button> }));
beforeEach(() => { state.thread = null; state.count = 0; state.ready = true; state.running = false; vi.clearAllMocks(); });
afterEach(cleanup);

it('does not open chat merely because attaching creates a thread', () => {
  const view = render(<HomeComposerBody />);
  state.thread = 'uploaded-file-thread';
  view.rerender(<HomeComposerBody />);
  expect(state.open).not.toHaveBeenCalled();
});

it('opens the exact conversation once after an outgoing user message exists, without another submission', () => {
  const view = render(<HomeComposerBody />);
  fireEvent.click(screen.getByRole('button', {name: 'Ask Integral'}));
  state.thread = 'attachment-thread';
  view.rerender(<HomeComposerBody />);
  expect(state.open).not.toHaveBeenCalled();
  state.count = 1;
  view.rerender(<HomeComposerBody />);
  expect(state.open).toHaveBeenCalledExactlyOnceWith({threadId: 'attachment-thread'});
  state.count = 2;
  view.rerender(<HomeComposerBody />);
  expect(state.open).toHaveBeenCalledTimes(1);
});

it('withholds the composer without workspace authority', () => {
  render(<HomeChatComposer workspaceId={null} principalId="u1" />);
  expect(screen.getByText('Choose a workspace to ask Integral.')).toBeVisible();
  expect(screen.queryByRole('button', {name: 'Ask Integral'})).not.toBeInTheDocument();
});
