/**
 * MentionPopover — anchored @-mention picker.
 *
 * Renders a small popover above (or below) a host textarea / input
 * showing user search results matching the current ``query`` from
 * ``useMentionAutocomplete``. Highlighted row is selectable via
 * Enter / Tab (forwarded through the host's keydown handler) or by
 * direct click.
 *
 * Visual chrome matches Settings popovers / UserSearchPicker:
 *  - ``bg-[var(--panel)]`` + ``border-[var(--panel-border)]`` +
 *    ``shadow-[var(--shadow-pop)]``
 *  - 1-row hover/highlight via ``--panel-2``
 *  - Avatar (xs) + display_name + email (subtle)
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAuthOptional } from '../../context/AuthContext';
import { usersApi } from '../../api/users';
import { tracksApi } from '../../api/tracks';
import { Avatar } from '../ui/Avatar';
import type { User } from '../../types';

interface MentionPopoverProps {
  /** The current query (substring after ``@`` up to caret). */
  query: string;
  /** Portal z-index — raise above chat launcher (default 60). */
  zIndex?: number;
  /** When true, the signed-in user appears in results (chat tagging). */
  includeSelf?: boolean;
  /** Absolute-positioning offsets relative to the host's bounding box.
   *  Consumer is responsible for setting up ``position: relative`` on
   *  the wrapper so this absolute popover lands sensibly. */
  position: { top: number; left: number; transform?: string };
  /** Currently-highlighted index. Controlled externally so keyboard
   *  navigation in the host (ArrowDown / ArrowUp) drives the picker. */
  highlightIndex: number;
  /** Reports the candidate list back so the host can clamp its
   *  highlight index when results refresh. */
  onCandidatesChange: (users: User[]) => void;
  /** Called when the user clicks a row (mouse path). */
  onSelect: (user: User) => void;
  /** Called when the user clicks outside / presses Escape (host
   *  dismisses; this callback fires from the document-level outside-
   *  click handler). */
  onDismiss: () => void;
  /** When set, candidates are restricted to users with effective access
   *  to this track (owner + direct + inherited app collaborators, minus
   *  excluded). Falls through to the public-vis global search when the
   *  track is public. Without a trackId, the picker queries the global
   *  user list (legacy behaviour — used in surfaces that do not bind to
   *  a track). */
  trackId?: string;
}

export function MentionPopover({
  query,
  position,
  highlightIndex,
  zIndex = 60,
  includeSelf = false,
  onCandidatesChange,
  onSelect,
  onDismiss,
  trackId,
}: MentionPopoverProps) {
  const auth = useAuthOptional();
  const currentUserId = auth?.user?.id ?? null;
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce the search query so every keystroke doesn't hit the API.
  // 120ms is fast enough to feel live + slow enough to coalesce typing.
  const debouncedQuery = useDebounced(query, 120);

  useEffect(() => {
    let cancelled = false;
    const q = debouncedQuery.trim();
    // Empty query = ``@`` just pressed — surface the first 8 users so
    // the picker is never empty before the first character.
    setLoading(true);
    void (async () => {
      try {
        let fetched: User[];
        if (trackId) {
          // Track-scoped — backend enumerates effective-access users only
          // (or falls through to global search when track.visibility is
          // ``public``). Self-exclusion is enforced server-side too, but
          // we keep the client filter as defence-in-depth.
          const res = await tracksApi.getMentionCandidates(trackId, q, 8);
          fetched = res.users;
        } else {
          const res = await usersApi.list({
            per_page: 8,
            search: q || undefined,
          });
          fetched = res.users;
        }
        if (cancelled) return;
        const filtered =
          includeSelf || !currentUserId
            ? fetched
            : fetched.filter((u: User) => u.id !== currentUserId);
        setUsers(filtered);
        onCandidatesChange(filtered);
      } catch {
        if (cancelled) return;
        setUsers([]);
        onCandidatesChange([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, onCandidatesChange, currentUserId, trackId, includeSelf]);

  // Outside-click dismiss. The mousedown firing on the host textarea
  // (where the caret lives) MUST NOT close the popover — it's
  // expected the user keeps typing. Use ``[data-mention-popover]`` as
  // an opt-out marker.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-mention-popover]')) return;
      if (target.closest('[data-mention-host]')) return;
      onDismiss();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onDismiss]);

  // Portal to document.body so the popover escapes modal / dialog
  // ``overflow-hidden`` ancestors (EntryDetail's panel, the shared
  // Modal primitive at sm+, etc.). Positions are viewport-absolute,
  // computed by MentionableTextarea via getBoundingClientRect + caret
  // coords.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-mention-popover
      role="listbox"
      aria-label="Mention candidates"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        transform: position.transform,
        zIndex,
      }}
      className="
        min-w-[240px] max-w-[320px]
        max-h-[320px] overflow-y-auto
        rounded-[var(--radius-card)]
        bg-[var(--panel)] border border-[var(--panel-border)]
        shadow-[var(--shadow-pop)]
        py-1
        animate-fade-in
      "
    >
      {loading && users.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[var(--text-subtle)]">
          Searching…
        </div>
      ) : users.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[var(--text-subtle)]">
          {/* Bare `@` in a workspace where you're the only (or only
              matching) member previously showed the baffling
              `No matches for “”` — you can't mention yourself, so say
              that instead of implying the search broke. */}
          {query.trim()
            ? `No matches for “${query}”`
            : 'No one else to mention here yet.'}
        </div>
      ) : (
        <ul className="flex flex-col">
          {users.map((u, idx) => {
            const active = idx === highlightIndex;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseDown={e => {
                    // Prevent the textarea from losing focus — keeps
                    // the caret visible while the selection lands.
                    e.preventDefault();
                  }}
                  onClick={() => onSelect(u)}
                  className={`
                    w-full text-left
                    flex items-center gap-2.5 px-3 py-2
                    transition-colors duration-fast
                    ${
                      active
                        ? 'bg-[var(--panel-2)]'
                        : 'hover:bg-[var(--panel-2)]'
                    }
                  `}
                >
                  <Avatar
                    name={u.display_name || u.email || 'Unnamed user'}
                    size="xs"
                    attachmentId={u.avatar_attachment_id}
                    userId={u.id}
                    version={u.updated_at}
                    ringVariant="none"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-[var(--text)] truncate">
                      {u.display_name || '—'}
                    </div>
                    {u.email ? (
                      <div className="text-[11px] text-[var(--text-subtle)] truncate">
                        {u.email}
                      </div>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>,
    document.body,
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
