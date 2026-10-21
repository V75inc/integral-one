import { useDeployment } from '../../../hooks/useDeployment';
import {
  BookPlus,
  Edit2,
  Share2,
  Trash2,
  UserRound,
} from 'lucide-react';
import { PinButton } from '../../sidebar/PinButton';
import { WatchersControl } from '../../entries/WatchersControl';
import {
  Button,
  KebabMenu,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageSection,
} from '../../ui';
import { formatRelativeTime, resolveIdentityColor } from '../../../utils';
import type { Track, User } from '../../../types';

export interface TrackDetailHeaderProps {
  track: Track;
  workspaceAccentColor?: string;
  entriesTotal: number;
  publicShareEnabled: boolean;
  trackWatchers: {
    watchers: User[];
    is_watching: boolean;
  } | undefined;
  onToggleTrackWatch: () => void;
  canViewCollaborators: boolean;
  canManageCollaborators: boolean;
  collaboratorCount: number;
  isOwner: boolean;
  onOpenCollaborators: () => void;
  onOpenShare: () => void;
  onOpenEdit: () => void;
  onOpenDerive: () => void;
  onDeleteTrack: () => void;
}

export function TrackDetailHeader({
  track,
  workspaceAccentColor,
  entriesTotal,
  publicShareEnabled,
  trackWatchers,
  onToggleTrackWatch,
  canViewCollaborators,
  canManageCollaborators,
  collaboratorCount,
  isOwner,
  onOpenCollaborators,
  onOpenShare,
  onOpenEdit,
  onOpenDerive,
  onDeleteTrack,
}: TrackDetailHeaderProps) {
  const { collaboration } = useDeployment();
  return (
    <PageSection>
      <header className="mb-8">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-x-6 md:gap-y-4 min-w-0">
          <PageHeading
            accentColor={resolveIdentityColor(track.accent_color, workspaceAccentColor)}
            accentLabel={track.title}
          >
            {track.title}
          </PageHeading>
          <div className="flex flex-wrap items-center gap-2 shrink-0 md:pb-2">
            <PinButton
              kind="track"
              id={track.id}
              label={track.title}
              size="sm"
            />
            {collaboration && <WatchersControl
              watchers={trackWatchers?.watchers ?? []}
              isWatching={Boolean(trackWatchers?.is_watching)}
              onToggle={onToggleTrackWatch}
              scope="track"
            />}
            {canViewCollaborators ? (
              <Button
                variant="outline"
                size="sm"
                icon={<UserRound size={14} strokeWidth={LINE_ICON_STROKE} />}
                onClick={onOpenCollaborators}
                aria-label={`Collaborators, ${collaboratorCount} people`}
              >
                {collaboratorCount}{' '}
                {collaboratorCount === 1 ? 'collaborator' : 'collaborators'}
              </Button>
            ) : null}
            {canManageCollaborators ? (
              <Button
                variant={publicShareEnabled ? 'primary' : 'outline'}
                size="sm"
                icon={<Share2 size={14} strokeWidth={LINE_ICON_STROKE} />}
                onClick={onOpenShare}
                aria-label="Public Share Settings"
              >
                {publicShareEnabled ? 'Shared' : 'Share'}
              </Button>
            ) : null}
            {isOwner ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Edit2 size={14} strokeWidth={LINE_ICON_STROKE} />}
                  onClick={onOpenEdit}
                  aria-label="Edit track"
                >
                  Edit
                </Button>
                <KebabMenu
                  ariaLabel="More track actions"
                  items={[
                    {
                      key: 'save-template',
                      label: 'Save as template',
                      icon: (
                        <BookPlus size={13} strokeWidth={LINE_ICON_STROKE} />
                      ),
                      onClick: onOpenDerive,
                    },
                    {
                      key: 'delete',
                      label: 'Delete track',
                      icon: (
                        <Trash2 size={13} strokeWidth={LINE_ICON_STROKE} />
                      ),
                      onClick: onDeleteTrack,
                      danger: true,
                      dividerAbove: true,
                    },
                  ]}
                />
              </>
            ) : null}
          </div>
        </div>
        <PageMeta>
          <span>
            {entriesTotal} {entriesTotal === 1 ? 'entry' : 'entries'}
          </span>
          {track.updated_at && (
            <>
              <span aria-hidden>·</span>
              <span>Updated {formatRelativeTime(track.updated_at)}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="capitalize">
            {track.visibility}
            {publicShareEnabled ? ' · public link active' : ''}
          </span>
        </PageMeta>
        {(track.purpose || track.description) && (
          <PageMeta as="p">
            {track.purpose || track.description}
          </PageMeta>
        )}
      </header>
    </PageSection>
  );
}
