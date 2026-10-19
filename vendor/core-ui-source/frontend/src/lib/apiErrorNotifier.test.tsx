import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemNotificationBar } from '../components/system/SystemNotificationBar';
import { SystemNotificationsProvider } from '../components/system/SystemNotificationsContext';
import { notifyApiFailure } from './apiErrorNotifier';

afterEach(cleanup);

describe('API error notices', () => {
  it.each(['ECONNABORTED', 'ETIMEDOUT'])('does not offer Retry for an uncertain write after %s', code => {
    render(<SystemNotificationsProvider><SystemNotificationBar /></SystemNotificationsProvider>);
    act(() => notifyApiFailure({ code, config: { method: 'post' } }, { onRetry: vi.fn() }));
    expect(screen.getByRole('status')).toHaveTextContent('The change may still complete');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('allows a timed-out read to be retried', () => {
    render(<SystemNotificationsProvider><SystemNotificationBar /></SystemNotificationsProvider>);
    act(() => notifyApiFailure({ code: 'ECONNABORTED', config: { method: 'get' } }, { onRetry: vi.fn() }));
    expect(screen.getByRole('status')).toHaveTextContent('refresh to check for updates');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });
  it.each([
    [408, 'Slow connection', 'Try again when your connection improves.'],
    [429, 'Too many requests', 'Wait a moment, then try again.'],
    [500, 'Integral is having trouble', 'Try again in a moment.'],
  ])('offers concise guidance for %s without exposing server diagnostics', (status, title, body) => {
    render(<SystemNotificationsProvider><SystemNotificationBar /></SystemNotificationsProvider>);
    const onRetry = vi.fn();
    act(() => notifyApiFailure({ response: { status, data: { error_code: 'internal_code' } } }, { onRetry }));
    expect(screen.getByText(title)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(body);
    expect(screen.getByRole('status')).not.toHaveTextContent('internal_code');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('leaves authentication and permission failures to their dedicated flows', () => {
    render(<SystemNotificationsProvider><SystemNotificationBar /></SystemNotificationsProvider>);
    act(() => {
      notifyApiFailure({ response: { status: 401 } });
      notifyApiFailure({ response: { status: 403 } });
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
