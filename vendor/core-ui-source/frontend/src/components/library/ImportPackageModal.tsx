/**
 * Import a OperationalModel manifest from a .yaml / .json file, or a .zip
 * archive containing one or more operational-model.yaml bundles, into the workspace
 * library.
 *
 * Step 1 — Pick: file input; pressing "Preview" calls importPreview().
 * Step 2 — Review: shows per-package info + validation errors; "Publish"
 *           calls importPublish().
 * Step 3 — Done: success confirmation, then close.
 *
 * Migrated to the FormDialog template (Phase 6, see
 * `.planning/ui-templating/MIGRATION_LOG.md`). Each step renders the
 * same FormDialog with step-specific `actions` for the footer override.
 */
import { useEffect, useRef, useState } from 'react';

import { Button } from '../ui/Button';
import { Text } from '../../ui';
import { FormDialog } from '../../templates';
import { useToast } from '../../context/ToastContext';
import { operationalModelsApi } from '../../api/operationalModels';
import type { ImportPreviewResponse } from '../../api/operationalModels';

type Step = 'pick' | 'review' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  workspaceId: string;
}

export function ImportPackageModal({ open, onClose, onSuccess, workspaceId }: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedCount, setPublishedCount] = useState(0);

  useEffect(() => {
    if (open) {
      setStep('pick');
      setFile(null);
      setPreview(null);
      setIsPreviewing(false);
      setIsPublishing(false);
      setPublishedCount(0);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!file) {
      toast.showToast('Select a file first', 'error');
      return;
    }
    setIsPreviewing(true);
    try {
      const result = await operationalModelsApi.importPreview(file, workspaceId);
      setPreview(result);
      setStep('review');
    } catch (err) {
      toast.showToast(
        err instanceof Error ? err.message : 'Preview failed',
        'error',
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePublish = async () => {
    if (!file) return;
    setIsPublishing(true);
    try {
      const data = await operationalModelsApi.importPublish(file, workspaceId);
      const count = data.published ?? 1;
      setPublishedCount(count);
      setStep('done');
      onSuccess();
    } catch (err) {
      toast.showToast(
        err instanceof Error ? err.message : 'Import failed',
        'error',
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const hasAnyErrors =
    (preview?.packages ?? []).some(p => p.validation_errors.length > 0);
  const packageCount = preview?.packages.length ?? 0;

  if (step === 'pick') {
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title="Import operational model"
        onConfirm={handlePreview}
        submitLabel="Preview"
        submitDisabled={!file}
        submitLoading={isPreviewing}
      >
        <Text variant="body" tone="muted" as="p">
          Upload a <code>.yaml</code> or <code>.json</code> profile, or a{' '}
          <code>.zip</code> archive containing one or more{' '}
          <code>operational-model.yaml</code> bundles.
        </Text>
        <div className="flex flex-col gap-2">
          <Text variant="label" tone="subtle">Manifest file</Text>
          <input
            ref={fileRef}
            type="file"
            accept=".yaml,.json,.zip"
            onChange={handleFileChange}
            className="
              block w-full text-sm
              file:mr-3 file:cursor-pointer file:rounded-[var(--radius-pill)]
              file:border file:border-[var(--panel-border)]
              file:bg-[var(--panel-2)] file:px-3 file:py-1
              file:text-xs file:text-[var(--text-muted)]
              file:transition-colors file:duration-fast
              file:hover:bg-[var(--panel)]
            "
          />
          {file && (
            <Text variant="body-sm" tone="muted" as="p">
              Selected: <Text variant="body-sm" weight="medium" tone="default">{file.name}</Text>
            </Text>
          )}
        </div>
      </FormDialog>
    );
  }

  if (step === 'review' && preview) {
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title="Import operational model"
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep('pick')}
              disabled={isPublishing}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePublish}
              loading={isPublishing}
              disabled={hasAnyErrors || isPublishing}
            >
              {packageCount > 1 ? `Publish ${packageCount} operational models` : 'Publish'}
            </Button>
          </>
        }
      >
        {preview.archive_type === 'archive' && (
          <Text variant="body-sm" tone="subtle" as="p">
            Archive contains {packageCount} operational model{packageCount !== 1 ? 's' : ''}.
          </Text>
        )}
        <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
          {preview.packages.map((pkg, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--panel-2)] px-3 py-2.5 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2">
                <Text variant="body" weight="medium">
                  {pkg.package_name || '(unnamed)'}
                </Text>
                <div className="flex items-center gap-2">
                  <Text variant="body-sm" tone="muted">{pkg.entry_type_count} types</Text>
                  <Text variant="body-sm" tone="muted">{pkg.view_count} views</Text>
                </div>
              </div>
              {pkg.package_description && (
                <Text variant="body-sm" tone="subtle" as="p" className="line-clamp-1">
                  {pkg.package_description}
                </Text>
              )}
              {pkg.validation_errors.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {pkg.validation_errors.map((e, j) => (
                    <Text key={j} variant="body-sm" tone="danger" as="li">{e}</Text>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </FormDialog>
    );
  }

  // step === 'done'
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Import operational model"
      actions={
        <Button type="button" variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      <Text variant="body" tone="muted" as="p">
        {publishedCount > 1
          ? `${publishedCount} operational models added to library.`
          : 'Profile added to library.'}
      </Text>
    </FormDialog>
  );
}
