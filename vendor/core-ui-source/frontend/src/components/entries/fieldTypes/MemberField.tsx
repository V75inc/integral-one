/**
 * Phase 16 ACC-08 — `member` field-type editor.
 *
 * Wraps ``UserSearchPicker`` (``components/collab/UserSearchPicker``) so
 * an EntryType declaring a ``type: member`` field renders a workspace-
 * scoped people picker in the entry composer. The selected ``User.id``
 * lands in ``Entry.custom_fields[field_key]`` as the fast-path scalar
 * cache; the backend materializer wires the canonical
 * ``HAS_MEMBER_REF`` edge in the same write transaction.
 *
 * Candidates come from ``GET /workspaces/{id}/members`` so only users
 * in the entry track's workspace member pool can be selected — matching
 * backend ``validate_member_value`` (I-FIELD-MEMBER-01).
 *
 * Read mode: when the renderer is invoked outside an editable composer
 * (the registry passes ``onChange = noop``), the widget shows the
 * selected member's avatar + name without the picker affordance.
 */

import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Avatar } from '../../ui/Avatar';
import { AvatarStackedMeta } from '../../ui/AvatarStackedMeta';
import { LINE_ICON_STROKE } from '../../ui';
import { UserSearchPicker } from '../../collab/UserSearchPicker';
import { lookupWorkspaceMemberById } from '../../../api/members';
import { useScope } from '../../../context/ScopeContext';
import { buildFieldPlaceholder } from '../../../utils/fieldPlaceholders';
import {
  FieldLabelContent,
  fieldAriaLabel,
  isFieldRequired
} from '../fieldLabel';
import type { OperationalModelFieldSpec, User } from '../../../types';
import type { FieldTypeRendererProps, FieldTypeRegistration } from './types';

const noop = () => undefined;

function MemberFieldShell({
  showLabel,
  field,
  active,
  children
}: {
  showLabel: boolean;
  field: OperationalModelFieldSpec;
  active: boolean;
  children: ReactNode;
}) {
  const required = isFieldRequired(field);
  return (
    <div
      className={`
        relative rounded-md border transition-[border-color,background-color] duration-fast
        ${
          active
            ? 'border-[var(--panel-border)] bg-[var(--panel)]'
            : 'border-transparent bg-transparent hover:bg-[var(--panel-2)]'
        }
      `}
      aria-required={required || undefined}
    >
      {showLabel ? (
        <span
          className="pointer-events-none absolute -top-2.5 left-3 z-[1] rounded px-1 text-[12px] font-medium text-[var(--text-muted)] bg-[var(--panel)]"
          aria-hidden
        >
          <FieldLabelContent name={field.name} required={required} />
        </span>
      ) : null}
      {children}
    </div>
  );
}

function MemberFieldEditor({ field, value, onChange }: FieldTypeRendererProps) {
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? '';

  const relation = field.relation || {};
  const isMany = Boolean(relation.many);

  const userIds = useMemo<string[]>(() => {
    if (Array.isArray(value)) return value.filter(Boolean) as string[];
    if (typeof value === 'string' && value) return [value];
    return [];
  }, [value]);

  const [selectedList, setSelectedList] = useState<User[]>([]);
  const [resolving, setResolving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const placeholder = buildFieldPlaceholder(field);

  useEffect(() => {
    let cancelled = false;
    if (userIds.length === 0) {
      setSelectedList([]);
      return;
    }
    const currentIds = selectedList.map(u => u.id);
    if (
      currentIds.length === userIds.length &&
      userIds.every(id => currentIds.includes(id))
    ) {
      return;
    }
    setResolving(true);
    Promise.all(
      userIds.map(id =>
        lookupWorkspaceMemberById(id, workspaceId).catch(() => null)
      )
    )
      .then(results => {
        if (!cancelled) {
          setSelectedList(results.filter(Boolean) as User[]);
        }
      })
      .catch(() => {
        if (!cancelled) setSelectedList([]);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
    // This effect SETS selectedList; listing it as a dependency is an
    // unconditional render loop. userIds/workspaceId are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIds, workspaceId]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setPickerOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [pickerOpen]);

  const onSelect = (user: User) => {
    if (isMany) {
      if (!userIds.includes(user.id)) {
        onChange([...userIds, user.id]);
      }
      setPickerOpen(false);
    } else {
      setPickerOpen(false);
      onChange(user.id);
    }
  };

  const onRemove = (id: string) => {
    const nextIds = userIds.filter(x => x !== id);
    onChange(isMany ? nextIds : null);
  };

  const onClear = () => {
    setSelectedList([]);
    setPickerOpen(false);
    onChange(isMany ? [] : null);
  };

  const excludeIds = useMemo(() => {
    const ids = new Set<string>();
    selectedList.forEach(u => {
      if (u.id) ids.add(u.id);
      if (u.user_id) ids.add(u.user_id);
    });
    return ids;
  }, [selectedList]);

  const hasValue = selectedList.length > 0;
  const showFloat =
    focusWithin || hovered || hasValue || pickerOpen || resolving || isFieldRequired(field);
  const active = focusWithin || hasValue || pickerOpen || resolving;

  const singleSelected = !isMany ? selectedList[0] : null;

  return (
    <div
      ref={rootRef}
      className="space-y-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusWithin(false);
        }
      }}
    >
      <MemberFieldShell showLabel={showFloat} field={field} active={active}>
        {singleSelected ? (
          <div className="flex min-w-0 items-center gap-2 px-3 py-2">
            <AvatarStackedMeta
              className="min-w-0 flex-1"
              avatar={
                <Avatar
                  name={singleSelected.display_name}
                  size="xs"
                  attachmentId={singleSelected.avatar_attachment_id}
                />
              }
              primary={
                <span className="truncate text-sm font-normal text-[var(--text)]">
                  {singleSelected.display_name}
                </span>
              }
              secondary={
                singleSelected.email ? (
                  <span className="truncate text-xs text-[var(--text-muted)]">
                    {singleSelected.email}
                  </span>
                ) : undefined
              }
            />
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear member"
              className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]"
            >
              <X size={14} strokeWidth={LINE_ICON_STROKE} />
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(open => !open)}
              aria-expanded={pickerOpen}
              aria-label={pickerOpen ? 'Close member search' : 'Change member'}
              className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]"
            >
              <ChevronDown
                size={16}
                strokeWidth={LINE_ICON_STROKE}
                className={`transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        ) : isMany && selectedList.length > 0 ? (
          <div className="flex flex-col w-full gap-1.5 p-2">
            <div className="flex flex-wrap gap-1.5">
              {selectedList.map(u => (
                <div
                  key={u.id}
                  className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 border border-[var(--panel-border)] bg-[var(--panel-2)] text-xs font-normal"
                >
                  <Avatar
                    name={u.display_name}
                    size="xs"
                    attachmentId={u.avatar_attachment_id}
                  />
                  <span className="text-[var(--text)] truncate max-w-[120px]">
                    {u.display_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(u.id)}
                    aria-label={`Remove ${u.display_name}`}
                    className="rounded-full p-0.5 hover:bg-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-1 border-t border-[var(--panel-border)] pt-1.5 px-1">
              <button
                type="button"
                onClick={() => setPickerOpen(open => !open)}
                className="text-xs font-medium text-[var(--link)] hover:text-[var(--link-hover)]"
              >
                + Add member
              </button>
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Clear all
              </button>
            </div>
          </div>
        ) : resolving ? (
          <div className="px-3 py-2 text-sm font-normal text-[var(--text-muted)]">
            Loading member…
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
            aria-label={fieldAriaLabel(field)}
            className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left text-sm font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]"
          >
            <span className="truncate text-[var(--text-muted)]">{placeholder}</span>
            <ChevronDown
              size={16}
              strokeWidth={LINE_ICON_STROKE}
              className={`shrink-0 text-[var(--text-muted)] transition-transform ${
                pickerOpen ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </button>
        )}
      </MemberFieldShell>

      {pickerOpen ? (
        <UserSearchPicker
          onSelect={onSelect}
          excludeIds={excludeIds}
          pool="workspace"
          embedded
          autoFocus
        />
      ) : null}
    </div>
  );
}

function MemberFieldReader(props: FieldTypeRendererProps) {
  return <MemberFieldEditor {...props} onChange={noop} />;
}

/** Field-type registration exported for ``registry.ts`` consumption. */
export const memberFieldRegistration: FieldTypeRegistration = {
  type: 'member',
  editor: MemberFieldEditor,
  renderer: MemberFieldReader,
  meta: {
    label: 'Member',
    description: "Links the entry to a workspace member's user account."
  },
  source: 'builtin'
};

export { MemberFieldEditor, MemberFieldReader };
