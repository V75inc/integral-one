import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { aiConfigurationApi, type AIConfiguration } from "../../../api/aiConfiguration";
import { QuickProviderSetup } from "./QuickProviderSetup";

const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../../api/aiConfiguration", async original => ({
  ...await original<typeof import("../../../api/aiConfiguration")>(),
  aiConfigurationApi: { get: vi.fn(), saveConnection: vi.fn(), saveProfile: vi.fn(), saveRouting: vi.fn() },
}));
function blank(): AIConfiguration {
  return { connections: [], profiles: [], default_profile_id: "", key_policy: "hybrid",
    routing: { mode: "single", heavy_profile_id: "", light_profile_id: "", revision: "rev" },
    effective: { workspace_id: "workspace", source: "unavailable", editable: true, provider: "", model: "", generation_settings: {} },
    harness_limits: { request_limit: 20, token_limit: 1000, run_seconds: 900, request_timeout: 180, idle_timeout: 30 },
  };
}
function show(data = blank()) {
  const busy = vi.fn(); const advanced = vi.fn();
  const view = render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
    <QuickProviderSetup data={data} disabled={false} onBusyChange={busy} />
  </QueryClientProvider>);
  return { ...view, busy, advanced };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(aiConfigurationApi.get).mockResolvedValue(blank());
  vi.mocked(aiConfigurationApi.saveConnection).mockImplementation(async body => ({ ...body, id: body.id || "saved", key_fingerprint: "masked", validated_at: "now", updated_at: "now" }));
  vi.mocked(aiConfigurationApi.saveProfile).mockImplementation(async body => ({ ...body, id: "recommended", updated_at: "now" }));
  vi.mocked(aiConfigurationApi.saveRouting).mockResolvedValue({});
});
it.each([
  ["openai", "gpt-5.4-mini"], ["anthropic", "claude-sonnet-4-6"],
  ["openrouter", "openai/gpt-5.4-mini"], ["ollama", "deepseek-v4.1-flash"],
])("connects %s with its default model using only provider and key", async (provider, model) => {
  const {busy} = show();
  fireEvent.change(screen.getByRole("combobox", {name:"AI provider"}), {target:{value:provider}});
  fireEvent.change(screen.getByLabelText("API key"), {target:{value:"synthetic-test-key"}});
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  expect(screen.queryByLabelText("Reasoning effort")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name:"Connect provider"}));
  await waitFor(() => expect(aiConfigurationApi.saveRouting).toHaveBeenCalledWith({mode:"single", heavy_profile_id:"recommended", light_profile_id:"", revision:"rev"}));
  expect(aiConfigurationApi.saveProfile).toHaveBeenCalledWith(expect.objectContaining({model,generation_settings:{}}));
  expect(aiConfigurationApi.saveConnection).toHaveBeenCalledWith(expect.objectContaining({provider,api_key:"synthetic-test-key"}));
  await waitFor(() => expect(toast).toHaveBeenCalledWith("Your AI provider is ready.","success"));
  expect(screen.getByLabelText("API key")).toHaveValue("");
  await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
});
it("clears a key before switching to a different provider", () => {
  show();
  fireEvent.change(screen.getByLabelText("API key"), {target:{value:"synthetic-for-openai"}});
  fireEvent.change(screen.getByRole("combobox", {name:"AI provider"}), {target:{value:"ollama"}});
  expect(screen.getByLabelText("API key")).toHaveValue("");
  expect(screen.getByRole("button", {name:"Connect provider"})).toBeDisabled();
});
it("does not activate a model when provider validation fails", async () => {
  vi.mocked(aiConfigurationApi.saveConnection).mockRejectedValue(new Error("invalid key"));
  show();
  fireEvent.change(screen.getByLabelText("API key"), {target:{value:"synthetic-invalid"}});
  fireEvent.click(screen.getByRole("button", {name:"Connect provider"}));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String),"error"));
  expect(aiConfigurationApi.saveProfile).not.toHaveBeenCalled();
  expect(aiConfigurationApi.saveRouting).not.toHaveBeenCalled();
  expect(screen.queryByText("Your AI is connected")).not.toBeInTheDocument();
});
it("keeps tuned profiles and dual routing when updating the current provider key", async () => {
  const data = blank();
  data.connections = [{id:"existing",provider:"openai",name:"My account",base_url:"",key_fingerprint:"masked",validated_at:"",updated_at:""}];
  data.profiles = [{id:"tuned",connection_id:"existing",name:"My model",model:"gpt-5",generation_settings:{reasoning_effort:"high"},updated_at:""}];
  data.default_profile_id = "tuned";
  data.routing = {mode:"light_heavy",heavy_profile_id:"tuned",light_profile_id:"light",revision:"advanced-revision"};
  data.effective = {...data.effective,source:"workspace_owner",provider:"openai",model:"gpt-5"};
  vi.mocked(aiConfigurationApi.get).mockResolvedValue(data);
  show(data);
  fireEvent.click(screen.getByRole("button", {name:"Change provider"}));
  fireEvent.change(screen.getByLabelText("API key"), {target:{value:"synthetic-replacement"}});
  fireEvent.click(screen.getByRole("button", {name:"Save provider"}));
  await waitFor(() => expect(toast).toHaveBeenCalledWith("Your AI provider is ready.","success"));
  expect(aiConfigurationApi.saveConnection).toHaveBeenCalledWith(expect.objectContaining({id:"existing",api_key:"synthetic-replacement"}));
  expect(aiConfigurationApi.saveProfile).not.toHaveBeenCalled();
  expect(aiConfigurationApi.saveRouting).not.toHaveBeenCalled();
});
it.each(["platform_only", "member"])("respects %s configuration authority", policy => {
  const data = blank();
  if (policy === "member") data.effective.editable = false; else data.key_policy = policy;
  show(data);
  expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Connect provider"})).not.toBeInTheDocument();
});
it("reuses partial saves on retry without reporting a failed activation as ready", async () => {
  const data = blank();
  show(data);
  vi.mocked(aiConfigurationApi.saveRouting).mockRejectedValueOnce(new Error("stale revision"));
  fireEvent.change(screen.getByLabelText("API key"), {target:{value:"synthetic-test-key"}});
  fireEvent.click(screen.getByRole("button", {name:"Connect provider"}));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String),"error"));
  expect(toast).not.toHaveBeenCalledWith("Your AI provider is ready.","success");
  data.connections = [{id:"saved",provider:"openai",name:"OpenAI",base_url:"",key_fingerprint:"masked",validated_at:"",updated_at:""}];
  data.profiles = [{id:"recommended",connection_id:"saved",name:"GPT-5.4 mini",model:"gpt-5.4-mini",generation_settings:{},updated_at:""}];
  vi.mocked(aiConfigurationApi.get).mockResolvedValue(data);
  // The parent query refreshes partial saves even after a failed activation.
  fireEvent.change(screen.getByLabelText("API key"), {target:{value:"synthetic-test-key"}});
  await waitFor(() => expect(screen.getByRole("button",{name:"Connect provider"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Connect provider"}));
  await waitFor(() => expect(toast).toHaveBeenCalledWith("Your AI provider is ready.","success"));
  expect(aiConfigurationApi.saveConnection).toHaveBeenLastCalledWith(expect.objectContaining({id:"saved"}));
  expect(aiConfigurationApi.saveProfile).toHaveBeenCalledTimes(1);
});

it("offers a personal provider override when the installation already supplies AI", () => {
  const data = blank();
  data.effective = {...data.effective, source:"deployment", model:"openai/gpt-4.1"};
  show(data);
  expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Use my own provider"}));
  expect(screen.getByLabelText("API key")).toBeVisible();
  expect(screen.getByText(/GPT-5\.4 mini will be selected automatically\./)).toBeVisible();
  expect(aiConfigurationApi.saveRouting).not.toHaveBeenCalled();
});
