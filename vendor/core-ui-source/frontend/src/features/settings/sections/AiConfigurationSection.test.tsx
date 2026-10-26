import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { aiConfigurationApi } from "../../../api/aiConfiguration";
import { AiConfigurationSection } from "./AiConfigurationSection";

it("shows model-specific Max effort without inventing intermediate levels", async () => {
  vi.mocked(aiConfigurationApi.capabilities).mockResolvedValue({
    reasoning_efforts: ["none", "low", "high", "max"],
    max_tokens: true,
    temperature: false,
    top_p: false,
    verbosity: false,
    thinking_budget: false,
    context_window: false,
    verified: true,
  });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  const effort = await screen.findByLabelText("Reasoning effort");
  expect(
    within(effort)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Provider default", "Off", "Low", "High", "Max"]);
});

it("offers a native thinking toggle and retains an explicit off value", async () => {
  vi.mocked(aiConfigurationApi.capabilities).mockResolvedValue({
    reasoning_efforts: [],
    thinking_enabled: true,
    max_tokens: true,
    temperature: true,
    top_p: true,
    verbosity: false,
    thinking_budget: false,
    context_window: true,
    verified: false,
  });
  vi.mocked(aiConfigurationApi.saveProfile).mockResolvedValue({});
  show();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  fireEvent.change(await screen.findByLabelText("Thinking"), {
    target: { value: "false" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() =>
    expect(aiConfigurationApi.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_settings: expect.objectContaining({
          thinking_enabled: false,
        }),
      }),
    ),
  );
});

it("shows thinking budgets directly when effort levels are unavailable", async () => {
  vi.mocked(aiConfigurationApi.capabilities).mockResolvedValue({
    reasoning_efforts: [],
    max_tokens: true,
    temperature: false,
    top_p: false,
    verbosity: false,
    thinking_budget: true,
    context_window: false,
    verified: true,
  });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  expect(await screen.findByLabelText("Thinking budget tokens")).toBeVisible();
  expect(
    screen.queryByText(/does not expose adjustable reasoning/),
  ).not.toBeInTheDocument();
});

const fixture = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  refetch: vi.fn(),
  showToast: vi.fn(),
  data: {
    connections: [
      {
        id: "connection",
        name: "Work account",
        provider: "openai",
        base_url: "",
        key_fingerprint: "masked",
        validated_at: "2026-10-22",
        updated_at: "",
      },
    ],
    profiles: [
      {
        id: "profile",
        connection_id: "connection",
        name: "Everyday",
        model: "gpt-5",
        generation_settings: {},
        updated_at: "",
      },
    ],
    default_profile_id: "profile",
    key_policy: "hybrid",
    effective: {
      workspace_id: "workspace",
      source: "workspace_owner",
      editable: true,
      provider: "openai",
      model: "gpt-5",
      generation_settings: {},
    },
    harness_limits: {
      request_limit: 20,
      token_limit: 1200000,
      run_seconds: 900,
      request_timeout: 180,
      idle_timeout: 30,
    },
  },
}));
vi.mock("../hooks/useAIConfiguration", () => ({
  useAIConfiguration: () => ({
    data: fixture.data,
    isPending: fixture.isPending,
    isError: fixture.isError,
    refetch: fixture.refetch,
  }),
}));
vi.mock("../../../api/aiConfiguration", async (original) => ({
  ...(await original<typeof import("../../../api/aiConfiguration")>()),
  aiConfigurationApi: {
    testConnection: vi.fn(),
    saveConnection: vi.fn(),
    saveProfile: vi.fn(),
    capabilities: vi.fn(),
  },
}));
vi.mock("../../../api/modelCredentials", async (original) => ({
  ...(await original<typeof import("../../../api/modelCredentials")>()),
  modelCredentialsApi: { get: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../../../context/ToastContext", () => ({
  useToast: () => ({ showToast: fixture.showToast }),
}));
function show({ advanced = true, language = true } = {}) {
  const result = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AiConfigurationSection />
    </QueryClientProvider>,
  );
  if (advanced && screen.queryByRole("button", { name: "Show advanced configuration" })) fireEvent.click(screen.getByRole("button", { name: "Show advanced configuration" }));
  if (advanced && language && screen.queryByRole("button", { name: "Language & multimodal" })) fireEvent.click(screen.getByRole("button", { name: "Language & multimodal" }));
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.isPending = false;
  fixture.isError = false;
  fixture.data.effective.editable = true;
  fixture.data.effective.source = "workspace_owner";
  vi.mocked(aiConfigurationApi.capabilities).mockResolvedValue({
    reasoning_efforts: ["low", "medium", "high"],
    max_tokens: true,
    temperature: false,
    top_p: false,
    verbosity: false,
    thinking_budget: false,
    context_window: false,
    verified: true,
  });
});

describe("AI connection and model configuration", () => {
  it("tests the saved connection without requesting its key", async () => {
    vi.mocked(aiConfigurationApi.testConnection).mockResolvedValue({
      valid: true,
      message: "verified",
    });
    show();
    fireEvent.click(screen.getByRole("tab", { name: /Providers/ }));
    fireEvent.click(screen.getByRole("button", { name: "Test provider" }));
    await waitFor(() =>
      expect(fixture.showToast).toHaveBeenCalledWith(
        "Provider connection verified.",
        "success",
      ),
    );
    expect(
      screen.queryByText("Provider connection verified."),
    ).not.toBeInTheDocument();
    expect(aiConfigurationApi.testConnection).toHaveBeenCalledWith(
      "connection",
    );
    expect(screen.queryByText("Update models & keys")).not.toBeInTheDocument();
  });
  it("saves supported reasoning and output options without credentials", async () => {
    vi.mocked(aiConfigurationApi.saveProfile).mockResolvedValue({});
    show();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    const effort = await screen.findByLabelText("Reasoning effort");
    fireEvent.change(effort, { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Maximum output tokens"), {
      target: { value: "4096" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(aiConfigurationApi.saveProfile).toHaveBeenCalled(),
    );
    expect(aiConfigurationApi.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "profile",
        model: "gpt-5",
        generation_settings: { reasoning_effort: "high", max_tokens: 4096 },
      }),
    );
    expect(
      JSON.stringify(vi.mocked(aiConfigurationApi.saveProfile).mock.calls),
    ).not.toContain("api_key");
    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fixture.showToast).toHaveBeenCalledWith(
        "Default profile updated. Changes apply to the next turn.",
        "success",
      ),
    );
    expect(
      screen.queryByText(
        "Default profile updated. Changes apply to the next turn.",
      ),
    ).not.toBeInTheDocument();
  });
  it("explains workspace-owner configuration and keeps connection editing separate", async () => {
    fixture.data.effective.editable = false;
    show();
    expect(screen.getByText("Managed by the workspace owner.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /Providers/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));
    expect(screen.getByLabelText("Provider")).toBeDisabled();
    expect(
      screen.getByLabelText(
        "Replacement API key (leave blank to keep saved key)",
      ),
    ).toHaveValue("");
  });
});

it("toasts failed saves while retaining the model drawer and draft", async () => {
  vi.mocked(aiConfigurationApi.saveProfile).mockRejectedValue(
    new Error("Unavailable"),
  );
  show();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  await screen.findByLabelText("Reasoning effort");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() =>
    expect(fixture.showToast).toHaveBeenCalledWith(
      "Could not save this configuration.",
      "error",
    ),
  );
  expect(
    within(screen.getByRole("dialog")).queryByRole("alert"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Profile name")).toHaveValue("Everyday");
});
it("allows provider defaults when capability metadata is unavailable", async () => {
  vi.mocked(aiConfigurationApi.capabilities).mockRejectedValue(
    new Error("Unavailable"),
  );
  show();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  expect(
    await screen.findByText(/Model capabilities are unavailable/),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  expect(screen.queryByLabelText("Reasoning effort")).not.toBeInTheDocument();
});
it("shows an actionable error with retry", () => {
  fixture.isError = true;
  show();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(fixture.refetch).toHaveBeenCalledOnce();
});
it("shows loading without editable actions", () => {
  fixture.isPending = true;
  show();
  expect(screen.getByText(/Loading/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Add model" }),
  ).not.toBeInTheDocument();
});

it("offers connecting a provider when the account has no configuration", () => {
  const connections = fixture.data.connections;
  const profiles = fixture.data.profiles;
  fixture.data.connections = [];
  fixture.data.profiles = [];
  try {
    show();
    expect(
      screen.getByRole("button", { name: "Connect provider" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit profile" }),
    ).not.toBeInTheDocument();
  } finally {
    fixture.data.connections = connections;
    fixture.data.profiles = profiles;
  }
});
it("supports arrow-key tab navigation", () => {
  show();
  const models = screen.getByRole("tab", { name: /Models/ });
  models.focus();
  fireEvent.keyDown(models, { key: "ArrowRight" });
  const connections = screen.getByRole("tab", { name: /Providers/ });
  expect(connections).toHaveFocus();
  expect(connections).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Test provider" })).toBeVisible();
});

it("opens a model override editor while the active configuration comes from ENV", async () => {
  fixture.data.effective.source = "deployment";
  show();
  expect(screen.getByText("Server default")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add your own model" }));
  const dialog = await screen.findByRole("dialog", { name: "Add a model" });
  expect(
    within(dialog).getByRole("textbox", { name: "Profile name" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Model settings" }),
  ).not.toBeInTheDocument();
});

it("reports provider failures through a toast without a page banner", async () => {
  vi.mocked(aiConfigurationApi.testConnection).mockResolvedValue({
    valid: false,
    message: "Provider unavailable",
  });
  show();
  fireEvent.click(screen.getByRole("tab", { name: /Providers/ }));
  fireEvent.click(screen.getByRole("button", { name: "Test provider" }));
  await waitFor(() =>
    expect(fixture.showToast).toHaveBeenCalledWith(
      "Provider unavailable",
      "error",
    ),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("reports provider transport failures through a toast", async () => {
  vi.mocked(aiConfigurationApi.testConnection).mockRejectedValue(
    new Error("offline"),
  );
  show();
  fireEvent.click(screen.getByRole("tab", { name: /Providers/ }));
  fireEvent.click(screen.getByRole("button", { name: "Test provider" }));
  await waitFor(() =>
    expect(fixture.showToast).toHaveBeenCalledWith(
      "Could not test this provider.",
      "error",
    ),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("groups language, embedding and voice models under Models, apart from Providers", () => {
  show();
  expect(screen.getByRole("heading", { name: "Language & multimodal" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Embeddings" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Voice" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: /Providers/ }));
  expect(screen.queryByRole("heading", { name: "Embeddings" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Voice" })).not.toBeInTheDocument();
});

it("starts categories collapsed and opens one at a time", () => {
  show({ language: false });
  const language = screen.getByRole("button", { name: "Language & multimodal" });
  const embeddings = screen.getByRole("button", { name: "Embeddings" });
  const voice = screen.getByRole("button", { name: "Voice" });
  expect(language).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("tab", { name: "Models 1" })).toBeVisible();
  fireEvent.click(language);
  expect(language).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(embeddings);
  expect(embeddings).toHaveAttribute("aria-expanded", "true");
  expect(language).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText(/Powers semantic search/)).toBeVisible();
  fireEvent.click(voice);
  expect(embeddings).toHaveAttribute("aria-expanded", "false");
  expect(voice).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(voice);
  expect(voice).toHaveAttribute("aria-expanded", "false");
});


it("starts with simple provider setup and keeps expert controls out of the default view", () => {
  show({ advanced: false });
  expect(screen.getByText("Your AI is connected")).toBeVisible();
  expect(screen.queryByRole("tablist", { name: "AI configuration" })).not.toBeInTheDocument();
  expect(screen.queryByText("Deployment limits")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show advanced configuration" }));
  expect(screen.getByRole("tablist", { name: "AI configuration" })).toBeVisible();
  expect(screen.getByText("Deployment limits")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Hide advanced configuration" }));
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
});
