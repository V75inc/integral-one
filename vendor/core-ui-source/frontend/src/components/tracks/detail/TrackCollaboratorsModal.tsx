import { ResourceAccessReview } from '../../access/ResourceAccessReview';
import { Avatar } from '../../ui';
import { Modal } from '../../ui/Modal';
import { Pill } from '../../ui';
import { UserSearchPicker } from '../../collab/UserSearchPicker';
import {
  CollaboratorRow,
  type CollaboratorRole,
} from '../../collab/CollaboratorRow';
import { isSamePrincipal } from '../../../utils';
import type { User } from '../../../types';

export interface TrackCollaboratorsModalProps {
  open: boolean;
  trackId?: string;
  onClose: () => void;
  canManageCollaborators: boolean;
  canManageCollabRows: boolean;
  isOwner: boolean;
  currentUser: User | null | undefined;
  collaboratorList: User[];
  collaboratorCount?: number;
  collabExcludeIds: Set<string>;
  onAdd: (u: User) => void;
  onChangeDirectRole: (
    userId: string,
    role: 'admin' | 'editor' | 'commenter' | 'viewer',
  ) => void;
  onPromoteInherited: (
    userId: string,
    role: 'admin' | 'editor' | 'commenter' | 'viewer',
  ) => void;
  onTransferOwnership: (userId: string, displayName?: string) => void;
  onRemove: (userId: string) => void;
  onExclude: (userId: string, displayName?: string) => void;
  onRestore: (userId: string) => void;
}

export function TrackCollaboratorsModal({
  open,
  trackId,
  onClose,
  canManageCollaborators,
  canManageCollabRows,
  isOwner,
  currentUser,
  collaboratorList,
  collaboratorCount,
  collabExcludeIds,
  onAdd,
  onChangeDirectRole,
  onPromoteInherited,
  onTransferOwnership,
  onRemove,
  onExclude,
  onRestore,
}: TrackCollaboratorsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Collaborators">
      <div className="space-y-5 p-4">
        {trackId && <ResourceAccessReview resourceType="track" resourceId={trackId} people={collaboratorList} currentUser={currentUser} />}
        {canManageCollaborators ? (
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              Add collaborators
            </h3>
            <p className="text-xs text-[color:var(--text-muted)]">
              Find anyone by name. Workspace members are added directly; external
              users get guest access on first share. Workspace owners and admins
              can view Tracks shared with the workspace. A Private Track stays
              hidden until you add them. Add them here, then set Editor or Admin
              if they should edit.
            </p>
            <UserSearchPicker
              excludeIds={collabExcludeIds}
              onSelect={onAdd}
              label="Search people"
            />
          </div>
        ) : (
          <p className="rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[color:var(--panel-2)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
            Only the{' '}
            <span className="font-medium text-[color:var(--text)]">
              track owner or admin
            </span>{' '}
            can add, remove, or change collaborator roles. Workspace owners retain governance over private Tracks. Other members need an eligible grant.
          </p>
        )}

        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            People on this track
          </h3>
          <ul className="max-h-[min(50vh,320px)] space-y-1 overflow-y-auto pr-1">
            {collaboratorList.length === 0 ? (
              <li className="rounded-[var(--radius-input)] border border-dashed border-[var(--panel-border)] px-3 py-6 text-center text-sm text-[color:var(--text-muted)]">
                {!canManageCollaborators && (collaboratorCount ?? 0) > 0
                  ? 'Collaborator details are visible to the owner and admins.'
                  : 'No one is listed yet.'}
                {canManageCollaborators
                  ? ' Use the search above to invite collaborators (added as commenter by default; promote per row).'
                  : ''}
              </li>
            ) : (
              collaboratorList.map(c => {
                const rowRole = (c.role || '').toLowerCase();
                const isSelf =
                  isSamePrincipal(currentUser, c.id) ||
                  isSamePrincipal(currentUser, c.user_id);
                const targetId = c.user_id || c.id;
                const source =
                  c.source || (rowRole === 'owner' ? 'owner' : 'direct');
                const isDirect = source === 'direct';
                const isInherited = source === 'app';
                const isExcluded = !!c.excluded;
                const canRemoveDirect =
                  canManageCollabRows &&
                  rowRole !== 'owner' &&
                  !isSelf &&
                  isDirect;
                const canExclude =
                  canManageCollabRows &&
                  !isSelf &&
                  isInherited &&
                  !isExcluded;
                const canRestore =
                  canManageCollabRows && !isSelf && isExcluded;
                const canTransfer =
                  isOwner &&
                  rowRole !== 'owner' &&
                  !isSelf &&
                  !!targetId &&
                  isDirect &&
                  !isExcluded;
                const canChangeRole =
                  canManageCollabRows &&
                  rowRole !== 'owner' &&
                  !isSelf &&
                  !!targetId &&
                  !isExcluded &&
                  (isDirect || isInherited);
                const badges = (
                  <>
                    {isInherited && !isExcluded ? (
                      <Pill variant="neutral" tone="descriptive">
                        {c.source_app_name
                          ? `via ${c.source_app_name}`
                          : 'inherited'}
                      </Pill>
                    ) : null}
                    {isExcluded ? (
                      <Pill variant="danger">excluded</Pill>
                    ) : null}
                  </>
                );
                return (
                  <CollaboratorRow
                    key={c.id}
                    avatar={
                      <Avatar
                        name={c.display_name}
                        size="xs"
                        attachmentId={c.avatar_attachment_id}
                        userId={c.id}
                        version={c.updated_at}
                      />
                    }
                    name={c.display_name || '—'}
                    meta={c.email}
                    badges={badges}
                    role={c.role || ''}
                    displayRole={isInherited ? c.source_role : undefined}
                    excluded={isExcluded}
                    readOnly={
                      !canChangeRole &&
                      !canTransfer &&
                      !canExclude &&
                      !canRestore &&
                      !canRemoveDirect
                    }
                    onChangeRole={
                      canChangeRole
                        ? (r: CollaboratorRole) =>
                            isInherited
                              ? onPromoteInherited(
                                  targetId,
                                  r as
                                    | 'admin'
                                    | 'editor'
                                    | 'commenter'
                                    | 'viewer',
                                )
                              : onChangeDirectRole(
                                  targetId,
                                  r as
                                    | 'admin'
                                    | 'editor'
                                    | 'commenter'
                                    | 'viewer',
                                )
                        : undefined
                    }
                    onTransferOwnership={
                      canTransfer
                        ? () =>
                            onTransferOwnership(targetId, c.display_name)
                        : undefined
                    }
                    onRemove={
                      canRemoveDirect ? () => onRemove(c.id) : undefined
                    }
                    onExclude={
                      canExclude
                        ? () => onExclude(c.id, c.display_name)
                        : undefined
                    }
                    onRestore={
                      canRestore ? () => onRestore(c.id) : undefined
                    }
                  />
                );
              })
            )}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
