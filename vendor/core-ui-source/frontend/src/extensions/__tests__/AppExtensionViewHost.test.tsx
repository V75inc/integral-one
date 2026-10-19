import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AppExtensionViewHost } from '../../components/extensions/AppExtensionViewHost';
import { EXTENSION_PROTOCOL } from '../../components/extensions/extensionProtocol';
import { extensionsApi } from '../../api/extensions';

vi.mock('../../api/extensions', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/extensions')>(),
  extensionsApi: {
    invokeOperation: vi.fn(async (...args: unknown[]) => ({
      app_id: args[0],
      operation_key: args[1],
      output: { ok: true },
    })),
    listCapabilities: vi.fn(),
    invokeQuery: vi.fn(),
  },
}));

vi.mock('../../api/client', () => ({
  default: {
    getUri: vi.fn(() => '/api/extension-view-frame?token=token-abc'),
  },
}));

vi.mock('../../api/extensions', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/extensions')>(),
  extensionsApi: {
    invokeOperation: vi.fn(),
    listCapabilities: vi.fn(async () => ({ capabilities: [] })),
    invokeQuery: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AppExtensionViewHost bridge', () => {
  it('forwards extension operation idempotency keys to the host API', async () => {
    const posted: unknown[] = [];
    const mockWindow = { postMessage: (msg: unknown) => posted.push(msg) };
    render(
      <AppExtensionViewHost
        appId="app-1"
        viewKey="asset_detail"
        workspaceId="ws-1"
        handshakeToken="token-abc"
      />,
    );
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    Object.defineProperty(iframe!, 'contentWindow', {
      value: mockWindow,
      configurable: true,
    });

    window.dispatchEvent(new MessageEvent('message', {
      data: {
        protocol: EXTENSION_PROTOCOL,
        type: 'operation',
        requestId: 'register-1',
        operationKey: 'register_asset',
        idempotencyKey: 'register_asset:stable-retry-key',
        payload: { asset_tag: 'A12-001', title: 'A12 equipment' },
      },
      source: mockWindow as unknown as MessageEventSource,
    }));

    await waitFor(() => {
      expect(extensionsApi.invokeOperation).toHaveBeenCalledWith(
        'app-1',
        'register_asset',
        { asset_tag: 'A12-001', title: 'A12 equipment' },
        'register_asset:stable-retry-key',
      );
      expect(posted.some(msg =>
        (msg as { type?: string; requestId?: string; ok?: boolean }).type === 'operation.result' &&
        (msg as { requestId?: string }).requestId === 'register-1' &&
        (msg as { ok?: boolean }).ok === true,
      )).toBe(true);
    });
  });

  it('keeps the same frame when the parent re-renders with a new inline onError', async () => {
    const props = {
      appId: 'app-1',
      viewKey: 'receive_payment',
      workspaceId: 'ws-1',
      handshakeToken: 'token-abc',
    };
    const { rerender } = render(<AppExtensionViewHost {...props} onError={() => {}} />);
    await waitFor(() => {
      expect(document.querySelector('iframe')).toBeTruthy();
    });
    const first = document.querySelector('iframe');

    rerender(
      <AppExtensionViewHost {...props} onError={() => {}} context={{ draft: { custom_fields: { a: 1 } } }} />,
    );
    rerender(<AppExtensionViewHost {...props} onError={() => {}} />);

    expect(document.querySelector('iframe')).toBe(first);
  });

  it('responds to ready with handshake and answers a read request', async () => {
    const posted: unknown[] = [];
    const mockWindow = {
      postMessage: (msg: unknown) => posted.push(msg),
    };

    const { rerender } = render(
      <AppExtensionViewHost
        appId="app-1"
        viewKey="hello_panel"
        workspaceId="ws-1"
        handshakeToken="token-abc"
        packageVersion="1.0.0"
        context={{ entries: [{ id: 'e1' }, { id: 'e2' }] }}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('iframe')).toBeTruthy();
    });

    const iframe = document.querySelector('iframe');
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    expect(iframe).toHaveAttribute('src', '/api/extension-view-frame?token=token-abc');
    expect(iframe).not.toHaveAttribute('srcdoc');
    Object.defineProperty(iframe!, 'contentWindow', {
      value: mockWindow,
      configurable: true,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { protocol: EXTENSION_PROTOCOL, type: 'ready' },
        source: mockWindow as unknown as MessageEventSource,
      }),
    );

    await waitFor(() => {
      expect(posted.some((msg) => {
        const m = msg as { type?: string; token?: string };
        return m.type === 'handshake' && m.token === 'token-abc';
      })).toBe(true);
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: EXTENSION_PROTOCOL,
          type: 'read',
          requestId: 'r1',
          path: 'entries.count',
        },
        source: mockWindow as unknown as MessageEventSource,
      }),
    );

    await waitFor(() => {
      const result = posted.find((msg) => {
        const m = msg as { type?: string; requestId?: string; value?: number };
        return m.type === 'read.result' && m.requestId === 'r1';
      }) as { ok?: boolean; value?: number };
      expect(result?.ok).toBe(true);
      expect(result?.value).toBe(2);
    });

    rerender(
      <AppExtensionViewHost
        appId="app-1"
        viewKey="hello_panel"
        workspaceId="ws-1"
        handshakeToken="token-abc"
        context={{ entries: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] }}
      />,
    );
    await waitFor(() => {
      expect(posted.some((msg) => (msg as { type?: string }).type === 'refresh')).toBe(true);
    });
    window.dispatchEvent(new MessageEvent('message', {
      data: { protocol: EXTENSION_PROTOCOL, type: 'read', requestId: 'updated', path: 'entries.count' },
      source: mockWindow as unknown as MessageEventSource,
    }));
    await waitFor(() => {
      const updated = posted.find((msg) => (msg as { requestId?: string }).requestId === 'updated') as { value?: number };
      expect(updated?.value).toBe(3);
    });
  });

  it('forwards draft.patch to the host callback', async () => {
    const posted: unknown[] = [];
    const onDraftPatch = vi.fn();
    const mockWindow = {
      postMessage: (msg: unknown) => posted.push(msg),
    };

    render(
      <AppExtensionViewHost
        appId="app-1"
        viewKey="document_lines"
        workspaceId="ws-1"
        handshakeToken="token-abc"
        context={{ draft: { custom_fields: {} } }}
        onDraftPatch={onDraftPatch}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('iframe')).toBeTruthy();
    });

    const iframe = document.querySelector('iframe');
    Object.defineProperty(iframe!, 'contentWindow', {
      value: mockWindow,
      configurable: true,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: EXTENSION_PROTOCOL,
          type: 'draft.patch',
          custom_fields: { total_amount: 42 },
          related: { lines: [{ description: 'A' }] },
        },
        source: mockWindow as unknown as MessageEventSource,
      }),
    );

    await waitFor(() => {
      expect(onDraftPatch).toHaveBeenCalledWith({
        custom_fields: { total_amount: 42 },
        related: { lines: [{ description: 'A' }] },
      });
    });
  });
});

it('forwards withheld completion without inventing output or repeating the operation', async () => {
  const completion = {
    output_disposition: 'withheld' as const,
    current_state_verified: false as const,
    operation_receipt: { id: 'o.OperationExecutionReceipt.' + 'a'.repeat(64), status: 'succeeded' as const, replayed: true as const },
  };
  vi.mocked(extensionsApi.invokeOperation).mockReset().mockResolvedValue(completion);
  const posted: unknown[] = [];
  const frameWindow = { postMessage: (message: unknown) => posted.push(message) };
  render(<AppExtensionViewHost appId="app" viewKey="record_view" workspaceId="workspace" handshakeToken="token" />);
  const iframe = document.querySelector('iframe')!;
  Object.defineProperty(iframe, 'contentWindow', { value: frameWindow, configurable: true });
  window.dispatchEvent(new MessageEvent('message', {
    data: { protocol: EXTENSION_PROTOCOL, type: 'operation', requestId: 'retry-1', operationKey: 'record', idempotencyKey: 'same-intent', payload: {} },
    source: frameWindow as unknown as MessageEventSource,
  }));
  await waitFor(() => expect(posted).toContainEqual({
    protocol: EXTENSION_PROTOCOL, type: 'operation.result', requestId: 'retry-1', ok: false, value: completion,
    error: 'This action completed earlier. Its saved result is unavailable; current records have not been verified.',
    error_code: 'operation_output_withheld', retryable: false,
  }));
  expect(extensionsApi.invokeOperation).toHaveBeenCalledTimes(1);
  expect('output' in completion).toBe(false);
  expect(await screen.findByRole('status')).toHaveTextContent('completed earlier');
});

it.each(['operation', 'query', 'capabilities'] as const)(
  'drops a delayed %s reply after a sandbox scope switch', async type => {
    let finish!: (value: unknown) => void;
    const delayed = new Promise(resolve => { finish = resolve; });
    const method = type === 'operation' ? extensionsApi.invokeOperation
      : type === 'query' ? extensionsApi.invokeQuery : extensionsApi.listCapabilities;
    vi.mocked(method).mockReset().mockReturnValue(delayed as never);
    const oldMessages: unknown[] = [], newMessages: unknown[] = [];
    const oldWindow = { postMessage: (message: unknown) => oldMessages.push(message) };
    const newWindow = { postMessage: (message: unknown) => newMessages.push(message) };
    const { rerender } = render(<AppExtensionViewHost appId="app-a" viewKey="view" workspaceId="ws-a" handshakeToken="token-a" />);
    Object.defineProperty(document.querySelector('iframe')!, 'contentWindow', { value: oldWindow, configurable: true });
    window.dispatchEvent(new MessageEvent('message', {
      data: { protocol: EXTENSION_PROTOCOL, type, requestId: 'old-request', operationKey: 'record', capabilityKey: 'read', idempotencyKey: 'same-intent' },
      source: oldWindow as unknown as MessageEventSource,
    }));
    await waitFor(() => expect(method).toHaveBeenCalledTimes(1));
    rerender(<AppExtensionViewHost appId="app-b" viewKey="view" workspaceId="ws-b" handshakeToken="token-b" />);
    Object.defineProperty(document.querySelector('iframe')!, 'contentWindow', { value: newWindow, configurable: true });
    await act(async () => finish({ app_id: 'app-a', output: { private: 'original-scope' }, capabilities: [{ app_id: 'app-a', private: 'original-scope' }] }));
    expect([...oldMessages, ...newMessages].some(message => (message as { requestId?: string }).requestId === 'old-request')).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
    expect(method).toHaveBeenCalledTimes(1);
  },
);

it('does not grant a reused old frame token a new App scope', () => {
  vi.mocked(extensionsApi.invokeOperation).mockReset();
  const originalWindow = { postMessage: vi.fn() };
  const { rerender } = render(<AppExtensionViewHost appId="app-a" viewKey="view" workspaceId="ws-a" handshakeToken="same-token" />);
  Object.defineProperty(document.querySelector('iframe')!, 'contentWindow', { value: originalWindow, configurable: true });
  rerender(<AppExtensionViewHost appId="app-b" viewKey="view" workspaceId="ws-b" handshakeToken="same-token" />);
  expect(document.querySelector('iframe')).toBeNull();
  window.dispatchEvent(new MessageEvent('message', {
    data: { protocol: EXTENSION_PROTOCOL, type: 'operation', requestId: 'stale-frame', operationKey: 'record' },
    source: originalWindow as unknown as MessageEventSource,
  }));
  expect(extensionsApi.invokeOperation).not.toHaveBeenCalled();
});

it('does not turn a pending draft submission into success when its frame closes', async () => {
  const ref = { current: null as import('../../components/extensions/AppExtensionViewHost').AppExtensionViewHostHandle | null };
  const messages: unknown[] = [];
  const frameWindow = { postMessage: (message: unknown) => messages.push(message) };
  const { unmount } = render(<AppExtensionViewHost ref={ref} appId="app" viewKey="view" workspaceId="workspace" handshakeToken="token" />);
  Object.defineProperty(document.querySelector('iframe')!, 'contentWindow', { value: frameWindow, configurable: true });
  const pending = ref.current!.requestSubmit('original-entry');
  expect(messages.some(message => (message as { type?: string }).type === 'draft.submit')).toBe(true);
  unmount();
  await expect(pending).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Check the original record') });
});
