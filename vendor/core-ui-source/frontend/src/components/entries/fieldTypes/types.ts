/**
 * Frontend field-type registry contract (Pillar 1 + 4 of the
 * agent-authorable substrate). Mirrors the backend
 * ``operational_model_field_types`` registry: built-in primitives register at
 * module load, plugins register at boot via the plugin auto-loader, and
 * composite types declared in a manifest resolve via ``resolveComposite``.
 *
 * Built-in primitive editors stay inside ``SeamlessField`` for now — the
 * registry is consulted FIRST so plugins or composite-with-custom-renderer
 * can override; if no entry matches, ``SeamlessField`` falls through to
 * its existing dispatch. This minimises regression risk while opening the
 * extension point.
 */

import type { ReactNode } from 'react';
import type { OperationalModelFieldSpec } from '../../../types';

export interface FieldTypeRendererProps {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (next: unknown) => void;
  /** Optional: relation-resolved choices, supplied by the composer. */
  relationChoices?: Array<{ value: string; label: string }>;
  relationLoading?: boolean;
  /** Required for ``file`` / ``files``: parent entry id for the upload bind. */
  entryId?: string;
}

export interface FieldTypeMeta {
  label: string;
  description: string;
  /** Optional Lucide icon component (kept loose to avoid lucide dep here). */
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

export interface FieldTypeRegistration {
  /** Canonical type key — matches ``OperationalModelFieldSpec.type``. */
  type: string;
  /** Editor renderer used inside the entry composer. */
  editor: React.ComponentType<FieldTypeRendererProps>;
  /** Optional read-only renderer (defaults to editor with ``readonly: true``). */
  renderer?: React.ComponentType<FieldTypeRendererProps>;
  /** Display metadata for selectors / introspection UIs. */
  meta: FieldTypeMeta;
  /**
   * When set, declares this entry as a composite over another registered
   * type. The dispatcher resolves the base renderer and merges the composite
   * config into ``field.composite``. Composites that don't ship a custom
   * editor MUST point at a base whose editor handles their underlying
   * primitive.
   */
  composite?: { base: string; config?: Record<string, unknown> };
  /** "builtin" | "composite" | "plugin" — for telemetry + introspection. */
  source?: 'builtin' | 'composite' | 'plugin';
  /** True when the registration came from a signed plugin bundle. */
  signed?: boolean;
}

/** Used by the registry to surface "type not installed" affordances. */
export interface MissingFieldTypeInfo {
  type: string;
  message: ReactNode;
}
