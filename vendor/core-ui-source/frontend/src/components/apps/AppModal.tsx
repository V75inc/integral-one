import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button, VisibilityField } from '../ui';
import type { VisibilityChoice } from '../ui';
import { Input, Textarea } from '../../ui';
import { FormDialog, StepDialog } from '../../templates';
import { appsApi, operationalModelsApi } from '../../api';
import { invalidateWorkspaceListCaches } from '../../queryKeys';
import { useToast } from '../../context/ToastContext';
import { useScope } from '../../context/ScopeContext';
import type { OperationalModelNode, App } from '../../types';
import { appPath } from '../../utils/resourcePaths';
import { OperationalModelPicker } from '../library/OperationalModelPicker';
import { AppIconPicker } from './AppIconPicker';
import { IncludeSeedDataToggle } from './IncludeSeedDataToggle';
import { countManifestSeedEntries } from '../../utils/manifestSeeds';

function normalizeAppVisibility(v: string | undefined): VisibilityChoice {
  if (!v) return 'private';
  if (v === 'team' || v === 'organization') return 'workspace';
  if (v === 'inherit') return 'private';
  if (v === 'private' || v === 'workspace' || v === 'public') return v;
  return 'private';
}

interface AppModalProps {
  open: boolean;
  onClose(): void;
  onSaved(app: App): void;
  editApp?: App | null;
  /** Skip profile picker — create a blank app with no library package. */
  mode?: 'create' | 'blank' | 'edit';
}

export function AppModal({ open, onClose, onSaved, editApp, mode }: AppModalProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { scope } = useScope();
  const isEdit = mode === 'edit' || !!editApp;
  const isBlank = mode === 'blank';

  const [name, setName] = useState(editApp?.name || '');
  const [iconLoading, setIconLoading] = useState(false);
  const [icon, setIcon] = useState(editApp?.icon || '');
  const [description, setDescription] = useState(editApp?.description || '');
  const [visibilityChoice, setVisibilityChoice] = useState<VisibilityChoice>(() =>
    isEdit ? normalizeAppVisibility(editApp?.visibility) : 'private'
  );
  const [libraryPackageId, setLibraryPackageId] = useState('');
  const [libraryPackages, setLibraryPackages] = useState<OperationalModelNode[]>([]);
  const [saving, setSaving] = useState(false);
  const [includeSeedData, setIncludeSeedData] = useState(true);

  type AppModalStep = 'details' | 'profile';
  const [step, setStep] = useState<AppModalStep>('profile');

  useEffect(() => {
    if (!open) return;
    if (!isEdit && !isBlank) {
      operationalModelsApi
        .list()
        .then(setLibraryPackages)
        .catch(() => setLibraryPackages([]));
    }
  }, [open, isEdit, isBlank]);

  useEffect(() => {
    if (open) {
      setStep(isBlank ? 'details' : 'profile');
    }
  }, [open, isBlank]);

  // Phase 33 — auto-populate Name + Description from the chosen library
  // bundle's display name + package description. Triggers ONLY when the
  // user has not yet typed into either field (so manual edits aren't
  // clobbered by switching profiles). The picker carries the human
  // display name on OperationalModelNode.name (set by library-sync from
  // package.name in the YAML); package.description still comes from the
  // manifest payload because the loader does not promote it onto the
  // CP node.
  useEffect(() => {
    if (isEdit) return;
    if (!libraryPackageId) return;
    const pkg = libraryPackages.find(p => p.id === libraryPackageId);
    if (!pkg) return;
    // Both name + description live on the OperationalModelNode (library-sync
    // copies from YAML package.name + package.description; the loader
    // strips them from manifest.package). Fall through to the manifest
    // block as a defensive backstop.
    const manifest =
      ((pkg as unknown) as { manifest?: Record<string, unknown> })?.manifest || {};
    const pkgBlock =
      ((manifest as { package?: Record<string, unknown> }).package) || {};
    const pkgDesc =
      ((pkg as unknown) as { description?: string })?.description || '';
    const defaultName = String(pkg.name || (pkgBlock as Record<string, unknown>).name || '');
    const defaultDescription = String(
      pkgDesc || (pkgBlock as Record<string, unknown>).description || '',
    );
    setName(prev => (prev.trim() ? prev : defaultName));
    setDescription(prev => (prev.trim() ? prev : defaultDescription));
  }, [isEdit, libraryPackageId, libraryPackages]);

  useEffect(() => {
    if (!open) return;
    if (editApp) {
      setName(editApp.name || '');
      setIcon(editApp.icon || '');
      setDescription(editApp.description || '');
      setVisibilityChoice(normalizeAppVisibility(editApp.visibility));
    } else {
      setName('');
      setIcon('');
      setDescription('');
      setVisibilityChoice('private');
      setLibraryPackageId('');
      setIncludeSeedData(true);
    }
  }, [open, editApp]);

  const selectedPackageSeedCount = useMemo(() => {
    if (!libraryPackageId) return 0;
    const pkg = libraryPackages.find(p => p.id === libraryPackageId);
    const manifest =
      ((pkg as unknown) as { manifest?: Record<string, unknown> })?.manifest || {};
    return countManifestSeedEntries(manifest);
  }, [libraryPackageId, libraryPackages]);

  const handleSubmit = async () => {
    if (iconLoading) return;
    if (!name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      let sp: App;
      if (isEdit && editApp) {
        sp = await appsApi.update(editApp.id, {
          name: name.trim(),
          description: description.trim(),
          icon,
          visibility: visibilityChoice,
        });
      } else {
        sp = await appsApi.create({
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
          ...(scope?.workspaceId ? { workspace_id: scope.workspaceId } : {}),
          visibility: visibilityChoice,
          ...(libraryPackageId
            ? {
                library_operational_model_id: libraryPackageId,
                include_seed_data: includeSeedData,
              }
            : {}),
        });
      }
      void invalidateWorkspaceListCaches(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['apps'] });
      onSaved(sp);
      onClose();
      showToast(
        isEdit ? 'App updated' : 'App created',
        'success',
        { label: 'View app', href: appPath(sp.id) },
      );
    } catch (e: unknown) {
      showToast(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || (isEdit ? 'Failed to update app' : 'Failed to create app'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  // Reusable Details step body (used by both edit FormDialog and create StepDialog step 2).
  const detailsBody = (
    <>
      <div>
        <label htmlFor="app-name" className="text-sm font-medium block mb-1.5">Name *</label>
        <Input
          id="app-name"
          className="w-full"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Q4 Initiatives"
          autoFocus
        />
      </div>
      <div>
        <label htmlFor="app-description" className="text-sm font-medium block mb-1.5">Description</label>
        <Textarea
          id="app-description"
          rows={2}
          noResize
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <AppIconPicker name={name} value={icon} onChange={setIcon} onProcessing={setIconLoading} />
      <div className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel-2)]/25 p-4 space-y-3">
        <label className="text-sm font-medium text-[var(--text)] block">
          Visibility
        </label>
        <VisibilityField
          value={visibilityChoice}
          onChange={setVisibilityChoice}
          workspaceAvailable={!!scope?.workspaceId}
          inheritHint=""
        />
      </div>
      {!isEdit && libraryPackageId ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel-2)]/25 p-4">
          <IncludeSeedDataToggle
            checked={includeSeedData}
            onChange={setIncludeSeedData}
            seedEntryCount={selectedPackageSeedCount}
          />
        </div>
      ) : null}
    </>
  );

  // Edit mode — single step, render via FormDialog.
  if (isEdit) {
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title="Edit app"
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        submitLoading={saving}
        submitDisabled={!name.trim() || iconLoading}
      >
        {detailsBody}
      </FormDialog>
    );
  }

  // Create mode — blank app skips profile picker.
  if (isBlank) {
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title="Create your own app"
        onSubmit={handleSubmit}
        submitLabel="Create"
        submitLoading={saving}
        submitDisabled={!name.trim() || iconLoading}
      >
        {detailsBody}
      </FormDialog>
    );
  }

  // Create mode — two steps, render via StepDialog with per-step footers.
  return (
    <StepDialog
      open={open}
      onClose={onClose}
      title={step === 'profile' ? 'New app — Choose template' : 'New app — Details'}
      steps={['Choose template', 'Details']}
      activeIndex={step === 'profile' ? 0 : 1}
    >
      {step === 'profile' ? (
        <>
          <Modal.Body noSpacing>
            <OperationalModelPicker
              value={libraryPackageId ? `library:${libraryPackageId}` : ''}
              onChange={v => setLibraryPackageId(v.startsWith('library:') ? v.slice(8) : v)}
              defaultLabel="None / Default"
              defaultDescription="Start with standard fields and views."
              libraryPackages={libraryPackages}
              scopeFilter="app"
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
              loading={saving}
              disabled={!name.trim() || iconLoading}
              onClick={handleSubmit}
            >
              Create
            </Button>
          </Modal.Footer>
        </>
      )}
    </StepDialog>
  );
}
