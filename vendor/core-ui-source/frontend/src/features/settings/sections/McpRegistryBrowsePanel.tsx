/**
 * Browse panel for the official MCP Registry (registry.modelcontextprotocol.io).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Search, Store } from 'lucide-react';

import {
  connectorsApi,
  type McpRegistryEntry,
  type McpRegistryMountPreview,
} from '../../../api/connectors';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { IconWell, LINE_ICON_STROKE } from '../../../components/ui/IconWell';
import { Surface, Text } from '../../../ui';
import { AsyncBoundary } from '../../../patterns';
import { useToast } from '../../../context/ToastContext';
import { SettingsField, StatusPill, TextInput } from '../components/Field';

const REGISTRY_QUERY_KEY = ['connectors', 'mcp-registry'] as const;

function tierLabel(tier: McpRegistryEntry['install_tier']): string {
  switch (tier) {
    case 'direct_http':
      return 'HTTP — one-click';
    case 'http_with_auth':
      return 'HTTP — credentials';
    case 'stdio_package':
      return 'Stdio package';
    default:
      return 'Unsupported';
  }
}

function tierState(tier: McpRegistryEntry['install_tier']): 'ok' | 'warn' | 'idle' {
  if (tier === 'direct_http') return 'ok';
  if (tier === 'http_with_auth' || tier === 'stdio_package') return 'warn';
  return 'idle';
}

interface MountModalProps {
  entry: McpRegistryEntry | null;
  preview: McpRegistryMountPreview | null;
  open: boolean;
  onClose: () => void;
  onMounted?: () => void;
}

function RegistryMountModal({
  entry,
  preview,
  open,
  onClose,
  onMounted,
}: MountModalProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  const prompts = useMemo(() => {
    if (!preview) return [];
    return [
      ...(preview.auth_header_prompts ?? []),
      ...(preview.env_var_prompts ?? []),
    ];
  }, [preview]);

  const mountMut = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error('No registry entry selected');
      if (preview?.can_auto_mount) {
        return connectorsApi.mountFromRegistry({
          registry_name: entry.name,
          secrets,
        });
      }
      if (preview?.transport === 'streamable_http' && preview.url) {
        const headers: Record<string, string> = {};
        for (const p of preview.auth_header_prompts ?? []) {
          if (secrets[p.name]) headers[p.name] = secrets[p.name];
        }
        const result = await connectorsApi.mountMcp({
          transport: 'streamable_http',
          url: preview.url,
          headers: Object.keys(headers).length ? headers : undefined,
          display_name: preview.display_name,
          registry_name: entry.name,
          registry_version: entry.version,
        });
        return result.connector;
      }
      throw new Error('This entry requires manual install');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] });
      toast.showToast('MCP connector mounted from registry', 'success');
      onClose();
      onMounted?.();
    },
    onError: (err: Error) => {
      toast.showToast(err.message || 'Mount failed', 'error');
    },
  });

  if (!open || !entry || !preview) return null;

  const isManual = preview.install_tier === 'stdio_package' || !preview.can_auto_mount;

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mount MCP registry server"
    >
      <Surface tone="panel" border="subtle" radius="card" padding="lg" className="w-full max-w-lg">
        <Text variant="heading-sm" weight="semibold" as="h3">{entry.title}</Text>
        <Text variant="body-sm" tone="subtle" as="p" className="mt-1">{entry.name}</Text>

        {isManual && preview.manual_recipe ? (
          <div className="mt-4 flex flex-col gap-2">
            <Text variant="body-sm" tone="muted" as="p">
              {/* The old copy pointed at "manual MCP mount", which refuses
                  free-form stdio commands — so following the instruction
                  produced an error. Say what is actually true instead. */}
              {preview.manual_recipe.note ??
                'This server runs as a local process (stdio/npm/docker). Integral only spawns commands vetted in its own connector catalog, so it cannot be installed from the registry. The recipe below is for reference — use a hosted (HTTP) server, or add this one to the catalog in-repo.'}
            </Text>
            <pre className="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3 text-xs">
              {`command: ${preview.manual_recipe.command}\nargs: ${(preview.manual_recipe.args ?? []).join(' ')}`}
            </pre>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {prompts.map(p => (
              <SettingsField key={p.name} label={p.name} hint={p.description}>
                <TextInput
                  type={p.is_secret ? 'password' : 'text'}
                  value={secrets[p.name] ?? ''}
                  onChange={v => setSecrets(prev => ({ ...prev, [p.name]: v }))}
                  placeholder={p.required ? 'Required' : 'Optional'}
                />
              </SettingsField>
            ))}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={mountMut.isPending}
                onClick={() => mountMut.mutate()}
              >
                Mount in workspace
              </Button>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}

export function McpRegistryBrowsePanel({
  onMounted,
}: {
  onMounted?: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<McpRegistryEntry | null>(null);
  const [preview, setPreview] = useState<McpRegistryMountPreview | null>(null);

  const list = useQuery({
    queryKey: [...REGISTRY_QUERY_KEY, search, cursor],
    queryFn: () =>
      connectorsApi.searchMcpRegistry({ q: search, cursor, limit: 12 }),
  });

  const openEntry = async (entry: McpRegistryEntry) => {
    try {
      setSelected(entry);
      const p = await connectorsApi.previewMcpRegistryMount(entry.name);
      setPreview(p);
    } catch (err) {
      setSelected(null);
      setPreview(null);
      toast.showToast(
        err instanceof Error ? err.message : 'Failed to load mount preview',
        'error',
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Surface tone="panel-2" border="subtle" radius="card" padding="md">
        <Text variant="body-sm" tone="muted" as="p">
          Browse the official MCP Registry. Third-party servers run under workspace
          policy — review the publisher before installing.
        </Text>
        <form
          className="mt-3 flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            setCursor(undefined);
            setSearch(query.trim());
          }}
        >
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder="Search MCP servers…"
          />
          <Button type="submit" variant="secondary" size="sm" icon={<Search size={14} />}>
            Search
          </Button>
        </form>
      </Surface>

      <AsyncBoundary
        query={list}
        isEmpty={data => (data.entries ?? []).length === 0}
        emptyFallback={
          <EmptyState
            icon={
              <IconWell size="lg" aria-hidden>
                <Store size={22} strokeWidth={LINE_ICON_STROKE} />
              </IconWell>
            }
            title="No registry results."
            description="Try a different search term."
          />
        }
      >
        {data => (
          <>
            <ul className="flex flex-col gap-2">
              {data.entries.map(entry => (
                <Surface
                  key={`${entry.name}:${entry.version}`}
                  as="li"
                  tone="panel-2"
                  border="subtle"
                  radius="card"
                  padding="md"
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Text variant="body" weight="semibold" as="span">
                        {entry.title}
                      </Text>
                      <StatusPill state={tierState(entry.install_tier)}>
                        {tierLabel(entry.install_tier)}
                      </StatusPill>
                      {!entry.install_allowed ? (
                        <StatusPill state="warn">Not allowlisted</StatusPill>
                      ) : null}
                    </div>
                    <Text variant="body-sm" tone="subtle" as="p" className="mt-1 line-clamp-2">
                      {entry.description || entry.name}
                    </Text>
                    <Text variant="mono" tone="subtle" as="p" className="mt-1">
                      {entry.name} · v{entry.version}
                    </Text>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {entry.repository_url ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        icon={<ExternalLink size={12} />}
                        onClick={() => window.open(entry.repository_url!, '_blank')}
                      >
                        Repo
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="primary"
                      size="xs"
                      disabled={!entry.install_allowed || entry.install_tier === 'unsupported'}
                      onClick={() => void openEntry(entry)}
                    >
                      Add
                    </Button>
                  </div>
                </Surface>
              ))}
            </ul>
            {data.next_cursor ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCursor(data.next_cursor ?? undefined)}
              >
                Load more
              </Button>
            ) : null}
          </>
        )}
      </AsyncBoundary>

      <RegistryMountModal
        entry={selected}
        preview={preview}
        open={selected !== null && preview !== null}
        onClose={() => {
          setSelected(null);
          setPreview(null);
        }}
        onMounted={onMounted}
      />

    </div>
  );
}
