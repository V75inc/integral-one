import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { requestOpenCompanionChat } from '../../chatHandoff';
import { AuiTaggableComposer } from '../AuiTaggableComposer';

const state = vi.hoisted(() => ({
  thread: null as string | null,
  ready: false,
  running: false,
  workspaceId: 'ws-1',
  principalId: 'u-1',
  text: '',
  setText: vi.fn(),
  send: vi.fn(),
}));
const composer = { setText: state.setText, send: state.send };
const aui = { composer: () => composer };
vi.mock('@assistant-ui/react', () => ({
  useAui: () => aui,
  useAuiState: () => state.text,
}));
vi.mock('../../AIChatSurface', () => ({
  useChatActivity: () => ({ activeThreadId: state.thread, composerReady: state.ready, isRunning: state.running }),
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuthOptional: () => ({ user: { id: state.principalId } }) }));
vi.mock('../../../../context/ScopeContext', () => ({ useScope: () => ({ scope: { workspaceId: state.workspaceId } }) }));
vi.mock('../../../../context/ChatEntityRefsContext', () => ({
  useChatEntityRefsOptional: () => null,
}));
vi.mock('../../../speech/ComposerDictationContext', () => ({
  useComposerDictationActions: () => null,
}));
vi.mock('../../../../components/chat/TaggableComposer', () => ({
  TaggableComposer: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    <textarea aria-label="Message input" value={value} onChange={event => onChange(event.target.value)} />,
}));

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  state.thread = null;
  state.ready = false;
  state.running = false;
  state.workspaceId = 'ws-1';
  state.principalId = 'u-1';
  state.text = '';
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('contextual composer draft handoff', () => {
  it('preserves a model-review draft through reload and inserts it without sending', () => {
    const draft = 'Review the open Bug Board view and its existing model. Show the diff. Do not publish until I approve.';
    requestOpenCompanionChat({ draftText: draft });
    const firstMount = render(<AuiTaggableComposer />);
    act(() => vi.advanceTimersByTime(5000));
    expect(state.setText).not.toHaveBeenCalled();
    firstMount.unmount();

    state.thread = 'restored-thread';
    state.ready = true;
    render(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByLabelText('Message input')).toHaveValue(draft);
    expect(state.send).not.toHaveBeenCalled();
  });

  it('retains the draft while selection takes longer than one second, then applies after reset', () => {
    requestOpenCompanionChat({ draftText: 'Help me explore my idea.' });
    const view = render(<AuiTaggableComposer />);
    act(() => vi.advanceTimersByTime(5000));
    expect(state.setText).not.toHaveBeenCalled();
    state.thread = 'restored-thread';
    state.ready = true;
    view.rerender(<AuiTaggableComposer />);
    expect(state.setText).toHaveBeenLastCalledWith('');
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByLabelText('Message input')).toHaveValue('Help me explore my idea.');
    expect(state.setText).toHaveBeenLastCalledWith('Help me explore my idea.');
    expect(state.send).not.toHaveBeenCalled();
  });

  it('reschedules an open-event draft across a thread change and consumes it only once', () => {
    state.ready = true;
    const view = render(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    act(() => requestOpenCompanionChat({ draftText: 'Find an idea with me.' }));
    state.thread = 'selected-thread';
    view.rerender(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByLabelText('Message input')).toHaveValue('Find an idea with me.');
    fireEvent.change(screen.getByLabelText('Message input'), { target: { value: 'My revised idea' } });
    act(() => requestOpenCompanionChat());
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByLabelText('Message input')).toHaveValue('My revised idea');
    state.thread = 'another-thread';
    view.rerender(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByLabelText('Message input')).toHaveValue('');
    expect(state.send).not.toHaveBeenCalled();
  });
  it('sends a Home submission once after thread selection is ready', () => {
    requestOpenCompanionChat({ draftText: 'Find my recent records.', submit: true, workspaceId: 'ws-1', principalId: 'u-1' });
    const view = render(<AuiTaggableComposer />);
    act(() => vi.advanceTimersByTime(5000));
    expect(state.send).not.toHaveBeenCalled();
    state.thread = 'restored-thread';
    state.ready = true;
    view.rerender(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(state.setText).toHaveBeenLastCalledWith('Find my recent records.');
    expect(screen.getByLabelText('Message input')).toHaveValue('');
    expect(state.send).toHaveBeenCalledTimes(1);
    act(() => requestOpenCompanionChat());
    act(() => vi.runOnlyPendingTimers());
    state.thread = 'another-thread';
    view.rerender(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(state.send).toHaveBeenCalledTimes(1);
  });
  it('waits for a running turn to finish before sending the Home submission', () => {
    state.ready = true;
    state.running = true;
    requestOpenCompanionChat({ draftText: 'Follow up.', submit: true, workspaceId: 'ws-1', principalId: 'u-1' });
    const view = render(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(state.send).not.toHaveBeenCalled();
    state.running = false;
    view.rerender(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(state.send).toHaveBeenCalledTimes(1);
  });
  it('does not send a deferred Home submission in another workspace', () => {
    requestOpenCompanionChat({ draftText: 'Private request.', submit: true, workspaceId: 'ws-1', principalId: 'u-1' });
    const view = render(<AuiTaggableComposer />);
    state.workspaceId = 'ws-2';
    state.ready = true;
    view.rerender(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(state.send).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Message input')).toHaveValue('');
  });

  it('does not submit another user’s saved Home request after an account switch', () => {
    requestOpenCompanionChat({ draftText: 'Private request.', submit: true, workspaceId: 'ws-1', principalId: 'u-1' });
    state.principalId = 'u-2';
    state.ready = true;
    render(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(state.send).not.toHaveBeenCalled();
  });

  it('lets Home keep its composer independent while the dock consumes a contextual draft', () => {
    state.ready = true;
    requestOpenCompanionChat({draftText: 'Review this record.'});
    const home = render(<AuiTaggableComposer acceptHandoff={false} />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByLabelText('Message input')).toHaveValue('');
    home.unmount();
    render(<AuiTaggableComposer />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByLabelText('Message input')).toHaveValue('Review this record.');
    expect(state.send).not.toHaveBeenCalled();
  });

});
