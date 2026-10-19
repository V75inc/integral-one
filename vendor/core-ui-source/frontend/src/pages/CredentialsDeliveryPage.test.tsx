import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../api/auth';
import { CredentialsDeliveryPage } from './CredentialsDeliveryPage';

vi.mock('../api/auth', () => ({ authApi: { verifyCredentialsDelivery: vi.fn(), resendCredentialsDelivery: vi.fn() } }));
function show(url = '/credentials-delivery-verify?member=member-1&intent=intent-1') {
  render(<MemoryRouter initialEntries={[url]}><CredentialsDeliveryPage /></MemoryRouter>);
}
describe('mailbox delivery confirmation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects incomplete links without submitting', () => {
    show('/credentials-delivery-verify');
    expect(screen.getByText(/confirmation link is incomplete/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(authApi.verifyCredentialsDelivery).not.toHaveBeenCalled();
  });
  it('sends only the code and intent, then reports successful setup-link delivery', async () => {
    vi.mocked(authApi.verifyCredentialsDelivery).mockResolvedValue({ data: { ok: true, credentials_emailed: true } } as never);
    show();
    expect(screen.getByRole('button', { name: 'Confirm and send setup link' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Confirmation code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send setup link' }));
    await screen.findByText(/Your password has not been changed/);
    expect(authApi.verifyCredentialsDelivery).toHaveBeenCalledWith('member-1', 'intent-1', '123456');
    expect(screen.queryByLabelText('Confirmation code')).not.toBeInTheDocument();
  });
  it('keeps failed delivery retryable and never reports it as sent', async () => {
    vi.mocked(authApi.verifyCredentialsDelivery).mockResolvedValue({ data: { ok: true, credentials_emailed: false } } as never);
    show();
    fireEvent.change(screen.getByLabelText('Confirmation code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send setup link' }));
    await screen.findByText(/Delivery is pending/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and send setup link' })).toBeEnabled());
    expect(screen.getByLabelText('Confirmation code')).toHaveValue('123456');
  });
  it('surfaces a rejected code and permits another attempt', async () => {
    vi.mocked(authApi.verifyCredentialsDelivery).mockRejectedValue(new Error('invalid'));
    show();
    fireEvent.change(screen.getByLabelText('Confirmation code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send setup link' }));
    await screen.findByText(/Unable to confirm delivery/);
    expect(screen.getByLabelText('Confirmation code')).toHaveValue('123456');
  });
  it('retries the fixed challenge without asking for another email address', async () => {
    vi.mocked(authApi.resendCredentialsDelivery).mockResolvedValue({ data: { ok: true, challenge_emailed: true } } as never);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    await screen.findByText(/A confirmation code has been sent/);
    expect(authApi.resendCredentialsDelivery).toHaveBeenCalledWith('member-1', 'intent-1');
    expect(authApi.verifyCredentialsDelivery).not.toHaveBeenCalled();
  });

});
