/**
 * Popup callback for outbound MCP OAuth — posts code/state to the backend
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
    mcpOAuthCallback: (...args: unknown[]) => callbackMock(...args),
  },
}));

import { McpOAuthCallbackPage, resetMcpOAuthExchangesForTests } from './McpOAuthCallbackPage';

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/settings/connectors/mcp/oauth/callback${search}`]}>
      <McpOAuthCallbackPage />
    </MemoryRouter>,
  );
}

describe('McpOAuthCallbackPage', () => {
  let closeSpy: ReturnType<typeof vi.fn>;
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    callbackMock.mockReset();
    resetMcpOAuthExchangesForTests();
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
  });

  it('exchanges code/state, notifies the opener, and closes', async () => {
    const connector = {
      id: 'con-1',
      subclass_slug: 'mcp',
      discovered_tools: [{ name: 'echo' }],
    };
    callbackMock.mockResolvedValue(connector);
    renderAt('?code=abc&state=signed');
    await waitFor(() =>
      expect(callbackMock).toHaveBeenCalledWith({
        code: 'abc',
        state: 'signed',
      }),
    );
    await waitFor(() => expect(postMessageSpy).toHaveBeenCalled());
    expect(postMessageSpy.mock.calls[0][0]).toEqual({
      type: 'integral:mcp-oauth',
      ok: true,
      connector,
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('exchanges the authorization code only once if the page remounts', async () => {
    callbackMock.mockResolvedValue({ id: 'con-1' });
    const first = renderAt('?code=abc&state=signed');
    first.unmount();
    renderAt('?code=abc&state=signed');
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

  it('shows the backend message when tool discovery fails after OAuth', async () => {
    const err = Object.assign(new Error('Request failed with status code 503'), {
      response: {
        data: {
          error_code: 'validation_error',
          message:
            'Google Drive MCP returned 403. Enable Google Drive API (drive.googleapis.com)',
        },
      },
    });
    callbackMock.mockRejectedValue(err);
    renderAt('?code=abc&state=signed');
    expect(
      await screen.findByText(/Enable Google Drive API/i),
    ).toBeInTheDocument();
    expect(postMessageSpy.mock.calls[0][0]).toMatchObject({
      ok: false,
      error: expect.stringContaining('Enable Google Drive API'),
    });
  });
});
