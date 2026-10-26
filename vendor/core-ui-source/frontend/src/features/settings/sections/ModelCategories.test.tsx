import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmbeddingConfiguration } from "./EmbeddingConfiguration";
import { VoiceConfiguration } from "./VoiceConfiguration";
import {
  embeddingConfigurationApi,
  voiceConfigurationApi,
} from "../../../api/aiConfiguration";
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../context/ToastContext", () => ({
  useToast: () => ({ showToast: toast }),
}));
vi.mock("../../../context/AuthContext", () => ({
  useAuthOptional: () => ({ user: { id: "owner" } }),
}));
vi.mock("../../../context/ScopeContext", () => ({
  useScopeOptional: () => ({ scope: { workspaceId: "workspace" } }),
}));
vi.mock("../../../api/aiConfiguration", async (original) => ({
  ...(await original<typeof import("../../../api/aiConfiguration")>()),
  embeddingConfigurationApi: { get: vi.fn(), save: vi.fn(), test: vi.fn() },
  voiceConfigurationApi: { get: vi.fn(), save: vi.fn() },
}));
const connections = [
  {
    id: "openai",
    name: "Saved OpenAI",
    provider: "openai" as const,
    base_url: "",
    key_fingerprint: "",
    validated_at: "",
    updated_at: "",
  },
  {
    id: "claude",
    name: "Saved Claude",
    provider: "anthropic" as const,
    base_url: "",
    key_fingerprint: "",
    validated_at: "",
    updated_at: "",
  },
];
const config = {
  workspace_id: "workspace",
  editable: true,
  provider_overrides_supported: true,
  revision: 4,
  configuration: {
    mode: "deployment" as const,
    connection_id: "",
    model: "",
    dimensions: 1536,
    allow_workspace_text: false,
  },
  effective_provider: "local",
  effective_model: "all-MiniLM-L6-v2",
  dimensions: 384,
  profile_id: "local",
  rebuild_status: "",
  error: "",
};
function show(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(embeddingConfigurationApi.get).mockResolvedValue(config);
  vi.mocked(voiceConfigurationApi.get).mockResolvedValue({
    workspace_id: "workspace",
    editable: true,
    revision: 2,
    configuration: { mode: "inherit", model: "", connection_id: "" },
    effective_model: "",
    effective_provider: "",
  });
});
it("keeps local default and requires explicit text consent for a saved embedding provider", async () => {
  show(<EmbeddingConfiguration connections={connections} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Configure embeddings" }),
  );
  fireEvent.change(screen.getByLabelText("Model source"), {
    target: { value: "provider" },
  });
  fireEvent.change(screen.getByLabelText("Provider"), {
    target: { value: "openai" },
  });
  expect(
    screen.queryByRole("option", { name: /Saved Claude/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save model" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  vi.mocked(embeddingConfigurationApi.test).mockResolvedValue({
    valid: true,
    message: "Test passed",
  });
  fireEvent.click(screen.getByRole("button", { name: "Test model" }));
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith("Test passed", "success"),
  );
  expect(vi.mocked(embeddingConfigurationApi.test).mock.calls[0][0]).toEqual(
    expect.objectContaining({
      model: "text-embedding-3-small",
      allow_workspace_text: true,
    }),
  );
  vi.mocked(embeddingConfigurationApi.save).mockRejectedValue(
    new Error("Unavailable"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save model" }));
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith(expect.any(String), "error"),
  );
  expect(screen.getByLabelText("Embedding model ID")).toHaveValue(
    "text-embedding-3-small",
  );
  expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
});
it("shows an accurate provider restriction for unsupported search stores", async () => {
  vi.mocked(embeddingConfigurationApi.get).mockResolvedValue({
    ...config,
    provider_overrides_supported: false,
  });
  show(<EmbeddingConfiguration connections={connections} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Configure embeddings" }),
  );
  expect(screen.getByRole("option", { name: "Saved provider" })).toBeDisabled();
});
it("reuses saved voice providers without collecting another API key", async () => {
  const navigate = vi.fn();
  show(
    <VoiceConfiguration
      connections={connections}
      navigateToSection={navigate}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Configure voice" }),
  );
  fireEvent.change(screen.getByLabelText("Model source"), {
    target: { value: "provider" },
  });
  fireEvent.change(screen.getByLabelText("Provider"), {
    target: { value: "openai" },
  });
  expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument();
  vi.mocked(voiceConfigurationApi.save).mockResolvedValue({
    workspace_id: "workspace",
    editable: true,
    revision: 3,
    configuration: {
      mode: "provider",
      model: "gpt-4o-mini-transcribe",
      connection_id: "openai",
    },
    effective_model: "gpt-4o-mini-transcribe",
    effective_provider: "openai",
  });
  fireEvent.click(screen.getByRole("button", { name: "Save voice model" }));
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith("Voice model saved.", "success"),
  );
  expect(vi.mocked(voiceConfigurationApi.save).mock.calls[0][0]).toEqual(
    expect.objectContaining({ connection_id: "openai", revision: 2 }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Voice input preferences" }),
  );
  expect(navigate).toHaveBeenCalledWith("voice-input");
});
