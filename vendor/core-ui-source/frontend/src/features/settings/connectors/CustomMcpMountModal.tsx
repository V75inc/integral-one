/**
 * Mount a custom MCP server (HTTP or stdio) that is not in the vetted catalog.
 * HTTP mounts that require OAuth open a consent popup, same as catalog install.
 */
import { useEffect, useState } from 'react';

import {
  MCP_OAUTH_MESSAGE_TYPE,
  connectorsApi,
  type ConnectionMode,
  type ConnectorResponse,
  type MountMcpConnectorRequest,
} from '../../../api/connectors';
import { Input, Select, Text } from '../../../ui';
import { Field } from '../../../patterns';
import { FormDialog } from '../../../templates';
import { useToast } from '../../../context/ToastContext';

type McpTransport = 'streamable_http' | 'stdio';

interface Props {
  open: boolean;
  onClose: () => void;
  onMounted: (connector: ConnectorResponse) => void;
  /** False in personal workspaces: everything is per-user, mode hidden. */
  sharingAllowed?: boolean;
}

function parseArgs(s: string): string[] {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** TickTick (and similar) docs use `Authorization: Bearer <token>`. */
function authorizationHeader(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  if (/^(bearer|basic)\s+/i.test(text)) return text;
  return `Bearer ${text}`;
}

export function CustomMcpMountModal({
  open,
  onClose,
  onMounted,
  sharingAllowed = true,
}: Props) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState('');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<ConnectionMode>('per_user');
  const effectiveMode: ConnectionMode = sharingAllowed ? mode : 'per_user';
  const [transport, setTransport] = useState<McpTransport>('streamable_http');
  const [url, setUrl] = useState('');
  const [authorization, setAuthorization] = useState('');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [pending, setPending] = useState(false);
  const [awaitingOauth, setAwaitingOauth] = useState(false);

  const reset = () => {
    setDisplayName('');
    setLabel('');
    setMode('per_user');
    setTransport('streamable_http');
    setUrl('');
    setAuthorization('');
    setCommand('');
    setArgsText('');
    setPending(false);
    setAwaitingOauth(false);
  };

  const handleClose = () => {
    if (pending) return;
    reset();
    onClose();
  };

  useEffect(() => {
    if (!awaitingOauth) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        ok?: boolean;
        connector?: ConnectorResponse;
        connection_mode?: string;
        error?: string;
      };
      if (!data || data.type !== MCP_OAUTH_MESSAGE_TYPE) return;
      setAwaitingOauth(false);
      setPending(false);
      if (data.ok && data.connector) {
        const sharedNote =
          data.connection_mode === 'shared' ? ' (shared connection)' : '';
        toast.showToast(`Custom MCP server connected${sharedNote}`, 'success');
        reset();
        onMounted(data.connector);
        return;
      }
      const message = data.error || 'Authorization was cancelled';
      toast.showToast(message, 'error');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [awaitingOauth, onMounted, toast]);

  const submit = async () => {
    if (transport === 'streamable_http' && !url.trim()) {
      toast.showToast('HTTP mount requires a URL', 'error');
      return;
    }
    if (transport === 'stdio' && !command.trim()) {
      toast.showToast('stdio mount requires a command', 'error');
      return;
    }
    setPending(true);
    const headerValue = authorizationHeader(authorization);
    const body: MountMcpConnectorRequest = {
      transport,
      display_name: displayName.trim() || undefined,
      label: label.trim() || undefined,
      connection_mode: effectiveMode,
    };
    if (transport === 'stdio') {
      body.command = command.trim();
      body.args = parseArgs(argsText);
    } else {
      body.url = url.trim();
      if (headerValue) {
        body.headers = { Authorization: headerValue };
      }
    }
    try {
      const result = await connectorsApi.mountMcp(body);
      setAuthorization('');
      if (result.status === 'auth_required' && result.authorization_url) {
        const popup = window.open(
          result.authorization_url,
          'mcp-oauth',
          'width=600,height=720,scrollbars=yes',
        );
        if (!popup) {
          toast.showToast(
            'Popup blocked. Allow popups to authorize this MCP server.',
            'error',
          );
          setPending(false);
          return;
        }
        setAwaitingOauth(true);
        return;
      }
      const sharedNote =
        effectiveMode === 'shared' ? ' (shared connection)' : '';
      toast.showToast(`Custom MCP server connected${sharedNote}`, 'success');
      const created = result.connector;
      reset();
      onMounted(created);
    } catch (err) {
      toast.showToast(
        err instanceof Error ? err.message : 'Failed to mount MCP server',
        'error',
      );
      setPending(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Add custom MCP server"
      onSubmit={() => void submit()}
      submitLabel={awaitingOauth ? 'Waiting for sign-in…' : 'Connect'}
      submitLoading={pending}
      submitDisabled={pending}
    >
      <Text variant="body-sm" tone="subtle" as="p">
        Connect any Streamable HTTP MCP endpoint or a local stdio process.
        Tools register in this workspace immediately.
      </Text>

      <Field label="Display name" hint="User-facing title for this MCP server.">
        <Input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Analytics DB"
          data-testid="custom-mcp-display-name"
        />
      </Field>

      <Field label="Connection label" hint="Optional identifier for this specific instance.">
        <Input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Production Read-Only"
          data-testid="custom-mcp-label"
        />
      </Field>

      {sharingAllowed ? (
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Connection mode"
        >
          {(
            [
              {
                value: 'per_user',
                title: 'Per-user',
                body: 'Each person connects their own account. The agent acts as whoever runs it.',
              },
              {
                value: 'shared',
                title: 'Shared',
                body: 'Everyone uses these credentials (workspace admins only). Actions show this single account as the author.',
              },
            ] as const
          ).map(opt => {
            const selected = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`custom-mcp-mode-${opt.value}`}
                onClick={() => setMode(opt.value)}
                className={[
                  'flex items-start gap-2.5 rounded-[var(--radius-card)] border p-3 text-left transition-colors',
                  selected
                    ? 'border-[var(--brand-accent)]'
                    : 'border-[var(--panel-border)] hover:border-[var(--text-subtle)]',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                    selected
                      ? 'border-[var(--brand-accent)]'
                      : 'border-[var(--text-subtle)]',
                  ].join(' ')}
                >
                  {selected ? (
                    <span className="h-2 w-2 rounded-full bg-[var(--brand-accent)]" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <Text variant="body-sm" weight="semibold" as="span">
                    {opt.title}
                  </Text>
                  <Text
                    variant="body-sm"
                    tone="subtle"
                    as="p"
                    className="mt-1"
                  >
                    {opt.body}
                  </Text>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Field label="Transport" htmlFor="custom-mcp-transport">
        <Select
          id="custom-mcp-transport"
          value={transport}
          onChange={e => setTransport(e.target.value as McpTransport)}
          data-testid="custom-mcp-transport"
        >
          <option value="streamable_http">HTTP (Streamable)</option>
          <option value="stdio">stdio (local process)</option>
        </Select>
      </Field>

      {transport === 'stdio' ? (
        <>
          <Field
            label="Command"
            hint="Executable that speaks MCP over stdio."
            htmlFor="custom-mcp-command"
          >
            <Input
              id="custom-mcp-command"
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="npx"
              monospace
              data-testid="custom-mcp-command"
            />
          </Field>
          <Field
            label="Args"
            hint="Whitespace-separated arguments."
            htmlFor="custom-mcp-args"
          >
            <Input
              id="custom-mcp-args"
              value={argsText}
              onChange={e => setArgsText(e.target.value)}
              placeholder="-y @modelcontextprotocol/server-everything"
              monospace
              data-testid="custom-mcp-args"
            />
          </Field>
        </>
      ) : (
        <>
          <Field
            label="Server URL"
            hint="Streamable HTTP MCP endpoint."
            htmlFor="custom-mcp-url"
            required
          >
            <Input
              id="custom-mcp-url"
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              monospace
              data-testid="custom-mcp-url"
              autoComplete="off"
              required
            />
          </Field>
          <Field
            label="Authorization header"
            hint="Optional. Enter token (Bearer prefix added automatically if omitted). Leave blank to sign in with OAuth."
            htmlFor="custom-mcp-authorization"
          >
            <Input
              id="custom-mcp-authorization"
              type="password"
              value={authorization}
              onChange={e => setAuthorization(e.target.value)}
              placeholder="Leave blank for OAuth"
              data-testid="custom-mcp-authorization"
              autoComplete="new-password"
            />
          </Field>
        </>
      )}
      {awaitingOauth ? (
        <Text variant="body-sm" as="p" data-testid="custom-mcp-oauth-waiting">
          Complete sign-in in the popup window.
        </Text>
      ) : null}
    </FormDialog>
  );
}
