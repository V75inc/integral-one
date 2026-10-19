import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PinnedSidebarEntry } from './pinnedSidebarEntries';

const STORAGE_PREFIX = 'integral:pinned-sidebar-collapsed:';

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

function readCollapsed(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

/** App ids for pinned apps / app-groups that have nested pinned tracks. */
export function getCollapsiblePinnedAppIds(
  entries: PinnedSidebarEntry[]
): string[] {
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'app' && entry.tracks.length > 0) {
      ids.push(entry.app.id);
    } else if (entry.kind === 'app-group' && entry.tracks.length > 0) {
      ids.push(entry.appId);
    }
  }
  return ids;
}

export function usePinnedSidebarCollapse(
  workspaceId: string,
  collapsibleIds: string[]
) {
  const key = storageKey(workspaceId);
  const allowedKey = useMemo(
    () => collapsibleIds.slice().sort().join('\0'),
    [collapsibleIds]
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    workspaceId === '__none__' ? new Set() : readCollapsed(key)
  );

  // Reload when workspace changes.
  useEffect(() => {
    if (workspaceId === '__none__') {
      setCollapsed(new Set());
      return;
    }
    setCollapsed(readCollapsed(storageKey(workspaceId)));
  }, [workspaceId]);

  // Drop stale app ids when pins change.
  useEffect(() => {
    const allowed = new Set(collapsibleIds);
    setCollapsed(prev => {
      const next = new Set([...prev].filter(id => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [allowedKey, collapsibleIds]);

  useEffect(() => {
    if (workspaceId === '__none__') return;
    localStorage.setItem(storageKey(workspaceId), JSON.stringify([...collapsed]));
  }, [collapsed, workspaceId]);

  const toggle = useCallback((appId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }, []);

  const expand = useCallback((appId: string) => {
    setCollapsed(prev => {
      if (!prev.has(appId)) return prev;
      const next = new Set(prev);
      next.delete(appId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const collapseAll = useCallback(() => {
    setCollapsed(new Set(collapsibleIds));
  }, [collapsibleIds]);

  const isExpanded = useCallback(
    (appId: string) => !collapsed.has(appId),
    [collapsed]
  );

  const allCollapsed = useMemo(
    () =>
      collapsibleIds.length > 0 &&
      collapsibleIds.every(id => collapsed.has(id)),
    [collapsibleIds, collapsed]
  );

  return {
    isExpanded,
    toggle,
    expand,
    expandAll,
    collapseAll,
    allCollapsed,
    showBulkControls: collapsibleIds.length >= 2,
  };
}
