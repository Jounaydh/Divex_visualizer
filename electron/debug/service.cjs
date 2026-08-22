const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  resolveWindowsCommand,
  runTool,
} = require("../platform/tool-runner.cjs");
const {
  parseWslUncPath,
  resolveProjectFile,
  validateProjectRoot,
} = require("../project/paths.cjs");
const {
  runInWsl,
  wslCommandForProject,
} = require("../platform/wsl.cjs");

const REQUEST_TIMEOUT_MS = 15_000;
const LAUNCH_TIMEOUT_MS = 60_000;
const SUPPORTED_EXTENSIONS = new Set([".dart", ".py", ".pyw"]);

function debugFailure(error, fallback) {
  return {
    success: false,
    output: error?.message || fallback,
  };
}

function encodeDapMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
    body,
  ]);
}

class DapConnection {
  constructor(child, onEvent) {
    this.child = child;
    this.onEvent = onEvent;
    this.sequence = 1;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.eventBacklog = new Map();
    child.stdout.on("data", (chunk) => this.accept(chunk));
    child.on("error", (error) => this.close(error));
    child.on("close", (code, signal) => {
      this.close(
        new Error(
          `Debug adapter exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}.`,
        ),
      );
    });
  }

  accept(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
      if (!match) {
        this.close(new Error("The debug adapter returned an invalid message."));
        return;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + length);
      this.buffer = this.buffer.subarray(bodyStart + length);
      try {
        this.handleMessage(JSON.parse(body.toString("utf8")));
      } catch (error) {
        this.close(new Error(`The debug adapter returned invalid JSON: ${error.message}`));
        return;
      }
    }
  }

  handleMessage(message) {
    if (message.type === "response") {
      const pending = this.pending.get(message.request_seq);
      if (!pending) return;
      this.pending.delete(message.request_seq);
      clearTimeout(pending.timer);
      if (message.success === false) {
        pending.reject(new Error(message.message || `${message.command} failed.`));
      } else {
        pending.resolve(message.body ?? {});
      }
      return;
    }
    if (message.type === "request") {
      this.child.stdin.write(
        encodeDapMessage({
          seq: this.sequence++,
          type: "response",
          request_seq: message.seq,
          success: false,
          command: message.command,
          message: `Divex does not allow the adapter request ${message.command}.`,
        }),
      );
      return;
    }
    if (message.type !== "event") return;
    const waiters = this.eventWaiters.get(message.event) ?? [];
    if (waiters.length) {
      this.eventWaiters.delete(message.event);
      waiters.forEach((waiter) => {
        clearTimeout(waiter.timer);
        waiter.resolve(message.body ?? {});
      });
    } else {
      this.eventBacklog.set(message.event, message.body ?? {});
    }
    this.onEvent(message.event, message.body ?? {});
  }

  request(command, args = {}, timeout = REQUEST_TIMEOUT_MS) {
    const seq = this.sequence++;
    const request = { seq, type: "request", command, arguments: args };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`The debug adapter did not answer ${command}.`));
      }, timeout);
      this.pending.set(seq, { resolve, reject, timer });
      this.child.stdin.write(encodeDapMessage(request), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(seq);
        reject(error);
      });
    });
  }

  waitForEvent(event, timeout = REQUEST_TIMEOUT_MS) {
    if (this.eventBacklog.has(event)) {
      const body = this.eventBacklog.get(event);
      this.eventBacklog.delete(event);
      return Promise.resolve(body);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const current = this.eventWaiters.get(event) ?? [];
        this.eventWaiters.set(
          event,
          current.filter((waiter) => waiter.resolve !== resolve),
        );
        reject(new Error(`The debug adapter did not send ${event}.`));
      }, timeout);
      const current = this.eventWaiters.get(event) ?? [];
      current.push({ resolve, reject, timer });
      this.eventWaiters.set(event, current);
    });
  }

  close(error) {
    if (this.closed) return;
    this.closed = true;
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(error);
    });
    this.pending.clear();
    this.eventWaiters.forEach((waiters) => {
      waiters.forEach((waiter) => {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      });
    });
    this.eventWaiters.clear();
    this.eventBacklog.clear();
  }
}

async function adapterDefinition(rootPath, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("Debugging currently supports Python and Dart/Flutter files.");
  }

  const wslRoot = parseWslUncPath(rootPath);
  const wslFile = parseWslUncPath(filePath);
  const executionRoot = wslRoot?.linuxPath ?? rootPath;
  const executionPath = wslFile?.linuxPath ?? filePath;
  let executable;
  let adapterArgs;
  let type;
  let launch;

  if (extension === ".py" || extension === ".pyw") {
    executable = wslRoot ? "python3" : process.platform === "win32" ? "py" : "python3";
    adapterArgs = wslRoot || process.platform !== "win32"
      ? ["-m", "debugpy.adapter"]
      : ["-3", "-m", "debugpy.adapter"];
    type = "python";
    launch = {
      name: `Debug ${path.basename(filePath)}`,
      type,
      request: "launch",
      program: executionPath,
      cwd: executionRoot,
      console: "internalConsole",
      justMyCode: true,
    };
  } else {
    const flutterProject = await fs
      .readFile(path.join(rootPath, "pubspec.yaml"), "utf8")
      .then((content) => /^\s+sdk:\s*flutter\s*$/im.test(content))
      .catch(() => false);
    executable = flutterProject ? "flutter" : "dart";
    adapterArgs = ["debug_adapter"];
    type = "dart";
    launch = {
      name: `Debug ${path.basename(filePath)}`,
      type,
      request: "launch",
      program: executionPath,
      cwd: executionRoot,
    };
  }

  if (wslRoot) {
    const command = wslCommandForProject(rootPath, executable, adapterArgs);
    if (!command) throw new Error("The WSL debug command could not be created.");
    return { ...command, type, launch, executionRoot, executionPath };
  }
  const resolvedExecutable =
    process.platform === "win32"
      ? await resolveWindowsCommand(executable)
      : executable;
  return {
    executable: resolvedExecutable,
    args: adapterArgs,
    hostCwd: rootPath,
    displayCwd: rootPath,
    type,
    launch,
    executionRoot,
    executionPath,
  };
}

function createDebugService({
  onEvent,
  spawnProcess = spawn,
  resolveAdapter = adapterDefinition,
} = {}) {
  const sessions = new Map();

  const emit = (session, type, body = {}) => {
    if (session.owner && !session.owner.isDestroyed()) {
      onEvent?.(session.owner, {
        sessionId: session.id,
        type,
        ...body,
      });
    }
  };

  const requireSession = (sessionId, owner) => {
    const session = sessions.get(sessionId);
    if (!session || session.owner !== owner) {
      throw new Error("That debug session is no longer available.");
    }
    return session;
  };

  const sourcePathForAdapter = (session, relativePath) => {
    const nativePath = resolveProjectFile(session.rootPath, relativePath);
    return parseWslUncPath(nativePath)?.linuxPath ?? nativePath;
  };

  const relativeSourcePath = (session, adapterPath) => {
    if (typeof adapterPath !== "string" || !adapterPath) return undefined;
    const wslRoot = parseWslUncPath(session.rootPath);
    if (wslRoot && adapterPath.startsWith(`${wslRoot.linuxPath}/`)) {
      return adapterPath.slice(wslRoot.linuxPath.length + 1);
    }
    if (!wslRoot) {
      const relative = path.relative(session.rootPath, adapterPath);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative.replaceAll("\\", "/");
      }
    }
    return undefined;
  };

  const applyBreakpoints = async (session, filePath, lines) => {
    const uniqueLines = [...new Set(lines)]
      .map(Number)
      .filter((line) => Number.isInteger(line) && line > 0)
      .sort((left, right) => left - right);
    const adapterPath = sourcePathForAdapter(session, filePath);
    const body = await session.connection.request("setBreakpoints", {
      source: { name: path.basename(filePath), path: adapterPath },
      breakpoints: uniqueLines.map((line) => ({ line })),
      sourceModified: false,
    });
    session.breakpoints.set(filePath, uniqueLines);
    return (body.breakpoints ?? []).map((breakpoint, index) => ({
      id: breakpoint.id,
      verified: breakpoint.verified !== false,
      message: breakpoint.message,
      line: breakpoint.line ?? uniqueLines[index],
      filePath,
    }));
  };

  const start = async (options, owner) => {
    let child;
    let adapterErrorOutput = "";
    try {
      const rootPath = validateProjectRoot(options?.rootPath);
      const filePath = resolveProjectFile(rootPath, options?.filePath);
      const definition = await resolveAdapter(rootPath, filePath);
      child = spawnProcess(definition.executable, definition.args, {
        cwd: definition.hostCwd,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });

      const session = {
        id: randomUUID(),
        owner,
        rootPath,
        filePath: options.filePath,
        adapter: definition.type,
        child,
        breakpoints: new Map(),
        state: "starting",
        startedAt: new Date().toISOString(),
      };
      session.connection = new DapConnection(child, (event, body) => {
        if (event === "output") {
          emit(session, "output", {
            category: body.category ?? "console",
            output: body.output ?? "",
          });
        } else if (event === "stopped") {
          session.state = "stopped";
          emit(session, "stopped", {
            reason: body.reason ?? "breakpoint",
            description: body.description,
            threadId: body.threadId,
          });
        } else if (event === "continued") {
          session.state = "running";
          emit(session, "continued", { threadId: body.threadId });
        } else if (event === "terminated" || event === "exited") {
          session.state = "terminated";
          emit(session, "terminated", { exitCode: body.exitCode });
        } else if (event === "breakpoint") {
          emit(session, "breakpoint", { breakpoint: body.breakpoint });
        }
      });
      child.stderr.on("data", (chunk) => {
        adapterErrorOutput = `${adapterErrorOutput}${chunk.toString("utf8")}`.slice(-12_000);
        emit(session, "output", {
          category: "stderr",
          output: chunk.toString("utf8"),
        });
      });
      child.once("close", (code) => {
        sessions.delete(session.id);
        if (session.state !== "terminated") {
          emit(session, "terminated", { exitCode: code ?? undefined });
        }
      });
      sessions.set(session.id, session);

      await session.connection.request("initialize", {
        clientID: "divex",
        clientName: "Divex Visualizer",
        adapterID: definition.type,
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsVariablePaging: true,
        supportsRunInTerminalRequest: false,
      });
      const initialized = session.connection.waitForEvent("initialized");
      const launched = session.connection.request(
        "launch",
        definition.launch,
        LAUNCH_TIMEOUT_MS,
      );
      await initialized;
      const breakpoints = Array.isArray(options?.breakpoints)
        ? options.breakpoints
        : [];
      for (const entry of breakpoints) {
        if (entry && typeof entry.filePath === "string") {
          await applyBreakpoints(session, entry.filePath, entry.lines ?? []);
        }
      }
      await session.connection.request("configurationDone");
      await launched;
      if (session.state === "starting") session.state = "running";
      emit(session, "started", { adapter: session.adapter, filePath: session.filePath });
      return {
        success: true,
        output: `Debugging ${path.basename(filePath)}.`,
        session: {
          id: session.id,
          adapter: session.adapter,
          filePath: session.filePath,
          state: session.state,
          startedAt: session.startedAt,
        },
      };
    } catch (error) {
      if (child && !child.killed) child.kill();
      const details = adapterErrorOutput.trim() || error?.message || "";
      if (/debugpy|No module named/i.test(details)) {
        return {
          success: false,
          output: parseWslUncPath(options?.rootPath)
            ? "Python debugging needs debugpy in this WSL distribution. Run: python3 -m pip install --user debugpy"
            : "Python debugging needs debugpy. Run: py -3 -m pip install --user debugpy",
        };
      }
      return debugFailure(
        details ? new Error(details) : error,
        "The debug session could not be started.",
      );
    }
  };

  const setBreakpoints = async (args, owner) => {
    try {
      const session = requireSession(args?.sessionId, owner);
      const breakpoints = await applyBreakpoints(
        session,
        args?.filePath,
        args?.lines ?? [],
      );
      return { success: true, output: "Breakpoints updated.", breakpoints };
    } catch (error) {
      return debugFailure(error, "Breakpoints could not be updated.");
    }
  };

  const stack = async (args, owner) => {
    try {
      const session = requireSession(args?.sessionId, owner);
      const threads = await session.connection.request("threads");
      const threadId = args?.threadId ?? threads.threads?.[0]?.id;
      if (!threadId) return { success: true, output: "No paused threads.", frames: [] };
      const body = await session.connection.request("stackTrace", {
        threadId,
        startFrame: 0,
        levels: 100,
      });
      const frames = (body.stackFrames ?? []).map((frame) => ({
        id: frame.id,
        name: frame.name,
        line: frame.line,
        column: frame.column,
        filePath: relativeSourcePath(session, frame.source?.path),
        sourceName: frame.source?.name,
        threadId,
      }));
      return { success: true, output: "Call stack loaded.", frames, threadId };
    } catch (error) {
      return { ...debugFailure(error, "The call stack could not be loaded."), frames: [] };
    }
  };

  const scopes = async (args, owner) => {
    try {
      const session = requireSession(args?.sessionId, owner);
      const body = await session.connection.request("scopes", {
        frameId: args?.frameId,
      });
      return { success: true, output: "Scopes loaded.", scopes: body.scopes ?? [] };
    } catch (error) {
      return { ...debugFailure(error, "Variables could not be loaded."), scopes: [] };
    }
  };

  const variables = async (args, owner) => {
    try {
      const session = requireSession(args?.sessionId, owner);
      const body = await session.connection.request("variables", {
        variablesReference: args?.variablesReference,
        start: args?.start,
        count: args?.count,
      });
      return { success: true, output: "Variables loaded.", variables: body.variables ?? [] };
    } catch (error) {
      return { ...debugFailure(error, "Variables could not be loaded."), variables: [] };
    }
  };

  const control = async (args, owner) => {
    try {
      const session = requireSession(args?.sessionId, owner);
      const commands = {
        continue: "continue",
        pause: "pause",
        next: "next",
        stepIn: "stepIn",
        stepOut: "stepOut",
      };
      const command = commands[args?.action];
      if (!command) throw new Error("That debug action is not supported.");
      await session.connection.request(command, { threadId: args?.threadId });
      if (command !== "pause") session.state = "running";
      return { success: true, output: `${args.action} sent.` };
    } catch (error) {
      return debugFailure(error, "The debug action failed.");
    }
  };

  const disconnect = async (sessionId, owner) => {
    try {
      const session = requireSession(sessionId, owner);
      try {
        await session.connection.request("disconnect", {
          restart: false,
          terminateDebuggee: true,
        }, 5_000);
      } finally {
        sessions.delete(session.id);
        if (!session.child.killed) session.child.kill();
      }
      return { success: true, output: "Debug session stopped." };
    } catch (error) {
      return debugFailure(error, "The debug session could not be stopped.");
    }
  };

  const installPythonAdapter = async (rootPath) => {
    try {
      const resolvedRoot = validateProjectRoot(rootPath);
      const wsl = parseWslUncPath(resolvedRoot);
      const result = wsl
        ? await runInWsl(
            resolvedRoot,
            "python3",
            ["-m", "pip", "install", "--user", "debugpy"],
            { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
          )
        : await runTool(
            process.platform === "win32" ? "py" : "python3",
            process.platform === "win32"
              ? ["-3", "-m", "pip", "install", "--user", "debugpy"]
              : ["-m", "pip", "install", "--user", "debugpy"],
            { cwd: resolvedRoot, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
          );
      return {
        success: true,
        output: result.stdout?.trim() || "Python debugger setup completed.",
      };
    } catch (error) {
      return debugFailure(error, "Python debugger setup failed. Ensure pip is installed in this environment.");
    }
  };

  const closeOwnerSessions = (owner) => {
    [...sessions.values()]
      .filter((session) => session.owner === owner)
      .forEach((session) => {
        sessions.delete(session.id);
        session.connection.close(new Error("The debugger window closed."));
        if (!session.child.killed) session.child.kill();
      });
  };

  return {
    start,
    setBreakpoints,
    stack,
    scopes,
    variables,
    control,
    disconnect,
    installPythonAdapter,
    closeOwnerSessions,
  };
}

module.exports = {
  DapConnection,
  SUPPORTED_EXTENSIONS,
  adapterDefinition,
  createDebugService,
  encodeDapMessage,
};
