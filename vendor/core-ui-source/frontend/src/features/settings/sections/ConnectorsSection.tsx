/**
 * Connectors panel — home lists connected instances; Add Connector opens
 * the in-repo vetted catalog (native + MCP). Gmail/QuickBooks wizards live
 * on a connected row after install, not on home.
 *
 * AGENTIVE_ENABLED=off behaviour (A3): the panel still loads with the
 * shared warning banner above the list. Admins can still read, edit, and
 * delete existing rows.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Cable,
  HeartPulse,
  List,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

import {
  connectorsApi,
  MCP_OAUTH_MESSAGE_TYPE,
  type CatalogEntry,
  type ConnectorResponse,
} from "../../../api/connectors";
import { Button } from "../../../components/ui/Button";
import {
  KebabMenu,
  type KebabMenuItem,
} from "../../../components/ui/KebabMenu";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Surface, Text } from "../../../ui";
import { AsyncBoundary } from "../../../patterns";
import { useConfirm } from "../../../context/ConfirmContext";
import { useToast } from "../../../context/ToastContext";
import { useAuthOptional } from "../../../context/AuthContext";
import { useScopeOptional } from "../../../context/ScopeContext";
import { SettingsSection, StatusPill } from "../components/Field";
import { ConnectorEditModal } from "./ConnectorEditModal";
import { ConnectorBrandIcon } from "../connectors/ConnectorBrandIcon";
import { ConnectorCatalogPanel } from "../connectors/ConnectorCatalogPanel";
import { CustomMcpMountModal } from "../connectors/CustomMcpMountModal";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import {
  McpToolsInspector,
  toolCountLabel,
} from "../connectors/McpToolsInspector";
import { mcpConnectorDetails } from "../connectors/mcpConnectorDetails";
import { QuickBooksConnectorSettings } from "../../../components/settings/QuickBooksConnectorSettings";
import { GmailConnectorSetup } from "../../../components/settings/connectors/GmailConnectorSetup";

function formatLastSynced(iso: string | null): string {
  if (!iso) return "never";
  try {
    return `${formatDistanceToNow(parseISO(iso))} ago`;
  } catch {
    return iso;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function McpConnectorSummary({
  connector,
  title,
}: {
  connector: ConnectorResponse;
  title?: string;
}) {
  const details = mcpConnectorDetails(connector);
  const displayTitle = title || details.title;
  const metaBits = [
    details.transportLabel,
    details.version ? `v${details.version}` : "",
    details.endpoint,
  ].filter(Boolean);
  const showRegistry =
    Boolean(details.registryName) && details.registryName !== displayTitle;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Text
          variant="heading-sm"
          weight="semibold"
          as="span"
          className="min-w-0 break-words"
        >
          {displayTitle}
        </Text>
        <StatusPill
          state={
            connector.health_status === "ok"
              ? "ok"
              : connector.health_status === "error"
                ? "warn"
                : connector.health_status === "degraded"
                  ? "warn"
                  : "idle"
          }
        >
          {connector.health_status === "ok"
            ? "Connected"
            : connector.health_status === "error"
              ? "Connection error"
              : connector.health_status === "degraded"
                ? "Needs attention"
                : "Not checked"}
        </StatusPill>
      </div>
      {showRegistry ? (
        <Text variant="mono" as="p" className="mt-1">
          {details.registryName}
        </Text>
      ) : null}
      <Text variant="body-sm" tone="subtle" as="p" className="mt-1 break-words">
        {connector.connection_mode === "shared"
          ? "Shared connection"
          : "Personal connection"}{" "}
        · MCP
      </Text>
      {metaBits.length > 0 ? (
        <Text variant="meta" tone="subtle" as="p" className="mt-1 break-all">
          {metaBits.join(" · ")}
        </Text>
      ) : null}
      {connector.last_error ? (
        <Text
          variant="body-sm"
          tone="danger"
          as="p"
          className="mt-2 break-words"
        >
          {connector.last_error}
        </Text>
      ) : null}
    </>
  );
}

export function ConnectorsSection() {
  const auth = useAuthOptional();
  const scope = useScopeOptional();
  const principalId = auth?.user?.id ?? "";
  const workspaceId = scope?.scope?.workspaceId ?? "";

  // A scope switch must change the mounted observer and discard open panels.
  // Removing an unscoped cache alone leaves its observer displaying old rows.
  return (
    <ScopedConnectorsSection
      key={JSON.stringify([principalId, workspaceId])}
      principalId={principalId}
      workspaceId={workspaceId}
    />
  );
}

function ScopedConnectorsSection({
  principalId,
  workspaceId,
}: {
  principalId: string;
  workspaceId: string;
}) {
  const isCurrentPanel = useRef(true);
  useEffect(() => {
    isCurrentPanel.current = true;
    return () => {
      isCurrentPanel.current = false;
    };
  }, []);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const auth = useAuthOptional();
  const myId = auth?.user?.id ?? "";
  const scope = useScopeOptional();
  const wsRole = scope?.activeWorkspace?.your_role;
  // Workspace admins manage shared rows they did not install (edit,
  // re-auth, sync, delete). Mirror config (Gmail labels, QuickBooks
  // settings) stays owner-only.
  const isWsAdmin = wsRole === "admin" || wsRole === "owner";
  // Custom MCP mount is admin-only on the server (arbitrary URL). Hide
  // the control from members/guests so they don't fill a form that 403s.
  const canMountCustomMcp = !wsRole || isWsAdmin;

  const [view, setView] = useState<"home" | "library">("home");
  const [customMcpOpen, setCustomMcpOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectorResponse | null>(null);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  // Held by id, not by object: a snapshot taken at click time went stale the
  // moment Refresh re-discovered the tools, so the inspector kept showing the
  // old tool list behind a fresh one.
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [reauthPending, setReauthPending] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<"all" | "shared" | "per_user">(
    "all",
  );

  const list = useQuery({
    queryKey: ["connectors", "list", principalId, workspaceId],
    queryFn: () => connectorsApi.list(),
  });

  const inspecting =
    (list.data?.connectors ?? []).find((c) => c.id === inspectingId) ?? null;
  const inspectingIsNative = !!inspecting && inspecting.subclass_slug !== "mcp";
  const inspectedTools = useQuery({
    queryKey: ["connectors", "tools", principalId, workspaceId, inspectingId],
    queryFn: () => connectorsApi.listTools(inspectingId as string),
    enabled: !!inspectingId && inspectingIsNative,
    staleTime: 30_000,
  });

  const catalog = useQuery({
    queryKey: ["connectors", "catalog", principalId, workspaceId],
    queryFn: () => connectorsApi.listCatalog(),
  });

  const syncMut = useMutation({
    mutationFn: (id: string) => connectorsApi.sync(id),
    onSuccess: (stats) => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      qc.invalidateQueries({ queryKey: ["conflicts"] });
      toast.showToast(
        `Sync done — ${stats.created} created, ${stats.updated} updated, ${stats.conflict} conflicts`,
        "success",
      );
    },
    onError: (err: Error) => {
      toast.showToast(err.message || "Sync failed", "error");
    },
  });

  const refreshMcpMut = useMutation({
    mutationFn: (id: string) => connectorsApi.refreshMcp(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      toast.showToast("MCP tools refreshed", "success");
    },
    onError: (err: Error) => {
      toast.showToast(err.message || "MCP refresh failed", "error");
    },
  });

  const healthMut = useMutation({
    mutationFn: (id: string) => connectorsApi.health(id),
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      toast.showToast(
        h.status === "ok"
          ? `Healthy — ${h.tool_count} tools`
          : h.status === "degraded"
            ? `Degraded — ${h.last_error || "reachable but not fully usable"}`
            : `Unhealthy — ${h.last_error || h.status}`,
        h.status === "ok" ? "success" : "error",
      );
    },
    onError: (err: Error) => {
      toast.showToast(err.message || "Health check failed", "error");
    },
  });

  const reauthMut = useMutation({
    mutationFn: (id: string) => connectorsApi.reauthorizeMcp(id),
    onSuccess: (res) => {
      // An authorization response arriving after a switch belongs to the old
      // panel. Do not open its consent popup in the user's new workspace.
      if (!isCurrentPanel.current) return;
      const popup = window.open(
        res.consent_url,
        `mcp-reauth-${res.connector_id}`,
        "width=600,height=720,scrollbars=yes",
      );
      if (!popup) {
        toast.showToast(
          "Popup blocked. Allow popups to reconnect this connector.",
          "error",
        );
        return;
      }
      setReauthPending(res.connector_id);
      toast.showToast("Finish authorizing in the popup", "success");
    },
    onError: (err: Error) => {
      toast.showToast(err.message || "Reconnect failed", "error");
    },
  });

  // The OAuth callback page posts back to the opener. Without this the popup
  // completes, the connector is healthy again, and the list still shows the
  // stale error until the user reloads.
  useEffect(() => {
    if (!reauthPending) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        ok?: boolean;
        error?: string;
      };
      if (!data || data.type !== MCP_OAUTH_MESSAGE_TYPE) return;
      setReauthPending(null);
      if (data.ok) {
        qc.invalidateQueries({ queryKey: ["connectors"] });
        toast.showToast("Connector reconnected", "success");
        return;
      }
      toast.showToast(data.error || "Authorization was cancelled", "error");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [reauthPending, qc, toast]);

  const delMut = useMutation({
    mutationFn: (id: string) => connectorsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connectors"] });
      toast.showToast("Connector deleted", "success");
    },
    onError: (err: Error) => {
      toast.showToast(err.message || "Failed to delete connector", "error");
    },
  });

  const handleDelete = async (c: ConnectorResponse) => {
    const ok = await confirm({
      title: "Delete this connector?",
      message: `${c.kind} (${c.subclass_slug || "no subclass"}) — this cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    delMut.mutate(c.id);
  };

  const connectors = list.data?.connectors ?? [];
  const catalogBySlug = new Map(
    (catalog.data?.entries ?? []).map((e: CatalogEntry) => [e.slug, e]),
  );
  const refetchConnectors = () => {
    qc.invalidateQueries({ queryKey: ["connectors"] });
  };

  const instanceMeta = (c: ConnectorResponse) => {
    const auth = asRecord(c.auth_state) ?? {};
    const catalogSlug =
      (typeof auth.catalog_slug === "string" && auth.catalog_slug) ||
      c.subclass_slug ||
      "";
    const pkg = catalogSlug ? catalogBySlug.get(catalogSlug) : undefined;
    const title = (c.label || "").trim() || undefined;
    const isShared = (c.connection_mode || "per_user") === "shared";
    if (c.subclass_slug === "mcp") {
      const mcp = mcpConnectorDetails(c);
      return {
        title: title || pkg?.display_name || mcp.title,
        icon: pkg?.icon || catalogSlug || "mcp",
        slug: catalogSlug,
        isMcp: true,
        isShared,
      };
    }
    return {
      title: title || pkg?.display_name || c.subclass_slug || c.kind,
      icon: pkg?.icon || catalogSlug || c.kind,
      slug: catalogSlug,
      isMcp: false,
      isShared,
    };
  };

  return (
    <div className="flex flex-col gap-5">
      {view === "library" ? (
        <SettingsSection
          title="Connector library"
          description="Vetted native integrations, MCP servers, and MCP packages. Nothing is listed unless it is curated in-repo."
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={14} />}
              onClick={() => setView("home")}
              aria-label="Back to connectors"
            >
              Back
            </Button>
          }
        >
          <ConnectorCatalogPanel
            onInstalled={() => {
              refetchConnectors();
              setView("home");
            }}
          />
        </SettingsSection>
      ) : (
        <>
          <SettingsSection
            title="Connectors"
            description="Add a vetted connector from the library or mount a custom MCP server. Connected instances appear below."
            actions={
              <div className="flex items-center gap-2">
                {canMountCustomMcp ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={() => setCustomMcpOpen(true)}
                    aria-label="Add Custom MCP"
                    data-testid="add-custom-mcp-btn"
                  >
                    Add Custom MCP
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => setView("library")}
                  aria-label="Add Connector"
                >
                  Add Connector
                </Button>
              </div>
            }
          >
            <Text variant="body-sm" tone="subtle" as="p">
              Gmail, QuickBooks, GitHub Issues, and curated MCP packages share
              one install flow — including OAuth and API credentials.
            </Text>
          </SettingsSection>

          <SettingsSection
            title="Connected"
            description="Manage your connections and check that their tools are available."
          >
            <div className="mb-2 flex items-center gap-2">
              <SegmentedControl
                size="sm"
                ariaLabel="Filter by connection scope"
                value={scopeFilter}
                onChange={setScopeFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "shared", label: "Shared" },
                  { value: "per_user", label: "Per-user" },
                ]}
              />
            </div>
            <AsyncBoundary
              query={list}
              isEmpty={(data) => (data.connectors ?? []).length === 0}
              emptyFallback={
                <EmptyState
                  icon={
                    <Cable size={24} className="text-[var(--text-subtle)]" />
                  }
                  title="No connectors yet."
                  description="Register a connector to mirror an external system into a Track."
                />
              }
              errorFallback={(err) => (
                <Text variant="body" tone="danger" as="p">
                  Failed to load connectors: {err.message}
                </Text>
              )}
            >
              {() => {
                const visible = connectors.filter((c) => {
                  const shared = (c.connection_mode || "per_user") === "shared";
                  if (scopeFilter === "shared") return shared;
                  if (scopeFilter === "per_user") return !shared;
                  return true;
                });
                if (visible.length === 0) {
                  return (
                    <Text variant="body-sm" tone="subtle" as="p">
                      No connectors match this filter.
                    </Text>
                  );
                }
                return (
                  <ul className="flex flex-col gap-2">
                    {visible.map((c) => {
                      const meta = instanceMeta(c);
                      const showConfig = configuringId === c.id;
                      const isMine =
                        !myId ||
                        c.owner === myId ||
                        c.owner === auth?.user?.user_id;
                      const canAdminister =
                        isMine || (meta.isShared && isWsAdmin);
                      const isSharedView = meta.isShared && !canAdminister;
                      return (
                        <Surface
                          key={c.id}
                          as="li"
                          tone="panel-2"
                          border="subtle"
                          radius="card"
                          padding="md"
                          className="min-w-0 flex flex-col gap-4"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-3">
                              <ConnectorBrandIcon
                                icon={meta.icon}
                                label={meta.title}
                              />
                              <div className="min-w-0 flex-1">
                                {meta.isMcp ? (
                                  <McpConnectorSummary
                                    connector={c}
                                    title={meta.title}
                                  />
                                ) : (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Text
                                        variant="heading-sm"
                                        weight="semibold"
                                        as="span"
                                      >
                                        {meta.title}
                                      </Text>
                                      <StatusPill
                                        state={
                                          c.conflict_policy ? "ok" : "idle"
                                        }
                                      >
                                        {c.conflict_policy ||
                                          "no conflict rule"}
                                      </StatusPill>
                                      {meta.isShared ? (
                                        <StatusPill state="idle">
                                          Shared
                                        </StatusPill>
                                      ) : null}
                                    </div>
                                    {isSharedView ? (
                                      <Text
                                        variant="body-sm"
                                        tone="subtle"
                                        as="p"
                                        className="mt-1"
                                      >
                                        Shared connection — actions run as this
                                        account. Add your own from the library
                                        for a personal connection.
                                      </Text>
                                    ) : null}
                                    <Text
                                      variant="body-sm"
                                      tone="subtle"
                                      as="p"
                                      className="mt-1"
                                    >
                                      {`Sync every ${c.sync_interval_seconds}s · last synced ${formatLastSynced(c.last_synced_at)}`}
                                    </Text>
                                  </>
                                )}
                              </div>
                            </div>
                            {showConfig &&
                            isMine &&
                            c.subclass_slug === "gmail" ? (
                              <div className="mt-3">
                                <GmailConnectorSetup
                                  initialConnectorId={c.id}
                                  onActivated={refetchConnectors}
                                />
                              </div>
                            ) : null}
                            {showConfig &&
                            isMine &&
                            c.subclass_slug === "quickbooks" ? (
                              <div className="mt-3">
                                <QuickBooksConnectorSettings
                                  connector={c}
                                  onReconnect={refetchConnectors}
                                  onUpdated={refetchConnectors}
                                />
                              </div>
                            ) : null}
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon={<List size={14} />}
                              onClick={() => setInspectingId(c.id)}
                              aria-label={`View tools for ${meta.title}`}
                            >
                              {meta.isMcp
                                ? `View ${toolCountLabel(mcpConnectorDetails(c).tools.length)}`
                                : "View tools"}
                            </Button>
                            {meta.isMcp ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon={<HeartPulse size={14} />}
                                onClick={() => healthMut.mutate(c.id)}
                                disabled={
                                  healthMut.isPending &&
                                  healthMut.variables === c.id
                                }
                                aria-label={`Health check ${c.id}`}
                              >
                                {healthMut.isPending &&
                                healthMut.variables === c.id
                                  ? "Checking…"
                                  : "Check connection"}
                              </Button>
                            ) : canAdminister ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon={<RefreshCw size={14} />}
                                onClick={() => syncMut.mutate(c.id)}
                                disabled={
                                  syncMut.isPending &&
                                  syncMut.variables === c.id
                                }
                                aria-label={`Sync connector ${c.id}`}
                              >
                                Sync now
                              </Button>
                            ) : null}
                            {canAdminister ? (
                              <div className="ml-auto shrink-0">
                                <KebabMenu
                                  ariaLabel={`Manage ${meta.title}`}
                                  menuTitle={meta.title}
                                  portal
                                  items={
                                    [
                                      ...(meta.isMcp
                                        ? [
                                            {
                                              key: "refresh",
                                              label: "Refresh tools",
                                              icon: <RefreshCw size={14} />,
                                              onClick: () =>
                                                refreshMcpMut.mutate(c.id),
                                              disabled:
                                                refreshMcpMut.isPending &&
                                                refreshMcpMut.variables ===
                                                  c.id,
                                            },
                                            {
                                              key: "reconnect",
                                              label: "Reconnect",
                                              icon: <PlugZap size={14} />,
                                              onClick: () =>
                                                reauthMut.mutate(c.id),
                                              disabled:
                                                reauthMut.isPending &&
                                                reauthMut.variables === c.id,
                                            },
                                          ]
                                        : []),
                                      ...(isMine &&
                                      (c.subclass_slug === "gmail" ||
                                        c.subclass_slug === "quickbooks")
                                        ? [
                                            {
                                              key: "configure",
                                              label: "Settings",
                                              icon: <Settings size={14} />,
                                              onClick: () =>
                                                setConfiguringId((prev) =>
                                                  prev === c.id ? null : c.id,
                                                ),
                                            },
                                          ]
                                        : []),
                                      {
                                        key: "edit",
                                        label: "Edit connection",
                                        icon: <Pencil size={14} />,
                                        onClick: () => setEditing(c),
                                      },
                                      {
                                        key: "delete",
                                        label: "Delete connection",
                                        icon: <Trash2 size={14} />,
                                        danger: true,
                                        dividerAbove: true,
                                        onClick: () => {
                                          void handleDelete(c);
                                        },
                                      },
                                    ] satisfies KebabMenuItem[]
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                        </Surface>
                      );
                    })}
                  </ul>
                );
              }}
            </AsyncBoundary>
          </SettingsSection>
        </>
      )}

      <ConnectorEditModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        connector={editing}
      />
      {inspecting ? (
        <McpToolsInspector
          connector={inspecting}
          title={instanceMeta(inspecting).title}
          onClose={() => setInspectingId(null)}
          tools={
            inspectingIsNative
              ? (inspectedTools.data?.tools.map((t) => ({
                  name: t.key,
                  description: t.description,
                  inputSchema: t.input_schema,
                  write: t.write,
                })) ?? null)
              : undefined
          }
          metaLine={
            inspectingIsNative
              ? `native · ${inspectedTools.data?.tools.length ?? 0} tools`
              : undefined
          }
          pending={inspectingIsNative && inspectedTools.isPending}
        />
      ) : null}
      {customMcpOpen ? (
        <CustomMcpMountModal
          open={customMcpOpen}
          sharingAllowed={scope ? !scope.isPersonal && canMountCustomMcp : true}
          onClose={() => setCustomMcpOpen(false)}
          onMounted={() => {
            setCustomMcpOpen(false);
            refetchConnectors();
          }}
        />
      ) : null}
    </div>
  );
}
