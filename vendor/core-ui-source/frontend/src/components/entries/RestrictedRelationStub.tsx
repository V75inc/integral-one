/**
 * RestrictedRelationStub — renderer for restricted cross-App relations.
 *
 * Phase 10 Plan 10-06 (APP-CROSS-RELATIONS-01). Architectural Decision 8
 * Option A — strict shape. Backend returns:
 *
 *     { kind: 'restricted_relation',
 *       relation_field_key: '<field key from source manifest>',
 *       target_resource_kind: 'entry' }
 *
 * The UI MUST NOT display the relation_field_key or target_resource_kind in
 * the visible surface — those are accessibility/debug aids only. The visible
 * label is a generic "Restricted" badge with a tooltip explaining "You don't
 * have permission to view this referenced entry."
 *
 * Data-leak vector mitigation (Risk 4): we treat ANY content in this surface
 * as a leak. The stub never receives or displays the target entry title /
 * App name / IDs.
 */

import React from 'react';
import { Text } from '../../ui/Text';

export interface RestrictedRelationStubProps {
  /**
   * The relation field key (from the source manifest) — used ONLY in the
   * tooltip's accessible-description (screen reader / dev tooling). NEVER
   * surface this in the visible label per Architectural Decision 8.
   */
  relationFieldKey: string;
  /** Always "entry" today (Plan 10-06); reserved for future kinds. */
  targetResourceKind?: 'entry';
}

export function RestrictedRelationStub(
  props: RestrictedRelationStubProps,
): React.ReactElement {
  const { relationFieldKey, targetResourceKind = 'entry' } = props;
  const tooltip = `You don't have permission to view this referenced ${targetResourceKind}.`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-[var(--panel-border)] bg-[var(--panel-bg)]/40 px-1.5 py-0.5"
      data-testid="restricted-relation-stub"
      aria-label={`Restricted relation field ${relationFieldKey}`}
      title={tooltip}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3 w-3 fill-current opacity-60"
        focusable="false"
      >
        <path d="M8 1a3 3 0 0 0-3 3v3H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3Zm-2 6V4a2 2 0 1 1 4 0v3H6Z" />
      </svg>
      <Text variant="body-sm" tone="subtle" as="span">
        Restricted
      </Text>
    </span>
  );
}

export default RestrictedRelationStub;
