import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SkillsSection } from "../SkillsSection";

const { browse, effective } = vi.hoisted(() => ({
  browse: vi.fn(),
  effective: vi.fn(),
}));
vi.mock("../../../../api/skills", () => ({ skillsApi: { browse, effective } }));
vi.mock("../../../../context/ScopeContext", () => ({
  useScope: () => ({ scope: { workspaceId: "workspace" }, isPersonal: true }),
}));
vi.mock("../../../../context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../../../components/skills/SkillEditorModal", () => ({
  SkillEditorModal: () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  browse.mockResolvedValue({
    skills: [],
    apps: [],
    total: 0,
    page: 1,
    page_size: 10,
    total_pages: 1,
  });
  effective.mockResolvedValue({
    apps: [{ id: "app-1", name: "Operations" }],
    skills: Array.from({ length: 13 }, (_, i) => ({
      id: `skill-${i}`,
      name: `Runtime skill ${i}`,
      source: "workspace",
      state: i === 0 ? "paused" : "available",
      reason: i === 0 ? "Disabled by workspace owner" : "",
      tools_required: [],
    })),
    tools: [
      {
        name: "integral_get_entry",
        description: "Read an Entry",
        source: "core",
      },
    ],
  });
});
it("loads agent context only when the inspector is opened and pages it independently from skills", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SkillsSection />
    </QueryClientProvider>,
  );
  await screen.findByText("No skills yet");
  expect(effective).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Inspect agent access" }));
  expect(
    screen.getByRole("dialog", { name: "Agent access" }),
  ).toBeInTheDocument();
  await screen.findByText("Runtime skill 0");
  expect(
    within(screen.getByRole("list", { name: "Agent context" })).getAllByRole(
      "listitem",
    ),
  ).toHaveLength(10);
  expect(screen.getByText("Paused")).toBeInTheDocument();
  expect(screen.queryByText("integral_get_entry")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Next agent context pages" }),
  );
  expect(screen.queryByText("Runtime skill 0")).not.toBeInTheDocument();
  expect(screen.getByText("Runtime skill 12")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tools (1)" }));
  expect(screen.getByText("integral_get_entry")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("App focus for agent context"), {
    target: { value: "app-1" },
  });
  await waitFor(() => expect(effective).toHaveBeenLastCalledWith("app-1"));
});
