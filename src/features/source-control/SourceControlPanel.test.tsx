// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceControlPanel } from "./SourceControlPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "divex");
});

describe("SourceControlPanel", () => {
  it("does not invoke Git while a workspace is restricted", () => {
    const getGitStatus = vi.fn();
    const onTrustWorkspace = vi.fn();
    Object.defineProperty(window, "divex", {
      configurable: true,
      value: { getGitStatus, platform: "darwin" } as unknown as NonNullable<
        Window["divex"]
      >,
    });

    render(
      <SourceControlPanel
        rootPath="/project"
        enabled
        trusted={false}
        refreshKey={0}
        onOpenFile={vi.fn()}
        onTrustWorkspace={onTrustWorkspace}
      />,
    );

    expect(screen.getByText("Source control is restricted")).toBeInTheDocument();
    expect(getGitStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Trust this folder" }));
    expect(onTrustWorkspace).toHaveBeenCalledOnce();
  });

  it("shows repository changes and stages a selected file", async () => {
    const getGitStatus = vi.fn().mockResolvedValue({
      success: true,
      output: "Refreshed.",
      status: {
        available: true,
        isRepository: true,
        repositoryRoot: "/project",
        branch: "feature/navigation",
        detached: false,
        ahead: 1,
        behind: 0,
        entries: [
          {
            path: "lib/main.dart",
            indexStatus: " ",
            worktreeStatus: "M",
            label: "Modified",
            staged: false,
            unstaged: true,
            untracked: false,
            conflicted: false,
          },
        ],
      },
    });
    const stageGitFile = vi.fn().mockResolvedValue({
      success: true,
      output: "Staged lib/main.dart.",
    });
    Object.defineProperty(window, "divex", {
      configurable: true,
      value: {
        getGitStatus,
        stageGitFile,
        platform: "darwin",
      } as unknown as NonNullable<Window["divex"]>,
    });

    render(
      <SourceControlPanel
        rootPath="/project"
        enabled
        trusted
        refreshKey={0}
        onOpenFile={vi.fn()}
        onTrustWorkspace={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("feature/navigation"),
    ).toBeInTheDocument();
    expect(screen.getByText("main.dart")).toBeInTheDocument();
    expect(screen.getByText("↑1")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Stage lib/main.dart" }),
    );
    await waitFor(() =>
      expect(stageGitFile).toHaveBeenCalledWith({
        rootPath: "/project",
        filePath: "lib/main.dart",
      }),
    );
  });
});
