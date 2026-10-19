import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mountMock = vi.fn();

vi.mock('../../../../api/connectors', () => ({
  MCP_OAUTH_MESSAGE_TYPE: 'integral:mcp-oauth',
  connectorsApi: {
    mountMcp: (...args: unknown[]) => mountMock(...args),
  },
}));

vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import { CustomMcpMountModal } from '../CustomMcpMountModal';

describe('CustomMcpMountModal', () => {
  beforeEach(() => {
    mountMock.mockReset();
  });

  it('renders correctly and submits stdio mount with shared mode', async () => {
    mountMock.mockResolvedValue({
      status: 'mounted',
      connector: { id: 'c-1', kind: 'mcp' },
    });
    const onMounted = vi.fn();
    render(
      <CustomMcpMountModal
        open={true}
        onClose={() => undefined}
        onMounted={onMounted}
        sharingAllowed={true}
      />,
    );

    // Switch transport to stdio
    fireEvent.change(screen.getByTestId('custom-mcp-transport'), {
      target: { value: 'stdio' },
    });

    // Fill in display name and label
    fireEvent.change(screen.getByTestId('custom-mcp-display-name'), {
      target: { value: 'My Local MCP' },
    });
    fireEvent.change(screen.getByTestId('custom-mcp-label'), {
      target: { value: 'Local CLI' },
    });

    // Select shared mode
    fireEvent.click(screen.getByTestId('custom-mcp-mode-shared'));

    // Fill in command and args
    fireEvent.change(screen.getByTestId('custom-mcp-command'), {
      target: { value: 'python' },
    });
    fireEvent.change(screen.getByTestId('custom-mcp-args'), {
      target: { value: '-m my_mcp_server' },
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1));
    expect(mountMock).toHaveBeenCalledWith({
      transport: 'stdio',
      display_name: 'My Local MCP',
      label: 'Local CLI',
      connection_mode: 'shared',
      command: 'python',
      args: ['-m', 'my_mcp_server'],
    });
    await waitFor(() => expect(onMounted).toHaveBeenCalledTimes(1));
  });

  it('submits streamable_http mount with authorization header', async () => {
    mountMock.mockResolvedValue({
      status: 'mounted',
      connector: { id: 'c-2', kind: 'mcp' },
    });
    const onMounted = vi.fn();
    render(
      <CustomMcpMountModal
        open={true}
        onClose={() => undefined}
        onMounted={onMounted}
        sharingAllowed={false}
      />,
    );

    // Mode picker is hidden when sharingAllowed is false
    expect(screen.queryByRole('radiogroup')).toBeNull();

    // Fill in url and auth token
    fireEvent.change(screen.getByTestId('custom-mcp-url'), {
      target: { value: 'https://mcp.example.com/api' },
    });
    fireEvent.change(screen.getByTestId('custom-mcp-authorization'), {
      target: { value: 'secret-token-123' },
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1));
    expect(mountMock).toHaveBeenCalledWith({
      transport: 'streamable_http',
      display_name: undefined,
      label: undefined,
      connection_mode: 'per_user',
      url: 'https://mcp.example.com/api',
      headers: { Authorization: 'Bearer secret-token-123' },
    });
    await waitFor(() => expect(onMounted).toHaveBeenCalledTimes(1));
  });
});
