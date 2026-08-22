// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalyzedFile } from "../../types";
import { DebugPanel } from "./DebugPanel";
import type { DebuggerManager } from "./useDebugger";

const file = {
  id: "file:main.py",
  path: "main.py",
  name: "main.py",
  extension: "py",
  kind: "python",
  content: "print('hello')",
  imports: [],
  importLinks: [],
  resolvedImports: [],
  symbols: [],
  lineCount: 1,
} as AnalyzedFile;

function manager(overrides: Partial<DebuggerManager> = {}): DebuggerManager {
  return {
    enabled: true,
    starting: false,
    installingAdapter: false,
    session: null,
    breakpoints: {},
    verifiedBreakpoints: [],
    frames: [],
    activeFrame: null,
    scopes: [],
    variablesByReference: {},
    output: "",
    result: null,
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    control: vi.fn(async () => undefined),
    toggleBreakpoint: vi.fn(),
    removeBreakpoint: vi.fn(),
    selectFrame: vi.fn(async () => undefined),
    loadVariables: vi.fn(async () => undefined),
    clearOutput: vi.fn(),
    installPythonAdapter: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("DebugPanel", () => {
  it("starts the selected supported file", () => {
    const debuggerManager = manager();
    render(
      <DebugPanel
        manager={debuggerManager}
        selectedFile={file}
        onOpenFrame={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Debug main.py" }));
    expect(debuggerManager.start).toHaveBeenCalledWith("main.py");
  });

  it("shows paused frames, variables, breakpoints, and stepping controls", () => {
    const debuggerManager = manager({
      session: {
        id: "debug-1",
        adapter: "python",
        filePath: "main.py",
        state: "stopped",
        startedAt: "2026-08-18T00:00:00.000Z",
      },
      breakpoints: { "main.py": [1] },
      frames: [
        {
          id: 10,
          name: "main",
          filePath: "main.py",
          line: 1,
          column: 1,
          threadId: 2,
        },
      ],
      activeFrame: {
        id: 10,
        name: "main",
        filePath: "main.py",
        line: 1,
        column: 1,
        threadId: 2,
      },
      scopes: [{ name: "Locals", variablesReference: 12 }],
      variablesByReference: {
        12: [{ name: "answer", value: "42", type: "int", variablesReference: 0 }],
      },
    });
    render(
      <DebugPanel
        manager={debuggerManager}
        selectedFile={file}
        onOpenFrame={vi.fn()}
      />,
    );
    expect(screen.getByText("answer")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getByText("Line 1")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Step over (F10)"));
    expect(debuggerManager.control).toHaveBeenCalledWith("next");
  });

  it("offers one-click Python adapter setup after a missing-adapter error", () => {
    const debuggerManager = manager({
      result: { success: false, output: "Python debugging needs debugpy." },
    });
    render(
      <DebugPanel
        manager={debuggerManager}
        selectedFile={file}
        onOpenFrame={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set up Python debugger" }));
    expect(debuggerManager.installPythonAdapter).toHaveBeenCalled();
  });
});
