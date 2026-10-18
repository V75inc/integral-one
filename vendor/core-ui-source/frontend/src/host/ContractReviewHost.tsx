import { AlertTriangle } from 'lucide-react';

import { Text } from '../ui';

/** Host extension slot for App-owned contract review workflows (Core ships a stub). */
export type ContractReviewHostProps = {
  token: string;
  entryId: string;
  memberFormMode?: boolean;
  contractStatus?: string;
  onAccepted: () => void;
  onRejected: () => void;
};

export function ContractReviewHost(_props: ContractReviewHostProps) {
  return (
    <Text variant="body" tone="muted">
      Document review is unavailable in this installation. Your workspace administrator must enable a compatible App extension before this form can continue.
    </Text>
  );
}

/** Neutral terminal when the user declines a document-review step (App may override). */
export function ContractReviewRejectedTerminal() {
  return (
    <div className="animate-fade-in space-y-4 py-8 text-center">
      <AlertTriangle size={56} className="mx-auto text-amber-500" aria-hidden />
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">
          Form closed
        </Text>
        <Text variant="body-sm" tone="muted" as="p" className="mt-1 block">
          You declined the document. Contact your workspace administrator if you need
          help.
        </Text>
      </div>
    </div>
  );
}
