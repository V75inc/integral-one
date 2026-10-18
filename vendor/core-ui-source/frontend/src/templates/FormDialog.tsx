/**
 * FormDialog — locked composition for control modals (forms, multi-step
 * flows, settings panels). Replaces the hand-rolled
 *   `<Modal>` + `<Modal.Body>` + `<Modal.Footer>` + Cancel/Submit buttons
 * pattern that recurs across 12+ control modals (AppModal, TrackModal,
 * ConnectorRegister/Edit, PolicyCreate/Edit, etc).
 *
 * Layer: Template (Layer 3 — composes Primitive Modal + Pattern Field
 * indirectly via children + Primitive Button). Owns dimensions, submit
 * semantics, focus management, and ActionBar placement.
 *
 * Usage:
 *
 *   <FormDialog
 *     open={open}
 *     onClose={onClose}
 *     title="New app"
 *     onSubmit={handleSubmit}
 *     submitLabel="Create"
 *     submitDisabled={!isValid}
 *     submitLoading={mut.isPending}
 *   >
 *     <Field label="Name" required>
 *       <Input value={name} onChange={...} />
 *     </Field>
 *     <Field label="Description">
 *       <Textarea value={desc} onChange={...} />
 *     </Field>
 *   </FormDialog>
 *
 * Pass `actions` to override the default Cancel/Submit footer:
 *
 *   <FormDialog actions={<MyCustomBar />} ... />
 *
 * For destructive flows (delete, uninstall), pass `destructive` — the
 * primary button switches to the danger variant.
 */

import { type FormEvent, type ReactNode } from 'react';

import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

export type FormDialogSize = 'confirm' | 'form' | 'wide';

const SIZE_CLASSES: Record<FormDialogSize, string> = {
  confirm: 'max-w-dialog-confirm',
  form: 'max-w-dialog-form',
  wide: 'max-w-dialog-wide',
};

export interface FormDialogProps {
  open: boolean;
  onClose(): void;
  /** Dialog title (rendered in the Modal header). */
  title: string;
  /** Optional icon next to the title. */
  titleIcon?: ReactNode;
  /** Semantic width token. Default: `form` (720px). */
  size?: FormDialogSize;
  /** Body content — typically `<Field>` rows + nested controls. */
  children: ReactNode;
  /**
   * Submit handler. When provided, the body is wrapped in a `<form>`
   * and the primary button is `type="submit"`. Default Enter-to-submit
   * behaviour just works.
   *
   * Omit for non-form dialogs that just need an OK / Confirm button —
   * use `onConfirm` instead.
   */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /**
   * Confirm handler for non-form dialogs (e.g. destructive confirms
   * with no inputs). Mutually exclusive with `onSubmit`.
   */
  onConfirm?: () => void;
  /** Label for the primary action. Default: `'Save'` (form) / `'Confirm'` (confirm). */
  submitLabel?: string;
  /** Label for the secondary (cancel) action. Default: `'Cancel'`. */
  cancelLabel?: string;
  /** Disable the primary action. */
  submitDisabled?: boolean;
  /** Show loading state on the primary action. */
  submitLoading?: boolean;
  /** Switch primary action to danger variant. */
  destructive?: boolean;
  /**
   * Override the default Cancel/Submit footer entirely. When set,
   * `submitLabel` / `cancelLabel` / `onSubmit` / `onConfirm` are
   * ignored for the footer (but `onSubmit` still wraps the body in
   * `<form>`).
   */
  actions?: ReactNode;
  /** Hide the footer entirely (use for read-only / pure-display dialogs). */
  noActions?: boolean;
}

export function FormDialog({
  open,
  onClose,
  title,
  titleIcon,
  size = 'form',
  children,
  onSubmit,
  onConfirm,
  submitLabel,
  cancelLabel = 'Cancel',
  submitDisabled = false,
  submitLoading = false,
  destructive = false,
  actions,
  noActions = false,
}: FormDialogProps) {
  if (onSubmit && onConfirm) {
    throw new Error(
      'FormDialog: pass either `onSubmit` (form) OR `onConfirm` (non-form), not both.',
    );
  }

  const defaultSubmitLabel = onConfirm ? 'Confirm' : 'Save';
  const resolvedSubmitLabel = submitLabel ?? defaultSubmitLabel;

  const footer = noActions ? null : actions ? (
    <Modal.Footer>{actions}</Modal.Footer>
  ) : (
    <Modal.Footer>
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>
        {cancelLabel}
      </Button>
      <Button
        type={onSubmit ? 'submit' : 'button'}
        variant={destructive ? 'danger' : 'primary'}
        size="sm"
        onClick={onSubmit ? undefined : onConfirm}
        disabled={submitDisabled || submitLoading}
      >
        {submitLoading ? 'Working…' : resolvedSubmitLabel}
      </Button>
    </Modal.Footer>
  );

  const body = onSubmit ? (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (submitDisabled || submitLoading) return;
        onSubmit(e);
      }}
    >
      <Modal.Body>{children}</Modal.Body>
      {footer}
    </form>
  ) : (
    <>
      <Modal.Body>{children}</Modal.Body>
      {footer}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={titleIcon}
      width={SIZE_CLASSES[size]}
    >
      {body}
    </Modal>
  );
}
