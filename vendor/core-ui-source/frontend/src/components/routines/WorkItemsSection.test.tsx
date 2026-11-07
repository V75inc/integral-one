import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { WorkItemsSection } from './WorkItemsSection';
const list = vi.fn();
const get = vi.fn();
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
const renderWithRouter = (ui: React.ReactNode) => render(ui, { wrapper: MemoryRouter });
vi.mock('../../api/workItems', () => ({ workItemsApi: { list: (...args: unknown[]) => list(...args), get: (...args: unknown[]) => get(...args) } }));
afterEach(() => { cleanup(); list.mockReset(); get.mockReset(); });
const item = { work_item_id: 'update-1', kind: 'app_lifecycle', status: 'succeeded', workspace_id: 'workspace-1', app_id: 'app-1', attempt: 1, updated_at: new Date().toISOString() };
const routineRun = { ...item, work_item_id: 'routine-run-1', kind: 'routine_turn' };
const failedRoutineRun = { ...routineRun, work_item_id: 'routine-run-failed', status: 'failed', failure: { code: 'error', message: 'Routine needs attention' } };
const activeRoutineRun = { ...routineRun, work_item_id: 'routine-run-active', status: 'running' };
const activeUpdate = { ...item, work_item_id: 'update-active', status: 'running' };
const failedUpdate = { ...item, work_item_id: 'failed-1', status: 'failed', failure: { code: 'error', message: 'Update failed' } };
describe('Active workspace tasks', () => {
  it('shows active and failed workspace tasks without routine/chat history or completed work', async () => {
    list.mockResolvedValueOnce({ items: [routineRun, failedRoutineRun, activeRoutineRun, item, activeUpdate, failedUpdate], next_cursor: 'next' }).mockResolvedValueOnce({ items: [{ ...item, work_item_id: 'failed-2', status: 'failed', failure: { code: 'error', message: 'Older update failed' } }], next_cursor: null });
    renderWithRouter(<WorkItemsSection workspaceId="workspace-1" />);
    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Active workspace tasks')).toBeInTheDocument();
    expect(screen.queryByText('routine turn')).not.toBeInTheDocument();
    expect(screen.queryByText('chat turn')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    expect(screen.queryByText('Routine needs attention')).not.toBeInTheDocument();
    expect(screen.getByText('Update failed')).toBeInTheDocument();
    expect(screen.getByText('Active workspace tasks')).toBeInTheDocument();
    expect(screen.queryByText('update-1')).not.toBeInTheDocument();
    expect(screen.queryByText('app-1')).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledWith('workspace-1', undefined);
    fireEvent.click(screen.getByText('Load more tasks'));
    await screen.findByText('Older update failed');
    expect(list).toHaveBeenCalledWith('workspace-1', 'next');
  });
  it('keeps pagination available when the first page contains only routine history', async () => {
    list.mockResolvedValueOnce({ items: [routineRun], next_cursor: 'older' }).mockResolvedValueOnce({ items: [failedUpdate], next_cursor: null });
    renderWithRouter(<WorkItemsSection workspaceId="workspace-1" />);
    fireEvent.click(await screen.findByText('Load more tasks'));
    expect(await screen.findByText('Update failed')).toBeInTheDocument();
  });
  it('preserves App job labels and live progress', async () => {
    list.mockResolvedValue({ items: [{ ...activeUpdate, kind: 'app_tool', label: 'Generate report', progress: { done: 3, total: 4, label: 'Preparing sections' } }], next_cursor: null });
    renderWithRouter(<WorkItemsSection workspaceId="workspace-1" />);
    expect(await screen.findByText('Generate report')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('Preparing sections')).toBeInTheDocument();
  });
  it('shows failed observation and allows retry', async () => {
    list.mockRejectedValueOnce(new Error('Status unavailable')).mockResolvedValueOnce({ items: [], next_cursor: null });
    renderWithRouter(<WorkItemsSection workspaceId="workspace-1" />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Active workspace tasks' })).not.toBeInTheDocument());
  });
  it('ignores results arriving after the scoped component unmounts', async () => {
    let resolve!: (value: unknown) => void;
    list.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({ items: [], next_cursor: null });
    const view = renderWithRouter(<WorkItemsSection key="one" workspaceId="workspace-1" />);
    view.rerender(<WorkItemsSection key="two" workspaceId="workspace-2" />);
    await waitFor(() => expect(list).toHaveBeenCalledWith('workspace-2', undefined));
    resolve({ items: [item], next_cursor: null });
    await waitFor(() => expect(screen.queryByText('update-1')).not.toBeInTheDocument());
  });
});


it('loads readable App and Track destinations only when task details are opened', async () => {
  list.mockResolvedValue({ items: [failedUpdate], next_cursor: null });
  get.mockResolvedValue({ ...failedUpdate, context_links: [
    { kind: 'app', id: 'app-1', label: 'Personal Life Manager', href: '/apps/app-1' },
    { kind: 'track', id: 'track-1', label: 'Expenses', href: '/tracks/track-1' },
  ] });
  renderWithRouter(<WorkItemsSection workspaceId="workspace-1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Task details' }));
  expect(await screen.findByRole('link', { name: /Personal Life Manager/ })).toHaveAttribute('href', '/apps/app-1');
  expect(screen.getByRole('link', { name: /Expenses/ })).toHaveAttribute('href', '/tracks/track-1');
  expect(get).toHaveBeenCalledOnce();
  expect(get).toHaveBeenCalledWith('failed-1');
});


it('publishes a coalesced initial read after StrictMode replays mount effects', async () => {
  let resolve!: (value: unknown) => void;
  list.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  renderWithRouter(<StrictMode><WorkItemsSection workspaceId="workspace-1" /></StrictMode>);
  resolve({ items: [failedUpdate], next_cursor: null });
  expect(await screen.findByText('Update failed')).toBeInTheDocument();
  expect(list).toHaveBeenCalledOnce();
});
