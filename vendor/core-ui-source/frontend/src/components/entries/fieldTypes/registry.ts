/**
 * Frontend field-type registry.
 *
 * Replaces the implicit "if/else cascade" behaviour of the previous
 * ``SeamlessField`` with an explicit registration surface so plugins and
 * declarative composite types can extend the editor catalogue at runtime
 * without modifying core code.
 *
 * Lookup order during dispatch (see ``resolveFieldType``):
 *   1. Exact registration for ``field.type`` (plugin or built-in override).
 *   2. Composite resolution via ``field.composite.base`` (manifest-declared
 *      composites; renderer is the base type's renderer with composite
 *      config available on ``field.composite.config``).
 *   3. ``null`` — caller falls through to ``SeamlessField``'s built-in
 *      dispatch (which still handles every primitive type natively).
 *
 * This means: registering a renderer is OPT-IN. Built-in primitives keep
 * working without any registration.
 */

import type { OperationalModelFieldSpec } from '../../../types';
import type { FieldTypeRegistration } from './types';

const REGISTRY = new Map<string, FieldTypeRegistration>();
let REGISTRY_VERSION = 0;

export function registerFieldType(reg: FieldTypeRegistration): void {
  if (!reg.type) throw new Error('FieldTypeRegistration.type required');
  REGISTRY.set(reg.type, reg);
  REGISTRY_VERSION += 1;
}

export function getFieldType(type: string): FieldTypeRegistration | undefined {
  return REGISTRY.get(type);
}

export function listFieldTypes(): FieldTypeRegistration[] {
  return Array.from(REGISTRY.values());
}

export function fieldTypeRegistryVersion(): number {
  return REGISTRY_VERSION;
}

/**
 * Resolve a field spec to a registered renderer (or null).
 *
 * - Direct hit on ``field.type`` wins.
 * - Otherwise, if ``field.composite.base`` resolves to a registered type,
 *   the base's renderer is returned.
 * - Returns null when neither applies; the caller falls back to the
 *   built-in ``SeamlessField`` dispatch which still handles all primitives.
 */
export function resolveFieldType(
  field: OperationalModelFieldSpec
): FieldTypeRegistration | null {
  const direct = REGISTRY.get(field.type);
  if (direct) return direct;
  const compositeBase = field.composite?.base;
  if (compositeBase && REGISTRY.has(compositeBase)) {
    return REGISTRY.get(compositeBase) ?? null;
  }
  return null;
}

/**
 * Test hook — clears the registry. Production code should never call this.
 */
export function _resetFieldTypeRegistryForTests(): void {
  REGISTRY.clear();
  REGISTRY_VERSION = 0;
}
