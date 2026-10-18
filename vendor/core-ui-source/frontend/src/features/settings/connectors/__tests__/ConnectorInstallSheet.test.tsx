/**
 * ConnectorInstallSheet — label, connection mode, and Advanced Options.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const installMock = vi.fn();

vi.mock("../../../../api/connectors", () => ({
  MCP_OAUTH_MESSAGE_TYPE: "integral:mcp-oauth",
  connectorsApi: {
    installFromCatalog: (...args: unknown[]) => installMock(...args),
  },
}));

vi.mock("../../../../context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import { ConnectorInstallSheet } from "../ConnectorInstallSheet";
import type { CatalogEntry } from "../../../../api/connectors";

const entry = {
  slug: "drive_native",
  display_name: "Google Drive",
  description: "Drive tools.",
  category: "native",
  kind: "sync",
  icon: "google_drive",
  vetted: true,
  auth: {
    type: "oauth2",
    fields: [
      { name: "client_id", label: "Client ID", secret: false, required: false },
      {
        name: "client_secret",
        label: "Client secret",
        secret: true,
        required: false,
      },
    ],
  },
  platform_configured: ["client_id", "client_secret"],
} as unknown as CatalogEntry;

function renderSheet() {
  return render(
    <ConnectorInstallSheet
      entry={entry}
      onClose={() => undefined}
      onInstalled={() => undefined}
    />,
  );
}

describe("ConnectorInstallSheet", () => {
  beforeEach(() => {
    installMock.mockReset();
  });

  it("hides platform-configured fields behind Advanced Options", () => {
    renderSheet();
    expect(screen.queryByText("Client ID")).toBeNull();
    expect(
      screen.getByRole("button", { name: /advanced options/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /advanced options/i }));
    expect(screen.getByText("Client ID")).toBeInTheDocument();
  });

  it("submits label and shared mode", async () => {
    installMock.mockResolvedValue({ action: "created", slug: "drive_native" });
    renderSheet();
    fireEvent.change(screen.getByPlaceholderText("Google Drive"), {
      target: { value: "Team Drive" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /shared/i }));
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() => expect(installMock).toHaveBeenCalledTimes(1));
    expect(installMock).toHaveBeenCalledWith("drive_native", {
      secrets: {},
      label: "Team Drive",
      connection_mode: "shared",
    });
  });

  it("defaults to per-user mode without a label", async () => {
    installMock.mockResolvedValue({ action: "created", slug: "drive_native" });
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() => expect(installMock).toHaveBeenCalledTimes(1));
    expect(installMock).toHaveBeenCalledWith("drive_native", {
      secrets: {},
      label: undefined,
      connection_mode: "per_user",
    });
  });

  it("hides the mode picker and forces per-user when sharing is not allowed", async () => {
    installMock.mockResolvedValue({ action: "created", slug: "drive_native" });
    render(
      <ConnectorInstallSheet
        entry={entry}
        sharingAllowed={false}
        onClose={() => undefined}
        onInstalled={() => undefined}
      />,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() => expect(installMock).toHaveBeenCalledTimes(1));
    expect(installMock).toHaveBeenCalledWith("drive_native", {
      secrets: {},
      label: undefined,
      connection_mode: "per_user",
    });
  });

  it("hides catalog-advanced fields until the toggle", async () => {
    installMock.mockResolvedValue({ action: "created", slug: "quickbooks" });
    render(
      <ConnectorInstallSheet
        entry={
          {
            ...entry,
            slug: "quickbooks",
            display_name: "QuickBooks",
            auth: {
              type: "oauth2",
              fields: [
                ...entry.auth.fields,
                {
                  name: "environment",
                  label: "Environment (sandbox or production)",
                  secret: false,
                  required: false,
                  advanced: true,
                },
              ],
            },
            platform_configured: [],
          } as unknown as CatalogEntry
        }
        onClose={() => undefined}
        onInstalled={() => undefined}
      />,
    );
    expect(screen.queryByText(/environment \(sandbox/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /advanced options/i }));
    expect(screen.getByText(/environment \(sandbox/i)).toBeInTheDocument();
  });
});
