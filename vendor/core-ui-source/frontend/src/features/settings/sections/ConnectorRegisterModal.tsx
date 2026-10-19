/**
 * Connector register modal — generic kinds + ADR-009 MCP mount.
 *
 * When kind is ``mcp``, submits to ``POST /agentive/connectors/mcp/mount``
 * (stdio or streamable HTTP). Other kinds use the Phase-8 create path.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  connectorsApi,
  type AgentType,
  type ConnectorCreate,
  type ConnectorResponse,
  type MountMcpConnectorRequest,
} from '../../../api/connectors';
import { Text } from '../../../ui';
import { FormDialog } from '../../../templates';
import { useToast } from '../../../context/ToastContext';
import { SettingsField, TextInput } from '../components/Field';

const KINDS: AgentType[] = [
  'mcp',
  'open_claw',
  'skill_bundle',
  'custom',
];

type McpTransport = 'stdio' | 'streamable_http';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (created: ConnectorResponse) => void;
}

function splitCsv(s: string): string[] {
  return s
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

function parseArgs(s: string): string[] {
  // Simple whitespace split; quote-aware parsing is out of scope for v1.
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function ConnectorRegisterModal({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<AgentType>('mcp');
  const [permissions, setPermissions] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [url, setUrl] = useState('');
  const [displayName, setDisplayName] = useState('');

  const reset = () => {
    setKind('mcp');
    setPermissions('');
    setCapabilities('');
    setTransport('stdio');
    setCommand('');
    setArgsText('');
    setUrl('');
    setDisplayName('');
  };

  const createMut = useMutation({
    mutationFn: (body: ConnectorCreate) => connectorsApi.create(body),
    onSuccess: created => {
      qc.invalidateQueries({ queryKey: ['connectors'] });
      toast.showToast('Connector registered', 'success');
      reset();
      onCreated?.(created);
      onClose();
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to register connector', 'error');
    },
  });

  const mountMut = useMutation({
    mutationFn: (body: MountMcpConnectorRequest) => connectorsApi.mountMcp(body),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['connectors'] });
      toast.showToast('MCP connector mounted', 'success');
      reset();
      onCreated?.(result.connector);
      onClose();
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Failed to mount MCP connector', 'error');
    },
  });

  const submit = () => {
    if (kind === 'mcp') {
      if (transport === 'stdio' && !command.trim()) {
        toast.showToast('stdio mount requires a command', 'error');
        return;
      }
      if (transport === 'streamable_http' && !url.trim()) {
        toast.showToast('HTTP mount requires a URL', 'error');
        return;
      }
      mountMut.mutate({
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: transport === 'stdio' ? parseArgs(argsText) : undefined,
        url: transport === 'streamable_http' ? url.trim() : undefined,
        display_name: displayName.trim() || undefined,
      });
      return;
    }
    createMut.mutate({
      kind,
      permissions: splitCsv(permissions),
      capabilities: splitCsv(capabilities),
    });
  };

  const pending = createMut.isPending || mountMut.isPending;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="New connector"
      onSubmit={submit}
      submitLabel={kind === 'mcp' ? 'Mount MCP' : 'Register'}
      submitLoading={pending}
    >
      <SettingsField label="Kind" hint="Use mcp to mount an external MCP server as a connector.">
        <select
          value={kind}
          onChange={e => setKind(e.target.value as AgentType)}
          className="
            w-full rounded-[var(--radius-input)] border border-[var(--panel-border)]
            bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]
          "
        >
          {KINDS.map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </SettingsField>

      {kind === 'mcp' ? (
        <>
          <SettingsField label="Display name" hint="Optional label for this mount.">
            <TextInput
              value={displayName}
              onChange={setDisplayName}
              placeholder="My MCP server"
            />
          </SettingsField>
          <SettingsField label="Transport">
            <select
              value={transport}
              onChange={e => setTransport(e.target.value as McpTransport)}
              className="
                w-full rounded-[var(--radius-input)] border border-[var(--panel-border)]
                bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]
              "
            >
              <option value="stdio">stdio</option>
              <option value="streamable_http">streamable HTTP</option>
            </select>
          </SettingsField>
          {transport === 'stdio' ? (
            <>
              <SettingsField label="Command" hint="Executable that speaks MCP over stdio.">
                <TextInput
                  value={command}
                  onChange={setCommand}
                  placeholder="npx"
                  monospace
                />
              </SettingsField>
              <SettingsField label="Args" hint="Whitespace-separated arguments.">
                <TextInput
                  value={argsText}
                  onChange={setArgsText}
                  placeholder="-y @modelcontextprotocol/server-everything"
                  monospace
                />
              </SettingsField>
            </>
          ) : (
            <SettingsField label="URL" hint="Streamable HTTP MCP endpoint.">
              <TextInput
                value={url}
                onChange={setUrl}
                placeholder="https://example.com/mcp"
                monospace
              />
            </SettingsField>
          )}
          <Text variant="body-sm" tone="subtle" as="p">
            Tools are discovered and registered into this workspace immediately
            — no server restart. Secrets (env / headers) can be set via Edit
            after mount.
          </Text>
        </>
      ) : (
        <>
          <SettingsField label="Permissions" hint="Comma-separated permission strings.">
            <TextInput
              value={permissions}
              onChange={setPermissions}
              placeholder="read, write"
              monospace
            />
          </SettingsField>

          <SettingsField
            label="Capabilities"
            hint="Comma-separated capability strings (e.g. tool names from MCP catalogue)."
          >
            <TextInput
              value={capabilities}
              onChange={setCapabilities}
              placeholder="query, filing"
              monospace
            />
          </SettingsField>

          <Text variant="body-sm" tone="subtle" as="p">
            Configure <code className="font-mono">subclass_slug</code> and{' '}
            <code className="font-mono">auth_state</code> via the Edit modal after
            registration — secrets are intentionally not part of this form.
          </Text>
        </>
      )}
    </FormDialog>
  );
}
