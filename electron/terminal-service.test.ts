import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createTerminalService,
  resolveTerminalDirectory,
} = require("./terminal-service.cjs") as {
  createTerminalService: (options?: {
    ptyModule?: {
      spawn: ReturnType<typeof vi.fn>;
    };
    onEvent?: (owner: object, event: Record<string, unknown>) => void;
  }) => {
    create: (
      options: {
        rootPath: string;
        executable?: string;
        args?: string[];
        title?: string;
        kind?: string;
        cols?: number;
        rows?: number;
      },
      owner: object,
    ) => {
      success: boolean;
      output: string;
      session?: { id: string; status: string; title: string };
    };
    write: (
      sessionId: string,
      data: string,
      owner: object,
    ) => { success: boolean };
    resize: (
      sessionId: string,
      cols: number,
      rows: number,
      owner: object,
    ) => { success: boolean };
    close: (
      sessionId: string,
      owner: object,
    ) => { success: boolean };
    list: (owner: object) => Array<{ id: string; status: string }>;
  };
  resolveTerminalDirectory: (
    rootPath: string,
    relativePath?: string,
  ) => string;
};

function fakePty() {
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<
    (event: { exitCode: number; signal?: number }) => void
  > = [];
  const process = {
    kill: vi.fn(),
    resize: vi.fn(),
    write: vi.fn(),
    onData: vi.fn((listener: (data: string) => void) => {
      dataListeners.push(listener);
    }),
    onExit: vi.fn(
      (
        listener: (event: { exitCode: number; signal?: number }) => void,
      ) => {
        exitListeners.push(listener);
      },
    ),
  };
  return {
    module: { spawn: vi.fn(() => process) },
    process,
    emitData: (data: string) =>
      dataListeners.forEach((listener) => listener(data)),
    emitExit: (exitCode: number) =>
      exitListeners.forEach((listener) => listener({ exitCode })),
  };
}

describe("terminal service", () => {
  it("contains terminal directories inside the opened project", () => {
    const rootPath = resolve("/tmp/project");
    expect(resolveTerminalDirectory(rootPath, "lib")).toBe(
      join(rootPath, "lib"),
    );
    expect(() =>
      resolveTerminalDirectory(rootPath, "../outside"),
    ).toThrow("outside");
  });

  it("creates an owned session and streams data and exit events", () => {
    const pty = fakePty();
    const events: Array<Record<string, unknown>> = [];
    const owner = {};
    const service = createTerminalService({
      ptyModule: pty.module,
      onEvent: (_owner, event) => events.push(event),
    });

    const rootPath = resolve("/tmp/project");
    const created = service.create(
      {
        rootPath,
        executable: "flutter",
        args: ["test"],
        title: "Flutter: Test",
        kind: "task",
        cols: 120,
        rows: 32,
      },
      owner,
    );

    expect(created).toMatchObject({
      success: true,
      session: { title: "Flutter: Test", status: "running" },
    });
    expect(pty.module.spawn).toHaveBeenCalledWith(
      "flutter",
      ["test"],
      expect.objectContaining({
        cwd: rootPath,
        cols: 120,
        rows: 32,
      }),
    );

    pty.emitData("test output");
    pty.emitExit(0);
    expect(events).toEqual([
      expect.objectContaining({ type: "data", data: "test output" }),
      expect.objectContaining({ type: "exit", exitCode: 0 }),
    ]);
    expect(service.list(owner)[0]).toMatchObject({
      status: "exited",
    });
  });

  it("validates ownership for input, resize, and termination", () => {
    const pty = fakePty();
    const owner = {};
    const otherOwner = {};
    const service = createTerminalService({ ptyModule: pty.module });
    const session = service.create(
      {
        rootPath: resolve("/tmp/project"),
        executable: "/bin/zsh",
      },
      owner,
    ).session!;

    expect(service.write(session.id, "pwd\r", otherOwner).success).toBe(
      false,
    );
    expect(service.write(session.id, "pwd\r", owner).success).toBe(true);
    expect(pty.process.write).toHaveBeenCalledWith("pwd\r");

    expect(service.resize(session.id, 900, 1, owner).success).toBe(true);
    expect(pty.process.resize).toHaveBeenCalledWith(500, 2);

    expect(service.close(session.id, otherOwner).success).toBe(true);
    expect(pty.process.kill).not.toHaveBeenCalled();
    expect(service.close(session.id, owner).success).toBe(true);
    expect(pty.process.kill).toHaveBeenCalledOnce();
  });
});
