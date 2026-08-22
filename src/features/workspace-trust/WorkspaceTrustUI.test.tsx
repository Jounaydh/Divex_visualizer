// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceTrustStatus } from "../../types";
import { WorkspaceTrustBanner, WorkspaceTrustDialog } from "./WorkspaceTrustUI";
import type { WorkspaceTrustManager } from "./useWorkspaceTrust";

afterEach(cleanup);

function manager(
  overrides: Partial<WorkspaceTrustManager> = {},
): WorkspaceTrustManager {
  return {
    changing: false,
    enabled: true,
    loading: false,
    needsDecision: true,
    result: null,
    status: {
      rootPath: "C:\\project",
      state: "unknown",
      trusted: false,
      permissions: [
        {
          id: "source",
          label: "Read and edit project files",
          enabled: true,
          detail: "Source access remains available.",
        },
        {
          id: "scripts",
          label: "Run project scripts and tasks",
          enabled: false,
          detail: "Scripts stay blocked.",
        },
        {
          id: "extensions",
          label: "Run third-party extensions",
          enabled: false,
          detail: "Extensions stay disabled until an isolated host exists.",
        },
      ],
    },
    trusted: false,
    setTrusted: vi.fn(
      async (trusted: boolean): Promise<WorkspaceTrustStatus> => ({
        rootPath: "C:\\project",
        state: trusted ? "trusted" : "restricted",
        trusted,
        decidedAt: "2026-08-19T00:00:00.000Z",
      }),
    ),
    ...overrides,
  };
}

describe("workspace trust UI", () => {
  it("asks for a trust choice the first time a workspace opens", async () => {
    const trust = manager();
    const onClose = vi.fn();
    const onChanged = vi.fn();
    render(
      <WorkspaceTrustDialog
        open
        firstDecision
        projectName="Example"
        rootPath="C:\\project"
        manager={trust}
        onClose={onClose}
        onChanged={onChanged}
      />,
    );
    expect(
      screen.getByText("Do you trust the authors of these files?"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Close workspace trust")).toBeNull();
    expect(screen.getByText("Run project scripts and tasks")).toBeTruthy();
    expect(screen.getByText("Run third-party extensions")).toBeTruthy();
    expect(screen.getAllByText("Blocked")).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Open in Restricted Mode" }),
    );
    await waitFor(() => expect(trust.setTrusted).toHaveBeenCalledWith(false));
    expect(onChanged).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("allows an unknown workspace to be trusted explicitly", async () => {
    const trust = manager();
    const onChanged = vi.fn();
    render(
      <WorkspaceTrustDialog
        open
        firstDecision
        projectName="Example"
        rootPath="C:\\project"
        manager={trust}
        onClose={vi.fn()}
        onChanged={onChanged}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trust Workspace" }));
    await waitFor(() => expect(trust.setTrusted).toHaveBeenCalledWith(true));
    expect(onChanged).toHaveBeenCalledWith(true);
  });

  it("shows restricted mode until the workspace is trusted", () => {
    const onManage = vi.fn();
    const { rerender } = render(
      <WorkspaceTrustBanner
        manager={manager({ needsDecision: false })}
        projectName="Example"
        onManage={onManage}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage trust" }));
    expect(onManage).toHaveBeenCalled();
    rerender(
      <WorkspaceTrustBanner
        manager={manager({
          needsDecision: false,
          trusted: true,
          status: {
            rootPath: "C:\\project",
            state: "trusted",
            trusted: true,
          },
        })}
        projectName="Example"
        onManage={onManage}
      />,
    );
    expect(screen.queryByText("Restricted Mode")).toBeNull();
  });
});
