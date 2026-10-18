/**
 * Barrel export for the UI template layer (Layer 3 in the FE Layering ADR).
 *
 * Pages import templates from here:
 *
 *   import { FormDialog } from '@/templates';
 *
 * Templates compose Patterns + Primitives — they MUST NOT reach into
 * features/, pages/, or components/ for anything other than legacy
 * primitives still living in `components/ui/`.
 *
 * See `.planning/ui-templating/adr-frontend-layering.md` for layer rules.
 */

export { FormDialog } from './FormDialog';
export type { FormDialogProps, FormDialogSize } from './FormDialog';

export { StepDialog } from './StepDialog';
export type { StepDialogProps, StepDialogSize } from './StepDialog';
