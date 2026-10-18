import { EntryCard } from '../entries/EntryCard';
import { EmptyState, IconWell, CardSkeleton } from '../ui';
import { LINE_ICON_STROKE } from '../ui';
import { Sparkles } from 'lucide-react';
import type { ViewWidgetProps } from './types';

function FeedWidgetInner({
  entries,
  isLoading,
  onEntryOpen,
  onEntryDelete,
  onEntryEdit,
  fetchMore,
  hasNextPage,
  emptyState,
  track,
  publicPermissions,
  publicToken
}: ViewWidgetProps) {
  if (isLoading && entries.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    // Public visitors may have no compose affordance at all (create_entries
    // off) — telling them to "create your first entry above" points at
    // nothing. Keep the call-to-action for members / creators only.
    const isPublicVisitor = !!publicPermissions;
    const canPublicCreate = !!publicPermissions?.create_entries;
    return emptyState || (
      <div className="app-card">
        <EmptyState
          icon={
            <IconWell size="lg" aria-hidden>
              <Sparkles size={22} strokeWidth={LINE_ICON_STROKE} />
            </IconWell>
          }
          title="No entries yet"
          description={
            isPublicVisitor && !canPublicCreate
              ? 'Nothing has been shared here yet — check back later.'
              : 'Create your first entry above to get started.'
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {entries.map(entry => (
          <div key={entry.id} className="cv-auto">
            <EntryCard
              entry={entry}
              showTrackChip={false}
              track={track}
              onOpen={onEntryOpen}
              onDelete={onEntryDelete}
              onEdit={onEntryEdit}
              publicMode={!!publicPermissions}
              hideComments={
                publicPermissions ? !publicPermissions.read_comments : false
              }
              publicToken={publicToken}
              publicPermissions={publicPermissions}
            />
          </div>
        ))}
      </div>

      {hasNextPage && fetchMore && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={fetchMore}
            className="text-sm text-[var(--link)] hover:text-[var(--link-hover)]"
          >
            Load more entries
          </button>
        </div>
      )}
    </>
  );
}

export const FeedWidget = FeedWidgetInner;
