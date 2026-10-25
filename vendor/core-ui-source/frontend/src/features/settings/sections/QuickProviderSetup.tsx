import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound } from "lucide-react";
import { aiConfigurationApi, AI_CONFIGURATION_QUERY_KEY, type AIConfiguration, type ModelConnection, type ModelProfile } from "../../../api/aiConfiguration";
import { MODEL_CREDENTIALS_QUERY_KEY, PROVIDER_LABELS, type ModelProvider } from "../../../api/modelCredentials";
import { defaultModel, RECOMMENDED_MODELS } from "../../../api/modelPresets";
import { errorMessageFromAxios } from "../../../api/helpers";
import { useToast } from "../../../context/ToastContext";
import { Button } from "../../../components/ui/Button";
import { Input, Select, Stack, Surface, Text } from "../../../ui";

const QUICK_PROVIDERS = ["openai", "anthropic", "openrouter", "ollama"] as const;
type QuickProvider = typeof QUICK_PROVIDERS[number];
const isQuickProvider = (provider: string): provider is QuickProvider => QUICK_PROVIDERS.some(value => value === provider);

function savedConnection(data: AIConfiguration, provider: ModelProvider) {
  const active = data.profiles.find(profile => profile.id === data.default_profile_id);
  const connection = data.connections.find(item => item.id === active?.connection_id && item.provider === provider);
  const matching = data.connections.filter(item => item.provider === provider);
  return connection || (matching.length === 1 ? matching[0] : undefined);
}

/** Minimal BYOK path; all writes use the existing authenticated configuration API. */
export function QuickProviderSetup({ data, disabled, onBusyChange }: {
  data: AIConfiguration; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<QuickProvider>(isQuickProvider(data.effective.provider) ? data.effective.provider : "openai");
  const [apiKey, setApiKey] = useState("");
  const progress = useRef<{ provider: QuickProvider; connectionId: string } | null>(null);
  const managed = data.key_policy === "platform_only";
  const available = Boolean(data.effective.model && data.effective.source !== "unavailable");
  const connection = savedConnection(data, provider);
  const model = defaultModel(provider);
  const modelName = RECOMMENDED_MODELS[provider].find(item => item.id === model)?.label || model;
  const readOnly = managed || !data.effective.editable;
  const setup = useMutation({
    mutationFn: async ({ selectedProvider, key }: { selectedProvider: QuickProvider; key: string }) => {
      const current = await aiConfigurationApi.get();
      if (current.key_policy === "platform_only" || !current.effective.editable) throw new Error("This workspace uses its owner's AI configuration.");
      const previous = progress.current?.provider === selectedProvider ? current.connections.find(item => item.id === progress.current?.connectionId) : undefined;
      const existing = previous || savedConnection(current, selectedProvider);
      const active = current.profiles.find(profile => profile.id === current.default_profile_id);
      const saved: ModelConnection = await aiConfigurationApi.saveConnection({
        ...(existing ? { id: existing.id } : {}),
        name: existing?.name || PROVIDER_LABELS[selectedProvider], provider: selectedProvider,
        base_url: "", without_key: false, ...(key.trim() ? { api_key: key.trim() } : {}),
      });
      // Clear the field once the server has validated and stored the key.
      setApiKey("");
      progress.current = { provider: selectedProvider, connectionId: saved.id };
      // Updating the current key must preserve deliberate model/routing tuning.
      if (active?.connection_id === saved.id) return;
      const recommended = defaultModel(selectedProvider);
      const reused = current.profiles.find(profile => profile.connection_id === saved.id && profile.model === recommended && Object.keys(profile.generation_settings).length === 0);
      const profile: ModelProfile = reused || await aiConfigurationApi.saveProfile({
        name: RECOMMENDED_MODELS[selectedProvider].find(item => item.id === recommended)?.label || recommended,
        connection_id: saved.id, model: recommended, generation_settings: {},
      });
      await aiConfigurationApi.saveRouting({
        mode: "single", heavy_profile_id: profile.id, light_profile_id: "", revision: current.routing?.revision || "",
      });
    },
    onMutate: () => onBusyChange(true),
    onSuccess: () => { progress.current = null; setEditing(false); showToast("Your AI provider is ready.", "success"); },
    onError: error => showToast(errorMessageFromAxios(error, "Could not finish AI setup. Check your provider and API key, then try again."), "error"),
    onSettled: async () => {
      // Refresh partial saves too, so retry reuses the validated provider/profile.
      try {
        await Promise.all([
          qc.invalidateQueries({ queryKey: AI_CONFIGURATION_QUERY_KEY }),
          qc.invalidateQueries({ queryKey: MODEL_CREDENTIALS_QUERY_KEY }),
          qc.invalidateQueries({ queryKey: ["agentive", "status"] }),
        ]);
      } finally { onBusyChange(false); }
    },
  });
  const pending = disabled || setup.isPending;
  function submit(event: FormEvent) {
    event.preventDefault();
    setup.mutate({ selectedProvider: provider, key: apiKey });
  }
  return <Surface padding="lg" border="subtle">
    <Stack gap="md">
      <div className="flex items-start gap-3">
        {available ? <Check size={20} aria-hidden /> : <KeyRound size={20} aria-hidden />}
        <div className="min-w-0">
          <Text as="h3" variant="heading-sm">{readOnly && !available ? "Workspace AI" : editing ? "Update your AI provider" : available ? "Your AI is connected" : "Connect your AI provider"}</Text>
          <Text as="p" variant="body-sm" tone="muted">
            {readOnly ? managed ? "AI is managed for this installation." : "This workspace uses its owner's AI setup."
              : editing ? "Choose a provider or update its API key." : available ? "You're ready to chat and work with Integral." : "Choose a provider and add your API key. Integral takes care of the model settings."}
          </Text>
        </div>
      </div>
      {available && !editing && <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><Text as="p" variant="body-sm" weight="medium">{PROVIDER_LABELS[data.effective.provider as ModelProvider] || "Provided by this installation"}</Text><Text as="p" variant="meta" tone="muted" className="break-words">{data.effective.model}</Text></div>
        {!readOnly && !editing && <Button variant="secondary" disabled={pending} onClick={() => setEditing(true)}>{data.effective.source === "deployment" ? "Use my own provider" : "Change provider"}</Button>}
      </div>}
      {!readOnly && (!available || editing) && <form onSubmit={submit}>
        <Stack gap="md">
          <label className="block space-y-1"><Text as="span" variant="label">AI provider</Text>
            <Select aria-label="AI provider" value={provider} disabled={pending} onChange={event => { setProvider(event.target.value as QuickProvider); setApiKey(""); progress.current = null; }}>
              {QUICK_PROVIDERS.map(item => <option key={item} value={item}>{PROVIDER_LABELS[item]}</option>)}
            </Select>
          </label>
          <label className="block space-y-1"><Text as="span" variant="label">API key</Text>
            <Input aria-label="API key" type="password" autoComplete="off" required={!connection?.key_fingerprint} value={apiKey} disabled={pending}
              placeholder={connection?.key_fingerprint ? "Leave blank to keep your saved key" : "Enter your provider API key"} onChange={event => setApiKey(event.target.value)} />
          </label>
          <Text as="p" variant="meta" tone="muted">{connection && connection.id === data.profiles.find(item => item.id === data.default_profile_id)?.connection_id
            ? "Your current model settings will be kept." : `${modelName} will be selected automatically.`}</Text>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || (!connection?.key_fingerprint && !apiKey.trim())} loading={setup.isPending}>{available ? "Save provider" : "Connect provider"}</Button>
            {editing && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setApiKey(""); }}>Cancel</Button>}
          </div>
        </Stack>
      </form>}
      {!readOnly && <Text as="p" variant="meta" tone="muted">API usage is billed by your provider.</Text>}
    </Stack>
  </Surface>;
}
