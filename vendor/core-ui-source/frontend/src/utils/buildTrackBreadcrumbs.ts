/**
 * buildTrackBreadcrumbs — TopBar trail for a Track detail page.
 *
 * Anchored tracks (project-details / financials / contracts):
 *   App › Parent Track › Project Name › Details
 *
 * When navigated from a parent entry (e.g. Project → Contact), optional
 * ``from`` inserts that parent before the current track:
 *   App › Project Name › Contacts › Contact title
 */

import type { Crumb } from '../components/ui';
import type { Track } from '../types';
import { humanizeFieldKey } from './humanizeFieldKey';

export type BreadcrumbFromParent = {
  entryId: string;
  trackId: string;
  title: string;
};

export function buildTrackBreadcrumbs(
  track: Track | null | undefined,
  opts?: {
    /** Open entry modal title — appended as the current crumb. */
    entryTitle?: string | null;
    /** Parent entry we navigated from (relation drill-in). */
    from?: BreadcrumbFromParent | null;
  }
): Crumb[] {
  if (!track) {
    return [{ label: 'Tracks', to: '/tracks' }, { label: 'Loading…' }];
  }

  const appCrumb: Crumb[] = track.app
    ? [
        {
          label: track.app.name || 'App',
          to: `/apps/${track.app.id}`,
        },
      ]
    : [];

  const entryCrumb: Crumb[] = opts?.entryTitle
    ? [{ label: opts.entryTitle, maxChars: 60 }]
    : [];

  const anchor = track.anchor_source;
  if (anchor?.entry_id && anchor.track_id) {
    const leaf =
      humanizeFieldKey(anchor.field_key) ||
      stripAnchorTitlePrefix(track.title, anchor.entry_title) ||
      track.title ||
      'Details';
    const parentTrackTitle = (anchor.track_title || '').trim() || 'Track';
    const crumbs: Crumb[] = [
      ...appCrumb,
      {
        label: parentTrackTitle,
        to: `/tracks/${anchor.track_id}`,
        maxChars: 40,
      },
      {
        label: anchor.entry_title || 'Project',
        to: `/tracks/${anchor.track_id}?entry=${encodeURIComponent(anchor.entry_id)}`,
        maxChars: 60,
      },
    ];
    if (entryCrumb.length) {
      crumbs.push({
        label: leaf,
        to: `/tracks/${track.id}`,
        maxChars: 40,
      });
      crumbs.push(...entryCrumb);
    } else {
      crumbs.push({ label: leaf, maxChars: 40 });
    }
    return crumbs;
  }

  const from = opts?.from;
  if (from?.entryId && from.trackId) {
    return [
      ...appCrumb,
      {
        label: from.title || 'Parent',
        to: `/tracks/${from.trackId}?entry=${encodeURIComponent(from.entryId)}`,
        maxChars: 60,
      },
      entryCrumb.length
        ? {
            label: track.title || 'Untitled',
            to: `/tracks/${track.id}`,
            maxChars: 40,
          }
        : { label: track.title || 'Untitled', maxChars: 60 },
      ...entryCrumb,
    ];
  }

  return [
    { label: 'Tracks', to: '/tracks' },
    ...appCrumb,
    entryCrumb.length
      ? {
          label: track.title || 'Untitled',
          to: `/tracks/${track.id}`,
          maxChars: 60,
        }
      : { label: track.title || 'Untitled', maxChars: 60 },
    ...entryCrumb,
  ];
}

/** "Project Details: Contoso" + entry_title Contoso → "Project Details". */
function stripAnchorTitlePrefix(
  trackTitle: string | undefined,
  entryTitle: string | undefined
): string {
  const title = (trackTitle || '').trim();
  const parent = (entryTitle || '').trim();
  if (!title || !parent) return '';
  const suffix = `: ${parent}`;
  if (title.endsWith(suffix)) {
    return title.slice(0, -suffix.length).trim();
  }
  return '';
}
