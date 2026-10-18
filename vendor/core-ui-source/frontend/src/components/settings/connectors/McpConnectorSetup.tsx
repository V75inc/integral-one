/**
 * I-CON-06 — mount an external Streamable-HTTP MCP server as a workspace
 * Connector. Grants the resident tools; does not mirror records into Tracks.
 *
 * Authorization headers are write-only: sent on mount, then cleared from
 * local state. They are never rendered from ``auth_state``.
 *
 * Servers that answer the probe with 401 (and no static Authorization
 * header) open an OAuth popup. The callback page posts tools back via
 * ``postMessage``.
 */

import { useEffect, useState } from 'react';

import {
  MCP_OAUTH_MESSAGE_TYPE,
  connectorsApi,
  type ConnectorResponse,
  type DiscoveredMcpTool,
} from '../../../api/connectors';
import { Button } from '../../ui/Button';
import { Input, Text } from '../../../ui';
import { Field } from '../../../patterns';
import { useToast } from '../../../context/ToastContext';

export interface McpConnectorSetupProps {
  onMounted?: (connector: ConnectorResponse) => void;
}

function toolsFromConnector(connector: ConnectorResponse): DiscoveredMcpTool[] {
  if (connector.discovered_tools?.length) {
    return connector.discovered_tools;
  }
  const raw = connector.auth_state?.discovered_tools;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is DiscoveredMcpTool =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as DiscoveredMcpTool).name === 'string',
  );
}

function toolNames(connector: ConnectorResponse): string[] {
  return toolsFromConnector(connector).map(t => t.name).filter(Boolean);
}

export function McpConnectorSetup({ onMounted }: McpConnectorSetupProps) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [authorization, setAuthorization] = useState('');
  const [busy, setBusy] = useState(false);
  const [awaitingOauth, setAwaitingOauth] = useState(false);
  const [error, setError] = useState('');
  const [mountedNames, setMountedNames] = useState<string[] | null>(null);

  useEffect(() => {
    if (!awaitingOauth) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        ok?: boolean;
        connector?: ConnectorResponse;
        error?: string;
      };
      if (!data || data.type !== MCP_OAUTH_MESSAGE_TYPE) return;
      setAwaitingOauth(false);
      setBusy(false);
      if (data.ok && data.connector) {
        const names = toolNames(data.connector);
        setMountedNames(names);
        toast.showToast(
          names.length
            ? `MCP mounted — ${names.length} tool${names.length === 1 ? '' : 's'}`
            : 'MCP mounted',
          'success',
        );
        onMounted?.(data.connector);
      } else {
        const message = data.error || 'Authorization was cancelled';
        setError(message);
        toast.showToast(message, 'error');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [awaitingOauth, onMounted, toast]);

  const submit = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('URL is required');
      return;
    }
    setBusy(true);
    setError('');
    const headerValue = authorization.trim();
    let holdBusy = false;
    try {
      const body: {
        transport: 'streamable_http';
        url: string;
        headers?: Record<string, string>;
      } = {
        transport: 'streamable_http',
        url: trimmedUrl,
      };
      if (headerValue) {
        body.headers = { Authorization: headerValue };
      }
      const result = await connectorsApi.mountMcp(body);
      setAuthorization('');
      if (result.status === 'auth_required' && result.authorization_url) {
        const popup = window.open(
          result.authorization_url,
          'mcp-oauth',
          'width=600,height=720,scrollbars=yes',
        );
        if (!popup) {
          const message =
            'Popup blocked. Allow popups to authorize this MCP server.';
          setError(message);
          toast.showToast(message, 'error');
          setBusy(false);
          return;
        }
        holdBusy = true;
        setAwaitingOauth(true);
        return;
      }
      const created = result.connector;
      const names = toolNames(created);
      setMountedNames(names);
      toast.showToast(
        names.length
          ? `MCP mounted — ${names.length} tool${names.length === 1 ? '' : 's'}`
          : 'MCP mounted',
        'success',
      );
      onMounted?.(created);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to mount MCP server';
      setError(message);
      toast.showToast(message, 'error');
    } finally {
      if (!holdBusy) {
        setBusy(false);
      }
    }
  };

  return (
    <div
      data-testid="mcp-connector-setup"
      className="rounded-md border border-[var(--panel-border)] p-4"
    >
      <Text variant="heading-sm">Mount MCP server</Text>
      <Text variant="meta" as="p" className="mt-1">
        Connect a Streamable-HTTP MCP server so the resident can call its
        tools. This does not mirror records into Tracks.
      </Text>

      <div className="mt-3 flex flex-col gap-3">
        <Field label="Server URL" htmlFor="mcp-mount-url">
          <Input
            id="mcp-mount-url"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            monospace
            data-testid="mcp-mount-url"
            autoComplete="off"
            required
          />
        </Field>
        <Field
          label="Authorization header (optional)"
          htmlFor="mcp-mount-authorization"
          hint="Write-only. Never shown after mount. Leave blank to use OAuth."
        >
          <Input
            id="mcp-mount-authorization"
            type="password"
            value={authorization}
            onChange={e => setAuthorization(e.target.value)}
            placeholder="Bearer …"
            data-testid="mcp-mount-authorization"
            autoComplete="off"
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={submit}
          loading={busy}
          disabled={busy}
          data-testid="mcp-mount-submit"
        >
          {busy ? (awaitingOauth ? 'Waiting for authorization…' : 'Mounting…') : 'Mount server'}
        </Button>
      </div>

      {awaitingOauth ? (
        <div className="mt-3" data-testid="mcp-mount-oauth-waiting">
          <Text variant="meta" as="p">
            Complete sign-in in the popup window.
          </Text>
        </div>
      ) : null}

      {mountedNames ? (
        <div className="mt-3" data-testid="mcp-mount-tools">
          {mountedNames.length === 0 ? (
            <Text variant="meta" tone="muted" as="p">
              Mounted — no tools discovered.
            </Text>
          ) : (
            <>
              <Text variant="meta" tone="muted" as="p">
                Discovered tools
              </Text>
              <ul className="mt-1 flex flex-col gap-0.5">
                {mountedNames.map(name => (
                  <li key={name}>
                    <Text variant="mono">{name}</Text>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <Text variant="meta" tone="danger" as="p" className="mt-2" data-testid="mcp-mount-error">
          {error}
        </Text>
      ) : null}
    </div>
  );
}
