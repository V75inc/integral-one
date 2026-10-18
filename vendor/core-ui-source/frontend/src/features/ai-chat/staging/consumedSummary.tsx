import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { StagedChange } from './types';
import { appPath, entryPath, trackPath } from '../../../utils/resourcePaths';
import {
  peekLastActiveChatThreadId,
  requestOpenCompanionChat,
} from '../chatHandoff';
import { stashEntryUndoToken } from './entryUndoStash';

/** A resource created by a consumed change, with enough to render a nav link. */
export interface CreatedRef {
  kind: 'app' | 'track' | 'entry';
  id: string;
  title?: string | null;
  trackId?: string | null;
}

export interface ConsumedNav {
  title?: string | null;
  entryId?: string | null;
  trackId?: string | null;
  appId?: string | null;
  /**
   * Every resource created by this change, in order. Populated for BATCH
   * changes (create app + tracks + entries in one approval) so each gets its
   * own quick-nav link — a single batched approval was previously summarised
   * as a linkless "Done" (June 29 QA #3: newly-created apps had no shortcut).
   * For a single-op change this holds the one created resource.
   */
  created?: CreatedRef[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stagedOp(staged: StagedChange): string {
  const diff = asRecord(staged.diff_machine);
  return String(diff?.op || staged.kind || '');
}

/** Straight + typographic double quotes used in staged summaries. */
const QUOTED = "[“”‘’\"]";

/**
 * Unwrap API envelopes such as ``{ track: { id, title, … } }`` or nested
 * ``{ entry: { entry: { … } } }`` (file_content executor).
 */
function unwrapApiResource(
  result: Record<string, unknown>,
  key: 'entry' | 'track' | 'app',
): Record<string, unknown> | null {
  const node = asRecord(result[key]);
  if (!node || node.error) return null;
  const inner = asRecord(node[key]);
  if (inner?.id) return inner;
  if (node.id) return node;
  return null;
}

/**
 * Derive the CreatedRef for one executor result (an app/track/entry create).
 * ``op`` is the op that produced it (the staged op, or a batch sub-op kind).
 * Returns null for results that didn't create a navigable resource.
 */
function createdRefFromResult(
  result: Record<string, unknown> | null,
  op: string,
  diff: Record<string, unknown> | null,
): CreatedRef | null {
  if (!result || result.error || result.filed === false) return null;

  const entry = unwrapApiResource(result, 'entry');
  if (entry) {
    return {
      kind: 'entry',
      id: (entry.id as string) || '',
      title: (entry.title as string) || null,
      trackId: (entry.track_id as string) || (diff?.track_id as string) || null,
    };
  }

  const track = unwrapApiResource(result, 'track');
  if (track) {
    return {
      kind: 'track',
      id: (track.id as string) || '',
      title: (track.title as string) || null,
    };
  }

  const app = unwrapApiResource(result, 'app');
  if (app) {
    return {
      kind: 'app',
      id: (app.id as string) || '',
      title: (app.name as string) || (app.title as string) || null,
    };
  }

  if (result.id) {
    const trackId = (result.track_id as string) || null;
    const typeId = result.type_id;
    const isEntry =
      op === 'create_entry' ||
      op === 'file_content' ||
      op === 'update_entry' ||
      Boolean(trackId || typeId);
    if (isEntry) {
      return {
        kind: 'entry',
        id: result.id as string,
        title: (result.title as string) || null,
        trackId: trackId || (diff?.track_id as string) || null,
      };
    }
    if (op === 'create_track' || op === 'update_track') {
      return {
        kind: 'track',
        id: result.id as string,
        title: (result.title as string) || null,
      };
    }
    if (op === 'create_app') {
      return {
        kind: 'app',
        id: result.id as string,
        title: (result.name as string) || (result.title as string) || null,
      };
    }
  }
  return null;
}

/** Pull navigation ids from bless / fallback execute payloads. */
export function extractConsumedNav(
  executeResult: unknown,
  staged: StagedChange,
): ConsumedNav {
  const diff = asRecord(staged.diff_machine);
  const op = stagedOp(staged);
  const result = asRecord(executeResult);

  // Batch approval: the executor returns ``{ batched, results: [{kind, result}] }``.
  // Collect a CreatedRef per created resource so each gets its own link.
  const subResults = result && Array.isArray(result.results) ? result.results : null;
  if (subResults) {
    const created: CreatedRef[] = [];
    for (const raw of subResults) {
      const sub = asRecord(raw);
      if (!sub) continue;
      const subKind = String(sub.kind || '');
      const ref = createdRefFromResult(asRecord(sub.result), subKind, diff);
      if (ref && ref.id) created.push(ref);
    }
    const firstApp = created.find(r => r.kind === 'app');
    const firstTrack = created.find(r => r.kind === 'track');
    const firstEntry = created.find(r => r.kind === 'entry');
    return {
      created,
      appId: firstApp?.id ?? null,
      trackId: firstTrack?.trackId ?? firstEntry?.trackId ?? firstTrack?.id ?? null,
      entryId: firstEntry?.id ?? null,
      title:
        firstApp?.title ?? firstTrack?.title ?? firstEntry?.title ?? null,
    };
  }

  const ref = createdRefFromResult(result, op, diff);
  if (ref) {
    return {
      title: ref.title ?? null,
      created: ref.id ? [ref] : undefined,
      appId: ref.kind === 'app' ? ref.id : null,
      trackId:
        ref.kind === 'track' ? ref.id : ref.kind === 'entry' ? ref.trackId ?? null : null,
      entryId: ref.kind === 'entry' ? ref.id : null,
    };
  }

  return {
    entryId: (diff?.entry_id as string) || null,
    trackId: (diff?.track_id as string) || null,
  };
}

function linkClassName() {
  return 'font-semibold underline-offset-2 hover:underline';
}

/**
 * Created-resource link that hands chat off to the companion when leaving
 * ``/agent``, so Undo stays reachable on the same thread.
 */
function CreatedNavLink({
  to,
  children,
  stagingToken,
  entryId,
}: {
  to: string;
  children: ReactNode;
  stagingToken?: string | null;
  entryId?: string | null;
}) {
  return (
    <Link
      to={
        entryId && stagingToken
          ? `${to}${to.includes('?') ? '&' : '?'}undo=${encodeURIComponent(stagingToken)}`
          : to
      }
      className={linkClassName()}
      onClick={() => {
        if (entryId && stagingToken) stashEntryUndoToken(entryId, stagingToken);
        requestOpenCompanionChat({
          threadId: peekLastActiveChatThreadId(),
        });
      }}
    >
      {children}
    </Link>
  );
}

function entryLinkNode(
  label: string,
  entryId?: string | null,
  trackId?: string | null,
  stagingToken?: string | null,
): ReactNode {
  if (entryId && trackId) {
    return (
      <CreatedNavLink
        to={entryPath(entryId, trackId)}
        stagingToken={stagingToken}
        entryId={entryId}
      >
        {label}
      </CreatedNavLink>
    );
  }
  return <strong>{label}</strong>;
}

function trackLinkNode(
  label: string,
  trackId?: string | null,
  stagingToken?: string | null,
): ReactNode {
  if (trackId) {
    return (
      <CreatedNavLink to={trackPath(trackId)} stagingToken={stagingToken}>
        {label}
      </CreatedNavLink>
    );
  }
  return <strong>{label}</strong>;
}

function appLinkNode(
  label: string,
  appId?: string | null,
  stagingToken?: string | null,
): ReactNode {
  if (appId) {
    return (
      <CreatedNavLink to={appPath(appId)} stagingToken={stagingToken}>
        {label}
      </CreatedNavLink>
    );
  }
  return <strong>{label}</strong>;
}

function createdRefLinkNode(
  ref: CreatedRef,
  index: number,
  stagingToken?: string | null,
): ReactNode {
  const label = ref.title?.trim() || ref.kind;
  const node =
    ref.kind === 'app'
      ? appLinkNode(label, ref.id, stagingToken)
      : ref.kind === 'track'
        ? trackLinkNode(label, ref.id, stagingToken)
        : entryLinkNode(label, ref.id, ref.trackId, stagingToken);
  return <span key={`${ref.kind}-${ref.id}-${index}`}>{node}</span>;
}

/** Join React nodes with commas + a trailing "and" (Oxford-free). */
function joinNodes(nodes: ReactNode[]): ReactNode {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  const out: ReactNode[] = [];
  nodes.forEach((n, i) => {
    if (i > 0) out.push(i === nodes.length - 1 ? ' and ' : ', ');
    out.push(n);
  });
  return <>{out}</>;
}

/**
 * Human confirmation line for a consumed staged change, with links when ids
 * are available.
 */
export function describeConsumed(
  staged: StagedChange,
  nav: ConsumedNav,
): ReactNode {
  const summary = staged.summary || '';
  const title = nav.title?.trim();
  const token = staged.token;

  // Batch (or any change) that created navigable resources: link every one so
  // the user can jump straight to the new app / tracks / entries.
  const created = (nav.created || []).filter(r => r.id);
  if (created.length > 1) {
    return (
      <>
        Created{' '}
        {joinNodes(created.map((ref, i) => createdRefLinkNode(ref, i, token)))}.
      </>
    );
  }

  // File content as "Title" in TrackName
  const fileContentMatch = summary.match(
    new RegExp(`^File content as ${QUOTED}(.+?)${QUOTED} in (.+?)(?:\\s*\\(.+\\))?$`),
  );
  if (fileContentMatch) {
    return (
      <>
        Filed{' '}
        {entryLinkNode(fileContentMatch[1], nav.entryId, nav.trackId, token)} in{' '}
        {trackLinkNode(fileContentMatch[2], nav.trackId, token)}.
      </>
    );
  }

  // Create entry "Title" in TrackName
  const createEntryMatch = summary.match(
    new RegExp(`^Create entry ${QUOTED}(.+?)${QUOTED} in (.+?)(?:\\s*\\(.+\\))?$`),
  );
  if (createEntryMatch) {
    return (
      <>
        Created{' '}
        {entryLinkNode(createEntryMatch[1], nav.entryId, nav.trackId, token)} in{' '}
        {trackLinkNode(createEntryMatch[2], nav.trackId, token)}.
      </>
    );
  }

  // Create track "Title"
  const createTrackMatch = summary.match(
    new RegExp(`^Create track ${QUOTED}(.+?)${QUOTED}$`),
  );
  if (createTrackMatch) {
    return (
      <>
        Created {trackLinkNode(createTrackMatch[1], nav.trackId, token)}.
      </>
    );
  }

  // Create app "Title"
  const createAppMatch = summary.match(
    new RegExp(`^Create app ${QUOTED}(.+?)${QUOTED}$`),
  );
  if (createAppMatch) {
    return (
      <>
        Created {appLinkNode(createAppMatch[1], nav.appId, token)}.
      </>
    );
  }

  // Single created resource with no matching summary phrasing — link it by kind.
  if (created.length === 1) {
    const ref = created[0];
    const label = ref.title?.trim() || title || ref.kind;
    if (ref.kind === 'app') return <>Created {appLinkNode(label, ref.id, token)}.</>;
    if (ref.kind === 'track') return <>Created {trackLinkNode(label, ref.id, token)}.</>;
    return <>Created {entryLinkNode(label, ref.id, ref.trackId, token)}.</>;
  }

  if (title) {
    const op = stagedOp(staged);
    if (op === 'create_app') {
      return <>Created {appLinkNode(title, nav.appId, token)}.</>;
    }
    if (op === 'create_track') {
      return <>Created {trackLinkNode(title, nav.trackId, token)}.</>;
    }
    if (op === 'update_track') {
      return <>Updated {trackLinkNode(title, nav.trackId, token)}.</>;
    }
    if (op === 'create_entry' || op === 'file_content') {
      return <>Created {entryLinkNode(title, nav.entryId, nav.trackId, token)}.</>;
    }
    if (op === 'update_entry') {
      return <>Updated {entryLinkNode(title, nav.entryId, nav.trackId, token)}.</>;
    }
    if (nav.entryId && nav.trackId) {
      return <>Updated {entryLinkNode(title, nav.entryId, nav.trackId, token)}.</>;
    }
    if (nav.trackId) {
      return <>Updated {trackLinkNode(title, nav.trackId, token)}.</>;
    }
    return <>Updated {entryLinkNode(title, nav.entryId, nav.trackId, token)}.</>;
  }

  if (summary) return <>Done — {summary}.</>;
  return <>Done.</>;
}
