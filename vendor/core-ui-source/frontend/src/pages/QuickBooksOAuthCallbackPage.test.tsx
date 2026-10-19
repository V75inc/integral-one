/**
 * Popup callback for Intuit QuickBooks OAuth — posts code/state/realmId
 * and notifies the opener via postMessage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

const callbackMock = vi.fn();

vi.mock('../api/connectors', () => ({
  MCP_OAUTH_MESSAGE_TYPE: 'integral:mcp-oauth',
  connectorsApi: {
    quickbooksCallback: (...args: unknown[]) => callbackMock(...args),
  },
}));

import {
  QuickBooksOAuthCallbackPage,
  resetQuickBooksOAuthExchangesForTests,
} from './QuickBooksOAuthCallbackPage';

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/connectors/quickbooks/callback${search}`]}>
      <QuickBooksOAuthCallbackPage />
    </MemoryRouter>,
  );
}

describe('QuickBooksOAuthCallbackPage', () => {
  let closeSpy: ReturnType<typeof vi.fn>;
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    callbackMock.mockReset();
    resetQuickBooksOAuthExchangesForTests();
    closeSpy = vi.fn();
    postMessageSpy = vi.fn();
    Object.defineProperty(window, 'close', {
      configurable: true,
      value: closeSpy,
    });
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { closed: false, postMessage: postMessageSpy },
    });
  });

  afterEach(() => {
    cleanup();
    // The popup schedules a second close. Finish it before JSDOM teardown.
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('exchanges code/state/realmId, notifies the opener, and closes', async () => {
    callbackMock.mockResolvedValue({
      connector_id: 'con-1',
      realm_id: 'realm-1',
      connected: true,
    });
    renderAt('?code=abc&state=signed&realmId=realm-1');
    await waitFor(() =>
      expect(callbackMock).toHaveBeenCalledWith({
        code: 'abc',
        state: 'signed',
        realmId: 'realm-1',
      }),
    );
    await waitFor(() => expect(postMessageSpy).toHaveBeenCalled());
    expect(postMessageSpy.mock.calls[0][0]).toEqual({
      type: 'integral:mcp-oauth',
      ok: true,
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('exchanges the authorization code only once if the page remounts', async () => {
    callbackMock.mockResolvedValue({ connector_id: 'con-1', connected: true });
    const first = renderAt('?code=abc&state=signed&realmId=realm-1');
    first.unmount();
    renderAt('?code=abc&state=signed&realmId=realm-1');
    await waitFor(() => expect(callbackMock).toHaveBeenCalledTimes(1));
  });

  it('forwards IdP errors to the opener without calling the API', async () => {
    renderAt('?error=access_denied&error_description=User%20denied');
    await waitFor(() => expect(postMessageSpy).toHaveBeenCalled());
    expect(callbackMock).not.toHaveBeenCalled();
    expect(postMessageSpy.mock.calls[0][0]).toMatchObject({
      type: 'integral:mcp-oauth',
      ok: false,
      error: 'User denied',
    });
  });

  it('shows an error when realmId is missing', async () => {
    renderAt('?code=abc&state=signed');
    expect(
      await screen.findByText(/Missing authorization code, state, or company id/i),
    ).toBeInTheDocument();
    expect(callbackMock).not.toHaveBeenCalled();
  });
});
