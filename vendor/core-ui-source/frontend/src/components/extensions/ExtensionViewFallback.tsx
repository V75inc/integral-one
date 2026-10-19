import type { ReactNode } from 'react';
import { Puzzle } from 'lucide-react';
import { EmptyState, IconWell, LINE_ICON_STROKE } from '../ui';

interface ExtensionViewFallbackProps {
  title?: string;
  message?: string;
  action?: ReactNode;
}

export function ExtensionViewFallback({
  title = 'Extension view unavailable',
  message = 'The app extension view could not be loaded.',
  action,
}: ExtensionViewFallbackProps) {
  return (
    <EmptyState
      icon={
        <IconWell size="lg" aria-hidden>
          <Puzzle size={22} strokeWidth={LINE_ICON_STROKE} />
        </IconWell>
      }
      title={title}
      description={message}
      action={action}
    />
  );
}
