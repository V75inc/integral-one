import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";

import { AgentSwitcher } from "../AgentSwitcher";

vi.mock("../../useAgentCatalog", () => ({
  useAgentCatalog: vi.fn(),
}));
import { useAgentCatalog } from "../../useAgentCatalog";

const mockProvider = {
  id: "integral_native",
  label: "integral_native",
  serverPersisted: true,
  capabilities: {
    reasoning: true,
    tools: true,
    attachments: true,
    vision: false,
    voice: false,
  },
  streamTurn: async function* () {},
  listAgents: async () => [],
} as const;

describe("AgentSwitcher", () => {
  it("uses the approved mark for Integral AI while keeping custom avatars", () => {
    const agent = { id: "integral_core", name: "Integral AI", role_label: "Resident harness" };
    (useAgentCatalog as any).mockReturnValue({
      agents: [agent], activeAgent: agent, switchAgent: vi.fn(),
    });
    const provider = { ...mockProvider, id: "integral_native" };
    const { container, rerender } = render(
      <AgentSwitcher provider={provider as any} workspaceId="w1" />,
    );
    expect(container.querySelector('svg path[fill="currentColor"]')).not.toBeNull();
    const trigger = screen.getByRole('button', { name: /active agent/i });
    expect(trigger).toHaveTextContent('Integral AIYour workspace assistant');
    expect(screen.getAllByText('Your workspace assistant')).toHaveLength(1);
    expect(screen.queryByText('Resident harness')).not.toBeInTheDocument();
    expect(trigger).toHaveClass('items-center');
    const custom = { ...agent, avatar_url: "/custom-agent.png" };
    (useAgentCatalog as any).mockReturnValue({
      agents: [custom], activeAgent: custom, switchAgent: vi.fn(),
    });
    rerender(<AgentSwitcher provider={provider as any} workspaceId="w1" />);
    expect(container.querySelector('svg path[fill="currentColor"]')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/custom-agent.png');
  });

  it("renders nothing when catalog is empty", () => {
    (useAgentCatalog as any).mockReturnValue({
      agents: [],
      activeAgent: null,
      isLoading: false,
      error: null,
      switchAgent: vi.fn(),
      preferenceAgentId: null,
    });
    const { container } = render(
      <AgentSwitcher provider={mockProvider as any} workspaceId="w1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders active agent's name and role label, opens popover on click", () => {
    (useAgentCatalog as any).mockReturnValue({
      agents: [
        {
          id: "iris",
          name: "Iris",
          description: "Friendly",
          role_label: "ASSISTANT",
        },
        { id: "aiva", name: "Aiva", description: "Sales" },
      ],
      activeAgent: {
        id: "iris",
        name: "Iris",
        description: "Friendly",
        role_label: "ASSISTANT",
      },
      isLoading: false,
      error: null,
      switchAgent: vi.fn(),
      preferenceAgentId: null,
    });
    render(<AgentSwitcher provider={mockProvider as any} workspaceId="w1" />);
    expect(screen.getByText("Iris")).toBeInTheDocument();
    expect(screen.getByText("ASSISTANT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /active agent/i }));
    expect(screen.getByText("Aiva")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.queryByText(/Your workspace assistant/i)).not.toBeInTheDocument();
  });

  it("calls switchAgent when a different agent is picked", () => {
    const switchAgent = vi.fn();
    (useAgentCatalog as any).mockReturnValue({
      agents: [
        { id: "iris", name: "Iris" },
        { id: "aiva", name: "Aiva" },
      ],
      activeAgent: { id: "iris", name: "Iris" },
      isLoading: false,
      error: null,
      switchAgent,
      preferenceAgentId: null,
    });
    render(<AgentSwitcher provider={mockProvider as any} workspaceId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: /active agent/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /aiva/i }));
    expect(switchAgent).toHaveBeenCalledWith("aiva");
  });

  it("is disabled when isStreaming prop is true", () => {
    (useAgentCatalog as any).mockReturnValue({
      agents: [
        { id: "iris", name: "Iris" },
        { id: "aiva", name: "Aiva" },
      ],
      activeAgent: { id: "iris", name: "Iris" },
      isLoading: false,
      error: null,
      switchAgent: vi.fn(),
      preferenceAgentId: null,
    });
    render(
      <AgentSwitcher
        provider={mockProvider as any}
        workspaceId="w1"
        isStreaming
      />,
    );
    expect(
      screen.getByRole("button", { name: /active agent/i }),
    ).toBeDisabled();
  });

  it("shows Echo as a static dev/smoke harness when catalog is empty", () => {
    (useAgentCatalog as any).mockReturnValue({
      agents: [],
      activeAgent: null,
      isLoading: false,
      error: null,
      switchAgent: vi.fn(),
      preferenceAgentId: null,
    });
    const echoProvider = {
      ...mockProvider,
      id: "mock-echo",
      label: "Echo (dev/smoke)",
    };
    render(
      <AgentSwitcher provider={echoProvider as any} workspaceId="w1" />,
    );
    expect(screen.getByText("Echo")).toBeInTheDocument();
    expect(screen.getByText(/Test assistant/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /active agent/i }),
    ).toBeDisabled();
  });
});
