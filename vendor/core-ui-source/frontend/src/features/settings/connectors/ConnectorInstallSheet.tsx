import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  MCP_OAUTH_MESSAGE_TYPE,
  connectorsApi,
  type CatalogAuthField,
  type CatalogEntry,
  type ConnectionMode,
  type ConnectorResponse,
} from "../../../api/connectors";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { Text } from "../../../ui";
import { useToast } from "../../../context/ToastContext";
import { SettingsField, TextInput, ToggleRow } from "../components/Field";

function isToggleField(field: CatalogAuthField): boolean {
  return (
    field.control === "toggle" || field.name.startsWith("QUICKBOOKS_DISABLE_")
  );
}

function toggleLabel(field: CatalogAuthField): string {
  return (
    field.label.replace(/\s*\(true\/false\)\s*$/i, "").trim() || field.label
  );
}

function seedSecrets(fields: CatalogAuthField[]): Record<string, string> {
  const seeded: Record<string, string> = {};
  for (const field of fields) {
    if (!isToggleField(field)) continue;
    seeded[field.name] = field.default === "true" ? "true" : "false";
  }
  return seeded;
}

function toggleOn(
  field: CatalogAuthField,
  secrets: Record<string, string>,
): boolean {
  const value = secrets[field.name];
  if (value === "true") return true;
  if (value === "false") return false;
  return field.default === "true";
}

export function ConnectorInstallSheet({
  entry,
  sharingAllowed = true,
  onClose,
  onInstalled,
}: {
  entry: CatalogEntry;
  /** False in personal workspaces: everything is per-user, mode hidden. */
  sharingAllowed?: boolean;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fields = entry.auth.fields ?? [];
  const platformConfigured = new Set(entry.platform_configured ?? []);
  const [secrets, setSecrets] = useState<Record<string, string>>(() =>
    seedSecrets(fields),
  );
  const [label, setLabel] = useState("");
  // Personal workspaces are always per-user: force the mode and hide the
  // picker (the server rejects shared installs there regardless).
  const [mode, setMode] = useState<ConnectionMode>("per_user");
  const effectiveMode: ConnectionMode = sharingAllowed ? mode : "per_user";
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Mounted while the accordion animates open AND closed — unmounting
  // immediately on close would cut the collapse animation short, and
  // keeping collapsed content mounted would leave inputs tab-focusable.
  const [accordionMounted, setAccordionMounted] = useState(false);
  const accordionTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (accordionTimer.current !== null) {
        window.clearTimeout(accordionTimer.current);
      }
    },
    [],
  );

  const toggleAdvanced = () => {
    if (accordionTimer.current !== null) {
      window.clearTimeout(accordionTimer.current);
      accordionTimer.current = null;
    }
    if (showAdvanced) {
      setShowAdvanced(false);
      accordionTimer.current = window.setTimeout(() => {
        setAccordionMounted(false);
        accordionTimer.current = null;
      }, 320);
    } else {
      setAccordionMounted(true);
      setShowAdvanced(true);
    }
  };
  const [oauthOpened, setOauthOpened] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Fields hide behind Advanced Options when the platform provides
  // them OR the catalog marks them advanced (e.g. QuickBooks
  // environment); everything else always shows.
  const isAdvancedField = (f: CatalogAuthField) =>
    f.advanced === true || platformConfigured.has(f.name);
  const baseFields = fields.filter((f) => !isAdvancedField(f));
  const advancedFields = fields.filter(isAdvancedField);
  const hasAdvancedFields = advancedFields.length > 0;

  const renderField = (field: CatalogAuthField) =>
    isToggleField(field) ? (
      <ToggleRow
        key={field.name}
        checked={toggleOn(field, secrets)}
        onChange={(on) =>
          setSecrets((prev) => ({
            ...prev,
            [field.name]: on ? "true" : "false",
          }))
        }
        label={toggleLabel(field)}
        hint={field.hint || undefined}
      />
    ) : (
      <SettingsField key={field.name} label={field.label}>
        <TextInput
          type={field.secret ? "password" : "text"}
          value={secrets[field.name] ?? ""}
          onChange={(v) => setSecrets((prev) => ({ ...prev, [field.name]: v }))}
          placeholder={field.required ? "Required" : "Optional"}
        />
      </SettingsField>
    );

  // Watch for the user closing the popup without finishing. Without this the
  // sheet sat on a "Done" button that called onInstalled() unconditionally —
  // abandoning the consent screen reported the connector as connected.
  useEffect(() => {
    if (!oauthOpened) return;
    const timer = window.setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        window.clearInterval(timer);
        popupRef.current = null;
        setOauthOpened(false);
        const message = "Authorization was not completed.";
        setError(message);
        toast.showToast(message, "error");
      }
    }, 700);
    return () => window.clearInterval(timer);
  }, [oauthOpened, toast]);

  useEffect(() => {
    if (!oauthOpened) return;
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
      if (data.ok) {
        // Clear the handle first: closing the popup after a success must not
        // trip the abandonment watcher above.
        popupRef.current = null;
        setOauthOpened(false);
        const sharedNote =
          data.connection_mode === "shared" ? " (shared connection)" : "";
        toast.showToast(
          `${label || entry.display_name} connected${sharedNote}`,
          "success",
        );
        onInstalled();
        return;
      }
      const message = data.error || "Authorization was cancelled";
      setError(message);
      setOauthOpened(false);
      toast.showToast(message, "error");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [oauthOpened, entry.display_name, label, onInstalled, toast]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await connectorsApi.installFromCatalog(entry.slug, {
        secrets,
        label: label.trim() || undefined,
        connection_mode: effectiveMode,
      });
      if (result.action === "oauth" && result.consent_url) {
        const popup = window.open(
          result.consent_url,
          `${entry.slug}-oauth`,
          "width=600,height=720,scrollbars=yes",
        );
        if (!popup) {
          const message =
            "Popup blocked. Allow popups to authorize this connector.";
          setError(message);
          toast.showToast(message, "error");
          return;
        }
        popupRef.current = popup;
        setOauthOpened(true);
        toast.showToast(
          `Authorize ${entry.display_name} in the popup`,
          "success",
        );
        return;
      }
      toast.showToast(`${entry.display_name} connected`, "success");
      onInstalled();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Install failed";
      setError(message);
      toast.showToast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const authLabel =
    entry.auth.type === "oauth2"
      ? "OAuth"
      : entry.auth.type === "headers"
        ? "API headers"
        : entry.auth.type === "api_key"
          ? "API key"
          : entry.auth.type === "env"
            ? "Configuration"
            : "No extra credentials";

  return (
    <Modal
      open
      onClose={onClose}
      title={`Install ${entry.display_name}`}
      variant="compact"
    >
      <Modal.Body>
        <Text variant="body-sm" tone="subtle" as="p">
          {entry.description}
        </Text>
        <Text variant="body-sm" tone="muted" as="p">
          Auth: {authLabel}
        </Text>
        {entry.auth.type === "oauth2" &&
        baseFields.some((f) => !isToggleField(f)) ? (
          <Text variant="body-sm" tone="subtle" as="p">
            Paste Client ID and Client secret from the app&apos;s developer
            console. Leave a field blank to use the matching server environment
            variable.
          </Text>
        ) : null}
        {entry.kind === "mcp" && entry.auth.type === "oauth2" ? (
          <Text variant="body-sm" tone="subtle" as="p">
            {entry.transport === "stdio"
              ? "Connect opens Intuit sign-in. Use the same QuickBooks OAuth app and redirect URI as native QuickBooks. All tools are available; turn a restriction on to hide create, update, or delete."
              : "Connect opens a sign-in popup. Register this app's MCP OAuth callback URL on the OAuth client."}
          </Text>
        ) : null}
        {entry.kind === "mcp" && entry.auth.type === "none" ? (
          <Text variant="body-sm" tone="subtle" as="p">
            If the server requires sign-in, a consent popup will open after you
            install.
          </Text>
        ) : null}

        {oauthOpened ? (
          <>
            <Text variant="body-sm" as="p">
              Complete sign-in in the popup. This window will continue once
              authorization finishes.
            </Text>
            {error ? (
              <Text variant="body-sm" tone="danger" as="p">
                {error}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <SettingsField label="Connection label (optional)">
              <TextInput
                type="text"
                value={label}
                onChange={setLabel}
                placeholder={entry.display_name}
              />
            </SettingsField>

            {sharingAllowed ? (
              <div
                className="grid gap-2 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Connection mode"
              >
              {(
                [
                  {
                    value: "per_user",
                    title: "Per-user",
                    body: "Each person connects their own account. The agent acts as whoever runs it.",
                  },
                  {
                    value: "shared",
                    title: "Shared",
                    body: "Everyone uses these credentials (workspace admins only). Actions show this single account as the author.",
                  },
                ] as const
              ).map((opt) => {
                const selected = mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`connection-mode-${opt.value}`}
                    onClick={() => setMode(opt.value)}
                    className={[
                      "flex items-start gap-2.5 rounded-[var(--radius-card)] border p-3 text-left transition-colors",
                      selected
                        ? "border-[var(--brand-accent)]"
                        : "border-[var(--panel-border)] hover:border-[var(--text-subtle)]",
                    ].join(" ")}
                  >
                    <span
                      aria-hidden
                      className={[
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        selected
                          ? "border-[var(--brand-accent)]"
                          : "border-[var(--text-subtle)]",
                      ].join(" ")}
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

            {baseFields.map(renderField)}
            {hasAdvancedFields ? (
              <button
                type="button"
                onClick={toggleAdvanced}
                aria-expanded={showAdvanced}
                className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--panel-border)] px-3 py-2 text-left hover:border-[var(--text-subtle)]"
              >
                <Text variant="body-sm" weight="semibold" as="span">
                  Advanced options
                </Text>
                <Text tone="subtle" as="span" className="inline-flex shrink-0">
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={`transition-transform motion-safe:duration-300 ${
                      showAdvanced ? "" : "-rotate-90"
                    }`}
                  />
                </Text>
              </button>
            ) : null}
            {hasAdvancedFields && !showAdvanced ? (
              <Text variant="body-sm" tone="subtle" as="p">
                Tokens are managed by the platform — nothing to configure.
              </Text>
            ) : null}
            {hasAdvancedFields && accordionMounted ? (
              <div
                className={[
                  "grid transition-[grid-template-rows,opacity] motion-reduce:transition-none",
                  // Real spring physics on open (damped harmonic response
                  // encoded as a linear() easing — fast attack, ~16%
                  // overshoot, gentle settle), quick ease-in on close.
                  showAdvanced
                    ? "connector-advanced-open grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0 motion-safe:duration-200 motion-safe:ease-in",
                ].join(" ")}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="ml-2 flex flex-col gap-2 border-l-2 border-[var(--panel-border)] pl-3">
                    {advancedFields.map(renderField)}
                  </div>
                </div>
              </div>
            ) : null}
            {error ? (
              <Text variant="body-sm" tone="danger" as="p">
                {error}
              </Text>
            ) : null}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        {oauthOpened ? (
          <Button type="button" variant="primary" size="sm" disabled>
            Waiting for authorization…
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => void submit()}
          >
            {entry.auth.type === "oauth2" || entry.kind === "mcp"
              ? "Connect"
              : "Install"}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
