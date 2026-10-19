import { createContext } from 'react';

/**
 * True when the *caller* renders the field label (the entry detail grid / card),
 * so an inner field control must **not** draw its own label. Published by
 * ``SeamlessField`` from its ``externalLabel`` prop and consumed by controls that
 * render a label outside ``SeamlessShell`` (e.g. ``SeamlessFileFieldInner``).
 *
 * Lives in its own module so ``SeamlessFileFieldInner`` can import it without a
 * circular import back into ``SeamlessField``.
 */
export const ExternalLabelContext = createContext(false);
