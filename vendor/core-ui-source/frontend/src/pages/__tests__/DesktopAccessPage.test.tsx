import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DesktopAccessPage } from '../DesktopAccessPage';
vi.mock('../../context/AuthContext', () => ({useAuth: () => ({user: null})}));
afterEach(() => {cleanup(); delete window.integralDesktop;});
describe('desktop account return access', () => {
  it('uses the native account sign-in instead of Core password login', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('cancelled'));
    window.integralDesktop = {session: vi.fn(), signIn};
    render(<MemoryRouter><DesktopAccessPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', {name: 'Sign in'}));
    await waitFor(() => expect(signIn).toHaveBeenCalledOnce());
    expect(await screen.findByRole('alert')).toHaveTextContent('local data is unchanged');
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });
  it('makes offline access an explicit native operation', async () => {
    const resumeOffline = vi.fn().mockRejectedValue(new Error('recovery'));
    window.integralDesktop = {session: vi.fn(), resumeOffline};
    render(<MemoryRouter><DesktopAccessPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', {name: 'Continue offline'}));
    await waitFor(() => expect(resumeOffline).toHaveBeenCalledOnce());
    expect(await screen.findByRole('alert')).toHaveTextContent('local data is unchanged');
    expect(screen.getByText(/does not lock or encrypt/)).toBeInTheDocument();
  });
  it('offers no native session authority in an ordinary browser', () => {
    render(<MemoryRouter><DesktopAccessPage /></MemoryRouter>);
    expect(screen.queryByRole('button', {name: 'Sign in'})).not.toBeInTheDocument();
    expect(screen.getByText('Open the Integral desktop app to access this installation.')).toBeInTheDocument();
  });
});
