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
        refreshKey={0}
        autoRefreshOnFocus
        confirmDestructiveActions
        onOpenFile={vi.fn()}
        onRepositoryChanged={vi.fn()}
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

  it("creates a branch from the branch workflow menu", async () => {
    const getGitStatus = vi.fn().mockResolvedValue({
      success: true,
      output: "Refreshed.",
      status: {
        available: true,
        isRepository: true,
        repositoryRoot: "/project",
        branch: "main",
        detached: false,
        ahead: 0,
        behind: 0,
        branches: ["main"],
        remotes: ["origin"],
        entries: [],
      },
    });
    const changeGitBranch = vi.fn().mockResolvedValue({
      success: true,
      output: "Created and switched.",
    });
    Object.defineProperty(window, "divex", {
      configurable: true,
      value: {
        getGitStatus,
        changeGitBranch,
        platform: "win32",
      } as unknown as NonNullable<Window["divex"]>,
    });

    render(
      <SourceControlPanel
        rootPath="/project"
        enabled
        refreshKey={0}
        autoRefreshOnFocus={false}
        confirmDestructiveActions
        onOpenFile={vi.fn()}
        onRepositoryChanged={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /main/ }));
    fireEvent.change(screen.getByLabelText("New branch name"), {
      target: { value: "feature/settings" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(changeGitBranch).toHaveBeenCalledWith({
        rootPath: "/project",
        branch: "feature/settings",
        create: true,
      }),
    );
  });
});
