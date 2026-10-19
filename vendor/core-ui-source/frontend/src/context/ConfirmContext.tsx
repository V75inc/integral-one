import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { LINE_ICON_STROKE } from '../components/ui/IconWell';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use danger styling for destructive actions (e.g. delete). */
  variant?: 'default' | 'danger';
  /** Optional icon beside the title (defaults to trash when variant is danger). */
  titleIcon?: ReactNode;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const finalize = useCallback((result: boolean) => {
    const resolve = resolveRef.current;
    if (!resolve) return;
    resolveRef.current = null;
    setOpen(false);
    setOptions(null);
    resolve(result);
  }, []);

  const confirm = useCallback<ConfirmFn>(opts => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setOptions(opts);
      setOpen(true);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <Modal
          open={open}
          onClose={() => finalize(false)}
          title={options.title}
          titleIcon={
            options.titleIcon ??
            (options.variant === 'danger' ? (
              <Trash2 size={14} strokeWidth={LINE_ICON_STROKE} />
            ) : undefined)
          }
          /* Confirm prompts stay small even on mobile — a full-screen
             takeover for a 1-line question would feel disproportionate.
             ``variant="compact"`` keeps the bottom-sheet/centered behaviour.
             ``max-w-dialog-confirm`` (480px, --dialog-w-confirm) is the
             confirmation exception to the standard control-modal width
             (--dialog-w-form, 720px). See Modal.tsx ModalProps.width and
             .planning/ui-templating/TOKENS.md. */
          width="max-w-dialog-confirm"
          variant="compact"
        >
          <Modal.Body>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
              {options.message}
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => finalize(false)}
            >
              {options.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              type="button"
              variant={options.variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={() => finalize(true)}
            >
              {options.confirmLabel ?? 'OK'}
            </Button>
          </Modal.Footer>
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
