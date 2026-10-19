import { useState, useEffect, useCallback, useRef } from 'react';
import { Search } from 'lucide-react';
import { usersApi } from '../../api';
import { listWorkspaceMembersForPicker } from '../../api/members';
import { useScope } from '../../context/ScopeContext';
import { LINE_ICON_STROKE } from '../ui';
import { Avatar } from '../ui/Avatar';
import { AvatarStackedMeta } from '../ui/AvatarStackedMeta';
import type { User } from '../../types';

interface UserSearchPickerProps {
  onSelect(user: User): void;
  excludeIds?: Set<string>;
  label?: string;
  /** Hide the field label — for embedding inside seamless form controls. */
  embedded?: boolean;
  /** Focus the search input when the picker mounts. */
  autoFocus?: boolean;
  /**
   * ``directory`` — global registered users (collaborator invite, add
   * workspace member). ``workspace`` — only users in the active
   * workspace member pool (``member`` field type).
   */
  pool?: 'directory' | 'workspace';
}

const EMPTY_EXCLUDE_IDS: ReadonlySet<string> = new Set();

function filterExcluded(users: User[], excluded: ReadonlySet<string>): User[] {
  return users.filter(
    u => !excluded.has(u.id) && !excluded.has(u.user_id || '')
  );
}

export function UserSearchPicker({
  onSelect,
  excludeIds,
  label = 'Find teammate',
  embedded = false,
  autoFocus = false,
  pool = 'directory',
}: UserSearchPickerProps) {
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? '';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const excludeIdsRef = useRef<ReadonlySet<string>>(EMPTY_EXCLUDE_IDS);
  excludeIdsRef.current = excludeIds ?? EMPTY_EXCLUDE_IDS;

  const searchDirectory = useCallback(async (term: string) => {
    const trimmed = term.trim();
    setLoading(true);
    try {
      const { users } = await usersApi.list({
        ...(trimmed.length >= 2 ? { search: trimmed } : {}),
        per_page: 20,
        page: 1,
      });
      setResults(filterExcluded(users, excludeIdsRef.current));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  const searchWorkspace = useCallback(async (term: string) => {
    if (!workspaceId) {
      setResults([]);
      setLoading(false);
      setSearched(true);
      return;
    }
    setLoading(true);
    try {
      const users = await listWorkspaceMembersForPicker(workspaceId, term);
      setResults(filterExcluded(users, excludeIdsRef.current));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [workspaceId]);

  const search = pool === 'workspace' ? searchWorkspace : searchDirectory;

  useEffect(() => {
    const delay = q.trim().length === 0 ? 0 : 300;
    const t = window.setTimeout(() => {
      void search(q);
    }, delay);
    return () => window.clearTimeout(t);
  }, [q, search]);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  const emptyMessage =
    pool === 'workspace' && !workspaceId
      ? 'Select a workspace to search members.'
      : 'No users found.';

  return (
    <div className={embedded ? 'space-y-2 pl-3' : 'space-y-2'}>
      {!embedded ? (
        <label className="text-xs font-medium text-[var(--text-muted)]">{label}</label>
      ) : null}
      <div className="relative w-full">
        <Search
          size={14}
          strokeWidth={LINE_ICON_STROKE}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={
            pool === 'workspace' ? 'Search workspace members…' : 'Search by name…'
          }
          className="app-input pl-10 pr-3.5 text-sm w-full"
          aria-label={embedded ? label : 'Search users by name'}
          disabled={pool === 'workspace' && !workspaceId}
        />
      </div>
      {loading && (
        <p className="text-xs text-[var(--text-muted)]">Searching…</p>
      )}
      {!loading && searched && results.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">{emptyMessage}</p>
      )}
      {results.length > 0 ? (
        <div className="mt-2 border-t border-[var(--panel-border)] pt-2">
          <ul
            role="listbox"
            aria-label={label}
            className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)] p-1"
          >
            {results.map(u => (
              <li key={u.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
                  onClick={() => {
                    onSelect(u);
                    setQ('');
                    setResults([]);
                    setSearched(false);
                  }}
                >
                  <AvatarStackedMeta
                    className="min-w-0 flex-1"
                    avatar={
                      <Avatar
                        name={u.display_name}
                        size="xs"
                        attachmentId={u.avatar_attachment_id}
                        userId={u.id}
                        version={u.updated_at}
                      />
                    }
                    primary={
                      <p className="text-xs font-medium text-[var(--text)] truncate">
                        {u.display_name}
                      </p>
                    }
                    secondary={
                      u.email ? (
                        <p className="text-[13px] text-[var(--text-muted)] truncate">
                          {u.email}
                        </p>
                      ) : undefined
                    }
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
