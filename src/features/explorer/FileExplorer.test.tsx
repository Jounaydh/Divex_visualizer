// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyzedFile, FolderNode } from "../../types";
import { FileExplorer, type ExplorerEntry } from "./FileExplorer";

const mainFile: AnalyzedFile = {
  id: "file:main.py",
  path: "main.py",
  name: "main.py",
  extension: ".py",
  kind: "python",
  content: "print('hello')\n",
  imports: [],
  importLinks: [],
  resolvedImports: [],
  symbols: [],
  lineCount: 1,
};

const sourceFolder: FolderNode = {
  id: "folder:src",
  name: "src",
  path: "src",
  folders: [],
  files: [],
};

const root: FolderNode = {
  id: "folder:",
  name: "example",
  path: "",
  folders: [sourceFolder],
  files: [mainFile],
};

function renderExplorer(overrides: {
  onCreateEntry?: (parentPath: string, kind: ExplorerEntry["kind"], name: string) => void;
  onDuplicateEntry?: (entry: ExplorerEntry) => void;
  onMoveEntry?: (source: ExplorerEntry, target: ExplorerEntry) => void;
  executionEnabled?: boolean;
} = {}) {
  return render(
    <FileExplorer
      root={root}
      selectedId={null}
      canUseNativePaths
      executionEnabled={overrides.executionEnabled ?? true}
      canShare={false}
      hasClipboard={false}
      newFileExtension="txt"
      onSelectFile={vi.fn()}
      onSelectFolder={vi.fn()}
      onCreateEntry={overrides.onCreateEntry ?? vi.fn()}
      onDuplicateEntry={overrides.onDuplicateEntry ?? vi.fn()}
      onMoveEntry={overrides.onMoveEntry ?? vi.fn()}
      onRenameEntry={vi.fn()}
      onDeleteEntry={vi.fn()}
      onCopyEntryPath={vi.fn()}
      onRevealEntry={vi.fn()}
      onRefresh={vi.fn()}
      onOpenExternal={vi.fn()}
      onOpenTerminal={vi.fn()}
      onShareEntry={vi.fn()}
      onCutEntry={vi.fn()}
      onCopyEntry={vi.fn()}
      onPasteEntry={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FileExplorer file management", () => {
  it("creates a file at the project root from the toolbar", () => {
    const onCreateEntry = vi.fn();
    vi.spyOn(window, "prompt").mockReturnValue("worker.py");
    renderExplorer({ onCreateEntry });

    fireEvent.click(screen.getByRole("button", { name: "New file" }));

    expect(onCreateEntry).toHaveBeenCalledWith("", "file", "worker.py");
  });

  it("duplicates the selected entry from its context menu", () => {
    const onDuplicateEntry = vi.fn();
    renderExplorer({ onDuplicateEntry });

    fireEvent.contextMenu(screen.getByText("main.py"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Duplicate/ }));

    expect(onDuplicateEntry).toHaveBeenCalledWith({
      kind: "file",
      name: "main.py",
      path: "main.py",
    });
  });

  it("moves a dragged file into a folder", () => {
    const onMoveEntry = vi.fn();
    renderExplorer({ onMoveEntry });
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
    };

    fireEvent.dragStart(screen.getByText("main.py"), { dataTransfer });
    fireEvent.dragOver(screen.getByText("src"), { dataTransfer });
    fireEvent.drop(screen.getByText("src"), { dataTransfer });

    expect(onMoveEntry).toHaveBeenCalledWith(
      { kind: "file", name: "main.py", path: "main.py" },
      { kind: "folder", name: "src", path: "src" },
    );
  });

  it("keeps external execution actions disabled in Restricted Mode", () => {
    renderExplorer({ executionEnabled: false });
    fireEvent.contextMenu(screen.getByText("main.py"));
    expect(
      screen.getByRole("menuitem", { name: "Open in Default App" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("menuitem", { name: "Open in Terminal" }),
    ).toBeDisabled();
  });
});
