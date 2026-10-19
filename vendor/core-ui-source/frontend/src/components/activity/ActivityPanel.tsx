/**
 * ActivityPanel — UX-02 scope-aware live event feed.
 *
 * Thin renderer over ``useEventStream(scope)``. Shows:
 *   - A status pill (live / polling / connecting / disconnected) so the
 *     user knows whether they're seeing realtime or polled data.
 *   - A reverse-chronological scrollable list (newest at top) of events
 *     normalized through ``normalizeChangeEvent``.
 *   - Each row shows actor kind (e.g. "agent"), action verb, relative
 *     timestamp. Clicking a row opens a diff drawer showing ``before``
 *     and ``after`` snapshots pre-formatted as JSON.
 *
 * Plan 07-03 mounts this panel in TrackDetailPage.tsx's sidebar and as a
 * new section of EntryDetail.tsx beneath the comments thread. Plan 07-05
 * owns the Vitest coverage (TEST-04).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { auditLogSettingsHref } from '../../api/auditLog';
import { useAuthOptional } from '../../context/AuthContext';
import type { ActivityEvent } from '../../utils/changeEvent';
import { useEventStream, type EventStreamStatus } from './useEventStream';

/** Per-action sentence template. ``{title}`` is interpolated from the
 *  resource snapshot (entry/track/comment-parent-entry title). Phrases are
 *  intentionally terse — the activity rail is a glance, not an audit dump. */
const ACTION_TEMPLATE: Record<string, string> = {
  'entry.create': 'created {title}',
  'entry.update': 'updated {title}',
  'entry.delete': 'deleted {title}',
  'comment.create': 'commented on {title}',
  'comment.update': 'edited a comment on {title}',
  'comment.delete': 'deleted a comment on {title}',
  'track.create': 'created track {title}',
  'track.update': 'updated track {title}',
  'track.delete': 'deleted track {title}',
  'app.create': 'created app {title}',
  'app.update': 'updated app {title}',
  'app.delete': 'deleted app {title}',
  'space.create': 'created app {title}',
  'space.update': 'updated app {title}',
  'space.delete': 'deleted app {title}',
  'workspace.create': 'created workspace {title}',
  'workspace.update': 'updated workspace {title}',
  'workspace.member_add': 'added a member',
  'workspace.invitation_create': 'invited someone',
  'attachment.create': 'attached a file',
  'attachment.delete': 'removed an attachment',
  'tag.create': 'added a tag',
  'view.create': 'created a view',
  'view.update': 'updated a view',
  'view.delete': 'deleted a view',
  'operational_model.update': 'updated the Operational Model',
  'operational_model.merge_library': 'merged a operational model library',
  'user.create': 'joined',
};

/** Status badge colors — keyed to Integral's semantic tokens so the pill
 *  picks up the canvas-aware palette in both light and dark themes. The
 *  ``presence`` token surfaces a calibrated green for the live indicator. */
const STATUS_STYLES: Record<EventStreamStatus, { bg: string; fg: string; label: string }> = {
  connecting: {
    bg: 'bg-[var(--badge-muted-bg)]',
    fg: 'text-[var(--badge-muted-fg)]',
    label: 'Connecting',
  },
  live: {
    bg: 'bg-[var(--success-bg)]',
    fg: 'text-[var(--success-fg)]',
    label: 'Live',
  },
  polling: {
    bg: 'bg-[var(--warn-bg)]',
    fg: 'text-[var(--warn-fg)]',
    label: 'Polling',
  },
  disconnected: {
    bg: 'bg-[var(--danger-bg)]',
    fg: 'text-[var(--danger-fg)]',
    label: 'Disconnected',
  },
};

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  const yr = Math.floor(mo / 12);
  return `${yr}y`;
}

function actorName(
  evt: ActivityEvent,
  currentUserAuthId: string | undefined,
  currentUserDisplayName: string | undefined,
): string {
  const kind = evt.actor_kind || 'system';
  const id = evt.actor_id || '';
  if (kind === 'human' && id && currentUserAuthId && id === currentUserAuthId) {
    return currentUserDisplayName || 'You';
  }
  // Backend enrichment ships display_name on ``details.actor_display_name``
  // — saves a /users round-trip for non-self human actors.
  const enriched = evt.details?.actor_display_name;
  if (typeof enriched === 'string' && enriched.trim()) {
    return enriched.trim();
  }
  if (kind === 'agent') return 'An agent';
  if (kind === 'connector') return 'A connector';
  if (kind === 'system') return 'System';
  return 'Someone';
}

/** Resolve the display title for an event:
 *  - Comment events: parent entry title (backend enriches snapshot with
 *    ``_entry_title`` so we render "X commented on 'Prep Board Review'").
 *  - Everything else: the resource's own ``title`` (then ``name``, then a
 *    trimmed body excerpt as last-ditch). Empty when no title is available. */
function eventTitle(evt: ActivityEvent): string {
  const after = (evt.after ?? undefined) as Record<string, unknown> | undefined;
  const before = (evt.before ?? undefined) as Record<string, unknown> | undefined;
  const snap = after ?? before;
  if (!snap) return '';

  // Comments expose the parent entry's title under ``_entry_title``.
  const entryTitle = snap._entry_title;
  if (typeof entryTitle === 'string' && entryTitle.trim()) {
    return entryTitle.trim();
  }

  const title = snap.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  const name = snap.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const body = snap.body;
  if (typeof body === 'string' && body.trim()) {
    const flat = body.trim().replace(/\s+/g, ' ');
    return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
  }
  return '';
}

/** Compose a single-line sentence: "Eldon commented on 'Prep Board Review'". */
function summarize(
  evt: ActivityEvent,
  currentUserAuthId: string | undefined,
  currentUserDisplayName: string | undefined,
): { who: string; rest: string; title: string } {
  const who = actorName(evt, currentUserAuthId, currentUserDisplayName);
  const title = eventTitle(evt);
  const template = ACTION_TEMPLATE[evt.action];
  if (template) {
    const [before, after] = template.split('{title}');
    if (after !== undefined) {
      // Template expects a title — if we have none, drop the trailing
      // preposition ("on", "to") and any leading space so we don't render
      // dangling words.
      return {
        who,
        rest: title
          ? before
          : before.replace(/\s+(on|to|of|into|from)$/i, ''),
        title,
      };
    }
    return { who, rest: template, title: '' };
  }
  // Unknown action → fall back to the raw code so engineers can still parse
  // it without the user needing to open the diff drawer.
  return { who, rest: evt.action, title };
}

interface ActivityPanelProps {
  /** Scope filter — e.g. ``"track:<id>"`` or ``"entry:<id>"``. Matches the
   *  scope parameter accepted by both the WS and polling endpoints. */
  scope: string;
  /** Optional className on the wrapper — lets pages tune width/padding. */
  className?: string;
  /** Section title rendered above the status pill. Defaults to "Activity". */
  title?: string;
  /** When true, drop the card chrome (border + rounded + bg + internal
   *  header divider + max-height cap on the list). Use when the panel
   *  sits inside a section that already supplies its own structural
   *  context (e.g. the Track right-rail with its own chevron-toggle
   *  heading). */
  chromeless?: boolean;
  /** Optional client-side filter: only show events whose ``resource_id``
   *  matches. Entry-level activity feeds use this to subscribe under the
   *  parent track's scope (where entry CRUD events are actually emitted)
   *  while still rendering only events about the specific entry. */
  filterResourceId?: string;
  /** Tighter rows for a narrow host — the entry dialog's ~380px companion
   *  column, where a 13px line wraps to two lines and each event eats ~44px.
   *  Same content, less vertical cost, so more of the trail is visible
   *  without scrolling. */
  dense?: boolean;
}

export function ActivityPanel({
  scope,
  className = '',
  title = 'Activity',
  chromeless = false,
  dense = false,
  filterResourceId,
}: ActivityPanelProps) {
  const { events, status, reconnect } = useEventStream(scope);
  const auth = useAuthOptional();
  const currentUser = auth?.user ?? null;
  const currentUserAuthId = currentUser?.user_id ?? currentUser?.id;
  const currentUserDisplayName = currentUser?.display_name;

  // Reverse the list for display — most-recent at top reads more naturally
  // in a side rail; the hook itself keeps ASC order for cursor compatibility.
  const reversed = useMemo(() => {
    const matchesEntry = (e: ActivityEvent): boolean => {
      if (e.resource_id === filterResourceId) return true;
      // Comment events have ``resource_id`` = comment id, NOT entry id —
      // they carry the parent entry id under ``after._entry_id`` /
      // ``before._entry_id`` (backend enrichment in comments.py). Match
      // either snapshot so create/update/delete all show on the entry feed.
      const after = (e.after ?? undefined) as Record<string, unknown> | undefined;
      const before = (e.before ?? undefined) as Record<string, unknown> | undefined;
      return (
        after?._entry_id === filterResourceId ||
        before?._entry_id === filterResourceId
      );
    };
    const visible = filterResourceId
      ? events.filter(matchesEntry)
      : events;
    return [...visible].reverse();
  }, [events, filterResourceId]);
  const statusStyle = STATUS_STYLES[status];

  return (
    <section
      data-testid="activity-panel"
      data-scope={scope}
      className={[
        'flex flex-col min-w-0',
        chromeless
          ? ''
          : 'border border-[var(--panel-border)] rounded-[var(--radius-card)] bg-[var(--panel)]',
        className,
      ].join(' ')}
    >
      <header
        className={[
          'flex items-center justify-between gap-2',
          chromeless
            ? 'pb-2'
            : 'px-3 py-2 border-b border-[var(--panel-border)]',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 min-w-0">
          {chromeless ? null : (
            <h3 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {title}
            </h3>
          )}
          <span
            data-testid={`activity-status-${status}`}
            className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-medium ${statusStyle.bg} ${statusStyle.fg}`}
            title={statusStyle.label}
          >
            {status === 'live' ? (
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-[var(--radius-pill)] bg-[var(--presence)]"
              />
            ) : null}
            {statusStyle.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={auditLogSettingsHref({
              scope,
              resource_id: filterResourceId,
            })}
            className="text-[11px] text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
          >
            Audit log
          </Link>
          {status === 'disconnected' || status === 'polling' ? (
            <button
              type="button"
              onClick={reconnect}
              className="text-[11px] text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
              aria-label="Reconnect event stream"
            >
              Retry
            </button>
          ) : null}
        </div>
      </header>

      <ul
        className={[
          chromeless
            ? 'space-y-3'
            : 'flex-1 min-h-0 overflow-y-auto max-h-[420px] divide-y divide-[var(--panel-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        ].join(' ')}
        role="list"
      >
        {reversed.length === 0 ? (
          <li
            className={`text-center text-xs text-[var(--text-muted)] ${dense ? 'px-2 py-4' : 'px-3 py-6'}`}
          >
            {status === 'connecting'
              ? 'Connecting…'
              : status === 'disconnected'
              ? 'No connection. Retry to reload.'
              : 'No activity yet.'}
          </li>
        ) : (
          reversed.map(evt => {
            const { who, rest, title } = summarize(
              evt,
              currentUserAuthId,
              currentUserDisplayName,
            );
            const ts = relativeTime(evt.ts);
            return (
              <li
                key={evt.id}
                data-testid={`activity-event-${evt.id}`}
                title={evt.ts || undefined}
                className={[
                  'block w-full text-left',
                  dense ? 'py-1' : 'py-2',
                  chromeless ? 'px-0' : dense ? 'px-2' : 'px-3',
                ].join(' ')}
              >
                <p
                  className={[
                    'leading-snug text-[var(--text-muted)] break-words',
                    dense ? 'text-[11px]' : 'text-[13px]',
                  ].join(' ')}
                >
                  {ts ? (
                    <span className="text-[var(--text-subtle)] tabular-nums">
                      {ts} ·{' '}
                    </span>
                  ) : null}
                  <span className="font-medium text-[var(--text)]">{who}</span>
                  {rest ? <span> {rest}</span> : null}
                  {title ? (
                    <span className="text-[var(--text)]"> {title}</span>
                  ) : null}
                </p>
              </li>
            );
          })
        )}
      </ul>

    </section>
  );
}
