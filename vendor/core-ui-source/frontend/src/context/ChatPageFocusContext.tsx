import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  ChatPagePublishedContext,
  ChatPageVisibleData,
} from '../types/chatPageContext';

export interface ChatPageFocus {
  focusedTrackId: string | null;
  focusedViewId: string | null;
}

export type ChatPageContextPartial = Partial<{
  pageKind: string | null;
  focusedTrackId: string | null;
  focusedViewId: string | null;
  focusedAppId: string | null;
  focusedEntryId: string | null;
  visibleData: ChatPageVisibleData | null;
  metadata: Record<string, unknown> | null;
}>;

const EMPTY_PUBLISHED: ChatPagePublishedContext = {
  pageKind: null,
  focusedTrackId: null,
  focusedViewId: null,
  focusedAppId: null,
  focusedEntryId: null,
  visibleData: null,
  metadata: null,
};

interface ChatPageFocusContextValue extends ChatPagePublishedContext {
  setPageFocus: (focus: Partial<ChatPageFocus>) => void;
  clearPageFocus: () => void;
  setPageContext: (next: ChatPageContextPartial) => void;
  clearPageContext: () => void;
  setDialogContext: (next: ChatPageContextPartial) => void;
  clearDialogContext: () => void;
}

interface ChatPageDialogContextValue {
  dialog: ChatPagePublishedContext | null;
}

const ChatPageFocusContext = createContext<ChatPageFocusContextValue | null>(
  null,
);

const ChatPageDialogContext = createContext<ChatPageDialogContextValue>({
  dialog: null,
});

export function ChatPageFocusProvider({ children }: { children: ReactNode }) {
  const [published, setPublished] =
    useState<ChatPagePublishedContext>(EMPTY_PUBLISHED);
  const [dialog, setDialog] = useState<ChatPagePublishedContext | null>(null);

  const setPageFocus = useCallback((next: Partial<ChatPageFocus>) => {
    setPublished(prev => ({
      ...prev,
      focusedTrackId:
        next.focusedTrackId !== undefined
          ? next.focusedTrackId
          : prev.focusedTrackId,
      focusedViewId:
        next.focusedViewId !== undefined ? next.focusedViewId : prev.focusedViewId,
    }));
  }, []);

  const clearPageFocus = useCallback(() => {
    setPublished(prev => ({
      ...prev,
      focusedTrackId: null,
      focusedViewId: null,
    }));
  }, []);

  const setPageContext = useCallback((next: ChatPageContextPartial) => {
    setPublished(prev => {
      const pageKind =
        next.pageKind !== undefined ? next.pageKind : prev.pageKind;
      const focusedTrackId =
        next.focusedTrackId !== undefined
          ? next.focusedTrackId
          : prev.focusedTrackId;
      const focusedViewId =
        next.focusedViewId !== undefined ? next.focusedViewId : prev.focusedViewId;
      const focusedAppId =
        next.focusedAppId !== undefined ? next.focusedAppId : prev.focusedAppId;
      const focusedEntryId =
        next.focusedEntryId !== undefined
          ? next.focusedEntryId
          : prev.focusedEntryId;
      const visibleData =
        next.visibleData !== undefined ? next.visibleData : prev.visibleData;
      const metadata =
        next.metadata !== undefined ? next.metadata : prev.metadata;

      const metadataUnchanged =
        metadata === prev.metadata ||
        (metadata != null &&
          prev.metadata != null &&
          Object.keys(metadata).length === Object.keys(prev.metadata).length &&
          Object.keys(metadata).every(
            key => metadata[key] === prev.metadata?.[key],
          ));

      if (
        pageKind === prev.pageKind &&
        focusedTrackId === prev.focusedTrackId &&
        focusedViewId === prev.focusedViewId &&
        focusedAppId === prev.focusedAppId &&
        focusedEntryId === prev.focusedEntryId &&
        visibleData === prev.visibleData &&
        metadataUnchanged
      ) {
        return prev;
      }

      return {
        pageKind,
        focusedTrackId,
        focusedViewId,
        focusedAppId,
        focusedEntryId,
        visibleData,
        metadata,
      };
    });
  }, []);

  const clearPageContext = useCallback(() => {
    setPublished(EMPTY_PUBLISHED);
  }, []);

  const setDialogContext = useCallback((next: ChatPageContextPartial) => {
    setDialog(prev => ({
      pageKind: next.pageKind !== undefined ? next.pageKind : prev?.pageKind ?? null,
      focusedTrackId:
        next.focusedTrackId !== undefined
          ? next.focusedTrackId
          : prev?.focusedTrackId ?? null,
      focusedViewId:
        next.focusedViewId !== undefined
          ? next.focusedViewId
          : prev?.focusedViewId ?? null,
      focusedAppId:
        next.focusedAppId !== undefined ? next.focusedAppId : prev?.focusedAppId ?? null,
      focusedEntryId:
        next.focusedEntryId !== undefined
          ? next.focusedEntryId
          : prev?.focusedEntryId ?? null,
      visibleData:
        next.visibleData !== undefined ? next.visibleData : prev?.visibleData ?? null,
      metadata: next.metadata !== undefined ? next.metadata : prev?.metadata ?? null,
    }));
  }, []);

  const clearDialogContext = useCallback(() => {
    setDialog(null);
  }, []);

  const value = useMemo(
    () => ({
      ...published,
      setPageFocus,
      clearPageFocus,
      setPageContext,
      clearPageContext,
      setDialogContext,
      clearDialogContext,
    }),
    [
      published,
      setPageFocus,
      clearPageFocus,
      setPageContext,
      clearPageContext,
      setDialogContext,
      clearDialogContext,
    ],
  );

  const dialogValue = useMemo(() => ({ dialog }), [dialog]);

  return (
    <ChatPageFocusContext.Provider value={value}>
      <ChatPageDialogContext.Provider value={dialogValue}>
        {children}
      </ChatPageDialogContext.Provider>
    </ChatPageFocusContext.Provider>
  );
}

const NOOP_CONTEXT: ChatPageFocusContextValue = {
  ...EMPTY_PUBLISHED,
  setPageFocus: () => {},
  clearPageFocus: () => {},
  setPageContext: () => {},
  clearPageContext: () => {},
  setDialogContext: () => {},
  clearDialogContext: () => {},
};

export function useChatPageContext(): ChatPageFocusContextValue {
  const ctx = useContext(ChatPageFocusContext);
  return ctx ?? NOOP_CONTEXT;
}

/** Dialog layer published by open overlays (e.g. EntryDetail). */
export function useChatPageDialogContext(): ChatPagePublishedContext | null {
  return useContext(ChatPageDialogContext).dialog;
}

/** Backward-compatible alias — track/view focus only. */
export function useChatPageFocus(): ChatPageFocusContextValue {
  return useChatPageContext();
}
