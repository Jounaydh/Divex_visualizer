const crypto = require("node:crypto");
const path = require("node:path");
const {
  isContainedPath,
  validateProjectRoot,
} = require("../project/paths.cjs");
const { wslCommandForProject } = require("../platform/wsl.cjs");

const MAX_SESSIONS_PER_OWNER = 12;
const MAX_INPUT_LENGTH = 64 * 1024;

function terminalFailure(error, fallback) {
  return {
    success: false,
    output:
      error?.code === "ENOENT"
        ? "The requested shell or task executable was not found."
        : error?.message || fallback,
  };
}

function validateTerminalRoot(rootPath) {
  return validateProjectRoot(
    rootPath,
    "Open a project folder before starting a terminal.",
  );
}

function resolveTerminalDirectory(rootPath, relativePath) {
  if (!relativePath) return rootPath;
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw new Error("The terminal directory must be inside the opened project.");
  }
  const resolvedDirectory = path.resolve(rootPath, relativePath);
  if (!isContainedPath(rootPath, resolvedDirectory)) {
    throw new Error("The terminal directory is outside the opened project.");
  }
  return resolvedDirectory;
}

function boundedDimension(value, fallback, maximum) {
  return Number.isFinite(value)
    ? Math.max(2, Math.min(maximum, Math.floor(value)))
    : fallback;
}

function defaultShell() {
  if (process.platform === "win32") {
    return {
      executable: process.env.COMSPEC || "powershell.exe",
      args: [],
    };
  }
  return {
    executable: process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"),
    args: [],
  };
}

function publicSession(session) {
  return {
    id: session.id,
    title: session.title,
    kind: session.kind,
    taskId: session.taskId,
    filePath: session.filePath,
    profileId: session.profileId,
    problemMatcher: session.problemMatcher,
    cwd: session.cwd,
    status: session.status,
    exitCode: session.exitCode,
    startedAt: session.startedAt,
  };
}

function createTerminalService({ ptyModule, onEvent } = {}) {
  const sessions = new Map();
  let loadedPty = ptyModule;

  const getPty = () => {
    if (!loadedPty) loadedPty = require("node-pty");
    return loadedPty;
  };

  const emit = (session, event) => {
    if (onEvent) onEvent(session.owner, { sessionId: session.id, ...event });
  };

  const sessionsForOwner = (owner) =>
    [...sessions.values()].filter((session) => session.owner === owner);

  const create = (options, owner) => {
    try {
      const rootPath = validateTerminalRoot(options?.rootPath);
      const requestedCwd = resolveTerminalDirectory(rootPath, options?.cwd);
      if (sessionsForOwner(owner).length >= MAX_SESSIONS_PER_OWNER) {
        throw new Error(
          `Close a terminal before opening more than ${MAX_SESSIONS_PER_OWNER} sessions.`,
        );
      }
      const nativeShell = options?.executable
        ? { executable: options.executable, args: options.args ?? [] }
        : defaultShell();
      const wslShell = wslCommandForProject(
        rootPath,
        options?.executable,
        options?.args ?? [],
        requestedCwd,
      );
      const shell = wslShell ?? nativeShell;
      const cwd = wslShell?.hostCwd ?? requestedCwd;
      const displayCwd = wslShell?.displayCwd ?? requestedCwd;
      if (
        typeof shell.executable !== "string" ||
        !Array.isArray(shell.args) ||
        shell.args.some((argument) => typeof argument !== "string")
      ) {
        throw new Error("The terminal process definition is invalid.");
      }
      const id = crypto.randomUUID();
      const terminal = getPty().spawn(shell.executable, shell.args, {
        name: "xterm-256color",
        cols: boundedDimension(options?.cols, 100, 500),
        rows: boundedDimension(options?.rows, 28, 200),
        cwd: displayCwd,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });
      const session = {
        id,
        owner,
        terminal,
        title: options?.title || path.basename(shell.executable),
        kind: options?.kind || "shell",
        taskId: options?.taskId,
        filePath: options?.filePath,
        profileId: options?.profileId,
        problemMatcher: options?.problemMatcher,
        cwd,
        status: "running",
        exitCode: undefined,
        startedAt: new Date().toISOString(),
      };
      sessions.set(id, session);
      terminal.onData((data) => {
        if (sessions.has(id)) emit(session, { type: "data", data });
      });
      terminal.onExit(({ exitCode, signal }) => {
        if (!sessions.has(id)) return;
        session.status = "exited";
        session.exitCode = exitCode;
        emit(session, {
          type: "exit",
          exitCode,
          signal,
        });
      });
      return {
        success: true,
        output: `Started ${session.title}.`,
        session: publicSession(session),
      };
    } catch (error) {
      return terminalFailure(error, "The integrated terminal could not start.");
    }
  };

  const write = (sessionId, data, owner) => {
    try {
      const session = sessions.get(sessionId);
      if (!session || session.owner !== owner) {
        throw new Error("That terminal session is no longer available.");
      }
      if (session.status !== "running") {
        throw new Error("That terminal process has already exited.");
      }
      if (typeof data !== "string" || data.length > MAX_INPUT_LENGTH) {
        throw new Error("Terminal input is invalid or too large.");
      }
      session.terminal.write(data);
      return { success: true, output: "Terminal input sent." };
    } catch (error) {
      return terminalFailure(error, "Terminal input could not be sent.");
    }
  };

  const resize = (sessionId, cols, rows, owner) => {
    try {
      const session = sessions.get(sessionId);
      if (!session || session.owner !== owner) {
        throw new Error("That terminal session is no longer available.");
      }
      if (session.status === "running") {
        session.terminal.resize(
          boundedDimension(cols, 100, 500),
          boundedDimension(rows, 28, 200),
        );
      }
      return { success: true, output: "Terminal resized." };
    } catch (error) {
      return terminalFailure(error, "The terminal could not be resized.");
    }
  };

  const close = (sessionId, owner) => {
    try {
      const session = sessions.get(sessionId);
      if (!session || session.owner !== owner) {
        return { success: true, output: "Terminal already closed." };
      }
      sessions.delete(sessionId);
      if (session.status === "running") session.terminal.kill();
      return { success: true, output: `Closed ${session.title}.` };
    } catch (error) {
      return terminalFailure(error, "The terminal could not be closed.");
    }
  };

  const closeOwnerSessions = (owner) => {
    sessionsForOwner(owner).forEach((session) => close(session.id, owner));
  };

  return {
    close,
    closeOwnerSessions,
    create,
    list: (owner) => sessionsForOwner(owner).map(publicSession),
    resize,
    write,
  };
}

module.exports = {
  MAX_INPUT_LENGTH,
  MAX_SESSIONS_PER_OWNER,
  createTerminalService,
  resolveTerminalDirectory,
  terminalFailure,
  validateTerminalRoot,
};
