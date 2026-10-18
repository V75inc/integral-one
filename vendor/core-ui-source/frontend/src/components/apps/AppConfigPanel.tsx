import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Unlink,
  GitMerge,
  Boxes
} from 'lucide-react';
import {
  operationalModelsApi
  } from '../../api';
import { Button, LINE_ICON_STROKE } from '../ui';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import type { OperationalModelNode } from '../../types';

interface AppConfigPanelProps {
  appId: string;
  canEdit: boolean;
}

export function AppConfigPanel({ appId, canEdit }: AppConfigPanelProps) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [cp, setCp] = useState<OperationalModelNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLibraryProvenance, setHasLibraryProvenance] = useState(false);
  const [libraryName, setLibraryName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await operationalModelsApi.getAttachedForApp(appId);
      setCp(profile);

      // Check library provenance
      const manifest = profile?.manifest as Record<string, unknown> | undefined;
      const pkg = manifest?.package as Record<string, unknown> | undefined;
      if (pkg?.source_library_name) {
        setLibraryName(String(pkg.source_library_name));
        setHasLibraryProvenance(true);
      } else {
        setHasLibraryProvenance(false);
        setLibraryName(null);
      }
    } catch {
      showToast('Failed to load app configuration', 'error');
    } finally {
      setLoading(false);
    }
  }, [appId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMergeLibrary = async () => {
    if (!cp) return;
    // Open the Operational Models library page for selection
    // This is a simple prompt-based flow for now
    const libId = window.prompt('Enter the library Operational Model ID to apply:');
    if (!libId) return;
    try {
      await operationalModelsApi.mergeLibraryIntoApp(appId, libId);
      load();
      showToast('Operational Model applied to App', 'success');
    } catch {
      showToast('Failed to apply Operational Model', 'error');
    }
  };

  const handleDetachLibrary = async () => {
    const ok = await confirm({
      title: 'Detach Operational Model',
      message: 'Remove the link to this library Operational Model? Prescribed tracks and their content remain, but upstream updates will stop.',
      confirmLabel: 'Detach',
      variant: 'default'
    });
    if (!ok) return;
    // Note: app detach is not yet a dedicated endpoint; for now, this is a placeholder
    showToast('App library detach is not yet implemented', 'error');
  };

  const handleDeriveToLibrary = async () => {
    const ok = await confirm({
      title: 'Publish to library',
      message: 'Create a new library Operational Model from this App\'s current configuration?',
      confirmLabel: 'Publish',
      variant: 'default'
    });
    if (!ok) return;
    try {
      const result = await operationalModelsApi.deriveFromApp(appId);
      showToast(`Profile "${result.operational_model?.name || 'Untitled'}" published to library`, 'success');
    } catch {
      showToast('Failed to publish operational model', 'error');
    }
  };

  // Extract prescribed tracks from the manifest
  const manifest = cp?.manifest as Record<string, unknown> | undefined;
  const appTier = manifest?.app as Record<string, unknown> | undefined;
  const prescribedTracks = (appTier?.tracks || []) as Array<Record<string, unknown>>;

  if (loading) {
    return (
      <div className="app-card p-4 text-sm text-[var(--text-muted)] animate-pulse">
        Loading configuration…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Profile provenance banner */}
      {hasLibraryProvenance && (
        <div className="app-card p-4 border-l-4 border-l-[var(--link)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Package size={16} strokeWidth={LINE_ICON_STROKE} className="text-[var(--link)] shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text)]">
                  Applied from: <span className="text-[var(--link)]">{libraryName || 'Library operational model'}</span>
                </p>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  Prescribed tracks and cross-track relations are defined by this profile.
                </p>
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleDetachLibrary}
                className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded border border-[var(--panel-border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors shrink-0"
                title="Detach library provenance"
              >
                <Unlink size={10} /> Detach
              </button>
            )}
          </div>
        </div>
      )}

      {/* Prescribed Tracks */}
      <div className="app-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-2 mb-3">
          <Boxes size={12} strokeWidth={LINE_ICON_STROKE} />
          Prescribed track types
        </h3>
        {prescribedTracks.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No prescribed track types defined.</p>
        ) : (
          <ul className="space-y-2">
            {prescribedTracks.map((track, i) => (
              <li key={`${String(track.key || track.name || '')}-${i}`} className="text-sm text-[var(--text)] flex items-center gap-2">
                <span className="capitalize">{String(track.name || track.key || `Track ${i + 1}`)}</span>
                {track.provision_on_create ? (
                  <span className="text-[12px] px-1.5 py-0.5 rounded bg-[var(--panel-2)] text-[var(--text-muted)]">auto-provisioned</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="app-card p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-2">
          <GitMerge size={12} strokeWidth={LINE_ICON_STROKE} />
          Operational model actions
        </h3>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleMergeLibrary}>
              <GitMerge size={12} /> Merge library Operational Model
            </Button>
            <Button size="sm" variant="outline" onClick={handleDeriveToLibrary}>
              <Package size={12} /> Publish to library
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}