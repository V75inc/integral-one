import api from "./client";
import type { ModelProvider } from "./modelCredentials";

export const AI_CONFIGURATION_QUERY_KEY = ["ai-configuration"] as const;
export interface GenerationSettings {
  reasoning_effort?: string;
  thinking_enabled?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  verbosity?: string;
  thinking_budget?: number;
  context_window?: number;
  request_timeout?: number;
  idle_timeout?: number;
  model_request_limit?: number;
  tool_call_limit?: number;
  turn_token_limit?: number;
  turn_timeout?: number;
}
export interface ModelConnection {
  id: string;
  name: string;
  provider: ModelProvider;
  base_url: string;
  key_fingerprint: string;
  validated_at: string;
  updated_at: string;
  last_test_ok?: boolean | null;
  last_tested_at?: string;
}
export interface ModelProfile {
  id: string;
  name: string;
  connection_id: string;
  model: string;
  generation_settings: GenerationSettings;
  updated_at: string;
}
export interface ModelCapabilities {
  reasoning_efforts: string[];
  thinking_enabled?: boolean;
  native_context?: number | null;
  tool_calling?: boolean | null;
  vision?: boolean | null;
  max_tokens: boolean;
  temperature: boolean;
  top_p: boolean;
  verbosity: boolean;
  thinking_budget: boolean;
  context_window: boolean;
  verified: boolean;
}
export interface ModelRouting {
  mode: "single" | "light_heavy";
  heavy_profile_id: string;
  light_profile_id: string;
  revision: string;
}
export interface AIConfiguration {
  routing?: ModelRouting;
  connections: ModelConnection[];
  profiles: ModelProfile[];
  default_profile_id: string;
  key_policy: string;
  effective: {
    workspace_id: string;
    source: string;
    editable: boolean;
    provider: string;
    model: string;
    generation_settings: GenerationSettings;
    routing?: {
      mode: "single" | "light_heavy";
      heavy_model: string;
      light_model: string;
      heavy_generation_settings?: GenerationSettings;
      light_generation_settings?: GenerationSettings;
    };
  };
  harness_limits: {
    request_limit: number;
    token_limit: number;
    run_seconds: number;
    request_timeout: number;
    idle_timeout: number;
  };
}
export type ConnectionWrite = Omit<
  ModelConnection,
  | "id"
  | "key_fingerprint"
  | "validated_at"
  | "updated_at"
  | "last_test_ok"
  | "last_tested_at"
> & { id?: string; api_key?: string; without_key: boolean };
export type ProfileWrite = Omit<ModelProfile, "id" | "updated_at"> & {
  id?: string;
};
export const aiConfigurationApi = {
  async get(): Promise<AIConfiguration> {
    return (await api.get("/users/me/ai-configuration")).data;
  },
  async capabilities(
    provider: ModelProvider,
    model: string,
  ): Promise<ModelCapabilities> {
    return (await api.post("/users/me/model-capabilities", { provider, model }))
      .data;
  },
  async saveConnection(body: ConnectionWrite) {
    return (await api.post("/users/me/model-connections", body)).data;
  },
  async testConnection(
    id: string,
  ): Promise<{ valid: boolean; message: string }> {
    return (await api.post("/users/me/model-connections/test", { id })).data;
  },
  async removeConnection(id: string) {
    await api.post("/users/me/model-connections/remove", { id });
  },
  async saveProfile(body: ProfileWrite) {
    return (await api.post("/users/me/model-profiles", body)).data;
  },
  async saveRouting(body: ModelRouting) {
    return (await api.post("/users/me/model-routing", body)).data;
  },
  async activateProfile(id: string) {
    await api.post("/users/me/model-profiles/activate", { id });
  },
  async removeProfile(id: string) {
    await api.post("/users/me/model-profiles/remove", { id });
  },
  async conversation(
    thread_id: string,
    profile_id?: string,
    routing_mode?: "inherit" | "heavy" | "profile",
    reasoning_efforts?: Partial<Record<"heavy" | "light", string | null>>,
  ): Promise<{
    profile_id: string;
    editable: boolean;
    reasoning_efforts?: Partial<Record<"heavy" | "light", string>>;
    reasoning_choices?: Partial<Record<"heavy" | "light", { model: string; efforts: string[]; default_effort?: string | null }>>;
    routing_mode?: "inherit" | "heavy" | "profile";
  }> {
    return (
      await api.post("/users/me/conversation-model", {
        thread_id,
        ...(profile_id !== undefined ? { profile_id } : {}),
        ...(routing_mode !== undefined ? { routing_mode } : {}),
        ...(reasoning_efforts !== undefined ? { reasoning_efforts } : {}),
      })
    ).data;
  },
};

export const EMBEDDING_CONFIGURATION_QUERY_KEY = [
  "embedding-configuration",
] as const;
export interface EmbeddingChoice {
  mode: "deployment" | "provider";
  connection_id: string;
  model: string;
  dimensions: number;
  allow_workspace_text: boolean;
}
export interface EmbeddingConfiguration {
  workspace_id: string;
  editable: boolean;
  provider_overrides_supported: boolean;
  revision: number;
  configuration: EmbeddingChoice;
  effective_provider: string;
  effective_model: string;
  dimensions: number;
  profile_id: string | null;
  rebuild_status: string;
  error: string;
  changed?: boolean;
}
export const embeddingConfigurationApi = {
  async get(): Promise<EmbeddingConfiguration> {
    return (await api.get("/users/me/embedding-configuration")).data;
  },
  async save(
    body: EmbeddingChoice & { revision: number },
  ): Promise<EmbeddingConfiguration> {
    return (await api.post("/users/me/embedding-configuration", body)).data;
  },
  async test(
    body: EmbeddingChoice,
  ): Promise<{ valid: boolean; message: string }> {
    return (await api.post("/users/me/embedding-configuration/test", body))
      .data;
  },
};

export const VOICE_CONFIGURATION_QUERY_KEY = ["voice-configuration"] as const;
export interface VoiceChoice {
  mode: "inherit" | "provider" | "disabled";
  connection_id: string;
  model: string;
}
export interface VoiceConfigurationData {
  workspace_id: string;
  editable: boolean;
  revision: number;
  configuration: VoiceChoice;
  effective_model: string;
  effective_provider: string;
}
export const voiceConfigurationApi = {
  async get(): Promise<VoiceConfigurationData> {
    return (await api.get("/users/me/voice-configuration")).data;
  },
  async save(
    body: VoiceChoice & { revision: number },
  ): Promise<VoiceConfigurationData> {
    return (await api.post("/users/me/voice-configuration", body)).data;
  },
};
