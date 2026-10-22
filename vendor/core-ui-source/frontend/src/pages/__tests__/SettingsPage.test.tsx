import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../features/settings/store', () => ({ useSettings: () => [{}, vi.fn()] }));
vi.mock('../../hooks/usePublishPageContext', () => ({ usePublishPageContext: vi.fn() }));
vi.mock('../../host/registry', () => ({ getRegisteredSettingsSections: () => [] }));
vi.mock('../../components/ui', () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>, PageSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../features/settings/sections/ProfileSection', () => ({ ProfileSection: () => <h2>Profile details</h2> }));
vi.mock('../../features/settings/sections/AppearanceSection', () => ({ AppearanceSection: () => <h2>Appearance details</h2> }));
vi.mock('../../features/settings/sections/AboutSection', () => ({ AboutSection: () => <h2>About Integral</h2> }));
vi.mock('../../features/settings/sections/GetStartedSection', () => ({ GetStartedSection: () => <h2>Getting started</h2> }));
import { SettingsPage } from '../SettingsPage';

afterEach(cleanup);
const show = (path = '/settings') => render(<MemoryRouter initialEntries={[path]}><SettingsPage /></MemoryRouter>);
describe('Settings navigation', () => {
  it('starts at Profile and groups the menu by purpose', async () => {
    show();
    expect(await screen.findByRole('heading', { name: 'Profile details' })).toBeInTheDocument();
    expect(screen.getByText('Your account')).toBeInTheDocument();
    expect(screen.getByText('AI & connections')).toBeInTheDocument();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Settings sections' })).getAllByRole('button').map(b => b.textContent)).toEqual(['Profile', 'Appearance', 'Notifications', 'Voice input', 'AI Models', 'Connected agents', 'AI Skills', 'Connectors', 'Search', 'Sharing', 'Policies', 'Conflicts', 'Audit log', 'Help & about']);
  });
  it('does not expose Operational Models through an old Settings link', async () => {
    show('/settings#library');
    expect(await screen.findByRole('heading', { name: 'Profile details' })).toBeInTheDocument();
    expect(screen.queryByText('Operational Models')).not.toBeInTheDocument();
  });
  it.each(['about', 'get-started'])('preserves the old #%s help link', async hash => {
    show(`/settings#${hash}`);
    expect(await screen.findByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About Integral' })).toBeInTheDocument();
  });
  it('filters settings and shows an empty result explicitly', () => {
    show();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a setting' }), { target: { value: 'voice' } });
    expect(screen.getByRole('button', { name: 'Voice input' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Policies' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a setting' }), { target: { value: 'nonexistent' } });
    expect(screen.getByText('No matching settings.')).toBeInTheDocument();
  });
  it('keeps the compact menu inside a short viewport as it resizes', () => {
    show();
    const trigger = screen.getByRole('button', { name: /Settings menu/ });
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 350, configurable: true });
    const bounds = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ top: 250, bottom: 294 } as DOMRect);
    try {
      fireEvent.click(trigger);
      const menu = document.getElementById('settings-compact-nav')!;
      expect(menu.style.bottom).toBe('calc(100% + 0.5rem)');
      expect(menu.style.getPropertyValue('--settings-menu-space')).toBe('234px');
      bounds.mockReturnValue({ top: 80, bottom: 124 } as DOMRect);
      Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });
      fireEvent(window, new Event('resize'));
      expect(menu.style.top).toBe('calc(100% + 0.5rem)');
      expect(menu.style.getPropertyValue('--settings-menu-space')).toBe('160px');
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: originalHeight, configurable: true });
      bounds.mockRestore();
    }
  });

  it('focuses compact search and restores focus on Escape', () => {
    show();
    const trigger = screen.getByRole('button', { name: /Settings menu/ });
    fireEvent.click(trigger);
    const menu = document.getElementById('settings-compact-nav')!;
    expect(within(menu).getByRole('textbox')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
