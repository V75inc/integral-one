/**
 * Mounts a Core view palette widget as an entry ui_contribution (native
 * alternative to the ADR-011 iframe path).
 *
 * Resolves either:
 *   - ``view`` — saved view key on the host track (``_manifest_view_key``), or
 *   - ``view_type`` + optional inline ``config`` — synthetic SavedView
 *
 * Widgets that participate in compose validate/submit register via
 * ``ContributionLifecycleContext`` (see ``editable_related_lines``).
 */

import { useMemo } from 'react';
import { Surface } from '../../ui';
import type { SavedView } from '../../types';
import { matchSavedViewByKey } from '../../features/view-designer/matchSavedView';
import { useTrackViews } from '../../hooks/useTrackViews';
import { ViewRenderer } from '../../views/registry';
import {
  ContributionLifecycleContext,
  type ContributionLifecycleApi,
} from './contributionLifecycle';

export type NativeContributionSpec = {
  view?: string;
  view_type?: string;
  config?: Record<string, unknown>;
};

type NativeContributionHostProps = {
  trackId: string;
  contribution: NativeContributionSpec;
  lifecycle: ContributionLifecycleApi;
  className?: string;
  minHeight?: number;
};

export function NativeContributionHost({
  trackId,
  contribution,
  lifecycle,
  className,
  minHeight = 240,
}: NativeContributionHostProps) {
  const needsSavedView = Boolean(contribution.view && trackId);
  const viewsQuery = useTrackViews(needsSavedView ? trackId : undefined);
  const savedViews = viewsQuery.data ?? [];
  const loading =
    needsSavedView && viewsQuery.isPending && savedViews.length === 0;
  const error =
    needsSavedView && viewsQuery.isError
      ? 'Could not load contribution view'
      : null;

  const view = useMemo<SavedView | null>(() => {
    if (contribution.view) {
      const matched = matchSavedViewByKey(savedViews, contribution.view);
      if (!matched) return null;
      if (contribution.config && Object.keys(contribution.config).length) {
        return {
          ...matched,
          config: { ...(matched.config || {}), ...contribution.config },
        };
      }
      return matched;
    }
    if (contribution.view_type) {
      return {
        id: `native-contrib-${contribution.view_type}`,
        name: contribution.view_type,
        type: contribution.view_type,
        track_id: trackId,
        config: {
          ...(contribution.config || {}),
          _manifest_view_key: contribution.view_type,
        },
      } as SavedView;
    }
    return null;
  }, [contribution, savedViews, trackId]);

  const boundView = useMemo(() => {
    if (!view) return null;
    return {
      ...view,
      config: {
        ...(view.config || {}),
        __bindings: {
          entryId: lifecycle.entryId,
          entryValues: lifecycle.customFields,
          currentUser: undefined,
          __contributionMode: lifecycle.mode,
          __contributionPlacement: lifecycle.placement,
          entry_type_key: lifecycle.entryTypeKey,
          trackId: lifecycle.trackId || trackId,
          appId: lifecycle.appId,
        },
      },
    } as SavedView;
  }, [view, lifecycle, trackId]);

  if (loading) {
    return (
      <Surface
        tone="panel-2" border="none" radius="card"
        className={className ?? 'min-h-[80px] animate-pulse'}
        style={{ minHeight: Math.min(minHeight, 120) }}
        data-testid="native-contribution-host-loading"
      />
    );
  }

  if (error) {
    return (
      <div className="text-sm text-[var(--danger)] py-2" role="alert">
        {error}
      </div>
    );
  }

  if (!boundView) {
    return null;
  }

  return (
    <ContributionLifecycleContext.Provider value={lifecycle}>
      <div className={className} style={{ minHeight }} data-testid="native-contribution-host">
        <ViewRenderer
          view={boundView}
          entries={[]}
          isLoading={false}
          onEntryOpen={() => undefined}
          isEditor={lifecycle.mode !== 'detail'}
        />
      </div>
    </ContributionLifecycleContext.Provider>
  );
}
