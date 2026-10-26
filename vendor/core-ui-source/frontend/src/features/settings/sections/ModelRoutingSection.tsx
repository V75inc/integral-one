import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain } from "lucide-react";
import { Modal, Badge } from "../../../components/ui";
import { Button } from "../../../components/ui/Button";
import { Stack, Text, Select, Surface } from "../../../ui";
import {
  aiConfigurationApi,
  AI_CONFIGURATION_QUERY_KEY,
  type AIConfiguration,
  type ModelProfile,
  type ModelRouting,
  type GenerationSettings,
} from "../../../api/aiConfiguration";
import { MODEL_CREDENTIALS_QUERY_KEY } from "../../../api/modelCredentials";
import { errorMessageFromAxios } from "../../../api/helpers";
import { useToast } from "../../../context/ToastContext";
import { LINE_ICON_STROKE } from "../../../components/ui/IconWell";

function ModelRoleReadout({
  role,
  purpose,
  model,
  settings,
  onEdit,
}: {
  role: string;
  purpose: string;
  model: string;
  settings: GenerationSettings;
  onEdit?: () => void;
}) {
  const rows = [
    [
      "Reasoning",
      settings.reasoning_effort ??
        (settings.thinking_enabled != null
          ? settings.thinking_enabled
            ? "On"
            : "Off"
          : settings.thinking_budget
            ? `${settings.thinking_budget.toLocaleString()} token budget`
            : "Provider default"),
    ],
    [
      "Max output",
      settings.max_tokens
        ? `${settings.max_tokens.toLocaleString()} tokens`
        : "Provider default",
    ],
    ...(settings.temperature != null
      ? [["Temperature", String(settings.temperature)]]
      : []),
    ...(settings.top_p != null ? [["Top-p", String(settings.top_p)]] : []),
    ...(settings.verbosity ? [["Detail", settings.verbosity]] : []),
    ...(settings.thinking_budget
      ? [
          [
            "Thinking budget",
            `${settings.thinking_budget.toLocaleString()} tokens`,
          ],
        ]
      : []),
    ...(settings.context_window
      ? [
          [
            "Context window",
            `${settings.context_window.toLocaleString()} tokens`,
          ],
        ]
      : []),
    ...(settings.request_timeout
      ? [["Request timeout", `${settings.request_timeout}s`]]
      : []),
    ...(settings.idle_timeout
      ? [["Idle timeout", `${settings.idle_timeout}s`]]
      : []),
  ];
  return (
    <section aria-label={`${role} model configuration`} className="min-w-0">
      <Surface
        tone="panel"
        padding="md"
        border="subtle"
        radius="card"
        className="h-full"
      >
        <Stack gap="md">
          <Stack gap="xs">
            <Text weight="medium">{role}</Text>
            <Text variant="body-sm" tone="muted">
              {purpose}
            </Text>
            <Text weight="medium" className="break-words">
              {model || "Not configured"}
            </Text>
          </Stack>
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              {role === "Light" ? "Light model settings" : "Model settings"}
            </Button>
          )}
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <Text as="dt" variant="body-sm" tone="muted">
                  {label}
                </Text>
                <Text
                  as="dd"
                  variant="body-sm"
                  className="break-words text-right"
                >
                  {value}
                </Text>
              </div>
            ))}
          </dl>
        </Stack>
      </Surface>
    </section>
  );
}

export function ModelRoutingSection({
  data,
  onEdit,
  onAddModel,
  profileEditorOpen = false,
}: {
  data: AIConfiguration;
  onEdit: (profile: ModelProfile) => void;
  onAddModel?: () => void;
  profileEditorOpen?: boolean;
}) {
  const [draft, setDraft] = useState<ModelRouting | null>(null);
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [editingProfile, setEditingProfile] = useState(false);
  const returnToRouting = useRef<{
    sawEditor: boolean;
    mode: string;
    light: string;
    heavy: string;
  } | null>(null);
  const save = useMutation({
    mutationFn: aiConfigurationApi.saveRouting,
    onSuccess: () => {
      setDraft(null);
      showToast(
        "Model routing saved. Changes apply to the next turn.",
        "success",
      );
      qc.invalidateQueries({ queryKey: AI_CONFIGURATION_QUERY_KEY });
      qc.invalidateQueries({ queryKey: MODEL_CREDENTIALS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["conversation-model"] });
    },
    onError: (error) =>
      showToast(
        errorMessageFromAxios(error, "Could not save model routing."),
        "error",
      ),
  });
  const routing = data.routing ?? {
    mode: "single",
    heavy_profile_id: data.default_profile_id,
    light_profile_id: "",
    revision: "",
  };
  useEffect(() => {
    const back = returnToRouting.current;
    if (!editingProfile || !back) return;
    if (profileEditorOpen) {
      back.sawEditor = true;
      return;
    }
    if (!back.sawEditor) return;
    // A profile edit can update the credential revision. Keep the user's
    // unsaved pair, but never absorb a concurrent change of routing authority.
    if (
      back.mode === routing.mode &&
      back.light === routing.light_profile_id &&
      back.heavy === routing.heavy_profile_id
    ) {
      setDraft((value) => value && { ...value, revision: routing.revision });
    }
    returnToRouting.current = null;
    setEditingProfile(false);
  }, [
    editingProfile,
    profileEditorOpen,
    routing.mode,
    routing.light_profile_id,
    routing.heavy_profile_id,
    routing.revision,
  ]);
  const editFromRouting = (profile: ModelProfile) => {
    returnToRouting.current = {
      sawEditor: false,
      mode: routing.mode,
      light: routing.light_profile_id,
      heavy: routing.heavy_profile_id,
    };
    setEditingProfile(true);
    onEdit(profile);
  };
  const effective = data.effective.routing;
  const dual = effective?.mode === "light_heavy";
  const disabled =
    data.key_policy === "platform_only" || !data.effective.editable;
  const selected = (id: string) => data.profiles.find((p) => p.id === id);
  const brief = (p: ModelProfile) =>
    `${data.connections.find((c) => c.id === p.connection_id)?.name ? `${data.connections.find((c) => c.id === p.connection_id)!.name} · ` : ""}${p.model} · ${p.generation_settings.reasoning_effort ? `${p.generation_settings.reasoning_effort} reasoning` : "Default reasoning"}${p.generation_settings.max_tokens ? ` · ${p.generation_settings.max_tokens.toLocaleString()} output tokens` : ""}`;
  const limits = draft
    ? [
        selected(draft.heavy_profile_id),
        ...(draft.mode === "light_heavy"
          ? [selected(draft.light_profile_id)]
          : []),
      ].filter((p): p is ModelProfile => !!p)
    : [];
  const minimum = (
    key:
      | "model_request_limit"
      | "tool_call_limit"
      | "turn_token_limit"
      | "turn_timeout",
    ceiling: number,
  ) =>
    Math.min(
      ceiling,
      ...limits.map((p) => p.generation_settings[key] ?? ceiling),
    );
  const effectiveSettings = [
    effective?.heavy_generation_settings ?? data.effective.generation_settings,
    ...(dual ? [effective?.light_generation_settings ?? {}] : []),
  ];
  const effectiveMinimum = (
    key:
      | "model_request_limit"
      | "tool_call_limit"
      | "turn_token_limit"
      | "turn_timeout",
    ceiling: number,
  ) =>
    Math.min(
      ceiling,
      ...effectiveSettings.map((settings) => settings[key] ?? ceiling),
    );
  return (
    <>
      <Stack gap="md" className="border-b border-[var(--border-subtle)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Stack gap="xs">
            <div className="flex flex-wrap items-center gap-2">
              <Text weight="medium">Model routing</Text>
              <Badge>{dual ? "Automatic" : "Single model"}</Badge>
              <Badge>
                {data.effective.source === "deployment"
                  ? "Server default"
                  : data.effective.source === "workspace_owner"
                    ? "Workspace override"
                    : "Not configured"}
              </Badge>
            </div>
            <Text variant="body-sm" tone="muted">
              {dual
                ? "Light handles conversation. Heavy handles operational work and escalations."
                : "One model handles conversation and operational work."}
            </Text>
          </Stack>
          <Button
            variant="secondary"
            className="min-h-11 sm:min-h-9"
            disabled={disabled || !data.profiles.length}
            onClick={() => {
              setDraft({ ...routing });
            }}
          >
            Configure routing
          </Button>
        </div>
        <div className={dual ? "grid gap-3 md:grid-cols-2" : "grid gap-3"}>
          {dual && (
            <ModelRoleReadout
              role="Light"
              purpose="Quick conversation"
              model={effective.light_model}
              onEdit={
                !disabled && selected(routing.light_profile_id)
                  ? () => onEdit(selected(routing.light_profile_id)!)
                  : undefined
              }
              settings={effective.light_generation_settings ?? {}}
            />
          )}
          <ModelRoleReadout
            role={dual ? "Heavy" : "Main"}
            purpose={
              dual
                ? "Operational work and deeper context"
                : "Conversation and operational work"
            }
            model={effective?.heavy_model || data.effective.model}
            onEdit={
              !disabled &&
              selected(routing.heavy_profile_id) &&
              data.effective.source === "workspace_owner"
                ? () => onEdit(selected(routing.heavy_profile_id)!)
                : undefined
            }
            settings={
              effective?.heavy_generation_settings ??
              data.effective.generation_settings
            }
          />
        </div>
        <details>
          <summary className="cursor-pointer rounded-[var(--radius-input)] py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]">
            <Text as="span" variant="body-sm" tone="muted">
              Shared run limits
            </Text>
          </summary>
          <Text variant="body-sm" tone="muted">
            Shared turn limits:{" "}
            {effectiveMinimum(
              "model_request_limit",
              data.harness_limits.request_limit,
            )}{" "}
            requests · {effectiveMinimum("tool_call_limit", 32)} tool calls ·{" "}
            {effectiveMinimum(
              "turn_token_limit",
              data.harness_limits.token_limit,
            ).toLocaleString()}{" "}
            tokens ·{" "}
            {effectiveMinimum("turn_timeout", data.harness_limits.run_seconds)}
            s.{" "}
            {dual ? "Both roles share these limits." : "Applies to each turn."}
          </Text>
        </details>
        {data.effective.source === "deployment" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text variant="body-sm" tone="muted" className="min-w-0 flex-1">
              {data.key_policy === "platform_only"
                ? "Your administrator requires server-managed models. Personal overrides are disabled."
                : data.effective.editable
                  ? "These are your server defaults. Add your own model to override them for this workspace."
                  : "The workspace owner can override these server defaults with a saved model."}
            </Text>
            {!disabled && onAddModel && (
              <Button variant="secondary" onClick={onAddModel}>
                Add your own model
              </Button>
            )}
          </div>
        )}
        {data.effective.source === "workspace_owner" && (
          <Text variant="body-sm" tone="muted">
            {disabled
              ? "Managed by the workspace owner."
              : "Your saved model configuration overrides server defaults for this workspace."}
          </Text>
        )}
      </Stack>
      <Modal
        open={!!draft && !editingProfile}
        placement="right"
        title="Model routing"
        titleIcon={<Brain size={19} strokeWidth={LINE_ICON_STROKE} />}
        onClose={() => {
          if (!save.isPending) setDraft(null);
        }}
      >
        {draft && (
          <form
            onSubmit={(event) => {
              event.preventDefault();

              save.mutate(draft);
            }}
          >
            <Modal.Body noSpacing>
              <Stack gap="lg">
                <Text as="p" variant="body-sm" tone="muted">
                  Choose one model, or use a lighter profile for quick
                  conversation and a heavier profile when Integral needs its
                  operational context.
                </Text>
                <Text
                  as="label"
                  variant="body-sm"
                  className="flex flex-col gap-1"
                >
                  Routing mode
                  <Select
                    value={draft.mode}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        mode: event.target.value as ModelRouting["mode"],
                      })
                    }
                  >
                    <option value="single">Single model</option>
                    <option value="light_heavy">
                      Automatic (light + heavy)
                    </option>
                  </Select>
                </Text>
                {(draft.mode === "light_heavy"
                  ? ["light", "heavy"]
                  : ["heavy"]
                ).map((role) => {
                  const key =
                    role === "light" ? "light_profile_id" : "heavy_profile_id";
                  const profile = selected(draft[key]);
                  return (
                    <Stack gap="sm" key={role}>
                      <Text
                        as="label"
                        variant="body-sm"
                        className="flex flex-col gap-1"
                      >
                        {role === "light"
                          ? "Light model"
                          : draft.mode === "light_heavy"
                            ? "Heavy model (default)"
                            : "Main model"}
                        <Select
                          required
                          value={draft[key]}
                          onChange={(event) =>
                            setDraft({ ...draft, [key]: event.target.value })
                          }
                        >
                          <option value="">Choose a profile</option>
                          {data.profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.model}
                            </option>
                          ))}
                        </Select>
                      </Text>
                      {profile && (
                        <>
                          <Text
                            variant="body-sm"
                            tone="muted"
                            className="break-words"
                          >
                            {brief(profile)}
                          </Text>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={save.isPending}
                            onClick={() => editFromRouting(profile)}
                          >
                            Edit{" "}
                            {role === "light"
                              ? "light"
                              : draft.mode === "light_heavy"
                                ? "heavy"
                                : "main"}{" "}
                            model settings
                          </Button>
                        </>
                      )}
                    </Stack>
                  );
                })}
                {draft.mode === "light_heavy" &&
                  draft.light_profile_id &&
                  draft.light_profile_id === draft.heavy_profile_id && (
                    <Text as="p" variant="body-sm" tone="warn">
                      Both roles use the same profile. Choose different profiles
                      to vary the model or reasoning settings.
                    </Text>
                  )}
                {routing.light_profile_id && draft.mode === "single" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDraft({ ...draft, light_profile_id: "" })}
                  >
                    Clear saved light assignment
                  </Button>
                )}
                <details>
                  <summary className="cursor-pointer rounded-[var(--radius-input)] py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]">
                    <Text as="span" variant="body-sm" tone="muted">
                      Run limits and routing details
                    </Text>
                  </summary>
                  <Text as="p" variant="body-sm" tone="muted">
                    {draft.mode === "light_heavy"
                      ? "Both passes share up to"
                      : "Each turn allows up to"}{" "}
                    {minimum(
                      "model_request_limit",
                      data.harness_limits.request_limit,
                    )}{" "}
                    requests, {minimum("tool_call_limit", 32)} tool calls,{" "}
                    {minimum(
                      "turn_token_limit",
                      data.harness_limits.token_limit,
                    ).toLocaleString()}{" "}
                    total tokens and{" "}
                    {minimum("turn_timeout", data.harness_limits.run_seconds)}{" "}
                    seconds. Profile limits can only reduce deployment limits.
                  </Text>
                  <Text as="p" variant="body-sm" tone="muted">
                    Known operational requests go straight to the heavy model. A
                    light response may escalate once. Two profiles can use the
                    same model with different reasoning settings.
                  </Text>
                </details>
              </Stack>
            </Modal.Body>
            <Modal.Footer>
              <Button
                type="button"
                variant="secondary"
                disabled={save.isPending}
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  save.isPending ||
                  !selected(draft.heavy_profile_id) ||
                  (draft.mode === "light_heavy" &&
                    !selected(draft.light_profile_id))
                }
              >
                Save routing
              </Button>
            </Modal.Footer>
          </form>
        )}
      </Modal>
    </>
  );
}
