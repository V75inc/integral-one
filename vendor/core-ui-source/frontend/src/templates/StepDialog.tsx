/**
 * StepDialog — multi-step form template.
 *
 * Wraps `<Modal>` with a step indicator + per-step body + per-step
 * actions. Each step provides its own `<Modal.Body>` content and its
 * own footer (Back / Next / Save). Used by AppModal, TrackModal,
 * AppInstallModal — multi-phase flows that previously hand-rolled
 * step indicators inline.
 *
 * Layer: Template (Layer 3).
 *
 * Usage:
 *   <StepDialog
 *     open={open}
 *     onClose={onClose}
 *     title="New app"
 *     steps={['Choose profile', 'Details']}
 *     activeIndex={step === 'profile' ? 0 : 1}
 *   >
 *     {step === 'profile' ? <ProfileStep ... /> : <DetailsStep ... />}
 *   </StepDialog>
 *
 * The body MUST include the per-step `<Modal.Footer>` (or `<FormDialog>`-
 * style action cluster) — StepDialog owns the indicator + chrome but
 * not the action wiring (each step's primary action differs too much
 * for a generic API).
 */

import { type ReactNode } from 'react';

import { Modal } from '../components/ui/Modal';

export type StepDialogSize = 'confirm' | 'form' | 'wide';

const SIZE_CLASSES: Record<StepDialogSize, string> = {
  confirm: 'max-w-dialog-confirm',
  form: 'max-w-dialog-form',
  wide: 'max-w-dialog-wide',
};

export interface StepDialogProps {
  open: boolean;
  onClose(): void;
  title: string;
  /** Optional icon next to the title. */
  titleIcon?: ReactNode;
  /** Semantic width token. Default: `form` (720px). */
  size?: StepDialogSize;
  /** Step labels in display order. */
  steps: readonly string[];
  /** Zero-based index of the current step. */
  activeIndex: number;
  /** Step content + footer. Caller renders the active step's body. */
  children: ReactNode;
}

export function StepDialog({
  open,
  onClose,
  title,
  titleIcon,
  size = 'form',
  steps,
  activeIndex,
  children,
}: StepDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={titleIcon}
      width={SIZE_CLASSES[size]}
    >
      {/* Step indicator — pinned at the top of the body, visually
          part of the dialog header rail. */}
      <div className="px-5 sm:px-6 pt-4 pb-1">
        <ol
          className="flex items-center gap-2"
          aria-label={`Step ${activeIndex + 1} of ${steps.length}`}
        >
          {steps.map((label, i) => {
            const isActive = i === activeIndex;
            const isDone = i < activeIndex;
            return (
              <li key={i} className="flex items-center gap-2">
                <span
                  className={[
                    'inline-flex items-center justify-center',
                    'h-5 w-5 rounded-full text-[11px] font-medium',
                    isActive
                      ? 'bg-[var(--cta-bg)] text-[var(--cta-fg)]'
                      : isDone
                        ? 'bg-[var(--brand-accent)] text-[var(--brand-accent-contrast)]'
                        : 'bg-[var(--badge-muted-bg)] text-[var(--text-subtle)]',
                  ].join(' ')}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {i + 1}
                </span>
                <span
                  className={[
                    'text-xs',
                    isActive
                      ? 'text-[var(--text)] font-medium'
                      : 'text-[var(--text-subtle)]',
                  ].join(' ')}
                >
                  {label}
                </span>
                {i < steps.length - 1 && (
                  <span
                    aria-hidden
                    className="mx-1 h-px w-4 bg-[var(--panel-border)]"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {children}
    </Modal>
  );
}
