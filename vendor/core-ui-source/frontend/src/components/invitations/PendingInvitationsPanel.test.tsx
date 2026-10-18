import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PendingInvitationsPanel } from './PendingInvitationsPanel';

const mocks = vi.hoisted(() => ({list:vi.fn(), accept:vi.fn(), toast:vi.fn()}));
vi.mock('../../api', () => ({sharingApi:{listMyInvitations:mocks.list, acceptMyInvitation:mocks.accept}}));
vi.mock('../../context/ToastContext', () => ({useToast:()=>({showToast:mocks.toast})}));
it('retries a failed load and preserves same-named invitations after an acceptance error', async () => {
 const rows = ['inv-one','inv-two'].map(id=>({id, workspace_id:'workspace-'+id, workspace_name:'Same name', status:'pending', role:'member', invited_by_name:'QA Owner'}));
 mocks.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(rows);
 mocks.accept.mockRejectedValue(new Error('temporary refusal'));
 render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><PendingInvitationsPanel /></QueryClientProvider></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button', {name:'Retry invitations'}));
 const buttons = await screen.findAllByRole('button', {name:'Accept'});
 expect(buttons).toHaveLength(2);
 fireEvent.click(buttons[1]);
 await waitFor(()=>expect(mocks.accept).toHaveBeenCalledWith('inv-two'));
 await waitFor(()=>expect(screen.getAllByRole('button', {name:'Accept'})).toHaveLength(2));
 expect(screen.getAllByText(/Same name/)).toHaveLength(2);
});
