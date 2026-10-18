import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearEntryUndoToken,
  peekEntryUndoToken,
  stashEntryUndoToken,
  stashUndoTokensFromConsumedNav,
} from '../entryUndoStash';
import {
  consumePendingChatDraft,
  consumeChatHandoff,
  peekLastActiveChatThreadId,
  rememberActiveChatThreadId,
  requestOpenCompanionChat,
} from '../../chatHandoff';

beforeEach(() => {
  sessionStorage.clear();
});

describe('entryUndoStash', () => {
  it('round-trips a staging token for an entry', () => {
    stashEntryUndoToken('n.Entry.1', 'tok-abc');
    expect(peekEntryUndoToken('n.Entry.1')).toBe('tok-abc');
    clearEntryUndoToken('n.Entry.1');
    expect(peekEntryUndoToken('n.Entry.1')).toBeNull();
  });

  it('stashes from consumed nav entry + created refs', () => {
    stashUndoTokensFromConsumedNav('tok-1', {
      entryId: 'n.Entry.a',
      created: [
        { kind: 'entry', id: 'n.Entry.b' },
        { kind: 'track', id: 'n.Track.x' },
      ],
    });
    expect(peekEntryUndoToken('n.Entry.a')).toBe('tok-1');
    expect(peekEntryUndoToken('n.Entry.b')).toBe('tok-1');
    expect(peekEntryUndoToken('n.Track.x')).toBeNull();
  });
});

describe('chatHandoff', () => {
  it('remembers the last active thread id', () => {
    rememberActiveChatThreadId('n.ChatThread.1');
    expect(peekLastActiveChatThreadId()).toBe('n.ChatThread.1');
    rememberActiveChatThreadId('local-xyz');
    expect(peekLastActiveChatThreadId()).toBeNull();
  });

  it('stores a handoff that consumeChatHandoff clears', () => {
    requestOpenCompanionChat({ threadId: 'n.ChatThread.2' });
    const handoff = consumeChatHandoff();
    expect(handoff?.threadId).toBe('n.ChatThread.2');
    expect(consumeChatHandoff()).toBeNull();
  });

  it('keeps a contextual composer draft separate from thread restoration', () => {
    requestOpenCompanionChat({
      threadId: 'n.ChatThread.2',
      draftText: 'Review this Track and propose a draft revision.',
    });
    expect(consumeChatHandoff()?.threadId).toBe('n.ChatThread.2');
    expect(consumePendingChatDraft()).toBe(
      'Review this Track and propose a draft revision.',
    );
    expect(consumePendingChatDraft()).toBeNull();
  });
});
