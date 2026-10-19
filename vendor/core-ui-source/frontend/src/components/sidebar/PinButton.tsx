/**
 * PinButton — accessible pin toggle for sidebar pinning.
 *
 * Renders as a ghost icon button. Reflects pinned state via filled-vs-outline
 * Lucide Pin and via aria-pressed. 44pt hit area to meet touch target rules.
 */

import { Pin } from 'lucide-react';
import { LINE_ICON_STROKE } from '../ui';
import { usePinned } from '../../hooks/usePinned';

interface Props {
  kind: 'track' | 'app';
  id: string;
  label: string;
  size?: 'sm' | 'md';
}

export function PinButton({ kind, id, label, size = 'md' }: Props) {
  const { isPinned, toggle } = usePinned();
  const pinned = isPinned(kind, id);
  const iconSize = size === 'sm' ? 14 : 16;
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-11 h-11';
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        toggle(kind, id);
      }}
      aria-pressed={pinned}
      aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label}`}
      title={pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
      className={[
        'inline-flex items-center justify-center rounded-md',
        dim,
        'text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]',
        'transition-colors duration-fast',
        pinned ? 'text-[var(--warn-fg)] hover:text-[var(--warn-fg)]' : '',
      ].join(' ')}
    >
      <Pin
        size={iconSize}
        strokeWidth={LINE_ICON_STROKE}
        fill={pinned ? 'currentColor' : 'none'}
      />
    </button>
  );
}
