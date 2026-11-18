/** StatusBadge — a short coloured label for a state (Approved, Overdue). Layer: Primitive. */
import type { ReactNode } from 'react';
import { Badge } from '../components/ui/Badge';

export type StatusBadgeTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info';
const VARIANT: Record<StatusBadgeTone, string> = { neutral: 'default', success: 'success', warn: 'warning', danger: 'danger', info: 'info' };

export function StatusBadge({ tone = 'neutral', children }: { tone?: StatusBadgeTone; children: ReactNode }) {
  return <Badge variant={VARIANT[tone]}>{children}</Badge>;
}
