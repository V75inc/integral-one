import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TracksPage } from '../TracksPage';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../api', () => ({ tracksApi: { list: mocks.list } }));
vi.mock('../../context/ScopeContext', () => ({ useScope: () => ({ activeWorkspace: { id: 'invited-ws', name: 'Shared workspace', your_role: 'guest' } }) }));
vi.mock('../../context/CrumbsContext', () => ({ useSetCrumbs: () => {} }));
vi.mock('../../context/AssistantDockContext', () => ({ useAssistantDockOptional: () => null }));
vi.mock('../../hooks/useWorkspaceCreationRights', () => ({ useWorkspaceCreationRights: () => ({ canCreateTracks: false, lacksTrackCreationInOrg: false }) }));
vi.mock('../../hooks/usePublishPageContext', () => ({ usePublishPageContext: () => {} }));
vi.mock('../../components/tracks/TrackModal', () => ({ TrackModal: () => null }));
vi.mock('../../components/sidebar/PinButton', () => ({ PinButton: () => null }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
afterEach(cleanup);

it('shows the actual API denial without claiming the invited workspace has no Tracks, and retries', async () => {
  mocks.list.mockRejectedValueOnce({ response: { status: 403, data: { message: 'Workspace access denied.', error_code: 'insufficient_permissions' } } })
    .mockResolvedValue([{ id: 't-shared', title: 'Shared Track', entry_count: 1 }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter><TracksPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Workspace access denied.');
  expect(screen.queryByText('No tracks yet')).not.toBeInTheDocument();
  expect(screen.getByText(/— tracks in Shared workspace/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Shared Track')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(mocks.list).toHaveBeenCalledTimes(2);
});
