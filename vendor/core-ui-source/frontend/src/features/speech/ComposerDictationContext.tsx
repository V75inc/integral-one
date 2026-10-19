/**
 * Dictation state for one chat composer.
 *
 * Two contexts on purpose: the full state (status, 20 Hz level) for the mic
 * button, and a stable actions object for the textarea wrapper — otherwise
 * every level tick would re-render the tag-highlighting composer.
 */
import { useAuiState } from '@assistant-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { SPEECH_CONFIG_QUERY_ROOT, useSpeechConfig } from '../../api/speech';
import { useToast } from '../../context/ToastContext';
import {
  CHAT_SURFACE_ATTR,
  isActiveSurface,
} from '../ai-chat/components/useTypeAnywhereComposer';
import { formatHotkey } from './hotkey';
import { useDictation, type DictationController, type StopCause } from './useDictation';
import { useDictationHotkey } from './useDictationHotkey';

const DEFAULT_HOTKEY = 'Mod+Shift+Space';

export interface ComposerDictation extends DictationController {
  /** Hotkey as shown to the user, e.g. `⇧⌘Space`. */
  hotkeyLabel: string;
}

export interface ComposerDictationActions {
  registerTextarea: (el: HTMLTextAreaElement | null) => void;
  /** The composer's real send (entity refs flushed); used for auto-send. */
  registerSubmit: (fn: (() => void) | null) => void;
  /** Submit through the chat composer so an active dictation run can finish first. */
  submit: () => void;
  isListening: () => boolean;
  stop: (cause?: StopCause) => Promise<void>;
}

export const ComposerDictationContext = createContext<ComposerDictation | null>(null);
export const ComposerDictationActionsContext =
  createContext<ComposerDictationActions | null>(null);

export function useComposerDictation(): ComposerDictation | null {
  return useContext(ComposerDictationContext);
}

export function useComposerDictationActions(): ComposerDictationActions | null {
  return useContext(ComposerDictationActionsContext);
}

export function ComposerDictationProvider({ children }: { children: ReactNode }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const submitRef = useRef<(() => void) | null>(null);
  const isRunning = useAuiState(s => s.thread.isRunning);
  const runningRef = useRef(isRunning);
  runningRef.current = isRunning;

  const { data: config } = useSpeechConfig();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const controller = useDictation({
    config,
    getTextarea: () => textareaRef.current,
    submit: () => submitRef.current?.(),
    isThreadRunning: () => runningRef.current,
  });

  const { error } = controller;
  useEffect(() => {
    if (!error) return;
    showToast(error.message, 'error');
    // A stale config offered a provider the server no longer has.
    if (error.code === 'not-configured') {
      void qc.invalidateQueries({ queryKey: SPEECH_CONFIG_QUERY_ROOT });
    }
  }, [error, qc, showToast]);

  const hotkey = config?.preferences.hotkey ?? DEFAULT_HOTKEY;
  const { start, stop, isListening, available } = controller;
  useDictationHotkey({
    hotkey,
    mode: config?.preferences.hotkey_mode ?? 'hold_or_toggle',
    enabled: available,
    isActive: () => {
      const el = textareaRef.current;
      return !!el && isActiveSurface(el.closest<HTMLElement>(`[${CHAT_SURFACE_ATTR}]`));
    },
    isListening,
    start: () => void start(),
    stop: () => void stop('user'),
  });

  const registerTextarea = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
  }, []);
  const registerSubmit = useCallback((fn: (() => void) | null) => {
    submitRef.current = fn;
  }, []);
  const submit = useCallback(() => submitRef.current?.(), []);

  const hotkeyLabel = useMemo(() => formatHotkey(hotkey), [hotkey]);
  const value = useMemo(() => ({ ...controller, hotkeyLabel }), [controller, hotkeyLabel]);
  const actions = useMemo(
    () => ({ registerTextarea, registerSubmit, submit, isListening, stop }),
    [registerTextarea, registerSubmit, submit, isListening, stop],
  );

  return (
    <ComposerDictationActionsContext.Provider value={actions}>
      <ComposerDictationContext.Provider value={value}>{children}</ComposerDictationContext.Provider>
    </ComposerDictationActionsContext.Provider>
  );
}
