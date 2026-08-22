import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const {
  DapConnection,
  SUPPORTED_EXTENSIONS,
  adapterDefinition,
  createDebugService,
  encodeDapMessage,
} = require("./service.cjs");

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  return child;
}

function fakeAdapterProcess() {
  const child = fakeChild() as ReturnType<typeof fakeChild> & {
    stderr: PassThrough;
    killed: boolean;
    kill: () => void;
  };
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  child.stdin.on("data", (data: Buffer) => {
    const request = decodeMessage(data);
    child.stdout.write(
      encodeDapMessage({
        seq: 100 + request.seq,
        type: "response",
        request_seq: request.seq,
        success: true,
        command: request.command,
        body:
          request.command === "threads"
            ? { threads: [{ id: 1, name: "main" }] }
            : request.command === "stackTrace"
              ? { stackFrames: [] }
              : request.command === "setBreakpoints"
                ? { breakpoints: request.arguments.breakpoints.map((item: { line: number }, index: number) => ({ id: index + 1, verified: true, line: item.line })) }
                : {},
      }),
    );
    if (request.command === "launch") {
      child.stdout.write(
        encodeDapMessage({
          seq: 200,
          type: "event",
          event: "initialized",
          body: {},
        }),
      );
    }
  });
  queueMicrotask(() => child.emit("spawn"));
  return child;
}

function decodeMessage(buffer: Buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  return JSON.parse(buffer.subarray(headerEnd + 4).toString("utf8"));
}

describe("DAP connection", () => {
  it("frames requests and resolves chunked responses", async () => {
    const child = fakeChild();
    const connection = new DapConnection(child, vi.fn());
    const written = new Promise<Buffer>((resolve) =>
      child.stdin.once("data", resolve),
    );
    const responsePromise = connection.request("threads");
    const request = decodeMessage(await written);
    expect(request).toMatchObject({ type: "request", command: "threads" });

    const response = encodeDapMessage({
      seq: 2,
      type: "response",
      request_seq: request.seq,
      success: true,
      command: "threads",
      body: { threads: [{ id: 1, name: "main" }] },
    });
    child.stdout.write(response.subarray(0, 11));
    child.stdout.write(response.subarray(11));
    await expect(responsePromise).resolves.toEqual({
      threads: [{ id: 1, name: "main" }],
    });
  });

  it("delivers adapter events to listeners and event waiters", async () => {
    const child = fakeChild();
    const onEvent = vi.fn();
    const connection = new DapConnection(child, onEvent);
    const initialized = connection.waitForEvent("initialized");
    child.stdout.write(
      encodeDapMessage({
        seq: 1,
        type: "event",
        event: "initialized",
        body: { ready: true },
      }),
    );
    await expect(initialized).resolves.toEqual({ ready: true });
    expect(onEvent).toHaveBeenCalledWith("initialized", { ready: true });
  });

  it("limits launch support to adapters managed by Divex", () => {
    expect([...SUPPORTED_EXTENSIONS]).toEqual([".dart", ".py", ".pyw"]);
  });

  it("keeps WSL adapters and source paths inside the selected distribution", async () => {
    const definition = await adapterDefinition(
      "\\\\wsl.localhost\\Ubuntu\\home\\dev\\project",
      "\\\\wsl.localhost\\Ubuntu\\home\\dev\\project\\main.py",
    );
    expect(definition).toMatchObject({
      executable: "wsl.exe",
      type: "python",
      displayCwd: "/home/dev/project",
      executionPath: "/home/dev/project/main.py",
      launch: {
        program: "/home/dev/project/main.py",
        cwd: "/home/dev/project",
      },
    });
    expect(definition.args).toEqual([
      "--distribution",
      "Ubuntu",
      "--cd",
      "/home/dev/project",
      "--exec",
      "python3",
      "-m",
      "debugpy.adapter",
    ]);
  });

  it("runs a complete managed launch and breakpoint update", async () => {
    const owner = { isDestroyed: () => false };
    const events: unknown[] = [];
    const service = createDebugService({
      onEvent: (_owner: unknown, event: unknown) => events.push(event),
      spawnProcess: () => fakeAdapterProcess(),
      resolveAdapter: async (rootPath: string, filePath: string) => ({
        executable: "fake-debug-adapter",
        args: [],
        hostCwd: rootPath,
        displayCwd: rootPath,
        type: "python",
        executionRoot: rootPath,
        executionPath: filePath,
        launch: { type: "python", request: "launch", program: filePath },
      }),
    });
    const rootPath = process.cwd();
    const result = await service.start(
      { rootPath, filePath: "package.json", breakpoints: [] },
      owner,
    );
    expect(result.success).toBe(true);
    expect(result.session.state).toBe("running");
    const breakpointResult = await service.setBreakpoints(
      {
        sessionId: result.session.id,
        filePath: "package.json",
        lines: [4, 8],
      },
      owner,
    );
    expect(breakpointResult.breakpoints).toEqual([
      expect.objectContaining({ line: 4, verified: true }),
      expect.objectContaining({ line: 8, verified: true }),
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "started", adapter: "python" }),
    );
  });
});
