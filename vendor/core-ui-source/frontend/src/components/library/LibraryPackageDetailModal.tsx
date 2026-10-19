/**
 * Phase 8 — LibraryPackageDetailModal
 *
 * Displays details for a library operational model package: name, version, scope,
 * description, entry types (with field counts), views (with type labels), and tags.
 * Provides a destructive "Delete package" action with confirmation.
 *
 * Opened from LibrarySection when a user clicks a package row.
 */
import { useState } from 'react';

import { operationalModelsApi } from '../../api/operationalModels';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import type { OperationalModelNode } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Pill } from '../ui/Pill';
import { Text } from '../../ui';

interface Props {
  open: boolean;
  profile: OperationalModelNode | null;
  onClose: () => void;
  onDeleted: () => void;
}

function scopeLabel(scope?: string): string {
  if (scope === 'platform') return 'Platform';
  if (scope === 'organization') return 'Organization';
  if (scope === 'community') return 'Community';
  return scope ?? '—';
}

function scopeColorClass(scope?: string): string {
  if (scope === 'organization') {
    return 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)] border-[var(--brand-accent-line)]';
  }
  return 'bg-[var(--badge-muted-bg)] text-[var(--text-subtle)] border-[var(--panel-border)]';
}

function extractEntryTypes(
  manifest: Record<string, unknown>
): Array<{ name: string; fieldCount: number }> {
  const track = manifest.track as Record<string, unknown> | undefined;
  const ets = Array.isArray(track?.entry_types) ? track.entry_types : [];
  return (ets as unknown[]).map(et => {
    if (!et || typeof et !== 'object') return { name: '—', fieldCount: 0 };
    const e = et as Record<string, unknown>;
    const fields = Array.isArray(e.fields) ? e.fields : [];
    const name =
      typeof e.name === 'string' ? e.name :
      typeof e.key === 'string' ? e.key : '—';
    return { name, fieldCount: fields.length };
  });
}

function extractViews(
  manifest: Record<string, unknown>
): Array<{ name: string; type: string }> {
  const track = manifest.track as Record<string, unknown> | undefined;
  const vs = Array.isArray(track?.views) ? track.views : [];
  return (vs as unknown[]).map(v => {
    if (!v || typeof v !== 'object') return { name: '—', type: '—' };
    const view = v as Record<string, unknown>;
    const name =
      typeof view.name === 'string' ? view.name :
      typeof view.key === 'string' ? view.key : '—';
    const type =
      typeof view.view_type === 'string' ? view.view_type :
      typeof view.type === 'string' ? view.type : '—';
    return { name, type };
  });
}

export function LibraryPackageDetailModal({ open, profile, onClose, onDeleted }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  if (!profile) return null;

  const manifest = (profile.manifest ?? {}) as Record<string, unknown>;
  const pkg = (manifest.package ?? {}) as Record<string, unknown>;

  const name = profile.name || (typeof pkg.name === 'string' ? pkg.name : undefined) || 'Untitled model';
  const description =
    profile.description ||
    (typeof pkg.description === 'string' ? pkg.description : undefined);
  const tags = Array.isArray(pkg.tags)
    ? (pkg.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  const entryTypes = extractEntryTypes(manifest);
  const views = extractViews(manifest);

  async function handleDelete() {
    // `profile` is nullable on the props; the delete control is only rendered
    // when it is set, but the compiler cannot see that from here.
    if (!profile) return;
    const ok = await confirm({
      title: 'Delete operational model',
      message: `Remove "${name}" from the library? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      await operationalModelsApi.delete(profile.id);
      toast.showToast('Profile deleted.', 'success');
      onDeleted();
      onClose();
    } catch {
      toast.showToast('Failed to delete profile.', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={name} variant="compact">
      <Modal.Body noSpacing className="flex flex-col gap-5">

        {/* Version + scope badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {profile.version && (
            <span className="font-mono text-[11px] bg-[var(--panel)] border border-[var(--panel-border)] px-1.5 py-0.5 rounded-[var(--radius-pill)] text-[var(--text-muted)]">
              v{profile.version}
            </span>
          )}
          <span className={`text-[12px] px-2 py-0.5 rounded-full border font-medium ${scopeColorClass(profile.scope)}`}>
            {scopeLabel(profile.scope)}
          </span>
        </div>

        {/* Description */}
        {description && (
          <Text variant="body" tone="muted" as="p">{description}</Text>
        )}

        {/* Entry types */}
        {entryTypes.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)] mb-2">
              Entry types
            </h4>
            <ul className="flex flex-col gap-1">
              {entryTypes.map((et, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text)]">{et.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{et.fieldCount} fields</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Views */}
        {views.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)] mb-2">
              Views
            </h4>
            <ul className="flex flex-col gap-1">
              {views.map((v, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text)]">{v.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{v.type}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)] mb-2">
              Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <Pill key={t} variant="neutral" tone="descriptive">{t}</Pill>
              ))}
            </div>
          </div>
        )}

      </Modal.Body>
      <Modal.Footer align="between">
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          loading={isDeleting}
          disabled={isDeleting}
        >
          Delete operational model
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={isDeleting}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
