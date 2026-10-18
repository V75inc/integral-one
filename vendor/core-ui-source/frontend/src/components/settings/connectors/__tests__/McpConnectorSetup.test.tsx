/**
 * I-CON-06 — MCP mount wizard: posts URL (+ optional headers), lists
 * discovered tool names, never leaves the Authorization value in the DOM
 * after a successful mount. OAuth servers open a popup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../../api/connectors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/connectors')>(
    '../../../../api/connectors',
  );
  return {
    ...actual,
    connectorsApi: {
      ...actual.connectorsApi,
      mountMcp: vi.fn(),
    },
  };
});

import { connectorsApi } from '../../../../api/connectors';
import { McpConnectorSetup } from '../McpConnectorSetup';
import { ToastProvider } from '../../../../context/ToastContext';

const mountMock = connectorsApi.mountMcp as unknown as ReturnType<typeof vi.fn>;

function renderWizard() {
  return render(
    <ToastProvider>
      <McpConnectorSetup />
    </ToastProvider>,
  );
}

const mountedConnector = {
  id: 'con-mcp',
  kind: 'mcp',
  subclass_slug: 'mcp',
  discovered_tools: [{ name: 'echo' }, { name: 'add' }],
  health_status: 'ok',
  auth_state: { url: 'http://127.0.0.1:9/mcp' },
};

describe('McpConnectorSetup', () => {
  beforeEach(() => {
    mountMock.mockReset();
  });

  it('mounts with url only when the header is empty', async () => {
    mountMock.mockResolvedValue({
      status: 'mounted',
      connector: mountedConnector,
    });
    renderWizard();
    fireEvent.change(screen.getByTestId('mcp-mount-url'), {
      target: { value: 'http://127.0.0.1:9/mcp' },
    });
    fireEvent.click(screen.getByTestId('mcp-mount-submit'));
    await waitFor(() =>
      expect(mountMock).toHaveBeenCalledWith({
        transport: 'streamable_http',
        url: 'http://127.0.0.1:9/mcp',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('mcp-mount-tools')).toBeInTheDocument(),
    );
    expect(screen.getByText('echo')).toBeInTheDocument();
    expect(screen.getByText('add')).toBeInTheDocument();
  });

  it('includes Authorization only when filled, then clears it from the input', async () => {
    const secret = 'Bearer super-secret-token';
    mountMock.mockResolvedValue({
      status: 'mounted',
      connector: {
        ...mountedConnector,
        discovered_tools: [{ name: 'echo' }],
        auth_state: { url: 'https://example.com/mcp' },
      },
    });
    const { container } = renderWizard();
    fireEvent.change(screen.getByTestId('mcp-mount-url'), {
      target: { value: 'https://example.com/mcp' },
    });
    fireEvent.change(screen.getByTestId('mcp-mount-authorization'), {
      target: { value: secret },
    });
    fireEvent.click(screen.getByTestId('mcp-mount-submit'));
    await waitFor(() =>
      expect(mountMock).toHaveBeenCalledWith({
        transport: 'streamable_http',
        url: 'https://example.com/mcp',
        headers: { Authorization: secret },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('mcp-mount-tools')).toBeInTheDocument(),
    );
    const authInput = screen.getByTestId(
      'mcp-mount-authorization',
    ) as HTMLInputElement;
    expect(authInput.value).toBe('');
    expect(container.innerHTML).not.toContain('super-secret-token');
    expect(screen.getByText('echo')).toBeInTheDocument();
  });

  it('opens an OAuth popup when the mount returns auth_required', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      closed: false,
      close: vi.fn(),
    } as unknown as Window);
    mountMock.mockResolvedValue({
      status: 'auth_required',
      authorization_url: 'https://idp.example/authorize?client_id=x',
      connector: {
        ...mountedConnector,
        discovered_tools: [],
        health_status: 'unknown',
        auth_state: {
          url: 'https://mcp.example/mcp',
          oauth: { status: 'pending' },
        },
      },
    });
    renderWizard();
    fireEvent.change(screen.getByTestId('mcp-mount-url'), {
      target: { value: 'https://mcp.example/mcp' },
    });
    fireEvent.click(screen.getByTestId('mcp-mount-submit'));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://idp.example/authorize?client_id=x',
        'mcp-oauth',
        expect.any(String),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('mcp-mount-oauth-waiting')).toBeInTheDocument(),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'integral:mcp-oauth',
          ok: true,
          connector: {
            ...mountedConnector,
            discovered_tools: [{ name: 'echo' }],
          },
        },
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('mcp-mount-tools')).toBeInTheDocument(),
    );
    expect(screen.getByText('echo')).toBeInTheDocument();
    openSpy.mockRestore();
  });
});
