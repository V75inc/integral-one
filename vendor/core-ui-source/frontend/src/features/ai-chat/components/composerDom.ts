/**
 * Write to the composer textarea so React sees a real edit.
 *
 * Assigning `.value` alone bypasses React's change tracking; setting it
 * through the native prototype setter and dispatching `input` makes the
 * controlled `onChange` fire, so composer state, tag autocomplete, entity-ref
 * sync and the send button all see the text. Shared by type-anywhere and
 * dictation.
 */
export function setComposerValue(
  composer: HTMLTextAreaElement,
  value: string,
  caret?: number,
): void {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  if (setValue) {
    setValue.call(composer, value);
  } else {
    composer.value = value;
  }
  composer.dispatchEvent(new Event('input', { bubbles: true }));
  if (caret !== undefined) composer.setSelectionRange(caret, caret);
}
