/**
 * Mic button for the chat composer (next to the paperclip).
 *
 * Hidden when no recognizer is usable here — dictation turned off, or the
 * browser supports none of the engines on offer. Click toggles; the hotkey
 * (default ⇧⌘Space / Ctrl+Shift+Space) also holds-to-talk. Status is
 * announced through a polite live region; errors surface as toasts from the
 * dictation provider.
 */
import { Loader2, Mic, MicOff } from 'lucide-react';

import { IconButton, LevelMeter } from '../../../ui';
import type { DictationStatus } from '../../speech/dictationMachine';
import { useComposerDictation } from '../../speech/ComposerDictationContext';

const STATUS_ANNOUNCEMENT: Record<DictationStatus, string> = {
  idle: '',
  'requesting-permission': 'Waiting for microphone permission',
  connecting: 'Starting voice input',
  listening: 'Listening',
  finalizing: 'Finishing dictation',
  error: '',
};

export function ComposerMicButton() {
  const dictation = useComposerDictation();
  if (!dictation || !dictation.available) return null;

  const { status, level, error, hotkeyLabel, toggle } = dictation;
  const listening = status === 'listening';
  const busy =
    status === 'requesting-permission' || status === 'connecting' || status === 'finalizing';
  const active = listening || busy;
  const label = active ? `Stop dictation (${hotkeyLabel})` : `Dictate (${hotkeyLabel})`;

  return (
    <span className="inline-flex items-center gap-1">
      <IconButton
        label={label}
        title={label}
        size="md"
        shape="circle"
        tone="subtle"
        pressed={active}
        onClick={toggle}
        data-dictation-status={status}
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" aria-hidden />
        ) : status === 'error' ? (
          <MicOff size={15} aria-hidden />
        ) : (
          <Mic size={15} aria-hidden />
        )}
      </IconButton>
      {listening ? <LevelMeter level={level} /> : null}
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'error' ? (error?.message ?? '') : STATUS_ANNOUNCEMENT[status]}
      </span>
    </span>
  );
}

/** ` · ⇧⌘Space dictate` for the composer's shortcut hint, when available. */
export function ComposerDictationHint() {
  const dictation = useComposerDictation();
  if (!dictation?.available) return null;
  return (
    <>
      {' · '}
      <kbd className="font-sans">{dictation.hotkeyLabel}</kbd> dictate
    </>
  );
}
