/**
 * Approval surface for a ``discard_profile_draft`` staged change.
 *
 * Discarding is destructive (the draft is removed from the graph) but
 * NOT data-affecting (no entries change). Card just confirms the agent's
 * intent before the token is blessed.
 */

import { StagedChangeCard, type StagedChangeCardProps } from './StagedChangeCard';

export function DiscardDraftCard({ staged, onTerminal }: StagedChangeCardProps) {
  return <StagedChangeCard staged={staged} onTerminal={onTerminal} />;
}
