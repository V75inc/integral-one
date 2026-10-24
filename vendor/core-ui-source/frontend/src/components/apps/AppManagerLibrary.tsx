/** Searchable App library and an explicit, non-destructive installation review. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { Input, Surface, Text, Textarea } from '../../ui';
import { Button, ViewTabs } from '../ui';
import { Modal } from '../ui/Modal';
import type { App, OperationalModelNode } from '../../types';
import { extractPackageMeta, isPackageInstalled } from './appBundleMatching';
import { summarizeLibraryManifest } from '../../lib/operationalModelManifest';
import { AppPackageDetails } from './AppPackageDetails';
import { TemplateCatalogCard } from '../library/TemplateCatalogCard';
import { IncludeSeedDataToggle } from './IncludeSeedDataToggle';

export interface SelectedInstallRow {
  library_cp_id: string;
  name: string;
  description: string;
  default_name: string;
  default_description: string;
}

interface Props {
  initialDetailId?: string;
  libraryActions?: ReactNode;
  profiles: OperationalModelNode[];
  apps: App[];
  installedApps: App[];
  selected: ReadonlyMap<string, SelectedInstallRow>;
  loading: boolean;
  submitting: boolean;
  error?: ReactNode;
  includeSeedData: boolean;
  seedEntryCount: number;
  deletingPackages: ReadonlySet<string>;
  workspaceName: string;
  onToggle(profile: OperationalModelNode): void;
  onUpdate(id: string, patch: Partial<SelectedInstallRow>): void;
  onDelete(profile: OperationalModelNode): void;
  onSeedDataChange(value: boolean): void;
  onInstall(): void;
  onClose(): void;
  onRetry(): void;
  onCreateBlankApp?: () => void;
  renderInstalled(app: App): ReactNode;
}

export function AppManagerLibrary(props: Props) {
  const { profiles, apps, installedApps, selected, loading, submitting } = props;
  const [detailId, setDetailId] = useState(props.initialDetailId);
  const detail = profiles.find(profile => profile.id === detailId);
  const [tab, setTab] = useState<'browse' | 'installed'>('browse');
  const [search, setSearch] = useState('');
  const [mobileReview, setMobileReview] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const heading = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const query = search.trim().toLocaleLowerCase();
  const rows = Array.from(selected.values());
  const visibleProfiles = profiles.filter(profile => {
    const meta = extractPackageMeta(profile);
    return `${meta.name} ${meta.description} ${meta.slug}`.toLocaleLowerCase().includes(query);
  });
  const visibleInstalled = installedApps.filter(app =>
    `${app.name} ${app.description || ''} ${app.source_operational_model_slug || ''}`.toLocaleLowerCase().includes(query));
  const count = tab === 'browse' ? visibleProfiles.length : visibleInstalled.length;

  useEffect(() => {
    if (reviewing) heading.current?.focus();
  }, [reviewing]);
  useEffect(() => {
    if (mobileReview) heading.current?.focus();
  }, [mobileReview]);
  useEffect(() => {
    if (!selected.size) setReviewing(false);
  }, [selected.size]);

  const returnToSelection = () => { setReviewing(false); heading.current?.focus(); };
  const selectTab = (next: 'browse' | 'installed') => { setTab(next); };
  const toggle = (profile: OperationalModelNode) => { setReviewing(false); props.onToggle(profile); };

  return <>
    <Modal.Body noPadding noSpacing>
      <div data-testid="app-manager-dialog" className="flex flex-col">
        {props.error && <div className="px-5 pt-4 sm:px-6">{props.error}<Button variant="ghost" size="sm" onClick={props.onRetry} disabled={submitting}>Retry library</Button></div>}
        <div className="grid min-h-[calc(100dvh-var(--system-bar-h,0px)-8.5rem)] sm:min-h-0 sm:h-[min(65dvh,42rem)] sm:grid-cols-[minmax(0,1fr)_19rem]">
          <section aria-label="App library" className={`${mobileReview ? 'hidden sm:block' : ''} min-w-0 px-5 pb-5 sm:overflow-y-auto sm:px-6`}>
            {detail ? <>
              <AppPackageDetails profile={detail} onBack={() => setDetailId(undefined)} />
              <div className="flex flex-wrap gap-2 pb-5">
                <Button variant="primary" disabled={submitting || isPackageInstalled(detail, apps)} onClick={() => toggle(detail)}>{isPackageInstalled(detail, apps) ? 'Installed' : selected.has(detail.id) ? 'Remove from selection' : 'Add to selection'}</Button>
                {detail.workspace_id && detail.can_delete !== false && <Button variant="ghost" aria-label={`Delete ${extractPackageMeta(detail).name} template`} disabled={submitting || props.deletingPackages.has(detail.id)} title="Delete template" className="h-11 w-11 p-0" onClick={() => props.onDelete(detail)}><Trash2 size={16} strokeWidth={1.5} aria-hidden="true" /></Button>}
              </div>
            </> : <>
            {props.libraryActions}
            <ViewTabs ariaLabel="App collection" value={tab} onChange={selectTab} options={[
              { value: 'browse', label: 'Browse library', count: profiles.length },
              { value: 'installed', label: 'Installed', count: installedApps.length },
            ]} />
            <div className="relative my-4">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-3" />
              <Input aria-label="Search Apps" placeholder="Search Apps by name or purpose…" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" />
            </div>
            {loading ? <div role="status" data-testid="app-manager-loading" className="flex items-center gap-2 py-8"><Loader2 size={16} className="animate-spin" /><Text tone="muted">Loading App library…</Text></div> : <>
              <Text as="p" variant="meta" tone="muted" className="mb-3">{count} {count === 1 ? 'App' : 'Apps'} {tab === 'browse' ? 'in library' : `installed in ${props.workspaceName}`}</Text>
              <div id={panelId} role="region" aria-label={tab === 'browse' ? 'Browse library' : 'Installed Apps'}>
                {count === 0 ? <Surface tone="panel-2" border="subtle" padding="lg" radius="card">
                  <Text tone="muted" variant="body-sm">{query ? 'No Apps match your search.' : tab === 'installed' ? 'No Apps in this workspace yet.' : 'No app packages available.'}</Text>
                  {query && <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear search</Button>}
                </Surface> : tab === 'installed' ? <ul className="space-y-3" data-testid="app-manager-installed">{visibleInstalled.map(app => <li key={app.id}>{props.renderInstalled(app)}</li>)}</ul>
                  : <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="app-manager-available">
                    {visibleProfiles.map(profile => <li key={profile.id} className="min-w-0 flex flex-col gap-1">
                      <CatalogCard profile={profile} installed={isPackageInstalled(profile, apps)} selected={selected.has(profile.id)} disabled={submitting} onToggle={() => toggle(profile)} onDetails={() => setDetailId(profile.id)}
                        onDelete={profile.workspace_id && profile.can_delete !== false ? () => props.onDelete(profile) : undefined}
                        deleting={props.deletingPackages.has(profile.id)} />
                    </li>)}
                  </ul>}
              </div>
            </>}
            </>}
          </section>
          <Surface as="aside" tone="panel-2" padding="lg" radius="none" className={`${mobileReview ? 'flex' : 'hidden sm:flex'} min-w-0 flex-col border-l border-[var(--panel-border)] sm:overflow-y-auto`} aria-label="Installation selection">
            <div ref={heading} tabIndex={-1}><Text as="h3" variant="heading-sm" weight="semibold">{tab === 'installed' ? 'Installed Apps' : reviewing ? 'Review installation' : 'Your selection'}{tab === 'browse' && rows.length ? ` (${rows.length})` : ''}</Text></div>
            <Text as="p" variant="body-sm" tone="muted" className="mb-5 mt-2">{tab === 'installed' ? 'Open an App or manage its installation.' : reviewing ? `Add these Apps to ${props.workspaceName}.` : 'Choose Apps, then review before installing.'}</Text>
            {tab === 'installed' ? <Text as="p" variant="body-sm" tone="muted">{installedApps.length} {installedApps.length === 1 ? 'App installed' : 'Apps installed'} in {props.workspaceName}.</Text> : <>
            {!rows.length ? <div className="rounded-lg border border-dashed border-[var(--panel-border)] p-5 text-center">
              <Package size={24} className="mx-auto mb-3" aria-hidden />
              <Text as="p" variant="body-sm" weight="medium">No Apps selected</Text><Text as="p" variant="meta" tone="muted" className="mt-1">Choose Add on any App to build your selection.</Text>
            </div> : <ul className="divide-y divide-[var(--panel-border)]">
              {rows.map(row => <li key={row.library_cp_id} className="py-3 first:pt-0">
                <div className="flex items-center justify-between gap-2"><Text as="p" variant="body-sm" weight="medium" className="break-words min-w-0">{row.name || row.default_name}</Text>
                  {!reviewing && <Button variant="ghost" size="sm" className="min-h-11 min-w-11 shrink-0" aria-label={`Remove ${row.default_name} from selection`} onClick={() => { const profile = profiles.find(p => p.id === row.library_cp_id); if (profile) toggle(profile); }} disabled={submitting}><X size={16} /></Button>}
                </div>
                {reviewing && <Text as="p" variant="meta" tone="muted" className="mt-1">{row.description || 'No description'}</Text>}
                <>
                  <Button variant="ghost" size="xs" className="min-h-11 px-0" aria-expanded={editing === row.library_cp_id} onClick={() => setEditing(editing === row.library_cp_id ? null : row.library_cp_id)} disabled={submitting}>Customize details</Button>
                  {editing === row.library_cp_id && <div className="space-y-3 pb-2">
                    <label className="block"><Text as="span" variant="meta" tone="muted">App name</Text><Input autoFocus aria-label={`App name for ${row.default_name}`} value={row.name} onChange={event => props.onUpdate(row.library_cp_id, { name: event.target.value })} disabled={submitting} /></label>
                    <label className="block"><Text as="span" variant="meta" tone="muted">Description</Text><Textarea aria-label={`App description for ${row.default_name}`} rows={3} value={row.description} onChange={event => props.onUpdate(row.library_cp_id, { description: event.target.value })} disabled={submitting} /></label>
                  </div>}
                </>
              </li>)}
            </ul>}
            {rows.length > 0 && props.seedEntryCount > 0 && <div className="mt-5"><IncludeSeedDataToggle checked={props.includeSeedData} onChange={props.onSeedDataChange} seedEntryCount={props.seedEntryCount} disabled={submitting} /></div>}
            <div className="mt-auto pt-6">
              {reviewing ? <>
                <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => { returnToSelection(); setMobileReview(false); }} disabled={submitting} className="mb-3 hidden sm:inline-flex">Back to selection</Button>
                <Button variant="primary" icon={<Package size={16} />} loading={submitting} disabled={!rows.length || submitting || rows.some(row => !row.name.trim())} onClick={props.onInstall} className="w-full min-h-11" data-testid="app-manager-apply">{submitting ? 'Installing…' : `Install selected (${rows.length})`}</Button>
              </> : <Button variant="primary" icon={<ArrowRight size={16} />} disabled={!rows.length || loading || submitting || rows.some(row => !row.name.trim())} onClick={() => setReviewing(true)} className="w-full min-h-11" data-testid="app-manager-review">Review installation</Button>}
              <Text as="p" variant="meta" tone="subtle" className="mt-2">{reviewing ? 'Confirm to install these Apps in this workspace.' : 'Your workspace changes only after you confirm.'}</Text>
            </div>
            </>}
          </Surface>
        </div>
      </div>
    </Modal.Body>
    <Modal.Footer align="between">
      <div className="flex items-center gap-3">
        {props.onCreateBlankApp && !reviewing ? <Button variant="secondary" icon={<Plus size={16} />} className="min-h-11" onClick={props.onCreateBlankApp} disabled={submitting} data-testid="app-manager-blank-app">Create your own app</Button> : <Button variant="outline" onClick={props.onClose} disabled={submitting}>{reviewing ? 'Cancel' : 'Done'}</Button>}
      </div>
      {tab === 'browse' && <Text variant="meta" tone="muted" className="hidden sm:block">{rows.length ? `${rows.length} ${rows.length === 1 ? 'App' : 'Apps'} selected` : 'Nothing selected'}</Text>}
      {tab === 'browse' && <Button variant="outline" className="sm:hidden" disabled={submitting || (!mobileReview && !rows.length)} onClick={() => { setReviewing(!mobileReview); setMobileReview(!mobileReview); }}>{mobileReview ? 'Back to library' : `Review (${rows.length})`}</Button>}
    </Modal.Footer>
  </>;
}

function CatalogCard({ profile, installed, selected, disabled, onToggle, onDetails, onDelete, deleting }: {
  profile: OperationalModelNode; installed: boolean; selected: boolean; disabled: boolean;
  onDetails(): void; onToggle(): void; onDelete?: () => void; deleting?: boolean;
}) {
  const { name, description, slug } = extractPackageMeta(profile);
  const summary = summarizeLibraryManifest(profile.manifest);
  return <div data-testid={`app-manager-row-${slug || profile.id}`} className="min-w-0 flex-1">
    <TemplateCatalogCard name={name} description={description || 'An App template for your workspace.'}
      summary={`${summary.prescribedTrackCount} ${summary.prescribedTrackCount === 1 ? 'track' : 'tracks'}`}
      selected={selected} installed={installed} disabled={disabled} deleting={deleting}
      onToggle={onToggle} onDetails={onDetails} onDelete={onDelete} />
  </div>;
}
