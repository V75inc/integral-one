/**
 * Approval surface for a ``publish_profile_draft`` staged change.
 *
 * Builds on ``StagedChangeCard`` but enriches the markdown body with
 * publish-specific signals from ``staged.diff_machine``:
 *   - structural diff summary (added/removed/changed counts)
 *   - entry-impact summary (would_fail_validation, would_need_migration)
 *   - migration plan preview
 *
 * The user sees one clear card with the safety-relevant facts before
 * blessing the publish token.
 */

import type { StagedChange } from './types';
import { StagedChangeCard, type StagedChangeCardProps } from './StagedChangeCard';

interface DiffSection {
  added?: unknown[];
  removed?: unknown[];
  changed?: unknown[];
}

interface PublishDiffMachine {
  diff?: {
    field_types?: DiffSection;
    view_types?: DiffSection;
    entry_types?: DiffSection;
    views?: DiffSection;
    tags?: DiffSection;
    relations?: DiffSection;
  };
  entry_impact?: Array<{
    track_id: string;
    total: number;
    would_fail_validation: number;
    would_need_migration: number;
  }>;
  migrations_planned?: Array<Record<string, unknown>>;
}

function summariseSection(name: string, section?: DiffSection): string | null {
  if (!section) return null;
  const a = section.added?.length || 0;
  const r = section.removed?.length || 0;
  const c = section.changed?.length || 0;
  if (a === 0 && r === 0 && c === 0) return null;
  return `- **${name}** — +${a} / -${r} / ~${c}`;
}

function summariseImpact(
  impacts?: PublishDiffMachine['entry_impact']
): string[] {
  if (!impacts || impacts.length === 0) return [];
  const lines = ['', '**Entry impact:**'];
  for (const imp of impacts) {
    lines.push(
      `- track \`${imp.track_id}\`: ${imp.would_fail_validation} would fail, ${imp.would_need_migration} need migration (of ${imp.total} total)`
    );
  }
  return lines;
}

export function PublishDraftCard({ staged, onTerminal }: StagedChangeCardProps) {
  const machine = staged.diff_machine as unknown as PublishDiffMachine;
  const diffLines: string[] = [];
  if (machine?.diff) {
    const sections = [
      summariseSection('Field types', machine.diff.field_types),
      summariseSection('View types', machine.diff.view_types),
      summariseSection('Entry types', machine.diff.entry_types),
      summariseSection('Views', machine.diff.views),
      summariseSection('Tags', machine.diff.tags),
      summariseSection('Relations', machine.diff.relations),
    ].filter((line): line is string => Boolean(line));
    if (sections.length) {
      diffLines.push('', '**Structural diff:**');
      diffLines.push(...sections);
    }
  }
  const impactLines = summariseImpact(machine?.entry_impact);
  const migrationCount = machine?.migrations_planned?.length || 0;
  const migrationLines = migrationCount
    ? ['', `**Migrations:** ${migrationCount} ${migrationCount === 1 ? 'op' : 'ops'} will run on publish.`]
    : [];

  const enriched: StagedChange =
    diffLines.length || impactLines.length || migrationLines.length
      ? {
          ...staged,
          diff_human: [
            staged.diff_human?.trim() || '',
            ...diffLines,
            ...impactLines,
            ...migrationLines,
          ].join('\n'),
        }
      : staged;

  return <StagedChangeCard staged={enriched} onTerminal={onTerminal} />;
}
