import type { CSSProperties } from 'react';

/**
 * PresenceDot — small status dot indicating online / away / offline state.
 * Defaults to "offline" (subtle gray). Online uses `--presence`; away
 * borrows `--warn-fg`. Pair with an `Avatar` by absolutely positioning at
 * the bottom-right corner.
 */
export type PresenceState = 'online' | 'away' | 'offline';

interface PresenceDotProps {
  state?: PresenceState;
  size?: number; // pixels — default 8
  ring?: boolean; // subtle ring matching panel for contrast on busy bg
  className?: string;
  title?: string;
}

const STATE_COLOR: Record<PresenceState, string> = {
  online: 'var(--presence)',
  away: 'var(--warn-fg)',
  offline: 'var(--text-subtle)',
};

export function PresenceDot({
  state = 'offline',
  size = 8,
  ring = true,
  className = '',
  title,
}: PresenceDotProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: STATE_COLOR[state],
    boxShadow: ring ? '0 0 0 1.5px var(--panel)' : undefined,
  };
  return (
    <span
      aria-label={title ?? state}
      title={title ?? state}
      className={`inline-block rounded-full ${className}`}
      style={style}
    />
  );
}
