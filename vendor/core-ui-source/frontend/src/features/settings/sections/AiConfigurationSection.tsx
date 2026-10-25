import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  aiConfigurationApi,
  AI_CONFIGURATION_QUERY_KEY,
  type ConnectionWrite,
  type GenerationSettings,
  type ModelConnection,
  type ModelProfile,
  type ProfileWrite,
} from "../../../api/aiConfiguration";
import {
  MODEL_CREDENTIALS_QUERY_KEY,
  PROVIDER_LABELS,
  type ModelProvider,
} from "../../../api/modelCredentials";
import { defaultModel, RECOMMENDED_MODELS } from "../../../api/modelPresets";
import { errorMessageFromAxios } from "../../../api/helpers";
import { profileSummary } from "./modelSettingsSummary";
import { QuickProviderSetup } from "./QuickProviderSetup";
import { ModelCategory } from "./ModelCategory";
import { VoiceConfiguration } from "./VoiceConfiguration";
import { EmbeddingConfiguration } from "./EmbeddingConfiguration";
import { AttachmentAnalysisConfiguration } from "./AttachmentAnalysisConfiguration";
import { ModelRoutingSection } from "./ModelRoutingSection";
import { useToast } from "../../../context/ToastContext";
import { useAIConfiguration } from "../hooks/useAIConfiguration";
import {
  Brain,
  Database,
  Mic,
  KeyRound,
  Plus,
  Check,
  AlertCircle,
  ChevronDown,
  ShieldCheck,
  Trash2,
  Pencil,
  Image,
} from "lucide-react";
import { Modal, Badge } from "../../../components/ui";
import { LINE_ICON_STROKE } from "../../../components/ui/IconWell";
import { Button } from "../../../components/ui/Button";
import { Input, Select, Stack, Surface, Text } from "../../../ui";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Text as="label" variant="body-sm" className="flex flex-col gap-1">
      {label}
      {children}
    </Text>
  );
}
const freshConnection = (): ConnectionWrite => ({
  name: "",
  provider: "openai",
  base_url: "",
  without_key: false,
});
const freshProfile = (): ProfileWrite => ({
  name: "",
  connection_id: "",
  model: "",
  generation_settings: {},
});

export function AiConfigurationSection({
  navigateToSection,
}: { navigateToSection?: (id: string) => void } = {}) {
  const { showToast } = useToast();
  const query = useAIConfiguration();
  const qc = useQueryClient();
  const [advanced, setAdvanced] = useState(false);
  const [quickPending, setQuickPending] = useState(false);
  const [connection, setConnection] = useState<ConnectionWrite | null>(null);
  const [customModel, setCustomModel] = useState(false);
  const [profile, setProfile] = useState<ProfileWrite | null>(null);
  const [tab, setTab] = useState<"models" | "connections">("models");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const toggleCategory = (name: string) =>
    setCategory((current) => (current === name ? null : name));
  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    name: string;
    connection: boolean;
  } | null>(null);
  const notifySuccess = (message: string) => showToast(message, "success");
  const notifyError = (message: string) => showToast(message, "error");
  const [capModel, setCapModel] = useState("");
  const selectedConnection = query.data?.connections.find(
    (c) => c.id === profile?.connection_id,
  );
  useEffect(() => {
    const timer = setTimeout(
      () => setCapModel(profile?.model.trim() ?? ""),
      300,
    );
    return () => clearTimeout(timer);
  }, [profile?.model]);
  const caps = useQuery({
    queryKey: ["model-capabilities", selectedConnection?.provider, capModel],
    queryFn: () =>
      aiConfigurationApi.capabilities(selectedConnection!.provider, capModel),
    enabled: !!selectedConnection && !!capModel,
    staleTime: 300000,
  });
  const mutation = useMutation({
    mutationFn: async (work: () => Promise<unknown>) => work(),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: AI_CONFIGURATION_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: MODEL_CREDENTIALS_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: ["agentive", "status"] }),
      ]);
    },
    onError: (error) =>
      notifyError(
        errorMessageFromAxios(error, "Could not save this configuration."),
      ),
  });
  const testProvider = useMutation({
    mutationFn: (id: string) => aiConfigurationApi.testConnection(id),
    onSuccess: async (result) => {
      showToast(
        result.valid
          ? "Provider connection verified."
          : result.message || "Provider test failed.",
        result.valid ? "success" : "error",
      );
      await qc.invalidateQueries({ queryKey: AI_CONFIGURATION_QUERY_KEY });
    },
    onError: (error) =>
      showToast(
        errorMessageFromAxios(error, "Could not test this provider."),
        "error",
      ),
  });
  const run = (work: () => Promise<unknown>) => mutation.mutate(work);
  const editConnection = (item: ModelConnection) =>
    setConnection({
      id: item.id,
      name: item.name,
      provider: item.provider,
      base_url: item.base_url,
      without_key: !item.key_fingerprint,
    });
  const editProfile = (item: ModelProfile) => {
    const source = query.data?.connections.find(
      (c) => c.id === item.connection_id,
    );
    setCustomModel(
      !source ||
        !RECOMMENDED_MODELS[source.provider].some((m) => m.id === item.model),
    );
    setProfile({
      id: item.id,
      name: item.name,
      connection_id: item.connection_id,
      model: item.model,
      generation_settings: { ...item.generation_settings },
    });
  };
  const changeProfileConnection = (id: string) => {
    const source = query.data?.connections.find((c) => c.id === id);
    const models = source ? RECOMMENDED_MODELS[source.provider] : [];
    setCustomModel(!models.length);
    setProfile(
      (p) =>
        p && {
          ...p,
          connection_id: id,
          model: source ? defaultModel(source.provider) : "",
          generation_settings: {},
        },
    );
  };
  const numeric = (key: keyof GenerationSettings, text: string) =>
    setProfile(
      (p) =>
        p && {
          ...p,
          generation_settings: {
            ...p.generation_settings,
            [key]: text === "" ? undefined : Number(text),
            ...(key === "thinking_budget" && text !== ""
              ? { reasoning_effort: undefined }
              : {}),
          },
        },
    );
  if (query.isPending)
    return (
      <Surface padding="lg" border="subtle">
        <Stack gap="sm">
          <Text weight="medium">Loading your models</Text>
          <Text variant="body-sm" tone="muted">
            Getting your providers and workspace configuration…
          </Text>
        </Stack>
      </Surface>
    );
  if (query.isError || !query.data)
    return (
      <Feedback kind="error">
        AI settings could not be loaded.{" "}
        <Button variant="ghost" onClick={() => query.refetch()}>
          Try again
        </Button>
      </Feedback>
    );
  const data = query.data;
  const disabled = mutation.isPending || quickPending || data.key_policy === "platform_only";
  const needle = search.trim().toLowerCase();
  const profiles = data.profiles.filter((p) =>
    `${p.name} ${p.model}`.toLowerCase().includes(needle),
  );
  const connections = data.connections.filter((c) =>
    `${c.name} ${PROVIDER_LABELS[c.provider]}`.toLowerCase().includes(needle),
  );
  const addProfile = () => {
    const source = data.connections[0];
    const models = source ? RECOMMENDED_MODELS[source.provider] : [];
    setCustomModel(!models.length);
    setProfile({
      ...freshProfile(),
      connection_id: source?.id ?? "",
      model: source ? defaultModel(source.provider) : "",
    });
  };
  const showConnection = () => {
    setConnection(freshConnection());
  };
  return (
    <Stack gap="lg">
      <QuickProviderSetup key={data.effective.workspace_id} data={data} disabled={mutation.isPending} onBusyChange={setQuickPending} />
      <div>
        <Button variant="ghost" aria-expanded={advanced} aria-controls={advanced ? "advanced-ai-configuration" : undefined} disabled={quickPending}
          icon={<ChevronDown size={16} className={advanced ? "rotate-180" : ""} aria-hidden />} onClick={() => setAdvanced(value => !value)}>
          {advanced ? "Hide advanced configuration" : "Show advanced configuration"}
        </Button>
        {!advanced && <Text as="p" variant="meta" tone="muted" className="mt-1">More control over models and other AI features.</Text>}
      </div>
      {advanced && <div id="advanced-ai-configuration" className="space-y-6">
      <section aria-label="Your AI configuration">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
          <div
            role="tablist"
            aria-label="AI configuration"
            className="flex gap-1"
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? "models"
                  : e.key === "End"
                    ? "connections"
                    : tab === "models"
                      ? "connections"
                      : "models";
              setTab(next);
              setSearch("");
              e.currentTarget
                .querySelector<HTMLButtonElement>(`[data-config-tab="${next}"]`)
                ?.focus();
            }}
          >
            {(["models", "connections"] as const).map((t) => (
              <Button
                key={t}
                role="tab"
                id={`ai-${t}-tab`}
                data-config-tab={t}
                aria-selected={tab === t}
                aria-controls={`ai-${t}-panel`}
                tabIndex={tab === t ? 0 : -1}
                variant={tab === t ? "secondary" : "ghost"}
                onClick={() => {
                  setTab(t);
                  setSearch("");
                }}
              >
                {t === "models" ? "Models" : "Providers"}{" "}
                <Badge>{t === "models" ? data.profiles.length : data.connections.length}</Badge>
              </Button>
            ))}
          </div>
          {tab === "connections" && (
            <Button
              icon={<Plus size={16} />}
              disabled={disabled}
              onClick={() => {
                if (tab === "connections" || !data.connections.length)
                  showConnection();
                else addProfile();
              }}
            >
              {tab === "connections" || !data.connections.length
                ? "Connect provider"
                : "Add model"}
            </Button>
          )}
        </div>
        <div
          role="tabpanel"
          tabIndex={0}
          id={`ai-${tab}-panel`}
          aria-labelledby={`ai-${tab}-tab`}
          className="pt-4"
        >
          {tab === "models" ? (
            <div className="space-y-3">
              <ModelCategory
                id="language-models"
                title="Language & multimodal"
                description={`${data.profiles.length} saved ${data.profiles.length === 1 ? "model" : "models"} · Conversation, reasoning and images`}
                icon={Brain}
                open={category === "language"}
                onToggle={() => toggleCategory("language")}
              >
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Text as="p" variant="body-sm" tone="muted">
                      Choose the models Integral uses to respond and work with
                      you.
                    </Text>
                    <Button
                      icon={<Plus size={16} />}
                      disabled={disabled}
                      onClick={() =>
                        data.connections.length
                          ? addProfile()
                          : showConnection()
                      }
                    >
                      {data.connections.length
                        ? "Add model"
                        : "Connect provider"}
                    </Button>
                  </div>
                  <ModelRoutingSection
                    data={data}
                    profileEditorOpen={!!profile || mutation.isPending}
                    onAddModel={() => {
                      if (data.connections.length) addProfile();
                      else showConnection();
                    }}
                    onEdit={(p) => {
                      editProfile(p);
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
                    <Text weight="medium">Saved language models</Text>
                    {data.profiles.length > 3 && (
                      <Input
                        type="search"
                        aria-label="Search AI configuration"
                        placeholder="Find a model…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="sm:max-w-64"
                      />
                    )}
                  </div>
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {profiles.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-col items-stretch justify-between gap-4 py-5 first:pt-2 sm:flex-row sm:items-center"
                      >
                        <div className="flex w-full min-w-0 flex-1 items-start gap-3 sm:w-auto">
                          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] border border-[var(--border-subtle)]">
                            <Brain size={17} strokeWidth={LINE_ICON_STROKE} />
                          </span>
                          <Stack gap="xs" className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Text weight="medium" className="break-words">
                                {p.name}
                              </Text>
                              {p.id === data.default_profile_id && (
                                <Badge>Default</Badge>
                              )}
                            </div>
                            <Text
                              as="p"
                              variant="body-sm"
                              tone="muted"
                              className="break-words"
                            >
                              {p.model}
                            </Text>
                            <Text
                              as="p"
                              variant="body-sm"
                              tone="muted"
                              className="break-words"
                            >
                              {profileSummary(p.generation_settings)}
                            </Text>
                          </Stack>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {p.id !== data.default_profile_id && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="min-h-11 sm:min-h-9"
                              disabled={disabled}
                              onClick={() =>
                                run(async () => {
                                  await aiConfigurationApi.activateProfile(
                                    p.id,
                                  );
                                  notifySuccess("Default model updated.");
                                })
                              }
                            >
                              Use as default
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 sm:min-h-9"
                            icon={<Pencil size={14} />}
                            disabled={disabled}
                            onClick={() => {
                              editProfile(p);
                            }}
                          >
                            Edit profile
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 sm:min-h-9"
                            aria-label={`Remove ${p.name}`}
                            title={
                              p.id === data.default_profile_id
                                ? "Choose another default before removing this model"
                                : p.id === data.routing?.light_profile_id
                                  ? "Reassign or clear the light model before removing it"
                                  : "Remove model"
                            }
                            disabled={
                              disabled ||
                              p.id === data.default_profile_id ||
                              p.id === data.routing?.light_profile_id
                            }
                            onClick={() =>
                              setRemoveTarget({
                                id: p.id,
                                name: p.name,
                                connection: false,
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {!profiles.length && (
                      <EmptyState
                        icon={<Brain size={25} />}
                        title={
                          needle
                            ? "No matching models"
                            : "Your next model starts here"
                        }
                        description={
                          needle
                            ? "Try a different name or model ID."
                            : data.connections.length
                              ? "Add a model to one of your providers, choose its settings, then make it your default."
                              : "Connect a provider to start. You can use a local model or bring your own API key."
                        }
                      />
                    )}
                  </div>
                </div>
              </ModelCategory>
              <ModelCategory
                id="embedding-models"
                title="Embeddings"
                description="Help search find related information"
                icon={Database}
                open={category === "embeddings"}
                onToggle={() => toggleCategory("embeddings")}
              >
                <EmbeddingConfiguration
                  connections={data.connections}
                  embedded
                />
              </ModelCategory>
              <ModelCategory
                id="voice-models"
                title="Voice"
                description="Turn speech into text"
                icon={Mic}
                open={category === "voice"}
                onToggle={() => toggleCategory("voice")}
              >
                <VoiceConfiguration
                  connections={data.connections}
                  navigateToSection={navigateToSection}
                  embedded
                />
              </ModelCategory>
              <ModelCategory id="attachment-models" title="Images and documents"
                description="Make attachments searchable" icon={Image}
                open={category === "attachments"} onToggle={() => toggleCategory("attachments")}>
                <AttachmentAnalysisConfiguration />
              </ModelCategory>
              <Text as="p" variant="meta" tone="muted" className="px-1 pt-1">
                Add providers once under Providers, then choose a model in each
                category.
              </Text>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Text as="p" variant="body-sm" tone="muted">
                  Store a key once and use it across your models.
                </Text>
                {data.connections.length > 3 && (
                  <Input
                    type="search"
                    aria-label="Search AI configuration"
                    placeholder="Find a provider…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="sm:max-w-64"
                  />
                )}
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {connections.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col items-stretch justify-between gap-4 py-5 first:pt-2 sm:flex-row sm:items-center"
                  >
                    <div className="flex w-full min-w-0 flex-1 items-start gap-3 sm:w-auto">
                      <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] border border-[var(--border-subtle)]">
                        <KeyRound size={17} strokeWidth={LINE_ICON_STROKE} />
                      </span>
                      <Stack gap="xs" className="min-w-0">
                        <Text weight="medium" className="break-words">
                          {c.name}
                        </Text>
                        <Text as="p" variant="body-sm" tone="muted">
                          {PROVIDER_LABELS[c.provider]} ·{" "}
                          {c.key_fingerprint
                            ? `Key ${c.key_fingerprint}`
                            : "No key required"}
                        </Text>
                        {c.base_url && (
                          <Text
                            as="p"
                            variant="body-sm"
                            tone="muted"
                            className="break-all"
                          >
                            {c.base_url}
                          </Text>
                        )}
                        <Text
                          as="p"
                          variant="body-sm"
                          tone={c.last_test_ok === false ? "warn" : "muted"}
                          className="flex items-center gap-1.5"
                        >
                          {c.last_test_ok === false ? (
                            <AlertCircle size={13} />
                          ) : (
                            <Check size={13} />
                          )}{" "}
                          {c.last_test_ok === false
                            ? "Last test failed"
                            : c.validated_at
                              ? "Provider verified"
                              : "Not tested"}{" "}
                          ·{" "}
                          {
                            data.profiles.filter(
                              (p) => p.connection_id === c.id,
                            ).length
                          }{" "}
                          {data.profiles.filter((p) => p.connection_id === c.id)
                            .length === 1
                            ? "model"
                            : "models"}
                        </Text>
                      </Stack>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        disabled={disabled || testProvider.isPending}
                        onClick={() => testProvider.mutate(c.id)}
                      >
                        {testProvider.isPending &&
                        testProvider.variables === c.id
                          ? "Testing…"
                          : "Test provider"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        icon={<Pencil size={14} />}
                        disabled={disabled}
                        onClick={() => {
                          editConnection(c);
                        }}
                      >
                        Edit provider
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        aria-label={`Remove ${c.name}`}
                        title="Remove the models using this provider first"
                        disabled={
                          disabled ||
                          data.profiles.some((p) => p.connection_id === c.id)
                        }
                        onClick={() =>
                          setRemoveTarget({
                            id: c.id,
                            name: c.name,
                            connection: true,
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
                {!connections.length && (
                  <EmptyState
                    icon={<KeyRound size={25} />}
                    title={
                      needle
                        ? "No matching providers"
                        : "Connect once. Switch models freely."
                    }
                    description={
                      needle
                        ? "Try a different connection name."
                        : "Add a provider account or local service. Your saved key stays private and can power several models."
                    }
                  />
                )}
                <Text as="p" variant="meta" tone="muted" className="pt-4">
                  Testing checks provider access. Individual model availability
                  is confirmed when you use it.
                </Text>
              </div>
            </div>
          )}
        </div>
      </section>
      <details className="group border-t border-[var(--border-subtle)] pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-input)] py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]">
          <span className="flex items-center gap-3">
            <ShieldCheck size={18} strokeWidth={LINE_ICON_STROKE} />
            <Text weight="medium">Deployment limits</Text>
          </span>
          <ChevronDown
            size={16}
            className="transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="pt-4">
          <Text as="p" variant="body-sm" tone="muted">
            Up to {data.harness_limits.request_limit} model requests, 32 tool
            calls, {data.harness_limits.token_limit.toLocaleString()} total
            tokens and {Math.round(data.harness_limits.run_seconds / 60)}{" "}
            minutes per turn. Model profiles can use lower limits. Approval and
            access checks always apply.
          </Text>
        </div>
      </details>
      </div>}
      <Modal
        open={!!connection}
        placement="right"
        title={connection?.id ? "Edit provider" : "Connect a provider"}
        titleIcon={<KeyRound size={19} />}
        onClose={() => {
          if (!disabled) setConnection(null);
        }}
      >
        {connection && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await aiConfigurationApi.saveConnection(connection);
                setConnection(null);
                notifySuccess("Provider saved.");
              });
            }}
          >
            <Modal.Body noSpacing>
              <Stack gap="lg">
                <Text as="p" variant="body-sm" tone="muted">
                  One provider setup can serve several models. Your saved key
                  stays on the server.
                </Text>

                <Field label="Provider name">
                  <Input
                    required
                    value={connection.name}
                    onChange={(e) =>
                      setConnection({ ...connection, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Provider">
                  <Select
                    disabled={!!connection.id}
                    value={connection.provider}
                    onChange={(e) =>
                      setConnection({
                        ...freshConnection(),
                        name: connection.name,
                        provider: e.target.value as ModelProvider,
                      })
                    }
                  >
                    {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {connection.provider === "custom_openai" && (
                  <Field label="Endpoint URL">
                    <Input
                      required
                      disabled={!!connection.id}
                      value={connection.base_url}
                      onChange={(e) =>
                        setConnection({
                          ...connection,
                          base_url: e.target.value,
                        })
                      }
                      placeholder="https://provider.example/v1"
                    />
                  </Field>
                )}
                {connection.provider !== "ollama_local" && (
                  <Field
                    label={
                      connection.id
                        ? "Replacement API key (leave blank to keep saved key)"
                        : "API key"
                    }
                  >
                    <Input
                      type="password"
                      autoComplete="off"
                      disabled={connection.without_key}
                      value={connection.api_key ?? ""}
                      onChange={(e) =>
                        setConnection({
                          ...connection,
                          api_key: e.target.value,
                        })
                      }
                      required={!connection.id && !connection.without_key}
                    />
                  </Field>
                )}
                {connection.provider === "custom_openai" && (
                  <Text
                    as="label"
                    variant="body-sm"
                    className="flex items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={connection.without_key}
                      onChange={(e) =>
                        setConnection({
                          ...connection,
                          without_key: e.target.checked,
                          api_key: "",
                        })
                      }
                    />
                    Use without an API key
                  </Text>
                )}
              </Stack>
            </Modal.Body>
            <Modal.Footer>
              <Button
                type="button"
                variant="secondary"
                disabled={disabled}
                onClick={() => setConnection(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={disabled}>
                Save provider
              </Button>
            </Modal.Footer>
          </form>
        )}
      </Modal>
      <Modal
        open={!!profile}
        placement="right"
        title={profile?.id ? "Model settings" : "Add a model"}
        titleIcon={<Brain size={19} strokeWidth={LINE_ICON_STROKE} />}
        onClose={() => {
          if (!disabled) setProfile(null);
        }}
      >
        {profile && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await aiConfigurationApi.saveProfile({
                  ...profile,
                  name: profile.name.trim() || profile.model,
                });
                setProfile(null);
                notifySuccess(
                  profile.id === data.default_profile_id
                    ? "Default profile updated. Changes apply to the next turn."
                    : "Profile saved. Select Use as default when you want to switch models.",
                );
              });
            }}
          >
            <Modal.Body noSpacing>
              <Stack gap="lg">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Profile name">
                    <Input
                      placeholder="Optional — uses the model name"
                      value={profile.name}
                      onChange={(e) =>
                        setProfile({ ...profile, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Provider">
                    <Select
                      value={profile.connection_id}
                      onChange={(e) => changeProfileConnection(e.target.value)}
                    >
                      {data.connections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {PROVIDER_LABELS[c.provider]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {selectedConnection && (
                  <Field label="Model">
                    <Select
                      value={customModel ? "__custom" : profile.model}
                      onChange={(e) => {
                        const custom = e.target.value === "__custom";
                        setCustomModel(custom);
                        setProfile({
                          ...profile,
                          model: custom ? "" : e.target.value,
                          generation_settings: {},
                        });
                      }}
                    >
                      {RECOMMENDED_MODELS[selectedConnection.provider].map(
                        (m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ),
                      )}
                      <option value="__custom">Custom model ID…</option>
                    </Select>
                  </Field>
                )}
                {customModel && (
                  <Field label="Model ID">
                    <Input
                      required
                      value={profile.model}
                      placeholder="Enter the provider's model ID"
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          model: e.target.value,
                          generation_settings: {},
                        })
                      }
                    />
                  </Field>
                )}
                {caps.isError && (
                  <Text as="p" variant="body-sm" tone="warn">
                    Model capabilities are unavailable. Keep provider defaults
                    or try this model again.
                  </Text>
                )}
                <div
                  className={
                    caps.data?.reasoning_efforts.length
                      ? "grid gap-4 sm:grid-cols-2"
                      : "grid gap-4"
                  }
                >
                  {caps.data?.reasoning_efforts.length ? (
                    <Field label="Reasoning effort">
                      <Select
                        value={
                          profile.generation_settings.reasoning_effort ?? ""
                        }
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            generation_settings: {
                              ...profile.generation_settings,
                              reasoning_effort: e.target.value || undefined,
                              ...(e.target.value
                                ? {
                                    thinking_budget: undefined,
                                    thinking_enabled: undefined,
                                  }
                                : {}),
                            },
                          })
                        }
                      >
                        <option value="">Provider default</option>
                        {caps.data.reasoning_efforts.map((e) => (
                          <option key={e} value={e}>
                            {(
                              {
                                none: "Off",
                                minimal: "Minimal",
                                low: "Low",
                                medium: "Medium",
                                high: "High",
                                xhigh: "Extra high",
                                max: "Max",
                              } as Record<string, string>
                            )[e] ?? e}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : caps.data?.thinking_enabled ? (
                    <Field label="Thinking">
                      <Select
                        value={
                          profile.generation_settings.thinking_enabled == null
                            ? ""
                            : String(
                                profile.generation_settings.thinking_enabled,
                              )
                        }
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            generation_settings: {
                              ...profile.generation_settings,
                              thinking_enabled:
                                e.target.value === ""
                                  ? undefined
                                  : e.target.value === "true",
                              reasoning_effort: undefined,
                              thinking_budget: undefined,
                            },
                          })
                        }
                      >
                        <option value="">Provider default</option>
                        <option value="true">On</option>
                        <option value="false">Off</option>
                      </Select>
                    </Field>
                  ) : caps.data?.thinking_budget ? (
                    <Field label="Thinking budget tokens">
                      <Input
                        type="number"
                        min="1024"
                        placeholder="Provider default"
                        value={
                          profile.generation_settings.thinking_budget ?? ""
                        }
                        onChange={(e) =>
                          numeric("thinking_budget", e.target.value)
                        }
                      />
                    </Field>
                  ) : (
                    <Text variant="body-sm" tone="muted">
                      {caps.isFetching
                        ? "Checking model capabilities…"
                        : caps.data?.verified
                          ? "This model does not expose adjustable reasoning."
                          : "Reasoning controls could not be verified for this provider/model."}
                    </Text>
                  )}
                  {caps.data?.max_tokens && (
                    <Field label="Maximum output tokens">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Provider default"
                        value={profile.generation_settings.max_tokens ?? ""}
                        onChange={(e) => numeric("max_tokens", e.target.value)}
                      />
                    </Field>
                  )}
                </div>
                {selectedConnection &&
                  (selectedConnection.provider === "custom_openai" ||
                    (caps.data?.thinking_enabled && !caps.data.verified)) && (
                    <Text variant="body-sm" tone="muted">
                      Optional reasoning settings are sent only when selected.
                      Confirm the supported values with your endpoint; model
                      support is unverified.
                    </Text>
                  )}
                <details>
                  <summary className="cursor-pointer rounded-[var(--radius-input)] py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]">
                    <Text as="span" weight="medium">
                      Advanced settings
                    </Text>
                  </summary>
                  <Stack gap="md" className="pt-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge>
                        Tools:{" "}
                        {caps.data?.tool_calling == null
                          ? "unverified"
                          : caps.data.tool_calling
                            ? "supported"
                            : "not advertised"}
                      </Badge>
                      <Badge>
                        Images:{" "}
                        {caps.data?.vision == null
                          ? "unverified"
                          : caps.data.vision
                            ? "supported"
                            : "not advertised"}
                      </Badge>
                      {caps.data?.native_context ? (
                        <Badge>
                          {caps.data.native_context.toLocaleString()} input
                          tokens
                        </Badge>
                      ) : null}
                    </div>
                    <AdvancedOptions
                      profile={profile}
                      capabilities={caps.data}
                      numeric={numeric}
                      onChange={setProfile}
                    />
                  </Stack>
                </details>
              </Stack>
            </Modal.Body>
            <Modal.Footer>
              <Button
                type="button"
                variant="secondary"
                disabled={disabled}
                onClick={() => setProfile(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  disabled ||
                  caps.isFetching ||
                  capModel !== profile.model.trim()
                }
              >
                Save profile
              </Button>
            </Modal.Footer>
          </form>
        )}
      </Modal>
      <Modal
        open={!!removeTarget}
        variant="compact"
        width="max-w-dialog-confirm"
        title={removeTarget?.connection ? "Remove provider?" : "Remove model?"}
        onClose={() => {
          if (!disabled) setRemoveTarget(null);
        }}
      >
        <Modal.Body noSpacing>
          <Stack gap="lg">
            <Text as="p">
              Remove “{removeTarget?.name}” from Integral? This does not delete
              your provider account.
            </Text>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => setRemoveTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() =>
              run(async () => {
                if (!removeTarget) return;
                if (removeTarget.connection)
                  await aiConfigurationApi.removeConnection(removeTarget.id);
                else await aiConfigurationApi.removeProfile(removeTarget.id);
                setRemoveTarget(null);
                notifySuccess("Configuration removed.");
              })
            }
          >
            Remove
          </Button>
        </Modal.Footer>
      </Modal>
    </Stack>
  );
}

function Feedback({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: ReactNode;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className="flex items-start gap-2"
    >
      <span className="mt-0.5 shrink-0">
        {kind === "error" ? <AlertCircle size={16} /> : <Check size={16} />}
      </span>
      <Text
        as="div"
        variant="body-sm"
        tone={kind === "error" ? "danger" : "default"}
      >
        {children}
      </Text>
    </div>
  );
}
function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="mb-1">{icon}</span>
      <Text as="h4" variant="heading-sm">
        {title}
      </Text>
      <Text as="p" variant="body-sm" tone="muted" className="max-w-md">
        {description}
      </Text>
    </div>
  );
}
function AdvancedOptions({
  profile,
  capabilities,
  numeric,
  onChange,
}: {
  profile: ProfileWrite;
  capabilities:
    import("../../../api/aiConfiguration").ModelCapabilities | undefined;
  numeric: (key: keyof GenerationSettings, value: string) => void;
  onChange: (profile: ProfileWrite) => void;
}) {
  const groups = [
    {
      title: "Response & context",
      hint: "Sampling, thinking and local context",
      fields: [
        ["temperature", "Temperature", capabilities?.temperature],
        ["top_p", "Top-p", capabilities?.top_p],
        [
          "thinking_budget",
          "Thinking token budget",
          capabilities?.thinking_budget &&
            !!capabilities.reasoning_efforts.length,
        ],
        [
          "context_window",
          "Local context window",
          capabilities?.context_window,
        ],
      ],
    },
    {
      title: "Timeouts",
      hint: "How long to wait for the provider",
      fields: [
        ["request_timeout", "Request timeout (seconds)", true],
        ["idle_timeout", "Idle timeout (seconds)", true],
      ],
    },
    {
      title: "Run limits",
      hint: "Bound the work Integral can do in a turn",
      fields: [
        ["model_request_limit", "Model requests per turn", true],
        ["tool_call_limit", "Tool calls per turn", true],
        ["turn_token_limit", "Total tokens per turn", true],
        ["turn_timeout", "Turn timeout (seconds)", true],
      ],
    },
  ] as const;
  return (
    <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
      {groups.map((group) => (
        <details key={group.title} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]">
            <span>
              <Text as="span" weight="medium">
                {group.title}
              </Text>
              <Text
                as="span"
                variant="body-sm"
                tone="muted"
                className="block sm:ml-3 sm:inline"
              >
                {group.hint}
              </Text>
            </span>
            <ChevronDown
              size={16}
              className="shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="pb-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {group.fields
                .filter(([, , visible]) => visible)
                .map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Input
                      type="number"
                      step={
                        key === "temperature" || key === "top_p" ? "0.1" : "1"
                      }
                      placeholder="Default"
                      value={profile.generation_settings[key] ?? ""}
                      onChange={(e) => numeric(key, e.target.value)}
                    />
                  </Field>
                ))}
              {group.title === "Response & context" &&
                capabilities?.verbosity && (
                  <Field label="Response detail">
                    <Select
                      value={profile.generation_settings.verbosity ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...profile,
                          generation_settings: {
                            ...profile.generation_settings,
                            verbosity: e.target.value || undefined,
                          },
                        })
                      }
                    >
                      <option value="">Provider default</option>
                      <option value="low">Concise</option>
                      <option value="medium">Standard</option>
                      <option value="high">Detailed</option>
                    </Select>
                  </Field>
                )}
            </div>
            <Text as="p" variant="body-sm" tone="muted" className="mt-3">
              {group.title === "Response & context"
                ? "Leave blank for provider defaults. Choose temperature or top-p. A thinking budget must fit within the output limit."
                : group.title === "Timeouts"
                  ? "Leave blank to use deployment timeouts. A shorter idle timeout can detect a stalled request sooner."
                  : "Leave blank for deployment limits. Lower values apply to this profile; approval and access checks remain in place."}
            </Text>
          </div>
        </details>
      ))}
    </div>
  );
}
