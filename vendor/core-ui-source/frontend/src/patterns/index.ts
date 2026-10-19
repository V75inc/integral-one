/**
 * Barrel export for the UI pattern layer (Layer 2 in the FE Layering ADR).
 *
 * Templates / pages import patterns from here:
 *
 *   import { AsyncBoundary, RequireRole } from '@/patterns';
 *
 * Patterns compose Primitives (`@/ui`) — they MUST NOT reach into
 * features/, pages/, or components/.
 *
 * See `.planning/ui-templating/adr-frontend-layering.md` for layer rules.
 */

export { AsyncBoundary } from './AsyncBoundary';
export type { AsyncBoundaryProps, AsyncBoundarySkeleton } from './AsyncBoundary';

export { Field } from './Field';
export type { FieldProps } from './Field';

export { Section } from './Section';
export type { SectionProps } from './Section';
