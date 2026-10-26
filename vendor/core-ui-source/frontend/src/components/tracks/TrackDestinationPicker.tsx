import { useMemo, useState } from 'react';
import { FolderOpen, Layers, Search } from 'lucide-react';
import { Input, Surface, Text } from '../../ui';
import { Button, LINE_ICON_STROKE } from '../ui';
import type { App } from '../../types';

const RESULT_LIMIT = 6;
export type TrackDestinationKind = 'top-level' | 'app';

interface Props {
  kind: TrackDestinationKind;
  appId: string;
  selectedAppName?: string;
  apps: App[];
  loading: boolean;
  error: boolean;
  onKindChange(kind: TrackDestinationKind): void;
  onAppChange(id: string): void;
  onRetry(): void;
}

export function TrackDestinationPicker({ kind, appId, selectedAppName, apps, loading, error, onKindChange, onAppChange, onRetry }: Props) {
  const [search, setSearch] = useState('');
  const [choosing, setChoosing] = useState(false);
  const matches = useMemo(() => {
    const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return apps.filter(app => app.lifecycle_state !== 'uninstalled' && words.every(word =>
      `${app.name} ${app.description || ''}`.toLocaleLowerCase().includes(word)))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }, [apps, search]);
  const selectedApp = apps.find(app => app.id === appId);
  const showSearch = !appId || choosing;

  return <section aria-label="Track destination" className="space-y-3">
    <Text variant="label">Add track to</Text>
    <div role="radiogroup" aria-label="Track location" className="grid grid-cols-1 gap-2"
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'top-level' : event.key === 'End' ? 'app' : kind === 'app' ? 'top-level' : 'app';
        setChoosing(false); setSearch(''); onKindChange(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-location="${next}"]`)?.focus();
      }}>
      <Button variant={kind === 'top-level' ? 'secondary' : 'outline'} role="radio" data-location="top-level" tabIndex={kind === 'top-level' ? 0 : -1} aria-checked={kind === 'top-level'}
        icon={<Layers size={16} strokeWidth={LINE_ICON_STROKE} />} className="min-h-11 justify-start"
        onClick={() => { setChoosing(false); setSearch(''); onKindChange('top-level'); }}>Top-level Tracks</Button>
      <Button variant={kind === 'app' ? 'secondary' : 'outline'} role="radio" data-location="app" tabIndex={kind === 'app' ? 0 : -1} aria-checked={kind === 'app'}
        icon={<FolderOpen size={16} strokeWidth={LINE_ICON_STROKE} />} className="min-h-11 justify-start"
        onClick={() => { setSearch(''); onKindChange('app'); }}>Inside an App</Button>
    </div>
    {kind === 'top-level' ? <Text variant="body-sm" tone="muted" as="p">Keep this track directly in your workspace.</Text> : <>
      {appId && <Surface border="subtle" radius="card" padding="sm" className="min-w-0 space-y-2">
        <div className="min-w-0"><Text variant="body-sm" tone="muted" as="p">Selected App</Text>
          <Text weight="medium" as="p" className="break-words">{selectedApp?.name || selectedAppName || 'Selected App'}</Text></div>
        <Button variant="ghost" size="sm" className="min-h-11 px-0" onClick={() => { setChoosing(!choosing); setSearch(''); }}>{choosing ? 'Done' : 'Change App'}</Button>
      </Surface>}
      {showSearch && <div className="space-y-2">
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3" />
          <Input aria-label="Find an App" placeholder="Search Apps by name or purpose…" value={search}
            onChange={event => setSearch(event.target.value)} className="pl-9" />
        </div>
        {loading ? <div role="status"><Text variant="body-sm" tone="muted">Loading Apps…</Text></div> : error ? <div role="alert" className="space-y-2">
          <Text variant="body-sm" tone="danger">Could not load Apps. Retry, or choose Top-level Tracks.</Text>
          <Button variant="outline" size="sm" onClick={onRetry}>Retry Apps</Button>
        </div> : <>
          <div role="status"><Text variant="body-sm" tone="muted" as="p">
            {matches.length > RESULT_LIMIT ? `Showing ${RESULT_LIMIT} of ${matches.length} Apps. Search to narrow the list.` : `${matches.length} ${matches.length === 1 ? 'App' : 'Apps'} found.`}
          </Text></div>
          <div role="group" aria-label="Matching Apps" className="max-h-52 space-y-1 overflow-y-auto">
            {matches.slice(0, RESULT_LIMIT).map(app => <Button key={app.id} variant="ghost" aria-label={`Select App ${app.name}`}
              className="min-h-11 w-full justify-start text-left" disabled={!!app.lifecycle_state && app.lifecycle_state !== 'active'}
              onClick={() => { onAppChange(app.id); setChoosing(false); setSearch(''); }}>
              <span className="min-w-0"><Text as="span" weight="medium" className="block break-words">{app.name}</Text>
                {app.lifecycle_state && app.lifecycle_state !== 'active' ? <Text as="span" variant="meta" tone="muted" className="block">Not available for new tracks</Text> : app.description && <Text as="span" variant="meta" tone="muted" className="block truncate">{app.description}</Text>}
              </span>
            </Button>)}
          </div>
          {!matches.length && <Text variant="body-sm" tone="muted" as="p">{search.trim() ? 'No Apps match. Try another name or purpose.' : 'There are no Apps here yet. Choose Top-level Tracks to continue.'}</Text>}
        </>}
      </div>}
    </>}
  </section>;
}
