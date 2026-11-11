import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChatFollowUps } from "../ChatFollowUps";

const { steerFollowUp } = vi.hoisted(() => ({ steerFollowUp: vi.fn() }));

vi.mock("../../AIChatSurface", () => ({
  useChatActivity: () => ({
    followUps: [
      { id: "tagged", text: "Review this record", refs: [{ id: "record" }], state: "queued" },
      { id: "plain", text: "Change direction", refs: [], state: "queued" },
    ],
    steeringRunning: true,
    steeringWorkItemId: "work",
    steerFollowUp,
  }),
}));

it("keeps tagged follow-ups queued and allows plain text to steer", () => {
  render(<ChatFollowUps locked={false} />);
  expect(screen.getByText("Queued with tagged records for the next turn")).toBeInTheDocument();
  const steerButton = screen.getByRole("button", { name: "Steer now" });
  fireEvent.click(steerButton);
  expect(steerFollowUp).toHaveBeenCalledExactlyOnceWith("plain");
});
