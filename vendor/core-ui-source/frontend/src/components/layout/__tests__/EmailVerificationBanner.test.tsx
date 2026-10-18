import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EmailVerificationBanner } from '../EmailVerificationBanner';
import { SystemNotificationBar } from '../../system/SystemNotificationBar';
import { SystemNotificationsProvider } from '../../system/SystemNotificationsContext';

vi.mock('../../../context/AuthContext', () => { const user = { id: 'banner-user', email_verified: false }; return { useAuth: () => ({ user }) }; });
vi.mock('../../../context/ToastContext', () => { const showToast = vi.fn(); return { useToast: () => ({ showToast }) }; });
vi.mock('../../../api', () => ({ authApi: { resendVerification: vi.fn().mockResolvedValue({}) } }));

afterEach(() => { cleanup(); sessionStorage.clear(); });
function View() {
  return <MemoryRouter initialEntries={['/agent']}><SystemNotificationsProvider>
    <EmailVerificationBanner /><SystemNotificationBar />
    <Routes><Route path="/agent" element={<p>Workspace</p>} /><Route path="/verify-email" element={<p>Code entry</p>} /></Routes>
  </SystemNotificationsProvider></MemoryRouter>;
}

describe('email verification notice', () => {
  it('offers concise verification actions and an accessible close button', () => {
    render(<View />);
    expect(screen.getByText('Verify your email')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enter code' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeVisible();
    expect(screen.queryByText('Not now')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Verify your email')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('auth:email-verification:dismissed:banner-user')).toBe('1');
  });
  it('keeps dismissal for this browser session after remounting', () => {
    const view = render(<View />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    view.unmount(); render(<View />);
    expect(screen.queryByText('Verify your email')).not.toBeInTheDocument();
  });
  it('routes to code entry without treating component cleanup as user dismissal', () => {
    const view = render(<View />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter code' }));
    expect(screen.getByText('Code entry')).toBeVisible();
    view.unmount();
    expect(sessionStorage.getItem('auth:email-verification:dismissed:banner-user')).toBeNull();
  });
});
