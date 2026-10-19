import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

import {
  ComposerDictationContext,
  type ComposerDictation,
} from '../../../speech/ComposerDictationContext';
import { ComposerDictationHint, ComposerMicButton } from '../ComposerMicButton';

function dictation(overrides: Partial<ComposerDictation> = {}): ComposerDictation {
  return {
    status: 'idle',
    error: null,
    level: 0,
    engine: null,
    engineSource: 'browser',
    available: true,
    isListening: () => false,
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    cancel: vi.fn(),
    toggle: vi.fn(),
    hotkeyLabel: '⇧⌘Space',
    ...overrides,
  };
}

function renderWith(value: ComposerDictation | null) {
  return render(
    <ComposerDictationContext.Provider value={value}>
      <ComposerMicButton />
      <span data-testid="hint">
        <ComposerDictationHint />
      </span>
    </ComposerDictationContext.Provider>,
  );
}

describe('ComposerMicButton', () => {
  it('renders nothing when no recognizer is usable', () => {
    renderWith(dictation({ available: false }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('hint')).toBeEmptyDOMElement();
  });

  it('offers dictation with the hotkey in its name', () => {
    const value = dictation();
    renderWith(value);
    const button = screen.getByRole('button', { name: 'Dictate (⇧⌘Space)' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(value.toggle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('hint')).toHaveTextContent('⇧⌘Space dictate');
  });

  it('shows the listening state and announces it', () => {
    renderWith(dictation({ status: 'listening', level: 0.5 }));
    const button = screen.getByRole('button', { name: 'Stop dictation (⇧⌘Space)' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Listening');
  });

  it('announces errors', () => {
    renderWith(
      dictation({
        status: 'error',
        error: { code: 'permission-denied', message: 'Microphone access is blocked.', retryable: false },
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Microphone access is blocked.');
  });
});
