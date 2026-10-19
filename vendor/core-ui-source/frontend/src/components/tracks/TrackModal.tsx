import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { AppSelect, Button, VisibilityField } from '../ui';
import type { VisibilityChoice } from '../ui';
import { Input, Textarea } from '../../ui';
import { FormDialog, StepDialog } from '../../templates';
import {
  tracksApi,
  appsApi,
  operationalModelsApi,
} from '../../api';
import { invalidateWorkspaceListCaches } from '../../queryKeys';
import type { CreateTrackBody } from '../../api/tracks';
import { useToast } from '../../context/ToastContext';
import { useScope } from '../../context/ScopeContext';
import type { OperationalModelNode, App, Track } from '../../types';
import {
  manifestAppTracks,
} from '../../utils';
import { OperationalModelPicker } from '../library/OperationalModelPicker';
import type { OperationalModelPickerItem } from '../library/OperationalModelPicker';
import { summarizeLibraryManifest } from '../../lib/operationalModelManifest';
import { trackPath } from '../../utils/resourcePaths';

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
  /** When creating from an App, enables operational model choices on create. */
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
  const [chosenParentAppId, setChosenParentAppId] = useState('');
  const [parentAppOptions, setParentAppOptions] = useState<App[]>([]);

  type TrackModalStep = 'details' | 'profile';
  const [step, setStep] = useState<TrackModalStep>('profile');

  const manifestTracks = useMemo(
    () => manifestAppTracks(appCp?.manifest),
    [appCp?.manifest]
  );

  const showLibraryRow = useMemo(() => {
    if (!appId) return true;
    if (appDetail?.library_merge_source_id) return false;
    if (manifestTracks.length > 0) return false;
    return true;
  }, [appId, appDetail?.library_merge_source_id, manifestTracks.length]);

  const appSources = useMemo((): OperationalModelPickerItem[] => {
    const items: OperationalModelPickerItem[] = [];
    for (const mt of manifestTracks) {
      items.push({
        value: `manifest:${mt.key}`,
        name: mt.name,
        description: `Track type "${mt.key}" from this App's Operational Model.`,
        entryTypeCount: 0,
        viewCount: 0,
        source: 'app',
      });
    }
    for (const tpl of templates) {
      const manifest = (tpl.manifest ?? {}) as Record<string, unknown>;
      const { entryTypeCount, viewCount } = summarizeLibraryManifest(manifest);
      items.push({
        value: `template:${tpl.id}`,
        name: tpl.name || 'Untitled model',
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
    }
  }, [open]);

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
    const pApp = appId
      ? appsApi.get(appId).catch(() => null)
      : Promise.resolve(null);
    const pCp = appId
      ? appsApi.getOperationalModel(appId).catch(() => null)
      : Promise.resolve(null);
    const pTpl = appId
      ? appsApi.listTrackTemplates(appId).catch(() => [])
      : Promise.resolve([]);
    const pLib = operationalModelsApi.list().catch(() => []);
    Promise.all([pApp, pCp, pTpl, pLib]).then(([sp, cp, tpls, packs]) => {
      if (cancelled) return;
      setAppDetail(sp);
      setAppCp(cp);
      setTemplates(Array.isArray(tpls) ? tpls : []);
      setLibraryPackages(Array.isArray(packs) ? packs : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, appId]);

  useEffect(() => {
    if (!open || isEdit) return;
    if (appId && manifestTracks.length > 0) {
      setOperationalModelChoice(`manifest:${manifestTracks[0].key}`);
    } else {
      setOperationalModelChoice('');
    }
  }, [open, isEdit, appId, manifestTracks]);

  useEffect(() => {
    if (!open || isEdit || appId) {
      setParentAppOptions([]);
      setChosenParentAppId('');
      return;
    }
    let cancelled = false;
    appsApi
      .list()
      .then(list => {
        if (!cancelled) setParentAppOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setParentAppOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, appId, scope?.workspaceId]);

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
        const effectiveAppId = appId || chosenParentAppId || '';
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
      {!isEdit && !appId && parentAppOptions.length > 0 ? (
        <div>
          <label
            htmlFor="track-parent-app"
            className="text-sm font-medium text-[var(--text)] mb-1.5 block"
          >
            Parent App <span className="text-[var(--text-subtle)] font-normal">(optional)</span>
          </label>
          <AppSelect
            value={chosenParentAppId}
            onValueChange={v => setChosenParentAppId(v)}
            options={[
              { value: '', label: 'Standalone (no parent App)' },
              ...parentAppOptions.map(a => ({
                value: a.id,
                label: a.name?.trim() || 'Untitled app',
              })),
            ]}
            aria-label="Parent App"
            className="app-input"
          />
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            Tracks under an App inherit its collaborators and content
            profile. Leave standalone to manage access directly on the
            track.
          </p>
        </div>
      ) : null}
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

  // Create mode — two steps via StepDialog with per-step footers.
  return (
    <StepDialog
      open={open}
      onClose={onClose}
      title={step === 'profile' ? 'New Track — Choose operational model' : 'New Track — Details'}
      steps={['Choose operational model', 'Details']}
      activeIndex={step === 'profile' ? 0 : 1}
    >
      {step === 'profile' ? (
        <>
          <Modal.Body noSpacing>
            <OperationalModelPicker
              value={operationalModelChoice}
              onChange={setOperationalModelChoice}
              defaultLabel="None / Default"
              defaultDescription={
                appId
                  ? 'Use the App baseline only—no extra operational model applied.'
                  : 'Built-in base operational model. No library Operational Model merged on create.'
              }
              appSources={appSources}
              libraryPackages={showLibraryRow ? libraryPackages : []}
              scopeFilter="track"
            />
          </Modal.Body>
          <Modal.Footer align="between">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setStep('details')}>
              Next →
            </Button>
          </Modal.Footer>
        </>
      ) : (
        <>
          <Modal.Body>{detailsBody}</Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onClick={() => setStep('profile')}>
              ← Back
            </Button>
            <Button
              variant="primary"
              loading={loading}
              disabled={!title.trim()}
              onClick={handleSubmit}
            >
              Create Track
            </Button>
          </Modal.Footer>
        </>
      )}
    </StepDialog>
  );
}
