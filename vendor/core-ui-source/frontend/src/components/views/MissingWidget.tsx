import { Puzzle } from 'lucide-react';
import type { SavedView } from '../../types';
import { LINE_ICON_STROKE } from '../ui';

interface MissingWidgetProps {
  view: SavedView;
}

export function MissingWidget({ view }: MissingWidgetProps) {
  return (
    <div className="app-card p-8 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-[var(--panel-2)] flex items-center justify-center mb-4">
        <Puzzle size={24} strokeWidth={LINE_ICON_STROKE} className="text-[var(--text-muted)]" />
      </div>
      <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
        Widget not available
      </h3>
      <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto mb-4">
        This view requires a{' '}
        <code className="px-1.5 py-0.5 rounded bg-[var(--panel-2)] text-[var(--text)] text-xs">
          {view.type}
        </code>{' '}
        widget which isn&apos;t installed yet.
      </p>
      <div className="text-xs text-[var(--text-muted)] space-y-1 max-w-sm mx-auto">
        <p>
          <strong className="text-[var(--text)]">Developers:</strong> Build a widget for this capability and register it in the view registry.
        </p>
        <p>
          <strong className="text-[var(--text)]">AI Agents:</strong> Implement a widget component following `ViewWidgetProps`, then register capability `{view.type}`.
        </p>
      </div>
    </div>
  );
}
