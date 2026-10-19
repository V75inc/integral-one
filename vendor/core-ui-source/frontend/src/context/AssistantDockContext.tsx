import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

import { useIsMdUp } from '../hooks/useMediaQuery';
import {
  DOCK_DEFAULT_WIDTH,
  clampDockWidth,
  readDockOpen,
  readDockWidth,
  writeDockOpen,
  writeDockWidth,
} from '../features/ai-chat/dock/assistantDockPrefs';
import {
  OPEN_AI_CHAT_EVENT,
  consumeChatHandoff,
  peekChatHandoff,
  rememberActiveChatThreadId,
  type ChatHandoff,
} from '../features/ai-chat/chatHandoff';

export type AssistantDockView = 'chat' | 'inbox';

type AssistantDockContextValue = {
  open: boolean;
  /** Desktop width in px. Meaningless on mobile, where the dock is a sheet. */
  width: number;
  view: AssistantDockView;
  /** First-login framing: the body shows a welcome hint and a Skip. */
  onboarding: boolean;
  setOnboarding: (onboarding: boolean) => void;
  /** True while the user drags the resize handle — consumers suppress their
   *  width/margin transitions so the squeeze tracks the pointer 1:1. */
  resizing: boolean;
  openDock: (opts?: { view?: AssistantDockView }) => void;
  closeDock: () => void;
  toggleDock: () => void;
  setView: (view: AssistantDockView) => void;
  /** Accepts an updater so callers that nudge by a delta (key-repeat on the
   *  resize handle) don't coalesce against a stale closure value. */
  setWidth: (px: number | ((prev: number) => number)) => void;
  setResizing: (resizing: boolean) => void;
};

const AssistantDockContext = createContext<AssistantDockContextValue | null>(
  null,
);

/** The dock is suppressed on the dedicated chat route, which already owns a
 *  full-viewport surface. Shared by the dock and its toggle. */
/** The full-page assistant route. */
export function isAssistantFullPagePath(pathname: string): boolean {
  return pathname === '/agent' || pathname.startsWith('/agent/');
}

/** Where the dock is hidden — which is exactly where the assistant is already
 *  on screen at full size. Same predicate, named for the other reader. */
export function isDockSuppressedPath(pathname: string): boolean {
  return isAssistantFullPagePath(pathname);
}

export function AssistantDockProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isMdUp = useIsMdUp();
  const [open, setOpen] = useState(readDockOpen);
  const [width, setWidthState] = useState(readDockWidth);
  const [view, setView] = useState<AssistantDockView>('chat');
  const [onboarding, setOnboarding] = useState(false);
  const [resizing, setResizing] = useState(false);

  const openDock = useCallback((opts?: { view?: AssistantDockView }) => {
    if (opts?.view) setView(opts.view);
    setOpen(true);
  }, []);

  const closeDock = useCallback(() => setOpen(false), []);
  const toggleDock = useCallback(() => setOpen(v => !v), []);

  const setWidth = useCallback((px: number | ((prev: number) => number)) => {
    setWidthState(prev =>
      clampDockWidth(typeof px === 'function' ? px(prev) : px),
    );
  }, []);

  useEffect(() => {
    writeDockOpen(open);
  }, [open]);

  useEffect(() => {
    writeDockWidth(width);
  }, [width]);

  // Publish the squeeze to CSS rather than threading it through props, so
  // `<main>` (and anything else that needs to yield room) reads a var
  // instead of subscribing. Mirrors how `--system-bar-h` drives the
  // top-bar squeeze. Zero on mobile and on `/agent`: the dock is a sheet
  // in the first case and absent in the second, so nothing should shift.
  const squeezeWidth =
    open && isMdUp && !isDockSuppressedPath(pathname) ? width : 0;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--assistant-dock-w', `${squeezeWidth}px`);
    return () => {
      root.style.removeProperty('--assistant-dock-w');
    };
  }, [squeezeWidth]);

  // While dragging, the squeeze must track the pointer exactly — a 200ms
  // margin transition would make the page lag behind the handle.
  useEffect(() => {
    const root = document.documentElement;
    if (resizing) root.setAttribute('data-dock-resizing', '1');
    else root.removeAttribute('data-dock-resizing');
    return () => root.removeAttribute('data-dock-resizing');
  }, [resizing]);

  // Cross-surface open request (`requestOpenCompanionChat`), used when a
  // link inside chat navigates away and the conversation has to follow the
  // user so Undo stays reachable. Moved here from the old Launcher verbatim:
  // the dock is mounted for the whole authed session, so the listener no
  // longer dies when the surface unmounts.
  useEffect(() => {
    const openFromHandoff = (detail?: ChatHandoff | null) => {
      // Suppressed on /agent — only honour the request once we've left it.
      if (isDockSuppressedPath(pathname)) return;
      const threadId = detail?.threadId ?? peekChatHandoff()?.threadId;
      if (threadId) rememberActiveChatThreadId(threadId);
      setView('chat');
      setOpen(true);
      consumeChatHandoff();
    };

    const pending = peekChatHandoff();
    if (pending) openFromHandoff(pending);

    const onOpen = (e: Event) => {
      openFromHandoff((e as CustomEvent<ChatHandoff>).detail);
    };
    window.addEventListener(OPEN_AI_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, onOpen);
  }, [pathname]);

  const value = useMemo(
    () => ({
      open,
      width,
      view,
      onboarding,
      setOnboarding,
      resizing,
      openDock,
      closeDock,
      toggleDock,
      setView,
      setWidth,
      setResizing,
    }),
    [
      open,
      width,
      view,
      onboarding,
      resizing,
      openDock,
      closeDock,
      toggleDock,
      setWidth,
    ],
  );

  return (
    <AssistantDockContext.Provider value={value}>
      {children}
    </AssistantDockContext.Provider>
  );
}

export function useAssistantDock(): AssistantDockContextValue {
  const ctx = useContext(AssistantDockContext);
  if (!ctx) {
    throw new Error('useAssistantDock must be used within AssistantDockProvider');
  }
  return ctx;
}

/** Non-throwing read for surfaces that may render outside the authed shell. */
export function useAssistantDockOptional(): AssistantDockContextValue | null {
  return useContext(AssistantDockContext);
}

export { DOCK_DEFAULT_WIDTH };
