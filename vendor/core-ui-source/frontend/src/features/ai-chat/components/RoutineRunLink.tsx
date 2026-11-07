import { Link } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { Text } from '../../../ui';
import { LINE_ICON_STROKE } from '../../../components/ui';

/** Old routine messages without an identity link to the list, never an inferred schedule. */
export function RoutineRunLink({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== 'object') return null;
  const meta = metadata as Record<string, unknown>;
  const interact = (meta.interactPayload ?? meta.interact_payload) as Record<string, unknown> | undefined;
  if ((interact?.origin ?? meta.origin) !== 'routine_task') return null;
  const id = interact?.routine_id ?? meta.routine_id;
  const routineId = typeof id === 'string' && id.length <= 255 ? id.trim() : '';
  const to = `/background-tasks${routineId ? `?routine=${encodeURIComponent(routineId)}` : ''}#scheduled-routines`;
  return <Link data-slot="aui_routine-run-badge" to={to}
    aria-label={routineId ? 'Manage this scheduled routine' : 'Manage scheduled routines'}
    className="mb-1 inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-1 text-[var(--link)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]">
    <Clock3 size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
    <Text as="span" variant="label" tone="inherit">Scheduled routine</Text>
  </Link>;
}
