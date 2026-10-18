import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TrackCollaboratorsModal } from '../TrackCollaboratorsModal';

vi.mock('../../../access/ResourceAccessReview', () => ({ ResourceAccessReview: () => null }));
afterEach(cleanup);

it.each([2, 0])('distinguishes restricted details from an empty roster (%s)', count => {
  const noop = vi.fn();
  render(<TrackCollaboratorsModal
    open trackId="track" onClose={noop}
    canManageCollaborators={false} canManageCollabRows={false} isOwner={false}
    currentUser={null} collaboratorList={[]} collaboratorCount={count}
    collabExcludeIds={new Set()} onAdd={noop} onChangeDirectRole={noop}
    onPromoteInherited={noop} onTransferOwnership={noop} onRemove={noop}
    onExclude={noop} onRestore={noop}
  />);
  if (count) {
    expect(screen.getByText('Collaborator details are visible to the owner and admins.')).toBeInTheDocument();
    expect(screen.queryByText('No one is listed yet.')).not.toBeInTheDocument();
  } else {
    expect(screen.getByText('No one is listed yet.')).toBeInTheDocument();
  }
});
