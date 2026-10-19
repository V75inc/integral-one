import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../api/agentive', () => ({
  listChannelIdentities: vi.fn(), unlinkChannelIdentity: vi.fn(),
  initiateWhatsAppVerification: vi.fn(), verifyWhatsAppOtp: vi.fn(),
}));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../context/AgentiveContext', () => ({ useAgentive: () => ({ enabled: true }) }));
import { listChannelIdentities, unlinkChannelIdentity, initiateWhatsAppVerification, verifyWhatsAppOtp } from '../../../api/agentive';
import { WhatsAppSettings } from '../WhatsAppSettings';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listChannelIdentities).mockResolvedValue({ identities: [] });
});
describe('WhatsApp notification setup', () => {
  it('shows a failed identity request and permits retry', async () => {
    vi.mocked(listChannelIdentities).mockRejectedValueOnce(new Error('Unavailable'));
    render(<WhatsAppSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load WhatsApp numbers');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Link WhatsApp number' })).toBeInTheDocument();
    expect(listChannelIdentities).toHaveBeenCalledTimes(2);
  });
  it('refreshes notification eligibility after verification', async () => {
    vi.mocked(initiateWhatsAppVerification).mockResolvedValue({ identity_id: 'phone-1', verified: false });
    vi.mocked(verifyWhatsAppOtp).mockResolvedValue({ verified: true });
    const onChange = vi.fn();
    render(<WhatsAppSettings onChange={onChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link WhatsApp number' }));
    fireEvent.change(screen.getByLabelText('WhatsApp phone number'), { target: { value: '+15551234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: 'ABC123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(verifyWhatsAppOtp).toHaveBeenCalledWith('+15551234567', 'ABC123');
  });
  it('refreshes notification eligibility after unlinking', async () => {
    vi.mocked(listChannelIdentities).mockResolvedValueOnce({ identities: [{ id: 'phone-1', channel: 'whatsapp', channel_user_id: '+15551234567', verified: true }] });
    vi.mocked(unlinkChannelIdentity).mockResolvedValue({ success: true });
    const onChange = vi.fn();
    render(<WhatsAppSettings onChange={onChange} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(unlinkChannelIdentity).toHaveBeenCalledWith('phone-1');
  });
});
