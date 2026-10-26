import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelRoutingSection } from "./ModelRoutingSection";
const showToast = vi.hoisted(() => vi.fn());
vi.mock("../../../context/ToastContext", () => ({
  useToast: () => ({ showToast }),
}));
import {
  aiConfigurationApi,
  type AIConfiguration,
} from "../../../api/aiConfiguration";

vi.mock("../../../api/aiConfiguration", async (original) => ({
  ...(await original<typeof import("../../../api/aiConfiguration")>()),
  aiConfigurationApi: { saveRouting: vi.fn() },
}));
const configuration: AIConfiguration = {
  connections: [],
  profiles: [
    {
      id: "light",
      name: "Quick",
      model: "gpt-5.2",
      connection_id: "provider",
      updated_at: "",
      generation_settings: {
        reasoning_effort: "low",
        max_tokens: 1024,
        model_request_limit: 4,
      },
    },
    {
      id: "heavy",
      name: "Deep",
      model: "gpt-5.2",
      connection_id: "provider",
      updated_at: "",
      generation_settings: { reasoning_effort: "high", max_tokens: 8192 },
    },
  ],
  default_profile_id: "heavy",
  key_policy: "hybrid",
  routing: {
    mode: "single",
    light_profile_id: "",
    heavy_profile_id: "heavy",
    revision: "current-revision",
  },
  effective: {
    workspace_id: "workspace",
    source: "workspace_owner",
    editable: true,
    provider: "openai",
    model: "gpt-5.2",
    generation_settings: {},
  },
  harness_limits: {
    request_limit: 20,
    token_limit: 100000,
    run_seconds: 300,
    request_timeout: 120,
    idle_timeout: 30,
  },
};
function show(data = configuration, onEdit = vi.fn(), onAddModel = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    onEdit,
    onAddModel,
    ...render(
      <QueryClientProvider client={client}>
        <ModelRoutingSection
          data={data}
          onEdit={onEdit}
          onAddModel={onAddModel}
        />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => vi.clearAllMocks());
describe("Optional light/heavy model routing", () => {
  it("keeps single-model operation unchanged until automatic mode is saved", async () => {
    vi.mocked(aiConfigurationApi.saveRouting).mockResolvedValue({ ok: true });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Configure routing" }));
    expect(screen.queryByLabelText("Light model")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Routing mode"), {
      target: { value: "light_heavy" },
    });
    expect(screen.getByRole("button", { name: "Save routing" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Light model"), {
      target: { value: "light" },
    });
    expect(screen.getByText(/low reasoning/)).toBeVisible();
    expect(screen.getByText(/high reasoning/)).toBeVisible();
    fireEvent.click(screen.getByText("Run limits and routing details"));
    expect(
      screen.getByText(/Both passes share up to 4 requests/),
    ).toBeVisible();
    expect(aiConfigurationApi.saveRouting).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save routing" }));
    await waitFor(() =>
      expect(aiConfigurationApi.saveRouting).toHaveBeenCalledWith(
        {
          mode: "light_heavy",
          light_profile_id: "light",
          heavy_profile_id: "heavy",
          revision: "current-revision",
        },
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "Model routing saved. Changes apply to the next turn.",
        "success",
      ),
    );
    expect(screen.queryByText(/Model routing saved/)).not.toBeInTheDocument();
  });
  it("keeps failed saves and selected assignments visible", async () => {
    vi.mocked(aiConfigurationApi.saveRouting).mockRejectedValue(
      new Error("changed"),
    );
    show();
    fireEvent.click(screen.getByRole("button", { name: "Configure routing" }));
    fireEvent.click(screen.getByRole("button", { name: "Save routing" }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "Could not save model routing.",
        "error",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Main model")).toHaveValue("heavy");
  });
  it("shows effective owner-managed routing without exposing editing", () => {
    show({
      ...configuration,
      effective: {
        ...configuration.effective,
        editable: false,
        routing: {
          mode: "light_heavy",
          light_model: "Owner fast",
          heavy_model: "Owner deep",
        },
      },
    });
    expect(screen.getByText(/Owner fast/)).toBeVisible();
    expect(screen.getByText(/Owner deep/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Configure routing" }),
    ).toBeDisabled();
    expect(screen.getByText("Managed by the workspace owner.")).toBeVisible();
  });
  it("opens the existing profile editor without adding a key form", () => {
    const { onEdit } = show();
    fireEvent.click(screen.getByRole("button", { name: "Configure routing" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Edit main model settings" }),
    );
    expect(onEdit).toHaveBeenCalledWith(configuration.profiles[1]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

it("shows ENV-managed roles and tuning as read-only without copying providers", () => {
  show({
    ...configuration,
    key_policy: "platform_only",
    effective: {
      ...configuration.effective,
      source: "deployment",
      editable: false,
      routing: {
        mode: "light_heavy",
        light_model: "openai/fast",
        heavy_model: "openai/deep",
        light_generation_settings: {
          reasoning_effort: "low",
          max_tokens: 2048,
        },
        heavy_generation_settings: {
          reasoning_effort: "high",
          max_tokens: 8192,
          model_request_limit: 8,
          request_timeout: 120,
        },
      },
    },
  });
  expect(
    screen.getByText(/Your administrator requires server-managed models/),
  ).toBeVisible();
  const light = within(
    screen.getByRole("region", { name: "Light model configuration" }),
  );
  expect(light.getByText("low")).toBeVisible();
  expect(light.getByText("2,048 tokens")).toBeVisible();
  const heavy = within(
    screen.getByRole("region", { name: "Heavy model configuration" }),
  );
  expect(heavy.getByText("high")).toBeVisible();
  expect(heavy.getByText("120s")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Configure routing" }),
  ).toBeDisabled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("lets the owner add a personal model when ENV supplies the fallback", () => {
  const { onAddModel } = show({
    ...configuration,
    effective: { ...configuration.effective, source: "deployment" },
  });
  expect(screen.getByText("Server default")).toBeVisible();
  expect(screen.getByText(/Add your own model to override them/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Add your own model" }));
  expect(onAddModel).toHaveBeenCalledOnce();
  expect(aiConfigurationApi.saveRouting).not.toHaveBeenCalled();
});

it.each([false, true])(
  "retains routing assignments after profile editing (concurrent change: %s)",
  async (concurrent) => {
    vi.mocked(aiConfigurationApi.saveRouting).mockResolvedValue({ ok: true });
    const view = show();
    fireEvent.click(screen.getByRole("button", { name: "Configure routing" }));
    fireEvent.change(screen.getByLabelText("Routing mode"), {
      target: { value: "light_heavy" },
    });
    fireEvent.change(screen.getByLabelText("Light model"), {
      target: { value: "light" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Edit light model settings" }),
    );
    const redraw = (open: boolean) =>
      view.rerender(
        <QueryClientProvider client={view.client}>
          <ModelRoutingSection
            data={{
              ...configuration,
              routing: {
                ...configuration.routing!,
                revision: "profile-edited",
                ...(concurrent ? { heavy_profile_id: "light" } : {}),
              },
            }}
            onEdit={view.onEdit}
            profileEditorOpen={open}
          />
        </QueryClientProvider>,
      );
    redraw(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    redraw(false);
    expect(screen.getByLabelText("Routing mode")).toHaveValue("light_heavy");
    expect(screen.getByLabelText("Light model")).toHaveValue("light");
    expect(screen.getByLabelText("Heavy model (default)")).toHaveValue("heavy");
    fireEvent.click(screen.getByRole("button", { name: "Save routing" }));
    await waitFor(() =>
      expect(aiConfigurationApi.saveRouting).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "light_heavy",
          light_profile_id: "light",
          heavy_profile_id: "heavy",
          revision: concurrent ? "current-revision" : "profile-edited",
        }),
        expect.anything(),
      ),
    );
  },
);
