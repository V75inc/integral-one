import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppModal } from './AppModal';

const create = vi.hoisted(() => vi.fn());
vi.mock('../../api', () => ({
  appsApi: { create },
  operationalModelsApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../context/ScopeContext', () => ({ useScope: () => ({ scope: { workspaceId: 'ws-1' } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('./AppIconPicker', () => ({ AppIconPicker: () => null }));

afterEach(cleanup);
beforeEach(() => create.mockReset().mockResolvedValue({ id: 'app-1', name: 'New App', visibility: 'private' }));

describe('App visibility creation', () => {
  it.each(['private', 'workspace', 'public'])('sends %s explicitly', async visibility => {
    render(<QueryClientProvider client={new QueryClient()}><AppModal open mode="blank" onClose={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>);
    expect(screen.queryByRole('button', { name: /Inherit/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Private/ }).getAttribute('aria-pressed')).toBe('true');
    if (visibility !== 'private') fireEvent.click(screen.getByRole('button', { name: new RegExp(visibility, 'i') }));
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New App' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ visibility, workspace_id: 'ws-1' })));
  });
});
