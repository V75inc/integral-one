import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { EmbeddingConfiguration } from "../EmbeddingConfiguration";

const { get, save, cancel, showToast } = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  cancel: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock("../../../../api/aiConfiguration", () => ({
  EMBEDDING_CONFIGURATION_QUERY_KEY: ["embedding-configuration"],
  embeddingConfigurationApi: { get, save, cancel, test: vi.fn() },
}));
vi.mock("../../../../context/ScopeContext", () => ({
  useScopeOptional: () => ({ scope: { workspaceId: "workspace" } }),
}));
vi.mock("../../../../context/AuthContext", () => ({
  useAuthOptional: () => ({ user: { id: "owner" } }),
}));
vi.mock("../../../../context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));
const choice = {
  mode: "provider",
  connection_id: "provider",
  model: "next-model",
  dimensions: 1536,
  allow_workspace_text: true,
};
const data = {
  workspace_id: "workspace",
  editable: true,
  provider_overrides_supported: true,
  revision: 3,
  configuration: choice,
  effective_provider: "openai",
  effective_model: "current-model",
  dimensions: 1536,
  profile_id: "serving",
  pending_profile_id: "pending",
  pending_model: "next-model",
  rebuild_status: "pending",
  rebuild_phase: "verifying",
  verified: 1205,
  serving_available: true,
  error: "",
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EmbeddingConfiguration
        connections={[
          {
            id: "provider",
            provider: "openai",
            name: "My provider",
            base_url: "",
            key_fingerprint: "",
            validated_at: "",
            updated_at: "",
          },
        ]}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(data);
  save.mockResolvedValue(data);
  cancel.mockResolvedValue(data);
});
it("separates the serving model from pending progress and cancels through a toast", async () => {
  mount();
  await screen.findByText(/current-model/);
  expect(screen.getByText(/Preparing next-model/)).toBeInTheDocument();
  expect(screen.getByText(/1,205 records checked/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel change" }));
  await waitFor(() =>
    expect(cancel).toHaveBeenCalledWith(3, expect.any(Object)),
  );
  await waitFor(() =>
    expect(showToast).toHaveBeenCalledWith(
      "Model change cancelled.",
      "success",
    ),
  );
});
it("does not opt the owner into funding the previous provider", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Configure embeddings" }),
  );
  expect(
    screen.getByLabelText(/Keep using the current provider/),
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Save model" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      { ...choice, revision: 3, continue_previous_provider: false },
      expect.any(Object),
    ),
  );
});
it("retains explicit continuation consent only when selected for the save", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Configure embeddings" }),
  );
  fireEvent.click(screen.getByLabelText(/Keep using the current provider/));
  fireEvent.click(screen.getByRole("button", { name: "Save model" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      { ...choice, revision: 3, continue_previous_provider: true },
      expect.any(Object),
    ),
  );
});
