/**
 * Phase 8 Plan 08-04 — Derive library package modal.
 *
 * Mounted from TrackDetailPage and AppDetailPage action menus; the parent
 * passes its own ``onSubmit`` that calls either
 * ``operationalModelsApi.deriveFromTrack(trackId, body)`` or
 * ``operationalModelsApi.deriveFromApp(appId, body)``.
 *
 * Backend gate: the existing /operational-models/from-track/{id} and
 * /operational-models/from-app/{id} endpoints already enforce
 * caller-owns-resource via policy_engine.evaluate(action='track.update' /
 * 'space.update'). T-08-04-T01 mitigation: frontend respects backend
 * decisions — show error toast on 403, no client-side ownership gating.
 *
 * On success the parent should invalidate ``['library']`` so the new
 * package surfaces under Settings → Library on next visit.
 *
 * Migrated to the FormDialog template + Field/Input/Textarea primitives
 * (Phase 6 of the FE templating refactor; see
 * `.planning/ui-templating/MIGRATION_LOG.md`). 50+ lines deleted —
 * cancel/submit footer, hand-rolled textarea styling, and Modal wiring
 * all flow from the template now.
 */
import { useEffect, useState } from 'react';

import { errorMessageFromAxios } from '../../api/helpers';
import { Input, Text, Textarea } from '../../ui';
import { Field } from '../../patterns';
import { FormDialog } from '../../templates';
import { useToast } from '../../context/ToastContext';

export interface DeriveBody {
  name: string;
  description?: string;
  version?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Async submit callback — parent provides the appropriate
   * ``deriveFromTrack`` / ``deriveFromApp`` invocation. Must throw on
   * failure so the modal can surface the error and stay open.
   */
  onSubmit: (body: DeriveBody) => Promise<void>;
  /** Display label: "Track: My Project" / "App: Engineering" for context. */
  sourceLabel: string;
}

export function DeriveLibraryPackageModal({
  open,
  onClose,
  onSubmit,
  sourceLabel,
}: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset fields when the modal opens — avoids stale state when the user
  // opens the modal, cancels, and reopens it for a different source.
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setVersion('1.0.0');
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.showToast('Package name is required', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim() || undefined,
        version: version.trim() || undefined,
      });
      // Parent handles close + toast on success
      onClose();
    } catch (err) {
      const apiMessage = errorMessageFromAxios(err, 'Failed to save template');
      const msg =
        apiMessage === 'Template attachments exceed the 25 MiB portable-template limit'
          ? 'This App’s attachments exceed the 25 MiB template limit. Remove some attachments or reduce their size, then try again.'
          : apiMessage;
      toast.showToast(msg, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Save as template"
      onSubmit={handleSubmit}
      submitLabel="Save template"
      submitDisabled={!name.trim()}
      submitLoading={isSubmitting}
    >
      <Text variant="body-sm" tone="subtle" as="p">
        Source:{' '}
        <Text variant="body-sm" weight="medium" tone="muted">
          {sourceLabel}
        </Text>
      </Text>
      <Field
        label="Template name"
        required
        hint="Becomes the template's display name in Settings → Library."
      >
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My team's onboarding profile"
        />
      </Field>
      <Field
        label="Description"
        hint="Optional. One-line summary surfaced in the library list."
      >
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What this package is for, who should use it…"
          rows={3}
        />
      </Field>
      <Field
        label="Version"
        hint="Optional. Semver-ish (e.g. 1.0.0). Defaults to 1.0.0."
      >
        <Input value={version} onChange={e => setVersion(e.target.value)} monospace />
      </Field>
    </FormDialog>
  );
}
