/**
 * Phase 19 — Gmail connector setup smoke tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../../api/connectors', () => ({
  connectorsApi: {
    gmailOauthStart: vi.fn(),
    gmailOauthCallback: vi.fn(),
    gmailLabels: vi.fn(),
    gmailSetLabels: vi.fn(),
  },
}));

import { connectorsApi } from '../../../../api/connectors';
import { GmailConnectorSetup } from '../GmailConnectorSetup';

const startMock = connectorsApi.gmailOauthStart as unknown as ReturnType<typeof vi.fn>;
const callbackMock = connectorsApi.gmailOauthCallback as unknown as ReturnType<typeof vi.fn>;
const labelsMock = connectorsApi.gmailLabels as unknown as ReturnType<typeof vi.fn>;
const setLabelsMock = connectorsApi.gmailSetLabels as unknown as ReturnType<typeof vi.fn>;

const mockLabels = [
  { id: 'Label_Sales', name: 'Sales', type: 'user' },
  { id: 'Label_HR', name: 'HR', type: 'user' },
];


describe('GmailConnectorSetup', () => {
  beforeEach(() => {
    startMock.mockReset();
    callbackMock.mockReset();
    labelsMock.mockReset();
    setLabelsMock.mockReset();
  });

  it('Connect button launches OAuth popup', async () => {
    startMock.mockResolvedValue({
      consent_url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=m',
      state: 'signed.state',
    });
    const winOpen = vi.spyOn(window, 'open').mockReturnValue(null as unknown as Window);
    render(<GmailConnectorSetup />);
    fireEvent.click(screen.getByTestId('gmail-connect-google-account'));
    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(winOpen).toHaveBeenCalledTimes(1));
    winOpen.mockRestore();
  });

  it('After OAuth callback the label picker renders with NOTHING checked', async () => {
    callbackMock.mockResolvedValue({
      connector_id: 'conn-1',
      connected: true,
      reauth_required: false,
      auth_state: {},
    });
    labelsMock.mockResolvedValue({ labels: mockLabels });
    render(<GmailConnectorSetup />);
    fireEvent.click(screen.getByTestId('gmail-manual-callback'));
    await waitFor(() =>
      expect(screen.getByTestId('gmail-label-picker')).toBeInTheDocument(),
    );
    // Default-unchecked: EML-05 explicit-opt-in contract.
    expect(
      (screen.getByTestId('gmail-label-Label_Sales') as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByTestId('gmail-label-Label_HR') as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('Activate is disabled until at least one label + consent', async () => {
    callbackMock.mockResolvedValue({
      connector_id: 'conn-1',
      connected: true,
      reauth_required: false,
      auth_state: {},
    });
    labelsMock.mockResolvedValue({ labels: mockLabels });
    render(<GmailConnectorSetup />);
    fireEvent.click(screen.getByTestId('gmail-manual-callback'));
    await waitFor(() =>
      expect(screen.getByTestId('gmail-activate')).toBeInTheDocument(),
    );
    const activate = screen.getByTestId('gmail-activate') as HTMLButtonElement;
    // Nothing checked, no consent → disabled.
    expect(activate.disabled).toBe(true);
    // Check one label only → still disabled (no consent yet).
    fireEvent.click(screen.getByTestId('gmail-label-Label_Sales'));
    expect(activate.disabled).toBe(true);
    // Acknowledge consent → enabled.
    fireEvent.click(screen.getByTestId('gmail-consent-checkbox'));
    expect(activate.disabled).toBe(false);
  });

  it('Activate posts gmailSetLabels with the selected ids + consent', async () => {
    callbackMock.mockResolvedValue({
      connector_id: 'conn-1',
      connected: true,
      reauth_required: false,
      auth_state: {},
    });
    labelsMock.mockResolvedValue({ labels: mockLabels });
    setLabelsMock.mockResolvedValue({
      connector_id: 'conn-1',
      label_ids: ['Label_Sales'],
      consent_acknowledged: true,
      auth_state: {},
    });
    const onActivated = vi.fn();
    render(<GmailConnectorSetup onActivated={onActivated} />);
    fireEvent.click(screen.getByTestId('gmail-manual-callback'));
    await waitFor(() => screen.getByTestId('gmail-label-picker'));
    fireEvent.click(screen.getByTestId('gmail-label-Label_Sales'));
    fireEvent.click(screen.getByTestId('gmail-consent-checkbox'));
    fireEvent.click(screen.getByTestId('gmail-activate'));
    await waitFor(() => expect(setLabelsMock).toHaveBeenCalledTimes(1));
    expect(setLabelsMock).toHaveBeenCalledWith('conn-1', {
      label_ids: ['Label_Sales'],
      consent_acknowledged: true,
    });
    await waitFor(() => expect(onActivated).toHaveBeenCalledTimes(1));
  });

  it('loads labels when mounted with an already-connected connector id', async () => {
    labelsMock.mockResolvedValue({ labels: mockLabels });
    render(<GmailConnectorSetup initialConnectorId="conn-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('gmail-label-picker')).toBeInTheDocument(),
    );
    expect(labelsMock).toHaveBeenCalledWith('conn-1');
    expect(screen.queryByTestId('gmail-connect-google-account')).not.toBeInTheDocument();
  });
});
