import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input, Surface, Text } from '../../ui';
import { Button, ViewTabs } from '../ui';
import { TemplateCatalogCard } from '../library/TemplateCatalogCard';
import type { OperationalModelPickerItem } from '../library/OperationalModelPicker';
import type { OperationalModelNode } from '../../types';
import { extractPackageMeta } from '../apps/appBundleMatching';
import { summarizeLibraryManifest } from '../../lib/operationalModelManifest';

interface Props {
  value: string;
  onChange(value: string): void;
  appSources: OperationalModelPickerItem[];
  libraryPackages: OperationalModelNode[];
  insideApp: boolean;
  loading: boolean;
  onDetails(model: OperationalModelNode): void;
  onDelete(model: OperationalModelNode): void;
  deletingIds: ReadonlySet<string>;
}

export function TrackTemplateCatalog({ value, onChange, appSources, libraryPackages, insideApp, loading, onDetails, onDelete, deletingIds }: Props) {
  const [search, setSearch] = useState('');
  const [chosenTab, setChosenTab] = useState<{ tab: 'library' | 'app'; selection: string } | null>(null);
  const selectedTab = value.startsWith('library:') ? 'library'
    : value.startsWith('manifest:') || value.startsWith('template:') ? 'app' : null;
  // A newly imported choice reveals its card; ordinary tab browsing keeps selection intact.
  const tab = insideApp
    ? ((chosenTab?.selection === value || !selectedTab ? chosenTab?.tab : selectedTab) ?? selectedTab ?? 'app')
    : 'library';
  const query = search.trim().toLocaleLowerCase();
  const library = libraryPackages.filter(profile => {
    if (summarizeLibraryManifest(profile.manifest).scopeKind !== 'track') return false;
    const meta = extractPackageMeta(profile);
    return `${meta.name} ${meta.description} ${meta.slug}`.toLocaleLowerCase().includes(query);
  });
  const appItems = [{ value: '', name: 'App defaults', description: 'Use the App’s standard fields and views.', entryTypeCount: 0, viewCount: 0 }, ...appSources]
    .filter(item => `${item.name} ${item.description || ''}`.toLocaleLowerCase().includes(query));
  const count = tab === 'app' ? appItems.length : library.length;
  const toggle = (choice: string) => onChange(value === choice ? '' : choice);
  const summary = (types: number, views: number) => `${types} ${types === 1 ? 'record type' : 'record types'} · ${views} ${views === 1 ? 'view' : 'views'}`;

  return <>
    <ViewTabs ariaLabel="Track collection" value={tab} onChange={tab => setChosenTab({ tab, selection: value })} options={[
      { value: 'library', label: 'Browse library', count: libraryPackages.length },
      ...(insideApp ? [{ value: 'app' as const, label: 'From this App', count: appSources.length + 1 }] : []),
    ]} />
    <div className="relative my-4">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3" />
      <Input aria-label="Search Tracks" placeholder="Search Tracks by name or purpose…" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" />
    </div>
    {loading ? <div role="status" className="flex items-center gap-2 py-8"><Loader2 size={16} className="animate-spin" aria-hidden="true" /><Text tone="muted">Loading Track library…</Text></div> : <>
    <Text as="p" variant="meta" tone="muted" className="mb-3">{count} {count === 1 ? 'Track template' : 'Track templates'} {tab === 'app' ? 'from this App' : 'in library'}</Text>
    <div role="region" aria-label={tab === 'app' ? 'App Track templates' : 'Browse library'}>
      {!count ? <Surface tone="panel-2" border="subtle" padding="lg" radius="card">
        <Text variant="body-sm" tone="muted">{query ? 'No Tracks match your search.' : 'No Track templates available. Create your own track to get started.'}</Text>
        {query && <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear search</Button>}
      </Surface> : <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {tab === 'app' ? appItems.map(item => <li key={item.value} className="min-w-0 flex flex-col">
          <TemplateCatalogCard name={item.name} description={item.description || 'A Track template from this App.'}
            summary={item.value ? summary(item.entryTypeCount, item.viewCount) : 'Standard setup'} selected={value === item.value} onToggle={() => toggle(item.value)} />
        </li>) : library.map(profile => {
          const meta = extractPackageMeta(profile);
          const counts = summarizeLibraryManifest(profile.manifest);
          return <li key={profile.id} className="min-w-0 flex flex-col">
            <TemplateCatalogCard name={meta.name} description={meta.description || 'A Track template for your workspace.'}
              summary={summary(counts.entryTypeCount, counts.viewCount)} selected={value === `library:${profile.id}`}
              onToggle={() => toggle(`library:${profile.id}`)} onDetails={() => onDetails(profile)}
              onDelete={profile.workspace_id && profile.can_delete !== false ? () => onDelete(profile) : undefined}
              deleting={deletingIds.has(profile.id)} />
          </li>;
        })}
      </ul>}
    </div>
    </>}
  </>;
}
