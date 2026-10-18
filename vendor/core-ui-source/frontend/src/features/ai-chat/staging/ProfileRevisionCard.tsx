/**
 * Approval surface for a ``propose_profile_revision`` staged change.
 *
 * The agent emits a patch (set of declarative ops over the candidate
 * draft); this card renders the ops as a human-readable diff and lets
 * the user approve / reject. Reuses the existing ``StagedChangeCard``
 * for the bless/revoke + write-fallback machinery.
 *
 * The diff payload is expected to live on
 * ``staged.diff_machine.operations`` (an array of { op, ...args } shapes).
 * If no operations are present we fall back to the generic markdown
 * diff_human rendering.
 */

import type { StagedChange } from './types';
import { StagedChangeCard, type StagedChangeCardProps } from './StagedChangeCard';

interface ProfileOperation {
  op: string;
  [key: string]: unknown;
}

function formatOp(op: ProfileOperation): string {
  switch (op.op) {
    case 'add_entry_type':
      return `+ entry type "${(op.spec as { name?: string })?.name || (op.spec as { key?: string })?.key || '?'}"`;
    case 'modify_entry_type':
      return `~ entry type "${op.key as string}"`;
    case 'add_field':
      return `+ field "${(op.spec as { key?: string })?.key || '?'}" on entry type "${op.entry_type as string}"`;
    case 'remove_field':
      return `- field "${op.field_key as string}" from entry type "${op.entry_type as string}"`;
    case 'add_view':
      return `+ view "${(op.spec as { name?: string })?.name || (op.spec as { key?: string })?.key || '?'}" (${(op.spec as { view_type?: string })?.view_type || '?'})`;
    case 'add_tag':
      return `+ tag "${(op.spec as { name?: string })?.name || (op.spec as { key?: string })?.key || '?'}" in group "${op.group_key as string}"`;
    case 'add_relation':
      return `+ relation`;
    case 'register_composite_field_type':
      return `+ composite field type "${(op.spec as { key?: string })?.key || '?'}" (base: ${(op.spec as { base?: string })?.base || '?'})`;
    default:
      return `${op.op}`;
  }
}

export function ProfileRevisionCard({ staged, onTerminal }: StagedChangeCardProps) {
  const ops =
    (staged.diff_machine?.operations as ProfileOperation[] | undefined) ?? [];

  // We delegate the actual approval UI to ``StagedChangeCard``. The
  // op-list preview is rendered by replacing diff_human with a richer
  // markdown summary the card already knows how to display.
  const enriched: StagedChange = ops.length
    ? {
        ...staged,
        diff_human: [
          staged.diff_human?.trim() || '',
          '',
          '**Proposed changes:**',
          ...ops.map((op) => `- ${formatOp(op)}`),
        ]
          .filter((line) => line !== undefined)
          .join('\n'),
      }
    : staged;

  return <StagedChangeCard staged={enriched} onTerminal={onTerminal} />;
}
