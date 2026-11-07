import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { useAppDeletionNavigation } from '../useAppDeletionNavigation';
import { APP_DELETED_EVENT, invalidateAfterAgentWrite } from '../../services/graphMutationInvalidation';
import type { StagedChange } from '../../features/ai-chat/staging/types';

function CurrentApp() {
  useAppDeletionNavigation('app-a');
  return <div>{useLocation().pathname}</div>;
}

describe('completed App deletion navigation', () => {
  it('leaves the deleted App only after its successful staged completion', async () => {
    render(<MemoryRouter initialEntries={['/apps/app-a']}><CurrentApp /></MemoryRouter>);
    const staged = { kind: 'delete_app', payload: { app_id: 'app-a' }, diff_machine: { app_id: 'app-a' } } as unknown as StagedChange;
    await act(async () => {
      await invalidateAfterAgentWrite(new QueryClient(), { staged, executeResult: { deleted: true } });
    });
    expect(screen.getByText('/apps')).toBeInTheDocument();
  });

  it('ignores another App and removes the listener on unmount', () => {
    const view = render(<MemoryRouter initialEntries={['/apps/app-a']}><CurrentApp /></MemoryRouter>);
    act(() => { window.dispatchEvent(new CustomEvent(APP_DELETED_EVENT, { detail: { appId: 'app-b' } })); });
    expect(screen.getByText('/apps/app-a')).toBeInTheDocument();
    view.unmount();
    act(() => { window.dispatchEvent(new CustomEvent(APP_DELETED_EVENT, { detail: { appId: 'app-a' } })); });
  });

  it.each([undefined, { error: true }, { deleted: true, error: true }, { deleted: true, ok: false }, { skipped: true }])('stays on the App when deletion is not confirmed: %s', async executeResult => {
    render(<MemoryRouter initialEntries={['/apps/app-a']}><CurrentApp /></MemoryRouter>);
    const staged = { kind: 'delete_app', diff_machine: { app_id: 'app-a' } } as unknown as StagedChange;
    await act(async () => { await invalidateAfterAgentWrite(new QueryClient(), { staged, executeResult }); });
    expect(screen.getByText('/apps/app-a')).toBeInTheDocument();
  });
});
