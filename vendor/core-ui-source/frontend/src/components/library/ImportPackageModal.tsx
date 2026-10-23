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
import type { OperationalModelNode } from '../../types';

type Step = 'pick' | 'review' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (result: { operational_model?: OperationalModelNode }) => void;
  expectedScope?: 'track' | 'app';
  workspaceId: string;
}

export function ImportPackageModal({ open, onClose, onSuccess, workspaceId, expectedScope }: Props) {
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
    if (!file || !preview?.packages.length || preview.packages.some(p => p.validation_errors.length > 0 || (expectedScope && p.scope_kind !== expectedScope))) return;
    setIsPublishing(true);
    try {
      const data = await operationalModelsApi.importPublish(file, workspaceId);
      const count = data.published ?? 1;
      setPublishedCount(count);
      setStep('done');
      onSuccess(data);
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
    (preview?.packages ?? []).some(p => p.validation_errors.length > 0 || (expectedScope && p.scope_kind !== expectedScope));
  const packageCount = preview?.packages.length ?? 0;

  if (step === 'pick') {
    return (
      <FormDialog
        open={open}
        onClose={onClose}
        title="Import template"
        onConfirm={handlePreview}
        submitLabel="Preview"
        submitDisabled={!file}
        submitLoading={isPreviewing}
      >
        <Text variant="body" tone="muted" as="p">
          Upload a <code>.yaml</code>, <code>.yml</code> or <code>.json</code> template, or a <code>.zip</code> package of templates.
        </Text>
        <div className="flex flex-col gap-2">
          <Text variant="label" tone="subtle">Template file</Text>
          <input
            ref={fileRef}
            type="file"
            aria-label="Template file"
            accept=".yaml,.yml,.json,.zip"
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
        title="Import template"
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
              disabled={hasAnyErrors || !packageCount || isPublishing}
            >
              {packageCount > 1 ? `Import ${packageCount} templates` : 'Import'}
            </Button>
          </>
        }
      >
        {preview.archive_type === 'archive' && (
          <Text variant="body-sm" tone="subtle" as="p">
            Archive contains {packageCount} template{packageCount !== 1 ? 's' : ''}.
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
                  <Text variant="body-sm" tone="muted">{pkg.entry_type_count} {pkg.entry_type_count === 1 ? 'record type' : 'record types'}</Text>
                  <Text variant="body-sm" tone="muted">{pkg.view_count} {pkg.view_count === 1 ? 'view' : 'views'}</Text>
                </div>
              </div>
              {pkg.package_description && (
                <Text variant="body-sm" tone="subtle" as="p" className="line-clamp-1">
                  {pkg.package_description}
                </Text>
              )}
              {expectedScope && pkg.scope_kind !== expectedScope && <Text variant="body-sm" tone="danger" as="p">
                This file must contain a {expectedScope === 'track' ? 'Track' : 'App'} template. Choose a compatible file before importing.
              </Text>}
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
      title="Import template"
      actions={
        <Button type="button" variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      }
    >
      <Text variant="body" tone="muted" as="p">
        {publishedCount > 1
          ? `${publishedCount} templates added to library.`
          : 'Template added to library.'}
      </Text>
    </FormDialog>
  );
}
