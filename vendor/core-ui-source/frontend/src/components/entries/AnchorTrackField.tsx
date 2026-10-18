/**
 * AnchorTrackField — opt-in control for ``relation.target === 'track'``.
 *
 * Details (auto_provision): muted “Created with project” until a track id exists.
 * Financials / Contracts (opt-in): SegmentedControl None | Create Track.
 * Linked: show RelationValue for the existing track id.
 */

import { SegmentedControl } from '../ui';
import { Text } from '../../ui';
import { RelationValue } from './relations';
import type { OperationalModelFieldSpec } from '../../types';
import { CREATE_ANCHOR_SENTINEL } from './anchorTrackConstants';
import {
  FieldLabelContent,
  isFieldRequired,
} from './fieldLabel';
import type { RelationNavContext } from './relations/routeForRelationTarget';

export { CREATE_ANCHOR_SENTINEL } from './anchorTrackConstants';

type AnchorMode = 'none' | 'create';

function isLinkedTrackId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim() !== CREATE_ANCHOR_SENTINEL
  );
}

function modeFromValue(value: unknown): AnchorMode {
  if (value === CREATE_ANCHOR_SENTINEL) return 'create';
  return 'none';
}

function FieldNameLabel({
  name,
  required,
}: {
  name: string;
  required: boolean;
}) {
  return (
    <Text as="p" variant="label" tone="muted">
      <FieldLabelContent name={name} required={required} />
    </Text>
  );
}

export function AnchorTrackField({
  field,
  value,
  onChange,
  readonly = false,
  onNavigate,
  navContext,
}: {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (next: unknown) => void;
  readonly?: boolean;
  onNavigate?: () => void;
  navContext?: RelationNavContext | null;
}) {
  const relation = field.relation || {};
  const autoProvision = Boolean(relation.auto_provision);
  const required = isFieldRequired(field);
  const linked = isLinkedTrackId(value);

  if (linked) {
    return (
      <div className="space-y-1">
        <FieldNameLabel name={field.name} required={required} />
        <RelationValue
          value={value}
          relation={relation}
          variant="chips"
          stopPropagation
          onNavigate={onNavigate}
          navContext={navContext}
        />
      </div>
    );
  }

  if (autoProvision) {
    return (
      <div className="space-y-1">
        <FieldNameLabel name={field.name} required={required} />
        <Text as="p" variant="body" tone="muted">
          Created with project
        </Text>
      </div>
    );
  }

  const mode = modeFromValue(value);

  return (
    <div className="space-y-1.5">
      <FieldNameLabel name={field.name} required={required} />
      <SegmentedControl
        ariaLabel={field.name || 'Anchor track'}
        size="sm"
        value={mode}
        onChange={next => {
          if (readonly) return;
          onChange(next === 'create' ? CREATE_ANCHOR_SENTINEL : null);
        }}
        options={[
          { value: 'none', label: 'None', disabled: readonly },
          { value: 'create', label: 'Create Track', disabled: readonly },
        ]}
      />
      <Text as="p" variant="meta" tone="muted">
        Optional — creates a privileged track for this project
      </Text>
    </div>
  );
}

/** True when the field should use AnchorTrackField instead of entry pickers. */
export function isAnchorTrackRelation(
  field: OperationalModelFieldSpec | undefined | null
): boolean {
  if (!field || field.type !== 'relation') return false;
  return String(field.relation?.target || 'entry') === 'track';
}
