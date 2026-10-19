import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TrackDetailViewChrome, type TrackDetailViewChromeProps } from '../TrackDetailViewChrome';
import type { SavedView } from '../../../../types';

const view = { id: 'view-table', name: 'Customers', type: 'table' } as SavedView;
function props(): TrackDetailViewChromeProps {
  return {
    trackId: 'track-customers', viewTabOptions: [{ value: view.id, label: view.name }],
    activeView: view, dedupedTabViews: [view], onChangeView: vi.fn(),
    canViewTrackConfig: true, trackConfigOpen: false, trackActivityOpen: false,
    onToggleConfig: vi.fn(), onToggleActivity: vi.fn(), onEditLayout: vi.fn(),
  };
}

describe('TrackDetailViewChrome', () => {
  it('groups layout editing with view improvement, beside the view tabs', () => {
    const config = props();
    render(<TrackDetailViewChrome {...config} />);
    const actions = within(screen.getByRole('group', { name: 'View actions' }));
    const edit = actions.getByRole('button', { name: 'Edit view layout' });
    expect(actions.getByRole('button', { name: 'Enhance this view' })).toBeInTheDocument();
    expect(edit).toHaveAttribute('title', 'Edit view layout');
    expect(edit).toHaveClass('h-8', 'w-8');
    expect(edit).not.toHaveTextContent('Edit layout');
    expect(within(screen.getByRole('tablist', { name: 'Track views' })).getByRole('button', { name: 'Edit view layout' })).toBe(edit);
    fireEvent.click(edit);
    expect(config.onEditLayout).toHaveBeenCalledOnce();
  });

  it('does not offer layout editing without an authorized edit callback', () => {
    render(<TrackDetailViewChrome {...props()} onEditLayout={undefined} />);
    expect(screen.queryByRole('button', { name: 'Edit view layout' })).not.toBeInTheDocument();
  });

  it('does not offer an editor without an active view', () => {
    render(<TrackDetailViewChrome {...props()} activeView={null} viewTabOptions={[]} />);
    expect(screen.queryByRole('button', { name: 'Edit view layout' })).not.toBeInTheDocument();
  });
});
