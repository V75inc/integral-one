import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import type { ChatEntityRef } from '../types/chatEntityRefs';

type ChatEntityRefsContextValue = {
  setPendingEntityRefs: (refs: ChatEntityRef[]) => void;
  /** Re-apply the last snapshot to pending (call immediately before send). */
  flushPendingEntityRefs: () => void;
  consumePendingEntityRefs: () => ChatEntityRef[];
  registerComposerEntityRefsReset: (fn: (() => void) | null) => void;
  resetComposerEntityRefs: () => void;
};

const ChatEntityRefsContext = createContext<ChatEntityRefsContextValue | null>(
  null,
);

export function ChatEntityRefsProvider({ children }: { children: ReactNode }) {
  const pendingRef = useRef<ChatEntityRef[]>([]);
  const snapshotRef = useRef<ChatEntityRef[]>([]);
  const composerResetRef = useRef<(() => void) | null>(null);

  const setPendingEntityRefs = useCallback((refs: ChatEntityRef[]) => {
    pendingRef.current = refs;
    snapshotRef.current = refs;
  }, []);

  const flushPendingEntityRefs = useCallback(() => {
    pendingRef.current = snapshotRef.current;
  }, []);

  const consumePendingEntityRefs = useCallback(() => {
    const refs =
      pendingRef.current.length > 0
        ? pendingRef.current
        : snapshotRef.current;
    pendingRef.current = [];
    return refs;
  }, []);

  const registerComposerEntityRefsReset = useCallback((fn: (() => void) | null) => {
    composerResetRef.current = fn;
  }, []);

  const resetComposerEntityRefs = useCallback(() => {
    snapshotRef.current = [];
    pendingRef.current = [];
    composerResetRef.current?.();
  }, []);

  const value = useMemo(
    () => ({
      setPendingEntityRefs,
      flushPendingEntityRefs,
      consumePendingEntityRefs,
      registerComposerEntityRefsReset,
      resetComposerEntityRefs,
    }),
    [
      consumePendingEntityRefs,
      flushPendingEntityRefs,
      registerComposerEntityRefsReset,
      resetComposerEntityRefs,
      setPendingEntityRefs,
    ],
  );

  return (
    <ChatEntityRefsContext.Provider value={value}>
      {children}
    </ChatEntityRefsContext.Provider>
  );
}

export function useChatEntityRefs(): ChatEntityRefsContextValue {
  const ctx = useContext(ChatEntityRefsContext);
  if (!ctx) {
    throw new Error('useChatEntityRefs must be used within ChatEntityRefsProvider');
  }
  return ctx;
}

export function useChatEntityRefsOptional(): ChatEntityRefsContextValue | null {
  return useContext(ChatEntityRefsContext);
}
