/**
 * Capture a keyboard shortcut. Click, press the chord, done; Escape cancels.
 *
 * Emits the portable spec (`Mod+Shift+Space`) the backend validates, so a
 * shortcut recorded on a Mac also works — as Ctrl — on Windows.
 */
import { useState, type KeyboardEvent } from 'react';

import { Button } from '../../../components/ui/Button';
import { Text } from '../../../ui';
import { formatHotkey, hotkeySpecFromEvent } from '../../speech/hotkey';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'OS']);

export function HotkeyInput({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (spec: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      setHint(null);
      return;
    }
    if (MODIFIER_KEYS.has(event.key)) return;
    const spec = hotkeySpecFromEvent(event.nativeEvent);
    if (!spec) {
      setHint(
        'Use at least one modifier (⌘/Ctrl, Alt or Shift) with a letter, number, Space or F-key.',
      );
      return;
    }
    onChange(spec);
    setRecording(false);
    setHint(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        id={id}
        variant="secondary"
        size="sm"
        onClick={() => {
          setRecording(r => !r);
          setHint(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setRecording(false)}
        aria-label={recording ? 'Press the new shortcut' : `Shortcut: ${formatHotkey(value)}. Change`}
      >
        {recording ? 'Press the new shortcut…' : formatHotkey(value)}
      </Button>
      {hint ? (
        <div role="status">
          <Text variant="body-sm" tone="muted" as="p">
            {hint}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
