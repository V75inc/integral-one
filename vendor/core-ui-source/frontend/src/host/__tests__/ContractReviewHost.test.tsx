import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ContractReviewHost } from '../ContractReviewHost';
import sharedTrackSource from '../../pages/SharedTrackPage.tsx?raw';

it('fails explicitly when no App review implementation is installed', () => {
  const accepted = vi.fn();
  render(<ContractReviewHost token="test" entryId="entry" onAccepted={accepted} onRejected={vi.fn()} />);
  expect(screen.getByText(/review is unavailable/)).toBeInTheDocument();
  expect(accepted).not.toHaveBeenCalled();
});
it('leaves contract generation to the App host component lifecycle', () => {
  expect(sharedTrackSource).not.toContain('memberAssignedFormApi.generateContract');
});
