import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailCheck } from 'lucide-react';
import { SystemNotificationBar } from '../SystemNotificationBar';
import {
  getSystemNotificationsApi,
  SystemNotificationsProvider,
  type SystemNotificationInput,
} from '../SystemNotificationsContext';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

function show(notification: SystemNotificationInput) {
  render(<SystemNotificationsProvider><SystemNotificationBar /></SystemNotificationsProvider>);
  act(() => { getSystemNotificationsApi()!.notify(notification); });
}

describe('system notification bar', () => {
  it.each(['info', 'warning', 'error', 'success'] as const)('renders %s using shared typography and a colored icon', type => {
    show({ type, title: 'Notice', body: 'A useful next step.', actions: [{ label: 'Continue', onClick: vi.fn() }] });
    const bar = screen.getByRole('status');
    expect(bar).toHaveAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    expect(bar.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(bar.querySelector('svg')!.style.color).toMatch(/system-bar-/);
    expect(screen.getByText('Notice').className).toContain('text-xs');
    expect(screen.getByText('Continue').className).toContain('text-xs');
    expect(bar.textContent).toContain('Notice · A useful next step.');
  });

  it('supports custom icons and notices without actions or dismissal', () => {
    show({ type: 'info', icon: MailCheck, title: 'Verify your email', dismissible: false });
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('lucide-mail-check');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the action label and disables duplicate clicks while it is pending', async () => {
    let finish!: () => void;
    const onClick = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    show({ type: 'warning', title: 'AI credits used up', actions: [{ label: 'Top up balance', onClick }] });
    const button = screen.getByRole('button', { name: 'Top up balance' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(button).not.toBeDisabled();
  });

  it('reveals queued notices on dismissal and releases the layout offset on unmount', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 1280, height: 57, top: 0, right: 1280,
      bottom: 57, left: 0, toJSON: () => ({}),
    });
    show({ id: 'verification', type: 'info', title: 'Verify your email' });
    act(() => {
      getSystemNotificationsApi()!.notify({ id: 'quota', type: 'warning', title: 'AI credits used up' });
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('AI credits used up')).toBeVisible();
    expect(document.documentElement.style.getPropertyValue('--system-bar-h')).toBe('57px');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.getByText('Verify your email')).toBeVisible();
    expect(document.documentElement.style.getPropertyValue('--system-bar-h')).toBe('57px');
    cleanup();
    expect(document.documentElement.style.getPropertyValue('--system-bar-h')).toBe('0px');
  });
});
