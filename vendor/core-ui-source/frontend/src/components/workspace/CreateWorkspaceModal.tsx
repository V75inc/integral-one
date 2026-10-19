import { useDeployment } from '../../hooks/useDeployment';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Package, Plus } from 'lucide-react';
import {
  workspacesApi,
  SUGGESTED_WORKSPACE_TYPES,
  type Workspace,
  type WorkspaceProvisioningSummary,
} from '../../api/workspaces';
import { operationalModelsApi } from '../../api/operationalModels';
import {
  extractPackageMeta,
  filterAppScopedLibraryPackages,
} from '../apps/appBundleMatching';
import { summarizeLibraryManifest } from '../../lib/operationalModelManifest';
import type { OperationalModelNode } from '../../types';
import { Button, ColorPicker, LINE_ICON_STROKE, Modal } from '../ui';
import { Surface, Text } from '../../ui';
import { useToast } from '../../context/ToastContext';
import { logEvent } from '../../lib/telemetry';
import { parseTrackAccentHex } from '../../utils';

export interface CreateWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after creation feedback is dismissed. The modal closes first. */
  onCreated?: (workspace: Workspace) => void | Promise<void>;
}

/** Checkbox mirroring the Manage Apps "Available" list checkbox. */
function BundleCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-2',
        checked
          ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)] text-[var(--cta-fg)]'
          : 'border-[var(--text-muted)]',
      ].join(' ')}
    >
      {checked ? <Check size={11} strokeWidth={3} /> : null}
    </span>
  );
}

/** App-package row — same visual language as the Manage Apps "Available" list:
 *  a panel card with a leading checkbox, name, mono slug, description, and the
 *  tracks/skills/agents summary line. */
function BundleRow({
  profile,
  selected,
  onToggle,
}: {
  profile: OperationalModelNode;
  selected: boolean;
  onToggle: () => void;
}) {
  const { name, description, slug } = extractPackageMeta(profile);
  const summary = summarizeLibraryManifest(profile.manifest);
  const body = (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className="w-full text-left flex items-start gap-3 px-3 py-2.5"
    >
      <BundleCheckbox checked={selected} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="body" weight="medium" truncate>
            {name}
          </Text>
          {slug ? (
            <Text as="span" variant="meta" tone="subtle" className="font-mono">
              {slug}
            </Text>
          ) : null}
        </div>
        {description ? (
          <Text variant="meta" tone="subtle" className="mt-0.5 line-clamp-2">
            {description}
          </Text>
        ) : null}
        <Text variant="meta" tone="subtle" className="mt-1">
          {summary.prescribedTrackCount} tracks · {summary.skillCount} skills ·{' '}
          {summary.agentCount} agents
        </Text>
      </div>
    </button>
  );

  if (selected) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--brand-accent-line)] bg-[var(--brand-accent-soft)] transition-colors duration-fast">
        {body}
      </div>
    );
  }
  return (
    <Surface tone="panel-2" border="subtle" radius="card">
      {body}
    </Surface>
  );
}

export function CreateWorkspaceModal({
  open,
  onClose,
  onCreated,
}: CreateWorkspaceModalProps) {
  const { singleUser } = useDeployment();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [profiles, setProfiles] = useState<OperationalModelNode[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [workspaceType, setWorkspaceType] = useState<string>(
    SUGGESTED_WORKSPACE_TYPES[0].value,
  );
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [createdResult, setCreatedResult] = useState<(Workspace & { provisioning?: WorkspaceProvisioningSummary }) | null>(null);
  const completedId = useRef<string | null>(null);

  const createMut = useMutation({
    mutationFn: workspacesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      logEvent('workspace_created');
    },
  });

  // Load the SAME app-scope library packages the Manage Apps dialog offers, so
  // the create wizard's "Add apps" step presents an identical selection.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProfilesLoading(true);
    operationalModelsApi
      .list()
      .then(rows => {
        if (cancelled) return;
        const libs = filterAppScopedLibraryPackages(rows);
        libs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setProfiles(libs);
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setProfilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const resetForm = () => {
    setCreatedResult(null);
    setStep(1);
    setSelectedIds([]);
    setWorkspaceType(SUGGESTED_WORKSPACE_TYPES[0].value);
    setName('');
    setDesc('');
    setAccentColor(null);
    setAvatarUrl('');
  };

  useEffect(() => {
    if (open) return;
    resetForm();
  }, [open]);

  const handleClose = () => {
    if (createMut.isPending) return;
    if (createdResult) {
      void finishCreated(createdResult);
      return;
    }
    onClose();
  };

  const finishCreated = async (created: Workspace) => {
    if (completedId.current === created.id) return;
    completedId.current = created.id;
    resetForm();
    onClose();
    await onCreated?.(created);
  };

  const toggleId = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id],
    );
  };

  const goNext = () => {
    if (!name.trim()) {
      showToast('Workspace name is required', 'error');
      return;
    }
    if (accentColor && !parseTrackAccentHex(accentColor)) {
      showToast('Identity color must be a #RGB or #RRGGBB hex value', 'error');
      return;
    }
    setStep(2);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      showToast('Workspace name is required', 'error');
      setStep(1);
      return;
    }
    const resolvedAccent = accentColor
      ? parseTrackAccentHex(accentColor) || ''
      : '';
    try {
      const created = await createMut.mutateAsync({
        name: name.trim(),
        description: desc.trim() || undefined,
        workspace_type: singleUser ? 'personal' : workspaceType,
        ...(resolvedAccent ? { accent_color: resolvedAccent } : {}),
        ...(avatarUrl.trim() ? { avatar_url: avatarUrl.trim() } : {}),
        ...(selectedIds.length
          ? { library_operational_model_ids: selectedIds }
          : {}),
      });
      const prov = created.provisioning;
      if (prov) {
        const parts: string[] = [];
        if (prov.installed) {
          const dep = prov.auto_dependencies || 0;
          parts.push(
            `${prov.installed} app${prov.installed === 1 ? '' : 's'} installed` +
              (dep
                ? ` (incl. ${dep} dependenc${dep === 1 ? 'y' : 'ies'})`
                : ''),
          );
        }
        if (prov.awaiting_settings)
          parts.push(`${prov.awaiting_settings} need settings`);
        if (prov.failed) parts.push(`${prov.failed} failed`);
        showToast(
          parts.length ? `Workspace created · ${parts.join(', ')}` : 'Workspace created',
          prov.failed || prov.awaiting_settings ? 'info' : 'success',
        );
      } else {
        showToast('Workspace created', 'success');
      }
      if (prov && (prov.failed || prov.awaiting_settings)) {
        setCreatedResult(created);
      } else {
        await finishCreated(created);
      }
    } catch (e: unknown) {
      showToast(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || 'Failed to create',
        'error',
      );
    }
  };

  const stepLabel = step === 1 ? 'Step 1 of 2 · Details' : 'Step 2 of 2 · Apps';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={createdResult ? 'Workspace created' : 'New workspace'}
      titleIcon={<Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
    >
      <Modal.Body>
        {createdResult ? <div className="space-y-3">
          <Text as="p">{createdResult.name} is ready. Some Apps still need attention.</Text>
          <Text as="p" tone="subtle">{createdResult.provisioning?.installed || 0} Apps installed · {createdResult.provisioning?.failed || 0} failed · {createdResult.provisioning?.awaiting_settings || 0} need settings</Text>
          {createdResult.provisioning?.failures?.map((failure, index) => <Surface key={`${failure.library_cp_id}-${index}`} tone="panel" border="subtle" radius="card" padding="md">
            <Text as="h3" weight="medium">{failure.name} was not installed</Text>
            <Text as="p" className="mt-2">{failure.error_code === 'entitlement.required'
              ? 'Access to this App is not active for this workspace. Ask your administrator to activate it, then retry in Manage apps.'
              : 'Review this App’s requirements in Manage apps before retrying. Your workspace and any successfully installed Apps are kept.'}</Text>
            <Text as="p" variant="meta" tone="subtle" className="mt-2">Reason: {failure.error_code}</Text>
          </Surface>)}
          <Text as="p" tone="subtle">Open Apps → Manage apps in this workspace to finish settings or retry an installation. Creating another workspace is not required.</Text>
        </div> : <>
        <p className="text-xs text-[var(--text-subtle)] -mt-1 mb-1">{stepLabel}</p>

        {step === 1 ? (
          <>
            <div>
              <label
                htmlFor="ws-create-name"
                className="text-sm font-medium text-[var(--text)] block mb-1.5"
              >
                Name *
              </label>
              <input
                id="ws-create-name"
                className="app-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Inc."
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="ws-create-description"
                className="text-sm font-medium text-[var(--text)] block mb-1.5"
              >
                Description
              </label>
              <textarea
                id="ws-create-description"
                className="app-input resize-none"
                rows={2}
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>

            <div>
              <span className="text-sm font-medium text-[var(--text)] block mb-1.5">
                Workspace type
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_WORKSPACE_TYPES.filter(opt => !singleUser || opt.value === 'personal').map(opt => {
                  const checked = singleUser ? opt.value === 'personal' : workspaceType === opt.value;
                  const isDisabled = !!opt.disabled;
                  return (
                    <label
                      key={opt.value}
                      className={[
                        'flex items-start gap-3',
                        isDisabled
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer',
                        'rounded-[var(--radius-input)] border p-3',
                        'transition-colors duration-fast',
                        checked
                          ? 'border-[var(--text-muted)] bg-[var(--panel-2)]'
                          : 'border-[var(--panel-border)] bg-[var(--panel)]',
                        !isDisabled && !checked
                          ? 'hover:border-[var(--text-subtle)]'
                          : '',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="ws-create-type"
                        checked={checked}
                        disabled={isDisabled}
                        onChange={() => !isDisabled && setWorkspaceType(opt.value)}
                        className="mt-0.5 shrink-0 accent-[var(--cta-bg)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--text)]">
                          {opt.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)] leading-relaxed">
                          {opt.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel-2)]/25 p-4 space-y-2">
              <p className="text-sm font-medium text-[var(--text)]">
                Identity color
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Pick a swatch to brand this workspace, or leave the default to
                inherit the platform color.
              </p>
              <ColorPicker
                value={accentColor}
                onChange={setAccentColor}
                ariaLabel="Workspace identity color"
              />
            </div>

            <div>
              <label
                htmlFor="ws-create-avatar-url"
                className="text-sm font-medium text-[var(--text)] block mb-1.5"
              >
                Avatar URL
              </label>
              <input
                id="ws-create-avatar-url"
                type="url"
                className="app-input"
                placeholder="https://… (logo or square image)"
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-[var(--text)] block">
                Add apps to {name.trim() || 'your workspace'}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                Pick one or more app bundles to provision now — or none to start
                blank. You can add more anytime from Manage apps.
              </span>
            </div>

            <Text
              as="h3"
              variant="meta"
              weight="semibold"
              className="uppercase tracking-wide"
            >
              App bundles
            </Text>

            {profilesLoading ? (
              <Surface tone="panel-2" border="subtle" radius="card" padding="md">
                <Text variant="body-sm" tone="muted">
                  Loading app bundles…
                </Text>
              </Surface>
            ) : profiles.length === 0 ? (
              <Surface tone="panel-2" border="subtle" radius="card" padding="md">
                <Text
                  variant="body-sm"
                  tone="muted"
                  className="inline-flex items-center gap-2"
                >
                  <Package size={13} strokeWidth={LINE_ICON_STROKE} />
                  No app bundles available — this workspace will start blank.
                </Text>
              </Surface>
            ) : (
              <ul
                className="space-y-2 max-h-[22rem] overflow-y-auto pr-1"
                data-testid="ws-create-bundles"
              >
                {profiles.map(p => (
                  <li key={p.id} data-testid={`ws-create-bundle-${p.id}`}>
                    <BundleRow
                      profile={p}
                      selected={selectedIds.includes(p.id)}
                      onToggle={() => toggleId(p.id)}
                    />
                  </li>
                ))}
              </ul>
            )}

            <Text variant="meta" tone="subtle">
              {selectedIds.length === 0
                ? 'Nothing selected — workspace will start blank.'
                : `${selectedIds.length} app ${
                    selectedIds.length === 1 ? 'bundle' : 'bundles'
                  } selected.`}
            </Text>
          </div>
        )}
        </>}
      </Modal.Body>
      <Modal.Footer>
        {createdResult ? <Button variant="primary" onClick={() => void finishCreated(createdResult)}>Continue to workspace</Button> : step === 1 ? (
          <>
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={createMut.isPending}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={goNext} disabled={!name.trim()}>
              Next
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={createMut.isPending}
            >
              Back
            </Button>
            <Button
              variant="primary"
              loading={createMut.isPending}
              onClick={handleCreate}
            >
              Create workspace
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
