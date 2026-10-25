import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button, VisibilityField, LINE_ICON_STROKE } from '../ui';
import { Plus, Upload } from 'lucide-react';
import type { VisibilityChoice } from '../ui';
import { Input, Textarea, Surface, Text } from '../../ui';
import { ImportPackageModal } from '../library/ImportPackageModal';
import { filterWorkspaceVisibleLibraryPackages } from '../apps/appBundleMatching';
import { getManifestScopeKind } from '../../lib/operationalModelManifest';
import { FormDialog, StepDialog } from '../../templates';
import {
  tracksApi,
  appsApi,
  operationalModelsApi,
} from '../../api';
import { invalidateWorkspaceListCaches } from '../../queryKeys';
import type { CreateTrackBody } from '../../api/tracks';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useScope } from '../../context/ScopeContext';
import type { OperationalModelNode, App, Track } from '../../types';
import {
  manifestAppTracks,
} from '../../utils';
import { AppPackageDetails } from '../apps/AppPackageDetails';
import { TrackDestinationPicker, type TrackDestinationKind } from './TrackDestinationPicker';
import { TrackTemplateCatalog } from './TrackTemplateCatalog';
import type { OperationalModelPickerItem } from '../library/OperationalModelPicker';
import { summarizeLibraryManifest } from '../../lib/operationalModelManifest';
import { trackPath } from '../../utils/resourcePaths';
import { useMatchesMedia } from '../../hooks/useMediaQuery';

function normalizeTrackVisibility(v: string | undefined): VisibilityChoice {
  if (!v) return 'private';
  if (v === 'team' || v === 'organization') return 'workspace';
  if (v === 'inherit') return 'inherit';
  if (v === 'private' || v === 'workspace' || v === 'public') return v;
  return 'private';
}

interface TrackModalProps {
  open: boolean;
  onClose(): void;
  onCreated(track: Track): void | Promise<void>;
  editTrack?: Track | null;
  /** When creating from an App, locks placement to that App. */
  appId?: string;
}

export function TrackModal({
  open,
  onClose,
  onCreated,
  editTrack,
  appId,
}: TrackModalProps) {
  const { showToast } = useToast();
  const compact = useMatchesMedia('(max-width: 639px)');
  const confirm = useConfirm();
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const { scope } = useScope();
  const isEdit = !!editTrack;
  const [title, setTitle] = useState(editTrack?.title || '');
  const [purpose, setPurpose] = useState(
    editTrack?.purpose || editTrack?.description || ''
  );
  const [visibilityChoice, setVisibilityChoice] = useState<VisibilityChoice>(() =>
    isEdit ? normalizeTrackVisibility(editTrack?.visibility) : 'private'
  );
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const [appDetail, setAppDetail] = useState<App | null>(null);
  const [appCp, setAppCp] = useState<OperationalModelNode | null>(null);
  const [templates, setTemplates] = useState<OperationalModelNode[]>([]);
  const [libraryPackages, setLibraryPackages] = useState<OperationalModelNode[]>([]);
  const [operationalModelChoice, setOperationalModelChoice] = useState('');
  const [chosenParentAppId, setChosenParentAppId] = useState(appId || '');
  const [importOpen, setImportOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailProfile = libraryPackages.find(profile => profile.id === detailId);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [parentAppOptions, setParentAppOptions] = useState<App[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState(false);
  const [appsRevision, setAppsRevision] = useState(0);
  const [destinationKind, setDestinationKind] = useState<TrackDestinationKind>(appId ? 'app' : 'top-level');
  const destinationAppId = appId || chosenParentAppId;
  const needsAppSelection = destinationKind === 'app' && !destinationAppId;

  type TrackModalStep = 'details' | 'profile';
  const [step, setStep] = useState<TrackModalStep>('profile');

  const manifestTracks = useMemo(
    () => manifestAppTracks(appCp?.manifest),
    [appCp?.manifest]
  );

  const appSources = useMemo((): OperationalModelPickerItem[] => {
    const items: OperationalModelPickerItem[] = [];
    for (const mt of manifestTracks) {
      items.push({
        value: `manifest:${mt.key}`,
        name: mt.name,
        description: mt.description || `Use this App's setup for ${mt.name}.`,
        entryTypeCount: mt.entryTypeCount,
        viewCount: mt.viewCount,
        source: 'app',
      });
    }
    for (const tpl of templates) {
      const manifest = (tpl.manifest ?? {}) as Record<string, unknown>;
      const { entryTypeCount, viewCount } = summarizeLibraryManifest(manifest);
      items.push({
        value: `template:${tpl.id}`,
        name: tpl.name || 'Untitled template',
        description: tpl.description?.trim().slice(0, 140) || 'App-defined track template.',
        entryTypeCount,
        viewCount,
        source: 'app',
      });
    }
    return items;
  }, [manifestTracks, templates]);

  useEffect(() => {
    if (open) {
      setStep('profile');
      setImportOpen(false);
      setDetailId(null);
      setOperationalModelChoice('');
      setChosenParentAppId(appId || '');
      setDestinationKind(appId ? 'app' : 'top-level');
      if (!isEdit) { setTitle(''); setPurpose(''); }
    }
  }, [open, isEdit, appId, scope?.workspaceId]);

  useEffect(() => {
    if (!open || isEdit) {
      setAppDetail(null);
      setAppCp(null);
      setTemplates([]);
      setLibraryPackages([]);
      setOperationalModelChoice('');
      return;
    }
    let cancelled = false;
    setLibraryLoading(true);
    setLibraryError(null);
    const pApp = destinationAppId
      ? appsApi.get(destinationAppId).catch(() => null)
      : Promise.resolve(null);
    const pCp = destinationAppId
      ? appsApi.getOperationalModel(destinationAppId).catch(() => null)
      : Promise.resolve(null);
    const pTpl = destinationAppId
      ? appsApi.listTrackTemplates(destinationAppId).catch(() => [])
      : Promise.resolve([]);
    const pLib = operationalModelsApi.list().catch(() => {
      if (!cancelled) setLibraryError('Could not load templates. Retry or choose Create your own track.');
      return [];
    });
    Promise.all([pApp, pCp, pTpl, pLib]).then(([sp, cp, tpls, packs]) => {
      if (cancelled) return;
      setAppDetail(sp);
      setAppCp(cp);
      setTemplates(Array.isArray(tpls) ? tpls : []);
      setLibraryPackages(filterWorkspaceVisibleLibraryPackages(Array.isArray(packs) ? packs : [], scope?.workspaceId)
        .filter(model => model.library_package !== false && getManifestScopeKind(model.manifest ?? {}) === 'track'));
      setLibraryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, destinationAppId, scope?.workspaceId, libraryRevision]);

  useEffect(() => {
    if (!open || isEdit) return;
    if (destinationAppId && manifestTracks.length > 0) {
      // A late library response must not replace an explicit custom/import choice.
      setOperationalModelChoice(current => current || `manifest:${manifestTracks[0].key}`);
    }
  }, [open, isEdit, destinationAppId, manifestTracks]);

  useEffect(() => {
    if (!open || isEdit || appId) return;
    let cancelled = false;
    setAppsLoading(true);
    setAppsError(false);
    appsApi.list().then(list => {
      if (!cancelled) setParentAppOptions(Array.isArray(list) ? list.filter(app => app.lifecycle_state !== 'uninstalled') : []);
    }).catch(() => {
      if (!cancelled) { setAppsError(true); setParentAppOptions([]); }
    }).finally(() => { if (!cancelled) setAppsLoading(false); });
    return () => { cancelled = true; };
  }, [open, isEdit, appId, scope?.workspaceId, appsRevision]);

  useEffect(() => {
    if (open && !isEdit) {
      setVisibilityChoice('private');
    }
  }, [open, isEdit]);

  useEffect(() => {
    if (editTrack) {
      setTitle(editTrack.title || '');
      setPurpose(editTrack.purpose || editTrack.description || '');
      setVisibilityChoice(normalizeTrackVisibility(editTrack.visibility));
    }
  }, [editTrack]);

  const selectedLibraryModel = libraryPackages.find(model => operationalModelChoice === `library:${model.id}`);
  const selectedAppSource = appSources.find(source => source.value === operationalModelChoice);
  const selectedName = selectedLibraryModel?.name || selectedAppSource?.name || (operationalModelChoice === 'blank' ? 'Custom track' : destinationAppId ? 'App defaults' : 'Choose a template');
  const selectedCounts = selectedLibraryModel
    ? summarizeLibraryManifest(selectedLibraryModel.manifest ?? {}) : null;

  const needsStartingPoint = !destinationAppId && !operationalModelChoice;

  const waitingForTemplates = libraryLoading && operationalModelChoice !== 'blank';

  const createOwnTrack = () => {
    if (needsAppSelection) return;
    if (operationalModelChoice !== 'blank') { setTitle(''); setPurpose(''); }
    setOperationalModelChoice('blank');
    setDetailId(null);
    setStep('details');
  };

  const continueToDetails = () => {
    if (needsAppSelection || needsStartingPoint || waitingForTemplates) return;
    if (operationalModelChoice && operationalModelChoice !== 'blank' && !title.trim()) setTitle(selectedName);
    if (operationalModelChoice && operationalModelChoice !== 'blank' && !purpose.trim()) {
      setPurpose(selectedLibraryModel?.description || selectedAppSource?.description || '');
    }
    setStep('details');
  };

  const continueAction = <Button variant="primary" className="min-h-11 w-full"
    disabled={waitingForTemplates || needsAppSelection || needsStartingPoint} onClick={continueToDetails}>Continue</Button>;

  const inheritHint = 'This existing Track uses legacy inherited visibility. It is preserved until you choose Private, Workspace, or Public.';

  const applyOperationalModelToBody = (body: CreateTrackBody) => {
    const c = operationalModelChoice;
    if (c.startsWith('manifest:')) {
      body.app_track_type_key = c.slice('manifest:'.length);
    } else if (c.startsWith('template:')) {
      body.app_track_template_operational_model_id = c.slice('template:'.length);
    } else if (c.startsWith('library:')) {
      body.library_operational_model_id = c.slice('library:'.length);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      showToast('Title required', 'error');
      return;
    }
    setLoading(true);
    try {
      let t: Track;
      if (isEdit && editTrack) {
        t = await tracksApi.update(editTrack.id, {
          title: title.trim(),
          purpose: purpose.trim(),
          ...(visibilityChoice !== 'inherit' ? { visibility: visibilityChoice } : {}),
        });
      } else {
        const effectiveAppId = destinationAppId;
        const body: CreateTrackBody = {
          title: title.trim(),
          purpose: purpose.trim(),
          ...(scope?.workspaceId ? { workspace_id: scope.workspaceId } : {}),
          ...(effectiveAppId ? { app_id: effectiveAppId } : {}),
        };
        applyOperationalModelToBody(body);
        body.visibility = visibilityChoice === 'inherit' ? 'private' : visibilityChoice;
        t = await tracksApi.create(body);
      }
      void invalidateWorkspaceListCaches(queryClient);
      await onCreated(t);
      onClose();
      setTitle('');
      setPurpose('');
      setVisibilityChoice('private');
      setOperationalModelChoice('');
      setChosenParentAppId('');
      showToast(
        isEdit ? 'Track updated!' : 'Track created!',
        'success',
        { label: 'View track', href: trackPath(t.id) },
      );
    } catch (e: unknown) {
      showToast(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Failed to save track',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const deleteLibraryModel = async (model: OperationalModelNode) => {
    if (!await confirm({
      title: 'Delete Track template?',
      message: `Delete “${model.name}” and its saved configuration? Existing Tracks and their data are kept. This cannot be undone.`,
      confirmLabel: 'Delete template', variant: 'danger',
    })) return;
    setDeletingModels(previous => new Set(previous).add(model.id));
    try {
      await operationalModelsApi.delete(model.id);
      setLibraryPackages(previous => previous.filter(item => item.id !== model.id));
      setOperationalModelChoice(previous => previous === `library:${model.id}` ? '' : previous);
      showToast('Template deleted.', 'success');
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string | { message?: string } } }; message?: string });
      const reason = detail.response?.data?.detail;
      showToast((typeof reason === 'string' ? reason : reason?.message) || detail.message || 'Failed to delete template.', 'error');
    } finally {
      setDeletingModels(previous => { const next = new Set(previous); next.delete(model.id); return next; });
    }
  };

  const detailsBody = (
    <>
      <div>
        <label htmlFor="track-name" className="text-sm font-medium text-[var(--text)] mb-1.5 block">
          Track Name *
        </label>
        <Input
          id="track-name"
          className="w-full"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Product Roadmap, Team Updates..."
          autoFocus
        />
      </div>
      <div>
        <label htmlFor="track-purpose" className="text-sm font-medium text-[var(--text)] mb-1.5 block">
          Purpose / Description
        </label>
        <Textarea
          id="track-purpose"
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
          placeholder="What is this track for?"
          rows={3}
          noResize
        />
      </div>
      {!isEdit && <Text variant="body-sm" tone="muted" as="p">
        Add to: {destinationAppId ? (parentAppOptions.find(app => app.id === destinationAppId)?.name || appDetail?.name || 'Selected App') : 'Top-level Tracks'}
      </Text>}

      <div className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel-2)]/25 p-4 space-y-3">
        <label className="text-sm font-medium text-[var(--text)] block">Visibility</label>
        <VisibilityField
          value={visibilityChoice}
          onChange={setVisibilityChoice}
          workspaceAvailable={!!scope?.workspaceId}
          inheritHint={inheritHint}
        />
      </div>
    </>
  );

  // Edit mode — single step via FormDialog.
  if (isEdit) {
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title="Edit Track"
        onSubmit={handleSubmit}
        submitLabel="Save Changes"
        submitLoading={loading}
        submitDisabled={!title.trim()}
      >
        {detailsBody}
      </FormDialog>
    );
  }

  // The destination determines the available App-provided and library templates.
  return <>
    <StepDialog
      open={open}
      onClose={() => { if (!loading) onClose(); }}
      title="Manage Tracks"
      size={step === 'profile' ? 'wide' : 'form'}
      steps={['Choose a starting point', 'Track details']}
      activeIndex={step === 'profile' ? 0 : 1}
    >
      {step === 'profile' ? <>
        <Modal.Body noPadding noSpacing>
          <div className="grid min-w-0 sm:h-[min(65dvh,42rem)] sm:grid-cols-[minmax(0,1fr)_19rem]">
            <section aria-label="Track library" className="order-2 min-w-0 px-5 pb-5 sm:order-1 sm:overflow-y-auto sm:px-6">
              {needsAppSelection && <Text variant="body-sm" tone="muted" as="p">Choose an App in Your selection to see its available track templates.</Text>}
              {detailProfile ? <>
                <AppPackageDetails profile={detailProfile} kind="track" onBack={() => setDetailId(null)} />
                <Button variant="primary" onClick={() => { setOperationalModelChoice(`library:${detailProfile.id}`); setDetailId(null); }}>Use template</Button>
              </> : !needsAppSelection && <>
              <div className="flex flex-wrap items-center gap-2 py-3">
                {scope?.workspaceId && <Button variant="outline" size="sm"
                  icon={<Upload size={16} strokeWidth={LINE_ICON_STROKE} />}
                  onClick={() => setImportOpen(true)}>Import template</Button>}
              </div>
              {libraryError && <div role="alert" className="space-y-2">
                <Text variant="body-sm" tone="danger">{libraryError}</Text>
                <Button variant="outline" size="sm" onClick={() => setLibraryRevision(value => value + 1)}>Retry library</Button>
              </div>}
              <TrackTemplateCatalog key={destinationAppId || 'workspace'}
                value={operationalModelChoice}
                onChange={setOperationalModelChoice}
                insideApp={Boolean(destinationAppId)}
                loading={libraryLoading}
                appSources={appSources}
                libraryPackages={libraryPackages}
                onDetails={model => setDetailId(model.id)}
                onDelete={model => void deleteLibraryModel(model)}
                deletingIds={deletingModels}
              />
              </>}
            </section>
            {<Surface as="aside" tone="panel-2" padding="lg" radius="none"
              className="order-1 flex min-w-0 flex-col border-b border-[var(--panel-border)] sm:order-2 sm:overflow-hidden sm:border-b-0 sm:border-l"
              aria-label="Track starting point">
              <div className="min-h-0 space-y-5 sm:flex-1 sm:overflow-y-auto">
              <Text as="h3" variant="heading-sm" weight="semibold" className="hidden sm:block">Your selection</Text>
              {appId ? <section aria-label="Track destination" className="space-y-3">
                <Text variant="label">Add track to</Text>
                <Surface border="subtle" radius="card" padding="sm">
                  <Text weight="medium" as="p" className="break-words">{appDetail?.name || 'Current App'}</Text>
                </Surface>
              </section> : <TrackDestinationPicker kind={destinationKind} appId={destinationAppId} selectedAppName={appDetail?.name}
                apps={parentAppOptions} loading={appsLoading} error={appsError} onRetry={() => setAppsRevision(value => value + 1)}
                onKindChange={kind => {
                  if (kind === destinationKind) return;
                  setDestinationKind(kind); setChosenParentAppId(''); setOperationalModelChoice('');
                  setAppCp(null); setAppDetail(null); setTemplates([]); setImportOpen(false); setDetailId(null);
                }} onAppChange={value => {
                  if (value === destinationAppId) return;
                  setChosenParentAppId(value); setOperationalModelChoice(''); setAppCp(null);
                  setAppDetail(null); setTemplates([]); setImportOpen(false); setDetailId(null);
                }} />}
              <div className="hidden border-t border-[var(--panel-border)] pt-4 sm:block">
                <Text variant="label">Starting point</Text>
                <Text variant="body" weight="medium" as="p" className="mt-3">{needsAppSelection ? 'Choose an App' : selectedName}</Text>
              </div>
              {selectedCounts && <Text variant="body-sm" tone="muted" as="p" className="hidden sm:block">
                {selectedCounts.entryTypeCount} {selectedCounts.entryTypeCount === 1 ? 'record type' : 'record types'} · {selectedCounts.viewCount} {selectedCounts.viewCount === 1 ? 'view' : 'views'}
              </Text>}
              </div>
              {!compact && <div className="mt-4 shrink-0 border-t border-[var(--panel-border)] pt-4">
                {continueAction}
                <Text variant="meta" tone="subtle" as="p" className="mt-2">{needsStartingPoint ? 'Choose a template, or create your own track.' : 'Name and review your track before creating it.'}</Text>
              </div>}
            </Surface>}
          </div>
        </Modal.Body>
        <Modal.Footer align="between">
          <Button variant="secondary" className="min-h-11" disabled={needsAppSelection}
            icon={<Plus size={16} strokeWidth={LINE_ICON_STROKE} />}
            onClick={createOwnTrack}>Create your own track</Button>
          {compact && <div className="min-w-0">{continueAction}</div>}
        </Modal.Footer>
      </> : <>
        <Modal.Body>
          {<Text variant="body-sm" tone="muted" as="p">Starting point: {selectedName}</Text>}
          {detailsBody}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="ghost" disabled={loading} onClick={() => setStep('profile')}>Back</Button>
          <Button variant="primary" loading={loading} disabled={!title.trim()} onClick={handleSubmit}>Create track</Button>
        </Modal.Footer>
      </>}
    </StepDialog>
    {scope?.workspaceId && <ImportPackageModal key={scope.workspaceId}
      open={open && importOpen} workspaceId={scope.workspaceId} expectedScope="track"
      onClose={() => setImportOpen(false)}
      onSuccess={result => {
        const model = result.operational_model;
        if (model && getManifestScopeKind(model.manifest ?? {}) === 'track') {
          setLibraryPackages(previous => [...previous.filter(item => item.id !== model.id), model]);
          setOperationalModelChoice(`library:${model.id}`);
        }
        setImportOpen(false);
        setLibraryRevision(value => value + 1);
        showToast('Template imported. Review the track details before creating it.', 'success');
      }} />}
  </>;
}
